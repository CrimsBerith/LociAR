> **ARŞİV (28 Eylül 2026):** Bu belge Supabase dönemine aittir. Backend artık Firebase — güncel kaynaklar: `AGENTS.md`, `docs/FIREBASE_SETUP.md`, `ARCHITECTURE.md`.

# LociAR External Research: AR + Social Media Code Analysis for Quality Improvements

**Date:** 2026-07-09  
**Purpose:** Living document maintained by Research Analyst agent. Agents must re-scan before major AR/gesture/social/discovery work and append dated updates.

## Methodology (Required for All Research)

1. Use `web_search` + `open_page` / `open_page_with_find` on GitHub, docs, tutorials, clone repos.
2. Focus queries on plane detection, hitTest, surface anchors, video textures, gestures for content (simultaneous pan/pinch/rotate), vertical feeds/pagers, camera+effects, realtime social, perf (Skia), architecture.
3. Filter: Expo-compatible or clear dev-build path; free/open; matches billboard AR + live edit + social posts + physical presence.
4. Output format per idea:
   - **Idea**
   - **Source** (links + specific files/examples)
   - **Quality Benefit** (how it increases robustness/UX/realism/perf/maintainability for LociAR)
   - **Integration Notes** (LociAR files + sketch)
   - **Code Pattern** (snippet)
   - **Effort / Risk**

5. Always record queries performed and date.

## Current Prioritized Findings (High Impact First)

### AR Codebases

**1. ViroARPlane + ViroARPlaneSelector (surface snapping + placement)**
- Source: https://github.com/ReactVision/viro , https://www.reactvision.xyz/expo-ar/ , viro-community docs (ViroARPlaneSelector)
- Quality Benefit: Real horizontal/vertical plane detection + user tap-to-place. Replaces flaky pure sensor pose. Makes AR "stick to wall/billboard" feel real and precise. Huge UX win for exact angle requirement. Reduces custom alignment bugs.
- Integration: Phase 3 native dev build (cannot run in Expo Go). Keep current sensor fallback. Use ViroARScene + forward anchor events to selector via ref (newer architecture). Replace/custom augment ARCamera + anchorManager.
- Code Pattern:
  ```tsx
  <ViroARScene anchorDetectionTypes={["PlanesHorizontal","PlanesVertical"]}
    onAnchorFound={a => selectorRef.current?.handleAnchorFound(a)} ...>
    <ViroARPlaneSelector ref={selectorRef} alignment="Both" onPlaneSelected={(anchor, tapPos) => { placeContent(anchor, tapPos); }}>
      <ViroImage source={{ uri: layer.uri }} ... />
      {/* or ViroVideo for embedded */}
    </ViroARPlaneSelector>
  </ViroARScene>
  ```
- Effort: Medium-High. Requires EAS dev build + native AR.

**2. ViroVideo as plane texture (true embedded playback)**
- Source: Viro docs/examples + expo-ar page.
- Quality Benefit: Video plays as texture on detected plane while real camera passthrough stays active underneath. Exactly the "video on wall with camera live" vision. Native perf + correct 3D perspective vs current WebView overlay.
- Integration: When on Viro, map contentSource video + edit layers to ViroVideo / ViroImage inside the selected plane.
- Effort: Medium (once Viro adopted).

**3. react-native-arkit hitTestPlanes + planeDetection**
- Source: https://github.com/react-native-ar/react-native-arkit (note: iOS only, not actively maintained — prefer Viro for cross-platform).
- Quality Benefit: Direct ARKit plane detection + precise hitTest for placement (even without full plane viz). Improves accuracy for "place exactly on this billboard".
- Integration: Enhance anchorManager.createAnchor + pose logic for iOS native path. Use hitTest results to populate SurfaceAnchor.
- Effort: Low for research spike; higher for production (iOS-only initially).

**4. Image/Object tracking (ViroARImageMarker / ARKit detectionImages)**
- Source: Viro docs + ARKit samples.
- Quality Benefit: Detect specific printed images/posters on billboards as anchors. More robust lock than GPS+heading alone. Bonus anti-spoof.
- Integration: Add optional image target capture at creation time. Store reference image targets.

### Social / Gestures / Feed Codebases

**5. Simultaneous Pan + Pinch + Rotation (IG Stories sticker UX)**
- Source: birdwingo/react-native-instagram-stories, William Candillon "Can it be done" series, many clones using gesture-handler + reanimated.
- Quality Benefit: Butter-smooth 60fps multi-touch manipulation of text/images/posts. Current LociAR Create already has a good implementation (Gesture.Simultaneous + shared values + stable commit).
- Improvements to apply:
  - More stable gesture memoization.
  - Double-tap to edit text.
  - Bounds clamping / snap guides.
  - Better small-layer hit areas.
  - Haptics on gesture start/finalize.
- Integration: Polish `src/screens/CreateTagScreen.tsx` transformGesture block + add Tap gesture for double-tap.
- Code Pattern (simplified):
  ```ts
  const pan = Gesture.Pan().onChange(...).onFinalize(runOnJS(commit));
  const pinch = Gesture.Pinch()...
  const rotate = Gesture.Rotation()...
  return Gesture.Simultaneous(pan, pinch, rotate);
  ```

**6. Vertical pager / infinite feed (TikTok-style discovery)**
- Source: https://github.com/TheWidlarzGroup/react-native-video-feed , https://github.com/kirkwat/tiktok , notJust.dev TikTok tutorials.
- Quality Benefit: Highly engaging "scroll through nearby/top AR posts" experience (like TikTok). Complements map (which shows everything sorted by engagement). Increases retention and time spent.
- Integration: Add Feed tab or mode. Use FlatList/PageView with snap, virtualization, preloading. Preview = EditComposition thumbnail + unlock CTA. Sort by post.counts (likes+comments+views).
- Effort: Medium (new screen + navigation).

**7. Optimistic updates + realtime + camera+effects**
- Source: Multiple social clones (Zustand + Supabase realtime, expo-camera + reanimated overlays).
- Quality Benefit: Snappy social feel. Better editing feedback.
- Integration: Strengthen existing store pendingSync + add Supabase realtime subscriptions for likes/comments. Enhance Create with live filters (future Skia).

**8. Skia for drawing + filters**
- Source: IG filter tutorials + social clones using @shopify/react-native-skia.
- Quality Benefit: High-perf custom drawing (better than current View-based strokes). Real-time filters on gallery images before AR placement. Professional editing quality.
- Integration: Replace stroke rendering in EditComposition/Create with Skia Canvas. Add filter controls on image layers.

