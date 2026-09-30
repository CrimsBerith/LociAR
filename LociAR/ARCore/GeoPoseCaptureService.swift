import CoreLocation
import Foundation

@MainActor
final class GeoPoseCaptureService: NSObject, @preconcurrency CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var continuation: CheckedContinuation<GeoPose?, Never>?
    private var latestHeading: CLHeading?
    private var timeoutTask: Task<Void, Never>?
    private var locationRequestStarted = false
    private var bestLocation: CLLocation?

    /// createPost rejects poses with worse horizontal accuracy (functions/src/placement.ts).
    nonisolated static let maximumPublishAccuracyMeters: Double = 100
    /// Cached fixes older than this are not reused for a new post.
    nonisolated static let maximumCachedFixAge: TimeInterval = 60

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.headingFilter = 2
    }

    func capture(timeout: Duration = .seconds(20)) async -> GeoPose? {
        // UITestFixtures.authenticatedSessionEnabled is a compile-time false in Release builds.
        if UITestFixtures.authenticatedSessionEnabled || UITestFixtures.sampleContentEnabled {
            return UITestFixtures.anchor.geoPose
        }
        guard continuation == nil else { return nil }
        return await withCheckedContinuation { continuation in
            self.continuation = continuation
            timeoutTask = Task { @MainActor [weak self] in
                try? await Task.sleep(for: timeout)
                guard let self else { return }
                // Timed out: return the best fix seen (the caller checks its accuracy).
                self.finish(self.bestLocation.map(self.makeGeoPose(from:)))
            }
            beginLocationRequest()
        }
    }

    private func beginLocationRequest() {
        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .authorizedAlways, .authorizedWhenInUse:
            guard !locationRequestStarted else { return }
            locationRequestStarted = true
            manager.startUpdatingHeading()
            if let location = manager.location,
               Self.isPublishable(location),
               abs(location.timestamp.timeIntervalSinceNow) < Self.maximumCachedFixAge {
                finish(makeGeoPose(from: location))
            } else {
                manager.requestLocation()
            }
        case .denied, .restricted:
            finish(nil)
        @unknown default:
            finish(nil)
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard continuation != nil else { return }
        beginLocationRequest()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
        latestHeading = newHeading
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last, location.horizontalAccuracy >= 0 else { return }
        if location.horizontalAccuracy < (bestLocation?.horizontalAccuracy ?? .infinity) {
            bestLocation = location
        }
        if Self.isPublishable(location) {
            finish(makeGeoPose(from: location))
        } else {
            manager.requestLocation()
        }
    }

    private func makeGeoPose(from location: CLLocation) -> GeoPose {
        let heading = Self.validHeading(latestHeading?.trueHeading)
            ?? Self.validHeading(latestHeading?.magneticHeading)
            ?? Self.validHeading(location.course)
            ?? 0
        return GeoPose(
            latitude: location.coordinate.latitude,
            longitude: location.coordinate.longitude,
            altitude: location.verticalAccuracy >= 0 ? location.altitude : nil,
            heading: heading,
            accuracy: location.horizontalAccuracy >= 0 ? location.horizontalAccuracy : nil
        )
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        if let locationError = error as? CLError, locationError.code == .locationUnknown {
            manager.requestLocation()
            return
        }
        finish(nil)
    }

    private func finish(_ pose: GeoPose?) {
        guard let continuation else { return }
        self.continuation = nil
        timeoutTask?.cancel()
        timeoutTask = nil
        locationRequestStarted = false
        bestLocation = nil
        manager.stopUpdatingHeading()
        continuation.resume(returning: pose)
    }

    nonisolated static func isPublishable(_ location: CLLocation) -> Bool {
        location.horizontalAccuracy >= 0 && location.horizontalAccuracy <= maximumPublishAccuracyMeters
    }

    nonisolated static func validHeading(_ value: CLLocationDirection?) -> CLLocationDirection? {
        guard let value, value.isFinite, value >= 0 else { return nil }
        return value.truncatingRemainder(dividingBy: 360)
    }
}
