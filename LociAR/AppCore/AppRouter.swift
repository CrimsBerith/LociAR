import Foundation
import Observation

/// A map position to open, e.g. from a dense-spot notification.
struct MapFocus: Equatable, Sendable { let latitude: Double; let longitude: Double }

@MainActor
@Observable
final class AppRouter {
    enum Tab: Int, Hashable, Sendable {
        case ar
        case map
        case create
        case discover
        case profile
    }

    var selectedTab: Tab = .map
    var isCreatePresented = false
    var createPinRequested = false
    var pendingPostID: UUID?
    var isActivityPresented = false
    var pendingMapFocus: MapFocus?

    func resetForAuthenticationGate() {
        selectedTab = .map
        isCreatePresented = false
        createPinRequested = false
        pendingPostID = nil
        isActivityPresented = false
        pendingMapFocus = nil
    }

    func requestCreatePin() {
        createPinRequested = true
        selectedTab = .create
    }

    func selectPost(id: UUID) {
        pendingPostID = id
        selectedTab = .discover
    }

    func focusMap(_ focus: MapFocus) {
        pendingMapFocus = focus
        selectedTab = .map
    }

    func selectActivity() {
        selectedTab = .profile
        isActivityPresented = true
    }

    @discardableResult
    func handleDeepLink(_ url: URL) -> Bool {
        guard url.scheme?.lowercased() == "lociar" else { return false }
        if url.host?.lowercased() == "post" {
            let idString = url.lastPathComponent
            if let uuid = UUID(uuidString: idString) {
                selectPost(id: uuid)
                return true
            }
        }
        return false
    }
}
