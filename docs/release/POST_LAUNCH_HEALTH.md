# LociDrop 1.0 — Post-Launch Health & Observability Plan

> Phase: P12  
> Owners: A00 (Technical Leader), A06 (Backend Reliability), A08 (Performance), A14 (App Store)  
> Application: LociDrop iOS 1.0.0  
> Date: 2 Kasım 2026  

---

## 1. Post-Launch Telemetry & Health Monitoring (First 24–72 Hours)

The initial 72 hours post-release require vigilant monitoring across mobile client, serverless functions, database billing, and customer feedback.

```text
[ Mobile App Telemetry ]       [ Serverless Backend ]       [ App Store Connect ]
          │                               │                          │
          ├─► Crashlytics Crash Rate      ├─► Cloud Function Latency ├─► Rating & Reviews
          ├─► App Hang Detection          ├─► 5xx / 429 Errors       ├─► Store Crash Reports
          └─► Active Member Sessions      └─► Billing Spend vs Cap   └─► Support Tickets
```

### 1.1 Mobile Client SLOs
- **Crash-Free Session Rate**: **≥ 99.5%** target (monitored via Firebase Crashlytics).
- **Crash-Free User Rate**: **≥ 99.0%** target.
- **Symbolication SLA**: 100% of crashes symbolicated (ensured by automated dSYM upload script).
- **App Hang Rate**: < 0.1% of sessions experiencing hangs > 250 ms.

### 1.2 Backend Serverless SLOs
- **`createPost` Latency (p95)**: ≤ 1200 ms (including KLIPY slug validation, text filtering, and ARCore anchor signing).
- **`readPublicContent` / Map Cells Latency (p95)**: ≤ 350 ms.
- **Cloud Functions Error Rate**: < 0.1% non-retryable 5xx failures.
- **Google Cloud Spend**: Bounded within the ₺10 budget alert threshold. 3 scheduled jobs limitation strictly monitored.

---

## 2. On-Call Rotations & Incident Response Triage

### 2.1 Severity Definitions
- **SEV-0 / Critical**: App systematically crashing on launch; widespread data loss; security key compromise.
  - *Response*: Immediate activation within 15 minutes. Emergency hotfix or server kill switch.
- **SEV-1 / Major**: Content creation failing for all users; Apple Sign-in returning persistent 500s; high-frequency crash in AR tab.
  - *Response*: Triage within 1 hour. Fix and expedite build within 24 hours.
- **SEV-2 / Moderate**: Isolated localized string truncation; non-critical edge-case photo orientation.
  - *Response*: Scheduled for next bi-weekly patch release.

### 2.2 Emergency Operational Controls
- **Kill-Switch**: Setting `system/flags.kill_switch = true` in Firestore refuses new post creation and other protected admission calls; reads, reports, blocks and account deletion remain available.
- **Scheduled Functions Pause**: The admin console (`/admin/maintenance`) allows pausing automatic maintenance tasks with a single toggle if unexpected database load occurs.
- **Account Deletion Safeguard**: Account deletion retry routines cannot be paused, preserving regulatory and guideline compliance.

---

## 3. Post-Launch Review & Retrospective Schedule

1. **24-Hour Review**: Initial crash volumes, App Store review team feedback, authentication success rate.
2. **72-Hour Health Sign-Off**: Verification of crash-free rates, database read consumption, and KLIPY client integration stability.
3. **Sprint 1 Retrospective**: Evaluate user-reported edge cases, prepare version 1.0.1 maintenance release backlog.
