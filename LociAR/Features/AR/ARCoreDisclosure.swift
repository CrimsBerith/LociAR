import SwiftUI

/// Google ARCore user notice (required for Cloud Anchors / Geospatial): shown prominently the
/// first time an AR screen that activates ARCore opens, with Google's "learn more" link. ARCore
/// processes no camera frame until the notice is acknowledged (`ARCoreService.consume`). Every AR
/// screen also keeps an `ARCoreNoticeButton` visible so the notice can be read again at any time.
/// https://developers.google.com/ar/develop/privacy-requirements
struct ARCoreDisclosureModifier: ViewModifier {
    @AppStorage(ARCoreService.disclosureAcknowledgedKey) private var acknowledged = false
    @Environment(AppContainer.self) private var container
    @State private var isPresented = false

    static let learnMoreURL = URL(string: "https://support.google.com/ar?p=how-google-play-services-for-ar-handles-your-data")!

    func body(content: Content) -> some View {
        content
            .onAppear { if !acknowledged && container.arcore.isEnabled { isPresented = true } }
            .arcoreNoticeAlert(isPresented: $isPresented) { acknowledged = true }
    }
}

/// Persistent access to the sensor-data notice on every active AR screen.
struct ARCoreNoticeButton: View {
    var usesARSearchSurface = false
    @Environment(AppContainer.self) private var container
    @AppStorage(ARCoreService.disclosureAcknowledgedKey) private var acknowledged = false
    @State private var isPresented = false

    var body: some View {
        if container.arcore.isEnabled {
            Button { isPresented = true } label: {
                if usesARSearchSurface {
                    Label("Google AR", systemImage: "info.circle")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(LociTheme.arSearchInk)
                        .padding(.horizontal, LociTheme.Spacing.s)
                        .padding(.vertical, LociTheme.Spacing.xs)
                        .background(LociTheme.arSearchSurface, in: Capsule())
                        .overlay(Capsule().stroke(LociTheme.arSearchInk.opacity(0.16)))
                } else {
                    Label("Google AR", systemImage: "info.circle")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(LociTheme.textPrimary)
                        .padding(.horizontal, LociTheme.Spacing.s)
                        .padding(.vertical, LociTheme.Spacing.xs)
                        .lociGlassSurface(in: Capsule())
                }
            }
            .buttonStyle(.plain)
            .frame(minHeight: LociTheme.Control.minimumTapTarget)
            .contentShape(Rectangle())
            .accessibilityHint(Text("Google'ın sensör verisi bildirimini gösterir"))
            .accessibilityIdentifier("arcore-notice")
            .arcoreNoticeAlert(isPresented: $isPresented) { acknowledged = true }
        }
    }
}

private struct ARCoreNoticeAlert: ViewModifier {
    @Binding var isPresented: Bool
    let onAcknowledge: () -> Void
    @Environment(\.openURL) private var openURL

    func body(content: Content) -> some View {
        content.alert("Google AR", isPresented: $isPresented) {
            Button("Daha fazla bilgi") {
                openURL(ARCoreDisclosureModifier.learnMoreURL)
                isPresented = true
            }
            Button("Tamam") { onAcknowledge() }
        } message: {
            // English value is Google's required wording: "To power this session, Google will process
            // sensor data (e.g., camera and location)."
            Text("Bu oturumu çalıştırmak için Google, sensör verilerini (ör. kamera ve konum) işler.")
        }
    }
}

extension View {
    func arcoreDisclosure() -> some View { modifier(ARCoreDisclosureModifier()) }

    fileprivate func arcoreNoticeAlert(isPresented: Binding<Bool>, onAcknowledge: @escaping () -> Void) -> some View {
        modifier(ARCoreNoticeAlert(isPresented: isPresented, onAcknowledge: onAcknowledge))
    }
}
