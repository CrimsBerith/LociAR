import { spawnSync } from 'node:child_process';
import ciEnvironment from './ci-environment.json' with { type: 'json' };

// Public Firebase configuration is intentionally inert for builds and public UI tests.
const result = spawnSync(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    ...ciEnvironment,
  },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
