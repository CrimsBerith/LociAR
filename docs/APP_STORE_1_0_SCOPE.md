> **ARŞİV (28 Eylül 2026):** Bu belge Supabase dönemine aittir. Backend artık Firebase — güncel kaynaklar: `AGENTS.md`, `docs/FIREBASE_SETUP.md`, `ARCHITECTURE.md`.

# LociAR 1.0 App Store — Scope Freeze

**Status:** Frozen for pre-deploy campaign (2026-08-06)  
**Supersedes:** 2026-07-11 sensor-AR wording  
**Authority:** `DECISIONS.md` + Pre-Deploy Master Plan  

## Deploy targets

| Gate | Meaning |
|------|---------|
| **D0** | Engineering ready: local gates, contracts, sim/export green |
| **D1** | Online staging: hosted Supabase + remote create/approve/discover/AR |
| **D2** | TestFlight / App Store packaging + legal live |

## In 1.0 (must ship)

- **Platform:** iOS only, native/EAS dev client and release binaries. Expo Go retired. Android out.
- **Core product:** Create / Map / Discover / AR unlock / Profile / Activity / Collections / Place detail
- **Social:** Like, comment, save, follow, block, report
- **AR primary:** Markerless **Visual Surface** (Vision + reference-image match). Fully digital; no QR/AprilTag.
- **AR secondary:** ARKit world-map same-device precision enhancer; fail → honest recalibration UX (not silent)
- **Auth (production create):** **Policy A (OWNER CONFIRMED):** Apple + Google + email magic link. **SMS off for now.** Server identity = email or phone confirmation helpers (phone unused while SMS off).
- **Moderation:** Valid creates → `pending_review` → admin approve → `active`. No client status escalation.
- **Safety:** Protected zones hard-block; 18+ reject; report/block; account deletion edge
- **Backend:** Hosted Supabase + Storage + `create_post` + `delete_account`
- **Admin:** Magic-link + TOTP MFA (`aal2`) + RBAC writes via `/api/admin/v1/*` + audit
- **Production flags:** `REMOTE_POST_SYNC=true`, `STORAGE_UPLOAD=true`, `DEMO_DEV_TOOLS` off, Visual Surface + native world-lock on
- **Legal:** Live Privacy, Terms, Support URLs (not `example.com`)
- **Language:** TR + EN core copy review (no full i18n framework)

## Out of 1.0 (explicit defer)

- Android public store / ARCore Cloud Anchors product path
- City-scale multi-device VPS / perfect generic blank-wall lock
- Push notification workers
- Ads / finance admin modules
- Paid features / monetization
- Full multi-language i18n framework
- iPad as primary target (`supportsTablet: false`)

## Auth policies (pick one; default A)

| Code | Policy | Deploy impact |
|------|--------|---------------|
| **A** | Apple + email; SMS off; server accepts email-or-phone verified | D1/D2 allowed |
| **B** | SMS re-enabled; phone_verified required for create | Needs SMS provider |
| **C** | Local test only; remote sync off | D1/D2 blocked |

## Owner-only blockers

- Supabase project link + secrets for D1
- Live Privacy / Terms / Support hosting
- Apple/TestFlight for D2 (signing team partially resolved)
- Physical iPhone field evidence for Visual Surface resolve
- Explicit Policy B if SMS is required for store create

## Engineering can complete without owner (D0)

- Scope/docs/protocol sync
- Automated gates (`qa:predeploy`)
- Local Supabase adversarial smoke
- Contract matrix + unit/Maestro expansion
- UI state matrix on simulator
- Admin local MFA/RBAC smoke
- Secret scan + flag matrix

## Related

- Master plan: session pre-deploy plan (P0–P13)
- Decisions: `DECISIONS.md`
- Campaign board: `AGENT_WORKBOARD.md` → Pre-Deploy Campaign
- Inventory: `docs/PRE_DEPLOY_INVENTORY.md`
- Contracts: `docs/CONTRACT_MATRIX.md`
