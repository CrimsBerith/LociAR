import CoreLocation
import Foundation

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
    static let sampleWindow: TimeInterval = 10
    static let maxSampleAge: TimeInterval = 3

    static let maxEntryAccuracy: CLLocationAccuracy = 35
    static let entryToleranceCap: CLLocationDistance = 20
    static let minConfirmation: TimeInterval = 5
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

struct LocationSample: Equatable, Sendable {
    let latitude: Double
    let longitude: Double
    let accuracy: CLLocationAccuracy
    let timestamp: Date
    var simulated = false

    var location: CLLocation { CLLocation(latitude: latitude, longitude: longitude) }
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
    /// The best single accuracy in the window; averaging is not claimed as extra precision.
    let accuracy: CLLocationAccuracy
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
        guard sample.accuracy >= 0, !sample.simulated, sample.timestamp >= startedAt,
              now.timeIntervalSince(sample.timestamp) <= LocationNotePolicy.maxSampleAge,
              ProximityPolicy.isValidCoordinate(latitude: sample.latitude, longitude: sample.longitude) else { return false }
        samples.append(sample)
        samples.removeAll { now.timeIntervalSince($0.timestamp) > LocationNotePolicy.sampleWindow }
        return true
    }

    var bestAccuracy: CLLocationAccuracy? { samples.map(\.accuracy).min() }

    /// Inverse-variance weighted mean of the fixes close to the best one.
    var estimate: LocationEstimate? {
        guard let best = bestAccuracy else { return nil }
        let good = samples.filter { $0.accuracy <= max(best * 1.5, best + 2) }
        var weight = 0.0, lat = 0.0, lng = 0.0
        for sample in good {
            let w = 1 / max(sample.accuracy * sample.accuracy, 1)
            weight += w; lat += sample.latitude * w; lng += sample.longitude * w
        }
        return LocationEstimate(latitude: lat / weight, longitude: lng / weight, accuracy: best)
    }

    /// Accurate to 10 m, the last three fixes within 5 m of the estimate, after a 2 s warm-up.
    func isReady(now: Date) -> Bool {
        guard now.timeIntervalSince(startedAt) >= LocationNotePolicy.minimumWarmup,
              let estimate, estimate.accuracy <= LocationNotePolicy.readyAccuracy, samples.count >= 3 else { return false }
        return samples.suffix(3).allSatisfy { $0.location.distance(from: estimate.location) <= LocationNotePolicy.stableSpread }
    }

    var outcome: Outcome {
        guard let estimate else { return .noFix }
        if estimate.accuracy <= LocationNotePolicy.gpsAcceptAccuracy { return .gps(estimate) }
        if estimate.accuracy <= LocationNotePolicy.maxCreateAccuracy { return .needsManualPin(estimate) }
        return .tooUncertain(estimate.accuracy)
    }
}
