# LociAR 1.0 — Technical & Operational Risk Register

> Phase: P1 (Baseline & Debt Mapping)  
> Owners: A00 (Technical Leader), A07 (Security Specialist), A02 (Architecture)  
> Commit SHA: `2b0469c8962f1d85065c479052307c95bcf2c599`  
> Date: 2 Kasım 2026  

---

## 1. Risk Evaluation Matrix

Risks are evaluated on Severity (P0–P3) and Likelihood (High, Medium, Low), resulting in an aggregate Risk Level:

| Risk ID | Category | Description | Severity | Likelihood | Mitigation Strategy | Owner | Status |
|---|---|---|---|---|---|---|---|
| **RSK-01** | Hardware / AR | ARCore Cloud Anchor resolution fails in low-texture / night street conditions | P2 | Medium | Automatic graceful fallback to 2.5D aim-guided indicator arrow based on device GPS heading | A02 / A10 | Gated by TestFlight |
| **RSK-02** | Sensor / CoreLocation | Main-thread location manager query diagnostic warning during app startup | P2 | Low | Implemented reactive property caching in `LocationController.swift`; 0 runtime warnings | A04 | FIXED |
| **RSK-03** | Operations / Node | Typeless package warnings in Node 22 test runner for Admin console | P2 | Low | Added `"type": "module"` to `admin/package.json`; clean 48/48 test pass | A12 | FIXED |
| **RSK-04** | Privacy / Anonymity | Anonymous author identification via side-channel mute / like patterns | P1 | Low | Differential privacy design: anonymous mutes do not alter security rules; identical failure behaviors | A07 | PASS (Verified) |
| **RSK-05** | App Review | Apple Guideline 5.1.1(v) account deletion rejection | P1 | Low | In-app account deletion calls Apple token revocation API and queues atomic deletion job | A07 / A14 | PASS (Verified) |
| **RSK-06** | App Review | Apple Guideline 3.1.1 unapproved payment mechanism rejection | P0 | Low | Creator support payments completely hidden and disabled in release builds (`PostSupportAvailability.releaseBuilds = false`) | A13 / A14 | PASS (Verified) |
| **RSK-07** | Backend / Quota | Google Cloud Scheduler exceeding free tier budget (max 3 jobs) | P2 | Low | Grouped periodic tasks into exactly 3 scheduled functions (`everyFiveMinutes`, `everyFifteenMinutes`, `nightlyMaintenance`) | A06 | PASS (Verified) |
| **RSK-08** | Storage / DB | Stale or corrupt spatial cell tile cache in SQLite | P3 | Low | 1-hour cache TTL enforced; automatic background eviction and user pull-to-refresh override | A05 | PASS (Verified) |
| **RSK-09** | UI / A11y | Dynamic Type text truncation on compact screens (iPhone SE) | P3 | Medium | Flexible auto-layout constraints with priority compression resistance and `.lineLimit(nil)` | A11 | PASS (Verified) |
| **RSK-10** | Push / APNs | Delivery failure on carrier cellular network transitions | P2 | Low | Bounded retry loop with exponential backoff on FCM token refresh; idempotent device update | A06 | PASS (Verified) |

---

## 2. Risk Mitigation Audit Trail

All high-impact risks (RSK-04, RSK-05, RSK-06) have been subjected to automated unit and integration tests:
- `RSK-04`: Verified in `functions/test/anonymous.test.mjs` (0 differential leakage).
- `RSK-05`: Verified in `functions/test/account-deletion.test.mjs` (atomic revocation & cleanup).
- `RSK-06`: Verified in `LociARTests/ArchitectureAndPublishTests.swift` (StoreKit concealment test).
- `RSK-07`: Verified in `functions/test/scheduler-budget.test.mjs` (<= 3 jobs assertion).

