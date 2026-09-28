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
            errorMessage = "Konum izni gerekli. Ayarlar'dan konum erişimini açın."
            return
        }
        authorizationStatus = manager.authorizationStatus
        if authorizationStatus == .notDetermined {
            manager.requestWhenInUseAuthorization()
            return
        }
        guard authorizationStatus != .denied, authorizationStatus != .restricted else {
            errorMessage = "Konum izni gerekli. Ayarlar'dan konum erişimini açın."
            return
        }
        manager.startUpdatingLocation()
        if CLLocationManager.headingAvailable() { manager.startUpdatingHeading() }
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
        } else if authorizationStatus == .denied || authorizationStatus == .restricted {
            stop()
            errorMessage = "Konum izni gerekli. Ayarlar'dan konum erişimini açın."
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
            errorMessage = "Konum alınamadı. Tekrar deneyin."
            return
        }
        switch locationError.code {
        case .denied:
            errorMessage = "Konum izni kapalı. Ayarlar’dan LociAR için konumu açın."
        case .locationUnknown:
            errorMessage = "Konum aranıyor. Açık bir alanda kısa süre bekleyin."
        case .network:
            errorMessage = "Konum servisine ulaşılamıyor. Bağlantınızı kontrol edin."
        default:
            errorMessage = "Konum şu anda alınamıyor. Biraz sonra tekrar deneyin."
        }
    }
}
