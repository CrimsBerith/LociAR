import MapKit
import SwiftUI

/// How the map shows notes at the current zoom. Mirrors the precisions served by `readNoteDensity`.
enum NoteMapLayer: Equatable {
    /// Far away: soft glowing spots, no numbers.
    case heat(precision: Int)
    /// Neighbourhood: one bubble per ~150 m cell with its note count.
    case counts
    /// Street level: the notes themselves, grouped within 6 m.
    case notes

    /// Finer cells reduce the offset from each cell's centre; screen-space grouping limits clutter.
    /// The backend supplies cell centres, not the individual notes' exact coordinates.
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

    static func stable(forWidth width: Double, previous: Self?) -> Self {
        guard let previous else { return forWidth(width) }
        let layers: [Self] = [.notes, .counts, .heat(precision: 7), .heat(precision: 6), .heat(precision: 5), .heat(precision: 4)]
        let boundaries = [300.0, 1_000, 5_000, 50_000, 500_000]
        guard let index = layers.firstIndex(of: previous) else { return forWidth(width) }
        let lower = index == 0 ? 0 : boundaries[index - 1] * 0.88
        let upper = index == boundaries.count ? Double.infinity : boundaries[index] * 1.12
        return width >= lower && width <= upper ? previous : forWidth(width)
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
    static func intensity(_ count: Int) -> Double {
        guard count > 0 else { return 0 }
        // Fixed reference: panning past a busy street must not recolour every other place.
        return min(1, log(1 + Double(count)) / log(101))
    }
}

struct NoteDensityBounds: Encodable, Equatable, Sendable {
    let minLat: Double
    let maxLat: Double
    let minLng: Double
    let maxLng: Double

    static func covering(_ region: MKCoordinateRegion) -> [Self] {
        let halfLat = max(0, region.span.latitudeDelta) / 2
        let south = max(-90, region.center.latitude - halfLat)
        let north = min(90, region.center.latitude + halfLat)
        func box(_ west: Double, _ east: Double) -> Self { Self(minLat: south, maxLat: north, minLng: west, maxLng: east) }
        if region.span.longitudeDelta >= 360 { return [box(-180, 180)] }
        let center = (region.center.longitude + 540).truncatingRemainder(dividingBy: 360) - 180
        let halfLng = max(0, region.span.longitudeDelta) / 2
        let west = center - halfLng
        let east = center + halfLng
        if west < -180 { return [box(west + 360, 180), box(-180, east)] }
        if east > 180 { return [box(west, 180), box(-180, east - 360)] }
        return [box(west, east)]
    }
}

@MainActor
final class NoteDensityClient {
    static let shared = NoteDensityClient()
    private var callables: CallableClient?
    func configure(callables: CallableClient) { self.callables = callables }

    private struct Payload: Encodable { let box: NoteDensityBounds; let precision: Int }
    private struct Response: Decodable {
        let cells: [NoteDensityCell]
        let truncated: Bool?
        let summaryVersion: Int?
    }

    func summary(for request: MapSummaryRequest) async throws -> MapSummary {
        guard let callables else { throw BackendCallError.invalidResponse }
        switch request.kind {
        case .heat(let precision):
            var cells: [String: NoteDensityCell] = [:]
            var complete = true
            for box in request.viewport.boxes {
                let response: Response = try await callables.call("readNoteDensity", payload: Payload(box: box, precision: precision), timeout: 20)
                complete = complete && response.truncated == false && response.summaryVersion == 1
                for cell in response.cells { cells[cell.id] = cell }
            }
            return .init(request: request, content: .heat(cells.values.sorted { $0.id < $1.id }), complete: complete, groupCoverageRadius: nil)
        case .groups:
            let result = try await groups(in: request.viewport.region)
            return .init(request: request, content: .groups(result.groups, unlockRadius: result.unlockRadius),
                         complete: result.summaryVersion == 1 && result.complete == true,
                         groupCoverageRadius: result.coverage?.radiusMeters)
        }
    }

