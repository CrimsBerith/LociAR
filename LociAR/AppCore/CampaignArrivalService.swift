import BackgroundTasks
@preconcurrency import CoreLocation
@preconcurrency import FirebaseMessaging
import Foundation
import Observation
import OSLog
import UIKit
import UserNotifications

/// Contains only random delivery IDs and notification IDs, scoped to the signed-in account.
/// Captions and GPS fixes are never retained for offline notification delivery.
struct PlaceNoteDeliveryAttempt: Codable, Equatable {
    let deliveryID: UUID
    let createdAt: Date
    var queuedActivityID: String?
    func isUsable(at now: Date) -> Bool { now.timeIntervalSince(createdAt) >= -10 && now.timeIntervalSince(createdAt) < 86_400 }
}

/// Only acknowledged, account-scoped choices may restart monitoring on a background launch.
struct ArrivalMonitoringPreferences {
    let enabled: Bool
    let placeNotes: Bool
    let promotions: Bool

    init(userID: UUID, defaults: UserDefaults = .standard) {
        let id = userID.uuidString
        enabled = defaults.bool(forKey: "lociar.notifications.regions-enabled.v2.\(id)")
            && defaults.object(forKey: "lociar.data-preferences.pending.\(id)") == nil
        placeNotes = enabled && defaults.bool(forKey: "lociar.place-notes.enabled.\(id)")
        promotions = enabled && defaults.bool(forKey: "lociar.promotions.enabled.\(id)")
    }
}

/// One approved note inside a location-note wake region; `r` is its notification radius.
struct NoteTarget: Codable, Equatable {
    let lat: Double
    let lng: Double
    let r: Double
}

struct CampaignRegion: Codable, Equatable {
    let id: UUID
    let lat: Double
    let lng: Double
    let radius: Double
    let expiresAt: Double
    var transition: String? = nil
    var kind: String? = nil
    var triggerRadius: Double? = nil
    /// Location notes only: every note in this 25 m cluster (no text, no author).
    var notes: [NoteTarget]? = nil
    /// Zone-campaign steps only.
    var campaignId: String? = nil
    var stepId: String? = nil
    var trigger: String? = nil
    var zone: CampaignZone? = nil
    var dwellSeconds: Double? = nil
    var area: StepArea? = nil

    struct StepArea: Codable, Equatable { let lat: Double; let lng: Double; let radius: Double }

    var isExit: Bool { transition == "exit" }
    var isPlaceNote: Bool { kind == "place_note" }
    var isCampaignStep: Bool { kind == "campaign_step" }
    /// "Leaves usual place" steps are not monitored as regions; the usual-place region fires them.
    var isLeaveStep: Bool { isCampaignStep && trigger == "leave_usual_place" }
    private static let stepTriggers: Set<String> = ["leave_usual_place", "enter", "dwell", "exit"]
    /// Notes, dense spots and campaign arrivals share the GPS-tolerant 15-100 m rule (the server's too).
    private static let noteRadii: ClosedRange<Double> = 15...100
    private static let campaignRadii: ClosedRange<Double> = 15...100

    var targets: [NoteTarget] { notes ?? [NoteTarget(lat: lat, lng: lng, r: triggerRadius ?? 0)] }

    /// Metres from the fix to the nearest note circle; negative inside.
    func distanceToNearestTarget(_ location: CLLocation) -> CLLocationDistance {
        targets.map { location.distance(from: CLLocation(latitude: $0.lat, longitude: $0.lng)) - $0.r }.min() ?? .infinity
    }

    func permitsPreciseEntry(_ location: CLLocation, at now: Date) -> Bool {
        guard let triggerRadius, location.horizontalAccuracy.isFinite,
              location.horizontalAccuracy >= 0, now.timeIntervalSince(location.timestamp) <= LocationNotePolicy.maxFixAge,
              now.timeIntervalSince(location.timestamp) >= -5 else { return false }
        if isPlaceNote {
            // GPS is 5-50 m off: the uncertainty circle may touch the note circle (same rule as the server).
            if LocationSample(location).simulated { return false }
            if location.speed >= 0, location.speedAccuracy >= 0, location.speed > LocationNotePolicy.maxWalkingSpeed { return false }
            return targets.contains {
                LocationNotePolicy.fixInsideNote(distance: location.distance(from: CLLocation(latitude: $0.lat, longitude: $0.lng)),
                                                 accuracy: location.horizontalAccuracy, radius: $0.r)
            }
        }
        // Campaign arrival: passing the shop counts at any speed, walking or driving.
        guard Self.campaignRadii.contains(triggerRadius), !LocationSample(location).simulated else { return false }
        return LocationNotePolicy.fixInsideNote(distance: location.distance(from: CLLocation(latitude: lat, longitude: lng)),
                                                accuracy: location.horizontalAccuracy, radius: triggerRadius)
    }

    func isUsable(at now: Date) -> Bool {
        let radii = isPlaceNote ? Self.noteRadii : Self.campaignRadii
        if isCampaignStep {
            guard let campaignId, UUID(uuidString: campaignId) != nil, let stepId, !stepId.isEmpty, let trigger, Self.stepTriggers.contains(trigger) else { return false }
            if isLeaveStep { guard let area, area.lat.isFinite, abs(area.lat) <= 90, area.lng.isFinite, abs(area.lng) <= 180, area.radius > 0 else { return false } }
            else { guard zone?.isValid == true else { return false } }
        }
        return lat.isFinite && abs(lat) <= 90 && lng.isFinite && abs(lng) <= 180
            && radius.isFinite && (isCampaignStep ? (100...3_000).contains(radius) : (100...500).contains(radius)) && expiresAt.isFinite
            && expiresAt > now.timeIntervalSince1970 * 1000 && (transition == nil || transition == "entry" || transition == "exit")
            && (kind == nil || kind == "place_note" || kind == "campaign_step")
            && (triggerRadius == nil || (triggerRadius!.isFinite && radii.contains(triggerRadius!)))
            && (notes == nil || (isPlaceNote && notes!.count <= 50 && notes!.allSatisfy {
                $0.lat.isFinite && abs($0.lat) <= 90 && $0.lng.isFinite && abs($0.lng) <= 180 && Self.noteRadii.contains($0.r)
            }))
    }

    /// iOS monitors at most 20 regions; two are kept for the usual place and the refresh boundary.
    /// Location notes keep up to 13 of the other 18; campaigns use the rest. Leave steps are not monitored.
    static func nearest(_ regions: [Self], to coordinate: CLLocationCoordinate2D?, at now: Date) -> [Self] {
        let sorted = regions.filter { $0.isUsable(at: now) }.sorted {
            if let coordinate {
                let origin = CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude)
                let a = origin.distance(from: CLLocation(latitude: $0.lat, longitude: $0.lng))
                let b = origin.distance(from: CLLocation(latitude: $1.lat, longitude: $1.lng))
                if a != b { return a < b }
            }
            return $0.id.uuidString < $1.id.uuidString
        }
        let leave = sorted.filter(\.isLeaveStep), monitored = sorted.filter { !$0.isLeaveStep }
        let notes = monitored.filter(\.isPlaceNote), campaigns = monitored.filter { !$0.isPlaceNote }
        let keptCampaigns = Array(campaigns.prefix(18 - min(notes.count, 13)))
        return keptCampaigns + notes.prefix(18 - keptCampaigns.count) + leave.prefix(10)
    }
}

