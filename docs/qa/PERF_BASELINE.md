# Device performance baseline

Device: iPhone 14 Pro Max, iOS 27.0.1. Build: Release, commit `ebd8cca`, live backend, signed-in account.
Measured 16 Nov 2026 with `testPerf01`–`testPerf06` (`LociARUITests/AuthGatePhysicalDeviceUITests.swift`).
Numbers: `docs/qa/perf/baseline.json` (means of 5 iterations; 3 for AR).

| Test | Metric | Baseline | Target |
|---|---|---|---|
| Cold launch | first frame, responsive | 0.433 s | < 0.40 s |
| Discover scroll | hitch time ratio | 1.0 ms/s | < 5 ms/s |
| Discover scroll | frame rate | 83 fps | — |
| Open a post | hitch time ratio | 33 ms/s | < 5 ms/s (open) |
| Open a post | frame rate | 88 fps | — |
| Tab switch (3 tabs) | memory | 236 MB | — |
| Map pan/zoom | memory / peak | 268 / 291 MB | — |
| AR open | memory / peak | 432 / 448 MB | — |

Before `ebd8cca` (glass on every card): Discover scroll 732 ms/s at 18 fps; open post 546 ms/s at 24 fps.

## Release check
1. Connect the iPhone (unlocked; Settings > Developer > Enable UI Automation).
2. `build/claude-run/a-perf-run.command` (Release build, ~15 min).
3. `python3 scripts/perf-compare.py` — fails when a metric is more than 10 % worse than the baseline
   (hitch ratios under 5 ms/s always pass). Update `baseline.json` only after a deliberate improvement.
