> **ARŞİV (28 Eylül 2026):** Bu belge Supabase dönemine aittir. Backend artık Firebase — güncel kaynaklar: `AGENTS.md`, `docs/FIREBASE_SETUP.md`, `ARCHITECTURE.md`.

# LociAR Multi-Agent Protocol

Version: 1.2
Owner: Kagan
Project: LociAR - Free Secure Billboard AR MVP
Updated: 2026-08-06 (pre-deploy campaign)

This protocol is the working agreement for every AI or human agent touching this repository. Its job is to keep parallel work fast without breaking Expo compatibility, Supabase security, or the product direction.

## 1. Prime Directive

Build and prove LociAR as a **native iOS** app (`ios/LociAR.xcodeproj`, SwiftUI + ARKit). Expo, Metro, and React Native are removed. Android is out. Harden Supabase/admin in parallel without blocking AR field tests.

Pre-deploy readiness uses gates **D0 → D1 → D2** (`docs/APP_STORE_1_0_SCOPE.md`). Campaign tasks are tracked in `AGENT_WORKBOARD.md` → Pre-Deploy Campaign.

Decision order when tradeoffs conflict:

1. User safety and data security
2. Build stability
3. MVP product fit
4. Field-test reliability
5. Design polish
6. Speed

## 2. Non-Negotiables

- Read Apple ARKit / RealityKit docs before writing camera or AR code. Do not add Expo, Metro, or React Native.
- For Supabase schema, Auth, RLS, Storage, Edge Functions, or admin work, check current Supabase docs/changelog before implementation.
- Do not expose Supabase service-role or secret keys to mobile code, Expo env, browser JS, or `NEXT_PUBLIC_*`.
- Do not re-enable SMS auth unless the owner explicitly asks for it (Auth Policy B).
- Do not add 18+ publishing in the MVP.
- Do not add a protected-zone approval path in the MVP. Protected zones are hard blocks.
- Do not recommend Expo Go or treat sensor overlay as the primary AR path.
- Do not reintroduce Android product trees, Gradle targets, or ARCore ship paths unless owner reopens Android.
- Do not revert unrelated user changes.
- Do not let two agents edit the same file set at the same time.
- **Exclusive zones (single owner at a time):** `src/screens/CreateTagScreen.tsx`, `src/store/appStore.ts`, `supabase/functions/create_post/**`, `admin/app/api/admin/v1/posts/**`.
- **Research First**: Before any AR/gesture/editor/discovery refactor, run targeted external scans (Viro/ARKit/IG Stories/TikTok clones) via tools and consult latest RESEARCH_AR_SOCIAL.md. Log findings.
- **Evidence rule**: Every HANDOFF includes `Evidence:` with path under `artifacts/pre-deploy/` or explicit device notes. No evidence = task stays open.
- **Secrets scan**: Before merge/hand-off of env or build config, confirm no service-role/private keys in tracked files or mobile bundles.
- **Claim TTL**: File claims older than 24 hours without progress are stale; Lead may reassign.

## 3. Agent Roster

### 3.1 Lead Orchestrator

Owns scope, sequencing, handoffs, and final integration.

Responsibilities:
- Maintains the master plan and decides the next highest-value task.
- Splits work into file-scoped tasks.
- Prevents duplicate edits and architectural drift.
- Reviews every handoff before merging.
- Keeps current project decisions visible.

Primary files:
- `README.md`
- `MULTI_AGENT_PROTOCOL.md`
- `AGENTS.md`
- project-level plans and release notes

Must not:
- Approve security-sensitive changes without Supabase/Security review.
- Let design or native AR work jump ahead of the native iOS field test.

### 3.2 Expo Mobile Agent

Owns the mobile app.

Responsibilities:
- Camera/editor/map/AR fallback flows.
- Expo SDK **v54** compatibility only.
- Native iPhone dev-client and release runtime behavior.
- Mobile performance and permission UX.
- Feature-flag matrix vs `eas.json` / `.env.example` (production demo tools off).

Primary files:
- `App.tsx`
- `app.json`
- `src/screens/*`
- `src/components/*`
- `src/store/*`
- `src/services/*` for mobile callers
- `src/constants/*`

Required checks:
- `npx expo install --check`
- `npx tsc --noEmit`
- `npx expo export --platform ios --clear`

