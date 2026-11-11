import RealityKit
import SwiftUI
import UIKit

final class ARViewHostView: UIView {
    weak var engine: ARPinningEngine?

    override func didMoveToWindow() {
        super.didMoveToWindow()
        engine?.arViewHostDidMoveToWindow(self)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        if let view = engine?.existingARView, view.superview === self {
            view.frame = bounds
        }
    }
}

struct ARViewContainer: UIViewRepresentable {
    let engine: ARPinningEngine

    func makeUIView(context: Context) -> ARViewHostView {
        let host = ARViewHostView(frame: .zero)
        host.backgroundColor = .clear
        host.engine = engine
        engine.registerARViewHost(host)
        return host
    }

    func updateUIView(_ uiView: ARViewHostView, context: Context) {
        uiView.engine = engine
        if uiView.window != nil { engine.activateARViewHost(uiView) }
    }

    static func dismantleUIView(_ uiView: ARViewHostView, coordinator: Void) {
        uiView.engine?.unregisterARViewHost(uiView)
        uiView.engine = nil
    }
}

/// Shown over a live but black camera feed, so a covered lens or a failed sensor is not mistaken
/// for an app that stopped working.
struct ARDarkCameraNotice: View {
    var body: some View {
        Label(String(localized: "Kamera görüntüsü çok karanlık. Lensi ve ortam ışığını kontrol et."), systemImage: "moon.fill")
            .font(.footnote.weight(.semibold))
            .foregroundStyle(LociTheme.mediaOverlayText)
            .multilineTextAlignment(.leading)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .padding(.horizontal, 24)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
            .allowsHitTesting(false)
            .transition(.opacity)
            .accessibilityIdentifier("ar-dark-camera-notice")
    }
}

struct ARCameraBackdrop: View {
    let failed: Bool
    let message: String

    var body: some View {
        ZStack {
            LociScreenBackground()
            VStack(spacing: 14) {
                Image(systemName: failed ? "exclamationmark.triangle.fill" : "camera.aperture")
                    .font(.system(size: 38, weight: .semibold))
                    .foregroundStyle(failed ? LociTheme.warning : LociTheme.accent)
                    .symbolEffect(.pulse, isActive: !failed)
                Text(failed ? String(localized: "Kamera görüntüsü alınamadı") : String(localized: "Canlı kamera hazırlanıyor"))
                    .font(.headline)
                Text(message.localizedUI)
                    .font(.footnote)
                    .foregroundStyle(LociTheme.secondaryText)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 280)
                if !failed { ProgressView().tint(LociTheme.accent) }
            }
            .padding(24)
        }
        .allowsHitTesting(false)
        .transition(.opacity)
    }
}
