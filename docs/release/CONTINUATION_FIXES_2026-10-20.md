# Audit follow-up implementation — 20 October 2026

Supersedes the code gaps in `FULL_AUDIT_2026-10-20.md`. Local work was preserved in a 50-file snapshot before
fast-forwarding to `fd7de0a`, including the extra business batch and the owner's human-voice rewrite.

## Changes

- Wrapped density viewports issue two bounded queries across ±180°, merging cells by id without adding the
  same aggregate count twice. Ordinary/full-world views keep one query. Both east/west regressions are tested.
- Readable comments, saved-list and AR previews use the same on-device translation policy as cards/details.
  AR viewers pass translated text into their current texture only after proximity/placement succeeds. The
  original post remains unchanged; translated textures bypass the reusable renderer cache. Render generations
  and anchor identity reject late work after a new request or session shutdown. Original toggle restores the
  original texture. Legacy drawing/video rendering stays original; iOS 17 retains the original text.
- Official LociAR badges use a server-stamped post flag, derived by admin publishing from the selected
  managed content identity. A handle or mobile request cannot award a badge. Public locked rows retain the
  flag but no body/identity disclosure. The selected public author remains visible. Existing managed posts
  lacking the post flag need an audited resave before showing it; no live data backfill was performed.
- The business seed validator's nested distance scan was extracted and Swift location fields split into
  individual declarations, addressing the three earlier Sonar findings. Current PR analysis remains the
  authority for any new findings.
- A/B generators now prepare **250 Istanbul notes + 12 field AR drafts** and **120 Turkey notes + 11 AR
  drafts**. With world capitals/businesses the inventory is **744 notes + 69 AR drafts**. Text is original
  editorial street writing, never fake customer feedback. OpenStreetMap geometry carries ODbL attribution.
  All A/B pins stay approximate for review. Preliminary worship/monument/school/hospital buffers are applied;
  actual server protected zones and field checks remain mandatory. The importer cannot release A's 12
  Cloud Anchor drafts with `--allow-approx`. All three generators are part of release preflight and CI.

## Verification

| Local layer | Result |
|---|---|
| Full release preflight, Node 22 / Java 21 | All stages passed |
| Repository / Functions / admin units | 56 / 143 / 41 passed |
| Firestore + Storage rules | 87 passed |
| Functions integration, including badge spoof/redaction regression | 167 passed |
| Isolated location-note emulator | 29 passed |
| Admin HTTP/browser integration, including field-AR hold and managed badges | 122 passed |
| Public desktop/mobile browser | 26 passed |
| Native iOS | 204 passed; 2 physical-only cases skipped |
| Actual Firebase SDK + simulator UI | 2 scenarios passed, including proximity/list/detail revocation |
| UI | 12-language settings/composer, original fallback and official selected-author badge passed |
| iPhoneOS / simulator builds | Passed; signing-disabled device build is compilation evidence |
| Localization | 670 Localizable + 6 InfoPlist keys × 12 languages; compiler checks passed |
| Seeds / dependency audit / secrets / whitespace | Passed |

The badge screen was inspected visually. Its header layout was corrected so the placement label does not
wrap, with a UI regression for the observed failure. Renderer tests prove a temporary translation does not
overwrite the original texture or post. They do not substitute a synthetic string for an Apple engine test.

Artifacts: `build/continuation-20261020/` and `build/continuation-e2e-20261020/`. See PR #58 for CI/Sonar
results at its current head; local success and a previous remote head are separate evidence.

## Rollout and physical boundary

Production Functions/rules/index TTL and the admin backend need a coordinated rollout with the matching
iOS map protocol. The previous live audit found `map_group_sessions.expires_at` TTL missing and a pre-feature
`readPublicContent` revision. No production deployment, seed import, TestFlight upload or final store
submission is implied by these local checks. The rollout changes reading behaviour for older iOS builds.

The paired physical iPhone was unavailable during the audit. Real Apple translation/model downloads,
offline/original switching, physical GPS/AR and live notification delivery still require that device. The
12 field AR drafts require actual Cloud Anchor capture and an authorized publishing workflow. Approximate
map geometry is not proof of on-site placement; keep these holds until the field work is completed.