    func cells(in region: MKCoordinateRegion, precision: Int) async throws -> [NoteDensityCell] {
        guard let callables else { return [] }
        var cells: [String: NoteDensityCell] = [:]
        for box in NoteDensityBounds.covering(region) {
            try Task.checkCancellation()
            let response: Response = try await callables.call("readNoteDensity", payload: Payload(box: box, precision: precision), timeout: 20)
            for cell in response.cells where cell.count >= (cells[cell.id]?.count ?? 0) { cells[cell.id] = cell }
        }
        return cells.values.sorted { $0.id < $1.id }
    }

    struct GroupsResponse: Decodable {
        struct Coverage: Decodable { let latitude: Double; let longitude: Double; let radiusMeters: Double }
        let groups: [MapNoteGroup]
        let unlockRadius: Double
        var summaryVersion: Int? = nil
        var complete: Bool? = nil
        var coverage: Coverage? = nil
    }
    private struct GroupsPayload: Encodable { let mode = "map_groups"; let latitude: Double; let longitude: Double; let radiusMeters: Double }
    func groups(in region: MKCoordinateRegion) async throws -> GroupsResponse {
        guard let callables else { return GroupsResponse(groups: [], unlockRadius: 15) }
        let height = region.span.latitudeDelta * 111_320
        let width = region.span.longitudeDelta * 111_320 * cos(region.center.latitude * .pi / 180)
        return try await callables.call("readPublicContent", payload: GroupsPayload(latitude: region.center.latitude,
            longitude: region.center.longitude, radiusMeters: min(2_000, max(50, hypot(height, width) / 2 + 80))), timeout: 30)
    }

    struct GroupPage: Decodable {
        let posts: [BackendPostRow]
        let nextOffset: Int?
        let total: Int
        let pageToken: String?
        let group: MapNoteGroup?
        private enum CodingKeys: String, CodingKey { case nextOffset, total, pageToken, group }
        init(from decoder: Decoder) throws {
            posts = try BackendPostPageResponse(from: decoder).posts
            let values = try decoder.container(keyedBy: CodingKeys.self)
            nextOffset = try values.decodeIfPresent(Int.self, forKey: .nextOffset)
            total = try values.decode(Int.self, forKey: .total)
            pageToken = try values.decodeIfPresent(String.self, forKey: .pageToken)
            group = try values.decodeIfPresent(MapNoteGroup.self, forKey: .group)
        }
    }
    private struct GroupPayload: Encodable {
        let mode = "map_group"
        let pageSize: Int
        let groupId: String
        let postIds: [String]
        let offset: Int
        let pageToken: String?
        let location: Fix?
    }
    func posts(in group: MapNoteGroup, offset: Int = 0, pageToken: String? = nil, fix: LocationSample?) async throws -> GroupPage {
        guard let callables else { throw BackendCallError.invalidResponse }
        let location = fix.map { Fix(lat: $0.latitude, lng: $0.longitude, accuracy: $0.accuracy, measuredAt: $0.timestamp.timeIntervalSince1970 * 1000) }
        // First paint stays small. Further pages amortize the server's live membership scan.
        // A continuation already owns its hints on the server; do not re-upload every member ID.
        return try await callables.call("readPublicContent", payload: GroupPayload(pageSize: offset == 0 ? 15 : 50,
            groupId: group.id, postIds: pageToken == nil ? group.postIDs : [],
            offset: offset, pageToken: pageToken, location: location), timeout: 30)
    }

    private struct Fix: Encodable {
        let lat: Double
        let lng: Double
        let accuracy: Double
        let measuredAt: Double
    }
}

struct MapNoteGroup: Decodable, Identifiable, Hashable, Sendable {
    let id: String
    let lat: Double
    let lng: Double
    let count: Int
    let radius: Double
    let postIDs: [String]
    var coordinate: CLLocationCoordinate2D { .init(latitude: lat, longitude: lng) }
    enum CodingKeys: String, CodingKey { case id, lat, lng, count, radius; case postIDs = "post_ids" }

    static func containing(_ postID: String, groupID: String, in groups: [Self]) -> Self? {
        groups.first { $0.postIDs.contains(postID) } ?? groups.first { $0.id == groupID }
    }

