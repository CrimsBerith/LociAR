import CoreLocation
import Foundation

@MainActor
final class GeoPoseCaptureService: NSObject, @preconcurrency CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var continuation: CheckedContinuation<GeoPose?, Never>?
    private var latestHeading: CLHeading?
    private var timeoutTask: Task<Void, Never>?
    private var locationRequestStarted = false

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.headingFilter = 2
    }

    func capture(timeout: Duration = .seconds(20)) async -> GeoPose? {
#if DEBUG
        if UITestFixtures.authenticatedSessionEnabled || UITestFixtures.sampleContentEnabled {
            return UITestFixtures.anchor.geoPose
        }
#endif
        guard continuation == nil else { return nil }
        return await withCheckedContinuation { continuation in
            self.continuation = continuation
            timeoutTask = Task { @MainActor [weak self] in
                try? await Task.sleep(for: timeout)
                self?.finish(nil)
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
               location.horizontalAccuracy >= 0,
               abs(location.timestamp.timeIntervalSinceNow) < 600 {
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
        guard let location = locations.last else { return }
        finish(makeGeoPose(from: location))
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
        manager.stopUpdatingHeading()
        continuation.resume(returning: pose)
    }

    nonisolated static func validHeading(_ value: CLLocationDirection?) -> CLLocationDirection? {
        guard let value, value.isFinite, value >= 0 else { return nil }
        return value.truncatingRemainder(dividingBy: 360)
    }
}
