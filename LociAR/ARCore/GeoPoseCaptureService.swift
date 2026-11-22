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
    /// A good fix waiting briefly for the first compass sample (see `finishWithHeading`).
    private var awaitingHeading: CLLocation?
    private var headingWait: Task<Void, Never>?

    /// createPost rejects poses with worse horizontal accuracy (functions/src/placement.ts).
    nonisolated static let maximumPublishAccuracyMeters: Double = 100
    /// Cached fixes older than this are not reused for a new post.
    nonisolated static let maximumCachedFixAge: TimeInterval = 10
    nonisolated static let preferredPublishAccuracyMeters: Double = 15

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
        if continuation != nil {
            finish(nil)
        }
        return await withTaskCancellationHandler {
            await withCheckedContinuation { continuation in
                self.continuation = continuation
                timeoutTask = Task { @MainActor [weak self] in
                    do { try await Task.sleep(for: timeout) } catch { return }
                    guard let self else { return }
                    // Timed out: return the best fix seen (the caller checks its accuracy).
                    self.finish(self.bestLocation.flatMap { Self.isPublishable($0) ? self.makeGeoPose(from: $0) : nil })
                }
                beginLocationRequest()
            }
        } onCancel: {
            Task { @MainActor [weak self] in
                self?.finish(nil)
            }
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
            if manager.accuracyAuthorization == .reducedAccuracy {
                manager.requestTemporaryFullAccuracyAuthorization(withPurposeKey: LocationController.geospatialAccuracyPurposeKey)
            }
            if let location = manager.location,
               Self.isPublishable(location),
               location.horizontalAccuracy <= Self.preferredPublishAccuracyMeters {
                // Remember it: if the overall timeout fires during the compass wait, this fix is the answer.
                bestLocation = location
                finishWithHeading(location)
            } else {
                manager.startUpdatingLocation()
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
        guard newHeading.headingAccuracy >= 0, abs(newHeading.timestamp.timeIntervalSinceNow) <= 10 else { return }
        latestHeading = newHeading
        if continuation != nil { finishAwaitingHeading() }
    }

    func locationManager(_ _: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard continuation != nil, let location = locations.last, Self.isPublishable(location) else { return }
        if let bestLocation, !Self.isPublishable(bestLocation) { self.bestLocation = nil }
        if location.horizontalAccuracy < (bestLocation?.horizontalAccuracy ?? .infinity) {
            bestLocation = location
        }
        if location.horizontalAccuracy <= Self.preferredPublishAccuracyMeters {
            finishWithHeading(location)
        }
    }

    /// startUpdatingHeading() and a cached or quick fix race: publishing at once stored heading 0°
    /// (north) whenever the first compass sample had not arrived yet. Wait up to 0.8 s for it.
    private func finishWithHeading(_ location: CLLocation) {
        if latestHeading != nil || !CLLocationManager.headingAvailable() {
            finish(makeGeoPose(from: location))
            return
        }
        // A later but less accurate fix must not replace the one already waiting for the compass.
        if let waiting = awaitingHeading, waiting.horizontalAccuracy <= location.horizontalAccuracy { return }
        awaitingHeading = location
        guard headingWait == nil else { return }
        headingWait = Task { @MainActor [weak self] in
            do { try await Task.sleep(for: .milliseconds(800)) } catch { return }
            self?.finishAwaitingHeading()
        }
    }

    private func finishAwaitingHeading() {
        guard let location = awaitingHeading else { return }
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

    func locationManager(_ _: CLLocationManager, didFailWithError error: Error) {
        if let locationError = error as? CLError, locationError.code == .locationUnknown {
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
        latestHeading = nil
        awaitingHeading = nil
        headingWait?.cancel()
        headingWait = nil
        manager.stopUpdatingLocation()
        manager.stopUpdatingHeading()
        continuation.resume(returning: pose)
    }

    nonisolated static func isPublishable(_ location: CLLocation, at now: Date = Date()) -> Bool {
        LocationSample(location).isUsable(at: now, maxAge: maximumCachedFixAge)
            && location.horizontalAccuracy <= maximumPublishAccuracyMeters
    }

    nonisolated static func validHeading(_ value: CLLocationDirection?) -> CLLocationDirection? {
        guard let value, value.isFinite, value >= 0 else { return nil }
        return value.truncatingRemainder(dividingBy: 360)
    }
}
