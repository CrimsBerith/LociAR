import Foundation
import Observation

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

    func resetForAuthenticationGate() {
        selectedTab = .map
        isCreatePresented = false
        createPinRequested = false
        pendingPostID = nil
    }

    func requestCreatePin() {
        createPinRequested = true
        selectedTab = .create
    }

    func selectPost(id: UUID) {
        pendingPostID = id
        selectedTab = .discover
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
