# LociAR app quality bar (research-backed)

Sources: Apple HIG (clarity / feedback / forgiveness), App Store performance completeness, ARKit plane-placement guidance, Stories-style editor patterns.

## Principles

1. **Outcomes must be honest** — never claim “wall plane locked” when placement is approximate or sensor-only.
2. **Primary actions leave durable state** — drag, pin, and publish must commit without snap-back or silent loss.
3. **Sessions must survive the flow** — AR world tracking stays alive from pin through compose/publish when native is available.
4. **Errors are recoverable** — soft banners, retry, offline save without pretending failure.
5. **Permissions are JIT** — explain benefit, offer Settings when denied forever.
6. **Feedback is immediate** — haptics/status for pin, select, delete; no empty silent taps.
7. **Copy matches product language** — mockup EN for create chrome; avoid mixed TR/EN half-states.
8. **Reference media is real** — no pseudo `native-ar-reference://` as the only publish asset when capture is possible.
9. **Low drift + multi-perspective** — native world-locked content stays at the real place; camera facing that place from front/left/right must still show it (unlock by proximity, not create-heading). Do not slide RN overlays by compass when ARKit owns the surface.

## Create flow checklist

| Step | Pass criteria |
|------|----------------|
| Pin | Tracking badge visible; pin works on wall / floor / table / any surface; plane vs approximate vs sensor clearly labeled |
| Content | Text/image spawn centered & staggered; tools match mode |
| Place | Drag commits absolute position; no return to spawn |
| Publish | Offline → local post success; validation uses wall text as caption fallback |

## Regression tests (manual)

1. Pin on textured wall after 2s scan → “Surface locked” or “Approximate lock”, not only GPS fallback.
2. Add text → appears mid-viewport → drag → release → stays.
3. Airplane mode publish → “Saved offline”, post appears on map/profile locally.
4. Kill app mid-create → re-enter create with clean state when mode changes.
