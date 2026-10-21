import CoreLocation
import Foundation

/// Only an explicit user action may chain When In Use to Always; never a background restore.
struct ArrivalPermissionUpgrade {
    private(set) var pending = false
    mutating func userRequested() { pending = true }
    mutating func shouldRequestAlways(status: CLAuthorizationStatus, foreground: Bool, monitoring: Bool) -> Bool {
        guard pending else { return false }
        if !monitoring || status == .authorizedAlways || status == .denied || status == .restricted { pending = false; return false }
        guard foreground, status == .authorizedWhenInUse else { return false }
        pending = false
        return true
    }
}

/// Re-evaluate when authorization or foreground state changes, even within an open window.
struct ArrivalLocationPlan: Equatable {
    let mode: ArrivalLocationMode
    let allowsBackgroundUpdates: Bool
    let pausesAutomatically: Bool

    static func resolve(monitoring: Bool, foreground: Bool, always: Bool, whenInUse: Bool,
                        fullAccuracy: Bool, hasPreciseTargets: Bool) -> Self {
        let mode = ArrivalLocationMode.resolve(monitoring: monitoring, foreground: foreground,
            authorized: always || foreground && whenInUse, fullAccuracy: fullAccuracy, hasPreciseTargets: hasPreciseTargets)
        return Self(mode: mode, allowsBackgroundUpdates: mode == .precise && always, pausesAutomatically: mode != .precise)
    }
}

/// One flight, with a follow-up for requests received while it was awaiting the network.
/// Cancelling an old account's flight cannot clear a newer account's flight.
@MainActor
final class ArrivalRegionRefreshCoordinator {
    private(set) var revision = 0
    private var flight: (id: UUID, task: Task<Bool, Never>)?

    func refresh(_ operation: @escaping @MainActor () async -> Bool) async -> Bool {
        revision += 1
        if let flight { return await flight.task.value }
        let id = UUID()
        let task = Task { @MainActor in
            var result = false
            repeat {
                let requested = self.revision
                guard !Task.isCancelled else { return false }
                result = await operation()
                if Task.isCancelled || requested == self.revision { break }
            } while true
            return !Task.isCancelled && result
        }
        flight = (id, task)
        let result = await task.value
        if flight?.id == id { flight = nil }
        return result
    }

    func cancel() { flight?.task.cancel(); flight = nil; revision += 1 }
}

/// Complete restore plan; missing OS registrations do not depend on an online fetch.
struct ArrivalRegionRegistrationPlan {
    let stop: [CLRegion]
    let start: [CLCircularRegion]
    let requestState: [CLRegion]

    static func make(account: UUID, selected: [CampaignRegion], monitored: Set<CLRegion>) -> Self {
        let prefix = "lociar.arrival.\(account.uuidString.lowercased())."
        let wanted = selected.filter { !$0.isLeaveStep }.map { item -> CLCircularRegion in
            let region = CLCircularRegion(center: .init(latitude: item.lat, longitude: item.lng), radius: item.radius,
                identifier: prefix + item.id.uuidString.lowercased())
            region.notifyOnEntry = !item.isExit
            region.notifyOnExit = item.isExit || item.isPlaceNote || item.isCampaignStep
            return region
        }
        let ids = Set(wanted.map(\.identifier))
        var stop = monitored.filter { $0.identifier.hasPrefix("lociar.arrival.") && !ids.contains($0.identifier) }
        var start: [CLCircularRegion] = []
        var state: [CLRegion] = []
        for region in wanted {
            if let old = monitored.first(where: { $0.identifier == region.identifier }) as? CLCircularRegion {
                if old.center.latitude == region.center.latitude && old.center.longitude == region.center.longitude
                    && old.radius == region.radius && old.notifyOnEntry == region.notifyOnEntry && old.notifyOnExit == region.notifyOnExit {
                    state.append(old); continue
                }
                stop.insert(old)
            }
            start.append(region)
        }
        return Self(stop: Array(stop), start: start, requestState: state)
    }
}

enum ArrivalFixSelection {
    static func latest(_ locations: [CLLocation], at now: Date, maxAge: TimeInterval, maxAccuracy: Double = .infinity,
                       notBefore: Date? = nil) -> CLLocation? {
        locations.filter { LocationSample($0).isUsable(at: now, maxAge: maxAge) && $0.horizontalAccuracy <= maxAccuracy
            && (notBefore == nil || $0.timestamp >= notBefore!) }
            .max { $0.timestamp < $1.timestamp }
    }
}

/// A failed OS registration is not a ready notification area. Retries remain bounded per area.
struct ArrivalMonitoringHealth {
    private(set) var failedIDs = Set<String>()
    private var attempts: [String: Int] = [:]
    var needsRecovery: Bool { !failedIDs.isEmpty }

    mutating func failed(_ id: String) -> TimeInterval? {
        failedIDs.insert(id)
        let count = (attempts[id] ?? 0) + 1
        attempts[id] = count
        return count <= 3 ? [1.0, 5.0, 15.0][count - 1] : nil
    }
    mutating func registered(_ id: String) { failedIDs.remove(id); attempts.removeValue(forKey: id); failedIDs.remove("unknown") }
    mutating func discard(_ id: String) { failedIDs.remove(id); attempts.removeValue(forKey: id) }
    mutating func renewRetryBudget() { attempts.removeAll() }

    static func canMonitor(radius: Double, maximum: Double) -> Bool {
        radius.isFinite && radius > 0 && maximum.isFinite && maximum > 0 && radius <= maximum
    }
    static func matches(_ a: CLCircularRegion, _ b: CLCircularRegion) -> Bool {
        a.identifier == b.identifier && a.center.latitude == b.center.latitude && a.center.longitude == b.center.longitude
            && a.radius == b.radius && a.notifyOnEntry == b.notifyOnEntry && a.notifyOnExit == b.notifyOnExit
    }
}