## Actionable Roadmap (from Research)

P0 (biggest quality): Plan Viro (or native AR) for plane + embedded video (Phase 3).
P1: Polish gestures (double-tap, stability, haptics) + add vertical feed.
P2: Image targets + hitTest in anchor logic.
P3: Skia drawing/filters.
Ongoing: Realtime social + clean architecture from clones.

## Query Log (Append New Scans Here)

- 2026-07-30: iOS launch-readiness UI test scan. Sources checked: Expo SDK 54 Camera docs, React Native Keyboard/KeyboardAvoidingView docs, React Native Gesture Handler pinch focal-point docs, and Maestro iOS/tapOn/takeScreenshot docs. Findings applied to the implementation plan: keep only one active `CameraView` per focused camera surface; expose stable `testID` hooks for black-box Maestro flows; use `Keyboard.dismiss()` on submit/scroll/step transitions; capture screenshots per critical route; and keep Pin Surface recovery visible as UI state so blank/featureless visual-surface failures are not silent. Maestro is the preferred E2E layer because it drives the installed iOS app through the accessibility/rendered UI instead of source internals.

- 2026-07-29: iOS AR fallback scan. Apple Vision `VNTrackObjectRequest` can track a previously detected object/rectangle across video frames, making a reference-image or QR/AprilTag surface mode feasible without an ARKit world map. Apple Vision rectangle/barcode detection supplies the initial target. Google ARCore Geospatial is available on iOS, but it adds a Google Cloud project/API, coverage check, location permission, and its own native AR session; it is a VPS alternative, not a zero-dependency fallback. Recommendation: make `reference_image` the non-ARKit default for v1 (capture textured poster/wall + GPS metadata, then track that reference while the camera is open); offer QR/AprilTag anchors for guaranteed placement. Keep ARKit plane/raycast as an optional same-session precision enhancement, and reserve VPS for a separately approved paid/cloud phase. Sources: Apple Vision object/rectangle tracking and detection docs; Google ARCore iOS Geospatial documentation.

- 2026-07-09: ViroReact plane selector + video (github + expo-ar site)
- 2026-07-09: react-native-arkit hitTest
- 2026-07-09: IG stories gesture clones (birdwingo + tutorials)
- 2026-07-09: TikTok vertical feed RN clones
- 2026-07-09: Re-scan by Codex before repo repair. Sources checked: ReactVision ViroReact + Expo AR, ViroARPlaneSelector docs, Apple ARPlaneAnchor/hitTest docs, React Native Gesture Handler pinch focal-point docs, The Widlarz Group/Mux TikTok-style feed references. Findings still support current direction: keep sensor fallback, prepare Anchor Manager for Viro/ARKit/ARCore planes, keep FlashList feed lightweight, and avoid native AR package activation until EAS/native build decision.
- 2026-07-17: Re-scanned Expo SDK 54 Camera, Location, and ImagePicker docs; Apple ARKit raycast/anchor guidance; ReactVision Viro planes/video; Gesture Handler focal-point gestures; and FlashList. Actionable result: keep the iOS product layer Expo Go-safe (CameraView, foreground location, ImagePicker config), maintain the native-anchor boundary behind `anchorManager`, and use a virtualized discovery list instead of custom scroll paging.

**Next Research Triggers:** Before any AR refactor, gesture changes, or new discovery UI.

## Design ve Kullanım (UX) Odaklı Ek İyileştirmeler (Kullanıcı Sorgusu için)

Aşağıdakiler özellikle **design** (görsel estetik, animasyon, premium his) ve **kullanım** (kolaylık, akıcılık, feedback, keşif) açısından LociAR'ı iyileştirecek fikirlerdir. Dış taramalardan (IG Stories, TikTok, ViroReact, ARKit örnekleri) ve codebase analizinden derlenmiştir.

### Design İyileştirmeleri
1. **Premium mikro-interaksiyonlar ve spring animasyonlar**  
   Her buton, layer seçimi, transform ve unlock'ta `withSpring` + haptics. IG ve TikTok klonlarında çok güçlü "delight" yaratıyor.  
   Mevcut tema.ts'i genişlet, theme constants'a spring configs ekle.

2. **Layer seçimi için görsel hiyerarşi ve feedback**  
   Seçili layer'a daha güçlü glow, shadow, hafif scale-up, border. IG sticker'larda olduğu gibi "canlı" his.  
   EditComposition + CreateTagScreen selected styles'larını zenginleştir.

3. **Unlock kutlamalarında particle + ışık efektleri**  
   ViroReact'in particle sistemi + AR unlock örnekleri. Confetti, spark, hafif glow.  
   ARCameraScreen'da Skia veya reanimated ile basit particle ekle.

4. **Editörde net ve enerjik mod göstergeleri**  
   Pen vs Transform modu için büyük ikon + renk değişimi + alt çizgi. Araç çubuğunu daha modern ve tablet-like yap.

5. **AR'da "embedded" gerçekçilik (gölge + perspektif)**  
   Layer'lara basit gölge (transform + opacity) ve hafif perspective distortion ekle. Gerçek duvara yapışık gibi dursun.

### Kullanım (UX) İyileştirmeleri
1. **Double-tap ile hızlı text düzenleme**  
   IG Stories'in en sevilen özelliği. Seçili text layer'a double tap → klavye aç, direkt edit.  
   Gesture'a Tap ekle.

2. **Snap guides + bounds clamping**  
   Layer'ları sürüklerken kenarlara yapışma + ekran dışına çıkmama. Kullanıcıyı "doğru" pozisyona yönlendirir.

3. **Her aksiyonda tutarlı haptics**  
   Layer seç, transform başla/bitir, publish, unlock, like → hafif titreşim. Kullanımı çok daha keyifli ve "gerçek" hissettirir.

4. **Dikey feed'de daha iyi preview + CTA**  
   Her kartta küçük AR preview + "AR'da aç" butonu net. Engagement sayıları büyük ve tıklanabilir.

5. **Layer yönetimi kolaylıkları**  
   - Long-press ile hızlı silme bölgesi  
   - Drag-to-reorder (zIndex)  
   - Hide/Show toggle görseli  
   Mevcut toolbar'ı genişlet.

6. **İlk kullanım için AR rehberi**  
   Create ve AR Camera'da adım adım hafif overlay'ler ("Parmağınla sürükle", "Pinch ile büyüt").  
   Onboarding akışını iyileştir.

7. **Image layer'lara anında filtreler**  
   Galeri görseli eklerken temel filtreler (brightness, contrast, IG-like presets) uygula. Skia ile çok kolay.