/// GPS regions wake the app; a short precise-location window verifies small entry circles.
@MainActor
@Observable
final class CampaignArrivalService: NSObject, @preconcurrency CLLocationManagerDelegate {
    static let shared = CampaignArrivalService()
    private(set) var needsAlwaysPermission = false
    /// Approximate location cannot drive region monitoring or 15-100 m note circles.
    private(set) var needsPreciseLocation = false
    private(set) var needsBackgroundRefresh = false
    private(set) var isSupported = true
    @ObservationIgnored private let manager = CLLocationManager()
    @ObservationIgnored private var callables: CallableClient?
    @ObservationIgnored private var userID: UUID?
    @ObservationIgnored private var enabled = false
    @ObservationIgnored private var placeNotesEnabled = false
    /// Brand campaigns opt-in; the usual place is learned only while it is on.
    @ObservationIgnored private var promotionsEnabled = false
    @ObservationIgnored private var foreground = false
    @ObservationIgnored private var lastFixRequest = Date.distantPast
    @ObservationIgnored private var lastRegionRefresh = Date.distantPast
    @ObservationIgnored private var precisionTargets = Set<UUID>()
    @ObservationIgnored private var firstGood: [UUID: Date] = [:]
    @ObservationIgnored private var noteConfirmations: [UUID: LocationNoteEntryConfirmation] = [:]
    @ObservationIgnored private var nextAttempt: [UUID: Date] = [:]
    @ObservationIgnored private var failures: [UUID: Int] = [:]
    @ObservationIgnored private var noteDeliveries: [UUID: PlaceNoteDeliveryAttempt] = [:]
    @ObservationIgnored private var lowPower = false
    @ObservationIgnored private var preciseWindowLong = false
    @ObservationIgnored private var monitoringSignificantChanges = false
    @ObservationIgnored private var backgroundSession: CLBackgroundActivitySession?
    @ObservationIgnored private var preciseWindow: Task<Void, Never>?
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var regions: [UUID: CampaignRegion] = [:]
    @ObservationIgnored private var pending = Set<UUID>()
    @ObservationIgnored private var armedExits = Set<UUID>()
    @ObservationIgnored private var handling = false
    @ObservationIgnored private var processing = false
    @ObservationIgnored private var syncing = false
    @ObservationIgnored private var backgroundTask = UIBackgroundTaskIdentifier.invalid
    @ObservationIgnored private var timeout: Task<Void, Never>?
    /// Zone-campaign step state for the current precise window.
    @ObservationIgnored private var dwellStart: [UUID: Date] = [:]
    @ObservationIgnored private var wasInside = Set<UUID>()
    @ObservationIgnored private var usualLearner = UsualPlaceLearner()
    @ObservationIgnored private var monitoringVisits = false
    nonisolated static let refreshTaskID = "com.khankartal.lociar.regions"
    private static let deliveryLog = Logger(subsystem: "com.khankartal.lociar", category: "place-note-delivery")

