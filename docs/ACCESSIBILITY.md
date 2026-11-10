# LociAR Accessibility Acceptance

## Visual access

- The app follows the system appearance by default and offers System, Light, and Dark choices.
- Normal text targets at least 4.5:1 contrast; large text and meaningful control boundaries target
  at least 3:1. Contrast is checked for semantic light and dark palettes.
- Important status is conveyed with text and/or a symbol, never color alone.
- Dynamic Type works from the default size through the largest accessibility sizes. Critical text,
  button labels, permission guidance, and recovery actions are not clipped or scaled down to fit.
- Layout may grow vertically or wrap at large text sizes; controls keep a minimum 44 pt hit target.

## Screen reader

- Harita, Keşfet, AR, Profil, and Oluştur primary tasks can be completed with VoiceOver.
- Icon-only controls have localized labels and useful state/value announcements.
- Selected chips, tabs, note types, and toggles expose selected state.
- AR status changes are announced politely; urgent failures and permission blocks are announced
  with appropriate priority.
- A gesture is never the only way to complete a task.

## Motion and transparency

- Reduce Motion removes or limits nonessential animation and large decorative transforms.
- Reduce Transparency replaces glass with opaque semantic surfaces.
- Haptics supplement but never replace visual or text feedback.

## Physical context

- Check map and camera overlays in bright outdoor conditions and over varied camera imagery.
- AR safety and recovery guidance remains readable and reachable while the device is in use.
- Lower-screen actions remain reachable with one hand and clear of native tab and sheet controls.

## Release evidence

For each release, record device/OS, appearance, text size, VoiceOver and accessibility settings,
result, and screen recording in `QA_MATRIX.md`. Exercise representative screens in both color
schemes and at default, large, and accessibility text sizes.
