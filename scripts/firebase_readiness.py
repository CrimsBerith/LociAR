"""Offline, metadata-only acceptance for the Firebase deployment in this repository."""
from __future__ import annotations

import json
from pathlib import Path
import re
from typing import Any

PROJECT = 'lociar-2f38c'
REGION = 'us-central1'
BUCKET = f'{PROJECT}.firebasestorage.app'
SCHEMA_VERSION = 2
RESOURCE_KEYS = ('project', 'services', 'firestore', 'ttl', 'functions', 'scheduler', 'storage', 'apple_secret_versions', 'giphy_secret_versions', 'storage_notifications')
STORAGE_FINALIZERS = {'onWorldMapFinalized', 'onDeletedAccountObjectFinalized'}
# Secret Manager secrets the Functions need; only version names and states are read, never values.
REQUIRED_SECRETS = {
    'apple_secret_versions': ('APPLE_PRIVATE_KEY', 'apple_secret_unavailable', 'At least one Apple private-key secret version must be ENABLED; no value is read.'),
    'giphy_secret_versions': ('GIPHY_API_KEY', 'giphy_secret_unavailable', 'At least one GIPHY API key secret version must be ENABLED (GIF search and GIF posts); no value is read.'),
}
LEGACY_PREFIXES = {'post-layer-assets/', 'post-video-assets/', 'post-reference-images/', 'post-surface-textures/'}


def repository_expectations(root: Path | None = None) -> dict[str, Any]:
    root = root or Path(__file__).resolve().parents[1]
    indexes = json.loads((root / 'firestore.indexes.json').read_text())
    ttl = {(entry['collectionGroup'], entry['fieldPath']) for entry in indexes.get('fieldOverrides', []) if entry.get('ttl') is True}
    index = (root / 'functions/src/index.ts').read_text()
    functions: set[str] = set()
    schedules: dict[str, dict[str, str]] = {}
    for names, module in re.findall(r"export\s*\{([^}]+)\}\s*from\s*['\"]([^'\"]+)['\"]", index):
        exports = [part.strip().split(' as ')[-1].strip() for part in names.split(',') if part.strip()]
        functions.update(exports)
        source = (root / 'functions/src' / (module.removeprefix('./') + '.ts')).read_text()
        for name, options in re.findall(r'export\s+const\s+(\w+)\s*=\s*onSchedule\(\{([^}]+)\}', source):
            schedule = re.search(r"schedule:\s*['\"]([^'\"]+)['\"]", options)
            zone = re.search(r"timeZone:\s*['\"]([^'\"]+)['\"]", options)
            if name in exports and schedule:
                schedules[name] = {'schedule': schedule.group(1), **({'timeZone': zone.group(1)} if zone else {})}
    setup = (root / 'scripts/google-cloud-setup.command').read_text()
    enabled_block = re.search(r'gcloud services enable \\\n([\s\S]+?)--project', setup)
    if not enabled_block or not functions or not ttl or not schedules:
        raise ValueError('Repository infrastructure expectations could not be derived')
    services = set(re.findall(r'([a-z0-9]+\.googleapis\.com)', enabled_block.group(1))) | {'fcm.googleapis.com'}
    topic_source = (root / 'functions/src/storageFinalizeEvents.ts').read_text()
    topic = re.search(r"STORAGE_FINALIZE_TOPIC\s*=\s*['\"]([^'\"]+)['\"]", topic_source)
    if not topic:
        raise ValueError('Storage notification topic could not be derived')
    return {'storage_topic': topic.group(1), 'project': PROJECT, 'region': REGION, 'bucket': BUCKET, 'ttl': ttl, 'functions': functions, 'schedules': schedules,
            'services': services, 'runtime': 'nodejs22'}


def _dict(value: Any) -> dict:
    return value if isinstance(value, dict) else {}


def _list(value: Any) -> list:
    return value if isinstance(value, list) else []


