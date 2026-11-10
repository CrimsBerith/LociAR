import AVFoundation
import CoreLocation
import SwiftData
import SwiftUI
import UIKit

struct ARExperienceView: View {
    enum Mode {
        case discover
        case create
    }

    var mode: Mode = .discover
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(AppContainer.self) private var container
    @Environment(AppSession.self) private var session
    @Environment(AppRouter.self) private var router
    @Environment(ARPinningEngine.self) private var engine
    @Environment(\.modelContext) private var modelContext
    @State private var cameraSessionGeneration: UUID?
    @State private var showCreate = false
    @State private var errorMessage: String?
    @State private var isPreparingContent = false
    /// Banner text while the pin is saved (Cloud Anchor hosting or world map).
    @State private var prepareStatus: String?
    @State private var prepareTask: Task<Void, Never>?
    @State private var prepareGeneration = 0
    @State private var location = LocationController()
    @State private var nearbyPosts: [LociPost] = []
    @State private var viewingPost: LociPost?
    @State private var discoveryMessage = String(localized: "Yakındaki AR yayınları aranıyor…")
    @State private var isDiscovering = true
    @State private var isCreationMode = false
    @State private var isStartingCreationMode = false
    @State private var isHandlingARSelection = false
    @State private var mappingWaitExpired = false
    @State private var tabChangeTask: Task<Void, Never>?
    @State private var pinRequestTask: Task<Void, Never>?

    init(mode: Mode = .discover) {
        self.mode = mode
        _isCreationMode = State(initialValue: mode == .create)
    }

    var body: some View {
        ZStack {
            if let post = viewingPost, !isCreationMode {
                ARPostViewerView(post: post, onClose: {
                    viewingPost = nil
                    Task { await startCameraForDiscovery() }
                })
            } else {
                ARViewContainer(engine: engine)
                    .ignoresSafeArea()
                if !engine.hasRecentCameraFrame {
                    ARCameraBackdrop(failed: engine.state == .failed, message: engine.statusMessage)
                }
                if isCreationMode {
                    reticle
                    VStack {
                        statusPanel
                        Spacer()
                        controls
                    }
                    .padding(LociTheme.Spacing.l)
                } else {
                    discoveryPanel
                }
            }
            screenProbe
        }
        .background(LociTheme.background)
        .accessibilityElement(children: .contain)
        .navigationBarHidden(true)
        .arcoreDisclosure()
        .task { await handleAppearance() }
        .task(id: engine.currentAnchor?.id) {
            mappingWaitExpired = false
            guard engine.currentAnchor?.pinQuality.isPhysicalSurface == true,
                  !canPrepareContent else { return }
            try? await Task.sleep(for: .seconds(45))
            if engine.currentAnchor?.pinQuality.isPhysicalSurface == true,
               !canPrepareContent {
                mappingWaitExpired = true
            }
        }
        .onChange(of: canPrepareContent) { _, isReady in
            if isReady { mappingWaitExpired = false }
        }
        .onChange(of: router.selectedTab) { _, tab in
            if mode == .create, tab == .create {
                tabChangeTask?.cancel()
                tabChangeTask = Task { await startCreationMode() }
            } else if mode == .create {
                prepareTask?.cancel()
                prepareTask = nil
                showCreate = false
                isPreparingContent = false
                prepareStatus = nil
                errorMessage = nil
                isCreationMode = false
            } else if mode == .discover, tab == .ar {
                tabChangeTask?.cancel()
                tabChangeTask = Task { await handleARSelection() }
            }
        }
        .onChange(of: router.createPinRequested) { _, requested in
            guard requested, mode == .create else { return }
            router.createPinRequested = false
            pinRequestTask?.cancel()
            pinRequestTask = Task { await startCreationMode() }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active {
                location.stop()
            }
        }
        .onDisappear {
            tabChangeTask?.cancel()
            pinRequestTask?.cancel()
            prepareTask?.cancel()
            location.stop()
            let siblingARTabActive = (mode == .discover && router.selectedTab == .create)
                || (mode == .create && router.selectedTab == .ar)
            if viewingPost == nil, !siblingARTabActive, !showCreate, !router.isCreatePresented {
                engine.stopSession(ifGenerationMatches: cameraSessionGeneration)
            }
        }
        .sheet(isPresented: $showCreate) { CreatePostView(anchor: engine.currentAnchor) }
        .alert("AR işlemi tamamlanamadı", isPresented: Binding(
            get: { errorMessage != nil },
            set: { if !$0 { errorMessage = nil } }
        )) { Button("Tamam", role: .cancel) {} } message: { Text(errorMessage ?? "") }
    }

