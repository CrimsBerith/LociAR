# LociAR 1.0 — Observability, Telemetry & Incident Architecture

> Phase: P9 (CI/CD, Signing & Observability)  
> Owners: A08 (Performance Specialist), A00 (Technical Leader), A06 (Backend Reliability)  
> Date: 2 Kasım 2026  

---

## 1. Crash Reporting & Symbolication (Crashlytics)

- **Provider**: Firebase Crashlytics (`FirebaseCrashlytics-product` 12.19.3).
- **dSYM Generation**: Debug Information Format configured as `DWARF with dSYM File` in Release build configuration.
- **Symbol Upload**: Release archiving invokes `scripts/upload-crashlytics-symbols.sh` to ensure crash logs in the field are symbolicated to exact file and line numbers.
- **PII Scrubbing**: Crashlytics custom keys record strictly pseudonymous IDs (`app_version`, `ios_version`, `ar_state`, `active_tab`). Email addresses, user handles, and coordinates are **never logged**.

---

## 2. Performance Telemetry & SLO Budgets

| Metric | Target SLO Budget | Measurement Instrument | Escalation Threshold |
|---|---|---|---|
| **Cold Launch Time** | p95 < 2.50s | Firebase Performance / Time Profiler | p95 > 3.0s triggers P2 triage |
| **AR Camera Frame Rate** | >= 58 fps | RealityKit frame render loop | Sustained < 45 fps |
| **Crash-Free Sessions** | >= 99.5% | Crashlytics Real-Time Telemetry | < 99.0% halts phased rollout |
| **API Error Rate** | < 0.5% of requests | Cloud Functions Monitoring | > 1.0% triggers on-call alert |
| **Spatial Query Latency** | p95 < 800ms | Cloud Functions HTTP timer | p95 > 1500ms |

---

## 3. Server-Side Kill-Switch & Dynamic Controls

- **Configuration Path**: `databases/(default)/documents/system/flags`
- **Fields**:
  - `post_review_required` (Boolean): When set to `true`, newly submitted posts are placed in moderation hold before becoming visible on the map.
  - `emergency_stop` (Boolean): Temporarily blocks creation of new spatial notes during system anomalies.
- **Client Cache Behavior**:
  - App reads `system/flags` on initial cold launch and caches the values in memory.
  - In the event of an unreadable flag document, the client fails closed (admission refused), preventing unreviewed spam from leaking into public feeds.

