import contextlib
from copy import deepcopy
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))
from firebase_readiness import PROJECT, REGION, BUCKET, RESOURCE_KEYS, LEGACY_PREFIXES, repository_expectations, validate_report

spec = importlib.util.spec_from_file_location('qa_live_firebase', SCRIPTS / 'qa-live-firebase.py')
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)
EXPECTED = repository_expectations()


def ready_report():
    return {'schema_version': 1, 'project_id': PROJECT, 'collected_at': '2026-10-04T12:00:00+00:00',
            'commands': {key: {'status': 'ok', 'return_code': 0} for key in RESOURCE_KEYS}, 'resources': {
                'project': {'projectId': PROJECT, 'projectNumber': '1234567890', 'lifecycleState': 'ACTIVE'},
                'services': [{'config': {'name': api}} for api in sorted(EXPECTED['services'])],
                'firestore': {'name': f'projects/{PROJECT}/databases/(default)', 'locationId': 'nam5', 'type': 'FIRESTORE_NATIVE'},
                'ttl': [{'name': f'projects/{PROJECT}/databases/(default)/collectionGroups/{collection}/fields/{field}', 'ttlConfig': {'state': 'ACTIVE'}} for collection, field in sorted(EXPECTED['ttl'])],
                'functions': [{'name': f'projects/{PROJECT}/locations/{REGION}/functions/{name}', 'state': 'ACTIVE', 'environment': 'GEN_2', 'buildConfig': {'runtime': 'nodejs22'}} for name in sorted(EXPECTED['functions'])],
                'scheduler': [{'name': f'projects/{PROJECT}/locations/{REGION}/jobs/firebase-schedule-{name}-{REGION}', 'state': 'ENABLED', **options} for name, options in sorted(EXPECTED['schedules'].items())],
                'storage': {'name': BUCKET, 'lifecycle_config': {'rule': [{'action': {'type': 'Delete'}, 'condition': {'age': 30, 'matchesPrefix': sorted(LEGACY_PREFIXES)}}]}},
                'apple_secret_versions': [{'name': f'projects/{PROJECT}/secrets/APPLE_PRIVATE_KEY/versions/1', 'state': 'ENABLED'}],
            }}


