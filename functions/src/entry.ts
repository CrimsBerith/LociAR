/**
 * Deployed entry point (package.json "main"). Cold starts load only the module that defines the
 * function being started, not the whole code base: on 1/6 vCPU (gcf_gen1, 256 MiB) loading every
 * module took 3-5.7 s per cold start (Cloud Monitoring, 7 days to 16 Nov 2026), and the Vision,
 * Stripe and App Store libraries are needed by only a few functions.
 *
 * Cloud Run sets FUNCTION_TARGET to the export being served. Without it (Firebase CLI discovery,
 * emulator, tests) or for a name missing from the map, everything is loaded from ./index exactly as
 * before. test/entry.test.mjs keeps the map in functionModules.ts equal to the exports of index.ts.
 */
import { FUNCTION_MODULES } from './functionModules';

const target = process.env.FUNCTION_TARGET;
const owner = target ? FUNCTION_MODULES[target] : undefined;
// Only function exports here: the Firebase CLI reads every export of this file as a function or group.
// eslint-disable-next-line @typescript-eslint/no-require-imports
module.exports = owner ? { [target as string]: require(owner)[target as string] } : require('./index');