### 3.3 AR Geometry / Native Agent

Owns pose, Visual Surface pin/resolve, native world-lock module, and field-test math.

Responsibilities:
- GPS/heading/accuracy rules.
- **Visual Surface** capture and live match (primary).
- ARKit world-map optional precision path and recalibration UX.
- Sensor emergency fallback only (never product primary).
- Pose serialization and edit composition placement.
- Outdoor/indoor billboard field scripts and evidence.

Primary files:
- `src/types.ts`
- `src/utils/locationProof.ts`
- `src/services/ar/*`
- `modules/lociar-world-lock/*`
- `src/screens/CreateTagScreen.tsx` / `ARCameraScreen.tsx` (when claimed)
- `FIELD_TEST_CHECKLIST.md`

Required checks:
- Unit tests for distance/heading/pose/visual-surface serialization.
- Manual iPhone field notes under `artifacts/pre-deploy/field-ar/`.

### 3.4 Supabase Security Agent

Owns database, RLS, server-side policy, Edge Functions, and backend contracts.

Responsibilities:
- Migrations and grants.
- RLS policies.
- Edge Function validation.
- Protected-zone server checks.
- Rate limits and abuse flags.
- Storage policy when media upload is added.

Primary files:
- `supabase/config.toml`
- `supabase/migrations/*`
- `supabase/functions/*`
- Supabase env docs

Required checks:
- `supabase status`
- `supabase db lint --local`
- Direct SQL/RPC smoke checks when changing schema or policies.

Security rules:
- Use service role only inside trusted server contexts.
- Prefer RLS plus least-privilege grants.
- Treat client-supplied status, creator, age rating, and location proof as untrusted.

### 3.5 Admin Dashboard Agent

Owns the Next.js admin surface.

Responsibilities:
- Local and staged admin dashboard.
- Metrics, post/user search, moderation actions, invites, approvals, audit.
- `/api/admin/v1/*` only (no browser service-role); MFA `aal2` for writes.
- Admin auth hardening before online deploy (D1).

Primary files:
- `admin/*`

Required checks:
- `cd admin; npm run typecheck`
- Confirm no service-role value is exposed to client bundles or `NEXT_PUBLIC_*`.

### 3.6 UX and Design Agent

Owns visual clarity, interaction quality, localization, and field usability.

Responsibilities:
- Camera/editor controls.
- Map and AR affordances.
- TR + EN copy.
- Permission education and error states.
- Performance-aware UI polish.

Primary files:
- `src/screens/*`
- `src/components/*`
- localization files when added

Rules:
- Build the actual tool first, not a marketing landing page.
- Keep controls familiar: icons for tools, swatches for colors, sliders/inputs for numeric values, toggles for binary settings.
- Avoid UI overlap on mobile and desktop previews.

### 3.7 QA and Release Agent

Owns verification, regression tracking, device testing, and release readiness.

Responsibilities:
- Test matrix and Maestro flows.
- Manual iPhone field scripts and checklist completion.
- Build/export verification and `npm run qa:predeploy`.
- EAS profile validation (flags, demo tools off in production).
- Known issues, release notes, Go/No-Go evidence pack.

Primary files:
- `README.md`
- `eas.json`
- `.maestro/*`
- `src/__tests__/*`
- `scripts/qa-predeploy.*`
- `FIELD_TEST_CHECKLIST.md`, `APP_STORE_RELEASE_CHECKLIST.md`
- `artifacts/pre-deploy/*`

Required checks:
- Root typecheck/export/tests.
- Admin typecheck/build/security when admin changed.
- Supabase lint when migrations/functions changed.
- Device test notes before D1/D2.

### 3.7b Contract / Integration Agent (campaign)

Owns mobile ↔ edge ↔ DB ↔ admin single source of truth during pre-deploy.

Responsibilities:
- Field-level contract matrix (`docs/CONTRACT_MATRIX.md`).
- Online golden-path E2E (create → pending → approve → discover → AR).
- Flag matrix across `.env.example`, `eas.json`, `featureFlags.ts`.

Primary files:
- `docs/CONTRACT_MATRIX.md`
- `src/services/postService.ts`, `socialService.ts`, `authService.ts`
- `supabase/functions/create_post/*`
- admin moderate APIs

### 3.7c Repo Hygiene Agent (campaign)

