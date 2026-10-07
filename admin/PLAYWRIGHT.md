# Admin Playwright closure

Public security smoke:

```sh
npm ci
npx --no-install playwright install --with-deps chromium
npm run build:ci
CI=1 ADMIN_E2E_PUBLIC_ONLY=1 npm run test:e2e
```

This runs desktop and mobile Chromium against the production build. Public CI never loads an authenticated storage state.
For an already running test server, set `ADMIN_E2E_BASE_URL` to its URL.
For an isolated local run, `ADMIN_E2E_PORT` selects an integer port from 1024 through 65535
for both the server and browser base URL (default: 3100).

Production AAL2 operations smoke uses an ephemeral Playwright storage-state file created after an interactive MFA login. Do not commit or print the file:

```sh
ADMIN_E2E_BASE_URL=https://admin.example.com \
ADMIN_E2E_STORAGE_STATE=/absolute/private/admin-aal2-state.json \
npm run test:e2e
```

Delete the state file immediately after the run. OTP values, cookies and service-role credentials must never be placed in source or CI output. Authenticated traces/HAR can contain session material: keep those artifacts private, inspect/redact them before sharing, and delete them after review. The public CI upload is only for the unauthenticated suite.

## Moderation transaction tests

From the repository root, install the existing Functions CLI and admin dependencies:

```sh
npm --prefix functions ci --no-audit --no-fund
npm --prefix admin ci --no-audit --no-fund
npm --prefix admin run build:ci
npm --prefix admin run test:emulator
```

Node 22 and Java 21 are required. This command starts Auth and Firestore emulators for
`demo-lociar`, runs actual server operations and starts a separate Next production HTTP server.
Install Chromium before this command (`npx --no-install playwright install --with-deps chromium`).
On a Linux environment with a system browser, set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium` instead.

It checks session-cookie attributes, origin, MFA claims, RBAC, role revocation, rate limits,
two-person approvals, moderation, atomic invitation/role/audit commits and audit idempotency.
It also launches actual Chromium form flows against a separate Next production server:
moderation after an interrupted committed request, metric retries after a non-JSON gateway response,
independent approval, revoked-role rejection and a mobile regular-user invitation from email link
through password setup. The invitation callback completes the verified regular-user flow without
granting an admin role or setting an admin cookie; the resulting password signs into the Auth emulator.
Browser Firebase Auth requests are redirected to the loopback emulator only by the test harness.
Failure screenshots/traces go to `artifacts/playwright-emulator` and contain synthetic demo identities.
The tests refuse to run without both loopback emulators.
Unsigned MFA-claim fixtures accepted by the Auth emulator do not prove live TOTP or JWT-signature verification.
Production TOTP and signed-token authenticated browser validation remains a separate live gate.
No production credentials are needed for these emulator browser flows.
The shared emulator CI job builds admin and runs these tests after the Functions integration suite.

## Accessibility and streamed-route checks

The public suite runs axe against `/privacy`, `/terms`, `/support`, `/en/privacy`,
`/privacy/en` and `/login` in desktop and mobile Chromium. `/en/privacy` is a permanent
redirect to the canonical English page `/privacy/en`. Serious and critical violations
fail the suite; keyboard checks also verify the visible skip link and single main landmark.

`npm run test:emulator` now starts **Auth, Firestore and Storage** for `demo-lociar`.
The real HTTP lookup/image tests require all three loopback emulator endpoints.
A tiny JPEG fixture is uploaded to Storage, streamed through the MFA/RBAC-protected
avatar route and deleted afterward; byte equality, `image/jpeg` and `private, no-store`
headers are checked without live credentials.

Root and protected loading boundaries can otherwise start an HTTP 200 response before
a server component redirects. The Node-runtime proxy therefore checks protected-page
sessions, MFA and the current route permission before rendering, preserving HTTP 307
for missing/invalid sessions, AAL1 and insufficient permissions. Page/layout and API
authorization checks remain independently enforced. Protected-page RSC prefetches
also pass through this proxy gate; public prefetch behavior is unchanged. HTTP integration
checks use the installed Next router's RSC cache key and ensure rejected pages contain
no protected layout or data rows.