def _projected(value: Any, fields: tuple[str, ...]) -> dict:
    value = _dict(value)
    return {field: value[field] for field in fields if field in value and isinstance(value[field], (str, int, type(None)))}


def _notification(entry: Any) -> dict:
    config = _dict(_dict(entry).get('Notification Configuration', entry))
    topic = config.get('topic')
    return {
        'topic': topic.removeprefix('//pubsub.googleapis.com/') if isinstance(topic, str) else None,
        'payload_format': config.get('payload_format') if isinstance(config.get('payload_format'), str) else None,
        'event_types': [event for event in _list(config.get('event_types')) if isinstance(event, str)],
        **({'object_name_prefix': True} if config.get('object_name_prefix') else {}),
    }


def _lifecycle_rules(storage: Any) -> list:
    # Mark unknown conditions rather than echoing their values.
    lifecycle = _dict(_dict(storage).get('lifecycle_config'))
    rules = []
    for rule in _list(lifecycle.get('rule', lifecycle.get('rules'))):
        rule = _dict(rule); condition = _dict(rule.get('condition'))
        prefixes = condition.get('matchesPrefix', condition.get('matches_prefix'))
        rules.append({'action': _projected(rule.get('action'), ('type',)),
                      'condition': {'age': condition.get('age') if type(condition.get('age')) is int else None,
                                    'matchesPrefix': [p for p in _list(prefixes) if isinstance(p, str)],
                                    **({'extra_conditions': True} if set(condition) - {'age', 'matchesPrefix', 'matches_prefix'} else {})}})
    return rules


def sanitized_report(report: Any) -> dict:
    """Never retain environment variables, credential data, HTTP payloads or CLI diagnostics."""
    report = _dict(report)
    resources = _dict(report.get('resources'))
    clean = {
        'project': _projected(resources.get('project'), ('projectId', 'projectNumber', 'lifecycleState')),
        'services': [{'config': _projected(_dict(item).get('config'), ('name',))} for item in _list(resources.get('services'))],
        'firestore': _projected(resources.get('firestore'), ('name', 'locationId', 'type')),
        'ttl': [{**_projected(item, ('name',)), 'ttlConfig': _projected(_dict(item).get('ttlConfig'), ('state',))} for item in _list(resources.get('ttl'))],
        'functions': [{**_projected(item, ('name', 'state', 'environment')),
                       'buildConfig': _projected(_dict(item).get('buildConfig'), ('runtime',)),
                       'eventTrigger': _projected(_dict(item).get('eventTrigger'), ('eventType', 'pubsubTopic', 'retryPolicy', 'triggerRegion'))} for item in _list(resources.get('functions'))],
        'scheduler': [_projected(item, ('name', 'state', 'schedule', 'timeZone')) for item in _list(resources.get('scheduler'))],
        'storage': _projected(resources.get('storage'), ('name',)),
        **{key: [_projected(item, ('name', 'state')) for item in _list(resources.get(key))] for key in REQUIRED_SECRETS},
    }
    clean['storage_notifications'] = [_notification(entry) for entry in _list(resources.get('storage_notifications'))]
    clean['storage']['lifecycle_config'] = {'rule': _lifecycle_rules(resources.get('storage'))}
    commands = {key: _projected(_dict(report.get('commands')).get(key), ('status', 'return_code')) for key in RESOURCE_KEYS}
    return {'schema_version': report.get('schema_version') if type(report.get('schema_version')) is int else None,
            'project_id': report.get('project_id') if isinstance(report.get('project_id'), str) else None,
            'collected_at': report.get('collected_at') if isinstance(report.get('collected_at'), str) else None,
            'resources': clean, 'commands': commands}


def _resource_parts(name: Any, project_ids: set[str], kind: str) -> str | None:
    if not isinstance(name, str):
        return None
    match = re.fullmatch(r'projects/([^/]+)/locations/([^/]+)/' + kind + r'/([^/]+)', name)
    if not match or match.group(1) not in project_ids or match.group(2) != REGION:
        return None
    return match.group(3)


