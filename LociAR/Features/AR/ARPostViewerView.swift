import CoreLocation
import SwiftUI
import UIKit

struct ARPostViewerView: View {
    @Environment(ARPinningEngine.self) private var engine
    @Environment(AppSession.self) private var session
    @Environment(AppContainer.self) private var container
    @Environment(\.dismiss) private var dismiss
    let post: LociPost
    var onClose: (() -> Void)? = nil
    @State private var location = LocationController()
    @State private var message = "Konum doğrulanıyor…"
    @State private var accessBlocked = false
    @State private var isAiming = false
    @State private var isLocalSurfaceScan = false
    /// The resolver chain (Cloud Anchor → Geospatial → world map → aim-guided reveal); stored so
    /// "Yaklaşık göster", "Tekrar dene" and closing the viewer can cancel it.
    @State private var resolveTask: Task<Void, Never>?
    @State private var offerTask: Task<Void, Never>?
    /// Shown when exact resolving takes long: skip straight to the approximate, aim-guided view.
    @State private var offerApproximate = false
    @State private var isApproximateView = false
    /// How long exact resolving may run before the "Yaklaşık göster" shortcut appears.
    private static let approximateOfferDelay: Duration = .seconds(8)
    @State private var guidance = ViewAimGuidance(
        headingAligned: false, pitchAligned: false, closeEnough: false, readyToReveal: false,
        signedHeadingDelta: 0, distanceMeters: 0, title: "Yön aranıyor",
        message: "Posta dokundun. Nokta atışı için kamerayı çevir.", symbol: "location.north.fill"
    )

    var body: some View {
        ZStack {
            ARViewContainer(engine: engine).ignoresSafeArea()
            if !engine.hasRecentCameraFrame {
                ARCameraBackdrop(failed: engine.state == .failed, message: message)
            }
            if isAiming, engine.state != .resolved {
                aimingReticle
            }
            VStack {
                HStack {
                    Button { close() } label: {
                        Image(systemName: "xmark")
                            .font(.headline)
                            .frame(width: 44, height: 44)
                            .background(.ultraThinMaterial, in: Circle())
                    }
                    .accessibilityLabel("Kapat")
                    Spacer()
                }
                LociCard {
                    VStack(alignment: .leading, spacing: 5) {
                        LociStatusPill(
                            title: statusTitle,
                            symbol: statusSymbol,
                            color: statusColor
                        )
                        Text(message.localizedUI).font(.footnote)
                    }
                }
                Spacer()
                if accessBlocked {
                    VStack(spacing: 10) {
                        LociInlineNotice(
                            title: "AR burada açılamıyor",
                            message: message,
                            symbol: "location.slash.fill",
                            color: .orange
                        )
                        Button("Posta geri dön", systemImage: "chevron.backward") { close() }
                            .buttonStyle(LociPrimaryButtonStyle())
                    }
                } else if engine.state == .failed {
                    Button("Tekrar dene", systemImage: "arrow.clockwise") { startResolving() }
                        .buttonStyle(LociPrimaryButtonStyle())
                } else if offerApproximate, engine.state != .resolved, !isAiming {
                    Button("Yaklaşık göster", systemImage: "scope") { showApproximately() }
                        .buttonStyle(LociSecondaryButtonStyle())
                        .accessibilityIdentifier("ar-show-approximate")
                } else if isAiming, engine.state != .resolved {
                    LociInlineNotice(
                        title: guidance.title,
                        message: guidance.message,
                        symbol: guidance.symbol,
                        color: guidance.readyToReveal ? LociTheme.accent : .orange
                    )
                    .accessibilityIdentifier("ar-aim-guidance")
                }
            }.padding()
        }
        .background(LociTheme.background)
        .accessibilityIdentifier("ar-post-viewer")
        .arcoreDisclosure()
        .onAppear { startResolving() }
        .onChange(of: engine.state) { _, state in
            if state == .resolved {
                isAiming = false
                isLocalSurfaceScan = false
                message = post.anchorBundle.anchor.pinQuality == .freeSpaceApproximate
                    ? "Yaklaşık görünüm kameranın 0,8 m önünde açıldı."
                    : "Yüzey bulundu. İçerik hazır."
            }
        }
        .onChange(of: location.heading?.trueHeading) { _, _ in
            refreshGuidance()
        }
        .onChange(of: location.location?.timestamp) { _, _ in
            refreshGuidance()
        }
        .onChange(of: engine.cameraPitchDegrees) { _, _ in
            refreshGuidance()
        }
        .onChange(of: engine.cameraYawDegrees) { _, _ in
            refreshGuidance()
        }
        .onDisappear {
            resolveTask?.cancel()
            offerTask?.cancel()
            location.stop()
            engine.stopSession()
        }
    }