    func isNear(_ fix: LocationSample?, unlockRadius: Double, now: Date = Date()) -> Bool {
        guard let fix, fix.isUsable(at: now, maxAge: LocationNotePolicy.maxFixAge), fix.accuracy <= LocationNotePolicy.maxEntryAccuracy else { return false }
        return max(0, fix.location.distance(from: CLLocation(latitude: lat, longitude: lng)) - radius)
            <= unlockRadius + min(fix.accuracy, 5)
    }
}

/// Screen-space collision grouping. A combined badge zooms in; a single real place opens its sheet.
struct MapNoteCluster: Identifiable {
    let id: String
    var groups: [MapNoteGroup]
    var lat: Double
    var lng: Double
    var count: Int
    var coordinate: CLLocationCoordinate2D { .init(latitude: lat, longitude: lng) }

    static func cluster(_ groups: [MapNoteGroup], longitudeSpan: Double, viewportWidth: Double, centerLongitude: Double) -> [Self] {
        let step = max(0.000001, longitudeSpan) * 104 / max(100, viewportWidth)
        var result: [Self] = []
        var anchors: [(x: Double, y: Double)] = []
        var buckets: [String: [Int]] = [:]
        for group in groups.sorted(by: { $0.count != $1.count ? $0.count > $1.count : $0.id < $1.id }) {
            let x = (group.lng - centerLongitude + 540).truncatingRemainder(dividingBy: 360) - 180
            let phi = min(85, max(-85, group.lat)) * .pi / 180
            let y = log(tan(.pi / 4 + phi / 2)) * 180 / .pi
            let column = Int(floor(x / step))
            let row = Int(floor(y / step))
            let candidates = (-1...1).flatMap { dx in (-1...1).flatMap { dy in buckets["\(column + dx)_\(row + dy)"] ?? [] } }
            let near = candidates.filter { hypot(anchors[$0].x - x, anchors[$0].y - y) < step }
                .min { hypot(anchors[$0].x - x, anchors[$0].y - y) < hypot(anchors[$1].x - x, anchors[$1].y - y) }
            if let index = near {
                let total = result[index].count + group.count
                let weight = Double(group.count) / Double(total)
                result[index].lat += (group.lat - result[index].lat) * weight
                let delta = (group.lng - result[index].lng + 540).truncatingRemainder(dividingBy: 360) - 180
                result[index].lng = (result[index].lng + delta * weight + 540).truncatingRemainder(dividingBy: 360) - 180
                result[index].count = total
                result[index].groups.append(group)
            } else {
                buckets["\(column)_\(row)", default: []].append(result.count)
                anchors.append((x, y))
                result.append(Self(id: group.id, groups: [group], lat: group.lat, lng: group.lng, count: group.count))
            }
        }
        return result
    }
}

/// A group is only a map summary until its contents are returned for a fresh nearby fix.
struct MapNoteGroupSheet: View {
    let group: MapNoteGroup
    let unlockRadius: Double
    let initialFix: LocationSample?
    @Environment(AppContainer.self) private var container
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var location = LocationController()
    @State private var posts: [LociPost] = []
    @State private var nextOffset: Int?
    @State private var pageToken: String?
    @State private var currentGroup: MapNoteGroup?
    @State private var path: [LociPost] = []
    @State private var totalCount: Int?
    @State private var isLoading = false
    @State private var message: String?
    @State private var clock = Date()
    @State private var readGeneration = 0
    @State private var reloadAfterCurrentRead = false
    @State private var isVisible = true

