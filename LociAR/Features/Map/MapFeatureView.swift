import MapKit
import SwiftData
import SwiftUI
import UIKit

struct MapFeatureView: View {
    @Environment(\.openURL) private var openURL
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.contentRefreshAllowed) private var presentationAllowed
    @Environment(AppSession.self) private var session
    @Environment(AppContainer.self) private var container
    @Environment(\.modelContext) private var modelContext
    @Environment(AppRouter.self) private var router
    @Binding var showCreate: Bool
    @ScaledMetric(relativeTo: .subheadline) private var previewRowHeight: CGFloat = 44
    @ScaledMetric(relativeTo: .subheadline) private var previewListLimit: CGFloat = 176
    @State private var nearbyPanelExpanded = false
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
    @State private var densityPrecision: Int?
    @State private var heatBlobs: [NoteHeatBlob] = []
    @State private var mapGroups: [MapNoteGroup] = []
    @State private var mapUnlockRadius: Double = 15
    @State private var selectedMapGroup: MapNoteGroup?
    @State private var selectedMapGroupFix: LocationSample?
    @State private var mapWidth: Double = 390
    @State private var isVisible = false
    /// Notes of a tapped 6 m group, listed by likes in the panel.
    @State private var clusterFocus: Set<UUID>?
    @State private var showCameraUnlock = false

    enum MapFilter: String, CaseIterable, Identifiable {
        case all = "Tümü"
        case arOnly = "AR Notları"
        case locationOnly = "Konum Notları"
        var id: String { rawValue }
    }
    @State private var filter: MapFilter = .all

    /// Guests browse only; leaving a note needs a verified account (AccountRequiredView).
    private var isGuest: Bool {
        if case let .signedIn(user) = session.phase { return user.isAnonymousAccount }
        return false
    }

    private var mayFetchMap: Bool {
#if DEBUG
        let isUsingSampleContent = UITestFixtures.sampleContentEnabled
#else
        let isUsingSampleContent = false
#endif
        return isVisible && scenePhase == .active && router.selectedTab == .map && presentationAllowed
            && !showCreate && !showPlaceNote && selectedMapGroup == nil && !showCameraUnlock
            && !isUsingSampleContent
    }

    private var usesMapGroups: Bool { !layer.isHeat && container.isBackendConfigured && !session.isLocalPreview }
    private var mapClusters: [MapNoteCluster] {
        MapNoteCluster.cluster(mapGroups, longitudeSpan: visibleRegion?.span.longitudeDelta ?? 0.01,
                               viewportWidth: mapWidth, centerLongitude: visibleRegion?.center.longitude ?? 0)
    }
    private var unlistedOwnPosts: [LociPost] {
        guard case let .signedIn(user) = session.phase else { return [] }
        let listed = Set(mapGroups.flatMap(\.postIDs))
        let userPosts = posts.filter { $0.creatorID == user.id && !listed.contains($0.id.uuidString.lowercased()) }
        switch filter {
        case .all: return userPosts
        case .arOnly: return userPosts.filter { !$0.isLocationNote }
        case .locationOnly: return userPosts.filter { $0.isLocationNote }
        }
    }

    var body: some View {
        Map(position: $camera, selection: $selection) {
            UserAnnotation()
            if layer.isHeat {
                NoteHeatContent(blobs: heatBlobs) { blob in zoomCloser(to: blob.coordinate) }
            }
            if usesMapGroups {
                ForEach(mapClusters) { cluster in
                    let noteCount = cluster.count
                    Annotation("\(noteCount) not", coordinate: cluster.coordinate) {
                        Button {
                            if cluster.groups.count == 1, let group = cluster.groups.first {
                                selectedMapGroupFix = nil; selectedMapGroup = group
                            } else {
                                zoomCloser(to: cluster.coordinate, minimumDistance: 80)
                            }
                        } label: {
                            countBubble(cluster.count, intensity: NoteDensityCell.intensity(cluster.count))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(Text("\(noteCount) not"))
                        .accessibilityIdentifier("map-note-group-\(cluster.id)")
                    }
                    .annotationTitles(.hidden)
                }
            }
            if layer == .notes && !usesMapGroups {
            ForEach(clusters) { cluster in
                if cluster.posts.count == 1, let post = cluster.posts.first {
                    let isLoc = post.isLocationNote
                    Marker(
                        postTitle(post),
                        systemImage: isLoc ? "mappin.circle.fill" : (post.anchorBundle.anchor.pinQuality.isPhysicalSurface ? "viewfinder.circle.fill" : "exclamationmark.triangle.fill"),
                        coordinate: cluster.coordinate
                    )
                    .tint(isLoc ? MapNoteKindStyle.location : MapNoteKindStyle.ar)
                    .tag(post.id)
                } else {
                    Annotation("\(cluster.posts.count) not", coordinate: cluster.coordinate) {
                        Button {
                            selection = nil
                            clusterFocus = Set(cluster.posts.map(\.id))
                        } label: { countBubble(cluster.posts.count) }
                        .buttonStyle(.plain)
                        .accessibilityLabel(Text("\(cluster.posts.count) not"))
                    }
                    .annotationTitles(.hidden)
                }
            }
            }
            if layer == .notes && usesMapGroups {
                ForEach(unlistedOwnPosts) { post in
                    if let geo = post.anchorBundle.anchor.geoPose {
                        let isLoc = post.isLocationNote
                        Marker(postTitle(post), systemImage: isLoc ? "mappin.and.ellipse" : "viewfinder",
                               coordinate: CLLocationCoordinate2D(latitude: geo.latitude, longitude: geo.longitude))
                            .tint(isLoc ? MapNoteKindStyle.location : MapNoteKindStyle.ar).tag(post.id)
                    }
                }
            }
        }
        .mapStyle(.standard(elevation: layer.isHeat ? .flat : .realistic,
                            emphasis: layer.isHeat ? .muted : .automatic,
                            pointsOfInterest: layer.isHeat ? .excludingAll : .including([.cafe, .museum, .park])))
        .mapControls { MapCompass(); MapUserLocationButton() }
        .onGeometryChange(for: Double.self) { Double($0.size.width) } action: { width in
            guard abs(mapWidth - width) > 0.5 else { return }
            mapWidth = width
        }
        .overlay(alignment: .topLeading) {
            if layer.isHeat { NoteHeatLegend().padding(LociTheme.Spacing.m) }
        }
        .onMapCameraChange(frequency: .continuous) { context in
            guard !showCreate, !showPlaceNote, selectedMapGroup == nil, !showCameraUnlock else { return }
            guard container.isBackendConfigured, !session.isLocalPreview else {
                updatePreviewRegion(context.region)
                return
            }
            container.mapRequests.cameraChanged(context.region, byUser: camera.positionedByUser)
        }
        .onChange(of: container.mapRequests.presentationRevision) { _, _ in applyMapPresentation() }
        .sheet(item: $selectedMapGroup) { group in
            MapNoteGroupSheet(group: group, unlockRadius: mapUnlockRadius,
                              initialFix: selectedMapGroupFix ?? DenseSpotClient.bestFix(gps: location.freshLocation(), camera: container.arcore.cameraFix))
        }
        .sheet(isPresented: $showPlaceNote, onDismiss: {
            selection = nil
            clusterFocus = nil
            Task { await startAndLoad() }
        }) {
            if isGuest {
                NavigationStack {
                    AccountRequiredView()
                        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Kapat") { showPlaceNote = false } } }
                }
            } else {
                PlaceNoteComposer(seed: location.recentLocations)
            }
        }
        .fullScreenCover(isPresented: $showCameraUnlock) {
            CameraLocationRefineView { fix in Task { await unlockHere(cameraFix: fix) } }
        }
        .safeAreaInset(edge: .top) {
            VStack(spacing: LociTheme.Spacing.s) {
                if !layer.isHeat {
                    Picker("Filtre", selection: $filter) {
                        ForEach(MapFilter.allCases) { item in
                            Text(item.rawValue).tag(item)
                        }
                    }
                    .pickerStyle(.segmented)
                    HStack(spacing: LociTheme.Spacing.m) {
                        mapNoteLegendItem("3D AR Notu", color: MapNoteKindStyle.ar, symbol: "viewfinder.circle.fill")
                        mapNoteLegendItem("Konum Notu", color: MapNoteKindStyle.location, symbol: "mappin.circle.fill")
                        Spacer(minLength: 0)
                        mapLocationNoteButton
                    }
                    .font(.caption2.weight(.medium))
                } else {
                    HStack {
                        Spacer()
                        mapLocationNoteButton
                    }
                }
            }
            .padding(.horizontal, LociTheme.Spacing.l)
            .padding(.vertical, LociTheme.Spacing.s)
            .lociGlassSurface(cornerRadius: LociTheme.Radius.small)
            .padding(.horizontal, LociTheme.Spacing.l)
        }
        .safeAreaInset(edge: .bottom, spacing: LociTheme.Spacing.s) { mapPanel.padding(.horizontal, LociTheme.Spacing.m) }
        .navigationTitle("Harita")
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: location.authorizationStatus) { _, status in
            guard status == .authorizedAlways || status == .authorizedWhenInUse,
                  !UITestFixtures.locationPermissionDenied else { return }
            message = nil
            Task { await startAndLoad(force: true) }
        }
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button { Task { await startAndLoad(force: true) } } label: {
                    Label("Yenile", systemImage: "arrow.clockwise")
                        .labelStyle(.iconOnly)
                        .frame(minWidth: LociTheme.Control.minimumTapTarget, minHeight: LociTheme.Control.minimumTapTarget)
                }
                .accessibilityLabel(Text("Yenile"))
                .accessibilityIdentifier("map-refresh")
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button { showCreate = true } label: { Label("AR notu", systemImage: "viewfinder").labelStyle(.iconOnly) }
                    .frame(minWidth: LociTheme.Control.minimumTapTarget, minHeight: LociTheme.Control.minimumTapTarget)
                    .accessibilityLabel(Text("AR notu"))
                    .accessibilityIdentifier("map-create")
            }
        }
        .tint(LociTheme.accent)
        .navigationDestination(for: LociPost.self) { PostPreviewView(post: $0) }
        .task { await startAndLoad() }
        .onAppear { isVisible = true }
        .onChange(of: showCreate) { _, presented in
            if !presented {
                selection = nil
                Task { await startAndLoad() }
            }
        }
        .onDisappear { isVisible = false; location.stop(); container.mapRequests.suspend() }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.didReceiveMemoryWarningNotification)) { _ in
            container.mapRequests.trimMemory()
        }
        .onChange(of: mayFetchMap, initial: true) { _, active in
            if active { container.mapRequests.resume() }
            else { container.mapRequests.suspend() }
        }
        .onChange(of: container.connectivity.isOnline) { _, online in
            if online, mayFetchMap, container.mapRequests.failed { container.mapRequests.resume() }
        }
        .onChange(of: router.pendingMapFocus, initial: true) { _, focus in
            guard let focus else { return }
            router.pendingMapFocus = nil
            zoom(into: CLLocationCoordinate2D(latitude: focus.latitude, longitude: focus.longitude))
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("screen-map")
    }

    private struct PostCluster: Identifiable {
        var id: UUID { posts.first?.id ?? UUID() }
        let coordinate: CLLocationCoordinate2D
        let posts: [LociPost]
    }

    private var filteredPosts: [LociPost] {
        switch filter {
        case .all: return posts
        case .arOnly: return posts.filter { !$0.isLocationNote }
        case .locationOnly: return posts.filter { $0.isLocationNote }
        }
    }

    private var clusters: [PostCluster] {
        var result: [PostCluster] = []
        // Same fixed-distance grouping as the server's notification clusters.
        let thresholdMeters = LocationNotePolicy.spotJoinRadius

        for post in filteredPosts {
            guard let geo = post.anchorBundle.anchor.geoPose else { continue }
            let postCoord = CLLocationCoordinate2D(latitude: geo.latitude, longitude: geo.longitude)
            let postLocation = CLLocation(latitude: geo.latitude, longitude: geo.longitude)

            var added = false
            for i in 0..<result.count {
                let clusterLocation = CLLocation(
                    latitude: result[i].coordinate.latitude,
                    longitude: result[i].coordinate.longitude
                )
                if clusterLocation.distance(from: postLocation) <= thresholdMeters {
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

    private func updatePreviewRegion(_ region: MKCoordinateRegion) {
        guard let current = visibleRegion else {
            visibleRegion = region
            return
        }
        let centerChanged = abs(current.center.latitude - region.center.latitude) > 0.00001
            || abs(current.center.longitude - region.center.longitude) > 0.00001
        let spanChanged = abs(current.span.latitudeDelta - region.span.latitudeDelta) > 0.00001
            || abs(current.span.longitudeDelta - region.span.longitudeDelta) > 0.00001
        guard centerChanged || spanChanged else { return }
        visibleRegion = region
    }

    @ViewBuilder private var mapPanel: some View {
        LociCard(appearance: .floating) {
            VStack(spacing: LociTheme.Spacing.s) {
                Button {
                    withAnimation(.snappy(duration: 0.25)) { nearbyPanelExpanded.toggle() }
                } label: {
                    Capsule()
                        .fill(LociTheme.secondaryText.opacity(0.55))
                        .frame(width: 38, height: 4)
                        .frame(maxWidth: .infinity)
                        .frame(height: LociTheme.Control.minimumTapTarget)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .highPriorityGesture(
                    DragGesture(minimumDistance: 12).onEnded { value in
                        guard abs(value.translation.height) > 24 else { return }
                        withAnimation(.snappy(duration: 0.25)) {
                            nearbyPanelExpanded = value.translation.height < 0
                        }
                    }
                )
                .accessibilityLabel(
                    Text(nearbyPanelExpanded
                        ? String(localized: "Yakındaki notları küçült")
                        : String(localized: "Yakındaki notları genişlet"))
                )
                .accessibilityIdentifier("map-nearby-panel-toggle")
                Group {
                    if container.isBackendConfigured, !session.isLocalPreview, selectedPost == nil {
                        summaryPanel
                    } else if let selectedPost {
                        VStack(alignment: .leading, spacing: LociTheme.Spacing.m) {
                            HStack(alignment: .top) {
                                VStack(alignment: .leading, spacing: LociTheme.Spacing.xs) {
                                    HStack(spacing: LociTheme.Spacing.s) {
                                        if selectedPost.isLocationNote {
                                            Label("Konum Notu", systemImage: "mappin.and.ellipse")
                                                .font(.caption2.weight(.bold))
                                                .foregroundStyle(MapNoteKindStyle.location)
                                                .padding(.horizontal, LociTheme.Spacing.s).padding(.vertical, LociTheme.Spacing.xxs)
                                                .background(
                                                    MapNoteKindStyle.location.opacity(0.15),
                                                    in: Capsule())
                                        } else {
                                            Label("3D AR Notu", systemImage: "viewfinder")
                                                .font(.caption2.weight(.bold))
                                                .foregroundStyle(MapNoteKindStyle.ar)
                                                .padding(.horizontal, LociTheme.Spacing.s).padding(.vertical, LociTheme.Spacing.xxs)
                                                .background(
                                                    MapNoteKindStyle.ar.opacity(0.15), in: Capsule()
                                                )
                                        }
                                    }
                                    Text(postTitle(selectedPost))
                                        .font(.headline).lineLimit(2)
                                    Label(
                                        distanceText(for: selectedPost).localizedUI,
                                        systemImage: "location.fill"
                                    )
                                    .font(.caption).foregroundStyle(LociTheme.secondaryText)
                                }
                                Spacer()
                                Button {
                                    selection = nil
                                } label: {
                                    Image(systemName: "xmark.circle.fill")
                                        .frame(minWidth: LociTheme.Control.minimumTapTarget, minHeight: LociTheme.Control.minimumTapTarget)
                                        .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain).foregroundStyle(LociTheme.secondaryText).font(.title3)
                                .accessibilityLabel(Text("Seçimi kapat"))
                                .accessibilityIdentifier("map-clear-selection")
                            }
                            if let spot = selectedPost.denseSpot {
                                denseSpotBanner(spot)
                            } else {
                                NavigationLink(value: selectedPost) {
                                    Label("Postu aç", systemImage: "arrow.up.right")
                                        .frame(maxWidth: .infinity, minHeight: 34)
                                }
                                .buttonStyle(LociPrimaryButtonStyle())
                                .accessibilityIdentifier("map-open-selected-post")
                            }
                        }
                    } else {
                        VStack(spacing: LociTheme.Spacing.m) {
                            HStack(spacing: LociTheme.Spacing.m) {
                                ZStack {
                                    Circle().fill(LociTheme.accent.opacity(0.16)).frame(
                                        width: 42, height: 42)
                                    if isLoading {
                                        ProgressView().tint(LociTheme.accent)
                                    } else {
                                        Image(systemName: statusSymbol).foregroundStyle(
                                            LociTheme.accent)
                                    }
                                }
                                VStack(alignment: .leading, spacing: LociTheme.Spacing.xs) {
                                    Text(
                                        isLoading
                                            ? String(localized: "Yakın çevre taranıyor")
                                            : String(localized: "Yakındaki notlar")
                                    )
                                    .font(.headline)
                                    Text(
                                        message?.localizedUI
                                            ?? (posts.isEmpty
                                                ? String(localized: "Henüz not yok")
                                                : String(localized: "\(posts.count) not"))
                                    )
                                    .font(.caption).foregroundStyle(LociTheme.secondaryText)
                                    .lineLimit(2)
                                }
                                Spacer(minLength: 0)
                                if message != nil && !isLoading {
                                    if location.authorizationStatus == .denied
                                        || location.authorizationStatus == .restricted
                                        || UITestFixtures.locationPermissionDenied
                                    {
                                        Button("Ayarlar") {
                                            if let url = URL(
                                                string: UIApplication.openSettingsURLString)
                                            {
                                                openURL(url)
                                            }
                                        }
                                        .buttonStyle(LociCompactButtonStyle())
                                        .accessibilityIdentifier("map-location-settings")
                                    } else {
                                        Button {
                                            Task { await startAndLoad() }
                                        } label: {
                                            Image(systemName: "arrow.clockwise")
                                                .frame(minWidth: LociTheme.Control.minimumTapTarget, minHeight: LociTheme.Control.minimumTapTarget)
                                        }
                                        .buttonStyle(LociCompactButtonStyle())
                                        .accessibilityLabel(Text("Tekrar dene"))
                                    }
                                }
                            }
                            if !isLoading && posts.isEmpty {
                                Button("İlk yüzeyi sen oluştur", systemImage: "plus.viewfinder") {
                                    showCreate = true
                                }
                                .buttonStyle(LociPrimaryButtonStyle())
                            } else if !isLoading {
                                if clusterFocus != nil {
                                    HStack {
                                        Text("Bu noktadaki notlar · en çok beğenilen önce").font(
                                            .caption.weight(.semibold))
                                        Spacer()
                                        Button {
                                            clusterFocus = nil
                                        } label: {
                                            Image(systemName: "xmark.circle.fill")
                                                .frame(minWidth: LociTheme.Control.minimumTapTarget, minHeight: LociTheme.Control.minimumTapTarget)
                                                .contentShape(Rectangle())
                                        }
                                        .buttonStyle(.plain).foregroundStyle(LociTheme.secondaryText)
                                        .accessibilityLabel(Text("Seçimi kapat"))
                                    }
                                }
                                if let spot = listedPosts.lazy.compactMap(\.denseSpot).first {
                                    denseSpotBanner(spot)
                                }
                                if !readablePreviewPosts.isEmpty {
                                    ScrollView {
                                        LazyVStack(spacing: LociTheme.Spacing.m) {
                                            ForEach(readablePreviewPosts) { post in
                                                NavigationLink(value: post) {
                                                    HStack(spacing: LociTheme.Spacing.m) {
                                                        Image(
                                                            systemName: post.anchorBundle.anchor
                                                                .pinQuality.isPhysicalSurface
                                                                ? "viewfinder.circle.fill"
                                                                : "exclamationmark.triangle.fill"
                                                        )
                                                        .foregroundStyle(
                                                            post.anchorBundle.anchor.pinQuality
                                                                .isPhysicalSurface
                                                                ? LociTheme.accent : LociTheme.warning)
                                                        Text(postTitle(post))
                                                            .font(.subheadline.weight(.semibold))
                                                            .foregroundStyle(LociTheme.textPrimary)
                                                            .lineLimit(1)
                                                        Spacer()
                                                        if post.counts.likes > 0 {
                                                            Label {
                                                                Text(
                                                                    post.counts.likes,
                                                                    format: .number)
                                                            } icon: {
                                                                Image(systemName: "heart.fill")
                                                            }
                              .font(.caption).foregroundStyle(LociTheme.secondaryText)
                            }
                            Image(systemName: "chevron.right")
                              .font(.caption)
                              .foregroundStyle(LociTheme.secondaryText)
                          }
                          .frame(height: previewRowHeight)
                          .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .disabled(post.isLocked)
                        .accessibilityIdentifier("map-open-\(post.caption)")
                      }
                    }
                  }
                  // A vertical ScrollView otherwise takes the entire proposed cap,
                  // leaving a large empty glass panel when only one note is present.
                  .frame(
                    height: min(
                      nearbyPanelExpanded ? max(previewListLimit, 300) : previewListLimit,
                      CGFloat(readablePreviewPosts.count) * previewRowHeight
                        + CGFloat(max(0, readablePreviewPosts.count - 1)) * 10))
                }
              }
            }
          }
        }
      }
    }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("map-preview-panel")
    }

    private var summaryPanel: some View {
        VStack(alignment: .leading, spacing: LociTheme.Spacing.m) {
            HStack {
                if container.mapRequests.isLoading { ProgressView().tint(LociTheme.accent) }
                Label("Yakındaki notlar", systemImage: "map")
                    .font(.headline)
                Spacer()
                if !mapGroups.isEmpty {
                    let noteCount = mapGroups.reduce(0) { $0 + $1.count }
                    Text("\(noteCount) not").font(.caption).foregroundStyle(LociTheme.secondaryText)
                }
            }
            if container.mapRequests.failed {
                Text("Postlar şu anda yüklenemiyor. Bağlantını kontrol edip tekrar dene.")
                    .font(.caption).foregroundStyle(LociTheme.secondaryText)
            } else if !layer.isHeat, !mapGroups.isEmpty {
                ScrollView(.horizontal) {
                    HStack(spacing: LociTheme.Spacing.m) {
                        ForEach(mapGroups.prefix(15)) { group in
                            Button {
                                selectedMapGroupFix = nil
                                selectedMapGroup = group
                            } label: {
                                let noteCount = group.count
                                Label("\(noteCount) not", systemImage: "mappin.and.ellipse")
                            }
                            .buttonStyle(LociCompactButtonStyle())
                            .accessibilityIdentifier("map-summary-group-\(group.id)")
                        }
                    }
                }
                .frame(height: previewRowHeight)
            }
        }
    }

    private var statusSymbol: String { posts.isEmpty ? "location.magnifyingglass" : "mappin.and.ellipse" }

    private var readablePreviewPosts: [LociPost] { listedPosts.filter { !$0.isLocked } }

    /// Panel order follows likes so the most useful note at a place comes first.
    private var listedPosts: [LociPost] {
        if let clusterFocus { return posts.filter { clusterFocus.contains($0.id) } }
        guard let current = location.location else { return posts }
        // Nearby places first; notes within each 6 m group retain their likes order.
        return clusters.sorted {
            let a = current.distance(from: CLLocation(latitude: $0.coordinate.latitude, longitude: $0.coordinate.longitude))
            let b = current.distance(from: CLLocation(latitude: $1.coordinate.latitude, longitude: $1.coordinate.longitude))
            return a != b ? a < b : $0.id.uuidString < $1.id.uuidString
        }.flatMap(\.posts)
    }

    private func postTitle(_ post: LociPost) -> String {
        if post.isLocked { return String(localized: "Kilitli not") }
        return post.caption.isEmpty ? String(localized: "Not") : post.caption
    }

    /// Dense spot: the count is public, the text opens only on site (GPS ~15 m, AR camera 2-5 m).
    private func denseSpotBanner(_ spot: DenseSpotInfo) -> some View {
        let noteCount = spot.count
        return VStack(alignment: .leading, spacing: LociTheme.Spacing.s) {
            Label(String(localized: "\(noteCount) not"), systemImage: "lock.fill")
                .font(.caption.weight(.semibold))
            Text("Notları görmek için yaklaş ve haritada aç.").font(.caption).foregroundStyle(LociTheme.secondaryText)
            HStack {
                Button { Task { await unlockHere() } } label: {
                    Label("Burada aç", systemImage: "lock.open")
                }
                .buttonStyle(LociCompactButtonStyle())
                .accessibilityIdentifier("map-unlock-dense-spot")
                if container.arcore.isEnabled, CameraLocationRefineView.isSupported {
                    Button { showCameraUnlock = true } label: { Label("Kamerayla aç", systemImage: "camera.viewfinder") }
                        .buttonStyle(LociCompactButtonStyle())
                        .accessibilityIdentifier("map-unlock-dense-spot-camera")
                }
            }
        }
    }

    private func unlockHere(cameraFix: LocationSample? = nil) async {
        guard let post = selectedPost ?? listedPosts.first(where: { $0.denseSpot != nil }), let spot = post.denseSpot else { return }
        let id = spot.groupID ?? "spot:\(spot.id)"
        let postID = post.id.uuidString.lowercased()
        selectedMapGroupFix = cameraFix
        if let group = MapNoteGroup.containing(postID, groupID: id, in: mapGroups) {
            selectedMapGroup = group
        } else {
            // The side panel follows GPS while summaries follow the viewport. Resolve the
            // actual place even when the user has panned elsewhere or is viewing heat.
            do {
                let region = MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: spot.lat, longitude: spot.lng),
                                                latitudinalMeters: 160, longitudinalMeters: 160)
                let result = try await NoteDensityClient.shared.groups(in: region)
                mapUnlockRadius = result.unlockRadius
                if let group = MapNoteGroup.containing(postID, groupID: id, in: result.groups) {
                    selectedMapGroup = group
                    return
                }
            } catch {
                message = String(localized: "Postlar şu anda yüklenemiyor. Bağlantını kontrol edip tekrar dene.")
                return
            }
            let members = posts.filter { $0.denseSpot?.id == spot.id }.map { $0.id.uuidString.lowercased() }
            selectedMapGroup = MapNoteGroup(id: id, lat: spot.lat, lng: spot.lng, count: spot.count, radius: 0, postIDs: members)
        }
    }

    private func countBubble(_ count: Int, intensity: Double = 0) -> some View {
        NoteDensityBadge(count: count, intensity: intensity)
    }

    private func mapNoteLegendItem(_ title: LocalizedStringKey, color: Color, symbol: String) -> some View {
        Label(title, systemImage: symbol)
            .foregroundStyle(color)
            .accessibilityElement(children: .combine)
    }

    private var mapLocationNoteButton: some View {
        Button { showPlaceNote = true } label: {
            Image(systemName: "square.and.pencil")
                .frame(minWidth: LociTheme.Control.minimumTapTarget, minHeight: LociTheme.Control.minimumTapTarget)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(LociTheme.accent)
        .accessibilityLabel(Text("Konum notu"))
        .accessibilityIdentifier("map-location-note")
    }

    private func zoom(into coordinate: CLLocationCoordinate2D) {
        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.5)) {
            camera = .camera(MapCamera(centerCoordinate: coordinate, distance: 400))
        }
    }

    private static func widthMeters(_ region: MKCoordinateRegion) -> Double {
        region.span.longitudeDelta * 111_320 * cos(region.center.latitude * .pi / 180)
    }

    /// A tapped heat spot zooms several steps in, so a few taps go from the globe to a street.
    private func zoomCloser(to coordinate: CLLocationCoordinate2D, minimumDistance: Double = 700) {
        let width = visibleRegion.map(Self.widthMeters) ?? 20_000
        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.5)) {
            camera = .camera(MapCamera(centerCoordinate: coordinate, distance: max(minimumDistance, width / 5)))
        }
    }

    private func applyMapPresentation() {
        guard let value = container.mapRequests.presentation else {
            mapGroups = []; densityCells = []; heatBlobs = []
            return
        }
        visibleRegion = value.viewport.region
        layer = value.layer
        switch value.summary.content {
        case .heat(let cells):
            densityCells = cells
            densityPrecision = value.layer.precision
            heatBlobs = NoteHeatBlob.bin(cells, longitudeSpan: value.viewport.longitudeDelta)
            mapGroups = []
        case .groups(let groups, let unlockRadius):
            mapGroups = groups; mapUnlockRadius = unlockRadius
            densityCells = []; heatBlobs = []
        }
    }

    private func startAndLoad(force: Bool = false) async {
#if DEBUG
        if UITestFixtures.sampleContentEnabled && !UITestFixtures.locationPermissionDenied {
            posts = mergedPosts([UITestFixtures.post])
            message = nil
            return
        }
#endif
        if container.isBackendConfigured, !session.isLocalPreview {
            posts = localDraftsForCurrentUser()
            // Distance and nearest-first order need the device position; opening the map never asks for permission.
            if location.authorizationStatus == .authorizedWhenInUse || location.authorizationStatus == .authorizedAlways { location.start() }
            if mayFetchMap { container.mapRequests.resume() }
            if force { container.mapRequests.refresh() }
            if container.mapRequests.presentation != nil { applyMapPresentation() }
            return
        }
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

private enum MapNoteKindStyle {
    static let ar = LociTheme.mapAR
    static let location = LociTheme.mapLocation
}