8. **Gesture sırasında anlık görsel ipuçları**  
   Sürüklerken hafif "ghost" outline veya scale göstergesi. Kullanıcı ne yaptığını anında görsün.

### Birleştirilmiş (Design + Kullanım) Yüksek Etkili Öneriler
- **Focal point gesture'leri + görsel feedback** (zaten kısmen yapıldı) → Pinch/rotate sırasında parmak noktasını vurgula.
- **Vertical feed + map hibrit** → Keşif hem eğlenceli hem kullanışlı olsun.
- **Physics-like placement** (spring) → Tasarımda doğal, kullanımda sezgisel.
- **Skia ile zenginleştirilmiş drawing + filtre** → Hem daha güzel görünür hem yaratıcılığı artırır.

Bu maddeler doğrudan "kullanıcı deneyimini keyifli, premium ve sorunsuz" hale getirir. Çoğu düşük eforlu (mevcut reanimated + Skia altyapısıyla).

Öncelik önerisi: 1, 2, 3, 7, 8 numaralılar hemen etki yaratır.

---

## 2026-08-09 — Public Profile Preview and Media Playback Scan

- Expo SDK 54 remains React Native 0.81 / React 19.1; the existing React Navigation 7 setup can pass JSON-serializable `postId`, creator identity, and optional post data as route params. Hidden full-screen tab routes are retained for this app shell.
- React Navigation 7 does not implicitly target nested child screens. The new profile and preview destinations are explicit sibling routes, avoiding ambiguous nested navigation.
- Apple ARKit documentation keeps AR presentation coupled to the live camera/session and physical anchors. Product implication: remote profile viewing must be a separate 2D preview; “View in AR” remains an explicit location/camera action.
- TikTok's official Embed Player uses `/player/v1/{post_id}` and a `postMessage` control protocol. Platform/runtime restrictions can still reject an embed, so LociAR preserves a visible “open original” fallback.
- Uploaded first-party video now uses a controllable inline HTML5 `<video>` element. YouTube remains an iframe/API embed, Spotify uses its official embed URL, and Instagram/Facebook/X/other links degrade to thumbnail/title plus external open instead of a broken blank surface.

Implementation consequence: public profile queries are location-independent but return only `active + public + non-18+` posts and honor blocks. Preview rendering supports surface texture, drawing/text/image layers, image media, uploaded video, YouTube, Spotify, and restricted-platform fallback links.

## Design ve Kullanım (UX) Odaklı Ek İyileştirmeler (Kullanıcı Sorgusu için)

Aşağıdakiler özellikle **design** (görsel estetik, animasyon, premium his) ve **kullanım** (kolaylık, akıcılık, feedback, keşif) açısından LociAR'ı iyileştirecek fikirlerdir. Dış taramalardan (IG Stories, TikTok, ViroReact, ARKit örnekleri) ve codebase analizinden derlenmiştir.

### Design İyileştirmeleri
1. **Premium mikro-interaksiyonlar ve spring animasyonlar**  
   Her buton, layer seçimi, transform ve unlock'ta `withSpring` + haptics. IG ve TikTok klonlarında çok güçlü "delight" yaratıyor.  
   Mevcut tema.ts'i genişlet, theme constants'a spring configs ekle.

2. **Layer seçimi için görsel hiyerarşi ve feedback**  
   Seçili layer'a daha güçlü glow, shadow, hafif scale-up, border. IG sticker'larda olduğu gibi "canlı" his.  
   EditComposition + CreateTagScreen selected styles'larını zenginleştir.

3. **Unlock kutlamalarında particle + ışık efektleri**  
   ViroReact'in particle sistemi + AR unlock örnekleri. Confetti, spark, hafif glow.  
   ARCameraScreen'da Skia veya reanimated ile basit particle ekle.

4. **Editörde net ve enerjik mod göstergeleri**  
   Pen vs Transform modu için büyük ikon + renk değişimi + alt çizgi. Araç çubuğunu daha modern ve tablet-like yap.

5. **AR'da "embedded" gerçekçilik (gölge + perspektif)**  
   Layer'lara basit gölge (transform + opacity) ve hafif perspective distortion ekle. Gerçek duvara yapışık gibi dursun.

### Kullanım (UX) İyileştirmeleri
1. **Double-tap ile hızlı text düzenleme**  
   IG Stories'in en sevilen özelliği. Seçili text layer'a double tap → klavye aç, direkt edit.  
   Gesture'a Tap ekle.

2. **Snap guides + bounds clamping**  
   Layer'ları sürüklerken kenarlara yapışma + ekran dışına çıkmama. Kullanıcıyı "doğru" pozisyona yönlendirir.

3. **Her aksiyonda tutarlı haptics**  
   Layer seç, transform başla/bitir, publish, unlock, like → hafif titreşim. Kullanımı çok daha keyifli ve "gerçek" hissettirir.

4. **Dikey feed'de daha iyi preview + CTA**  
   Her kartta küçük AR preview + "AR'da aç" butonu net. Engagement sayıları büyük ve tıklanabilir.

5. **Layer yönetimi kolaylıkları**  
   - Long-press ile hızlı silme bölgesi  
   - Drag-to-reorder (zIndex)  
   - Hide/Show toggle görseli  
   Mevcut toolbar'ı genişlet.

6. **İlk kullanım için AR rehberi**  
   Create ve AR Camera'da adım adım hafif overlay'ler ("Parmağınla sürükle", "Pinch ile büyüt").  
   Onboarding akışını iyileştir.

7. **Image layer'lara anında filtreler**  
   Galeri görseli eklerken temel filtreler (brightness, contrast, IG-like presets) uygula. Skia ile çok kolay.

8. **Gesture sırasında anlık görsel ipuçları**  
   Sürüklerken hafif "ghost" outline veya scale göstergesi. Kullanıcı ne yaptığını anında görsün.

### Birleştirilmiş (Design + Kullanım) Yüksek Etkili Öneriler
- **Focal point gesture'leri + görsel feedback** (zaten kısmen yapıldı) → Pinch/rotate sırasında parmak noktasını vurgula.
- **Vertical feed + map hibrit** → Keşif hem eğlenceli hem kullanışlı olsun.
- **Physics-like placement** (spring) → Tasarımda doğal, kullanımda sezgisel.
- **Skia ile zenginleştirilmiş drawing + filtre** → Hem daha güzel görünür hem yaratıcılığı artırır.

Bu maddeler doğrudan "kullanıcı deneyimini keyifli, premium ve sorunsuz" hale getirir. Çoğu düşük eforlu (mevcut reanimated + Skia altyapısıyla).