    private var noteCount: Int { totalCount ?? group.count }
    private var bestFix: LocationSample? {
        guard location.authorizationStatus != .denied, location.authorizationStatus != .restricted else { return nil }
        let live = DenseSpotClient.bestFix(gps: location.freshLocation(at: clock), camera: container.arcore.cameraFix, now: clock)
        let seed = initialFix.flatMap { $0.isUsable(at: clock, maxAge: LocationNotePolicy.maxFixAge) ? $0 : nil }
        return live ?? seed
    }
    private var resolvedGroup: MapNoteGroup { currentGroup ?? group }
    private var isNear: Bool { resolvedGroup.isNear(bestFix, unlockRadius: unlockRadius, now: clock) }
    private var readablePosts: [LociPost] { isNear ? posts.filter { !$0.isLocked } : [] }

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                    Text("En çok beğenilenler")
                        .font(.subheadline).foregroundStyle(LociTheme.secondaryText)
                    if !isNear || posts.contains(where: \.isLocked) {
                        Label("Bu notlar konumunda açılır.", systemImage: "lock.fill")
                            .font(.callout).foregroundStyle(LociTheme.secondaryText)
                    }
                    if let message { Text(message).font(.caption).foregroundStyle(LociTheme.secondaryText) }
                    if isLoading && posts.isEmpty { ProgressView().frame(maxWidth: .infinity) }
                    ForEach(readablePosts) { post in
                        NavigationLink(value: post) {
                            HStack(spacing: 12) {
                                TranslatedPostText(text: post.caption, lineLimit: 3).font(.body).foregroundStyle(.white)
                                    .multilineTextAlignment(.leading)
                                Spacer(minLength: 8)
                                if post.isOfficialContent { OfficialContentBadge() }
                                Label { Text(post.counts.likes, format: .number) } icon: { Image(systemName: "heart.fill") }
                                    .font(.caption).foregroundStyle(LociTheme.secondaryText)
                                Image(systemName: "chevron.right").font(.caption).foregroundStyle(LociTheme.tertiaryText)
                            }
                            .padding(16).frame(minHeight: 56)
                            .background(LociTheme.surfaceStrong, in: RoundedRectangle(cornerRadius: 16))
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("map-group-post-\(post.id)")
                    }
                    if totalCount != 0 && (!isNear || readablePosts.isEmpty) {
                        Button { Task { await load(reset: true, waitForFix: true) } } label: {
                            Label(isLoading ? String(localized: "Konum doğrulanıyor…") : String(localized: "Notları aç"), systemImage: "lock.open")
                        }
                        .buttonStyle(LociPrimaryButtonStyle()).disabled(isLoading)
                        .accessibilityIdentifier("map-group-open-here")
                    } else if nextOffset != nil {
                        Button("Daha fazla göster") { Task { await load(reset: false) } }
                            .buttonStyle(LociSecondaryButtonStyle()).disabled(isLoading)
                    }
                }.padding(20)
            }
            .background(LociTheme.background)
            .navigationTitle(Text("\(noteCount) not"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Kapat") { dismiss() } } }
            .navigationDestination(for: LociPost.self) { PostPreviewView(post: $0) }
            .refreshable { await load(reset: true) }
        }
        // The location monitor belongs to the stack, so pushing a note detail does not stop
        // it. Leaving the place pops that detail and discards the loaded bodies immediately.
        .task {
            location.start()
            clock = Date()
            await load(reset: true, waitForFix: bestFix == nil)
        }
        .task {
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(1)) } catch { return }
                clock = Date()
                if !isNear { revokeReads() }
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { revokeReads() }
        }
        .onChange(of: container.mapRequests.accessRevision) { _, _ in
            revokeReads()
            if scenePhase == .active, isNear {
                if isLoading { reloadAfterCurrentRead = true }
                else { Task { await load(reset: true) } }
            }
        }
        .onAppear { isVisible = true }
        .onDisappear { isVisible = false; location.stop(); revokeReads() }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    @MainActor private func load(reset: Bool, waitForFix: Bool = false) async {
        guard !isLoading, isVisible, !Task.isCancelled else { return }
        isLoading = true; message = nil
        defer {
            isLoading = false
            if reloadAfterCurrentRead {
                reloadAfterCurrentRead = false
                if isVisible, scenePhase == .active, isNear { Task { await load(reset: true) } }
            }
        }
        if waitForFix {
            for _ in 0..<6 {
                clock = Date()
                if isNear { break }
                do { try await Task.sleep(for: .milliseconds(500)) } catch { return }
            }
        }
        let generation = readGeneration
        do {
            clock = Date()
            let fix = bestFix
            if let error = location.errorMessage { message = error }
            else if fix.map({ $0.accuracy > LocationNotePolicy.maxEntryAccuracy }) ?? true {
                message = String(localized: "Konum henüz netleşmedi. İç mekânda biraz bekleyip tekrar dene veya Ayarlar’dan konum iznini kontrol et.")
            }
            guard isVisible, isNear, scenePhase == .active,
                  case let .signedIn(viewer) = container.session.phase else { return }
            let page = try await NoteDensityClient.shared.posts(in: resolvedGroup, offset: reset ? 0 : nextOffset ?? 0,
                                                               pageToken: reset ? nil : pageToken, fix: fix)
            guard !Task.isCancelled, generation == readGeneration,
                  case let .signedIn(currentViewer) = container.session.phase,
                  currentViewer.id == viewer.id else { return }
            clock = Date()
            currentGroup = page.group ?? currentGroup
            let received = page.posts.map { $0.domainPost() }
            totalCount = page.total
            if isNear && scenePhase == .active {
                posts = reset ? received : posts + received.filter { incoming in !posts.contains { $0.id == incoming.id } }
                nextOffset = page.nextOffset
                pageToken = page.pageToken
            } else { revokeReads() }
            if page.total == 0 { message = String(localized: "Yakında görünür post bulunamadı.") }
        } catch is CancellationError {
            return
        } catch {
            guard isVisible, generation == readGeneration, scenePhase == .active else { return }
            message = String(localized: "Postlar şu anda yüklenemiyor. Bağlantını kontrol edip tekrar dene.")
        }
    }

    private func revokeReads() {
        readGeneration += 1
        reloadAfterCurrentRead = false
        path = []; posts = []; nextOffset = nil; pageToken = nil
    }
}

