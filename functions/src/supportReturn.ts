import { onRequest } from 'firebase-functions/v2/https';

// Static return page: no Admin SDK, database, processor credentials or payment confirmation.
// It does not import core.ts, so the global options are repeated here: the gen1 CPU share keeps it
// inside the Cloud Run CPU quota that every function shares (owner incident, 9 Nov 2026).
export const supportCheckoutReturn = onRequest({ region: 'us-central1', maxInstances: 2, minInstances: 0, cpu: 'gcf_gen1' }, (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.set('Allow', 'GET, HEAD').status(405).end();
    return;
  }
  response.set('Cache-Control', 'no-store').set('X-Content-Type-Options', 'nosniff')
    .set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'")
    .type('html').send('<!doctype html><html lang="tr"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LociDrop</title><style>body{background:#06090e;color:#fff;font:18px system-ui;padding:48px;max-width:560px;margin:auto}h1{color:#38e0b8}</style><h1>LociDrop</h1><p>Uygulamaya dönerek destek ödemenin durumunu kontrol edebilirsin.</p><p>Return to LociDrop to check your support payment status.</p></html>');
});
