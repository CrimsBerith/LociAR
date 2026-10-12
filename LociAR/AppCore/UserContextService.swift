@preconcurrency import CoreLocation
@preconcurrency import FirebaseAuth
import Foundation
import Observation
import UIKit

/// Optional, disclosed administrator data sharing. No background location service.
@MainActor
@Observable
final class UserContextService: NSObject, @preconcurrency CLLocationManagerDelegate {
    static let shared = UserContextService()
    private(set) var telemetryEnabled = false
    private(set) var locationEnabled = false
    private(set) var promotionsEnabled = false
    private(set) var arrivalsEnabled = false
    private(set) var departuresEnabled = false
    private(set) var placeNotesEnabled = false
    private(set) var notificationsEnabled = false
    private(set) var isBusy = false
    private(set) var locationPermissionDenied = false
    private(set) var errorMessage: String?
    @ObservationIgnored private let manager = CLLocationManager()
    @ObservationIgnored private var callables: CallableClient?
    @ObservationIgnored private var userID: UUID?
    @ObservationIgnored private var foreground = false
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var loop: Task<Void, Never>?
    @ObservationIgnored private var preferencesRevision = ""
    @ObservationIgnored private var latestLocation: CLLocation?
    @ObservationIgnored private var lastDeviceUpload = Date.distantPast
    @ObservationIgnored private var lastLocationUpload = Date.distantPast
    @ObservationIgnored private var installationID: String
    private static let noticeVersion = "2026-10-11"

    private struct Preferences: Decodable {
        let ok: Bool; let telemetry: Bool; let location: Bool; let revision: String
        let promotions: Bool?
        let arrivals: Bool?
        let departures: Bool?
        let placeNotes: Bool?
        let notifications: Bool?
    }
    private struct Identity: Encodable { let userId: String }
    private struct PreferencePayload: Encodable {
        let userId: String; let telemetry: Bool; let location: Bool; let revision: String; let noticeVersion: String
        let promotions: Bool; let promotionsNoticeVersion: String
        let arrivals: Bool; let arrivalsNoticeVersion: String
        let departures: Bool; let departuresNoticeVersion: String
        let placeNotes: Bool; let placeNotesNoticeVersion: String
        let notifications: Bool; let notificationsNoticeVersion: String
    }
    private struct Device: Encodable {
        let model: String; let osVersion: String; let appVersion: String; let appBuild: String
        let locale: String; let timeZone: String
    }
    private struct Fix: Encodable { let lat: Double; let lng: Double; let accuracy: Double; let measuredAt: Double }
    private struct Context: Encodable {
        let userId: String; let installationId: String; let revision: String; let device: Device?; let location: Fix?
    }
    private struct Response: Decodable { let ok: Bool }

    private override init() {
        let defaults = UserDefaults.standard, key = "lociar.context-installation-id"
        let id = defaults.string(forKey: key).flatMap(UUID.init(uuidString:)) ?? UUID()
        installationID = id.uuidString.lowercased()
        defaults.set(installationID, forKey: key)
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
        manager.distanceFilter = 20
    }

    func configure(callables: CallableClient) {
        self.callables = callables
        CampaignArrivalService.shared.configure(callables: callables)
    }

    func setUser(_ id: UUID?) {
        CampaignArrivalService.shared.setUser(id)
        guard id != userID else { return }
        generation += 1
        loop?.cancel(); loop = nil
        manager.stopUpdatingLocation(); latestLocation = nil
        userID = id; preferencesRevision = ""
        telemetryEnabled = false; locationEnabled = false; errorMessage = nil; isBusy = false
        promotionsEnabled = false
        arrivalsEnabled = false
        departuresEnabled = false
        placeNotesEnabled = false
        notificationsEnabled = false
        NotificationService.shared.setDeliveryEnabled(false)
        if let id, UserDefaults.standard.object(forKey: pendingKey(id)) == nil {
            notificationsEnabled = UserDefaults.standard.bool(forKey: "lociar.notifications.enabled.\(id.uuidString)")
            NotificationService.shared.setDeliveryEnabled(notificationsEnabled)
        }
        locationPermissionDenied = false
        lastDeviceUpload = .distantPast; lastLocationUpload = .distantPast
        startLoop()
    }

    func setForeground(_ active: Bool) {
        CampaignArrivalService.shared.setForeground(active)
        foreground = active
        if active { startLoop() }
        else {
            generation += 1
            loop?.cancel(); loop = nil
            manager.stopUpdatingLocation(); latestLocation = nil
        }
    }

    private func pendingKey(_ id: UUID) -> String { "lociar.data-preferences.pending.\(id.uuidString)" }

    private func startLoop() {
        guard foreground, userID != nil, callables != nil, loop == nil, !isBusy else { return }
        let epoch = generation
        loop = Task { [weak self] in
            while let self, !Task.isCancelled, self.generation == epoch, self.foreground {
                await self.refresh(epoch: epoch)
                guard !Task.isCancelled, self.generation == epoch else { return }
                await self.upload(epoch: epoch)
                do { try await Task.sleep(for: .seconds(60)) } catch { return }
            }
        }
    }

