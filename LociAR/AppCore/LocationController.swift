@preconcurrency import CoreLocation
import Foundation
import Observation

@MainActor
@Observable
final class LocationController: NSObject, @preconcurrency CLLocationManagerDelegate {
    private(set) var location: CLLocation?
    /// Fresh fixes seed the note composer so its estimate is ready sooner.
    private(set) var recentLocations: [CLLocation] = []
    private(set) var heading: CLHeading?
    private(set) var authorizationStatus: CLAuthorizationStatus
    private(set) var errorMessage: String?
    @ObservationIgnored private let manager: CLLocationManager
    @ObservationIgnored private var wantsLocationUpdates = false
    @ObservationIgnored private var wantsPreciseAccuracy = false
    /// One temporary full-accuracy prompt per AR session (reset by stop()), not one per retry.
    @ObservationIgnored private var didRequestPreciseAccuracy = false

    /// A retained UI value cannot seed a new map/AR search after the GPS stream stops.
    func freshLocation(at now: Date = Date()) -> CLLocation? {
        ArrivalFixSelection.latest(location.map { [$0] } ?? [], at: now,
                                   maxAge: LocationNotePolicy.maxFixAge)
    }

    /// Purpose key in Info.plist `NSLocationTemporaryUsageDescriptionDictionary`.
    nonisolated static let geospatialAccuracyPurposeKey = "GeospatialAccuracy"

    override convenience init() {
        self.init(locationManager: CLLocationManager())
    }

    init(locationManager: CLLocationManager) {
        manager = locationManager
        authorizationStatus = manager.authorizationStatus
        errorMessage = nil
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = 1
        manager.headingFilter = 1
    }

    func start() {
        wantsLocationUpdates = true
        if UITestFixtures.locationPermissionDenied {
            authorizationStatus = .denied
            errorMessage = String(localized: "Konum izni gerekli. Ayarlar'dan konum erişimini açın.")
            return
        }
        authorizationStatus = manager.authorizationStatus
        if authorizationStatus == .notDetermined {
            manager.requestWhenInUseAuthorization()
            return
        }
        guard authorizationStatus != .denied, authorizationStatus != .restricted else {
            errorMessage = String(localized: "Konum izni gerekli. Ayarlar'dan konum erişimini açın.")
            return
        }
        errorMessage = nil
        manager.startUpdatingLocation()
        if CLLocationManager.headingAvailable() { manager.startUpdatingHeading() }
    }

    /// ARCore Geospatial needs precise location. When the user granted only approximate location,
    /// ask once per AR session for temporary full accuracy (iOS shows the purpose string).
    func requestPreciseAccuracyIfNeeded() {
        guard !didRequestPreciseAccuracy else { return }
        let status = manager.authorizationStatus
        // Not decided yet: ask once the user answers the location prompt (authorization callback).
        wantsPreciseAccuracy = status == .notDetermined
        guard status == .authorizedWhenInUse || status == .authorizedAlways,
              manager.accuracyAuthorization == .reducedAccuracy else { return }
        didRequestPreciseAccuracy = true
        manager.requestTemporaryFullAccuracyAuthorization(withPurposeKey: Self.geospatialAccuracyPurposeKey)
    }

    func stop() {
        wantsLocationUpdates = false
        wantsPreciseAccuracy = false
        didRequestPreciseAccuracy = false
        manager.stopUpdatingLocation()
        manager.stopUpdatingHeading()
        location = nil
        recentLocations = []
        heading = nil
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        authorizationStatus = manager.authorizationStatus
        guard wantsLocationUpdates else { return }
        if authorizationStatus == .authorizedAlways || authorizationStatus == .authorizedWhenInUse {
            errorMessage = nil
            start()
            if wantsPreciseAccuracy { requestPreciseAccuracyIfNeeded() }
        } else if authorizationStatus == .denied || authorizationStatus == .restricted {
            stop()
            errorMessage = String(localized: "Konum izni gerekli. Ayarlar'dan konum erişimini açın.")
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard wantsLocationUpdates else { return }
        let now = Date()
        let valid = locations.filter { LocationSample($0).isUsable(at: now, maxAge: LocationNotePolicy.maxFixAge) }
        guard let latest = valid.max(by: { $0.timestamp < $1.timestamp }) else { return }
        location = latest
        recentLocations = (recentLocations + valid).filter { LocationSample($0).isUsable(at: now) }.suffix(20)
        errorMessage = nil
    }

    func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
        guard wantsLocationUpdates, newHeading.headingAccuracy >= 0 else { return }
        heading = newHeading
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        guard wantsLocationUpdates else { return }
        guard let locationError = error as? CLError else {
            errorMessage = String(localized: "Konum alınamadı. Tekrar deneyin.")
            return
        }
        switch locationError.code {
        case .denied:
            errorMessage = String(localized: "Konum izni kapalı. Ayarlar’dan LociAR için konumu açın.")
        case .locationUnknown:
            // Core Location is still acquiring a fix. Map/AR already bound their own wait;
            // an initial transient error must not abort that wait before the next callback.
            errorMessage = nil
        case .network:
            errorMessage = String(localized: "Konum servisine ulaşılamıyor. Bağlantınızı kontrol edin.")
        default:
            errorMessage = String(localized: "Konum şu anda alınamıyor. Biraz sonra tekrar deneyin.")
        }
    }
}
