@preconcurrency import CoreLocation
import Foundation
import Observation

@MainActor
@Observable
final class LocationController: NSObject, @preconcurrency CLLocationManagerDelegate {
    private(set) var location: CLLocation?
    private(set) var heading: CLHeading?
    private(set) var authorizationStatus: CLAuthorizationStatus
    private(set) var errorMessage: String?
    @ObservationIgnored private let manager = CLLocationManager()
    @ObservationIgnored private var wantsLocationUpdates = false
    @ObservationIgnored private var wantsPreciseAccuracy = false

    /// Purpose key in Info.plist `NSLocationTemporaryUsageDescriptionDictionary`.
    nonisolated static let geospatialAccuracyPurposeKey = "GeospatialAccuracy"

    override init() {
        authorizationStatus = manager.authorizationStatus
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
        manager.startUpdatingLocation()
        if CLLocationManager.headingAvailable() { manager.startUpdatingHeading() }
    }

    /// ARCore Geospatial needs precise location. When the user granted only approximate location,
    /// ask once per AR session for temporary full accuracy (iOS shows the purpose string).
    func requestPreciseAccuracyIfNeeded() {
        wantsPreciseAccuracy = true
        let status = manager.authorizationStatus
        guard status == .authorizedWhenInUse || status == .authorizedAlways,
              manager.accuracyAuthorization == .reducedAccuracy else { return }
        wantsPreciseAccuracy = false
        manager.requestTemporaryFullAccuracyAuthorization(withPurposeKey: Self.geospatialAccuracyPurposeKey)
    }

    func stop() {
        wantsLocationUpdates = false
        manager.stopUpdatingLocation()
        manager.stopUpdatingHeading()
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
        guard let latest = locations.last, latest.horizontalAccuracy >= 0 else { return }
        location = latest
        errorMessage = nil
    }

    func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
        guard newHeading.headingAccuracy >= 0 else { return }
        heading = newHeading
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        guard let locationError = error as? CLError else {
            errorMessage = String(localized: "Konum alınamadı. Tekrar deneyin.")
            return
        }
        switch locationError.code {
        case .denied:
            errorMessage = String(localized: "Konum izni kapalı. Ayarlar’dan LociAR için konumu açın.")
        case .locationUnknown:
            errorMessage = String(localized: "Konum aranıyor. Açık bir alanda kısa süre bekleyin.")
        case .network:
            errorMessage = String(localized: "Konum servisine ulaşılamıyor. Bağlantınızı kontrol edin.")
        default:
            errorMessage = String(localized: "Konum şu anda alınamıyor. Biraz sonra tekrar deneyin.")
        }
    }
}