    private func valid(_ id: UUID, _ epoch: Int) -> Bool {
        generation == epoch && userID == id && FirebaseIdentity.currentLUID() == id && foreground
    }

    private func refresh(epoch: Int) async {
        guard let id = userID, let callables, valid(id, epoch), !isBusy else { return }
        do {
            var response: Preferences = try await callables.call("readDataPreferences", payload: Identity(userId: FirebaseIdentity.key(id)))
            guard valid(id, epoch), !Task.isCancelled else { return }
            // Persist failed revocations locally: offline retries never resume sharing accidentally.
            if let pending = UserDefaults.standard.dictionary(forKey: pendingKey(id)) as? [String: Bool] {
                response = try await callables.call("setDataPreferences", payload: PreferencePayload(
                    userId: FirebaseIdentity.key(id), telemetry: pending["telemetry"] == true,
                    location: pending["location"] == true, revision: response.revision, noticeVersion: Self.noticeVersion,
                    promotions: pending["promotions"] ?? (response.promotions == true), promotionsNoticeVersion: "2026-10-11-promotions",
                    arrivals: pending["arrivals"] ?? (response.arrivals == true), arrivalsNoticeVersion: "2026-10-11-arrivals",
                    departures: pending["departures"] ?? (response.departures == true), departuresNoticeVersion: "2026-10-11-departures",
                    placeNotes: pending["placeNotes"] ?? (response.placeNotes == true), placeNotesNoticeVersion: "2026-10-11-place-notes",
                    notifications: pending["notifications"] ?? (response.notifications == true), notificationsNoticeVersion: "2026-10-11-notifications"))
                guard valid(id, epoch), !Task.isCancelled else { return }
                UserDefaults.standard.removeObject(forKey: pendingKey(id))
            }
            guard response.ok else { throw BackendCallError.invalidResponse }
            telemetryEnabled = response.telemetry; locationEnabled = response.location
            promotionsEnabled = response.promotions == true
            arrivalsEnabled = response.arrivals == true && promotionsEnabled
            departuresEnabled = response.departures == true && promotionsEnabled
            placeNotesEnabled = response.placeNotes == true
            notificationsEnabled = response.notifications == true
            UserDefaults.standard.set(notificationsEnabled, forKey: "lociar.notifications.enabled.\(id.uuidString)")
            NotificationService.shared.setDeliveryEnabled(notificationsEnabled)
            CampaignArrivalService.shared.setPlaceNotesEnabled(placeNotesEnabled)
            CampaignArrivalService.shared.setPromotionsEnabled(promotionsEnabled && notificationsEnabled)
            CampaignArrivalService.shared.setEnabled(notificationsEnabled)
            preferencesRevision = response.revision
            updateLocationService()
            await CampaignArrivalService.shared.synchronize()
            guard valid(id, epoch), !Task.isCancelled else { return }
            errorMessage = nil
        } catch {
            guard valid(id, epoch), !Task.isCancelled else { return }
            manager.stopUpdatingLocation(); latestLocation = nil
            preferencesRevision = "" // fail closed until preferences can be refreshed
            errorMessage = String(localized: "Veri paylaşımı güncellenemedi. Bağlantını kontrol edip tekrar dene.")
        }
    }

