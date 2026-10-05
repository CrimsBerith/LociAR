import SwiftUI

/// Google ARCore user notice (required for Cloud Anchors / Geospatial): shown prominently the
/// first time an AR screen that activates ARCore opens, with Google's "learn more" link. ARCore
/// processes no camera frame until the notice is acknowledged (`ARCoreService.consume`).
/// https://developers.google.com/ar/develop/privacy-requirements
struct ARCoreDisclosureModifier: ViewModifier {
    @AppStorage(ARCoreService.disclosureAcknowledgedKey) private var acknowledged = false
    @Environment(\.openURL) private var openURL
    @Environment(AppContainer.self) private var container
    @State private var isPresented = false

    static let learnMoreURL = URL(string: "https://support.google.com/ar?p=how-google-play-services-for-ar-handles-your-data")!

    func body(content: Content) -> some View {
        content
            .onAppear { if !acknowledged && container.arcore.isEnabled { isPresented = true } }
            .alert("Google AR", isPresented: $isPresented) {
                Button("Daha fazla bilgi") {
                    openURL(Self.learnMoreURL)
                    isPresented = true
                }
                Button("Tamam") { acknowledged = true }
            } message: {
                Text("Bu oturumu çalıştırmak için Google, sensör verilerini (ör. kamera ve konum) işler.\n\nTo power this session, Google will process sensor data (e.g., camera and location).")
            }
    }
}

extension View {
    func arcoreDisclosure() -> some View { modifier(ARCoreDisclosureModifier()) }
}
