import { spawnSync } from 'node:child_process';

// Public Firebase configuration is intentionally inert for builds and public UI tests.
const result = spawnSync(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NEXT_PUBLIC_FIREBASE_API_KEY: 'ci-placeholder',
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'demo-lociar.firebaseapp.com',
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'demo-lociar',
    NEXT_PUBLIC_FIREBASE_APP_ID: 'ci-placeholder',
  },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
