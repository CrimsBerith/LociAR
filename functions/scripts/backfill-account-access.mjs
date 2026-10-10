#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { Firestore, getFirestore } from 'firebase-admin/firestore';
import { namedGcloudAuth } from './gcloud-auth.mjs';

function profileState(current, job) {
  if (job.exists) return job.get('status') === 'done' ? 'done' : 'deleting';
  if (current.get('deleted_at')) return 'deleting';
  return current.get('suspended') === true ? 'suspended' : 'active';
}

function backfillProfile(db, profile, apply) {
  return db.runTransaction(async tx => {
    const [current, job, access] = await tx.getAll(profile.ref,
      db.collection('account_deletion_jobs').doc(profile.id), db.collection('account_access').doc(profile.id));
    if (!current.exists && !job.exists) return { skipped: true };
    const state = profileState(current, job);
    const changed = access.get('state') !== state;
    if (apply && changed) tx.set(access.ref, { state });
    return { state, changed };
  });
}

function selectManagedIdentity(selected) {
  const manifest = JSON.parse(readFileSync(process.env.OIC_MANIFEST_PATH, 'utf8'));
  const matches = manifest.connections?.filter(connection => connection.provider_kind === 'gcp' && connection.configuration_name === selected) ?? [];
  if (manifest.version !== 1 || matches.length !== 1) throw new Error('No matching managed GCP identity');
  const identity = matches[0];
  for (const [variable, field] of [['CLOUDSDK_CONFIG', 'config_dir'], ['CLOUDSDK_ACTIVE_CONFIG_NAME', 'configuration_name'], ['GOOGLE_APPLICATION_CREDENTIALS', 'credentials_file']]) {
    if (typeof identity[field] !== 'string' || !identity[field]) throw new Error('Managed identity selector metadata is incomplete');
    process.env[variable] = identity[field]; // Select credential paths; never print/read secret values.
  }
}

function selectedDatabase(projectId, emulator, selected) {
  if (emulator) {
    if (!projectId?.startsWith('demo-') || !/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? '')) {
      throw new Error('Select a loopback Firestore emulator and an explicit demo project');
    }
    return new Firestore({ projectId });
  }
  if (!selected || !/^[a-zA-Z0-9_-]+$/.test(selected)) throw new Error('Select --gcloud-configuration=<authorized-name>');
  if (['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST'].some(key => process.env[key])) {
    throw new Error('Unset emulator selectors before selecting a live identity');
  }
  if (process.env.OIC_MANIFEST_PATH) {
    selectManagedIdentity(selected);
    return getFirestore(initializeApp({ projectId, credential: applicationDefault() }));
  }
  // Firestore takes the named OAuth client directly; no ambient/bootstrap ADC fallback.
  return new Firestore({ projectId, auth: namedGcloudAuth(selected) });
}

/** Read-only by default. Every proposed/actual state is derived again inside its transaction. */
export async function backfillAccountAccess(db, { apply = false, pageSize = 300 } = {}) {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 300) throw new Error('Invalid page size');
  const totals = { scanned: 0, changed: 0, skipped: 0, active: 0, suspended: 0, deleting: 0, done: 0 };
  let cursor;
  for (;;) {
    let query = db.collection('profiles').orderBy('__name__').limit(pageSize);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) return totals;
    for (const profile of page.docs) {
      const result = await backfillProfile(db, profile, apply);
      totals.scanned++;
      if (result.skipped) totals.skipped++;
      else { totals[result.state]++; if (result.changed) totals.changed++; }
    }
    cursor = page.docs.at(-1);
    if (page.size < pageSize) return totals;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const emulator = args.includes('--emulator');
  const selected = args.find(arg => arg.startsWith('--gcloud-configuration='))?.split('=').slice(1).join('=');
  if (args.some(arg => arg !== '--apply' && arg !== '--emulator' && !arg.startsWith('--gcloud-configuration='))) throw new Error('Unknown argument');
  const projectId = emulator ? process.env.FIREBASE_PROJECT_ID : 'lociar-2f38c';
  const db = selectedDatabase(projectId, emulator, selected);
  const totals = await backfillAccountAccess(db, { apply });
  console.log(JSON.stringify({ project: projectId, mode: apply ? 'apply' : 'dry-run', ...totals }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('Account access backfill failed. Check the selected identity and project; no credentials are printed.'); process.exitCode = 1; });
}
