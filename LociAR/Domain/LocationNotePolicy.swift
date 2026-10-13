import CoreLocation
import Foundation

enum ArrivalLocationMode: Equatable {
    case stopped, lowPower, precise

    static func resolve(monitoring: Bool, foreground: Bool, authorized: Bool, fullAccuracy: Bool, hasPreciseTargets: Bool) -> Self {
        guard monitoring, authorized else { return .stopped }
        if fullAccuracy && hasPreciseTargets { return .precise }
        return foreground ? .lowPower : .stopped
    }
}

/// Location-note thresholds. Mirrors `functions/src/placeNoteRules.ts`; keep the numbers in sync.
enum LocationNotePolicy {
    /// A GPS estimate this good and stable can be published without waiting.
    static let readyAccuracy: CLLocationAccuracy = 10
    /// Best GPS accuracy accepted without asking the author to place the pin.
    static let gpsAcceptAccuracy: CLLocationAccuracy = 15
    /// Above this the note is refused; the author should move outside or wait.
    static let maxCreateAccuracy: CLLocationAccuracy = 50
    static let maxPinDrag: CLLocationDistance = 50
    /// Longest wait after the publish tap. GPS rarely improves after ~10 s; indoors it never converges.
    static let maxPublishWait: TimeInterval = 10
    /// Samples spread used to call an estimate stable.
    static let stableSpread: CLLocationDistance = 5
    static let minimumWarmup: TimeInterval = 2
    static let maxSampleAge: TimeInterval = 3

    static let maxEntryAccuracy: CLLocationAccuracy = 35
    static let entryToleranceCap: CLLocationDistance = 20
    static let minConfirmation: TimeInterval = 10
    static let maxConfirmationSampleGap: TimeInterval = 5
    static let maxWalkingSpeed: CLLocationSpeed = 2.5
    static let maxFixAge: TimeInterval = 10
    /// Precise GPS after a wake ends on notification, exit, or after this long.
    static let maxPreciseWindow: TimeInterval = 600

    /// The visitor's uncertainty circle may touch the note circle, within a bounded tolerance.
    static func fixInsideNote(distance: CLLocationDistance, accuracy: CLLocationAccuracy, radius: Double) -> Bool {
        guard accuracy >= 0, accuracy <= maxEntryAccuracy else { return false }
        return distance <= radius + min(accuracy, entryToleranceCap)
    }
}

/// Device-only timing: leaving the note circle or losing fixes restarts the entry confirmation.
struct LocationNoteEntryConfirmation {
    private(set) var startedAt: Date?
    private var lastGoodAt: Date?

    mutating func observe(sampleAt: Date) -> Bool {
        guard sampleAt.timeIntervalSince1970.isFinite else { self = Self(); return false }
        if let lastGoodAt {
            guard sampleAt > lastGoodAt else { return false }
            if sampleAt.timeIntervalSince(lastGoodAt) > LocationNotePolicy.maxConfirmationSampleGap
                || startedAt.map({ sampleAt.timeIntervalSince($0) > LocationNotePolicy.maxPreciseWindow }) == true {
                startedAt = sampleAt
            }
        } else { startedAt = sampleAt }
        lastGoodAt = sampleAt
        return sampleAt.timeIntervalSince(startedAt!) >= LocationNotePolicy.minConfirmation
    }
}

struct LocationSample: Equatable, Sendable {
    let latitude: Double
    let longitude: Double
    let accuracy: CLLocationAccuracy
    let timestamp: Date
    var simulated = false

    var location: CLLocation { CLLocation(latitude: latitude, longitude: longitude) }

    func isUsable(at now: Date, maxAge: TimeInterval = LocationNotePolicy.maxSampleAge) -> Bool {
        let age = now.timeIntervalSince(timestamp)
        return accuracy.isFinite && accuracy >= 0 && !simulated && age >= -5 && age <= maxAge
            && ProximityPolicy.isValidCoordinate(latitude: latitude, longitude: longitude)
    }
}

extension LocationSample {
    init(_ location: CLLocation) {
        var simulated = location.sourceInformation?.isSimulatedBySoftware == true
#if targetEnvironment(simulator)
        simulated = false
#endif
        self.init(latitude: location.coordinate.latitude, longitude: location.coordinate.longitude,
                  accuracy: location.horizontalAccuracy, timestamp: location.timestamp, simulated: simulated)
    }
}