    private override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = 1
        manager.showsBackgroundLocationIndicator = true
        isSupported = CLLocationManager.isMonitoringAvailable(for: CLCircularRegion.self)
    }

    private func consentKey(_ id: UUID) -> String { "lociar.notifications.regions-enabled.v2.\(id.uuidString)" }
    private func regionsKey(_ id: UUID) -> String { "lociar.arrivals.regions.\(id.uuidString)" }
    private func armedKey(_ id: UUID) -> String { "lociar.departures.armed.\(id.uuidString)" }
    private func notesKey(_ id: UUID) -> String { "lociar.place-notes.enabled.\(id.uuidString)" }
    private func deliveriesKey(_ id: UUID) -> String { "lociar.place-notes.deliveries.\(id.uuidString)" }
    private func persistNoteDeliveries() {
        guard let userID else { return }
        if noteDeliveries.isEmpty { UserDefaults.standard.removeObject(forKey: deliveriesKey(userID)) }
        else if let data = try? JSONEncoder().encode(noteDeliveries) { UserDefaults.standard.set(data, forKey: deliveriesKey(userID)) }
    }
    private func promotionsKey(_ id: UUID) -> String { "lociar.promotions.enabled.\(id.uuidString)" }
    private func prefix(_ id: UUID) -> String { "lociar.arrival.\(id.uuidString.lowercased())." }
    private func usualKey(_ id: UUID) -> String { "lociar.usual-place.\(id.uuidString)" }
    private func usualIdentifier(_ id: UUID) -> String { "lociar.usual.\(id.uuidString.lowercased())" }
    private func boundaryIdentifier(_ id: UUID) -> String { "lociar.boundary.\(id.uuidString.lowercased())" }
    private static let topicKey = "lociar.area-topic"
    private static func ownsRegion(_ identifier: String) -> Bool {
        identifier.hasPrefix("lociar.arrival.") || identifier.hasPrefix("lociar.usual.") || identifier.hasPrefix("lociar.boundary.")
    }

    func configure(callables: CallableClient) {
        self.callables = callables
        // Region wake-ups may arrive before the SwiftUI session finishes its bootstrap.
        setUser(FirebaseIdentity.currentLUID())
        if userID == nil { stopRegions() }
    }

    func setUser(_ id: UUID?) {
        guard id != userID else { return }
        if let previous = userID { UserDefaults.standard.removeObject(forKey: deliveriesKey(previous)) }
        stopPreciseWindow(); manager.stopUpdatingLocation()
        generation += 1; pending.removeAll(); regions.removeAll(); armedExits.removeAll(); endBackgroundTask()
        userID = id; enabled = false; placeNotesEnabled = false; promotionsEnabled = false; noteDeliveries.removeAll()
        usualLearner = UsualPlaceLearner()
        let session = id.map { $0.uuidString.lowercased() } ?? "no-session"
        for region in manager.monitoredRegions where Self.ownsRegion(region.identifier) && !region.identifier.contains(session) {
            manager.stopMonitoring(for: region)
        }
        if let id {
            let defaults = UserDefaults.standard
            let saved = ArrivalMonitoringPreferences(userID: id, defaults: defaults)
            enabled = saved.enabled; placeNotesEnabled = saved.placeNotes; promotionsEnabled = saved.promotions
            if placeNotesEnabled, let data = defaults.data(forKey: deliveriesKey(id)), let saved = try? JSONDecoder().decode([UUID: PlaceNoteDeliveryAttempt].self, from: data) {
                noteDeliveries = saved.filter { $0.value.isUsable(at: Date()) }
            }
            if let data = defaults.data(forKey: regionsKey(id)), let saved = try? JSONDecoder().decode([CampaignRegion].self, from: data) {
                regions = Dictionary(saved.filter { $0.isUsable(at: Date()) }.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
            }
            armedExits = Set((defaults.stringArray(forKey: armedKey(id)) ?? []).compactMap(UUID.init(uuidString:))).intersection(Set(regions.keys))
            // Learned on this device only; never uploaded.
            if promotionsEnabled {
                usualLearner = defaults.data(forKey: usualKey(id)).flatMap { try? JSONDecoder().decode(UsualPlaceLearner.self, from: $0) } ?? UsualPlaceLearner()
            }
        }
        removeDisabledRegions()
        updatePermissionState()
        if !enabled { stopRegions() }
        else {
            // Cached regions must work before networking and the foreground session bootstrap.
            for region in manager.monitoredRegions where Self.ownsRegion(region.identifier) { manager.requestState(for: region) }
            Task { await synchronize() }
        }
    }

    func setEnabled(_ value: Bool) {
        guard let userID else { return }
        enabled = value
        UserDefaults.standard.set(value, forKey: consentKey(userID))
        if !value {
            generation += 1; stopRegions(); endBackgroundTask()
            removeArrivalNotifications(for: userID)
        }
        updatePermissionState()
    }

    func setPromotionsEnabled(_ value: Bool) {
        if let userID { UserDefaults.standard.set(value, forKey: promotionsKey(userID)) }
        promotionsEnabled = value
        if !value, let userID {
            // Turning campaigns off forgets the learned usual place.
            usualLearner = UsualPlaceLearner(); UserDefaults.standard.removeObject(forKey: usualKey(userID))
        }
        removeDisabledRegions()
        updatePermissionState()
    }

    func setPlaceNotesEnabled(_ value: Bool) {
        placeNotesEnabled = value
        if let userID { UserDefaults.standard.set(value, forKey: notesKey(userID)) }
        removeDisabledRegions()
        updatePermissionState()
    }

    func setForeground(_ value: Bool) {
        foreground = value
        updatePermissionState()
    }

    private func removeArrivalNotifications(for id: UUID) {
        Task {
            let center = UNUserNotificationCenter.current()
            let requests = await center.pendingNotificationRequests()
            let delivered = await center.deliveredNotifications()
            let matches: (UNNotificationRequest) -> Bool = {
                ($0.identifier.hasPrefix("arrival_") || $0.identifier.hasPrefix("place_note_") || $0.identifier.hasPrefix("dense_spot_")) && ($0.content.userInfo["recipient_id"] as? String) == FirebaseIdentity.key(id)
            }
            center.removePendingNotificationRequests(withIdentifiers: requests.filter(matches).map(\.identifier))
            center.removeDeliveredNotifications(withIdentifiers: delivered.map(\.request).filter(matches).map(\.identifier))
        }
    }

    func requestPermissions() {
        guard enabled else { return }
        if manager.authorizationStatus == .notDetermined { manager.requestWhenInUseAuthorization() }
        else if manager.authorizationStatus == .authorizedWhenInUse { manager.requestAlwaysAuthorization() }
        updatePermissionState()
    }

    func refreshPermissions() { updatePermissionState() }

    private func updatePermissionState() {
        let monitoring = enabled && (placeNotesEnabled || promotionsEnabled)
        needsAlwaysPermission = monitoring && manager.authorizationStatus != .authorizedAlways
        needsBackgroundRefresh = monitoring && UIApplication.shared.backgroundRefreshStatus != .available
        needsPreciseLocation = monitoring && manager.authorizationStatus != .denied
            && manager.authorizationStatus != .notDetermined && manager.accuracyAuthorization == .reducedAccuracy
        // ~500 m moves wake the app so the 20 monitored regions follow the user in the background.
        let always = monitoring && manager.authorizationStatus == .authorizedAlways
        let wantsSignificant = always && CLLocationManager.significantLocationChangeMonitoringAvailable()
        if wantsSignificant != monitoringSignificantChanges {
            monitoringSignificantChanges = wantsSignificant
            if wantsSignificant { manager.startMonitoringSignificantLocationChanges() } else { manager.stopMonitoringSignificantLocationChanges() }
        }
        // iOS visits teach the phone its usual place (device only) for "leaves usual place" steps.
        let wantsVisits = always && promotionsEnabled
        if wantsVisits != monitoringVisits {
            monitoringVisits = wantsVisits
            if wantsVisits { manager.startMonitoringVisits() } else { manager.stopMonitoringVisits() }
        }
        if monitoring, foreground, manager.authorizationStatus == .authorizedAlways || manager.authorizationStatus == .authorizedWhenInUse {
            if preciseWindow == nil { setLowPower(true) }
            manager.startUpdatingLocation()
        } else if preciseWindow == nil { manager.stopUpdatingLocation() }
    }

    private func removeDisabledRegions() {
        if !placeNotesEnabled { noteDeliveries.removeAll(); persistNoteDeliveries() }
        let removed = regions.values.filter { $0.isPlaceNote ? !placeNotesEnabled : !promotionsEnabled }.map(\.id)
        for id in removed {
            leavePlaceNoteRegion(id); regions.removeValue(forKey: id); pending.remove(id); armedExits.remove(id)
            if let userID, let region = manager.monitoredRegions.first(where: { $0.identifier == prefix(userID) + id.uuidString.lowercased() }) {
                manager.stopMonitoring(for: region)
            }
        }
        if !promotionsEnabled, let userID,
           let region = manager.monitoredRegions.first(where: { $0.identifier == usualIdentifier(userID) }) {
            manager.stopMonitoring(for: region)
        }
    }

    private func stopRegions() {
        stopPreciseWindow()
        manager.stopUpdatingLocation()
        for region in manager.monitoredRegions where Self.ownsRegion(region.identifier) { manager.stopMonitoring(for: region) }
        setAreaTopic(nil)
        regions.removeAll(); pending.removeAll()
        armedExits.removeAll()
        noteDeliveries.removeAll(); persistNoteDeliveries()
        if let userID { UserDefaults.standard.removeObject(forKey: regionsKey(userID)); UserDefaults.standard.removeObject(forKey: armedKey(userID)) }
    }

    private struct RegionResponse: Decodable { let regions: [CampaignRegion] }
    private struct EmptyPayload: Encodable { let userId: String }
    private struct NoteRegionPayload: Encodable { let userId: String; let location: Fix }

    /// A fix good enough for the server's coarse 3 km region search, foreground or not.
    private var regionSearchFix: CLLocation? {
        guard let fix = manager.location, fix.horizontalAccuracy <= 1_000,
              LocationSample(fix).isUsable(at: Date(), maxAge: 240) else { return nil }
        return fix
    }

    private func synchronizeInBackground() {
        var task = UIBackgroundTaskIdentifier.invalid
        task = UIApplication.shared.beginBackgroundTask(withName: "lociar.place-notes.sync") {
            UIApplication.shared.endBackgroundTask(task); task = .invalid
        }
        Task {
            await synchronize()
            if task != .invalid { UIApplication.shared.endBackgroundTask(task); task = .invalid }
        }
    }

    func synchronize() async {
        guard enabled, isSupported, !syncing, let id = userID, let callables,
              FirebaseIdentity.currentLUID() == id,
              manager.authorizationStatus == .authorizedAlways || manager.authorizationStatus == .authorizedWhenInUse else { return }
        let epoch = generation
        syncing = true
        defer { syncing = false }
        do {
            noteDeliveries = noteDeliveries.filter { $0.value.isUsable(at: Date()) }
            persistNoteDeliveries()
            for region in Array(noteDeliveries.keys) {
                await acknowledgeNoteDelivery(region, account: id, epoch: epoch)
                guard enabled, epoch == generation, userID == id else { return }
            }
            var all: [CampaignRegion] = []
            if promotionsEnabled {
                let response: RegionResponse = try await callables.call("readCampaignRegions", payload: EmptyPayload(userId: FirebaseIdentity.key(id)))
                guard enabled, epoch == generation, userID == id else { return }
                all = response.regions
                // Zone campaigns near a coarse fix; cached steps stay until the next fix.
                if let fix = regionSearchFix {
                    let steps: RegionResponse = try await callables.call("readCampaignZones", payload: NoteRegionPayload(userId: FirebaseIdentity.key(id), location: Self.payloadFix(fix)))
                    guard enabled, epoch == generation, userID == id else { return }
                    all += steps.regions
                } else {
                    all += regions.values.filter(\.isCampaignStep)
                }
            }
            if placeNotesEnabled {
                if let fix = regionSearchFix {
                    let notes: RegionResponse = try await callables.call("readPlaceNoteRegions", payload: NoteRegionPayload(userId: FirebaseIdentity.key(id), location: Self.payloadFix(fix)))
                    guard enabled, epoch == generation, userID == id else { return }
                    all += notes.regions
                    // The server has reserved an alert, but its response or local queueing may
                    // have been interrupted. Keep the cached wake region for that same request.
                    let received = Set(notes.regions.map(\.id))
                    all += regions.values.filter { $0.isPlaceNote && noteDeliveries[$0.id] != nil && !received.contains($0.id) && $0.isUsable(at: Date()) }
                } else {
                    all += regions.values.filter { $0.isPlaceNote }
                }
            }
            if regionSearchFix == nil, Date().timeIntervalSince(lastFixRequest) >= 30 {
                lastFixRequest = Date(); manager.requestLocation()
            }
            all = all.filter { $0.isPlaceNote ? placeNotesEnabled : promotionsEnabled }
            let selected = CampaignRegion.nearest(all, to: manager.location?.coordinate, at: Date())
            for item in selected {
                if let previous = regions[item.id], previous.lat != item.lat || previous.lng != item.lng
                    || previous.triggerRadius != item.triggerRadius || previous.notes != item.notes {
                    firstGood.removeValue(forKey: item.id); noteConfirmations.removeValue(forKey: item.id)
                    nextAttempt.removeValue(forKey: item.id); failures.removeValue(forKey: item.id)
                    precisionTargets.remove(item.id)
                }
            }
            lastRegionRefresh = Date()
            regions = Dictionary(selected.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
            precisionTargets.formIntersection(Set(regions.keys))
            if foreground, !selected.isEmpty { manager.startUpdatingLocation() }
            armedExits.formIntersection(Set(selected.filter(\.isExit).map(\.id)))
            persistArmedExits()
            UserDefaults.standard.set(try JSONEncoder().encode(selected), forKey: regionsKey(id))
            let monitored = selected.filter { !$0.isLeaveStep }
            let identifiers = Set(monitored.map { prefix(id) + $0.id.uuidString.lowercased() })
            for region in manager.monitoredRegions where region.identifier.hasPrefix("lociar.arrival.") && !identifiers.contains(region.identifier) { manager.stopMonitoring(for: region) }
            for item in monitored {
                let identifier = prefix(id) + item.id.uuidString.lowercased()
                if let old = manager.monitoredRegions.first(where: { $0.identifier == identifier }) as? CLCircularRegion {
                    if old.center.latitude == item.lat && old.center.longitude == item.lng && old.radius == item.radius
                        && old.notifyOnExit == (item.isExit || item.isPlaceNote || item.isCampaignStep) && old.notifyOnEntry == !item.isExit {
                        manager.requestState(for: old); continue
                    }
                    manager.stopMonitoring(for: old)
                    armedExits.remove(item.id); persistArmedExits()
                }
                let region = CLCircularRegion(center: CLLocationCoordinate2D(latitude: item.lat, longitude: item.lng), radius: item.radius, identifier: identifier)
                // Note and step regions also report exit: it ends the precise window and fires exit steps.
                region.notifyOnEntry = !item.isExit; region.notifyOnExit = item.isExit || item.isPlaceNote || item.isCampaignStep
                manager.startMonitoring(for: region)
            }
            updateUsualPlaceRegion()
            if let fix = regionSearchFix {
                monitorRefreshBoundary(around: fix, regions: monitored)
                setAreaTopic("area_" + Geohash.encode(latitude: fix.coordinate.latitude, longitude: fix.coordinate.longitude, precision: 4))
            }
            Self.scheduleBackgroundRefresh()
        } catch {
            // Keep cached regions for a later event, but every arrival must pass live server checks.
        }
    }

    /// Leaving the boundary (≥ 1 km around the last refresh) reloads the region list in the background.
    private func monitorRefreshBoundary(around fix: CLLocation, regions: [CampaignRegion]) {
        guard let id = userID, manager.authorizationStatus == .authorizedAlways else { return }
        let farthest = regions.map { fix.distance(from: CLLocation(latitude: $0.lat, longitude: $0.lng)) }.max() ?? 0
        let radius = min(3_000, max(1_000, farthest))
        let boundary = CLCircularRegion(center: fix.coordinate, radius: radius, identifier: boundaryIdentifier(id))
        boundary.notifyOnEntry = false; boundary.notifyOnExit = true
        manager.startMonitoring(for: boundary)
    }

    /// One region around the learned usual place, only while a "leaves usual place" step exists nearby.
    private func updateUsualPlaceRegion() {
        guard let id = userID else { return }
        let identifier = usualIdentifier(id)
        let wanted = regions.values.contains(where: \.isLeaveStep) && manager.authorizationStatus == .authorizedAlways
        guard promotionsEnabled, wanted, let place = usualLearner.usualPlace() else {
            if let old = manager.monitoredRegions.first(where: { $0.identifier == identifier }) { manager.stopMonitoring(for: old) }
            return
        }
        if let old = manager.monitoredRegions.first(where: { $0.identifier == identifier }) as? CLCircularRegion,
           CLLocation(latitude: old.center.latitude, longitude: old.center.longitude).distance(from: CLLocation(latitude: place.latitude, longitude: place.longitude)) < 30 { return }
        let region = CLCircularRegion(center: place, radius: 150, identifier: identifier)
        region.notifyOnEntry = false; region.notifyOnExit = true
        manager.startMonitoring(for: region)
    }

    /// The person left their usual place: queue every nearby "leaves usual place" step whose area
    /// contains that place. The check happens here; the place itself never leaves the phone.
    private func leftUsualPlace() {
        guard enabled, promotionsEnabled, let place = usualLearner.usualPlace() else { return }
        let origin = CLLocation(latitude: place.latitude, longitude: place.longitude)
        let steps = regions.values.filter { step in
            guard step.isLeaveStep, step.isUsable(at: Date()), let area = step.area else { return false }
            return origin.distance(from: CLLocation(latitude: area.lat, longitude: area.lng)) <= area.radius
        }
        guard !steps.isEmpty else { return }
        for step in steps { pending.insert(step.id) }
        beginProcessing()
        manager.requestLocation()
    }

    /// Silent pushes for this ~39 x 20 km area tell the phone to refresh without the app being opened.
    private func setAreaTopic(_ topic: String?) {
        let defaults = UserDefaults.standard, current = defaults.string(forKey: Self.topicKey)
        guard topic != current else { return }
        if let current { Messaging.messaging().unsubscribe(fromTopic: current) }
        if let topic { Messaging.messaging().subscribe(toTopic: topic) }
        defaults.set(topic, forKey: Self.topicKey)
    }

    /// Periodic background refresh as a safety net for missed pushes and boundary exits.
    nonisolated static func scheduleBackgroundRefresh() {
        let request = BGAppRefreshTaskRequest(identifier: refreshTaskID)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 3 * 3_600)
        try? BGTaskScheduler.shared.submit(request)
    }

    func handleSilentRefresh() async {
        await synchronize()
    }

    private func campaignID(for region: CLRegion) -> UUID? {
        guard let id = userID, region.identifier.hasPrefix(prefix(id)) else { return nil }
        return UUID(uuidString: String(region.identifier.dropFirst(prefix(id).count)))
    }

    private func persistArmedExits() {
        if let userID { UserDefaults.standard.set(armedExits.map(\.uuidString), forKey: armedKey(userID)) }
    }

    private func enqueue(_ region: CLRegion, exit: Bool = false) {
        guard enabled, let id = userID, region.identifier.hasPrefix(prefix(id)), FirebaseIdentity.currentLUID() == id,
              let campaign = UUID(uuidString: String(region.identifier.dropFirst(prefix(id).count))),
              regions[campaign]?.isUsable(at: Date()) == true else {
            manager.stopMonitoring(for: region); return
        }
        if regions[campaign]?.isPlaceNote == true, exit {
            leavePlaceNoteRegion(campaign)
            return
        }
        if let step = regions[campaign], step.isCampaignStep {
            if !exit {
                precisionTargets.insert(campaign); startPreciseWindow(); manager.requestLocation()
            } else if step.trigger == "exit", wasInside.contains(campaign) {
                // Left the wake circle after being inside the zone: clearly gone.
                pending.insert(campaign); beginProcessing(); manager.requestLocation()
            } else {
                leavePlaceNoteRegion(campaign)
            }
            return
        }
        guard regions[campaign]?.isExit == exit, !exit || armedExits.contains(campaign) else { return }
        if !exit, regions[campaign]?.triggerRadius != nil {
            precisionTargets.insert(campaign)
            startPreciseWindow()
            manager.requestLocation()
            return
        }
        pending.insert(campaign)
        beginProcessing()
        manager.requestLocation()
    }

    private func beginProcessing() {
        guard !handling else { return }
        handling = true
        backgroundTask = UIApplication.shared.beginBackgroundTask(withName: nil) { [weak self] in
            Task { @MainActor in self?.endBackgroundTask() }
        }
        timeout = Task { [weak self] in
            do { try await Task.sleep(for: .seconds(20)) } catch { return }
            self?.endBackgroundTask()
        }
    }

    /// Runs until every target is notified or left, or for at most 10 minutes, so a slow walker
    /// who woke the app 300 m away still reaches the note inside the window.
    private func startPreciseWindow() {
        // Campaign arrivals keep their two-minute window; notes and zone steps extend it to 10 minutes.
        let long = precisionTargets.contains { regions[$0]?.isPlaceNote == true || regions[$0]?.isCampaignStep == true }
        let dwell = precisionTargets.compactMap { regions[$0]?.dwellSeconds }.max() ?? 0
        if preciseWindow != nil, long, !preciseWindowLong {
            preciseWindow?.cancel(); preciseWindow = nil
        }
        guard enabled, preciseWindow == nil, manager.accuracyAuthorization == .fullAccuracy else { return }
        preciseWindowLong = long
        setLowPower(false)
        manager.allowsBackgroundLocationUpdates = manager.authorizationStatus == .authorizedAlways
        if !foreground, manager.authorizationStatus == .authorizedAlways, backgroundSession == nil {
            backgroundSession = CLBackgroundActivitySession()
        }
        manager.startUpdatingLocation()
        preciseWindow = Task { [weak self] in
            let seconds = long ? min(1_800, max(LocationNotePolicy.maxPreciseWindow, dwell + 300)) : 120
            do { try await Task.sleep(for: .seconds(seconds)) } catch { return }
            self?.stopPreciseWindow()
        }
    }

    private func stopPreciseWindow() {
        preciseWindow?.cancel(); preciseWindow = nil
        precisionTargets.removeAll(); firstGood.removeAll(); noteConfirmations.removeAll()
        nextAttempt.removeAll(); failures.removeAll()
        dwellStart.removeAll(); wasInside.removeAll()
        backgroundSession?.invalidate(); backgroundSession = nil
        manager.allowsBackgroundLocationUpdates = false
        setLowPower(false)
        manager.distanceFilter = 1
        if !foreground { manager.stopUpdatingLocation() }
    }

    /// Far from every note: 10 m accuracy and a 10 m filter. Near one: best accuracy, every fix.
    private func setLowPower(_ value: Bool) {
        guard value != lowPower || !value else { return }
        lowPower = value
        manager.desiredAccuracy = value ? kCLLocationAccuracyNearestTenMeters : kCLLocationAccuracyBest
        manager.distanceFilter = value ? 10 : kCLDistanceFilterNone
    }

    private func leavePlaceNoteRegion(_ id: UUID) {
        precisionTargets.remove(id); firstGood.removeValue(forKey: id); noteConfirmations.removeValue(forKey: id)
        failures.removeValue(forKey: id)
        dwellStart.removeValue(forKey: id); wasInside.remove(id)
        if precisionTargets.isEmpty, preciseWindow != nil { stopPreciseWindow() }
    }

    private func checkPreciseEntries(_ location: CLLocation) {
        guard enabled else { return }
        guard LocationSample(location).isUsable(at: Date(), maxAge: LocationNotePolicy.maxFixAge) else {
            for id in noteConfirmations.keys { firstGood.removeValue(forKey: id) }
            noteConfirmations.removeAll()
            return
        }
        var nearestNoteEdge = CLLocationDistance.infinity
        for item in regions.values where !item.isExit && item.triggerRadius != nil {
            let distance = location.distance(from: CLLocation(latitude: item.lat, longitude: item.lng))
            if foreground, distance <= item.radius { precisionTargets.insert(item.id); startPreciseWindow() }
            guard precisionTargets.contains(item.id) else { continue }
            if item.isPlaceNote {
                nearestNoteEdge = min(nearestNoteEdge, item.distanceToNearestTarget(location))
                // Background fixes outside the wake circle mean the visitor walked away.
                if !foreground, distance > item.radius + 50 { leavePlaceNoteRegion(item.id); continue }
            }
            if !item.permitsPreciseEntry(location, at: Date()) {
                firstGood.removeValue(forKey: item.id); noteConfirmations.removeValue(forKey: item.id)
                continue
            }
            let now = Date()
            if item.isPlaceNote {
                var timing = noteConfirmations[item.id] ?? LocationNoteEntryConfirmation()
                let previousStart = timing.startedAt
                let confirmed = timing.observe(sampleAt: location.timestamp)
                noteConfirmations[item.id] = timing; firstGood[item.id] = timing.startedAt
                if timing.startedAt != previousStart {
                    Task { [weak self] in
                        do { try await Task.sleep(for: .seconds(LocationNotePolicy.minConfirmation + 0.2)) } catch { return }
                        if self?.enabled == true { self?.manager.requestLocation() }
                    }
                }
                if confirmed, now >= nextAttempt[item.id] ?? .distantPast {
                    pending.insert(item.id); nextAttempt[item.id] = now.addingTimeInterval(60); beginProcessing()
                }
                continue
            }
            // Campaign arrivals retain their two-fix, two-second confirmation.
            let confirmation: TimeInterval = 2
            let freshness: TimeInterval = 30
            if firstGood[item.id] == nil || now.timeIntervalSince(firstGood[item.id]!) > freshness {
                firstGood[item.id] = location.timestamp
                Task { [weak self] in
                    do { try await Task.sleep(for: .seconds(confirmation + 0.2)) } catch { return }
                    if self?.enabled == true { self?.manager.requestLocation() }
                }
                continue
            }
            if location.timestamp.timeIntervalSince(firstGood[item.id]!) >= confirmation, now >= nextAttempt[item.id] ?? .distantPast {
                pending.insert(item.id); nextAttempt[item.id] = now.addingTimeInterval(60); beginProcessing()
            }
        }
        checkCampaignSteps(location, nearestEdge: &nearestNoteEdge)
        if preciseWindow != nil, nearestNoteEdge.isFinite { setLowPower(nearestNoteEdge > 40) }
    }

    /// Enter: two agreeing fixes 2 s apart. Dwell: continuously inside for the step's time.
    /// Exit: inside first, then clearly outside. Same zone rule as the server.
    private func checkCampaignSteps(_ location: CLLocation, nearestEdge: inout CLLocationDistance) {
        guard !LocationSample(location).simulated else { return }
        let now = Date()
        for item in regions.values where item.isCampaignStep && !item.isLeaveStep {
            guard let zone = item.zone else { continue }
            if foreground, location.distance(from: CLLocation(latitude: item.lat, longitude: item.lng)) <= item.radius {
                precisionTargets.insert(item.id); startPreciseWindow()
            }
            guard precisionTargets.contains(item.id) else { continue }
            nearestEdge = min(nearestEdge, zone.distance(to: location))
            let inside = zone.contains(location), ready = now >= nextAttempt[item.id] ?? .distantPast
            switch item.trigger {
            case "dwell":
                if inside {
                    let start = dwellStart[item.id] ?? location.timestamp
                    dwellStart[item.id] = start
                    if location.timestamp.timeIntervalSince(start) >= item.dwellSeconds ?? 60, ready {
                        pending.insert(item.id); nextAttempt[item.id] = now.addingTimeInterval(60); beginProcessing()
                    }
                } else if zone.clearlyExcludes(location) { dwellStart.removeValue(forKey: item.id) }
            case "exit":
                if inside { wasInside.insert(item.id) }
                else if wasInside.contains(item.id), zone.clearlyExcludes(location), ready {
                    pending.insert(item.id); nextAttempt[item.id] = now.addingTimeInterval(60); beginProcessing()
                }
            default:
                guard inside else { firstGood.removeValue(forKey: item.id); continue }
                if firstGood[item.id] == nil || now.timeIntervalSince(firstGood[item.id]!) > 30 {
                    firstGood[item.id] = location.timestamp
                    Task { [weak self] in
                        do { try await Task.sleep(for: .seconds(2.2)) } catch { return }
                        if self?.enabled == true { self?.manager.requestLocation() }
                    }
                } else if location.timestamp.timeIntervalSince(firstGood[item.id]!) >= 2, ready {
                    pending.insert(item.id); nextAttempt[item.id] = now.addingTimeInterval(60); beginProcessing()
                }
            }
        }
    }

    private struct Fix: Encodable { let lat: Double; let lng: Double; let accuracy: Double; let measuredAt: Double }
    private struct ArrivalPayload: Encodable { let userId: String; let campaignId: String; let locale: String; let location: Fix; let transition: String; let confirmationStartedAt: Double? }
    private struct NoteVisitPayload: Encodable { let userId: String; let location: Fix; let confirmationStartedAt: Double?; let deliveryId: String }
    private struct NoteAcknowledgement: Encodable { let action = "acknowledge"; let deliveryId: String }
    private struct StepPayload: Encodable {
        let userId: String; let campaignId: String; let stepId: String; let location: Fix
        let confirmationStartedAt: Double?; let dwellStartedAt: Double?; let locale: String
    }
    private static func payloadFix(_ location: CLLocation) -> Fix {
        Fix(lat: location.coordinate.latitude, lng: location.coordinate.longitude, accuracy: location.horizontalAccuracy, measuredAt: location.timestamp.timeIntervalSince1970 * 1000)
    }
    private struct ArrivalResponse: Decodable {
        let notify: Bool; let title: String?; let body: String?; let postId: String?; let activityId: String?; let recipientId: String?
        var likes: Int? = nil; var total: Int? = nil; var reason: String? = nil; var kind: String? = nil
        var spotLat: Double? = nil; var spotLng: Double? = nil
        var deliveryId: String? = nil
    }

    private func acknowledgeNoteDelivery(_ region: UUID, account: UUID, epoch: Int) async {
        guard enabled, placeNotesEnabled, userID == account, generation == epoch,
              let attempt = noteDeliveries[region], attempt.queuedActivityID != nil, let callables else { return }
        do {
            let _: ArrivalResponse = try await callables.call("recordPlaceNoteVisit", payload: NoteAcknowledgement(deliveryId: attempt.deliveryID.uuidString.lowercased()), timeout: 5)
            guard userID == account, generation == epoch, noteDeliveries[region]?.deliveryID == attempt.deliveryID else { return }
            noteDeliveries.removeValue(forKey: region); persistNoteDeliveries()
        } catch { /* Already queued locally; retain only the acknowledgement for a later sync. */ }
    }

    /// Location notes carry no venue name: the title counts new notes and the body leads with likes.
    private static func placeNoteText(_ result: ArrivalResponse) -> (title: String, body: String)? {
        if result.kind == "dense_spot" {
            // Text-free: dense-spot notes open only on site.
            let noteCount = result.total ?? 0
            return (String(localized: "Burada \(noteCount) not var"), String(localized: "Notları görmek için yaklaş ve haritada aç."))
        }
        guard let caption = result.body else { return nil }
        let newCount = result.total ?? 1, likeCount = result.likes ?? 0
        let title = newCount > 1 ? String(localized: "Bu konumda \(newCount) yeni not var") : String(localized: "Bu konumda bir not var")
        return (title, likeCount > 0 ? String(localized: "En faydalı (\(likeCount) beğeni): \(caption)") : caption)
    }

    private func process(_ location: CLLocation) async {
        guard !processing else { return }
        guard handling, enabled, let id = userID, let callables, location.horizontalAccuracy >= 0,
              location.horizontalAccuracy <= 200, Date().timeIntervalSince(location.timestamp) < 60,
              Date().timeIntervalSince(location.timestamp) >= -10 else { endBackgroundTask(); return }
        let epoch = generation, campaigns = pending
        processing = true
        defer { processing = false }
        pending.removeAll()
        for campaign in campaigns {
            guard handling, enabled, epoch == generation, userID == id, FirebaseIdentity.currentLUID() == id else { break }
            do {
                let placeNote = regions[campaign]?.isPlaceNote == true
                let stepRegion = regions[campaign].flatMap { $0.isCampaignStep ? $0 : nil }
                let result: ArrivalResponse
                if let step = stepRegion, let campaignID = step.campaignId, let stepID = step.stepId {
                    result = try await callables.call("recordCampaignStep", payload: StepPayload(
                        userId: FirebaseIdentity.key(id), campaignId: campaignID, stepId: stepID, location: Self.payloadFix(location),
                        confirmationStartedAt: firstGood[campaign].map { $0.timeIntervalSince1970 * 1000 },
                        dwellStartedAt: dwellStart[campaign].map { $0.timeIntervalSince1970 * 1000 }, locale: Locale.current.identifier))
                    if result.activityId != nil {
                        // Admitted: drop this step and fetch what comes next (a follow-up step may now apply).
                        if let region = manager.monitoredRegions.first(where: { $0.identifier == prefix(id) + campaign.uuidString.lowercased() }) { manager.stopMonitoring(for: region) }
                        leavePlaceNoteRegion(campaign); regions.removeValue(forKey: campaign)
                        Task { await self.synchronize() }
                    }
                } else if placeNote {
                    let authorization = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
                    guard generation == epoch, userID == id, enabled, placeNotesEnabled else { break }
                    guard [.authorized, .provisional, .ephemeral].contains(authorization) else { leavePlaceNoteRegion(campaign); continue }
                    if noteDeliveries[campaign] == nil {
                        noteDeliveries[campaign] = PlaceNoteDeliveryAttempt(deliveryID: UUID(), createdAt: Date())
                        persistNoteDeliveries() // Before the network request: response loss must reuse the same ID.
                    }
                    let attempt = noteDeliveries[campaign]!
                    if attempt.queuedActivityID != nil {
                        await acknowledgeNoteDelivery(campaign, account: id, epoch: epoch)
                        if epoch == generation, userID == id { leavePlaceNoteRegion(campaign) }
                        continue
                    }
                    let requestStarted = Date()
                    result = try await callables.call("recordPlaceNoteVisit", payload: NoteVisitPayload(userId: FirebaseIdentity.key(id), location: Self.payloadFix(location), confirmationStartedAt: firstGood[campaign].map { $0.timeIntervalSince1970 * 1000 }, deliveryId: attempt.deliveryID.uuidString.lowercased()))
                    Self.deliveryLog.info("Visit request completed in \(Int(Date().timeIntervalSince(requestStarted) * 1000), privacy: .public) ms; admitted: \(result.notify, privacy: .public)")
                    guard epoch == generation, userID == id else { break }
                    failures.removeValue(forKey: campaign)
                    // Everything here was already delivered: stop measuring for this cluster.
                    if !result.notify, ["nothing_new", "already_queued", "delivery_unavailable", "disabled"].contains(result.reason ?? "") {
                        noteDeliveries.removeValue(forKey: campaign); persistNoteDeliveries(); leavePlaceNoteRegion(campaign)
                    }
                    if !result.notify, ["stale_fix", "inaccurate_fix", "unconfirmed"].contains(result.reason ?? ""),
                       precisionTargets.contains(campaign) {
                        nextAttempt[campaign] = Date().addingTimeInterval(2)
                        manager.requestLocation()
                    }
                } else {
                    result = try await callables.call("recordCampaignArrival", payload: ArrivalPayload(
                        userId: FirebaseIdentity.key(id), campaignId: campaign.uuidString.lowercased(), locale: Locale.current.identifier,
                        location: Self.payloadFix(location), transition: regions[campaign]?.isExit == true ? "exit" : "entry", confirmationStartedAt: firstGood[campaign].map { $0.timeIntervalSince1970 * 1000 }))
                }
                let text = placeNote ? Self.placeNoteText(result) : result.title.flatMap { title in result.body.map { (title, $0) } }
                let denseSpot = placeNote && result.kind == "dense_spot"
                guard handling, enabled, placeNote ? placeNotesEnabled : promotionsEnabled,
                      epoch == generation, userID == id, result.notify, result.recipientId == FirebaseIdentity.key(id),
                      let (title, body) = text, let activity = result.activityId else { continue }
                let post = result.postId ?? ""
                let content = UNMutableNotificationContent()
                content.title = title; content.body = body; content.sound = .default
                if placeNote { content.threadIdentifier = "place_note_\(campaign.uuidString.lowercased())" }
                if stepRegion != nil { content.threadIdentifier = "campaign_\(stepRegion?.campaignId ?? "")" }
                if !placeNote { precisionTargets.remove(campaign); firstGood.removeValue(forKey: campaign) }
                // A dense-spot alert opens the map at the spot; others open their post or offer.
                var info: [String: Any] = ["recipient_id": FirebaseIdentity.key(id)]
                if denseSpot, let lat = result.spotLat, let lng = result.spotLng { info["focus_lat"] = lat; info["focus_lng"] = lng }
                if !denseSpot, !post.isEmpty { info["post_id"] = post }
                if !denseSpot { info["activity_id"] = activity }
                content.userInfo = info
                let center = UNUserNotificationCenter.current()
                if placeNote {
                    guard result.deliveryId == noteDeliveries[campaign]?.deliveryID.uuidString.lowercased() else { continue }
                    let queued = await center.pendingNotificationRequests().contains { $0.identifier == activity }
                    let delivered = await center.deliveredNotifications().contains { $0.request.identifier == activity }
                    guard handling, enabled, placeNotesEnabled, generation == epoch, userID == id else { break }
                    let queueStarted = Date()
                    if !queued && !delivered { try await center.add(UNNotificationRequest(identifier: activity, content: content, trigger: nil)) }
                    Self.deliveryLog.info("Local notification queue completed in \(Int(Date().timeIntervalSince(queueStarted) * 1000), privacy: .public) ms")
                } else { try await center.add(UNNotificationRequest(identifier: activity, content: content, trigger: nil)) }
                if !enabled || generation != epoch || userID != id {
                    UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [activity])
                    UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [activity])
                    break
                }
                if placeNote {
                    guard enabled, placeNotesEnabled, generation == epoch, userID == id else {
                        center.removePendingNotificationRequests(withIdentifiers: [activity]); center.removeDeliveredNotifications(withIdentifiers: [activity]); break
                    }
                    noteDeliveries[campaign]?.queuedActivityID = activity; persistNoteDeliveries()
                    leavePlaceNoteRegion(campaign) // Only stop GPS after local queueing succeeds.
                    await acknowledgeNoteDelivery(campaign, account: id, epoch: epoch)
                }
                if !placeNote, stepRegion == nil {
                    if let region = manager.monitoredRegions.first(where: { $0.identifier == prefix(id) + post }) { manager.stopMonitoring(for: region) }
                    regions.removeValue(forKey: campaign)
                    armedExits.remove(campaign); persistArmedExits()
                }
            } catch {
                guard enabled, generation == epoch, userID == id else { break }
                // No offline notification. A visitor still inside retries after 2, 5 and 10 s.
                if regions[campaign]?.isPlaceNote == true, precisionTargets.contains(campaign) {
                    let attempt = (failures[campaign] ?? 0) + 1
                    failures[campaign] = attempt
                    if attempt <= 3 {
                        let delay: TimeInterval = [2, 5, 10][attempt - 1]
                        nextAttempt[campaign] = Date().addingTimeInterval(delay)
                        Task { [weak self] in
                            do { try await Task.sleep(for: .seconds(delay + 0.2)) } catch { return }
                            if self?.enabled == true { self?.manager.requestLocation() }
                        }
                    }
                }
            }
        }
        guard generation == epoch, userID == id else { return }
        if handling, !pending.isEmpty { manager.requestLocation() }
        else { endBackgroundTask() }
    }

    private func endBackgroundTask() {
        handling = false; pending.removeAll(); timeout?.cancel(); timeout = nil
        if backgroundTask != .invalid { UIApplication.shared.endBackgroundTask(backgroundTask); backgroundTask = .invalid }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        updatePermissionState()
        if manager.accuracyAuthorization != .fullAccuracy || (!foreground && manager.authorizationStatus != .authorizedAlways) {
            stopPreciseWindow(); endBackgroundTask()
        }
        if manager.authorizationStatus == .denied || manager.authorizationStatus == .restricted { stopRegions() }
        else { Task { await synchronize() } }
    }
    func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) { enqueue(region) }
    func locationManager(_ manager: CLLocationManager, didExitRegion region: CLRegion) {
        guard let id = userID else { return }
        if region.identifier == usualIdentifier(id) { leftUsualPlace(); return }
        if region.identifier == boundaryIdentifier(id) {
            guard enabled else { return }
            // Refresh around a new fix, rather than the cached centre of the boundary just left.
            lastRegionRefresh = .distantPast; manager.requestLocation(); return
        }
        enqueue(region, exit: true)
    }
    func locationManager(_ manager: CLLocationManager, didVisit visit: CLVisit) {
        guard enabled, promotionsEnabled, let id = userID, visit.departureDate != .distantFuture, visit.arrivalDate != .distantPast,
              visit.horizontalAccuracy >= 0, visit.horizontalAccuracy <= 200,
              ProximityPolicy.isValidCoordinate(latitude: visit.coordinate.latitude, longitude: visit.coordinate.longitude) else { return }
        usualLearner.record(.init(lat: visit.coordinate.latitude, lng: visit.coordinate.longitude, arrival: visit.arrivalDate, departure: visit.departureDate))
        if let data = try? JSONEncoder().encode(usualLearner) { UserDefaults.standard.set(data, forKey: usualKey(id)) }
        updateUsualPlaceRegion()
    }
    func locationManager(_ manager: CLLocationManager, didDetermineState state: CLRegionState, for region: CLRegion) {
        if let id = userID, region.identifier == usualIdentifier(id) || region.identifier == boundaryIdentifier(id) { return }
        if let id = campaignID(for: region), regions[id]?.isExit == true {
            if state == .inside { armedExits.insert(id); persistArmedExits() }
            else if state == .outside { enqueue(region, exit: true) }
        } else if state == .inside { enqueue(region) }
        else if state == .outside, let id = campaignID(for: region), regions[id]?.isPlaceNote == true { leavePlaceNoteRegion(id) }
    }
    func locationManager(_ manager: CLLocationManager, didStartMonitoringFor region: CLRegion) { manager.requestState(for: region) }
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        if let location = locations.last {
            checkPreciseEntries(location)
            if handling { Task { await process(location) } }
            else if foreground, placeNotesEnabled || promotionsEnabled, Date().timeIntervalSince(lastRegionRefresh) >= 60 { Task { await synchronize() } }
            // Significant-change wake in the background: move the monitored regions with the user.
            else if !foreground, preciseWindow == nil, placeNotesEnabled || promotionsEnabled, Date().timeIntervalSince(lastRegionRefresh) >= 120 { synchronizeInBackground() }
        }
    }
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        if (error as? CLError)?.code == .locationUnknown { return }
        endBackgroundTask()
    }
}