def _schedule_equivalent(actual: Any, expected: str) -> bool:
    if actual == expected:
        return True
    every = re.fullmatch(r'every (\d+) minutes', expected)
    if every:
        return actual == f'*/{every.group(1)} * * * *'
    daily = re.fullmatch(r'every day (\d{2}):(\d{2})', expected)
    return bool(daily and actual == f'{int(daily.group(2))} {int(daily.group(1))} * * *')


def _check_storage_triggers(functions: dict, expected: dict, project_ids: set[str], fail) -> None:
    topics = {f'projects/{owner}/topics/{expected["storage_topic"]}' for owner in project_ids}
    for name in STORAGE_FINALIZERS:
        function = functions.get(name)
        if not function:
            continue
        trigger = function.get('eventTrigger', {})
        if trigger.get('eventType') != 'google.cloud.pubsub.topic.v1.messagePublished' or trigger.get('pubsubTopic') not in topics or trigger.get('retryPolicy') != 'RETRY_POLICY_RETRY' or trigger.get('triggerRegion') != REGION:
            fail('storage_trigger_configuration', name, 'Finalizer must consume the Storage notification topic in us-central1 with retry enabled.')


def _check_project(clean: dict, expected: dict, project_ids: set[str], fail) -> None:
    resources = clean['resources']
    if clean['schema_version'] != SCHEMA_VERSION:
        fail('report_schema', 'report', f'Metadata report schema_version must be {SCHEMA_VERSION}.')
    if clean['project_id'] != PROJECT or resources['project'].get('projectId') != PROJECT:
        fail('wrong_project', 'project', f'Both report and observed project must be {PROJECT}.')
    if resources['project'].get('lifecycleState') != 'ACTIVE':
        fail('project_inactive', 'project', 'Project must be ACTIVE.')
    for key in RESOURCE_KEYS:
        if clean['commands'][key].get('status') != 'ok' or clean['commands'][key].get('return_code') != 0:
            fail('command_failed', key, 'Metadata collection did not complete successfully; state is unknown.')
    services = {_dict(item.get('config')).get('name') for item in resources['services']}
    for service in sorted(expected['services'] - services):
        fail('api_missing', service, 'Required API is not enabled.')
    firestore = resources['firestore']
    database = firestore.get('name')
    if not isinstance(database, str) or not any(database == f'projects/{owner}/databases/(default)' for owner in project_ids):
        fail('database_mismatch', 'firestore', 'Expected the default database in the selected project.')
    if firestore.get('locationId') != 'nam5' or firestore.get('type') != 'FIRESTORE_NATIVE':
        fail('database_configuration', 'firestore', 'Expected nam5 and FIRESTORE_NATIVE.')


def _check_ttl(clean: dict, expected: dict, project_ids: set[str], fail) -> None:
    resources = clean['resources']
    ttl_by_field = {}
    for item in resources['ttl']:
        name = item.get('name')
        if not isinstance(name, str):
            continue
        match = re.fullmatch(r'projects/([^/]+)/databases/\(default\)/collectionGroups/([^/]+)/fields/([^/]+)', name)
        if match and match.group(1) in project_ids:
            ttl_by_field[(match.group(2), match.group(3))] = item.get('ttlConfig', {}).get('state')
    for collection, field in sorted(expected['ttl']):
        state = ttl_by_field.get((collection, field))
        if state != 'ACTIVE':
            fail('ttl_missing' if state is None else 'ttl_inactive', f'{collection}.{field}', 'TTL policy must be ACTIVE; deploying states do not pass.')


