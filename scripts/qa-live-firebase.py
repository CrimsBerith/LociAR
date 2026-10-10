#!/usr/bin/env python3
"""Collect precise Firebase metadata or validate a saved report offline; never read secret values."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import re
import stat

from firebase_readiness import BUCKET, PROJECT, REGION, RESOURCE_KEYS, SCHEMA_VERSION, validate_report

CHECKS = {
    'project': ['projects', 'describe', PROJECT, '--format=json(projectId,projectNumber,lifecycleState)'],
    'services': ['services', 'list', '--enabled', '--format=json(config.name)'],
    'firestore': ['firestore', 'databases', 'describe', '--database=(default)', '--format=json(name,locationId,type)'],
    'ttl': ['firestore', 'fields', 'ttls', 'list', '--database=(default)', '--format=json(name,ttlConfig.state)'],
    'functions': ['functions', 'list', '--v2', f'--regions={REGION}', '--format=json(name,state,environment,buildConfig.runtime,eventTrigger.eventType,eventTrigger.pubsubTopic,eventTrigger.retryPolicy,eventTrigger.triggerRegion)'],
    'scheduler': ['scheduler', 'jobs', 'list', f'--location={REGION}', '--format=json(name,state,schedule,timeZone)'],
    'storage': ['storage', 'buckets', 'describe', f'gs://{BUCKET}', '--format=json(name,lifecycle_config)'],
    'apple_secret_versions': ['secrets', 'versions', 'list', 'APPLE_PRIVATE_KEY', '--format=json(name,state)'],
    'giphy_secret_versions': ['secrets', 'versions', 'list', 'GIPHY_API_KEY', '--format=json(name,state)'],
    'storage_notifications': ['storage', 'buckets', 'notifications', 'list', f'gs://{BUCKET}', '--format=json'],
}
REPORT_DIRECTORY = Path(__file__).resolve().parents[1] / 'build' / 'firebase-readiness'
EMULATOR_SELECTORS = ('FIREBASE_AUTH_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST', 'STORAGE_EMULATOR_HOST', 'FUNCTIONS_EMULATOR')


class IdentitySelectionError(ValueError):
    pass


def managed_identity(manifest_path: str, configuration: str) -> dict:
    try:
        manifest = json.loads(Path(manifest_path).read_text())
    except (OSError, ValueError):
        raise IdentitySelectionError('Managed identity manifest cannot be read; no fallback identity was selected.') from None
    if not isinstance(manifest, dict) or not isinstance(manifest.get('connections'), list):
        raise IdentitySelectionError('Managed identity manifest format is unsupported; no fallback identity was selected.')
    matches = [entry for entry in manifest['connections'] if isinstance(entry, dict) and entry.get('provider_kind') == 'gcp' and entry.get('configuration_name') == configuration]
    if manifest.get('version') != 1 or len(matches) != 1:
        raise IdentitySelectionError('No matching managed GCP identity. Configure one in environment settings first.')
    return matches[0]


def selected_environment(configuration: str, env: dict[str, str] | None = None) -> dict[str, str]:
    env = dict(os.environ if env is None else env)
    if any(env.get(name) for name in EMULATOR_SELECTORS):
        raise IdentitySelectionError('Unset emulator selectors before collecting live metadata.')
    if env.get('OIC_MANIFEST_PATH'):
        selected = managed_identity(env['OIC_MANIFEST_PATH'], configuration)
        for variable, field in [('CLOUDSDK_CONFIG', 'config_dir'), ('CLOUDSDK_ACTIVE_CONFIG_NAME', 'configuration_name'), ('GOOGLE_APPLICATION_CREDENTIALS', 'credentials_file')]:
            if not isinstance(selected.get(field), str) or not selected[field]:
                raise IdentitySelectionError('The managed GCP identity is missing selector metadata.')
            env[variable] = selected[field]  # Paths select a configured identity; credential contents are never read.
    return env


def report_name(value: str) -> str:
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,120}\.json', value) or '..' in value:
        raise ValueError('Reports require a plain JSON filename without directory components.')
    return value


def report_directory() -> int:
    REPORT_DIRECTORY.mkdir(mode=0o700, parents=True, exist_ok=True)
    directory = os.open(REPORT_DIRECTORY, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    metadata = os.fstat(directory)
    if metadata.st_uid != os.getuid() or metadata.st_mode & 0o077:
        os.close(directory)
        raise ValueError('Report directory must be owned by this user with mode 700.')
    return directory


def write_report(filename: str, output: str) -> None:
    """Create a new file only in the fixed private report directory."""
    name = report_name(filename)
    directory = report_directory()
    try:
        fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=directory)
        with os.fdopen(fd, 'w') as stream:
            stream.write(output)
    finally:
        os.close(directory)


def read_report(filename: str) -> dict:
    name = report_name(filename)
    directory = report_directory()
    try:
        fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
        with os.fdopen(fd, 'r') as stream:
            metadata = os.fstat(stream.fileno())
            if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != os.getuid() or metadata.st_size > 16 * 1024 * 1024:
                raise ValueError('Input report must be a bounded regular file owned by this user.')
            return json.load(stream)
    finally:
        os.close(directory)


def collect_metadata(configuration: str, env: dict[str, str], runner=subprocess.run) -> dict:
    report = {'schema_version': SCHEMA_VERSION, 'project_id': PROJECT, 'collected_at': datetime.now(timezone.utc).isoformat(), 'resources': {}, 'commands': {}}
    for key in RESOURCE_KEYS:
        print(f'Collecting {key} metadata', file=sys.stderr, flush=True)
        try:
            result = runner(['gcloud', f'--configuration={configuration}', f'--project={PROJECT}', '--quiet', '--verbosity=error', *CHECKS[key]],
                            env=env, capture_output=True, text=True, timeout=45, check=False)
            if result.returncode != 0:
                report['commands'][key] = {'status': 'error', 'return_code': result.returncode}
                continue
            report['resources'][key] = json.loads(result.stdout)
            report['commands'][key] = {'status': 'ok', 'return_code': 0}
        except (OSError, subprocess.TimeoutExpired, ValueError):
            # Raw diagnostics can include credential paths/tokens; never persist or print them.
            report['commands'][key] = {'status': 'error', 'return_code': -1}
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--gcloud-configuration', help='Explicit authenticated GCP configuration name; live metadata reads only')
    source.add_argument('--from-report', help='Read this JSON filename from build/firebase-readiness fully offline')
    parser.add_argument('--report', help='Create a new JSON filename in build/firebase-readiness (owner-only, no overwrite)')
    args = parser.parse_args(argv)
    try:
        if args.from_report:
            report = read_report(args.from_report)
        else:
            env = selected_environment(args.gcloud_configuration)
            if not shutil.which('gcloud', path=env.get('PATH')):
                raise ValueError('gcloud is required on the authorized machine.')
            report = collect_metadata(args.gcloud_configuration, env)
        checked = validate_report(report)
        checked['validation_mode'] = 'offline' if args.from_report else 'live_metadata'
        checked['validated_at'] = datetime.now(timezone.utc).isoformat()
        output = json.dumps(checked, ensure_ascii=False, indent=2) + '\n'
        if args.report:
            write_report(args.report, output)
        else:
            sys.stdout.write(output)
        print(f"Firebase metadata readiness: {'PASS' if checked['readiness']['ready'] else 'FAIL'} ({len(checked['readiness']['findings'])} findings)", file=sys.stderr)
        return 0 if checked['readiness']['ready'] else 1
    except IdentitySelectionError as error:
        print(str(error), file=sys.stderr)
        return 1
    except (OSError, ValueError, TypeError, KeyError):
        print('Firebase metadata check could not complete. Check report schema, local file access and managed identity selectors; no remote changes were made.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
