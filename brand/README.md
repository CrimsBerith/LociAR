# LociAR — Nocturnal brand

The mark combines a location pin with an open surface bracket. The bracket conveys a
note attached to a real place, and the circular aperture preserves a clear silhouette
at small sizes. It was selected from the four concepts in `concepts/icon-concepts.png`
(upper left). The three alternatives were a framing reticle, a folded surface and a
proximity ring. The selected production mark is vector geometry with flat mint fill.

## Files

| File | Purpose |
| --- | --- |
| `logomark.svg`, `logomark.png` | Standalone mint symbol; PNG 1024 × 1024, transparent |
| `wordmark-light.svg`, `wordmark-light.png` | Pale lettering for dark surfaces; transparent, PNG height 256 |
| `wordmark-dark.svg`, `wordmark-dark.png` | Dark lettering for light surfaces; transparent, PNG height 256 |
| `concepts/icon-concepts.png` | Four original concept previews for the PR |
| `concepts/icon-small-sizes.png` | Selected icon at 29, 60 and 120 pixels on the night surface |
| `concepts/onboarding-preview.png` | Pin, discovery and proximity/privacy illustrations |
| `concepts/empty-state-preview.png` | Eight empty/error illustrations, in the task's order |
| `concepts/background-series-preview.png` | The five screenshot background panels as a series |
| `build_brand.py` | Reproducible SVG, raster, app-icon and favicon export |
| `validate_assets.py` | Pixel/mode, transparency, grayscale, ICO, social-image and Xcode manifest validation |

Wordmark lettering is outlined DejaVu Sans (see `FONT_LICENSE.txt`) rather than live
SVG text, so its shape does not depend on fonts installed on the viewer's machine.

## Palette and usage

- Background: `#060912`; surface: `#11161F`; raised surface: `#18202D`.
- Screenshot gradient: `#08101A` → `#050814`.
- Accent: `#38E0B8`. Text over mint uses black. Secondary white uses 74% opacity.
- Minimum standalone mark canvas: 29 × 29 pixels; minimum wordmark height: 32 pixels.
- Maintain at least one circular-aperture diameter of clear space around the visible mark.
- Preserve the aspect ratio and geometry. Avoid adding a cross, guide grid or rounded
  corner mask to the app icon; iOS supplies its own mask.
- Light and dark wordmarks describe the lettering color, not the background color.

App icon exports live in `LociAR/Resources/Assets.xcassets/AppIcon.appiconset/`:
the default icon is an opaque square RGB PNG; Dark is pale on transparent, and
Tinted is neutral grayscale on transparent. Web exports are in `admin/app/`;
Apple touch icon is opaque and favicon contains 16/32/48 pixel images.

## Art direction and integration

Illustrations were generated with the image tool from the same palette and calm,
rounded geometry. They contain no text, service logos or simulated app interface.
PNG exports only normalize canvas dimensions, density and color modes; original
generation files remain in the working environment. Swift and admin metadata wiring
is reserved for Claude. LociAR has no social media integrations (removed 9 Oct 2026);
the admin site ships only the generic Open Graph image.

All three onboarding assets use 400/800/1200 pixel transparent canvases. The eight
empty/error assets use 240/480/720 pixel transparent canvases. The social image is
1200 × 630 and the five background panels are 1320 × 2868. Real app screenshots and
localized headlines must be composited separately by the release owner.

To regenerate the vector-derived exports with Python 3:

```sh
python3 -m pip install cairosvg fonttools pillow
python3 brand/build_brand.py
python3 brand/validate_assets.py
```

Set `LOCIAR_BRAND_FONT` to the local DejaVu Sans TTF if the default Linux font path
is unavailable. Changing the font changes the approved wordmark outlines.