Öncelik önerisi: 1, 2, 3, 7, 8 numaralılar hemen etki yaratır.

---

## Detailed Codebase-Specific Opportunities (from internal explore subagent, 2026-07-08)

This section integrates direct code analysis of LociAR with external patterns from ViroReact, ARKit, IG Stories clones, TikTok feeds.

**Current Limitations vs Ideal (Summary Table)**

| Area                  | Current Limitation                                      | Ideal (Viro/ARKit + IG/TikTok)                          | Key Files to Touch |
|-----------------------|---------------------------------------------------------|---------------------------------------------------------|--------------------|
| Surface locking      | Heuristic GPS/heading/alt 2D overlay projection        | Real hitTest/raycast → ARAnchor + plane parenting      | anchorManager, ARCameraScreen, usePose, types |
| Gestures (stickers)  | Hybrid PanResponder+Gesture; no focal math; duplication | Pure Simultaneous + focal adjustment + per-sticker SVs | CreateTagScreen, EditComposition |
| Drawing perf         | N rotated Views per stroke                             | Skia Path or batched geometry                          | EditComposition, CreateTagScreen |
| Discovery            | Maps + static markers                                  | FlashList vertical paging + viewability + preloads     | MapScreen (+ new Feed) |
| Pose/AR session      | 1.5s polling + loose coupling                          | ARSession + onFrame + planes + unified hook            | usePose → useARSession, anchorManager |
| Render/AR content    | Static 2D layers + WebView overlay                     | Textured 3D plane (Viro node or ARKit SCNNode)         | ARCameraScreen + future AR view |
| Data/Store           | Full posts in memory, basic queue                      | Metadata-only + lazy layers; optimistic + selectors    | appStore, postService |
| Anchors              | expo_go_estimate only; stubs for native                | Real arkit_world from hitTest; onAnchor* lifecycle     | anchorManager.ts (contract) |

**High-Impact Quick Wins (Low Risk, High Quality Gain)**

1. **Focal-point math + unified gestures in CreateTagScreen**
   - Current: `transformGesture` (lines ~209-260) lacks focal adjustment → translation jumps on off-center pinch/rotate.
   - Add `.onStart` to capture focal point. Adjust tx/ty during scale/rotate using `(focalX - layerCenterX) * (1 - scaleDelta)` etc.
   - Drop or conditionalize PanResponder for drawing (pure Gesture.Pan).
   - File: `src/screens/CreateTagScreen.tsx`
   - Benefit: True "Instagram sticker" feel, fewer user frustrations.

2. **Refactor pose into unified AR session**
   - Merge `usePose.ts` + `anchorManager` into `useARSession` hook exposing planes, hitTest stub, tracking state.
   - File: `src/hooks/usePose.ts`, `src/services/ar/anchorManager.ts`, `src/screens/ARCameraScreen.tsx`
   - Benefit: Prepares for Viro/ARKit planes/hitTest. Better for Create tap-to-place.

3. **Skia for drawings + memoized layers**
   - Replace `renderDrawing` (many `<View>` strokes) with Skia `<Path>`.
   - `React.memo` + better keys in EditComposition.
   - Files: `src/components/EditComposition.tsx`, CreateTagScreen drawing logic.
   - Benefit: Massive perf for complex drawings; matches pro social editors.

4. **Vertical feed / pager discovery**
   - Add engagement-sorted vertical list (FlashList or FlatList with snap) in MapScreen or new tab.
   - Preview using EditComposition thumbnails.
   - Benefit: TikTok-like browsing of AR content; complements map.

**Concrete Code Suggestions (from analysis)**

- CreateTagScreen gesture: Enhance onChange for pinch/rotate with focal math. Example addition in pinch:
  ```ts
  .onStart((e) => { 'worklet'; /* capture focalX = e.focalX, etc. */ })
  .onChange((event) => {
    'worklet';
    const s = baseScale.current * event.scale;
    // adjust translate for focal
    const dx = (focalX - (baseX.current + tx.value)) * (s / scaleSv.value - 1);
    ...
  })
  ```
- anchorManager: Add `hitTest(screenPoint)` and plane event emitter.
- Store: Add selectors for active posts; separate layer updates.
- ARCamera: When real anchor, use world transform projection instead of pure heading heuristic.

**Additional Opportunities**
- Extract `useLayerGestures` hook returning per-layer gesture + animated style.
- In AR view: support vertical swipe between top engagement posts (when multiple at spot).
- For embedded video: prepare for native texture (ViroVideo or ARKit video node) while keeping WebView fallback.
- Error recovery: reset shared values on gesture errors.

These were identified by direct inspection of current code + mapping to patterns from the external scans (Viro plane/anchor events, ARKit hitTest, IG simultaneous + focal gestures, TikTok vertical paging).

Append new subagent runs here with date.

## 2026-07-17 - Production AR and iOS Auth Follow-up

- ARKit placement should use an `ARRaycastQuery` against existing plane geometry, then attach an `ARAnchor` to the hit transform. Persisting only latitude/longitude is not a spatial anchor. A post remains eligible for public AR only after an operator has saved an `arkit_world` anchor and calibration metadata.
- `ARAnchor` is session-local by default. Cross-session and cross-device persistence need a second relocalization signal such as an `ARWorldMap`, reference image, visual-positioning service, or an on-site recalibration flow. LociAR will label this state honestly and keep uncalibrated campaign content out of public AR.
- Own uploaded MP4/HLS content can be rendered as an `AVPlayer` material on an AR plane. YouTube, TikTok, Instagram and similar platform links must stay as official embeds/deep links; do not extract a stream or claim texture-level world lock for them.
- Expo AuthSession supports the custom callback contract `lociar://auth/callback`; use Supabase redirect allow-list entries for that scheme. Apple/Google/email sessions must be restored from secure storage and the server, not represented by a local profile flag.
- App Review UGC flow needs in-app report, block, contact, moderation action, account deletion, and an operational response path. Owner operations use server-side role checks and audited Edge Functions; the service role is never bundled.


## 2026-07-17 - Premium AR Embedded Playback Implementation Scan

