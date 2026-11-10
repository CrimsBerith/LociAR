# LociAR iOS Design System

## Source of truth

`LociAR/DesignSystem/LociTheme.swift` is the native SwiftUI token source. `LociTheme.Palette`
defines semantic light and dark colors, and `LociAppearancePreference` maps the persisted
System/Light/Dark choice to the app-wide color scheme. Screens should use semantic tokens rather
than define one-off colors or duplicate layout values.

The palette resolves from UIKit traits, including increased-contrast traits. The dark palette keeps
LociAR's midnight and mint identity; the light palette uses high-contrast ink and quiet cool-gray
surfaces. The app follows iOS appearance by default. Camera, image, and AR content overlays use
explicit media-overlay tokens because their contrast must remain stable over changing imagery.
Heat-map density and geographic pin colors are data-visualization roles, not surface colors.

## Semantic color roles

- **Surfaces:** `background`, `surface`, `elevated`, `rowSurface`, `field`,
  `authSurface`, `authField`, `profileSurface`, `arSearchSurface`.
- **Content:** `textPrimary`, `secondaryText`, `tertiaryText`, `arSearchInk`.
- **Actions and states:** `accent` / `onAccent`, `success`, `warning`, `danger` / `onDanger`,
  `social`, `discoveryAccent`, `identityAccent`, `focus`.
- **Structure and depth:** `hairline`, `glassBorder`, `divider`, `scrim`, `glassTint`.
- **Map and media:** `mapAR`, `mapLocation`, `mediaOverlayText`, `mediaOverlayScrim`.

Color is never the sole indicator of success, warning, error, selection, or note type. Text and
meaningful control boundaries target WCAG contrast ratios: 4.5:1 for normal text and 3:1 for
large text and meaningful UI boundaries. The palette test measures these targets for both schemes.

## Typography

`LociTheme.Typography` names the display, title, headline, body, emphasized body, callout, label,
caption, and numeric roles. Text styles use system fonts and scale with Dynamic Type. Use SF Symbols
for interface iconography; fixed point sizes are reserved for decorative or media-overlay symbols.
Use monospaced digits for changing counts. Do not constrain text to fixed heights or shrink critical
labels to fit.

## Spacing, controls, and layout

- Spacing tokens: 2, 4, 8, 12, 16, 20, 24, 32, and 40 pt.
- Corner radii: 12, 16, 20, and 24 pt; use pill geometry only for short tags and transient status.
- Interactive targets are at least 44 × 44 pt. Primary and secondary buttons have minimum heights
  of 50 and 46 pt; content can grow when text scales.
- Use consistent 16 pt card insets, 12 pt row/inline gaps, and 24 pt section separation.
- Keep content scrollable and content-sized. Use the readable-width token for centered empty-state
  content; do not make a fixed grid width a prerequisite for localization or large text.
- Prefer one clear primary action per task. Pressed, disabled, selected, warning, and error states
  remain distinguishable without relying on color alone.

## Surfaces, borders, and shadows

- Solid semantic surfaces are used for long-form reading, forms, and Reduce Transparency.
- Glass is reserved for floating/map/camera chrome and brief overlays; it is not the default
  background for long text.
- Use shared border and depth tokens instead of one-off strokes or shadows. Avoid nested cards and
  decorative borders that do not clarify hierarchy or hit targets.
- `accessibilityReduceTransparency` selects opaque surfaces. `accessibilityReduceMotion` suppresses
  nonessential press and transition animation.

## Validation

`LaunchReadabilityTests` checks both palettes' text, action, error, and boundary contrast. UI tests
verify that the appearance picker exposes System, Light, and Dark. Before release, inspect all
primary flows in both appearances and at default, large, and accessibility text sizes; include
VoiceOver, Reduce Motion, and Reduce Transparency checks as described in `ACCESSIBILITY.md`.
