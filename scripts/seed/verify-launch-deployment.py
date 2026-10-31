#!/usr/bin/env python3
"""Read-only production protocol gate for the reviewed 1,680-text launch package."""
import argparse
import concurrent.futures
import datetime
import hashlib
import io
import json
from pathlib import Path
import subprocess
import urllib.parse
import urllib.request
import zipfile

PROJECT = 'lociar-2f38c'
REGION = 'us-central1'
ROOT = Path(__file__).resolve().parents[2]
NAMES = '''readPublicContent onPostDensityWritten readNoteDensity everyFiveMinutes
everyFifteenMinutes nightlyMaintenance onMaintenanceRequested ensureProfile updateHandle
readDataPreferences setDataPreferences recordUserContext createPlaceNote readPlaceNoteRegions
recordPlaceNoteVisit createPost deleteOwnPost recordPostView readActivity readLikeCount
blockPostAuthor readAnonymousWorldMap markActivityRead onLikeCreated onLikeDeleted
onCommentCreated onCommentDeleted onSaveCreated onSaveDeleted onFollowCreated onFollowDeleted
onPostWritten onProfileUpdated registerPushToken unregisterPushToken onActivityCreated
onReportCreated submitReport unlockDenseSpot'''.split()


def gcloud(*args):
    return json.loads(subprocess.check_output(['gcloud', *args, '--project', PROJECT, '--format=json'], text=True))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package', type=Path, required=True)
    opts = parser.parse_args()
    artifact = ROOT / 'build/seed-ready-1680'
    artifact.mkdir(parents=True, exist_ok=True)
    functions = gcloud('functions', 'list', '--v2', '--regions', REGION)
    # Do not retain environment variables or secret bindings in the report.
    functions = [{k: f.get(k) for k in ('name', 'state', 'updateTime', 'buildConfig', 'serviceConfig')} for f in functions]
    by_name = {f['name'].rsplit('/', 1)[-1]: f for f in functions}
    services = gcloud('run', 'services', 'list', '--region', REGION)
    by_service = {s['metadata']['name']: s for s in services}
    jobs = gcloud('scheduler', 'jobs', 'list', '--location', REGION)
    token = subprocess.check_output(['gcloud', 'auth', 'print-access-token'], text=True).strip()
    local = {str(p.relative_to(ROOT / 'functions')): hashlib.sha256(p.read_bytes()).hexdigest()
             for p in (ROOT / 'functions/lib').rglob('*.js') if p.name != 'index.js'}

    def check(name):
        f = by_name.get(name)
        s = by_service.get(name.lower())
        result = {'function': name, 'complete': False, 'problems': []}
        if not f or not s:
            result['problems'].append('missing_function_or_service')
            return result
        status = s.get('status', {})
        ready = status.get('latestReadyRevisionName')
        revision = f.get('serviceConfig', {}).get('revision')
        result.update(revision=revision, serving_revision=ready, updated_at=f.get('updateTime'))
        if f.get('state') != 'ACTIVE':
            result['problems'].append('function_not_active')
        if ready != revision or ready != status.get('latestCreatedRevisionName'):
            result['problems'].append('serving_old_revision')
        if not any(c.get('type') == 'Ready' and c.get('status') == 'True' for c in status.get('conditions', [])):
            result['problems'].append('service_not_ready')
        if sum(t.get('percent', 0) for t in status.get('traffic', []) if t.get('revisionName') == revision) != 100:
            result['problems'].append('traffic_not_on_reviewed_revision')
        if result['problems']:
            return result
        source = f['buildConfig']['source']['storageSource']
        q = urllib.parse.urlencode({'alt': 'media', 'generation': source['generation']})
        url = ('https://storage.googleapis.com/storage/v1/b/' + source['bucket'] + '/o/'
               + urllib.parse.quote(source['object'], safe='') + '?' + q)
        with urllib.request.urlopen(urllib.request.Request(url, headers={'Authorization': 'Bearer ' + token}), timeout=45) as response:
            raw = response.read(5_000_001)
        if len(raw) > 5_000_000:
            raise RuntimeError('Deployment source exceeds bounded read')
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            actual = {p: hashlib.sha256(archive.read(p)).hexdigest()
                      for p in archive.namelist() if p.startswith('lib/') and p.endswith('.js') and p != 'lib/index.js'}
        result['source_sha256'] = hashlib.sha256(raw).hexdigest()
        result['compiled_modules_checked'] = len(local)
        if actual != local:
            result['problems'].append('compiled_source_differs_from_tested_checkout')
        result['complete'] = not result['problems']
        return result

    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for name, result in zip(NAMES, pool.map(check, NAMES)):
            results.append(result)
            print(name, 'PASS' if result['complete'] else ','.join(result['problems']), flush=True)
    wanted_jobs = {'firebase-schedule-' + n + '-' + REGION for n in ('everyFiveMinutes', 'everyFifteenMinutes', 'nightlyMaintenance')}
    actual_jobs = {j['name'].rsplit('/', 1)[-1] for j in jobs}
    report = {'checked_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'project': PROJECT, 'region': REGION,
              'functions_checked': len(results), 'function_results': results,
              'scheduler_jobs': sorted(actual_jobs), 'scheduler_exactly_three': actual_jobs == wanted_jobs,
              'complete': all(r['complete'] for r in results) and actual_jobs == wanted_jobs,
              'post_writes': 0}
    output = opts.package / 'server-readiness.json'
    output.write_text(json.dumps(report, indent=2) + '\n')
    output.chmod(0o600)
    print(json.dumps({k: report[k] for k in ('functions_checked', 'scheduler_exactly_three', 'complete', 'post_writes')}))
    raise SystemExit(0 if report['complete'] else 1)


if __name__ == '__main__':
    main()
