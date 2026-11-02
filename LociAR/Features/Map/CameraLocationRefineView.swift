import ARKit
import SwiftUI

/// Refines the phone position with ARCore Geospatial (VPS): the camera recognises nearby buildings
/// from Street View data and gives a 1–5 m fix outdoors, where GPS alone is 5–30 m off.
/// Runs on the shared AR session; the Google sensor-data notice is shown like on every AR screen.
struct CameraLocationRefineView: View {
    /// A fix at least this good is used without asking.
    static let autoAcceptAccuracy: Double = 5
    /// Worst camera fix offered; matches the server limit for `geospatial` note sources.
    static let maxAcceptAccuracy: Double = 15
    static var isSupported: Bool {
#if targetEnvironment(simulator)
        false
#else
        ARWorldTrackingConfiguration.isSupported
#endif
    }

    let onFix: (LocationSample) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(AppContainer.self) private var container
    @Environment(ARPinningEngine.self) private var engine
    @State private var cameraReady = true
    @State private var used = false

    private var fix: LocationSample? {
        guard let fix = container.arcore.cameraFix, Date().timeIntervalSince(fix.timestamp) <= 3,
              fix.accuracy >= 0, fix.accuracy <= Self.maxAcceptAccuracy else { return nil }
        return fix
    }

    var body: some View {
        ZStack {
            ARViewContainer(engine: engine).ignoresSafeArea()
            if !engine.hasRecentCameraFrame {
                ARCameraBackdrop(failed: !cameraReady || engine.state == .failed, message: engine.statusMessage)
            }
            VStack(spacing: 12) {
                HStack {
                    ARCoreNoticeButton()
                    Spacer()
                    Button("Kapat") { dismiss() }
                        .buttonStyle(.borderedProminent).tint(.black.opacity(0.55))
                        .accessibilityIdentifier("camera-refine-close")
                }
                Spacer()
                panel
            }
            .padding()
        }
        .background(LociTheme.background)
        .arcoreDisclosure()
        .task { cameraReady = await engine.ensureLiveCameraSession() }
        .onDisappear { engine.stopSession() }
        .onChange(of: container.arcore.cameraFix) { _, _ in
            if let fix, fix.accuracy <= Self.autoAcceptAccuracy { use(fix) }
        }
    }

    private var panel: some View {
        VStack(alignment: .leading, spacing: 8) {
            if case .unavailable = container.arcore.availability {
                Text("Bu cihazda kamerayla konum hassaslaştırma kullanılamıyor.").font(.callout)
            } else if let accuracy = container.arcore.horizontalAccuracy, container.arcore.isEarthTracking {
                let meters = Int(accuracy.rounded())
                Label(String(localized: "Kamera konumu · ±\(meters) m"), systemImage: fix == nil ? "camera.viewfinder" : "checkmark.circle.fill")
                    .font(.headline)
                Text("Telefonu yavaşça çevirmeye devam et; ±5 m’ye inince konum otomatik kullanılır.")
                    .font(.caption).foregroundStyle(.secondary)
            } else {
                Label("Çevre taranıyor…", systemImage: "camera.viewfinder").font(.headline)
                Text("Telefonu göz hizasına kaldır ve çevredeki binalara, tabelalara doğru yavaşça çevir. Açık havada en iyi sonuç verir; kapalı alanda çalışmayabilir.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Button {
                if let fix { use(fix) }
            } label: {
                Label("Bu konumu kullan", systemImage: "location.fill").frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(fix == nil)
            .accessibilityIdentifier("camera-refine-use")
        }
        .padding()
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
    }

    private func use(_ fix: LocationSample) {
        guard !used else { return }
        used = true
        onFix(fix)
        dismiss()
    }
}
