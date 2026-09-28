import CoreLocation
import SwiftUI
import UIKit

struct ARPostViewerView: View {
    @Environment(ARPinningEngine.self) private var engine
    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    let post: LociPost
    var onClose: (() -> Void)? = nil
    @State private var location = LocationController()
    @State private var message = "Konum doğrulanıyor…"
    @State private var accessBlocked = false
    @State private var isAiming = false
    @State private var isLocalSurfaceScan = false
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
                        Text(message).font(.footnote)
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
                    Button("Tekrar dene", systemImage: "arrow.clockwise") {
                        Task { await verifyAndOpen() }
                    }
                    .buttonStyle(LociPrimaryButtonStyle())
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
        .task { await verifyAndOpen() }
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
        .accessibilityLabel(guidance.message)
    }

    private var statusTitle: String {
        if accessBlocked { return "Konum uzak" }
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

    private func verifyAndOpen() async {
        accessBlocked = false
        isAiming = false
        location.start()
        if let persistence = post.anchorBundle.anchor.persistence, persistence.isExpired {
            message = "Bu içeriğin mekânsal dünya haritasının süresi dolmuş."
            accessBlocked = true
            return
        }
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
                        message = "\(decision.reason) · \(meters) m"
                    } else {
                        message = decision.reason
                    }
                    accessBlocked = true
                    return
                }
                message = decision.reason
                if await engine.resumePreservedWorldLock(anchorID: post.anchorBundle.anchor.id) {
                    try? await engine.render(post: post)
                    message = "Yüzey bulundu. İçerik hazır."
                    return
                }
                await revealWithAimGuidance()
                return
            }
            if let error = location.errorMessage { message = error; accessBlocked = true; return }
            try? await Task.sleep(for: .milliseconds(200))
        }
        message = "Konum doğrulanamadı. AR erişimi açılmadı."
        accessBlocked = true
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
        isAiming = true
        refreshGuidance()
        if post.anchorBundle.anchor.pinQuality == .freeSpaceApproximate {
            await engine.requestCameraAndStart()
            guard engine.state != .failed else { message = engine.statusMessage; isAiming = false; return }
            await waitUntilReadyToReveal()
            for _ in 0..<30 where engine.trackingQuality != .normal {
                try? await Task.sleep(for: .milliseconds(100))
            }
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
                try? await engine.render(post: post)
                isAiming = false
                message = "Yüzey bulundu. İçerik hazır."
                return
            }
            try? await Task.sleep(for: .milliseconds(80))
        }
    }
}