/// Nearby density cells merged on screen at their count-weighted centre.
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

/// Mint for sparse places, aqua for active ones, warm amber for the busiest places.
enum NoteHeatPalette {
    static func rgb(_ t: Double) -> (red: Double, green: Double, blue: Double) {
        let mint = (0.22, 0.88, 0.72)
        let aqua = (0.20, 0.72, 0.82)
        let amber = (0.98, 0.72, 0.36)
        let x = min(1, max(0, t))
        let (from, to, progress) = x < 0.55 ? (mint, aqua, x / 0.55) : (aqua, amber, (x - 0.55) / 0.45)
        let f = progress * progress * (3 - 2 * progress)
        return (from.0 + (to.0 - from.0) * f, from.1 + (to.1 - from.1) * f, from.2 + (to.2 - from.2) * f)
    }

    static func color(_ t: Double) -> Color {
        let c = rgb(t)
        return Color(red: c.red, green: c.green, blue: c.blue)
    }
}

/// A stable, smooth lens silhouette, varied by the cell identity instead of random redraws.
struct NoteGlassShape: Shape {
    let seed: Double
    func path(in rect: CGRect) -> Path {
        let points = (0..<64).map { index -> CGPoint in
            let angle = Double(index) / 64 * 2 * .pi
            let radius = 0.40 + 0.045 * sin(angle * 3 + seed) + 0.025 * cos(angle * 5 - seed)
            return CGPoint(x: rect.midX + cos(angle) * radius * rect.width,
                           y: rect.midY + sin(angle) * radius * rect.height)
        }
        var path = Path()
        let first = points[0]
        let last = points[points.count - 1]
        path.move(to: CGPoint(x: (last.x + first.x) / 2, y: (last.y + first.y) / 2))
        for index in points.indices {
            let point = points[index]
            let next = points[(index + 1) % points.count]
            path.addQuadCurve(to: CGPoint(x: (point.x + next.x) / 2, y: (point.y + next.y) / 2), control: point)
        }
        path.closeSubpath()
        return path
    }
}

