import MapKit
import SwiftUI

/// How the map shows notes at the current zoom. Mirrors the precisions served by `readNoteDensity`.
enum NoteMapLayer: Equatable {
    /// Far away: soft glowing spots, no numbers.
    case heat(precision: Int)
    /// Neighbourhood: one bubble per ~150 m cell with its note count.
    case counts
    /// Street level: the notes themselves, grouped within 25 m.
    case notes

    /// `widthMeters` is the visible map width. Heat asks for cells about one precision finer than
    /// the view needs and `NoteHeatBlob.bin` merges them on screen, so a spot sits on its notes
    /// instead of on the centre of a 39 km cell.
    static func forWidth(_ widthMeters: Double) -> NoteMapLayer {
        switch widthMeters {
        case ..<300: .notes
        case ..<1_000: .counts
        case ..<5_000: .heat(precision: 7)
        case ..<50_000: .heat(precision: 6)
        case ..<500_000: .heat(precision: 5)
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

    var isHeat: Bool {
        if case .heat = self { true } else { false }
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
        let halfLat = region.span.latitudeDelta / 2
        let halfLng = region.span.longitudeDelta / 2
        let box = Box(minLat: max(-90, region.center.latitude - halfLat), maxLat: min(90, region.center.latitude + halfLat),
                      minLng: max(-180, region.center.longitude - halfLng), maxLng: min(180, region.center.longitude + halfLng))
        let response: Response = try await callables.call("readNoteDensity", payload: Payload(box: box, precision: precision), timeout: 20)
        return response.cells
    }
}

/// One glowing spot on the heat layer: nearby cells merged on screen, placed at their note-weighted centre.
struct NoteHeatBlob: Identifiable, Hashable, Sendable {
    let id: String
    let latitude: Double
    let longitude: Double
    let count: Int
    var coordinate: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: latitude, longitude: longitude) }

    /// Cells in the same screen-sized bin (about `columns` across the view) merge into one spot.
    /// Bins snap to a power-of-two grid in Mercator space: they are square on screen at every
    /// latitude, panning keeps each spot in place and only a zoom re-bins.
    static func bin(_ cells: [NoteDensityCell], longitudeSpan: Double, columns: Double = 9, limit: Int = 240) -> [NoteHeatBlob] {
        let level = max(0, min(30, Int(floor(log2(360 * columns / max(longitudeSpan, 1e-6))))))
        let step = 360 / pow(2, Double(level))
        var sums: [String: (count: Int, lat: Double, lng: Double)] = [:]
        for cell in cells where cell.count > 0 {
            let phi = min(85, max(-85, cell.lat)) * .pi / 180
            let mercatorY = log(tan(.pi / 4 + phi / 2)) * 180 / .pi
            let key = "\(level)_\(Int(floor((cell.lng + 180) / step)))_\(Int(floor(mercatorY / step)))"
            let weight = Double(cell.count)
            let sum = sums[key] ?? (count: 0, lat: 0, lng: 0)
            sums[key] = (count: sum.count + cell.count, lat: sum.lat + cell.lat * weight, lng: sum.lng + cell.lng * weight)
        }
        let blobs = sums.map { key, sum in
            NoteHeatBlob(id: key, latitude: sum.lat / Double(sum.count), longitude: sum.lng / Double(sum.count), count: sum.count)
        }
        return Array(blobs.sorted { $0.count != $1.count ? $0.count > $1.count : $0.id < $1.id }.prefix(limit))
    }
}

/// Heat colours: the brand mint for a few notes, periwinkle in between, warm pink for the busiest spots.
enum NoteHeatPalette {
    static func rgb(_ t: Double) -> (red: Double, green: Double, blue: Double) {
        let mint = (0.22, 0.88, 0.72), periwinkle = (0.56, 0.62, 1.0), pink = (1.0, 0.47, 0.68)
        let x = min(1, max(0, t))
        let (from, to, f) = x < 0.5 ? (mint, periwinkle, x / 0.5) : (periwinkle, pink, (x - 0.5) / 0.5)
        return (from.0 + (to.0 - from.0) * f, from.1 + (to.1 - from.1) * f, from.2 + (to.2 - from.2) * f)
    }

    static func color(_ t: Double) -> Color {
        let c = rgb(t)
        return Color(red: c.red, green: c.green, blue: c.blue)
    }
}

/// A soft lantern: a radial glow around a small bright core. The busiest spots breathe slowly.
struct NoteHeatGlow: View {
    let intensity: Double
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var breathing = false

    var body: some View {
        let t = min(1, max(0.15, intensity))
        let size = 26 + 66 * t
        let tint = NoteHeatPalette.color(t)
        let glow = Gradient(stops: [
            .init(color: tint.opacity(0.55 + 0.3 * t), location: 0),
            .init(color: tint.opacity(0.24), location: 0.45),
            .init(color: tint.opacity(0), location: 1),
        ])
        ZStack {
            Circle().fill(RadialGradient(gradient: glow, center: .center, startRadius: 0, endRadius: size / 2))
            Circle()
                .fill(Color.white.opacity(0.92))
                .frame(width: 4 + 6 * t, height: 4 + 6 * t)
                .shadow(color: tint, radius: 4 + 4 * t)
        }
        .frame(width: size, height: size)
        .scaleEffect(breathing ? 1.1 : 1)
        .onAppear {
            guard !reduceMotion, t >= 0.6 else { return }
            withAnimation(.easeInOut(duration: 2.6).repeatForever(autoreverses: true)) { breathing = true }
        }
    }
}

/// Heat layer: merged cells drawn as lanterns in screen space, so a city still shows from orbit.
/// Tapping a spot zooms towards it.
struct NoteHeatContent: MapContent {
    let blobs: [NoteHeatBlob]
    let onSelect: @MainActor (NoteHeatBlob) -> Void

    var body: some MapContent {
        let maxCount = blobs.map(\.count).max() ?? 0
        ForEach(blobs) { blob in
            Annotation(blob.id, coordinate: blob.coordinate) {
                Button { onSelect(blob) } label: {
                    NoteHeatGlow(intensity: NoteDensityCell.intensity(blob.count, max: maxCount))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text("\(blob.count) not"))
            }
            .annotationTitles(.hidden)
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