struct LocationEstimate: Equatable, Sendable {
    let latitude: Double
    let longitude: Double
    /// At least the best single accuracy; disagreement between fixes raises the uncertainty.
    let accuracy: CLLocationAccuracy
    let timestamp: Date
    var coordinate: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: latitude, longitude: longitude) }
    var location: CLLocation { CLLocation(latitude: latitude, longitude: longitude) }
}

/// Turns a stream of Core Location fixes into one position for a new note.
/// Measuring starts when the composer opens, so the fix usually settles while the author types.
struct LocationFixEstimator: Sendable {
    enum Outcome: Equatable, Sendable {
        case gps(LocationEstimate)
        case needsManualPin(LocationEstimate)
        case tooUncertain(CLLocationAccuracy)
        case noFix
    }

    let startedAt: Date
    private(set) var samples: [LocationSample] = []

    init(startedAt: Date) { self.startedAt = startedAt }

    /// Drops cached fixes from before the measurement, stale or simulated fixes and invalid accuracy.
    @discardableResult
    mutating func add(_ sample: LocationSample, now: Date) -> Bool {
        prune(at: now)
        guard sample.isUsable(at: now), sample.timestamp >= startedAt else { return false }
        // Core Location may redeliver a cached fix; it must not count as another stable sample.
        guard !samples.contains(where: { $0.timestamp == sample.timestamp }) else { return false }
        samples.append(sample)
        samples.sort { $0.timestamp < $1.timestamp }
        samples = Array(samples.suffix(20))
        return true
    }

    /// Fresh fixes already collected on the map count toward the first estimate.
    mutating func seed(_ samples: [LocationSample], now: Date) {
        for sample in samples { add(sample, now: now) }
    }

    /// A good fix must not survive a stopped stream or a walk to another location.
    mutating func prune(at now: Date) {
        samples.removeAll { !$0.isUsable(at: now) }
    }

    var bestAccuracy: CLLocationAccuracy? { samples.map(\.accuracy).min() }

    /// Inverse-variance weighted mean of the fixes close to the best one.
    var estimate: LocationEstimate? {
        guard let best = bestAccuracy else { return nil }
        let good = samples.filter { $0.accuracy <= max(best * 1.5, best + 2) }
        var x = 0.0, y = 0.0, z = 0.0
        for sample in good {
            // Relative inverse variance avoids overflow; spherical averaging crosses ±180° safely.
            let relative = max(best, 1) / max(sample.accuracy, 1), w = relative * relative
            let lat = sample.latitude * .pi / 180, lng = sample.longitude * .pi / 180
            x += w * cos(lat) * cos(lng); y += w * cos(lat) * sin(lng); z += w * sin(lat)
        }
        let mean = CLLocation(latitude: atan2(z, hypot(x, y)) * 180 / .pi, longitude: atan2(y, x) * 180 / .pi)
        let spread = good.map { $0.location.distance(from: mean) }.max() ?? 0
        return LocationEstimate(latitude: mean.coordinate.latitude, longitude: mean.coordinate.longitude, accuracy: max(best, spread),
                                timestamp: good.map(\.timestamp).max()!)
    }

    /// Accurate to 10 m, the last three fixes within 5 m of the estimate, after a 2 s warm-up.
    func isReady(now: Date) -> Bool {
        guard now.timeIntervalSince(startedAt) >= LocationNotePolicy.minimumWarmup,
              let estimate, estimate.accuracy <= LocationNotePolicy.readyAccuracy, samples.count >= 3,
              samples.suffix(3).allSatisfy({ $0.isUsable(at: now) }) else { return false }
        return samples.suffix(3).allSatisfy { $0.location.distance(from: estimate.location) <= LocationNotePolicy.stableSpread }
    }

    var outcome: Outcome {
        guard let estimate else { return .noFix }
        if estimate.accuracy <= LocationNotePolicy.gpsAcceptAccuracy { return .gps(estimate) }
        if estimate.accuracy <= LocationNotePolicy.maxCreateAccuracy { return .needsManualPin(estimate) }
        return .tooUncertain(estimate.accuracy)
    }
}
