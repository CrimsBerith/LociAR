import Foundation
import Network
import Observation

@MainActor
@Observable
final class ConnectivityMonitor {
    private(set) var isOnline = true
    @ObservationIgnored private let monitor = NWPathMonitor()

    init() {
        // Updates are delivered on the main queue in order. One unstructured Task per update
        // could apply an older path after a newer one and leave the app showing the wrong state.
        monitor.pathUpdateHandler = { [weak self] path in
            MainActor.assumeIsolated { self?.isOnline = path.status == .satisfied }
        }
        monitor.start(queue: .main)
    }

    deinit {
        monitor.pathUpdateHandler = nil
        monitor.cancel()
    }
}
