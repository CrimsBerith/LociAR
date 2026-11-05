# LociAR 1.0 — Post-Launch Incident Response Runbook

> Phase: P12 (Post-Launch Operations & Maintenance)  
> Owners: A00 (Technical Leader), A06 (Backend Reliability), A12 (CI/CD Specialist)  
> Date: 2 Kasım 2026  

---

## 1. Incident Severity Definitions & Response SLAs

| Severity | Definition | Response SLA | Mitigation Action |
|---|---|---|---|
| **P0 / Critical** | Service-wide outage, credential compromise, systemic crash on launch (>2% of sessions), data loss | **< 15 minutes** | Activate Emergency Kill-Switch; halt App Store phased rollout; invoke immediate hotfix branch |
| **P1 / High** | Core flow failure (e.g., Apple Sign-In fails, AR anchors fail to resolve across all devices, account deletion fails) | **< 1 hour** | Halt phased rollout; deploy backend patch or Cloud Function rollback; push hotfix within 24h |
| **P2 / Medium** | Non-blocking feature failure (e.g., GIPHY search slow, spatial tile cache miss, localized string defect) | **< 24 hours** | Triage defect; prepare fix for next scheduled patch release |
| **P3 / Low** | Cosmetic alignment, rare edge-case UI rendering, minor logging noise | **Next Sprint** | Log to GitHub issues backlog |

---

## 2. Emergency Operational Playbooks

### Playbook A: Immediate Kill-Switch Activation (Block Malicious / Broken Posts)
1. Open Google Cloud Console -> Firestore -> `(default)` database.
2. Navigate to collection `system`, document `flags`.
3. Set `post_review_required: true`.
4. Result: All newly submitted posts are held in `pending_review` status; public feeds reject unreviewed entries.

### Playbook B: Halting App Store Phased Rollout
1. Open **App Store Connect** -> LociAR -> iOS App -> 1.0.0.
2. Under **Phased Release for Automatic Updates**, click **Pause Phased Release**.
3. Status switches to "Paused" for up to 30 days while investigation is underway.

### Playbook C: Expedited Hotfix Deployment
1. Checkout the release commit tag: `git checkout -b hotfix/v1.0.1 v1.0.0`.
2. Apply the minimal surgical patch.
3. Run test regression: `xcodebuild test ... -only-testing:LociARTests`.
4. Bump patch version in `project.yml` (`1.0.1`, increment build number).
5. Build and submit archive to App Store Connect.
6. Submit an **Expedited Review Request** via App Store Connect support explaining the critical defect.

---

## 3. Blameless Postmortem Template

Every P0 or P1 incident requires a documented postmortem within 48 hours of resolution:
- **Incident Summary**: Exact duration, user impact, affected versions.
- **Timeline**: Chronological log of detection, escalation, diagnosis, mitigation, and resolution.
- **Root Cause Analysis (5 Whys)**: Deep systemic causal chain.
- **What Went Well**: Rapid detection, automated alerts, graceful degradation.
- **What Went Wrong**: Missing edge-case test, deployment friction.
- **Action Items & Preventative Measures**: New regression test added, alert threshold adjusted, documentation updated.