- Expo SDK 54 Camera docs confirm `CameraView` and `takePictureAsync({ skipProcessing: false })` remain the correct iOS-safe path for reference frames; keep camera capture orientation processing enabled.
- Expo SDK 54 Location docs confirm foreground `watchPositionAsync` and `watchHeadingAsync` subscriptions are the right lightweight AR fallback signal while native ARKit is behind a dev-build feature flag.
- Expo SDK 54 Video docs confirm `expo-video` supports hidden native controls via `nativeControls={false}`, but current implementation can avoid adding it because YouTube/TikTok embeds use WebView and owned AR video uses native `AVPlayer` texture.
- YouTube IFrame docs support `controls=0`, `playsinline=1`, and `enablejsapi=1`; LociAR should render the player chromeless on the wall and drive play/pause/seek from a React Native bottom media bar.
- TikTok Embed Player docs support query parameters such as `controls=0`, `progress_bar=0`, `play_button=0`, `timestamp=0`, and postMessage play/pause/seek/mute commands; treat this as best-effort because platform WebView behavior can still vary.
- Apple ARKit raycast docs confirm `ARRaycastQuery` + `ARSession.raycast(_:)` is still the correct native hit-test path for real surface placement; keep `LociarWorldLockModule` as the boundary for owned video texture and playback commands.

## 2026-07-19 - Native Surface Capture iOS + Android Implementation Scan

- Expo SDK 54 docs confirm SDK 54 targets Android compile/target SDK 36 and iOS 15.1+, so the local native module keeps SDK 54 compatibility and uses Expo Modules autolinking instead of bare native project edits.
- Expo Modules docs confirm local modules need `expo-module.config.json`; Android registration needs a fully qualified Kotlin module class, while Apple needs a podspec for autolinking to expose the Swift module. LociAR now has both Android and Apple registration for `lociar-world-lock`.
- Apple RealityKit/ARKit docs confirm `ARView`/anchor-based rendering is the long-term iOS direction; the current Swift SceneKit bridge remains a compatible native boundary and now returns the same provider/quality payload shape as Android.
- ARCore docs confirm hit-tests return pose information from planes/depth/feature points and anchors should be created from hit results to keep objects stable over time. LociAR Android now starts an optional ARCore session, checks device support at runtime, and exposes vertical/horizontal hit-test anchor creation through the same JS `nativeWorldLock.raycast` API.
- ARCore enablement docs recommend AR Optional for apps that should still open on unsupported devices. LociAR's Android manifest now uses `android.hardware.camera.ar` required=false and `com.google.ar.core` value `optional`, with unsupported devices reported through `unsupported` tracking state.
- ARCore Cloud Anchors/Geospatial remain later persistence upgrades. This pass implements local hit-test anchors and shared `AnchorBundle` persistence fields without claiming cross-device VPS-grade relocalization yet.

## 2026-07-20 - Deep Audit Implementation Scan

- Expo SDK 54 docs were rechecked before native/module/mobile changes. Current target remains SDK 54, React Native 0.81, React 19.1, and dev/internal native builds for custom modules.
- Expo Modules native view guidance confirms LociAR should mount `LociarWorldLockView` before calling module functions. This pass adds a React bridge component so native raycast is not called against an unavailable view.
- ARKit/RealityKit docs still support the long-term iOS target: `ARView` + raycast + `AnchorEntity` + `VideoMaterial`. The existing SceneKit bridge remains a compatibility layer, but should be migrated to RealityKit before App Store AR quality is called final.
- ARCore docs still confirm AR Optional is the right Android policy: app opens on unsupported devices, while ARCore availability gates world-lock capture. This pass keeps Android unsupported fallback explicit.
- ViroReact was rechecked as an alternative; it remains useful for reference patterns, but not adopted now because LociAR is pinned to Expo SDK 54 and already has a custom local module boundary. Unity/Lightship remain post-MVP advanced AR options.
- Platform video embeds remain best-effort. Own uploaded video is the only first-class target for true native wall playback; YouTube/TikTok/Instagram should use chromeless/bottom-controlled projections or poster/deep-link fallback when platform controls cannot be suppressed.
- Implementation outcome: native view mounting is now represented in mobile UI, production native world-lock flag is off by default, and placement quality/provider/resolver metadata is separated for moderation and future secure resolver access.

## 2026-07-20 - Android ARCore Render Loop + AR Render Policy

- Re-scanned ARCore camera-rendering patterns: the production direction is `GLSurfaceView` with an external OES camera texture, `Session.setCameraTextureName(...)`, and `Session.update()` from the render thread. LociAR Android now follows that minimum render-loop structure instead of calling `Session.update()` only during raycast.
- Android native texture playback remains separate. Owned video native texture is still iOS-only until Android receives ExoPlayer/SurfaceTexture or a textured-plane renderer.
- Added an app-level AR render policy so LociAR can distinguish true native wall video, native tracking with overlay preview, and Expo sensor fallback. This prevents the UI from overstating world-lock quality before native text/image/drawing renderers are complete.

## 2026-07-20 - Native Static Surface Content Pass

- Rechecked RealityKit texture/material direction for non-video AR content: a wall-locked post should be rendered as a physical plane attached to an AR anchor, not as a React Native camera overlay, whenever native support exists.
- iOS now exposes native surface-content commands for single text or image layers. Text is rasterized into a texture and image URLs are loaded into a RealityKit material before being attached to the anchor plane.
- Multi-layer and drawing posts are intentionally kept on the overlay/fallback path for now, because attaching only one native layer would misrepresent the saved composition. The next correctness step is a full composition snapshot texture so text/image/drawing stacks render as one wall-locked plane.
- Android ARCore tracking events are throttled to avoid emitting per-frame status updates into JS. Android remains on native tracking + overlay preview until textured-plane rendering is added.

## 2026-07-20 - Competitive AR World-Lock Research Pass

Sources reviewed:
- Apple ARKit `ARWorldTrackingConfiguration`, `ARRaycastQuery`, `ARWorldMap`, and `ARReferenceImage` docs.
- Google ARCore hit-test, anchors, Cloud Anchors, and Geospatial/VPS docs.
- Snap Lens Studio Device Tracking docs.
- Niantic Spatial/Lightship VPS and 8th Wall VPS docs.
- Unity AR Foundation anchor and persistent-anchor docs.

Findings:
- Strong AR apps do not treat GPS/heading as world lock. They use 6DOF native tracking, raycast/hit-test, anchors, and then optional relocalization signals.
- Snapchat-like effects distinguish rotation/surface/world tracking and fall back honestly when native AR is unavailable. LociAR should keep this exact honesty model: Expo sensor alignment is fallback, not world lock.
- ARKit world maps and reference images can help relocalize, but they are environment-dependent. Cross-session persistence should be represented as a resolver strategy, not a guaranteed permanent anchor.
- ARCore local anchors are stable only in their session. Cloud Anchors and Geospatial/VPS can create shared/persistent frames of reference, but they add quota, privacy, coverage, and operational complexity.
- VPS products such as Lightship/8th Wall rely on pre-scanned/mapped locations and map-relative 6DOF pose. This matches LociAR's future campaign/operator workflow better than immediate public self-serve persistence.
- Unity AR Foundation guidance matches our custom native direction: anchors are expensive, should be reused for nearby objects, and content should be parented to anchors rather than using anchors as decorative content prefabs.