/// Tinted glass keeps streets visible, with a restrained edge and layered internal colour.
struct NoteHeatGlow: View {
    let intensity: Double
    var seed: Double = 0
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.colorSchemeContrast) private var contrast
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    var body: some View {
        let t = min(1, max(0.15, intensity))
        let size = 86 + 50 * t
        let tint = NoteHeatPalette.color(t)
        let shape = NoteGlassShape(seed: seed)
        let opacity = (colorScheme == .dark ? 0.28 : 0.20) + 0.14 * t
        ZStack {
            if reduceTransparency {
                shape.fill(colorScheme == .dark ? LociTheme.surfaceStrong : Color.white)
            } else {
                shape.fill(.ultraThinMaterial).opacity(0.48)
            }
            shape.fill(LinearGradient(colors: [tint.opacity(opacity + 0.12), tint.opacity(opacity * 0.45), tint.opacity(opacity)],
                                      startPoint: .topLeading, endPoint: .bottomTrailing))
            shape.fill(RadialGradient(colors: [tint.opacity(0.24 + t * 0.18), .clear],
                                      center: .init(x: 0.4, y: 0.42), startRadius: 0, endRadius: size * 0.46))
            shape.stroke(LinearGradient(colors: [.white.opacity(colorScheme == .dark ? 0.32 : 0.65),
                                                 tint.opacity(0.16), tint.opacity(0.48)],
                                        startPoint: .topLeading, endPoint: .bottomTrailing),
                         lineWidth: contrast == .increased ? 1.5 : 0.7)
        }
        .frame(width: size, height: size * 0.88)
        .shadow(color: tint.opacity(0.10), radius: 8, y: 2)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.4), value: intensity)
    }
}

/// The same dark, restrained surface used by the rest of LociAR, with density as a small accent.
struct NoteDensityBadge: View {
    let count: Int
    var intensity: Double = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let tint = NoteHeatPalette.color(intensity)
        let noteCount = count
        HStack(spacing: 6) {
            Circle().fill(tint).frame(width: 5, height: 5)
            Text("\(noteCount) not")
                .font(.subheadline.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(.white)
                .contentTransition(.numericText(value: Double(count)))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .padding(.horizontal, 12)
        .frame(minWidth: 44, minHeight: 44)
        .background(LociTheme.surfaceStrong, in: Capsule())
        .overlay(Capsule().strokeBorder(tint.opacity(0.32), lineWidth: 1))
        .shadow(color: .black.opacity(0.16), radius: 6, y: 3)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.3), value: count)
    }
}

struct NoteHeatLegend: View {
    var body: some View {
        HStack(spacing: 8) {
            Text("Not yoğunluğu").font(.caption2.weight(.medium))
            LinearGradient(colors: [NoteHeatPalette.color(0), NoteHeatPalette.color(0.55), NoteHeatPalette.color(1)],
                           startPoint: .leading, endPoint: .trailing)
                .frame(width: 64, height: 4).clipShape(Capsule())
            Text(verbatim: "\(1.formatted())–\(100.formatted())+").font(.caption2.monospacedDigit())
        }
        .foregroundStyle(.white.opacity(0.85))
        .padding(.horizontal, 10).padding(.vertical, 8)
        .background(LociTheme.surfaceStrong, in: Capsule())
        .accessibilityElement(children: .combine)
        .allowsHitTesting(false)
    }
}

/// Screen-sized density fields keep the map readable. Tapping a field zooms towards it.
struct NoteHeatContent: MapContent {
    let blobs: [NoteHeatBlob]
    let onSelect: @MainActor (NoteHeatBlob) -> Void

    var body: some MapContent {
        ForEach(blobs) { blob in
            Annotation(blob.id, coordinate: blob.coordinate) {
                Button { onSelect(blob) } label: {
                    NoteHeatGlow(intensity: NoteDensityCell.intensity(blob.count),
                                 seed: Double(blob.id.utf8.reduce(0) { ($0 * 31 + Int($1)) % 997 }) / 100)
                        .contentShape(Circle())
                        .transition(.opacity)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text("\(blob.count) not"))
                .accessibilityIdentifier("map-heat-\(blob.id)")
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

    private struct Fix: Encodable {
        let lat: Double
        let lng: Double
        let accuracy: Double
        let measuredAt: Double
    }
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
