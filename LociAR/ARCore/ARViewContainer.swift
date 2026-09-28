import RealityKit
import SwiftUI
import UIKit

final class ARViewHostView: UIView {
    weak var engine: ARPinningEngine?

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil, let engine {
            engine.activateARViewHost(self)
        }
    }
}

struct ARViewContainer: UIViewRepresentable {
    let engine: ARPinningEngine

    func makeUIView(context: Context) -> ARViewHostView {
        let host = ARViewHostView(frame: .zero)
        host.backgroundColor = UIColor(red: 0.025, green: 0.035, blue: 0.055, alpha: 1)
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

struct ARCameraBackdrop: View {
    let failed: Bool
    let message: String

    var body: some View {
        ZStack {
            LociScreenBackground()
            VStack(spacing: 14) {
                Image(systemName: failed ? "exclamationmark.triangle.fill" : "camera.aperture")
                    .font(.system(size: 38, weight: .semibold))
                    .foregroundStyle(failed ? Color.orange : LociTheme.accent)
                    .symbolEffect(.pulse, isActive: !failed)
                Text(failed ? "Kamera görüntüsü alınamadı" : "Canlı kamera hazırlanıyor")
                    .font(.headline)
                Text(message)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
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
