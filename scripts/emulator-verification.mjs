/** Restrict a demo Auth response to a code in a fixed local verification URL. */
export function emulatorVerificationURL(code) {
  if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(code)) throw new Error('Invalid emulator verification code');
  const url = new URL('http://127.0.0.1:9099/emulator/action');
  url.searchParams.set('mode', 'verifyEmail');
  url.searchParams.set('oobCode', code);
  url.searchParams.set('apiKey', 'fake-api-key');
  return url;
}
