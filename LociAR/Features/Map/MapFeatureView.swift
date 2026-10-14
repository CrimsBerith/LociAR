import MapKit
import SwiftData
import SwiftUI
import UIKit

struct MapFeatureView: View {
    @Environment(\.openURL) private var openURL
    @Environment(AppSession.self) private var session
    @Environment(AppContainer.self) private var container
    @Environment(\.modelContext) private var modelContext
    @Environment(AppRouter.self) private var router
    @Binding var showCreate: Bool
    @State private var camera: MapCameraPosition = .userLocation(fallback: .automatic)
    @State private var selection: UUID?
    @State private var posts: [LociPost] = []
    @State private var location = LocationController()
    @State private var message: String?
    @State private var isLoading = false
    /// Set when a reload is requested while one is running (e.g. right after a post is created);
    /// the running load then runs once more so the new post is not missed.
    @State private var reloadRequested = false
    @State private var showPlaceNote = false
    @State private var visibleRegion: MKCoordinateRegion?
    @State private var layer: NoteMapLayer = .notes
    @State private var densityCells: [NoteDensityCell] = []
    @State private var densityTask: Task<Void, Never>?
    /// Notes of a tapped 25 m group, listed by likes in the panel.
    @State private var clusterFocus: Set<UUID>?
    @State private var unlocking = false
    @State private var unlockMessage: String?
    @State private var showCameraUnlock = false