    private var aimingReticle: some View {
        ZStack {
            Circle()
                .stroke(.white.opacity(0.18), lineWidth: 2)
                .frame(width: 120, height: 120)
            Circle()
                .trim(from: 0, to: 0.08)
                .stroke(guidance.readyToReveal ? LociTheme.accent : .white, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                .frame(width: 120, height: 120)
                .rotationEffect(.degrees(guidance.signedHeadingDelta - 14))
            Circle()
                .stroke(guidance.readyToReveal ? LociTheme.accent : .white, lineWidth: 3)
                .frame(width: 54, height: 54)
            Circle()
                .fill(guidance.readyToReveal ? LociTheme.accent : .white)
                .frame(width: 8, height: 8)
            Image(systemName: "location.north.fill")
                .font(.title3.weight(.bold))
                .foregroundStyle(guidance.readyToReveal ? LociTheme.accent : .white)
                .offset(y: -44)
                .rotationEffect(.degrees(guidance.signedHeadingDelta))
                .shadow(color: .black.opacity(0.7), radius: 4)
            Text(guidance.distanceMeters < 10
                 ? String(format: "%.0f m", max(0, guidance.distanceMeters.isFinite ? guidance.distanceMeters : 0))
                 : ProximityPolicy.roundedMeters(guidance.distanceMeters).map { "\($0) m" } ?? "Mesafe bilinmiyor")
                .font(.caption.weight(.semibold).monospacedDigit())
                .foregroundStyle(.white)
                .offset(y: 46)
                .shadow(color: .black.opacity(0.8), radius: 3)
        }
        .allowsHitTesting(false)
        .accessibilityIdentifier("ar-aim-reticle")
        .accessibilityLabel(guidance.message.localizedUI)
    }

    private var statusTitle: String {
        if accessBlocked { return "Konum uzak" }
        if isApproximateView { return engine.state == .resolved ? "Yaklaşık görünüm" : "Yön aranıyor" }
        if isLocalSurfaceScan { return "Yüzey aranıyor" }
        if post.anchorBundle.anchor.pinQuality == .freeSpaceApproximate {
            return engine.state == .resolved ? "Yaklaşık görünüm" : "Yön aranıyor"
        }
        if engine.state == .resolved { return "Yüzey bulundu" }
        if guidance.readyToReveal { return "Nokta atışı" }
        return guidance.title
    }

    private var statusSymbol: String {
        if isLocalSurfaceScan { return "viewfinder" }
        return engine.state == .resolved ? "checkmark.seal.fill" : guidance.symbol
    }

    private var statusColor: Color {
        if accessBlocked { return .orange }
        if engine.state == .resolved || guidance.readyToReveal { return LociTheme.accent }
        return .orange
    }

    private func close() {
        resolveTask?.cancel()
        offerTask?.cancel()
        location.stop()
        engine.stopSession()
        if let onClose {
            onClose()
        } else {
            dismiss()
        }
    }

    private func currentViewerHeading() -> Double? {
        if let yaw = engine.cameraYawDegrees {
            return GeoPoseCaptureService.validHeading(yaw)
        }
        return GeoPoseCaptureService.validHeading(location.heading?.trueHeading)
            ?? GeoPoseCaptureService.validHeading(location.heading?.magneticHeading)
    }

    private func refreshGuidance() {
        guidance = ProximityPolicy.viewAim(
            post: post,
            viewer: location.location,
            viewerHeading: currentViewerHeading(),
            cameraPitchDegrees: engine.hasRecentCameraFrame ? engine.cameraPitchDegrees : nil
        )
        if isAiming, engine.state != .resolved {
            message = guidance.message
        }
    }

    private func startResolving() {
        resolveTask?.cancel()
        offerTask?.cancel()
        offerApproximate = false
        isApproximateView = false
        resolveTask = Task { await verifyAndOpen() }
        offerTask = Task {
            do { try await Task.sleep(for: Self.approximateOfferDelay) } catch { return }
            if engine.state != .resolved, !accessBlocked { offerApproximate = true }
        }
    }

    /// Stops exact resolving and reveals the post by GPS direction and distance (aim-guided).
    private func showApproximately() {
        let running = resolveTask
        running?.cancel()
        offerTask?.cancel()
        offerApproximate = false
        isApproximateView = true
        resolveTask = Task {
            await running?.value
            guard !Task.isCancelled else { return }
            engine.stopSession()
            await revealWithAimGuidance()
        }
    }

    private func verifyAndOpen() async {
        accessBlocked = false
        isAiming = false
        location.start()
        location.requestPreciseAccuracyIfNeeded()
        // An expired Cloud Anchor or world map no longer blocks the post: the next resolver
        // (geospatial, then aim-guided reveal) takes over.
        if session.isLocalPreview {
            await revealLocalPreviewOnPhysicalSurface()
            return
        }
        for _ in 0..<40 {
            if let current = location.location {
                let heading = currentViewerHeading()
                let decision = ProximityPolicy.evaluate(post: post, viewer: current, viewerHeading: heading, targeted: true)
                guard decision.allowed else {
                    if let meters = ProximityPolicy.roundedMeters(decision.distanceMeters) {
                        message = String(localized: "\(decision.reason.localizedUI) · \(meters) m")
                    } else {
                        message = decision.reason
                    }
                    accessBlocked = true
                    return
                }
                message = decision.reason
                if await engine.resumePreservedWorldLock(anchorID: post.anchorBundle.anchor.id) {
                    _ = await renderResolvedContent()
                    return
                }
                // Each stage checks for cancellation: closing the viewer or "Yaklaşık göster" must
                // not fall through to the next stage (which would restart the camera).
                guard !Task.isCancelled else { return }
                if await resolveWithARCore() { return }
                guard !Task.isCancelled else { return }
                if await relocalizeFromWorldMap() { return }
                guard !Task.isCancelled else { return }
                await revealWithAimGuidance()
                return
            }
            if let error = location.errorMessage { message = error; accessBlocked = true; return }
            do { try await Task.sleep(for: .milliseconds(200)) } catch { return }
        }
        message = "Konum doğrulanamadı. AR erişimi açılmadı."
        accessBlocked = true
    }

    /// Google ARCore resolvers, most precise first: the hosted Cloud Anchor (exact surface, indoor
    /// and outdoor), then the Geospatial pose (outdoors with VPS coverage). Both run on the same
    /// ARKit session; false means "try the next resolver".
    private func resolveWithARCore() async -> Bool {
        let anchor = post.anchorBundle.anchor
        let cloudAnchorId = anchor.persistence?.resolvableCloudAnchorId
        let geospatial = anchor.geospatial?.isValid == true ? anchor.geospatial : nil
        let arcore = container.arcore
        // No ARCore (previews, session failed to start): go straight to the next resolver.
        guard arcore.isUsable, anchor.pinQuality.isPhysicalSurface, cloudAnchorId != nil || geospatial != nil else { return false }
        await engine.requestCameraAndStart()
        guard engine.state != .failed, !Task.isCancelled else { return false }
        guard await arcore.waitUntilReady() else { return false }
        if let cloudAnchorId {
            message = "Yüzey aranıyor. Kamerayı postun bırakıldığı yere doğrult ve yavaşça gezdir."
            if let transform = await arcore.resolveCloudAnchor(cloudAnchorId), !Task.isCancelled {
                engine.placeResolvedForViewing(transform: transform, anchor: anchor, physical: true)
                return await renderResolvedContent()
            }
        }
        if let geospatial {
            message = "Konum doğrulanıyor. Kamerayı çevredeki binalara doğrult."
            if await arcore.waitForEarthLocalization(), !Task.isCancelled,
               let transform = arcore.transform(for: geospatial) {
                engine.placeResolvedForViewing(transform: transform, anchor: anchor, physical: false)
                return await renderResolvedContent()
            }
        }
        return false
    }

    private func renderResolvedContent() async -> Bool {
        do {
            try await engine.render(post: post)
            message = "Yüzey bulundu. İçerik hazır."
        } catch {
            message = "Yüzey bulundu ancak içerik çizilemedi. Tekrar dene."
        }
        return true
    }

    /// Multi-user world lock: downloads the creator's ARWorldMap and relocalizes against it so the
    /// content appears on the exact physical surface it was pinned to. Returns false (caller falls
    /// back to aim-assisted reveal) when the post has no stored map, the download fails, or ARKit
    /// cannot recognise the place within the engine's relocalization timeout.
    private func relocalizeFromWorldMap() async -> Bool {
        guard let persistence = post.anchorBundle.anchor.persistence,
              persistence.storagePath != nil,
              post.anchorBundle.anchor.pinQuality.isPhysicalSurface,
              let worldMaps = container.worldMaps else { return false }
        message = "Kayıtlı yüzey haritası indiriliyor…"
        guard let data = try? await worldMaps.download(persistence), !Task.isCancelled else { return false }
        await engine.requestCameraAndStart()
        guard engine.state != .failed else { return false }
        do {
            try await engine.restoreWorldMap(data: data, expectedAnchor: post.anchorBundle.anchor)
        } catch {
            engine.stopSession()
            return false
        }
        message = "Kaydedilen çevre aranıyor. Kamerayı postun sabitlendiği yüzeye doğru yavaşça gezdir."
        while !Task.isCancelled {
            switch engine.state {
            case .resolved:
                do {
                    try await engine.render(post: post)
                    message = "Yüzey bulundu. İçerik hazır."
                } catch {
                    message = "Yüzey bulundu ancak içerik çizilemedi. Tekrar dene."
                }
                return true
            case .failed, .idle:
                // Relocalization timed out; clear the initial world map before falling back.
                engine.stopSession()
                message = "Kaydedilen çevre bulunamadı. Yaklaşık konuma göre yönlendiriliyorsun."
                return false
            default:
                try? await Task.sleep(for: .milliseconds(150))
            }
        }
        return false
    }

    private func revealLocalPreviewOnPhysicalSurface() async {
        isAiming = false
        if post.anchorBundle.anchor.pinQuality == .freeSpaceApproximate {
            await engine.requestCameraAndStart()
            do {
                try engine.placeApproximateForViewing(anchor: post.anchorBundle.anchor)
                try await engine.render(post: post)
                message = "Yaklaşık görünüm kameranın 0,8 m önünde açıldı."
            } catch {
                message = "Yaklaşık AR görünümü açılamadı."
            }
            isLocalSurfaceScan = false
            return
        }
#if DEBUG
        if ProcessInfo.processInfo.arguments.contains("UITEST_WALL_AR_PREVIEW") {
            await engine.requestCameraAndStart()
            for _ in 0..<40 where !engine.hasRecentCameraFrame {
                try? await Task.sleep(for: .milliseconds(100))
            }
            do {
                try engine.placeVerticalWallForViewing(anchor: post.anchorBundle.anchor)
                try await engine.render(post: post)
                message = "Yüzey bulundu. İçerik hazır."
            } catch {
                message = "Dikey yüzeyde AR görünümü açılamadı: \(error.localizedDescription)"
            }
            isLocalSurfaceScan = false
            return
        }
#endif
        isLocalSurfaceScan = true
        message = "Kartı açmak için kamerayı dokulu bir duvar, masa veya zemin üzerinde yavaşça gezdir."
        guard await engine.beginAimAssistedReveal() else {
            message = engine.statusMessage
            isLocalSurfaceScan = false
            return
        }

        var sourceAnchor = post.anchorBundle.anchor
        sourceAnchor.surfaceAlignment = .unknown
        while !Task.isCancelled && engine.state != .failed && !accessBlocked {
            if engine.revealIfSurfaceReady(from: sourceAnchor) {
                do {
                    try await engine.render(post: post)
                    message = "Yüzey bulundu. İçerik hazır."
                } catch {
                    message = "Yüzey bulundu ancak içerik çizilemedi. Tekrar dene."
                }
                isLocalSurfaceScan = false
                return
            }
            try? await Task.sleep(for: .milliseconds(80))
        }
        isLocalSurfaceScan = false
    }

    private func revealWithAimGuidance() async {
        guard !Task.isCancelled else { return }
        isAiming = true
        refreshGuidance()
        if post.anchorBundle.anchor.pinQuality == .freeSpaceApproximate {
            await engine.requestCameraAndStart()
            guard engine.state != .failed else { message = engine.statusMessage; isAiming = false; return }
            await waitUntilReadyToReveal()
            for _ in 0..<30 where engine.trackingQuality != .normal {
                do { try await Task.sleep(for: .milliseconds(100)) } catch { return }
            }
            guard !Task.isCancelled else { return }
            do {
                try engine.placeApproximateForViewing(anchor: post.anchorBundle.anchor)
                try await engine.render(post: post)
                isAiming = false
                message = "Yaklaşık görünüm kameranın 0,8 m önünde açıldı."
            } catch {
                message = "Yaklaşık AR görünümü hazırlanamadı. Kamerayı postun yönüne tut."
            }
            return
        }

        guard await engine.beginAimAssistedReveal() else {
            message = engine.statusMessage
            isAiming = false
            return
        }
        await waitUntilRevealedOnSurface()
    }

    private func waitUntilReadyToReveal() async {
        while !Task.isCancelled && engine.state != .failed && !accessBlocked {
            refreshGuidance()
            if guidance.readyToReveal { return }
            try? await Task.sleep(for: .milliseconds(80))
        }
    }

    private func waitUntilRevealedOnSurface() async {
        while !Task.isCancelled && engine.state != .failed && !accessBlocked {
            if engine.state == .resolved {
                isAiming = false
                return
            }
            refreshGuidance()
            if guidance.readyToReveal,
               engine.revealIfSurfaceReady(from: post.anchorBundle.anchor) {
                isAiming = false
                _ = await renderResolvedContent()
                return
            }
            try? await Task.sleep(for: .milliseconds(80))
        }
    }
}
