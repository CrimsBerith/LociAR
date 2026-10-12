import MapKit
import SwiftUI

/// How the map shows notes at the current zoom. Mirrors the precisions served by `readNoteDensity`.
enum NoteMapLayer: Equatable {
    /// Far away: soft heat spots, no numbers.
    case heat(precision: Int)
    /// Neighbourhood: one bubble per ~150 m cell with its note count.
    case counts
    /// Street level: the notes themselves, grouped within 25 m.
    case notes

    /// `widthMeters` is the visible map width.
    static func forWidth(_ widthMeters: Double) -> NoteMapLayer {
        switch widthMeters {
        case ..<300: .notes
        case ..<1_000: .counts
        case ..<5_000: .heat(precision: 6)
        case ..<50_000: .heat(precision: 5)
        default: .heat(precision: 4)
        }
    }

    var precision: Int? {
        switch self {
        case .heat(let p): p
        case .counts: 7
        case .notes: nil
        }
    }

    /// Approximate geohash cell width in metres for each precision.
    static func cellMeters(_ precision: Int) -> Double {
        switch precision {
        case 4: 39_000
        case 5: 4_900
        case 6: 1_200
        default: 153
        }
    }
}

struct NoteDensityCell: Decodable, Identifiable, Hashable, Sendable {
    let cell: String
    let lat: Double
    let lng: Double
    let count: Int
    var id: String { cell }
    var coordinate: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: lat, longitude: lng) }

    /// 0...1 on a log scale, so one busy square does not wash out the rest of the view.
    static func intensity(_ count: Int, max maxCount: Int) -> Double {
        guard count > 0, maxCount > 0 else { return 0 }
        return min(1, log(1 + Double(count)) / log(1 + Double(maxCount)))
    }
}

@MainActor
final class NoteDensityClient {
    static let shared = NoteDensityClient()
    private var callables: CallableClient?
    func configure(callables: CallableClient) { self.callables = callables }

    private struct Box: Encodable { let minLat: Double; let maxLat: Double; let minLng: Double; let maxLng: Double }
    private struct Payload: Encodable { let box: Box; let precision: Int }
    private struct Response: Decodable { let cells: [NoteDensityCell] }

    func cells(in region: MKCoordinateRegion, precision: Int) async throws -> [NoteDensityCell] {
        guard let callables else { return [] }
        let halfLat = region.span.latitudeDelta / 2, halfLng = region.span.longitudeDelta / 2
        let box = Box(minLat: max(-90, region.center.latitude - halfLat), maxLat: min(90, region.center.latitude + halfLat),
                      minLng: max(-180, region.center.longitude - halfLng), maxLng: min(180, region.center.longitude + halfLng))
        let response: Response = try await callables.call("readNoteDensity", payload: Payload(box: box, precision: precision), timeout: 20)
        return response.cells
    }
}

/// Three stacked translucent circles per cell read as one soft heat spot.
struct NoteHeatContent: MapContent {
    let cells: [NoteDensityCell]
    let precision: Int

    var body: some MapContent {
        let maxCount = cells.map(\.count).max() ?? 0
        let base = NoteMapLayer.cellMeters(precision) * 0.75
        ForEach(cells) { cell in
            let t = NoteDensityCell.intensity(cell.count, max: maxCount)
            let color = Self.color(t)
            MapCircle(center: cell.coordinate, radius: base).foregroundStyle(color.opacity(0.06 + 0.12 * t))
            MapCircle(center: cell.coordinate, radius: base * 0.62).foregroundStyle(color.opacity(0.08 + 0.18 * t))
            MapCircle(center: cell.coordinate, radius: base * 0.3).foregroundStyle(color.opacity(0.10 + 0.30 * t))
        }
    }

    /// Accent for sparse areas, orange, then red for the busiest.
    static func color(_ t: Double) -> Color {
        switch t {
        case ..<0.4: LociTheme.accent
        case ..<0.75: .orange
        default: .red
        }
    }
}

@MainActor
final class DenseSpotClient {
    static let shared = DenseSpotClient()
    private var callables: CallableClient?
    func configure(callables: CallableClient) { self.callables = callables }

    private struct Fix: Encodable { let lat: Double; let lng: Double; let accuracy: Double; let measuredAt: Double }
    private struct Payload: Encodable { let location: Fix }
    struct Response: Decodable { let unlocked: [String]; let reason: String?; var unlockRadius: Double? = nil }

    /// Prefers the AR camera's Geospatial position (1-5 m) over GPS when it is fresh and better.
    nonisolated static func bestFix(gps: CLLocation?, camera: LocationSample?, now: Date = Date()) -> LocationSample? {
        let phone = gps.map(LocationSample.init).flatMap { now.timeIntervalSince($0.timestamp) <= 10 && $0.accuracy >= 0 && !$0.simulated ? $0 : nil }
        let ar = camera.flatMap { now.timeIntervalSince($0.timestamp) <= 3 && $0.accuracy >= 0 ? $0 : nil }
        switch (phone, ar) {
        case let (p?, a?): return a.accuracy <= p.accuracy ? a : p
        case let (p?, nil): return p
        case let (nil, a?): return a
        default: return nil
        }
    }

    func unlock(at fix: LocationSample) async throws -> Response {
        guard let callables else { return Response(unlocked: [], reason: "unavailable") }
        return try await callables.call("unlockDenseSpot", payload: Payload(location: Fix(
            lat: fix.latitude, lng: fix.longitude, accuracy: fix.accuracy, measuredAt: fix.timestamp.timeIntervalSince1970 * 1000)), timeout: 20)
    }
}
