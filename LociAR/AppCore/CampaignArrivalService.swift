@preconcurrency import CoreLocation
import Foundation
import Observation
import UIKit
import UserNotifications

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

    var isExit: Bool { transition == "exit" }
    var isPlaceNote: Bool { kind == "place_note" }
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
        return lat.isFinite && abs(lat) <= 90 && lng.isFinite && abs(lng) <= 180
            && radius.isFinite && (100...500).contains(radius) && expiresAt.isFinite
            && expiresAt > now.timeIntervalSince1970 * 1000 && (transition == nil || transition == "entry" || transition == "exit")
            && (kind == nil || kind == "place_note")
            && (triggerRadius == nil || (triggerRadius!.isFinite && radii.contains(triggerRadius!)))
            && (notes == nil || (isPlaceNote && notes!.count <= 50 && notes!.allSatisfy {
                $0.lat.isFinite && abs($0.lat) <= 90 && $0.lng.isFinite && abs($0.lng) <= 180 && Self.noteRadii.contains($0.r)
            }))
    }

    /// iOS monitors at most 20 regions. Location notes keep up to 15; campaigns use the rest.
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
        let notes = sorted.filter(\.isPlaceNote), campaigns = sorted.filter { !$0.isPlaceNote }
        let keptCampaigns = Array(campaigns.prefix(20 - min(notes.count, 15)))
        return keptCampaigns + notes.prefix(20 - keptCampaigns.count)
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
    private(set) var isSupported = true
    @ObservationIgnored private let manager = CLLocationManager()
    @ObservationIgnored private var callables: CallableClient?
    @ObservationIgnored private var userID: UUID?
    @ObservationIgnored private var enabled = false
    @ObservationIgnored private var placeNotesEnabled = false
    @ObservationIgnored private var foreground = false
    @ObservationIgnored private var lastFixRequest = Date.distantPast
    @ObservationIgnored private var lastRegionRefresh = Date.distantPast
    @ObservationIgnored private var precisionTargets = Set<UUID>()
    @ObservationIgnored private var firstGood: [UUID: Date] = [:]
    @ObservationIgnored private var nextAttempt: [UUID: Date] = [:]
    @ObservationIgnored private var failures: [UUID: Int] = [:]
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
    private func prefix(_ id: UUID) -> String { "lociar.arrival.\(id.uuidString.lowercased())." }

    func configure(callables: CallableClient) {
        self.callables = callables
        // Region wake-ups may arrive before the SwiftUI session finishes its bootstrap.
        setUser(FirebaseIdentity.currentLUID())
        if userID == nil { stopRegions() }
    }

    func setUser(_ id: UUID?) {
        guard id != userID else { return }
        stopPreciseWindow(); manager.stopUpdatingLocation()
        generation += 1; pending.removeAll(); regions.removeAll(); armedExits.removeAll(); endBackgroundTask()
        userID = id; enabled = false; placeNotesEnabled = false
        for region in manager.monitoredRegions where region.identifier.hasPrefix("lociar.arrival.") && !region.identifier.hasPrefix(id.map(prefix) ?? "no-session") {
            manager.stopMonitoring(for: region)
        }
        if let id {
            let defaults = UserDefaults.standard
            enabled = defaults.bool(forKey: consentKey(id)) && defaults.object(forKey: "lociar.data-preferences.pending.\(id.uuidString)") == nil
            placeNotesEnabled = enabled && defaults.bool(forKey: notesKey(id))
            if let data = defaults.data(forKey: regionsKey(id)), let saved = try? JSONDecoder().decode([CampaignRegion].self, from: data) {
                regions = Dictionary(saved.filter { $0.isUsable(at: Date()) }.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
            }
            armedExits = Set((defaults.stringArray(forKey: armedKey(id)) ?? []).compactMap(UUID.init(uuidString:))).intersection(Set(regions.keys))
        }
        updatePermissionState()
        if !enabled { stopRegions() }
        else { Task { await synchronize() } }
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

    func setPlaceNotesEnabled(_ value: Bool) {
        placeNotesEnabled = value
        if let userID { UserDefaults.standard.set(value, forKey: notesKey(userID)) }
        updatePermissionState()
    }

    func setForeground(_ value: Bool) {
        foreground = value
        if value, enabled { manager.startUpdatingLocation() }
        else if preciseWindow == nil { manager.stopUpdatingLocation() }
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

    private func updatePermissionState() {
        needsAlwaysPermission = enabled && manager.authorizationStatus != .authorizedAlways
        needsPreciseLocation = enabled && placeNotesEnabled && manager.authorizationStatus != .denied
            && manager.authorizationStatus != .notDetermined && manager.accuracyAuthorization == .reducedAccuracy
        // ~500 m moves wake the app so the 20 monitored regions follow the user in the background.
        let wantsSignificant = enabled && placeNotesEnabled && manager.authorizationStatus == .authorizedAlways
            && CLLocationManager.significantLocationChangeMonitoringAvailable()
        if wantsSignificant != monitoringSignificantChanges {
            monitoringSignificantChanges = wantsSignificant
            if wantsSignificant { manager.startMonitoringSignificantLocationChanges() } else { manager.stopMonitoringSignificantLocationChanges() }
        }
    }

    private func stopRegions() {
        stopPreciseWindow()
        manager.stopUpdatingLocation()
        for region in manager.monitoredRegions where region.identifier.hasPrefix("lociar.arrival.") { manager.stopMonitoring(for: region) }
        regions.removeAll(); pending.removeAll()
        armedExits.removeAll()
        if let userID { UserDefaults.standard.removeObject(forKey: regionsKey(userID)); UserDefaults.standard.removeObject(forKey: armedKey(userID)) }
    }

    private struct RegionResponse: Decodable { let regions: [CampaignRegion] }
    private struct EmptyPayload: Encodable { let userId: String }
    private struct NoteRegionPayload: Encodable { let userId: String; let location: Fix }

    /// A fix good enough for the server's coarse 3 km region search, foreground or not.
    private var regionSearchFix: CLLocation? {
        guard let fix = manager.location, fix.horizontalAccuracy >= 0, fix.horizontalAccuracy <= 1_000 else { return nil }
        let age = Date().timeIntervalSince(fix.timestamp)
        return age < 240 && age >= -10 ? fix : nil
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
            let response: RegionResponse = try await callables.call("readCampaignRegions", payload: EmptyPayload(userId: FirebaseIdentity.key(id)))
            guard enabled, epoch == generation, userID == id else { return }
            var all = response.regions
            if placeNotesEnabled {
                if let fix = regionSearchFix {
                    let notes: RegionResponse = try await callables.call("readPlaceNoteRegions", payload: NoteRegionPayload(userId: FirebaseIdentity.key(id), location: Self.payloadFix(fix)))
                    guard enabled, epoch == generation, userID == id else { return }
                    all += notes.regions
                } else {
                    all += regions.values.filter { $0.isPlaceNote }
                    if foreground, Date().timeIntervalSince(lastFixRequest) >= 30 { lastFixRequest = Date(); manager.requestLocation() }
                }
            }
            let selected = CampaignRegion.nearest(all, to: manager.location?.coordinate, at: Date())
            for item in selected {
                if let previous = regions[item.id], previous.lat != item.lat || previous.lng != item.lng
                    || previous.triggerRadius != item.triggerRadius || previous.notes != item.notes {
                    firstGood.removeValue(forKey: item.id); nextAttempt.removeValue(forKey: item.id); failures.removeValue(forKey: item.id)
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
            let identifiers = Set(selected.map { prefix(id) + $0.id.uuidString.lowercased() })
            for region in manager.monitoredRegions where region.identifier.hasPrefix("lociar.arrival.") && !identifiers.contains(region.identifier) { manager.stopMonitoring(for: region) }
            for item in selected {
                let identifier = prefix(id) + item.id.uuidString.lowercased()
                if let old = manager.monitoredRegions.first(where: { $0.identifier == identifier }) as? CLCircularRegion {
                    if old.center.latitude == item.lat && old.center.longitude == item.lng && old.radius == item.radius
                        && old.notifyOnExit == (item.isExit || item.isPlaceNote) && old.notifyOnEntry == !item.isExit {
                        manager.requestState(for: old); continue
                    }
                    manager.stopMonitoring(for: old)
                    armedExits.remove(item.id); persistArmedExits()
                }
                let region = CLCircularRegion(center: CLLocationCoordinate2D(latitude: item.lat, longitude: item.lng), radius: item.radius, identifier: identifier)
                // Location-note regions also report exit, which ends that region's precise window.
                region.notifyOnEntry = !item.isExit; region.notifyOnExit = item.isExit || item.isPlaceNote
                manager.startMonitoring(for: region)
            }
        } catch {
            // Keep cached regions for a later event, but every arrival must pass live server checks.
        }
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
    /// who woke the app 150 m away still reaches the note inside the window.
    private func startPreciseWindow() {
        // Campaign arrivals keep their two-minute window; a location-note target extends it to 10 minutes.
        let long = precisionTargets.contains { regions[$0]?.isPlaceNote == true }
        if preciseWindow != nil, long, !preciseWindowLong {
            preciseWindow?.cancel(); preciseWindow = nil
        }
        guard enabled, preciseWindow == nil else { return }
        preciseWindowLong = long
        setLowPower(false)
        manager.allowsBackgroundLocationUpdates = manager.authorizationStatus == .authorizedAlways
        if !foreground, manager.authorizationStatus == .authorizedAlways, backgroundSession == nil {
            backgroundSession = CLBackgroundActivitySession()
        }
        manager.startUpdatingLocation()
        preciseWindow = Task { [weak self] in
            do { try await Task.sleep(for: .seconds(long ? LocationNotePolicy.maxPreciseWindow : 120)) } catch { return }
            self?.stopPreciseWindow()
        }
    }

    private func stopPreciseWindow() {
        preciseWindow?.cancel(); preciseWindow = nil
        precisionTargets.removeAll(); firstGood.removeAll(); nextAttempt.removeAll(); failures.removeAll()
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
        precisionTargets.remove(id); firstGood.removeValue(forKey: id); failures.removeValue(forKey: id)
        if precisionTargets.isEmpty, preciseWindow != nil { stopPreciseWindow() }
    }

    private func checkPreciseEntries(_ location: CLLocation) {
        guard enabled, location.horizontalAccuracy >= 0, Date().timeIntervalSince(location.timestamp) <= LocationNotePolicy.maxFixAge else { return }
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
            if !item.permitsPreciseEntry(location, at: Date()) { firstGood.removeValue(forKey: item.id); continue }
            let now = Date()
            // Two agreeing fixes: 5 s apart for notes (2 s for campaigns), the first no older than 2 min (30 s).
            let confirmation: TimeInterval = item.isPlaceNote ? LocationNotePolicy.minConfirmation : 2
            let freshness: TimeInterval = item.isPlaceNote ? 120 : 30
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
        if preciseWindow != nil, nearestNoteEdge.isFinite { setLowPower(nearestNoteEdge > 40) }
    }

    private struct Fix: Encodable { let lat: Double; let lng: Double; let accuracy: Double; let measuredAt: Double }
    private struct ArrivalPayload: Encodable { let userId: String; let campaignId: String; let locale: String; let location: Fix; let transition: String; let confirmationStartedAt: Double? }
    private struct NoteVisitPayload: Encodable { let userId: String; let location: Fix; let confirmationStartedAt: Double? }
    private static func payloadFix(_ location: CLLocation) -> Fix {
        Fix(lat: location.coordinate.latitude, lng: location.coordinate.longitude, accuracy: location.horizontalAccuracy, measuredAt: location.timestamp.timeIntervalSince1970 * 1000)
    }
    private struct ArrivalResponse: Decodable {
        let notify: Bool; let title: String?; let body: String?; let postId: String?; let activityId: String?; let recipientId: String?
        var likes: Int? = nil; var total: Int? = nil; var reason: String? = nil; var kind: String? = nil
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
                let result: ArrivalResponse
                if placeNote {
                    result = try await callables.call("recordPlaceNoteVisit", payload: NoteVisitPayload(userId: FirebaseIdentity.key(id), location: Self.payloadFix(location), confirmationStartedAt: firstGood[campaign].map { $0.timeIntervalSince1970 * 1000 }))
                    failures.removeValue(forKey: campaign)
                    // Everything here was already delivered: stop measuring for this cluster.
                    if !result.notify, result.reason == "nothing_new" { leavePlaceNoteRegion(campaign) }
                } else {
                    result = try await callables.call("recordCampaignArrival", payload: ArrivalPayload(
                        userId: FirebaseIdentity.key(id), campaignId: campaign.uuidString.lowercased(), locale: Locale.current.identifier,
                        location: Self.payloadFix(location), transition: regions[campaign]?.isExit == true ? "exit" : "entry", confirmationStartedAt: firstGood[campaign].map { $0.timeIntervalSince1970 * 1000 }))
                }
                let text = placeNote ? Self.placeNoteText(result) : result.title.flatMap { title in result.body.map { (title, $0) } }
                let denseSpot = placeNote && result.kind == "dense_spot"
                guard handling, enabled, epoch == generation, userID == id, result.notify, result.recipientId == FirebaseIdentity.key(id),
                      let (title, body) = text, let activity = result.activityId, let post = result.postId ?? (denseSpot ? "" : nil) else { continue }
                let content = UNMutableNotificationContent()
                content.title = title; content.body = body; content.sound = .default
                if placeNote { content.threadIdentifier = "place_note_\(campaign.uuidString.lowercased())" }
                if placeNote { leavePlaceNoteRegion(campaign) } else { precisionTargets.remove(campaign); firstGood.removeValue(forKey: campaign) }
                // A dense-spot alert has no post or server activity; tapping just opens the app.
                content.userInfo = denseSpot ? ["recipient_id": FirebaseIdentity.key(id)]
                    : ["recipient_id": FirebaseIdentity.key(id), "post_id": post, "activity_id": activity]
                try await UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: activity, content: content, trigger: nil))
                if !enabled || generation != epoch || userID != id {
                    UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [activity])
                    UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [activity])
                    break
                }
                if !placeNote {
                    if let region = manager.monitoredRegions.first(where: { $0.identifier == prefix(id) + post }) { manager.stopMonitoring(for: region) }
                    regions.removeValue(forKey: campaign)
                    armedExits.remove(campaign); persistArmedExits()
                }
            } catch {
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
        if manager.authorizationStatus == .denied || manager.authorizationStatus == .restricted { stopRegions() }
        else { Task { await synchronize() } }
    }
    func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) { enqueue(region) }
    func locationManager(_ manager: CLLocationManager, didExitRegion region: CLRegion) { enqueue(region, exit: true) }
    func locationManager(_ manager: CLLocationManager, didDetermineState state: CLRegionState, for region: CLRegion) {
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
            else if foreground, placeNotesEnabled, Date().timeIntervalSince(lastRegionRefresh) >= 60 { Task { await synchronize() } }
            // Significant-change wake in the background: move the monitored regions with the user.
            else if !foreground, preciseWindow == nil, placeNotesEnabled, Date().timeIntervalSince(lastRegionRefresh) >= 120 { synchronizeInBackground() }
        }
    }
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) { endBackgroundTask() }
}