Owns git packaging, ignore rules, and secret hygiene for the dirty worktree.

Responsibilities:
- Logical commit groups; never commit `.env` or service-role keys.
- Coordinate with Lead before any multi-package commit.

Primary files:
- `.gitignore`, root docs, packaging scripts

### 3.8 Docs Agent

Owns clarity and onboarding.

Responsibilities:
- Keeps README accurate.
- Keeps setup steps current.
- Records known limitations.
- Updates this protocol when workflow changes.

Primary files:
- `README.md`
- `MULTI_AGENT_PROTOCOL.md`
- `AGENTS.md`
- docs added later

### 3.9 Research Analyst (New)

Owns external codebase scanning for continuous quality uplift.

Responsibilities:
- Proactively scans AR (ViroReact, ARKit/ARCore samples, react-native-arkit) and social clones (Instagram Stories gestures/stickers, TikTok vertical feeds, camera+effects) using web_search, open_page, open_page_with_find on GitHub + docs.
- Extracts patterns (plane detection, hitTest, surface anchors, video textures, simultaneous gestures, vertical paging, realtime, Skia, architecture) that improve LociAR.
- Maintains living `docs/RESEARCH_AR_SOCIAL.md` with prioritized actionable list (Idea | Source | Benefit | Integration | Snippet | Effort).
- "Research First" mandate: run scans before claiming major AR/gesture/editor/discovery work. Log queries + append dated findings.
- Proposes 1-2 highest-ROI integrations per cycle to Lead + relevant agents (Expo Mobile, AR Geometry).

Primary files:
- `docs/RESEARCH_AR_SOCIAL.md`
- `MULTI_AGENT_PROTOCOL.md`
- `AGENT_WORKBOARD.md` (research queue items)

Tools: web_search, open_page, open_page_with_find, grep/read on local clones if present.

Output always follows the standard format in the research doc.

## 4. File Ownership Matrix

| Area | Primary Agent | Secondary Review |
| --- | --- | --- |
| Expo app shell | Expo Mobile | QA |
| Camera/editor UX | Expo Mobile | UX and AR Geometry |
| Pose/location math | AR Geometry | Expo Mobile |
| Supabase schema/RLS | Supabase Security | Lead Orchestrator |
| Edge Functions | Supabase Security | Expo Mobile |
| Admin dashboard | Admin Dashboard | Supabase Security |
| Design/copy/localization | UX and Design | Expo Mobile |
| EAS/release | QA and Release | Expo Mobile |
| Plans/docs | Docs | Lead Orchestrator |
| External research (AR/social code scans) | Research Analyst | Lead Orchestrator + Expo Mobile / AR Geometry |

Rule: if a task touches two primary owners, the Lead Orchestrator splits it or names one temporary owner.

## 5. Work States

Every task must move through these states:

1. `DISCOVERY`: Read relevant files/docs. No edits except notes.
2. `PLAN`: Define files, risks, acceptance criteria, and checks.
3. `CLAIM`: Announce owned files before editing.
4. `IMPLEMENT`: Make the scoped change.
5. `VERIFY`: Run relevant checks.
6. `HANDOFF`: Summarize changes, risks, and next step.

Preferred status line:

```text
[AgentRole][STATE] Short update. Files: pathA, pathB. Next: check/decision.
```

Example:

```text
[Expo Mobile][CLAIM] Improving editor drag performance. Files: src/screens/CreateTagScreen.tsx, src/components/EditComposition.tsx. Next: typecheck and iOS export.
```

## 6. Task Card Template

Use this shape for any non-trivial assignment:

```markdown
## Task

Goal:
Owner:
Phase:
Files claimed:
Inputs/docs read:
Constraints:
Acceptance criteria:
Verification commands:
Rollback notes:
Handoff:
```

Acceptance criteria must be observable. Avoid vague goals like "make it better"; use goals like "iOS export passes and drawing a 300-point stroke does not freeze the editor on device."

## 7. Handoff Template

Every agent handoff must include:

```markdown
Role:
State:
Changed files:
What changed:
Verification:
Evidence: artifacts/pre-deploy/... (or device note path)
Risks:
Needs owner decision:
Next recommended task:
```

If a check was not run, say why. Campaign tasks without `Evidence:` stay open.

## 8. Verification Gates

### 8.1 Always Run For Mobile Code