Implementation outcome:
- Added a central AR world-lock quality gate in mobile code.
- Native AR rendering is now gated by eligibility, not just `placement_state`.
- Server-side `create_post` recalculates placement quality and can downgrade weak native claims to `recalibration_required`.
- `nearby_ar_posts` now requires native placement quality >= 0.72 before a post is AR-discovery eligible.

Next technical target:
- Build full composition texture capture for multi-layer text/image/drawing, then attach that single texture plane to ARKit/ARCore anchors.
- Add reference-image resolver assets after native frame capture is real, because reference-image quality is the next practical relocalization step before VPS.

## 2026-07-20 - Native AR Composition Texture Pass

- Follow-up to the competitive AR scan: Snap/Instagram-style editors should not be rendered as separate React overlays in the final AR view. The saved post needs a single rasterized surface texture that can be parented to a native anchor plane.
- Added `react-native-view-shot` through Expo SDK 54-compatible install to capture the exact editor composition into a PNG texture.
- LociAR now stores `surfaceTextureUri`, `surfaceTextureAssetPath`, and `surfaceTexturePublicUrl` on `EditData`. This lets the native AR renderer prefer the full composition texture before falling back to one-off text/image attachment.
- This is the correct bridge between the social editor model and ARKit/ARCore renderer model: the user creates many layers, but AR sees one wall material on one anchor.
- Remaining native quality work: Android needs textured-plane rendering, and iOS/Android should later generate the texture at a fixed high resolution independent of screen size for consistent physical sharpness.

## 2026-07-20 - Android Surface Texture Renderer Pass

- Follow-up to the ARCore renderer scan: Android now needs the same material-plane idea as iOS RealityKit. The saved composition texture should be drawn as a textured quad parented to an ARCore anchor, not as a React Native overlay.
- Added an OpenGL ES 2D texture renderer on top of the existing ARCore `GLSurfaceView` camera loop. It uses ARCore camera projection/view matrices plus each anchor pose to draw the post texture in world space.
- Android `attachImage` now accepts the stored `surfaceTexturePublicUrl`/local URI, decodes it off the GL thread, uploads it as a GL texture, and emits a surface-content-ready event after the texture is actually created.
- React Native keeps the overlay visible on Android until the native ready event arrives, preventing a blank wall during async texture loading.
- Remaining Android validation: actual Gradle/EAS build, camera UV/orientation checks, wall-plane alignment, and device performance under repeated texture attach/remove.

## 2026-07-22 - Premium Mobile UX Refresh Scan

- Expo SDK 54 Camera documentation was rechecked. Only one camera preview should be active; LociAR keeps `CameraView` active only while the AR route is focused and presents a user-triggered permission explanation before the system prompt.
- Apple AR HIG was rechecked. The physical scene should occupy as much of the display as possible, with indirect/translucent controls that do not obscure the environment. LociAR now collapses tracking, battery, and walking warnings into one prioritized AR status surface.
- ViroReact's current plane-selection lifecycle continues to identify planes by stable `anchorId`. This reinforces the existing native anchor/raycast contract; the design pass does not replace it with GPS-only placement.
- Instagram Stories-style editing patterns still favor direct manipulation plus visible alternatives. LociAR keeps drag/pinch/rotate while exposing layer selection, delete, undo, front, and z-order actions for motor accessibility.
- TikTok/Reels-style discovery scans continue to rely on viewability-aware paging/autoplay. LociAR does not add autoplay in this pass; it adopts the useful content hierarchy—one immersive feature item followed by compact rows—without turning discovery into an unexplained infinite feed.

Sources:
- https://docs.expo.dev/versions/v54.0.0/sdk/camera/
- https://developer.apple.com/design/human-interface-guidelines/augmented-reality
- https://viro-community.readme.io/changelog/viroreact-v2441-ar-plane-detection-selection-overhaul

## 2026-07-22 - Persistent World-Lock Completion Scan

Sources reviewed:
- Expo SDK 54 and Expo Modules API documentation for custom native modules and native views.
- Apple ARKit world tracking, raycast, `ARWorldMap`, and relocalization guidance.
- Google ARCore Cloud Anchor host/resolve and Geospatial/VPS documentation.
- Current ViroReact plane selector lifecycle and stable `anchorId` behavior.

Findings:
- A local ARKit/ARCore anchor identifier is valid only inside the native session that owns it. Saving the identifier without a relocalization asset must never be presented as persistent world lock.
- iOS can persist a mapped environment with `ARSession.getCurrentWorldMap`, archive it, then restore it through `ARWorldTrackingConfiguration.initialWorldMap`. Restored anchors must be rebuilt into RealityKit entities before content attachment.
- Cross-device ARCore persistence requires Cloud Anchor hosting/resolution or a VPS/Geospatial resolver. Cloud Anchor mode must be enabled explicitly, mapping quality should be checked before hosting, and authorization/quota/network failures must remain recoverable.
- Geospatial/VPS is appropriate for city-scale discovery but is not equivalent to a wall-level local anchor by itself. LociAR should resolve in this order: native world map/cloud anchor, reference image, then geo pose as a discovery hint only.
- Expo Go cannot execute this custom Swift/Kotlin bridge. A rebuilt development client is required after every native contract change.

Implementation target:
- Add a versioned persistence descriptor to the anchor bundle.
- Implement iOS world-map save/restore and restored-anchor lifecycle events.
- Implement Android Cloud Anchor host/resolve behind explicit configuration and preserve honest local fallback.
- Make the AR viewer resolve an anchor before attaching the saved composition texture.

## 2026-07-22 - Camera-First Cinematic UI Scan

Sources reviewed:
- Expo SDK 54 Camera documentation: https://docs.expo.dev/versions/v54.0.0/sdk/camera/
- Apple AR HIG: https://developer.apple.com/design/human-interface-guidelines/augmented-reality
- ViroReact plane/anchor lifecycle: https://viro-community.readme.io/changelog/viroreact-v2441-ar-plane-detection-selection-overhaul
- Instagram Stories editor patterns and TikTok camera-control hierarchy scans.

