# Admin Playwright closure

Public security smoke:

```sh
npm run test:e2e
```

Production AAL2 operations smoke uses an ephemeral Playwright storage-state file created after an interactive MFA login. Do not commit or print the file:

```sh
ADMIN_E2E_BASE_URL=https://admin.example.com \
ADMIN_E2E_STORAGE_STATE=/absolute/private/admin-aal2-state.json \
npm run test:e2e
```

Delete the state file immediately after the run. OTP values, cookies and service-role credentials must never be placed in source, CI output or Playwright artifacts.