    var body: some View {
        Map(position: $camera, selection: $selection) {
            UserAnnotation()
            if case .heat(let precision) = layer {
                NoteHeatContent(cells: densityCells, precision: precision)
            }
            if layer == .counts {
                ForEach(densityCells) { cell in
                    Annotation("\(cell.count) not", coordinate: cell.coordinate) {
                        Button { zoom(into: cell.coordinate) } label: { countBubble(cell.count) }
                            .buttonStyle(.plain)
                    }
                }
            }
            if layer == .notes {
            ForEach(clusters) { cluster in
                if cluster.posts.count == 1, let post = cluster.posts.first {
                    Marker(
                        post.caption.isEmpty ? "LociAR Pin" : post.caption,
                        systemImage: post.anchorBundle.anchor.pinQuality.isPhysicalSurface ? "viewfinder.circle.fill" : "exclamationmark.triangle.fill",
                        coordinate: cluster.coordinate
                    )
                    .tint(post.anchorBundle.anchor.pinQuality.isPhysicalSurface ? LociTheme.accent : .orange)
                    .tag(post.id)
                } else {
                    Annotation("\(cluster.posts.count) post", coordinate: cluster.coordinate) {
                        Button {
                            selection = nil
                            clusterFocus = Set(cluster.posts.map(\.id))
                        } label: { countBubble(cluster.posts.count) }
                        .buttonStyle(.plain)
                    }
                }
            }
            }
        }
        .mapStyle(.standard(elevation: .realistic, pointsOfInterest: .including([.cafe, .museum, .park])))
        .mapControls { MapCompass(); MapUserLocationButton() }
        .onMapCameraChange(frequency: .onEnd) { context in
            visibleRegion = context.region
            refreshLayer(for: context.region)
        }
        .sheet(isPresented: $showPlaceNote) { PlaceNoteComposer(seed: location.recentLocations) }
        .fullScreenCover(isPresented: $showCameraUnlock) {
            CameraLocationRefineView { fix in Task { await unlockHere(cameraFix: fix) } }
        }
        .safeAreaInset(edge: .bottom, spacing: 8) { mapPanel.padding(.horizontal, 14) }
        .navigationTitle("Harita")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button { Task { await startAndLoad() } } label: {
                    Label("Yenile", systemImage: "arrow.clockwise")
                }
                .accessibilityIdentifier("map-refresh")
            }
            ToolbarItem(placement: .topBarLeading) {
                Button { showPlaceNote = true } label: { Label("Konum notu bırak", systemImage: "square.and.pencil") }
                    .accessibilityIdentifier("map-location-note")
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button { showCreate = true } label: { Label("Yeni yüzey", systemImage: "plus") }
                    .accessibilityIdentifier("map-create")
            }
        }
        .navigationDestination(for: LociPost.self) { PostPreviewView(post: $0) }
        .task { await startAndLoad() }
        .onChange(of: showCreate) { _, presented in
            if !presented {
                selection = nil
                Task { await startAndLoad() }
            }
        }
        .onDisappear { location.stop() }
        .onChange(of: router.pendingMapFocus, initial: true) { _, focus in
            guard let focus else { return }
            router.pendingMapFocus = nil
            zoom(into: CLLocationCoordinate2D(latitude: focus.latitude, longitude: focus.longitude))
        }
        .accessibilityIdentifier("screen-map")
    }

    private struct PostCluster: Identifiable {
        var id: UUID { posts.first?.id ?? UUID() }
        let coordinate: CLLocationCoordinate2D
        let posts: [LociPost]
    }

    private var clusters: [PostCluster] {
        var result: [PostCluster] = []
        // Same 25 m grouping as the server's notification clusters.
        let thresholdMeters: Double = 25.0

        for post in posts {
            guard let geo = post.anchorBundle.anchor.geoPose else { continue }
            let postCoord = CLLocationCoordinate2D(latitude: geo.latitude, longitude: geo.longitude)
            let postLocation = CLLocation(latitude: geo.latitude, longitude: geo.longitude)

            var added = false
            for i in 0..<result.count {
                let clusterLocation = CLLocation(
                    latitude: result[i].coordinate.latitude,
                    longitude: result[i].coordinate.longitude
                )
                if clusterLocation.distance(from: postLocation) < thresholdMeters {
                    var updatedPosts = result[i].posts
                    updatedPosts.append(post)
                    result[i] = PostCluster(
                        coordinate: result[i].coordinate,
                        posts: updatedPosts
                    )
                    added = true
                    break
                }
            }
            if !added {
                result.append(PostCluster(coordinate: postCoord, posts: [post]))
            }
        }
        return result
    }

    private var selectedPost: LociPost? { posts.first { $0.id == selection } }

    @ViewBuilder private var mapPanel: some View {
        LociCard {
            if let selectedPost {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(selectedPost.caption.isEmpty ? String(localized: "Mekânsal post") : selectedPost.caption)
                                .font(.headline).lineLimit(2)
                            Label(distanceText(for: selectedPost).localizedUI, systemImage: "location.fill")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Button { selection = nil } label: {
                            Image(systemName: "xmark.circle.fill")
                                .frame(minWidth: 44, minHeight: 44)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain).foregroundStyle(.secondary).font(.title3)
                        .accessibilityLabel("Seçimi kapat")
                        .accessibilityIdentifier("map-clear-selection")
                    }
                    NavigationLink(value: selectedPost) {
                        Label("Postu aç", systemImage: "arrow.up.right")
                            .frame(maxWidth: .infinity, minHeight: 34)
                    }
                    .buttonStyle(.borderedProminent).tint(LociTheme.accent).foregroundStyle(.black)
                    .accessibilityIdentifier("map-open-selected-post")
                }
            } else {
                VStack(spacing: 12) {
                    HStack(spacing: 12) {
                        ZStack {
                            Circle().fill(LociTheme.accent.opacity(0.16)).frame(width: 42, height: 42)
                            if isLoading { ProgressView().tint(LociTheme.accent) }
                            else { Image(systemName: statusSymbol).foregroundStyle(LociTheme.accent) }
                        }
                        VStack(alignment: .leading, spacing: 3) {
                            Text(isLoading ? String(localized: "Yakın çevre taranıyor") : String(localized: "Yakındaki postlar"))
                                .font(.headline)
                            Text(message?.localizedUI ?? (posts.isEmpty ? String(localized: "Yakınında henüz post yok.") : String(localized: "\(posts.count) post bulundu. Haritadaki bir pine dokun.")))
                                .font(.caption).foregroundStyle(LociTheme.secondaryText).lineLimit(2)
                        }
                        Spacer(minLength: 0)
                        if message != nil && !isLoading {
                            if location.authorizationStatus == .denied
                                || location.authorizationStatus == .restricted
                                || UITestFixtures.locationPermissionDenied {
                                Button("Ayarlar") {
                                    if let url = URL(string: UIApplication.openSettingsURLString) {
                                        openURL(url)
                                    }
                                }
                                    .buttonStyle(.bordered).controlSize(.small)
                            } else {
                                Button { Task { await startAndLoad() } } label: { Image(systemName: "arrow.clockwise") }
                                    .buttonStyle(.bordered).controlSize(.small).accessibilityLabel("Tekrar dene")
                            }
                        }
                    }
                    if !isLoading && posts.isEmpty {
                        Button("İlk yüzeyi sen oluştur", systemImage: "plus.viewfinder") { showCreate = true }
                            .buttonStyle(LociPrimaryButtonStyle())
                    } else if !isLoading {
                        if clusterFocus != nil {
                            HStack {
                                Text("Bu noktadaki notlar · en çok beğenilen önce").font(.caption.weight(.semibold))
                                Spacer()
                                Button { clusterFocus = nil } label: { Image(systemName: "xmark.circle.fill") }
                                    .buttonStyle(.plain).foregroundStyle(.secondary)
                                    .accessibilityLabel("Seçimi kapat")
                            }
                        }
                        if let spot = listedPosts.lazy.compactMap(\.denseSpot).first {
                            denseSpotBanner(spot)
                        }
                        ScrollView {
                            VStack(spacing: 10) {
                                ForEach(listedPosts) { post in
                                    NavigationLink(value: post) {
                                        HStack(spacing: 10) {
                                            Image(systemName: post.anchorBundle.anchor.pinQuality.isPhysicalSurface ? "viewfinder.circle.fill" : "exclamationmark.triangle.fill")
                                                .foregroundStyle(post.anchorBundle.anchor.pinQuality.isPhysicalSurface ? LociTheme.accent : .orange)
                                            Text(post.isLocked ? String(localized: "Kilitli not") : post.caption.isEmpty ? String(localized: "Mekânsal post") : post.caption)
                                                .font(.subheadline.weight(.semibold))
                                                .foregroundStyle(.white)
                                                .lineLimit(1)
                                            Spacer()
                                            if post.counts.likes > 0 {
                                                Label { Text(post.counts.likes, format: .number) } icon: { Image(systemName: "heart.fill") }
                                                    .font(.caption).foregroundStyle(.secondary)
                                            }
                                            Image(systemName: "chevron.right")
                                                .font(.caption)
                                                .foregroundStyle(.secondary)
                                        }
                                        .contentShape(Rectangle())
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityElement(children: .ignore)
                                    .accessibilityLabel(post.caption.isEmpty ? String(localized: "Mekânsal post") : post.caption)
                                    .accessibilityIdentifier("map-open-\(post.caption)")
                                }
                            }
                        }
                        .frame(maxHeight: 220)
                    }
                }
            }
        }
    }

    private var statusSymbol: String { posts.isEmpty ? "location.magnifyingglass" : "mappin.and.ellipse" }

    /// Panel order follows likes so the most useful note at a place comes first.
    private var listedPosts: [LociPost] {
        if let clusterFocus { return posts.filter { clusterFocus.contains($0.id) } }
        guard let current = location.location else { return posts }
        // Nearby places first; notes within each 25 m group retain their likes order.
        return clusters.sorted {
            let a = current.distance(from: CLLocation(latitude: $0.coordinate.latitude, longitude: $0.coordinate.longitude))
            let b = current.distance(from: CLLocation(latitude: $1.coordinate.latitude, longitude: $1.coordinate.longitude))
            return a != b ? a < b : $0.id.uuidString < $1.id.uuidString
        }.flatMap(\.posts)
    }

    /// Dense spot: the count is public, the text opens only on site (GPS ~15 m, AR camera 2-5 m).
    private func denseSpotBanner(_ spot: DenseSpotInfo) -> some View {
        let meters = Int(spot.unlockRadius.rounded()), noteCount = spot.count
        return VStack(alignment: .leading, spacing: 6) {
            Label(String(localized: "Yoğun nokta: \(noteCount) not. Açmak için \(meters) m yaklaş."), systemImage: "lock.fill")
                .font(.caption.weight(.semibold))
            if let unlockMessage { Text(unlockMessage).font(.caption).foregroundStyle(.secondary) }
            HStack {
                Button { Task { await unlockHere() } } label: {
                    Label(unlocking ? String(localized: "Konum doğrulanıyor…") : String(localized: "Burada aç"), systemImage: "lock.open")
                }
                .buttonStyle(.bordered).controlSize(.small).disabled(unlocking)
                .accessibilityIdentifier("map-unlock-dense-spot")
                if container.arcore.isEnabled, CameraLocationRefineView.isSupported {
                    Button { showCameraUnlock = true } label: { Label("Kamerayla aç", systemImage: "camera.viewfinder") }
                        .buttonStyle(.bordered).controlSize(.small).disabled(unlocking)
                        .accessibilityIdentifier("map-unlock-dense-spot-camera")
                }
            }
        }
    }

    private func unlockHere(cameraFix: LocationSample? = nil) async {
        unlocking = true; unlockMessage = nil
        defer { unlocking = false }
        location.start()
        location.requestPreciseAccuracyIfNeeded()
        var fix = cameraFix
        if cameraFix == nil {
            for _ in 0..<20 {
                fix = DenseSpotClient.bestFix(gps: location.location, camera: container.arcore.cameraFix)
                if let fix, fix.accuracy <= LocationNotePolicy.maxEntryAccuracy { break }
                try? await Task.sleep(for: .milliseconds(500))
            }
        }
        guard let fix else { unlockMessage = String(localized: "Konum alınamadı. Açık bir alanda kısa süre bekleyip tekrar deneyin."); return }
        do {
            let result = try await DenseSpotClient.shared.unlock(at: fix)
            if result.unlocked.isEmpty {
                let meters = Int((result.unlockRadius ?? 15).rounded())
                unlockMessage = String(localized: "Henüz yeterince yakın değilsin. Noktaya \(meters) m kadar yaklaş; dışarıda AR kamerası daha hassastır.")
            } else {
                await startAndLoad()
            }
        } catch { unlockMessage = String(localized: "Postlar şu anda yüklenemiyor. Bağlantını kontrol edip tekrar dene.") }
    }

    private func countBubble(_ count: Int) -> some View {
        ZStack {
            Circle()
                .fill(LociTheme.surface)
                .frame(width: 44, height: 44)
                .overlay(Circle().stroke(LociTheme.accent, lineWidth: 2.5))
                .shadow(color: .black.opacity(0.35), radius: 4)
            Text(count, format: .number)
                .font(.subheadline.bold())
                .foregroundStyle(LociTheme.accent)
        }
    }

    private func zoom(into coordinate: CLLocationCoordinate2D) {
        withAnimation { camera = .camera(MapCamera(centerCoordinate: coordinate, distance: 400)) }
    }

    /// Picks heat, count bubbles or notes from the visible width and loads density after a short pause.
    private func refreshLayer(for region: MKCoordinateRegion) {
        let width = region.span.longitudeDelta * 111_320 * cos(region.center.latitude * .pi / 180)
        let next = NoteMapLayer.forWidth(width)
        if next != layer { layer = next; densityCells = [] }
        densityTask?.cancel()
        guard let precision = next.precision, container.isBackendConfigured, !session.isLocalPreview else { return }
        densityTask = Task {
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            let cells = try? await NoteDensityClient.shared.cells(in: region, precision: precision)
            guard !Task.isCancelled, layer == next else { return }
            densityCells = cells ?? []
        }
    }

    private func startAndLoad() async {
        guard !isLoading else { reloadRequested = true; return }
        isLoading = true
        defer { isLoading = false }
        repeat {
            reloadRequested = false
            await loadOnce()
        } while reloadRequested && !Task.isCancelled
    }

    private func loadOnce() async {
#if DEBUG
        if UITestFixtures.locationPermissionDenied {
            location.start()
            message = location.errorMessage
            return
        }
#endif
        if session.isLocalPreview {
            posts = mergedPosts([UITestFixtures.post])
            message = nil
            return
        }
        location.start()
        for _ in 0..<80 {
            guard !Task.isCancelled else { return }
            if let current = location.freshLocation() {
                await loadNearby(current)
                return
            }
            if let error = location.errorMessage { message = error; return }
            do { try await Task.sleep(for: .milliseconds(200)) } catch { return }
        }
        message = String(localized: "Konum henüz netleşmedi. İç mekânda biraz bekleyip tekrar dene veya Ayarlar’dan konum iznini kontrol et.")
    }

    private func loadNearby(_ current: CLLocation) async {
        if session.isLocalPreview {
            posts = mergedPosts([UITestFixtures.post])
            message = nil
            return
        }
        guard container.isBackendConfigured else {
            posts = mergedPosts([])
            message = posts.isEmpty ? String(localized: "Bağlantı ayarı tamamlandığında yakındaki postlar burada görünecek.") : nil
            return
        }
        do {
            posts = mergedPosts(try await container.posts.nearby(
                latitude: current.coordinate.latitude, longitude: current.coordinate.longitude, radiusMeters: 1_000
            ))
            message = posts.isEmpty ? String(localized: "Yakında görünür post bulunamadı.") : nil
        } catch {
            posts = mergedPosts([])
            message = posts.isEmpty ? String(localized: "Postlar şu anda yüklenemiyor. Bağlantını kontrol edip tekrar dene.") : nil
        }
    }

    private func mergedPosts(_ remote: [LociPost]) -> [LociPost] {
        var unique: [UUID: LociPost] = [:]
        for post in localDraftsForCurrentUser() + remote { unique[post.id] = post }
        return Array(unique.values).sorted {
            $0.counts.likes != $1.counts.likes ? $0.counts.likes > $1.counts.likes : $0.createdAt > $1.createdAt
        }
    }

    private func localDraftsForCurrentUser() -> [LociPost] {
        guard case let .signedIn(user) = session.phase else { return [] }
        let descriptor = FetchDescriptor<DraftRecord>(sortBy: [SortDescriptor(\.updatedAt, order: .reverse)])
        guard let records = try? modelContext.fetch(descriptor) else { return [] }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return records.compactMap { try? decoder.decode(LociPost.self, from: $0.payload) }
            .filter { $0.creatorID == user.id }
    }

    private func distanceText(for post: LociPost) -> String {
        guard let current = location.location,
              let geo = post.anchorBundle.anchor.geoPose,
              ProximityPolicy.isValidCoordinate(latitude: geo.latitude, longitude: geo.longitude) else {
            return String(localized: "Mesafe hesaplanamadı")
        }
        let distance = current.distance(from: CLLocation(latitude: geo.latitude, longitude: geo.longitude))
        guard let meters = ProximityPolicy.roundedMeters(distance) else { return String(localized: "Mesafe hesaplanamadı") }
        return meters < 1_000 ? "\(meters.formatted()) m" : String(format: "%.1f km", locale: Locale.current, distance / 1_000)
    }
}