Findings applied:
- Keep the live camera as the dominant canvas and activate only the focused camera preview; all editor controls belong in a compact, progressive bottom surface.
- Use translucent chrome only for transient camera controls, while post surfaces remain solid enough to preserve readability against a changing real-world background.
- Make the bottom navigation camera-first and make create actions contextual inside the camera surface rather than dedicating the primary navigation to a dense editor.
- Use one bright cyan action color for place/pin/AR-open, a warm charcoal palette for the scene, and restrained violet/gold post accents for identity; status and selection must still include text/icon cues.
- Retain visible tool alternatives (undo, clear mode, selected state) instead of requiring gesture-only editing.

## 2026-07-22 - Full Reference-Layout Parity Scan

Sources re-scanned:
- Apple AR HIG: https://developer.apple.com/design/human-interface-guidelines/augmented-reality
- ViroReact plane identity update: https://viro-community.readme.io/changelog/viroreact-v2441-ar-plane-detection-selection-overhaul
- Instagram Stories/TikTok camera editor hierarchy scans.

Findings applied:
- Persistent controls belong in reachable screen-space, with translucent treatment over the live scene; virtual content stays visually separate from its controls.
- The product can use the reference’s camera-first composition without copying platform brands or content: LociAR’s own post surface, creator metadata, and embedded-media capability remain the live data source.
- Shared visual parity relies on one stage layer across AR, discovery, activity, and profile: a darkened real-world image, continuous-radius glass surfaces, pushpin-style post identity, and a cyan primary action.

## 2026-07-26 - RealityKit Texture Loading Build-Hardening Scan

Sources re-scanned:
- Apple RealityKit `TextureResource` loading API and installed iOS 26.5 SDK interfaces.
- ReactVision ViroReact Expo starter kit plane-selection and native-build examples.
- Instagram Stories-style sticker interaction references.
- TikTok official embed/player and feed-stream preloading guidance.

Findings applied:
- `TextureResource.load(contentsOf:)` is synchronous, main-actor isolated, and unavailable from async contexts in the current SDK. iOS 18+ should use the async initializer.
- LociAR still supports iOS 15.1, so iOS 15–17 texture loading uses RealityKit's non-blocking `loadAsync` publisher bridged through Combine async values.
- ViroReact still requires a native development build and remains a reference rather than a second AR runtime.
- Social/editor and feed findings do not change this build-hardening patch; embedded playback remains lifecycle-aware and only one active feed player should own playback resources.

## 2026-07-26 - Pin Surface Reliability Scan

Sources re-scanned:
- Expo SDK 54 Camera docs: https://docs.expo.dev/versions/v54.0.0/sdk/camera/
- Expo SDK 54 Location docs: https://docs.expo.dev/versions/v54.0.0/sdk/location/
- Apple ARKit raycast / world-tracking behavior via installed iOS 26.5 SDK and ARKit docs.

Findings applied:
- `Location.getCurrentPositionAsync` can take several seconds indoors; Pin Surface must not depend on a fresh GPS fix when native ARKit can already create a world anchor.
- Use last-known/fresh GPS as best effort, then fall back to the selected place coordinate with low accuracy metadata so the AR pin succeeds and map precision remains honest.
- Keep native AR raycast as the primary lock path; if plane raycast is cold, the existing front-of-camera ARKit fallback still produces a world-tracked draft rather than blocking the user.

## 2026-08-09 - Physical iPhone Pin Surface Root-Cause Pass

Sources rechecked:
- Apple `ARWorldTrackingConfiguration` and ray-casting documentation.
- Expo development-build and custom-native-code documentation for SDK 54 projects.

Findings applied:
- Physical EAS profiles had both native and visual flags enabled, while Create treated the visual flag as an override. This silently bypassed ARKit. Physical profiles now use ARKit first; Vision remains an explicit simulator/unsupported-device fallback.
- The native raycast waited for its first `ARFrame` by sleeping on the main actor. It now yields asynchronously so ARKit can deliver camera frames.
- The native module now exports the current AR camera image for the reference asset; `react-native-view-shot` is no longer the primary capture path for the RealityKit view.
- Create exposes an on-device diagnostic (`ARKit module ready`, tracking state, session state) and distinguishes a plane lock from the free-space fallback.

## 2026-07-30 - iOS UI Reliability, Navigation, Editor and Discovery Scan

Sources re-scanned:
- Expo SDK 54 reference and Camera documentation.
- Apple Human Interface Guidelines for tab bars and full-screen AR.
- React Navigation 7 bottom-tabs and safe-area guidance.
- React Native `KeyboardAvoidingView`, accessibility, and `InputAccessoryView` documentation.
- React Native Gesture Handler pinch/composition documentation and current upstream repository.
- Apple Vision homographic image registration and ARKit image-tracking documentation.
- ReactVision ViroReact plane-selection references.
- Instagram Stories-style and TikTok/feed React Native repositories/issues for gesture, paging, media ownership, and lifecycle failure patterns.

Findings applied:
- SDK 54 is React Native 0.81/React 19.1. Layout work must use the installed SDK 54 contracts instead of current-next APIs.
- A custom bottom tab bar owns its safe-area and measured height. Screen content must not guess that height with unrelated fixed padding; hidden full-screen Create is allowed, but visible top-level tabs stay stable and labeled.
- Tab bars are navigation, not action toolbars. Create/editor actions stay inside the camera surface; Camera, Map, Explore, Activity, and Profile remain the five stable top-level destinations.
- Full-screen camera/AR content should dominate the screen while controls occupy explicit top and bottom safe bands. Percentage-positioned editor bounds are unsafe when a bottom sheet changes height; measure the sheet and derive the available camera canvas.
- Keyboard behavior needs three paths: submit/Done, interactive scroll dismissal, and explicit dismissal before navigation or write actions. Input content must remain visible rather than being covered.
- Touch targets remain at least 44 points on iOS, icon-only actions need accessible names, and selected state cannot rely on color alone.
- React Navigation automatically protects its own built-in chrome, but custom screen overlays must use `react-native-safe-area-context`. Absolutely positioned tab bars do not add content padding automatically.
- Gesture Handler recommends native gesture composition. Pinch focal coordinates are valid after activation; pan/pinch/rotation should remain simultaneous and bounds must be clamped after each commit.
- TikTok/Stories implementations repeatedly fail when media and timers remain active off-screen. LociAR should keep one focused camera/player owner, pause inactive routes, and virtualize long feeds instead of nesting large unbounded lists.
- ViroReact remains a reference, not a second runtime. LociAR keeps its signed iOS Vision/RealityKit module boundary and avoids duplicating camera ownership.

## 2026-08-09 - Permission-Safe Launch and Discovery Re-scan