    private var screenProbe: some View {
        Color.clear
            .frame(width: 1, height: 1)
            .accessibilityElement()
            .accessibilityIdentifier("screen-ar")
            .accessibilityLabel(Text("AR ekranı"))
            .allowsHitTesting(false)
    }

    private var discoveryPanel: some View {
        ZStack {
            LociTheme.mediaOverlayScrim.opacity(engine.hasRecentCameraFrame ? 0.08 : 0.12).ignoresSafeArea()
            VStack(spacing: LociTheme.Spacing.xl2) {
                HStack {
                    Spacer()
                    ARCoreNoticeButton()
                }
                Spacer()
                ZStack {
                    Circle().fill(LociTheme.accent.opacity(0.12)).frame(width: 82, height: 82)
                    Image(systemName: isDiscovering ? "location.magnifyingglass" : "viewfinder.circle.fill")
                        .font(.system(size: 38, weight: .semibold))
                        .foregroundStyle(LociTheme.accent)
                        .symbolEffect(.pulse, isActive: isDiscovering && !reduceMotion)
                }
                LociStatusPill(
                    title: discoveryCameraTitle,
                    symbol: discoveryCameraSymbol,
                    color: discoveryCameraColor
                )
                .accessibilityIdentifier("ar-camera-status")
                VStack(spacing: LociTheme.Spacing.s) {
                    Text(discoveryHeading)
                        .font(.title3.bold())
                    Text(discoveryMessage.localizedUI)
                        .font(.footnote)
                        .foregroundStyle(LociTheme.secondaryText)
                        .multilineTextAlignment(.center)
                }
                if isDiscovering {
                    ProgressView().tint(LociTheme.accent)
                } else {
                    if cameraPermissionDenied {
                        Button("Kamera ayarlarını aç", systemImage: "gear") {
                            if let url = URL(string: UIApplication.openSettingsURLString) {
                                openURL(url)
                            }
                        }
                        .buttonStyle(LociPrimaryButtonStyle())
                    }
                    if !nearbyPosts.isEmpty {
                        ScrollView(.vertical, showsIndicators: false) {
                            VStack(spacing: LociTheme.Spacing.s) {
                                ForEach(nearbyPosts.prefix(8)) { post in
                                    Button {
                                        openInAR(post)
                                    } label: {
                                        HStack(spacing: LociTheme.Spacing.m) {
                                            Image(systemName: post.anchorBundle.anchor.pinQuality.isPhysicalSurface ? "viewfinder.circle.fill" : "exclamationmark.triangle.fill")
                                                .foregroundStyle(post.anchorBundle.anchor.pinQuality.isPhysicalSurface ? LociTheme.accent : LociTheme.warning)
                                            VStack(alignment: .leading, spacing: LociTheme.Spacing.xxs) {
                                                if post.isLocked { Text("Kilitli not").font(.subheadline.weight(.semibold)) }
                                                else if post.caption.isEmpty { Text("Mekânsal post").font(.subheadline.weight(.semibold)) }
                                                else { TranslatedPostText(text: post.caption, lineLimit: 1).font(.subheadline.weight(.semibold)) }
                                                if post.isOfficialContent { OfficialContentBadge() }
                                                Text(distanceText(for: post).localizedUI)
                                                    .font(.caption).foregroundStyle(LociTheme.secondaryText)
                                            }
                                            Spacer()
                                            Image(systemName: "viewfinder")
                                                .foregroundStyle(LociTheme.accent)
                                        }
                                        .padding(LociTheme.Spacing.m)
                                        .background(LociTheme.rowSurface, in: RoundedRectangle(cornerRadius: LociTheme.Radius.medium, style: .continuous))
                                        .overlay(RoundedRectangle(cornerRadius: LociTheme.Radius.medium, style: .continuous).stroke(LociTheme.glassBorder))
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityIdentifier("ar-nearby-post-\(post.id.uuidString.lowercased())")
                                }
                            }
                            .padding(.vertical, 2)
                        }
                        .frame(maxHeight: 220)
                    }
                    HStack(spacing: LociTheme.Spacing.m) {
                        Button("Yenile", systemImage: "arrow.clockwise") {
                            Task { await discoverAndOpenNearestPost(automaticallyOpen: false) }
                        }
                        .buttonStyle(LociCompactButtonStyle())
                        Button {
                            Task { await startCreationMode() }
                        } label: {
                            if isStartingCreationMode {
                                HStack(spacing: LociTheme.Spacing.s) {
                                    ProgressView().tint(LociTheme.onAccent)
                                    Text("Kamera hazırlanıyor")
                                }
                            } else {
                                Label("Yeni pin", systemImage: "plus")
                            }
                        }
                        .buttonStyle(LociPrimaryButtonStyle())
                        .disabled(isStartingCreationMode)
                        .accessibilityIdentifier("ar-new-pin")
                    }
                }
                Spacer()
            }
            .padding(LociTheme.Spacing.xl)
        }
    }

    private var reticle: some View {
        ZStack {
            Circle().fill(LociTheme.mediaOverlayScrim.opacity(0.12)).frame(width: 66, height: 66)
            Circle().stroke(reticleColor.opacity(0.34), lineWidth: LociTheme.Stroke.hairline).frame(width: 66, height: 66)
            Circle().stroke(reticleColor, style: StrokeStyle(lineWidth: LociTheme.Stroke.emphasis, dash: [11, 7])).frame(width: 54, height: 54)
            Circle().fill(reticleColor).frame(width: 8, height: 8)
        }
        .shadow(color: LociTheme.mediaOverlayScrim.opacity(0.7), radius: LociTheme.Depth.smallRadius)
        .accessibilityLabel(Text(reticleLabel.localizedUI))
    }

    private var reticleColor: Color {
        switch engine.candidateQuality {
        case .planeGeometry: LociTheme.accent
        case .estimatedPlane: LociTheme.warning
        case .freeSpaceApproximate: LociTheme.warning
        case nil: LociTheme.mediaOverlayText.opacity(0.7)
        }
    }

    private var reticleLabel: String {
        switch engine.candidateQuality {
        case .planeGeometry: String(localized: "Gerçek yüzey hazır")
        case .estimatedPlane: String(localized: "Tahmini yüzey hazır")
        case .freeSpaceApproximate: String(localized: "Yaklaşık yerleşim")
        case nil: String(localized: "Yüzey aranıyor")
        }
    }

    private var statusPanel: some View {
        LociCard(appearance: .floating) {
            VStack(alignment: .leading, spacing: LociTheme.Spacing.s) {
                HStack {
                    LociStatusPill(title: arStatusTitle, symbol: arStatusSymbol, color: arStatusColor)
                    Spacer()
                    if engine.currentAnchor != nil {
                        Image(systemName: "checkmark.seal.fill").foregroundStyle(LociTheme.accent)
                    }
                    ARCoreNoticeButton()
                }
                Text(userFacingStatusMessage.localizedUI).font(.footnote)
                    .foregroundStyle(LociTheme.secondaryText)
                if let anchor = engine.currentAnchor {
                    Text(anchor.pinQuality.isPhysicalSurface ? String(localized: "Fiziksel yüzeye yerleştirildi") : String(localized: "Yaklaşık yerleştirme · 0,8 m"))
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(anchor.pinQuality.isPhysicalSurface ? LociTheme.accent : LociTheme.warning)
                        .accessibilityIdentifier("ar-pin-diagnostic")
                }
#if DEBUG
                DisclosureGroup(String(localized: "Tanılama")) {
                    Text(engine.mappingDiagnosticSummary)
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(LociTheme.secondaryText)
                        .accessibilityIdentifier("ar-mapping-diagnostic")
                }
                .font(.caption)
#endif
            }
        }
    }

    private var controls: some View {
        VStack(spacing: LociTheme.Spacing.m) {
            if engine.state == .approximateOffered {
                LociInlineNotice(
                    title: String(localized: "Yüzey henüz bulunamadı"),
                    message: String(localized: "Biraz daha tara veya açıkça yaklaşık yerleştirmeyi seç."),
                    symbol: "exclamationmark.triangle.fill",
                    color: LociTheme.warning
                )
            }
            if engine.state == .failed {
                if isUnsupported {
                    Label("AR bu cihazda desteklenmiyor", systemImage: "iphone.slash")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(LociTheme.secondaryText)
                        .frame(maxWidth: .infinity, minHeight: LociTheme.Control.formButtonHeight)
                        .lociGlassSurface(cornerRadius: LociTheme.Radius.medium)
                } else if cameraPermissionDenied {
                    Button("Kamera ayarlarını aç", systemImage: "gear") {
                        if let url = URL(string: UIApplication.openSettingsURLString) {
                            openURL(url)
                        }
                    }
                    .buttonStyle(LociPrimaryButtonStyle())
                } else {
                    Button("Tekrar dene", systemImage: "arrow.clockwise") { Task { await engine.requestCameraAndStart() } }
                        .buttonStyle(LociPrimaryButtonStyle())
                }
            } else if engine.currentAnchor != nil {
                Button("Tekrar tara", systemImage: "arrow.clockwise") { engine.restartTracking() }
                    .buttonStyle(LociSecondaryButtonStyle())
                if !canPrepareContent {
                    LociInlineNotice(
                        title: mappingWaitExpired ? String(localized: "Çevre haritası hazır olmadı") : String(localized: "Çevre haritası hazırlanıyor"),
                        message: mappingWaitExpired
                            ? String(localized: "Daha iyi ışıkta dokulu yüzeyi farklı açılardan tara. Tekrar tara veya İptal et.")
                            : String(localized: "Postu aynı yüzeyde yeniden açabilmek için telefonu çevrede yavaşça gezdir."),
                        symbol: "viewfinder",
                        color: LociTheme.warning
                    )
                }
                if let prepareStatus {
                    Text(prepareStatus.localizedUI)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(LociTheme.secondaryText)
                        .multilineTextAlignment(.center)
                        .accessibilityIdentifier("ar-saving-status")
                }
                Button {
                    startPreparingContent()
                } label: {
                    if isPreparingContent { ProgressView().tint(LociTheme.onAccent) }
                    else if canPrepareContent { Label("İçerik ekle", systemImage: "plus.circle.fill") }
                    else { Label("Çevreyi tara", systemImage: "viewfinder") }
                }
                    .buttonStyle(LociPrimaryButtonStyle())
                    .disabled(isPreparingContent || !canPrepareContent)
                    .accessibilityIdentifier("ar-add-content")
                if mappingWaitExpired {
                    Button("İptal et", role: .cancel) { cancelMappingCapture() }
                        .buttonStyle(LociSecondaryButtonStyle())
                        .accessibilityIdentifier("ar-cancel-mapping")
                }
            } else {
                Button {
                    engine.requestPin()
                } label: {
                    Label("Yüzeye sabitle", systemImage: "viewfinder")
                }
                .buttonStyle(LociPrimaryButtonStyle())
                .accessibilityElement(children: .ignore)
                .accessibilityAddTraits(.isButton)
                .accessibilityLabel(Text("Yüzeye sabitle"))
                .accessibilityIdentifier("ar-pin-surface")

                Button {
                    engine.offerApproximatePlacement()
                    engine.placeApproximate()
                    startPreparingContent()
                } label: {
                    Label("Yaklaşık yerleştir", systemImage: "cube.transparent")
                }
                .buttonStyle(LociSecondaryButtonStyle())
                .accessibilityIdentifier("ar-place-approximate-direct")
            }
        }
        .padding(LociTheme.Spacing.m)
        .padding(.bottom, LociTheme.Spacing.xs)
    }

    private var arStatusTitle: String {
        if engine.state == .failed { return isUnsupported ? "AR desteklenmiyor" : String(localized: "Kamera açılamadı") }
        if engine.currentAnchor?.pinQuality.isPhysicalSurface == true, !canPrepareContent {
            return String(localized: "Yüzey kilitli · haritalanıyor")
        }
        if engine.currentAnchor != nil { return String(localized: "Yerleştirildi") }
        if engine.candidateQuality == .planeGeometry { return String(localized: "Kesin yüzey hazır") }
        if engine.candidateQuality == .estimatedPlane { return String(localized: "Tahmini yüzey hazır") }
        if engine.candidateQuality != nil { return String(localized: "Yüzey hazır") }
        if engine.trackingQuality == .normal { return String(localized: "Yüzey aranıyor") }
        if engine.hasRecentCameraFrame { return String(localized: "Kamera açık · tarama sınırlı") }
        return String(localized: "Kamera hazırlanıyor")
    }

    private var arStatusSymbol: String {
        if engine.state == .failed { return "exclamationmark.triangle.fill" }
        return engine.currentAnchor != nil ? "checkmark" : engine.candidateQuality != nil ? "viewfinder.circle.fill" : "move.3d"
    }

    private var arStatusColor: Color {
        if engine.state == .failed { return LociTheme.danger }
        if engine.currentAnchor?.pinQuality.isPhysicalSurface == true, !canPrepareContent { return LociTheme.warning }
        if engine.candidateQuality == .estimatedPlane { return LociTheme.warning }
        return engine.currentAnchor != nil || engine.candidateQuality != nil ? LociTheme.accent : LociTheme.warning
    }

    private var userFacingStatusMessage: String {
        if engine.state == .failed { return engine.statusMessage }
        if engine.currentAnchor?.pinQuality.isPhysicalSurface == true, !canPrepareContent {
            return String(localized: "Yüzey kilitli. Yeniden açılabilir kayıt için telefonu yüzeyin çevresinde yavaşça gezdir.")
        }
        if engine.currentAnchor != nil { return String(localized: "İçeriğini ekleyebilir veya farklı bir yüzey seçebilirsin.") }
        if engine.candidateQuality != nil { return String(localized: "Telefonu sabit tut ve Yüzeye sabitle’ye dokun.") }
        if engine.trackingQuality == .normal { return String(localized: "Merkez halkayı masa, zemin veya duvar üzerinde gezdir.") }
        if engine.hasRecentCameraFrame { return engine.statusMessage }
        return String(localized: "Telefonu yavaşça hareket ettirerek çevreyi tara.")
    }

    private var isUnsupported: Bool {
        engine.state == .failed && engine.failureReason == .unsupported
    }

    private var cameraPermissionDenied: Bool {
        if UITestFixtures.cameraPermissionDenied { return true }
        let status = AVCaptureDevice.authorizationStatus(for: .video)
        return status == .denied || status == .restricted
    }

    private var discoveryHeading: String {
        if isDiscovering { return String(localized: "Yayınlar aranıyor") }
        return nearbyPosts.isEmpty ? String(localized: "Yakında yayın yok") : String(localized: "Bu konumdaki yayınlar")
    }

    private var discoveryCameraTitle: String {
        if cameraPermissionDenied { return String(localized: "Kamera izni gerekli") }
        if engine.state == .failed { return String(localized: "Kamera başlatılamadı") }
        if engine.hasRecentCameraFrame { return String(localized: "Kamera açık") }
        return String(localized: "Kamera hazırlanıyor")
    }

    private var discoveryCameraSymbol: String {
        cameraPermissionDenied || engine.state == .failed ? "camera.fill.badge.exclamationmark" : "camera.fill"
    }

    private var discoveryCameraColor: Color {
        cameraPermissionDenied || engine.state == .failed ? LociTheme.warning : LociTheme.accent
    }

    private func handleAppearance() async {
        guard !Task.isCancelled, (mode == .create ? router.selectedTab == .create : router.selectedTab == .ar) else { return }
        if mode == .create {
            await startCreationMode()
            return
        }
        if router.selectedTab == .ar {
            await handleARSelection()
        }
    }

    private func startCameraForDiscovery() async {
        _ = await engine.ensureLiveCameraSession { generation in
            cameraSessionGeneration = generation
        }
    }

    private func handleARSelection() async {
        if isHandlingARSelection { return }
        isHandlingARSelection = true
        defer { isHandlingARSelection = false }
        if router.createPinRequested {
            router.createPinRequested = false
            viewingPost = nil
            isCreationMode = true
            await startCreationMode()
            return
        }
        isCreationMode = false
        guard viewingPost == nil else { return }
        await startCameraForDiscovery()
        guard !Task.isCancelled, router.selectedTab == .ar else { return }
        await discoverAndOpenNearestPost(automaticallyOpen: false)
    }

    private func discoverAndOpenNearestPost(automaticallyOpen: Bool = false) async {
        isCreationMode = false
        isDiscovering = true
        discoveryMessage = String(localized: "Yakındaki AR yayınları aranıyor…")
        if session.isLocalPreview {
            nearbyPosts = Array(localDraftsForCurrentUser().prefix(2)) + [UITestFixtures.post]
            isDiscovering = false
            discoveryMessage = nearbyPosts.isEmpty
                ? String(localized: "Cihaz test içeriği hazır.")
                : nearbyPosts.count == 1
                    ? String(localized: "1 yayın var. Dokun, sonra nokta atışı yönlendirme başlar.")
                    : String(localized: "\(nearbyPosts.count) yayın var. Birine dokun, sonra nokta atışı yönlendirme başlar.")
            return
        }
        location.start()

        for _ in 0..<30 where location.freshLocation() == nil && location.errorMessage == nil {
            guard !Task.isCancelled else { isDiscovering = false; return }
            do { try await Task.sleep(for: .milliseconds(200)) } catch { isDiscovering = false; return }
        }
        guard !Task.isCancelled else { isDiscovering = false; return }
        guard let currentLocation = location.freshLocation() else {
            isDiscovering = false
            discoveryMessage = location.errorMessage ?? String(localized: "Konum alınamadı. Yeni pin oluşturabilir veya tekrar deneyebilirsin.")
            return
        }

        var collected = localDraftsForCurrentUser()
        if session.isLocalPreview {
            collected.append(UITestFixtures.post)
        } else if container.isBackendConfigured {
            async let nearbyRequest = container.posts.nearby(
                latitude: currentLocation.coordinate.latitude,
                longitude: currentLocation.coordinate.longitude,
                radiusMeters: 120
            )
            var networkError: Error?
            do { collected.append(contentsOf: try await nearbyRequest) } catch { networkError = error }
            if collected.isEmpty, networkError != nil {
                isDiscovering = false
                discoveryMessage = String(localized: "Bağlantı kurulamadı. Biraz sonra tekrar dene.")
                return
            }
        }

        var unique: [UUID: LociPost] = [:]
        for post in collected { unique[post.id] = post }
        let heading = location.heading?.trueHeading ?? location.heading?.magneticHeading
        nearbyPosts = ProximityPolicy.viewablePosts(
            Array(unique.values), viewer: currentLocation, viewerHeading: heading
        ).filter {
            !$0.anchorBundle.anchor.pinQuality.isPhysicalSurface || $0.anchorBundle.anchor.persistence != nil
        }
        isDiscovering = false

        guard let nearest = nearbyPosts.first else {
            discoveryMessage = String(localized: "Bu konumda görüntülenebilir bir yayın bulunamadı.")
            return
        }
        discoveryMessage = nearbyPosts.count == 1
            ? String(localized: "1 yayın var. Dokun, sonra nokta atışı yönlendirme başlar.")
            : String(localized: "\(nearbyPosts.count) yayın var. Birine dokun, sonra nokta atışı yönlendirme başlar.")
        if automaticallyOpen { openInAR(nearest) }
    }

    private func openInAR(_ post: LociPost) {
        viewingPost = post
    }

    private func startCreationMode() async {
        guard !isStartingCreationMode, !Task.isCancelled,
              mode == .create ? router.selectedTab == .create : router.selectedTab == .ar else { return }
        location.stop()
        isStartingCreationMode = true
        defer { isStartingCreationMode = false }
        isCreationMode = true
        viewingPost = nil
        // Geo-tagging the new pin (ARCore Geospatial) needs precise location.
        location.requestPreciseAccuracyIfNeeded()
        _ = await engine.prepareNewPinSession { generation in
            cameraSessionGeneration = generation
        }
    }

    private func cancelMappingCapture() {
        mappingWaitExpired = false
        engine.stopSession()
        if mode == .create {
            router.selectedTab = .map
        } else {
            isCreationMode = false
            Task { await handleARSelection() }
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
            return String(localized: "Konum bilinmiyor")
        }
        let meters = current.distance(from: CLLocation(latitude: geo.latitude, longitude: geo.longitude))
        guard let roundedMeters = ProximityPolicy.roundedMeters(meters) else { return String(localized: "Konum bilinmiyor") }
        return roundedMeters < 1_000 ? "\(roundedMeters.formatted()) m" : String(format: "%.1f km", locale: Locale.current, meters / 1_000)
    }

    /// Sets the busy flag before the task starts, so a double tap cannot start two saves.
    private func startPreparingContent() {
        guard !isPreparingContent, engine.currentAnchor != nil else { return }
        isPreparingContent = true
        prepareTask?.cancel()
        prepareGeneration += 1
        let generation = prepareGeneration
        prepareTask = Task { await prepareContent(generation: generation) }
    }

    /// Saves the pin like the map's create flow (Geospatial tag, Cloud Anchor, world-map fallback)
    /// and then opens the editor for it.
    private func prepareContent(generation: Int) async {
        defer {
            // A cancelled older run that finishes late must not clear the state of a newer one.
            if generation == prepareGeneration {
                isPreparingContent = false
                prepareStatus = nil
            }
        }
        guard let anchor = engine.currentAnchor else { return }
        let outcome = await PinCommitCoordinator.commit(
            anchor,
            engine: engine,
            arcore: container.arcore,
            isOnline: container.connectivity.isOnline,
            isLocalPreview: session.isLocalPreview,
            status: { prepareStatus = $0 }
        )
        switch outcome {
        case .committed:
            guard !Task.isCancelled else { return }
            showCreate = true
        case .worldMapFailed(let reason):
            errorMessage = reason.isEmpty
                ? String(localized: "Çevre haritası henüz kaydedilemedi. Aynı yüzeyi biraz daha tarayıp tekrar deneyin.")
                : reason
        case .cancelled:
            break
        }
    }

    private var canPrepareContent: Bool {
        guard let anchor = engine.currentAnchor else { return false }
        guard anchor.pinQuality.isPhysicalSurface, anchor.persistence == nil else { return true }
        return (engine.trackingQuality == .normal || engine.trackingQuality == .limited) && engine.mappingQuality.canPersist
    }

}
