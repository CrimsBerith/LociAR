import CoreLocation
import Foundation

/// A zone-campaign area. Mirrors `functions/src/journeyRules.ts`; keep the rules in sync.
enum CampaignZone: Codable, Equatable, Sendable {
    struct Point: Codable, Equatable, Sendable { let lat: Double; let lng: Double }
    case circle(lat: Double, lng: Double, radius: Double)
    case street(points: [Point], width: Double)

    private enum CodingKeys: String, CodingKey { case kind, lat, lng, radius, points, width }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        switch try c.decode(String.self, forKey: .kind) {
        case "circle": self = .circle(lat: try c.decode(Double.self, forKey: .lat), lng: try c.decode(Double.self, forKey: .lng), radius: try c.decode(Double.self, forKey: .radius))
        case "street": self = .street(points: try c.decode([Point].self, forKey: .points), width: try c.decode(Double.self, forKey: .width))
        default: throw DecodingError.dataCorruptedError(forKey: .kind, in: c, debugDescription: "zone.kind")
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case let .circle(lat, lng, radius):
            try c.encode("circle", forKey: .kind); try c.encode(lat, forKey: .lat); try c.encode(lng, forKey: .lng); try c.encode(radius, forKey: .radius)
        case let .street(points, width):
            try c.encode("street", forKey: .kind); try c.encode(points, forKey: .points); try c.encode(width, forKey: .width)
        }
    }

    var isValid: Bool {
        switch self {
        case let .circle(lat, lng, radius):
            ProximityPolicy.isValidCoordinate(latitude: lat, longitude: lng) && (15...2_000).contains(radius)
        case let .street(points, width):
            (2...20).contains(points.count) && (10...200).contains(width)
                && points.allSatisfy { ProximityPolicy.isValidCoordinate(latitude: $0.lat, longitude: $0.lng) }
        }
    }

    /// Metres from the point to the zone edge; negative inside a circle.
    func distance(to location: CLLocation) -> CLLocationDistance {
        switch self {
        case let .circle(lat, lng, radius):
            return location.distance(from: CLLocation(latitude: lat, longitude: lng)) - radius
        case let .street(points, width):
            let lat = location.coordinate.latitude, lng = location.coordinate.longitude
            let k = cos(lat * .pi / 180) * 111_320, m = 111_320.0
            var best = Double.infinity
            for (a, b) in zip(points, points.dropFirst()) {
                let ax = (a.lng - lng) * k, ay = (a.lat - lat) * m, bx = (b.lng - lng) * k, by = (b.lat - lat) * m
                let dx = bx - ax, dy = by - ay, length = dx * dx + dy * dy
                let t = length == 0 ? 0 : max(0, min(1, -(ax * dx + ay * dy) / length))
                best = min(best, hypot(ax + t * dx, ay + t * dy))
            }
            return best - width / 2
        }
    }

    /// Same tolerance as notes: the uncertainty circle may touch the zone (at most 20 m).
    func contains(_ location: CLLocation) -> Bool {
        let accuracy = location.horizontalAccuracy
        guard accuracy >= 0, accuracy <= LocationNotePolicy.maxEntryAccuracy else { return false }
        return distance(to: location) <= min(accuracy, LocationNotePolicy.entryToleranceCap)
    }

    /// Clearly outside: even the near edge of the uncertainty circle is outside.
    func clearlyExcludes(_ location: CLLocation) -> Bool {
        let accuracy = location.horizontalAccuracy
        return accuracy >= 0 && accuracy <= 100 && distance(to: location) > accuracy
    }
}

/// Learns where the phone usually spends the night from iOS visits. Stored on this device only;
/// never sent to the server and never labelled "home". Used for "leaves usual place" steps.
struct UsualPlaceLearner: Codable, Equatable, Sendable {
    struct Visit: Codable, Equatable, Sendable { let lat: Double; let lng: Double; let arrival: Date; let departure: Date }
    static let clusterRadius: CLLocationDistance = 150
    static let window: TimeInterval = 21 * 86_400
    static let minimumNights = 3

    private(set) var visits: [Visit] = []

    mutating func record(_ visit: Visit, now: Date = Date()) {
        guard visit.departure > visit.arrival, ProximityPolicy.isValidCoordinate(latitude: visit.lat, longitude: visit.lng) else { return }
        visits.append(visit)
        visits.removeAll { now.timeIntervalSince($0.departure) > Self.window }
        if visits.count > 400 { visits.removeFirst(visits.count - 400) }
    }

    /// Hours of a visit that fall between 00:00 and 06:00 local time, and the nights it touches.
    static func nightOverlap(_ visit: Visit, calendar: Calendar = .current) -> (hours: Double, nights: Set<Date>) {
        var hours = 0.0, nights = Set<Date>()
        var day = calendar.startOfDay(for: visit.arrival)
        while day <= visit.departure {
            let nightEnd = day.addingTimeInterval(6 * 3_600)
            let overlap = min(visit.departure, nightEnd).timeIntervalSince(max(visit.arrival, day))
            if overlap >= 1_800 { hours += overlap / 3_600; nights.insert(day) }
            guard let next = calendar.date(byAdding: .day, value: 1, to: day) else { break }
            day = next
        }
        return (hours, nights)
    }

    /// The place with the most night hours across at least three different nights.
    func usualPlace(calendar: Calendar = .current) -> CLLocationCoordinate2D? {
        var groups: [(lat: Double, lng: Double, hours: Double, nights: Set<Date>, count: Int)] = []
        for visit in visits {
            let night = Self.nightOverlap(visit, calendar: calendar)
            guard night.hours > 0 else { continue }
            let here = CLLocation(latitude: visit.lat, longitude: visit.lng)
            if let i = groups.firstIndex(where: { here.distance(from: CLLocation(latitude: $0.lat, longitude: $0.lng)) <= Self.clusterRadius }) {
                let n = Double(groups[i].count + 1)
                groups[i].lat += (visit.lat - groups[i].lat) / n; groups[i].lng += (visit.lng - groups[i].lng) / n
                groups[i].hours += night.hours; groups[i].nights.formUnion(night.nights); groups[i].count += 1
            } else {
                groups.append((visit.lat, visit.lng, night.hours, night.nights, 1))
            }
        }
        guard let best = groups.filter({ $0.nights.count >= Self.minimumNights }).max(by: { $0.hours < $1.hours }) else { return nil }
        return CLLocationCoordinate2D(latitude: best.lat, longitude: best.lng)
    }
}