Sources re-scanned:

- Expo SDK 54 Camera: https://docs.expo.dev/versions/v54.0.0/sdk/camera/
- Expo SDK 54 Location: https://docs.expo.dev/versions/v54.0.0/sdk/location/
- Apple ARKit camera permission/runtime guidance: https://developer.apple.com/documentation/arkit
- ViroReact AR scene/navigation lifecycle: https://viro-community.readme.io/
- TikTok official recommendation guidance: https://support.tiktok.com/en/using-tiktok/exploring-videos/how-tiktok-recommends-content
- Instagram Stories navigation/editor patterns were rechecked; no public implementation contract changes the permission boundary below.

Findings applied:

- An AR session owns privacy-sensitive camera resources; it begins only after a user action that clearly requests Camera/AR.
- Explore-first launch gives immediate value without camera or location permission and matches the social discovery pattern of opening on browsable recommended content.
- Lazy tab mounting is explicit so `ARCameraScreen` does not mount during an ordinary launch.
- The earlier camera-first visual direction remains valid inside the Camera route, but no longer controls the application launch route.
- Store-like startup cannot combine a permission-safe feed with a fabricated signed-in identity or bundled mock catalog.

## 2026-08-23 - Strict Physical Surface Lock Re-scan

Sources re-scanned:

- Expo SDK 54 Camera and development-build documentation.
- Apple ARKit world-tracking and `ARRaycastQuery.Target.existingPlaneGeometry` documentation.
- Current ReactVision ViroReact plane-selector/change-log behavior.
- React Native Gesture Handler simultaneous gesture guidance and Shopify FlashList recycling/viewability guidance used by Stories/TikTok-style editors and feeds.

Findings applied:

- A world-tracked point placed in front of the camera is not a detected physical surface. `AR lock OK` must require an ARKit raycast backed by an existing plane; `front_of_camera` and `estimatedPlane` remain approximate and separately labeled.
- The earlier 2026-07-26 note that accepted the automatic front-of-camera draft is superseded for physical surface-lock claims. A failed strict plane raycast now stays recoverable instead of being promoted to `arkit_world_locked`.
- ARKit refines plane geometry over time, so the UI should keep instructing the user to move slowly and frame textured, well-lit geometry before pinning.
- ViroReact's current plane-selection behavior reinforces tap-on-detected-plane semantics; it remains a reference, not a second runtime.
- Gesture/feed scans introduced no AR runtime change: simultaneous native gestures remain appropriate for the editor, while recycled feed state must reset by item identity and only visible media should own playback.

## 2026-08-23 - Floor-Anchored Content Rendering Re-scan

Sources re-scanned:

- Expo SDK 54 development-client and custom-native-code documentation.
- Apple RealityKit `AnchorEntity`, `Entity`, and ARKit `ARPlaneExtent` documentation.
- Current ReactVision `ViroARPlaneSelector` docs/changelog.
- TikTok official Embed Player docs; Instagram/Stories gesture references were rechecked for control-layer separation.

Findings applied:

- Plane detection alone is insufficient: the post's visible mesh must be a child of the selected `AnchorEntity`; a React Native absolute overlay remains screen-space even when the camera pose is correct.
- For a horizontal ARKit plane, post geometry uses an XZ RealityKit plane with a small positive Y offset. The anchor supplies world position/orientation; the child supplies only local content transform.
- ViroReact's current selector follows the same contract: content is placed as a child at the selected tap position. Its translucent blue overlay is guidance, not the shared post itself.
- Web/iframe platform embeds remain phone-space controls because they cannot become a RealityKit texture without a direct playable asset. Native image/composition/owned-video content must render on the plane; restricted embeds keep a clearly labeled phone fallback and must not masquerade as floor-anchored content.

## 2026-08-24 - Glued floor poster vs screen-space paste

Sources re-scanned:

- Apple RealityKit `MeshResource.generatePlane(width:depth:)` (XZ, lies on a horizontal ARKit plane).
- Apple ARKit `existingPlaneGeometry` raycast targeting.
- ReactVision ViroARPlaneSelector child-content placement.

Findings applied:

- A React Native `EditComposition` image over `CameraView` can look like a phone on the floor in one photo and still be screen-space paste. Walking around the room proves it: a glued post stays on the wood; a paste stays on the glass.
- Live create/view now call `attachImage` / `attachVideo` on the current-session floor `AnchorEntity`, sized from the photo aspect so a portrait screenshot reads as a phone/poster on the floor, not a stretched 1.2×0.7 billboard.
- Same-session playback does not wait for an `ARWorldMap`. If persistence is missing, raycast a horizontal plane and parent the texture there. Screen-space composition stays hidden once the native child is ready.

## 2026-08-24 - Tap-selected blue plane, then native content

Sources re-scanned:

- Apple ARKit `ARRaycastQuery.Target.existingPlaneGeometry` and RealityKit `ARView` tap/raycast.
- Apple RealityKit `MeshResource.generatePlane(width:depth:)` for XZ floor content.
- ReactVision `ViroARPlaneSelector`: translucent blue plane is guidance; content is a child at the tap.

Findings applied:

- Detected ARKit planes stay visible as a light-blue field. A tap on that field is the lock; a center-screen auto-raycast is not a user-selected surface.
- Camera and Create use the native `ARView` (`lociar-world-lock`). Expo `CameraView` is not the AR runtime.
- After the tap, `attachImage` / `attachVideo` parent the chosen post onto the selected `AnchorEntity`. The overlay card reports surface found, then content ready.
- Walking around the room is the proof: the image stays on the wood. A React Native card on the phone glass is not placement.

## 2026-08-24 - Compass heading, auto-reveal, no manual surface bind

Sources re-scanned:

- Apple ARKit location anchors / `ARGeoTrackingConfiguration` (GPS + compass). LociAR stays on `ARWorldTrackingConfiguration` because geo-tracking is region-limited.
- ARKit `worldAlignment = .gravityAndHeading` (compass-locked axes). Not used for pin sessions; compass is a UI aim guide on top of gravity world tracking.
- Existing-plane raycast (`existingPlaneGeometry`) as the reveal trigger once heading is aligned.

Findings applied:

- Nearby posts still come from the database at the same GPS place. Tapping a post opens the live camera.
- Viewer guides with signed compass delta (“Sağa dön” / “Sola dön”) and pitch copy for floor vs wall. There is no “Yüzeye bağla” confirm.
- When heading is within 28° of the saved geo pose and ARKit sees a matching plane in the viewfinder, the post is placed automatically on that plane. Pattern/image-target matching is not used.

