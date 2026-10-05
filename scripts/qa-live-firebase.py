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

from firebase_readiness import BUCKET, PROJECT, REGION, RESOURCE_KEYS, SCHEMA_VERSION, validate_report

CHECKS = {
    'project': ['projects', 'describe', PROJECT, '--format=json(projectId,projectNumber,lifecycleState)'],
    'services': ['services', 'list', '--enabled', '--format=json(config.name)'],
    'firestore': ['firestore', 'databases', 'describe', '--database=(default)', '--format=json(name,locationId,type)'],
    'ttl': ['firestore', 'fields', 'ttls', 'list', '--database=(default)', '--format=json(name,ttlConfig.state)'],
    'functions': ['functions', 'list', '--v2', f'--regions={REGION}', '--format=json(name,state,environment,buildConfig.runtime)'],
    'scheduler': ['scheduler', 'jobs', 'list', f'--location={REGION}', '--format=json(name,state,schedule,timeZone)'],
    'storage': ['storage', 'buckets', 'describe', f'gs://{BUCKET}', '--format=json(name,lifecycle_config)'],
    'apple_secret_versions': ['secrets', 'versions', 'list', 'APPLE_PRIVATE_KEY', '--format=json(name,state)'],
}
EMULATOR_SELECTORS = ('FIREBASE_AUTH_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST', 'STORAGE_EMULATOR_HOST', 'FUNCTIONS_EMULATOR')


class IdentitySelectionError(ValueError):
    pass


def selected_environment(configuration: str, env: dict[str, str] | None = None) -> dict[str, str]:
    env = dict(os.environ if env is None else env)
    if any(env.get(name) for name in EMULATOR_SELECTORS):
        raise IdentitySelectionError('Unset emulator selectors before collecting live metadata.')
    manifest_path = env.get('OIC_MANIFEST_PATH')
    if manifest_path:
        try:
            manifest = json.loads(Path(manifest_path).read_text())
        except (OSError, ValueError):
            raise IdentitySelectionError('Managed identity manifest cannot be read; no fallback identity was selected.') from None
        if not isinstance(manifest, dict) or not isinstance(manifest.get('connections'), list):
            raise IdentitySelectionError('Managed identity manifest format is unsupported; no fallback identity was selected.')
        matches = [entry for entry in manifest.get('connections', []) if isinstance(entry, dict) and entry.get('provider_kind') == 'gcp' and entry.get('configuration_name') == configuration]
        if manifest.get('version') != 1 or len(matches) != 1:
            raise IdentitySelectionError('No matching managed GCP identity. Configure one in environment settings first.')
        selected = matches[0]
        for variable, field in [('CLOUDSDK_CONFIG', 'config_dir'), ('CLOUDSDK_ACTIVE_CONFIG_NAME', 'configuration_name'), ('GOOGLE_APPLICATION_CREDENTIALS', 'credentials_file')]:
            if not isinstance(selected.get(field), str) or not selected[field]:
                raise IdentitySelectionError('The managed GCP identity is missing selector metadata.')
            env[variable] = selected[field]  # Paths select a configured identity; credential contents are never read.
    return env


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
    source.add_argument('--from-report', type=Path, help='Validate this schema-v1 JSON report fully offline; no credentials or gcloud required')
    parser.add_argument('--report', type=Path, help='Write sanitized JSON here instead of stdout')
    args = parser.parse_args(argv)
    try:
        if args.from_report:
            report = json.loads(args.from_report.read_text())
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
            # Report contains selected metadata only; owner-only file permissions still avoid
            # accidental disclosure of operational resource identifiers on shared machines.
            fd = os.open(args.report, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, 'w') as stream:
                os.fchmod(stream.fileno(), 0o600)
                stream.write(output)
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
