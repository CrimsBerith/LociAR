import test from 'node:test';
import assert from 'node:assert/strict';
import { emulatorVerificationURL } from '../emulator-verification.mjs';

test('emulator verification responses cannot change the local endpoint or add query actions', () => {
  for (const value of [null, {}, '', '../action', 'https://attacker.invalid', 'code&mode=other', 'a'.repeat(257)]) {
    assert.throws(() => emulatorVerificationURL(value), /Invalid emulator/);
  }
  const url = emulatorVerificationURL('code_123-ABC');
  assert.equal(url.origin, 'http://127.0.0.1:9099');
  assert.equal(url.pathname, '/emulator/action');
  assert.equal(url.searchParams.get('mode'), 'verifyEmail');
  assert.equal(url.searchParams.get('oobCode'), 'code_123-ABC');
});