```bash
npx expo install --check
npx tsc --noEmit
npm test -- --ci --runInBand
npx expo export --platform ios --clear
# Prefer full gate when touching release paths:
npm run qa:predeploy
```


### 8.2 Always Run For Admin Code

```powershell
cd admin
npm run typecheck
```

### 8.3 Always Run For Supabase Changes

```powershell
supabase status
supabase db lint --local
```

When changing RLS or Edge Functions, add at least one direct smoke test for the changed behavior.

### 8.4 Manual iPhone Gate

Before calling Phase 1 done, verify on the physical iPhone:

- Camera permission flow
- Location permission flow
- Heading updates
- Draw/text/image layer creation
- Drag/resize/rotate
- Capture reference frame
- Publish local AR edit
- Discover/map preview
- AR camera unlock at the same place/heading
- Low GPS accuracy error
- Protected zone block path

## 9. Current Project State

Status as of this protocol:

- **Native iOS builds only** (Expo Go retired; Android removed). ARKit world lock is the default path.
- SMS auth is disabled for now.
- Remote post sync is tied to SMS auth and should stay disabled during local-only testing.
- Local Supabase can run on `563xx` ports for LociAR.
- Mobile local create works without SMS using local test access.
- Supabase production deploy is not complete.
- Admin RBAC, MFA, audit/approval, dashboard, user invitation, and post operations foundation is implemented locally; production migration and security smoke tests are still open.
- Two-physical-iPhone field validation for world lock is still open.

## 10. Critical Path

Next best multi-agent sequence:

1. QA and Release: install LociAR native iOS build and run field checklist (world lock + UX).
2. Expo Mobile + UX: fix device-only camera/editor/map issues on native builds.
3. Supabase Security: deploy local/remote backend path, then add media Storage policies.
4. Admin Dashboard + Supabase Security: harden admin login and service-role boundaries.
5. QA and Release: add automated tests for validation, pose math, and protected-zone decisions.
6. AR Geometry: validate ARKit/ARCore persistence and drift on device.
7. Research Analyst + Expo Mobile / AR Geometry: before major AR/gesture work, update RESEARCH_AR_SOCIAL.md (recurring).

## 11. Conflict Rules

If agents disagree:

1. Security decisions override convenience.
2. Expo SDK v57 docs override memory or older examples.
3. Supabase server-side checks override client-side assumptions.
4. The master plan overrides speculative features.
5. The Lead Orchestrator makes the final sequencing call.

## 12. Stop Conditions

Stop and ask the owner before:

- Re-enabling SMS auth.
- Adding paid features or monetization.
- Shipping service-role functionality online.
- Reintroducing Expo Go as a supported runtime.
- Changing protected-zone policy from hard block to review.
- Adding embedded playback from third-party platforms.
- Deleting data, resetting databases, or removing user-created content.

## 13. Done Definition

A task is done only when:

- The scoped behavior is implemented.
- Relevant checks passed or skipped with a clear reason.
- No unrelated user changes were reverted.
- Security-sensitive assumptions are documented.
- The handoff names the next realistic step.

For Phase 1, "done" requires physical iPhone validation, not just TypeScript success.

## 14. Coordination Artifacts

The protocol is the rulebook. These files are the live operating system:

- `AGENT_WORKBOARD.md`: active tasks, file claims, blockers, handoffs, and the next queue.
- `DECISIONS.md`: accepted product/technical decisions and their rationale.
- `README.md`: current setup and user-facing project state.
- `AGENTS.md`: shortest bootstrap instruction for any new agent session.

Every multi-agent session starts by reading:

1. `AGENTS.md`
2. `MULTI_AGENT_PROTOCOL.md`
3. `AGENT_WORKBOARD.md`
4. `DECISIONS.md`
5. The files directly owned by the task

If the protocol and workboard disagree, the protocol wins for rules and the workboard wins for current task status.

## 15. File Claim Protocol

Before editing, an agent must claim files in `AGENT_WORKBOARD.md`.

Claim format:

```markdown
| Agent | Task | Files claimed | Started | Status |
| --- | --- | --- | --- | --- |
| Expo Mobile | Editor drag perf | `src/screens/CreateTagScreen.tsx`, `src/components/EditComposition.tsx` | 2026-07-07 19:45 | CLAIMED |
```

Rules:

- A claim should be as narrow as possible.
- Claims expire when the agent hands off, abandons the task, or is inactive for a full working session.
- If another agent needs a claimed file, the Lead Orchestrator splits the task or merges ownership explicitly.
- Broad claims like `src/*` are not allowed unless the task is a coordinated migration.
- Config files such as `package.json`, `app.json`, `tsconfig.json`, `supabase/config.toml`, and `.gitignore` require extra care because they affect multiple agents.

## 16. Decision Log Protocol

Use `DECISIONS.md` for decisions that future agents must not rediscover.

Decision entry format:

```markdown
## YYYY-MM-DD - Decision Title

Status: Accepted | Superseded | Revisit Later
Owner:
Context:
Decision:
Consequences:
Revisit trigger:
```

Log decisions for:

- Auth model changes
- Backend architecture changes
- Expo SDK/native build path changes
- Data model/RLS changes
- Protected-zone/content policy changes
- Third-party API or media playback choices
- Release gates and beta criteria

Do not log tiny implementation details unless they affect future direction.

## 17. Risk Register

The Lead Orchestrator and QA Agent keep these risks visible until resolved:

| Risk | Owner | Current Mitigation | Exit Criteria |
| --- | --- | --- | --- |
| iPhone-only runtime issues | QA and Release | Signed native iOS device checklist | All Phase 1 device checks pass |
| GPS/heading drift | AR Geometry | Field-test notes and tolerance tuning | Outdoor billboard test is repeatable |
| Service-role leakage | Supabase Security | Server-only env and review gate | Admin deploy passes secret exposure review |
| Supabase RLS bypass | Supabase Security | RLS, grants, Edge Function checks | Smoke tests prove denied spoof paths |
| Media persistence | Supabase Security | Local-only images for MVP | Storage bucket/policy/upload path implemented |
| SMS auth disabled | Lead Orchestrator | Local test flag and explicit stop condition | Owner explicitly re-enables production phone auth |
| Native AR scope creep | Lead Orchestrator | Native iOS Phase 1 gate | Phase 1 accepted on two physical iPhones |

## 18. Review Modes

Use the right review mode for the change:

- Product review: Does this match the billboard AR MVP and current phase?
- Security review: Can a malicious client spoof creator, status, location, age rating, or admin authority?
- Runtime review: Does it work in the signed native iOS build on supported iPhones?
- Field review: Does it survive poor GPS, walking motion, low light, and repeated create attempts?
- Design review: Can a normal user create an AR edit without reading instructions?
- Release review: Are checks, env values, known limitations, and rollback steps clear?

Security-sensitive tasks require Security review before being called done.

## 19. Context Package For New Agents

When starting a fresh agent session, paste or summarize this package:

```markdown
Project: LociAR - Free Secure Billboard AR MVP
Current phase: Native iOS builds only (Expo Go retired; Android removed)
Must read: AGENTS.md, MULTI_AGENT_PROTOCOL.md, AGENT_WORKBOARD.md, DECISIONS.md
Hard rules: Expo SDK v54 docs before Expo code; native builds only; SMS disabled; service-role never in mobile/browser public env; protected zones and 18+ hard-blocked
Current local Supabase: Studio http://127.0.0.1:56323, API http://127.0.0.1:56321
Default checks: npx expo install --check; npx tsc --noEmit; npm test; native run or EAS build
Do not touch: files claimed by another active agent
```

## 20. Phase Exit Gates

### Phase 1 Exit - Native MVP (iOS first)

Required:

- iPhone native install checklist passes (world lock + UX).
- Core create flow works without SMS using local test access.
- Editor interactions are smooth enough for field testing.
- Map and AR Camera work in the LociAR binary.
- Typecheck and tests pass.
- Known limitations are written in README or workboard.

### Phase 2 Exit - Admin + Security

Required:

- Supabase production project deployed with migrations and functions.
- Admin auth is protected before any online exposure.
- RLS and Edge Function spoof-path tests pass.
- Storage policies exist before cross-device image persistence is enabled.
- Analytics and moderation flags are visible in admin.

### Phase 3 - Production operations + scale

Required:

- Moderation, AR/place, support, feature flag, and kill-switch operations are production-ready.
- Visual parity with `Loci_AR_Proje_Gorselleri` is accepted on supported iPhones.
- Cross-device persistence strategy decided if required for launch.