    func setSharing(telemetry: Bool, location: Bool, promotions: Bool? = nil, arrivals: Bool? = nil, departures: Bool? = nil, placeNotes: Bool? = nil, notifications: Bool? = nil) async {
        guard let id = userID, let callables, !isBusy else { return }
        generation += 1
        let epoch = generation
        let previous = loop
        previous?.cancel(); loop = nil
        isBusy = true; errorMessage = nil
        defer {
            if userID == id { isBusy = false; startLoop() }
        }
        manager.stopUpdatingLocation(); latestLocation = nil
        telemetryEnabled = telemetry; locationEnabled = location
        promotionsEnabled = promotions ?? promotionsEnabled
        arrivalsEnabled = (arrivals ?? arrivalsEnabled) && promotionsEnabled
        departuresEnabled = (departures ?? departuresEnabled) && promotionsEnabled
        placeNotesEnabled = placeNotes ?? placeNotesEnabled
        notificationsEnabled = notifications ?? notificationsEnabled
        if !notificationsEnabled {
            UserDefaults.standard.set(false, forKey: "lociar.notifications.enabled.\(id.uuidString)")
            NotificationService.shared.setDeliveryEnabled(false)
        }
        CampaignArrivalService.shared.setEnabled(false) // pending changes fence background admission locally
        UserDefaults.standard.set(["telemetry": telemetry, "location": location, "promotions": promotionsEnabled, "arrivals": arrivalsEnabled, "departures": departuresEnabled, "placeNotes": placeNotesEnabled, "notifications": notificationsEnabled], forKey: pendingKey(id))
        await previous?.value // drain any upload before deleting server snapshots
        guard userID == id, generation == epoch else { return }
        do {
            let current: Preferences = try await callables.call("readDataPreferences", payload: Identity(userId: FirebaseIdentity.key(id)))
            guard valid(id, epoch) else { throw AuthFlowError.notSignedIn }
            let response: Preferences = try await callables.call("setDataPreferences", payload: PreferencePayload(
                userId: FirebaseIdentity.key(id), telemetry: telemetry, location: location,
                revision: current.revision, noticeVersion: Self.noticeVersion,
                promotions: promotionsEnabled, promotionsNoticeVersion: "2026-10-11-promotions",
                arrivals: arrivalsEnabled, arrivalsNoticeVersion: "2026-10-11-arrivals",
                departures: departuresEnabled, departuresNoticeVersion: "2026-10-11-departures",
                placeNotes: placeNotesEnabled, placeNotesNoticeVersion: "2026-10-11-place-notes",
                notifications: notificationsEnabled, notificationsNoticeVersion: "2026-10-11-notifications"))
            guard valid(id, epoch), response.ok else { throw AuthFlowError.notSignedIn }
            UserDefaults.standard.removeObject(forKey: pendingKey(id))
            preferencesRevision = response.revision
            promotionsEnabled = response.promotions == true
            arrivalsEnabled = response.arrivals == true
            departuresEnabled = response.departures == true
            placeNotesEnabled = response.placeNotes == true
            notificationsEnabled = response.notifications == true
            UserDefaults.standard.set(notificationsEnabled, forKey: "lociar.notifications.enabled.\(id.uuidString)")
            NotificationService.shared.setDeliveryEnabled(notificationsEnabled)
            CampaignArrivalService.shared.setPlaceNotesEnabled(placeNotesEnabled)
            CampaignArrivalService.shared.setPromotionsEnabled(promotionsEnabled && notificationsEnabled)
            CampaignArrivalService.shared.setEnabled(notificationsEnabled)
            if location, manager.authorizationStatus == .notDetermined { manager.requestWhenInUseAuthorization() }
            updateLocationService()
        } catch {
            guard userID == id, generation == epoch else { return }
            preferencesRevision = ""
            errorMessage = String(localized: "Veri paylaşımı güncellenemedi. Bağlantını kontrol edip tekrar dene.")
        }
    }

    private func updateLocationService() {
        locationPermissionDenied = locationEnabled && (manager.authorizationStatus == .denied || manager.authorizationStatus == .restricted)
        guard locationEnabled, foreground, !preferencesRevision.isEmpty,
              manager.authorizationStatus == .authorizedWhenInUse || manager.authorizationStatus == .authorizedAlways else {
            manager.stopUpdatingLocation(); latestLocation = nil; return
        }
        manager.startUpdatingLocation()
    }

    private func upload(epoch: Int) async {
        guard let id = userID, let callables, valid(id, epoch), !preferencesRevision.isEmpty,
              UserDefaults.standard.object(forKey: pendingKey(id)) == nil, !isBusy else { return }
        let now = Date()
        var device: Device?
        if telemetryEnabled, now.timeIntervalSince(lastDeviceUpload) >= 60 {
            device = Device(model: UIDevice.current.model, osVersion: UIDevice.current.systemVersion,
                appVersion: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown",
                appBuild: Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "unknown",
                locale: Locale.current.identifier, timeZone: TimeZone.current.identifier)
        }
        var fix: Fix?
        if locationEnabled, let location = latestLocation, location.horizontalAccuracy >= 0,
           location.horizontalAccuracy <= 10_000, now.timeIntervalSince(location.timestamp) < 90,
           now.timeIntervalSince(location.timestamp) >= -5, now.timeIntervalSince(lastLocationUpload) >= 30 {
            fix = Fix(lat: location.coordinate.latitude, lng: location.coordinate.longitude,
                      accuracy: location.horizontalAccuracy, measuredAt: location.timestamp.timeIntervalSince1970 * 1000)
        }
        guard device != nil || fix != nil else { return }
        do {
            let response: Response = try await callables.call("recordUserContext", payload: Context(
                userId: FirebaseIdentity.key(id), installationId: installationID, revision: preferencesRevision, device: device, location: fix))
            guard valid(id, epoch), response.ok else { return }
            if device != nil { lastDeviceUpload = now }
            if fix != nil { lastLocationUpload = now }
        } catch {
            guard valid(id, epoch) else { return }
            errorMessage = String(localized: "Veri paylaşımı güncellenemedi. Bağlantını kontrol edip tekrar dene.")
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) { updateLocationService() }
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard foreground, locationEnabled else { return }
        latestLocation = locations.last
    }
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) { latestLocation = nil }
}
