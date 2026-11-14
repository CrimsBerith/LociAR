# LociDrop 1.0 — TestFlight & Real Device Readiness Report

> Phase: P10  
> Owners: A14 (App Store / TestFlight Specialist), A15 (Independent Red Team QA)  
> Gate: G7 Evaluation  
> Date: 2 Kasım 2026  

---

## 1. Beta Distribution Strategy

LociDrop 1.0 is prepared for TestFlight distribution in two sequential rings:

```text
Phase 1: Internal Testing Ring (Engineering & Operations)
  - Target: Core team (up to 100 internal testers).
  - Scope: Fast-turnaround verification of Release build archive on physical iPhone devices.
  - Review: No Apple beta review required. Immediate availability.

Phase 2: External Beta Ring (Community & Field Testers)
  - Target: Field beta testers (up to 10,000 external testers).
  - Scope: Real-world GPS drift validation, pedestrian AR tracking, varied cellular networks.
  - Review: Apple Beta App Review submission required (90-day testing window).
```

---

## 2. Target Device Matrix for Physical Field Testing

To guarantee hardware fidelity beyond simulator capabilities, TestFlight builds are tested against the following representative physical iPhone tiers:

| Hardware Tier | Representative Model | OS Version | Hardware Scope to Validate |
|---|---|---|---|
| **High Tier (LiDAR + Pro)** | iPhone 18 Pro / iPhone 17 Pro | iOS 27.0+ | LiDAR mesh scanning, ARCore Geospatial VPS accuracy, 60fps glass map rendering. |
| **Mid Tier (Standard)** | iPhone 16 / iPhone 15 | iOS 18.0+ | Non-LiDAR ARKit plane detection, camera auto-focus, thermal dissipation during AR. |
| **Compact / Entry Tier** | iPhone SE (3rd Gen) | iOS 17.0 | Compact screen layout (4.7"), A15 Bionic performance, battery drain under GPS fix. |

---

## 3. TestFlight Verification Protocol & Sign-off Criteria

1. **Release Archive Verification**:
   - Xcode build compiles cleanly in Release configuration with `DEBUG_INFORMATION_FORMAT = dwarf-with-dsym`.
   - `upload-crashlytics-symbols.sh` extracts and verifies dSYM archives for crash symbolication.
2. **Physical Sensor Acceptance**:
   - Camera: Plane detection locks surface within 3 seconds of sweeping ground.
   - GPS: Note placement clamps within 12 metres of actual user location.
   - Relocalization: Aim-guided arrow guides user accurately toward distant posts.
3. **Crash Telemetry**:
   - Crash reporting active via Firebase Crashlytics.
   - Target crash-free session rate: **≥ 99.5%** during TestFlight period.

---

## 4. Current TestFlight Readiness Status

- **Archive State**: Build targets iOS 17.0+, iOS 27.1 SDK. Clean compile verified.
- **Entitlements**: `LociAR.Release.entitlements` targets production APNs and production App Attest.
- **Sign-off**: **READY FOR TESTFLIGHT ARCHIVE UPLOAD** upon authorized Team signing.