class FirebaseReadinessTests(unittest.TestCase):
    def codes(self, report):
        checked = validate_report(report)
        self.assertFalse(checked['readiness']['ready'])
        return {finding['code'] for finding in checked['readiness']['findings']}

    def test_repository_exports_ttl_schedules_and_fcm_are_derived(self):
        self.assertIn('retryAccountDeletions', EXPECTED['functions'])
        self.assertEqual(EXPECTED['schedules']['retryAccountDeletions']['schedule'], 'every 5 minutes')
        self.assertIn(('push_tokens', 'expires_at'), EXPECTED['ttl'])
        self.assertIn('fcm.googleapis.com', EXPECTED['services'])

    def test_complete_metadata_passes_and_accepts_project_number_resource_names(self):
        self.assertTrue(validate_report(ready_report())['readiness']['ready'])
        report = ready_report()
        for key in ('ttl', 'functions', 'scheduler', 'apple_secret_versions'):
            for item in report['resources'][key]:
                item['name'] = item['name'].replace(f'projects/{PROJECT}/', 'projects/1234567890/')
        report['resources']['firestore']['name'] = 'projects/1234567890/databases/(default)'
        self.assertTrue(validate_report(report)['readiness']['ready'])

    def test_wrong_project_and_database_fail(self):
        report = ready_report(); report['resources']['project']['projectId'] = 'other-project'
        self.assertIn('wrong_project', self.codes(report))
        report = ready_report(); report['project_id'] = 'other-project'
        self.assertIn('wrong_project', self.codes(report))
        report = ready_report(); report['resources']['firestore']['name'] = 'projects/other/databases/(default)'
        self.assertIn('database_mismatch', self.codes(report))

    def test_missing_function_wrong_region_old_runtime_and_gen1_fail(self):
        report = ready_report(); report['resources']['functions'].pop()
        self.assertIn('function_missing', self.codes(report))
        for field, bad in [('environment', 'GEN_1'), ('state', 'DEPLOYING')]:
            report = ready_report(); report['resources']['functions'][0][field] = bad
            self.assertIn('function_configuration', self.codes(report))
        report = ready_report(); report['resources']['functions'][0]['buildConfig']['runtime'] = 'nodejs20'
        self.assertIn('function_configuration', self.codes(report))
        report = ready_report(); report['resources']['functions'][0]['name'] = report['resources']['functions'][0]['name'].replace(REGION, 'europe-west1')
        self.assertIn('function_missing', self.codes(report))

    def test_all_source_ttl_policies_must_be_active(self):
        report = ready_report(); report['resources']['ttl'][0]['ttlConfig']['state'] = 'CREATING'
        self.assertIn('ttl_inactive', self.codes(report))
        report = ready_report(); report['resources']['ttl'].pop()
        self.assertIn('ttl_missing', self.codes(report))

    def test_paused_missing_and_wrong_schedule_jobs_fail(self):
        report = ready_report(); report['resources']['scheduler'][0]['state'] = 'PAUSED'
        self.assertIn('scheduler_configuration', self.codes(report))
        report = ready_report(); report['resources']['scheduler'].pop()
        self.assertIn('scheduler_missing', self.codes(report))
        report = ready_report(); report['resources']['scheduler'][0]['schedule'] = 'every 30 minutes'
        self.assertIn('scheduler_configuration', self.codes(report))

    def test_equivalent_cron_schedules_and_explicit_timezone(self):
        report = ready_report()
        for job in report['resources']['scheduler']:
            if job['schedule'] == 'every 5 minutes': job['schedule'] = '*/5 * * * *'
            elif job['schedule'] == 'every day 03:17': job['schedule'] = '17 3 * * *'
            elif job['schedule'] == 'every day 04:11': job['schedule'] = '11 4 * * *'
        self.assertTrue(validate_report(report)['readiness']['ready'])
        report['resources']['scheduler'][0]['timeZone'] = 'UTC'
        self.assertIn('scheduler_configuration', self.codes(report))

    def test_all_legacy_prefixes_need_unrestricted_30_day_delete_rules(self):
        report = ready_report(); report['resources']['storage']['lifecycle_config']['rule'][0]['condition']['matchesPrefix'].pop()
        self.assertIn('lifecycle_missing', self.codes(report))
        for condition in [{'age': 31}, {'isLive': True}, {'matchesPrefix': ['']}]:
            report = ready_report(); report['resources']['storage']['lifecycle_config']['rule'][0]['condition'].update(condition)
            self.assertIn('lifecycle_missing', self.codes(report))

    def test_secret_versions_disabled_destroyed_or_wrong_project_fail(self):
        for state in ('DISABLED', 'DESTROYED'):
            report = ready_report(); report['resources']['apple_secret_versions'][0]['state'] = state
            self.assertIn('apple_secret_unavailable', self.codes(report))
        report = ready_report(); report['resources']['apple_secret_versions'][0]['name'] = 'projects/other/secrets/APPLE_PRIVATE_KEY/versions/1'
        self.assertIn('apple_secret_unavailable', self.codes(report))

    def test_database_location_and_required_api_fail(self):
        report = ready_report(); report['resources']['firestore']['locationId'] = 'eur3'
        self.assertIn('database_configuration', self.codes(report))
        report = ready_report(); report['resources']['services'] = [item for item in report['resources']['services'] if item['config']['name'] != 'fcm.googleapis.com']
        self.assertIn('api_missing', self.codes(report))

    def test_command_failures_or_missing_status_are_unknown_even_with_ready_resources(self):
        report = ready_report(); report['commands']['functions'] = {'status': 'error', 'return_code': 13}
        self.assertIn('command_failed', self.codes(report))
        report = ready_report(); del report['commands']['ttl']
        self.assertIn('command_failed', self.codes(report))

    def test_sanitization_discards_secret_fields_and_raw_diagnostics(self):
        report = ready_report(); report['credentials'] = 'NEVER-ECHO-SECRET'
        report['resources']['functions'][0]['serviceConfig'] = {'environmentVariables': {'KEY': 'NEVER-ECHO-SECRET'}}
        report['resources']['apple_secret_versions'][0]['payload'] = 'NEVER-ECHO-SECRET'
        report['commands']['functions']['stderr'] = 'NEVER-ECHO-SECRET'
        checked = validate_report(report)
        self.assertTrue(checked['readiness']['ready'])
        self.assertNotIn('NEVER-ECHO-SECRET', json.dumps(checked))
        self.assertTrue(validate_report(checked)['readiness']['ready'])

    def test_unsupported_report_schema_is_rejected(self):
        report = ready_report(); report['schema_version'] = 2
        self.assertIn('report_schema', self.codes(report))
        self.assertIn('report_schema', self.codes([]))

    def test_empty_managed_manifest_refuses_bootstrap_before_gcloud(self):
        with tempfile.TemporaryDirectory() as directory:
            manifest = Path(directory) / 'manifest.json'; manifest.write_text(json.dumps({'version': 1, 'connections': []}))
            with self.assertRaisesRegex(collector.IdentitySelectionError, 'No matching managed GCP'):
                collector.selected_environment('explicit', {'OIC_MANIFEST_PATH': str(manifest), 'GOOGLE_APPLICATION_CREDENTIALS': '/must-not-read'})

    def test_managed_selectors_use_metadata_without_reading_credential_file(self):
        with tempfile.TemporaryDirectory() as directory:
            manifest = Path(directory) / 'manifest.json'
            manifest.write_text(json.dumps({'version': 1, 'connections': [{'provider_kind': 'gcp', 'configuration_name': 'explicit', 'config_dir': '/must-not-open-config', 'credentials_file': '/must-not-read-credentials'}]}))
            env = collector.selected_environment('explicit', {'OIC_MANIFEST_PATH': str(manifest), 'HTTPS_PROXY': 'preserved-proxy', 'SSL_CERT_FILE': '/preserved-ca'})
            self.assertEqual(env['GOOGLE_APPLICATION_CREDENTIALS'], '/must-not-read-credentials')
            self.assertEqual(env['CLOUDSDK_CONFIG'], '/must-not-open-config')
            self.assertEqual(env['HTTPS_PROXY'], 'preserved-proxy'); self.assertEqual(env['SSL_CERT_FILE'], '/preserved-ca')
            with self.assertRaisesRegex(collector.IdentitySelectionError, 'emulator selectors'):
                collector.selected_environment('explicit', {'FIRESTORE_EMULATOR_HOST': '127.0.0.1:8080'})

    def test_cli_offline_ignores_unavailable_identity_and_preserves_failure_exit(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'report.json'; output = Path(directory) / 'checked.json'
            source.write_text(json.dumps(ready_report()))
            env = {'PATH': '/usr/bin:/bin', 'OIC_MANIFEST_PATH': '/must-not-read', 'GOOGLE_APPLICATION_CREDENTIALS': '/must-not-read'}
            result = subprocess.run([sys.executable, str(SCRIPTS / 'qa-live-firebase.py'), '--from-report', str(source), '--report', str(output)], env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(json.loads(output.read_text())['readiness']['ready'])
            self.assertEqual(output.stat().st_mode & 0o777, 0o600)
            report = ready_report(); report['resources']['scheduler'][0]['state'] = 'PAUSED'; source.write_text(json.dumps(report))
            result = subprocess.run([sys.executable, str(SCRIPTS / 'qa-live-firebase.py'), '--from-report', str(source)], env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 1)
            self.assertFalse(json.loads(result.stdout)['readiness']['ready'])

    def test_collection_projects_only_metadata_and_never_echoes_failed_command_output(self):
        ready = ready_report(); called = []
        def run(args, **kwargs):
            called.append(args)
            key = RESOURCE_KEYS[len(called) - 1]
            if key == 'functions': return SimpleNamespace(returncode=13, stdout='NEVER-ECHO-SECRET', stderr='NEVER-ECHO-SECRET')
            return SimpleNamespace(returncode=0, stdout=json.dumps(ready['resources'][key]), stderr='')
        with contextlib.redirect_stderr(io.StringIO()):
            report = collector.collect_metadata('explicit', {}, runner=run)
        checked = validate_report(report)
        self.assertIn('command_failed', {item['code'] for item in checked['readiness']['findings']})
        self.assertNotIn('NEVER-ECHO-SECRET', json.dumps(checked))
        for args in called:
            self.assertIn('--project=' + PROJECT, args); self.assertIn('--configuration=explicit', args)
            self.assertTrue(any(arg.startswith('--format=json(') for arg in args))
            self.assertNotIn('access', args); self.assertNotIn('enable', args); self.assertNotIn('update', args)


if __name__ == '__main__':
    unittest.main()