def _check_functions(clean: dict, expected: dict, project_ids: set[str], fail) -> None:
    resources = clean['resources']
    functions = {_resource_parts(item.get('name'), project_ids, 'functions'): item for item in resources['functions']}
    for name in sorted(expected['functions']):
        function = functions.get(name)
        if not function:
            fail('function_missing', name, 'Expected exported Function is missing from us-central1.')
        elif function.get('state') != 'ACTIVE' or function.get('environment') != 'GEN_2' or function.get('buildConfig', {}).get('runtime') != expected['runtime']:
            fail('function_configuration', name, 'Function must be ACTIVE, GEN_2 and nodejs22.')
    _check_storage_triggers(functions, expected, project_ids, fail)


def _check_notifications(clean: dict, expected: dict, project_ids: set[str], fail) -> None:
    resources = clean['resources']
    topics = {f'projects/{owner}/topics/{expected["storage_topic"]}' for owner in project_ids}
    if not any(config.get('topic') in topics and config.get('payload_format') == 'NONE'
               and config.get('event_types') == ['OBJECT_FINALIZE'] and not config.get('object_name_prefix')
               for config in resources['storage_notifications']):
        fail('storage_notification_missing', BUCKET, 'Bucket must publish all OBJECT_FINALIZE identity notifications with payload NONE to the expected topic.')


def _check_scheduler(clean: dict, expected: dict, project_ids: set[str], fail) -> None:
    resources = clean['resources']
    jobs = {_resource_parts(item.get('name'), project_ids, 'jobs'): item for item in resources['scheduler']}
    for name, options in sorted(expected['schedules'].items()):
        job = jobs.get(f'firebase-schedule-{name}-{REGION}')
        if not job:
            fail('scheduler_missing', name, 'Firebase Scheduler job is missing from us-central1.')
        elif job.get('state') != 'ENABLED' or not _schedule_equivalent(job.get('schedule'), options['schedule']) or ('timeZone' in options and job.get('timeZone') != options['timeZone']):
            fail('scheduler_configuration', name, 'Scheduler job must be ENABLED with the repository schedule and explicit timezone.')


def _check_storage(clean: dict, expected: dict, project_ids: set[str], fail) -> None:
    resources = clean['resources']
    bucket_name = resources['storage'].get('name')
    if not isinstance(bucket_name, str) or bucket_name.removeprefix('gs://').rstrip('/') != BUCKET:
        fail('bucket_mismatch', 'storage', 'Expected the configured Firebase Storage bucket.')
    covered = set()
    for rule in resources['storage']['lifecycle_config']['rule']:
        condition = rule['condition']
        if rule['action'].get('type') == 'Delete' and condition.get('age') == 30 and not condition.get('extra_conditions'):
            covered.update(condition.get('matchesPrefix', []))
    for prefix in sorted(LEGACY_PREFIXES - covered):
        fail('lifecycle_missing', prefix, 'Legacy prefix must have a Delete lifecycle rule at age 30 with no extra conditions.')


def _check_secrets(clean: dict, expected: dict, project_ids: set[str], fail) -> None:
    resources = clean['resources']
    for key, (secret, code, message) in REQUIRED_SECRETS.items():
        pattern = r'projects/(' + '|'.join(re.escape(p) for p in project_ids) + r')/secrets/' + secret + r'/versions/\d+'
        if not any(isinstance(v.get('name'), str) and re.fullmatch(pattern, v['name']) and v.get('state') == 'ENABLED' for v in resources[key]):
            fail(code, secret, message)

def validate_report(report: Any, expected: dict[str, Any] | None = None) -> dict:
    expected = expected or repository_expectations()
    clean = sanitized_report(report)
    findings = []

    def fail(code: str, resource: str, message: str) -> None:
        findings.append({'code': code, 'resource': resource, 'message': message})

    project_ids = {PROJECT}
    number = clean['resources']['project'].get('projectNumber')
    if isinstance(number, (str, int)) and str(number).isdigit():
        project_ids.add(str(number))
    for check in (_check_project, _check_ttl, _check_functions, _check_notifications, _check_scheduler, _check_storage, _check_secrets):
        check(clean, expected, project_ids, fail)
    clean['readiness'] = {'ready': not findings, 'findings': findings}
    return clean
