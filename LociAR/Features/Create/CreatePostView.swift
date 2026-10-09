import CoreLocation
import AVFoundation
import SwiftData
import SwiftUI
import UIKit

struct CreatePostView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    @Environment(\.openURL) private var openURL
    @Environment(AppSession.self) private var session
    @Environment(AppContainer.self) private var container
    @Environment(ARPinningEngine.self) private var engine
    @State private var selectedAnchor: SurfaceAnchor?
    @State private var caption = ""
    @State private var externalMediaURL = ""
    @State private var selectedExternalPlatform: ExternalMediaPlatform?
    @State private var showExternalMediaPicker = false
    @State private var externalPickerDetent: PresentationDetent = .large
    @State private var externalImportMessage: String?
    @State private var isPublishing = false
    @State private var message: String?
    @State private var dismissAfterAlert = false
    @State private var offerLocationSettings = false
    @State private var offerFallbackToApproximate = false
    @State private var mappingWaitExpired = false
    /// Non-nil while the pin is being saved (Cloud Anchor hosting or world map); shown as a banner.
    @State private var savingStatus: String?
    @FocusState private var isCaptionFocused: Bool

    init(anchor: SurfaceAnchor? = nil) {
        _selectedAnchor = State(initialValue: anchor)
    }

    var body: some View {
        NavigationStack {
            Group {
                if let anchor = selectedAnchor { editor(anchor: anchor) }
                else { placementStep }
            }
            .overlay(alignment: .top) {
                if let savingStatus {
                    HStack(spacing: 10) {
                        ProgressView().tint(LociTheme.accent)
                        Text(savingStatus).font(.subheadline.weight(.semibold))
                    }
                    .padding(.horizontal, 16).padding(.vertical, 10)
                    .background(.ultraThinMaterial, in: Capsule())
                    .padding(.top, 8)
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("create-saving-status")
                }
            }
            .navigationTitle(selectedAnchor == nil ? "Yüzey seç" : "İçerik oluştur")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Kapat") { dismiss() } }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Bitti") {
                        isCaptionFocused = false
                        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
                    }
                    .fontWeight(.semibold)
                    .accessibilityIdentifier("keyboard-done-button")
                }
            }
        }
        .preferredColorScheme(.dark)
        .arcoreDisclosure()
        .alert("LociAR", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })) {
            if offerLocationSettings {
                Button("Konum ayarlarını aç") {
                    offerLocationSettings = false
                    if let url = URL(string: UIApplication.openSettingsURLString) {
                        openURL(url)
                    }
                }
            }
            if offerFallbackToApproximate {
                Button("Yaklaşık olarak devam et") {
                    offerFallbackToApproximate = false
                    engine.offerApproximatePlacement()
                    engine.placeApproximate()
                    if let anchor = engine.currentAnchor {
                        selectedAnchor = anchor
                        engine.stopSession()
                    }
                }
                Button("Tekrar dene", role: .cancel) {
                    offerFallbackToApproximate = false
                    mappingWaitExpired = false
                    engine.restartTracking()
                }
            } else {
                Button("Tamam", role: .cancel) { if dismissAfterAlert { dismiss() } }
            }
        } message: { Text(message ?? "") }
        .sheet(isPresented: $showExternalMediaPicker) { externalMediaPicker }
        .task(id: engine.currentAnchor?.id) {
            mappingWaitExpired = false
            guard engine.currentAnchor?.pinQuality.isPhysicalSurface == true,
                  !physicalPlacementReady else { return }
            try? await Task.sleep(for: .seconds(45))
            if engine.currentAnchor?.pinQuality.isPhysicalSurface == true,
               !physicalPlacementReady {
                mappingWaitExpired = true
            }
        }
        .onDisappear {
            if selectedAnchor == nil {
                engine.stopSession()
            }
        }
    }

    private var placementStep: some View {
        ZStack {
            ARViewContainer(engine: engine).ignoresSafeArea()
            if !engine.hasRecentCameraFrame {
                ARCameraBackdrop(failed: engine.state == .failed, message: engine.statusMessage)
            }
            Circle().stroke(engine.candidateQuality != nil ? LociTheme.accent : .white, lineWidth: 3).frame(width: 54, height: 54)
            VStack {
                LociCard {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Image(systemName: placementSymbol)
                            Text(placementTitle).font(.caption.bold())
                        }
                        .foregroundStyle(engine.candidateQuality == nil ? Color.white : LociTheme.accent)
                        Text(engine.statusMessage).font(.footnote).foregroundStyle(.secondary)
                        if engine.currentAnchor == nil {
                            Text(engine.mappingDiagnosticSummary)
                                .font(.caption2.monospacedDigit())
                                .foregroundStyle(.secondary)
                                .accessibilityIdentifier("ar-mapping-diagnostic")
                        }
                    }.frame(maxWidth: .infinity, alignment: .leading)
                }
                Spacer()
                VStack(spacing: 10) {
                    if engine.state == .approximateOffered {
                        Button("Yaklaşık yerleştir · 0,8 m") {
                            engine.placeApproximate()
                            if let anchor = engine.currentAnchor {
                                Task { await commitPlacement(anchor) }
                            }
                        }
                        .buttonStyle(.borderedProminent).tint(.orange)
                    }
                    if engine.state == .failed {
                        if placementUnsupported {
                            Label("AR bu cihazda desteklenmiyor", systemImage: "iphone.slash")
                                .font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
                                .frame(maxWidth: .infinity, minHeight: 48)
                        } else if cameraPermissionDenied {
                            Button("Kamera ayarlarını aç", systemImage: "gear") {
                                if let url = URL(string: UIApplication.openSettingsURLString) {
                                    openURL(url)
                                }
                            }
                            .frame(maxWidth: .infinity, minHeight: 48)
                            .buttonStyle(.borderedProminent).tint(.white).foregroundStyle(.black)
                        } else {
                            Button("Tekrar dene", systemImage: "arrow.clockwise") { Task { _ = await engine.prepareNewPinSession() } }
                                .frame(maxWidth: .infinity, minHeight: 48)
                                .buttonStyle(.borderedProminent).tint(.white).foregroundStyle(.black)
                        }
                    } else if let anchor = engine.currentAnchor {
                        Text(anchor.pinQuality == .freeSpaceApproximate ? "Yaklaşık yerleştirme" : "Yüzey bulundu")
                            .font(.caption.bold()).foregroundStyle(anchor.pinQuality.isPhysicalSurface ? LociTheme.accent : .orange)
                        if anchor.pinQuality.isPhysicalSurface && !physicalPlacementReady {
                            VStack(spacing: 5) {
                                Label(mappingStatusTitle, systemImage: "viewfinder")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.secondary)
                                Text(mappingStatusGuidance)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                    .multilineTextAlignment(.center)
                                Text(engine.mappingDiagnosticSummary)
                                    .font(.caption2.monospacedDigit())
                                    .foregroundStyle(.secondary)
                                    .multilineTextAlignment(.center)
                                    .accessibilityIdentifier("ar-mapping-diagnostic")
                            }
                            HStack(spacing: 12) {
                                Button("Tekrar tara", systemImage: "arrow.clockwise") {
                                    mappingWaitExpired = false
                                    engine.restartTracking()
                                }
                                .buttonStyle(.bordered)
                                Button("Yaklaşık devam et") {
                                    engine.offerApproximatePlacement()
                                    engine.placeApproximate()
                                    if let approx = engine.currentAnchor {
                                        Task { await commitPlacement(approx) }
                                    }
                                }
                                .buttonStyle(.bordered).tint(.orange)
                            }
                        }
                        Button("Bu yerleşimi kullan") { Task { await commitPlacement(anchor) } }
                            .buttonStyle(.borderedProminent).tint(LociTheme.accent).foregroundStyle(.black)
                            .disabled(!canUsePlacement(anchor))
                            .accessibilityIdentifier("create-use-placement")
                    } else {
                        Button("Yüzeye sabitle") { engine.requestPin() }
                            .frame(maxWidth: .infinity, minHeight: 48)
                            .buttonStyle(.borderedProminent).tint(.white).foregroundStyle(.black)
                            .accessibilityIdentifier("create-pin-surface")
                        Button {
                            engine.offerApproximatePlacement()
                            engine.placeApproximate()
                            if let anchor = engine.currentAnchor {
                                Task { await commitPlacement(anchor) }
                            }
                        } label: {
                            Label("Önüme yerleştir · 0,8 m", systemImage: "cube.transparent")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.white.opacity(0.85))
                        }
                        .buttonStyle(.plain)
                        .padding(.top, 4)
                        .accessibilityIdentifier("create-place-approximate")
                    }
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24))
            }
            .padding()
        }
        .task { _ = await engine.prepareNewPinSession() }
        .onDisappear { if selectedAnchor == nil { engine.stopSession() } }
    }

    private var placementTitle: String {
        if engine.state == .failed { return placementUnsupported ? "AR desteklenmiyor" : "Kamera açılamadı" }
        if engine.currentAnchor != nil { return "Yerleştirme hazır" }
        if engine.candidateQuality == .planeGeometry { return "Kesin yüzey hazır" }
        if engine.candidateQuality == .estimatedPlane { return "Tahmini yüzey bulundu" }
        if engine.candidateQuality != nil { return "Yüzey hazır" }
        if engine.state == .approximateOffered { return "Yüzey bulunamadı" }
        return "Yüzey aranıyor"
    }

    private var trackingUsableForPlacement: Bool {
        engine.trackingQuality == .normal || engine.trackingQuality == .limited
    }

    private var physicalPlacementReady: Bool {
        trackingUsableForPlacement && engine.mappingQuality.canPersist
    }

    private var mappingStatusTitle: String {
        switch engine.mappingQuality {
        case .notAvailable: return "Çevre haritası başlatılıyor"
        case .limited: return "Çevre haritası sınırlı"
        case .extending: return "Çevre haritası genişletiliyor"
        case .mapped: return "Çevre haritası hazır"
        }
    }

    private var mappingStatusGuidance: String {
        if engine.statusMessage.localizedCaseInsensitiveContains("sıcaklığı yüksek") {
            return "Cihazı serin ve gölgeli bir yerde beklet. Sıcaklık normale dönünce AR taraması otomatik devam eder."
        }
        if mappingWaitExpired {
            return "Harita hazır olmadı. Daha iyi ışıkta dokulu yüzeyi farklı açılardan tara; sonra Tekrar tara'yı seç veya Kapat ile iptal et."
        }
        switch engine.mappingQuality {
        case .notAvailable:
            return "Devam etmek için telefonu dokulu yüzeyin çevresinde yavaşça gezdir ve ışığı artır."
        case .limited:
            return "Yüzey kaydı sınırlı da olsa kullanılabilir. Daha sağlam kilit için telefonu yavaş gezdir."
        case .extending:
            return "Çevre haritası genişliyor. Yerleşimi şimdi kullanabilirsin."
        case .mapped:
            return "Yüzey kaydı hazır."
        }
    }

    private func canUsePlacement(_ anchor: SurfaceAnchor) -> Bool {
        guard trackingUsableForPlacement else { return false }
        return !anchor.pinQuality.isPhysicalSurface || engine.mappingQuality.canPersist
    }

    private var placementSymbol: String {
        if engine.state == .failed { return "exclamationmark.triangle.fill" }
        if engine.currentAnchor != nil { return "checkmark.seal.fill" }
        if engine.candidateQuality != nil { return "viewfinder.circle.fill" }
        return "viewfinder"
    }

    private var placementUnsupported: Bool {
        engine.state == .failed && engine.statusMessage.localizedCaseInsensitiveContains("desteklemiyor")
    }

    private var cameraPermissionDenied: Bool {
        if UITestFixtures.cameraPermissionDenied { return true }
        let status = AVCaptureDevice.authorizationStatus(for: .video)
        return status == .denied || status == .restricted
    }

    private func editor(anchor: SurfaceAnchor) -> some View {
        // Device photo/video attachments were removed: posts are text and/or a social link.
        ScrollView {
            VStack(spacing: 16) {
                LociCard {
                    HStack(spacing: 12) {
                        Image(systemName: anchor.pinQuality.isPhysicalSurface ? "checkmark.seal.fill" : "exclamationmark.triangle.fill")
                            .font(.title2)
                            .foregroundStyle(anchor.pinQuality.isPhysicalSurface ? LociTheme.accent : .orange)
                        VStack(alignment: .leading) {
                            Text(anchor.pinQuality.isPhysicalSurface ? surfaceTitle(anchor.surfaceAlignment) : "Yaklaşık yerleştirme")
                                .font(.headline)
                            Text(anchor.pinQuality.isPhysicalSurface ? "İçerik bu fiziksel yüzeye sabitlenecek." : "İçerik kameranın 0,8 m önünde görünecek.")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Button("Değiştir") { selectedAnchor = nil }
                            .buttonStyle(.bordered).controlSize(.small)
                    }
                }

                LociCard {
                    VStack(alignment: .leading, spacing: 12) {
                        LociSectionLabel(title: "Caption", symbol: "text.quote")
                        TextField("Bu yüzeyde ne var?", text: $caption, axis: .vertical)
                            .lineLimit(2...6)
                            .padding(12)
                            .background(LociTheme.elevated, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .focused($isCaptionFocused)
                            .accessibilityIdentifier("create-caption")
                            .onChange(of: caption) { _, newCaption in
                                detectExternalMediaInCaptionIfNeeded(newCaption)
                            }
                        HStack {
                            Text("Harita, Keşfet, arama ve VoiceOver’da kullanılır.")
                                .font(.caption2).foregroundStyle(.secondary)
                            Spacer(minLength: 8)
                            Text("\(captionLength)/220").font(.caption.monospacedDigit())
                                .foregroundStyle(captionLength <= 220 ? Color.secondary : Color.red)
                        }
                        if captionLength > 220 {
                            Label("Caption 220 karakteri geçemez.", systemImage: "exclamationmark.circle.fill")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.red)
                        }

                        Divider().overlay(LociTheme.hairline)
                        LociSectionLabel(title: "İçerik", symbol: "rectangle.stack.badge.plus")


                        Button {
                            presentExternalMediaPicker()
                        } label: {
                            HStack(spacing: 12) {
                                ZStack {
                                    RoundedRectangle(cornerRadius: 11)
                                        .fill((selectedExternalPlatform.map(platformColor) ?? LociTheme.accent).opacity(0.16))
                                        .frame(width: 40, height: 40)
                                    if let selectedExternalPlatform {
                                        BrandLogoView(platform: selectedExternalPlatform, size: 27)
                                    } else {
                                        Image(systemName: "link.badge.plus").foregroundStyle(LociTheme.accent)
                                    }
                                }
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(selectedExternalPlatform?.rawValue ?? "Sosyal medya postu ekle")
                                        .font(.subheadline.weight(.semibold))
                                    Text(selectedExternalPlatform == nil ? "Spotify · YouTube · TikTok · Instagram · X" : "Platformu değiştirmek için dokun")
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Image(systemName: "chevron.up.chevron.down").font(.caption).foregroundStyle(.secondary)
                            }
                            .frame(minHeight: 46)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("create-external-media-picker")

                        if let selectedExternalPlatform {
                            HStack(spacing: 8) {
                                TextField(selectedExternalPlatform.linkHint, text: $externalMediaURL)
                                    .keyboardType(.URL)
                                    .textInputAutocapitalization(.never)
                                    .autocorrectionDisabled()
                                    .accessibilityIdentifier("create-external-media")
                                    .onChange(of: externalMediaURL) { _, value in
                                        if let parsedPlatform = ExternalMediaParser.parse(value)?.externalMedia?.platform {
                                             if self.selectedExternalPlatform != parsedPlatform {
                                                self.selectedExternalPlatform = parsedPlatform
                                            }
                                        }
                                    }
                                Button("Yapıştır", systemImage: "doc.on.clipboard") {
                                    if let copied = UIPasteboard.general.string { externalMediaURL = copied }
                                }
                                .labelStyle(.iconOnly)
                                .foregroundStyle(LociTheme.accent)
                                if !externalMediaURL.isEmpty {
                                    Button("Temizle", systemImage: "xmark.circle.fill") { externalMediaURL = "" }
                                        .labelStyle(.iconOnly)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .padding(12)
                            .background(LociTheme.elevated, in: RoundedRectangle(cornerRadius: 14, style: .continuous))

                            if parsedExternalMedia?.externalMedia?.platform == selectedExternalPlatform {
                                LociStatusPill(title: "\(selectedExternalPlatform.rawValue) paylaşımı hazır", symbol: "checkmark", color: platformColor(selectedExternalPlatform))
                                if let external = parsedExternalMedia?.externalMedia {
                                    HStack(spacing: 12) {
                                        BrandLogoView(platform: external.platform, size: 30)
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text("\(external.platform.rawValue) içeriği eklendi")
                                                .font(.subheadline.weight(.semibold))
                                            Text(external.url.absoluteString)
                                                .font(.caption2)
                                                .foregroundStyle(.secondary)
                                                .lineLimit(1)
                                                .truncationMode(.middle)
                                        }
                                        Spacer()
                                        Link(destination: external.url) {
                                            Image(systemName: "arrow.up.right")
                                        }
                                        .accessibilityLabel("Seçilen içeriği aç")
                                    }
                                    .padding(12)
                                    .background(LociTheme.field, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                                    .accessibilityIdentifier("external-media-selection-preview")
                                }
                            } else if !externalMediaURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                Label("Geçerli bir \(selectedExternalPlatform.rawValue) paylaşım bağlantısı yapıştır.", systemImage: "exclamationmark.circle")
                                    .font(.caption).foregroundStyle(.orange)
                            }
                        }
                    }
                }
            }
            .padding()
        }
        .background(LociTheme.background)
        .scrollDismissesKeyboard(.immediately)
        .safeAreaInset(edge: .bottom) { publishBar(anchor: anchor) }
    }

    private func publishBar(anchor: SurfaceAnchor) -> some View {
        VStack(spacing: 6) {
            Button {
                isCaptionFocused = false
                dismissKeyboard()
                Task { await publish(anchor: anchor) }
            } label: {
                if isPublishing { ProgressView().tint(.black) }
                else { Label("Yüzeyde yayınla", systemImage: "paperplane.fill") }
            }
            .buttonStyle(LociPrimaryButtonStyle())
            .disabled(!canPublish)
            .accessibilityIdentifier("create-publish")
            if !hasMeaningfulContent {
                Text("Caption veya geçerli bir sosyal bağlantı ekle.")
                    .font(.caption2).foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 16).padding(.top, 10).padding(.bottom, 6)
        .background(.ultraThinMaterial)
    }

    private var canPublish: Bool {
        !isPublishing && hasMeaningfulContent && captionLength <= 220
    }

    /// The server limits captions to 220 UTF-16 code units (JavaScript string length), so emoji
    /// count double here exactly as they do in createPost.
    private var captionLength: Int {
        caption.trimmingCharacters(in: .whitespacesAndNewlines).utf16.count
    }

    private func surfaceTitle(_ alignment: SurfaceAlignment) -> String {
        switch alignment {
        case .horizontal: "Yatay yüzey hazır"
        case .vertical: "Dikey yüzey hazır"
        case .angled: "Açılı yüzey hazır"
        default: "Yüzey hazır"
        }
    }

    private func publish(anchor: SurfaceAnchor) async {
        guard case .signedIn(let user) = session.phase else {
            message = "Yayınlamak için tekrar giriş yapın."
            return
        }
        isPublishing = true
        defer { isPublishing = false }

        var anchor = anchor
        if let geospatial = anchor.geospatial {
            // ARCore Geospatial beats GPS (meters vs. 5–20 m): use it for the map pin and distance checks.
            var pose = anchor.geoPose ?? GeoPose(latitude: geospatial.latitude, longitude: geospatial.longitude, heading: 0)
            pose.latitude = geospatial.latitude
            pose.longitude = geospatial.longitude
            pose.altitude = geospatial.altitude
            pose.accuracy = geospatial.horizontalAccuracy
            anchor.geoPose = pose
        }
        if anchor.geoPose == nil {
            if let captured = await GeoPoseCaptureService().capture() {
                anchor.geoPose = captured
            }
        }
        if let accuracy = anchor.geoPose?.accuracy, accuracy > GeoPoseCaptureService.maximumPublishAccuracyMeters {
            // createPost rejects fixes worse than 100 m; ask for a better one instead of queueing a
            // post that would be dead-lettered on the server.
            if let retry = await GeoPoseCaptureService().capture(),
               (retry.accuracy ?? .infinity) <= GeoPoseCaptureService.maximumPublishAccuracyMeters {
                anchor.geoPose = retry
            } else {
                dismissAfterAlert = false
                message = "Konum doğruluğu yayın için yeterli değil (\(Int(accuracy)) m). Açık bir alanda birkaç saniye bekleyip tekrar dene."
                return
            }
        }
        if var geoPose = anchor.geoPose {
            geoPose.heading = GeoPoseCaptureService.validHeading(geoPose.heading) ?? 0
            anchor.geoPose = geoPose
        }
        if anchor.geoPose == nil {
            let status = CLLocationManager().authorizationStatus
            if status == .denied || status == .restricted {
                offerLocationSettings = true
            }
            dismissAfterAlert = false
            message = offerLocationSettings
                ? "Post yayınlamak için konum iznini Ayarlar'dan açın."
                : "Konum alınamadı. Açık bir alanda kısa süre bekleyip tekrar deneyin."
            return
        }

        let postID = UUID()
        var layers: [EditLayer] = []
        let finalCaption = resolvedCaption
        if !finalCaption.isEmpty {
            layers.append(EditLayer(id: UUID(), kind: .text, text: finalCaption, assetURL: nil, points: [], colorHex: "#FFFFFF", opacity: 1, scale: 1, rotation: 0))
        }
        let source: ContentSource? = parsedExternalMedia
        let post = LociPost(
            id: postID, creatorID: user.id, creatorHandle: user.handle, createdAt: Date(), caption: finalCaption,
            status: .pendingReview, visibility: .public, ageRating: .all,
            anchorBundle: AnchorBundle(anchor: anchor), editData: EditData(layers: layers), contentSource: source,
            counts: PostCounts()
        )
        do {
            let outcome = try await container.publisher.submit(
                post,
                attemptRemote: !session.isLocalPreview && container.isBackendConfigured && container.connectivity.isOnline,
                modelContext: modelContext
            )
            dismissAfterAlert = true
            switch outcome {
            case .published(let receipt):
                switch receipt.status {
                case .active:
                    message = "Post yayınlandı. Keşfet ve profilinde görünür."
                case .pendingReview:
                    message = "Post gönderildi ve incelemeye alındı. Durumu Profil > Postlarım'dan takip edebilirsin."
                default:
                    message = "Post sunucuya kaydedildi. Durumu Profil > Postlarım'da görünür."
                }
            case .queued(.offline):
                message = session.isLocalPreview
                    ? "Post cihaz test modunda saklandı. Canlı backend bağlandığında yayınlanabilir."
                    : "İnternet bağlantısı yok. Post cihazda sıraya alındı ve bağlantı geri geldiğinde yeniden denenecek."
            case .queued(.backendUnavailable):
                message = "Yayın ilk denemede tamamlanamadı. Post Profil > Postlarım’da görünür; uygulama 15 saniyede bir yeniden dener veya ‘Şimdi yayınla’ ile hemen gönderebilirsin."
            case .rejected(let reason):
                dismissAfterAlert = false
                message = reason
            }
        } catch {
            dismissAfterAlert = false
            message = "Post cihazda güvenle saklanamadı. Alanı boşaltıp tekrar deneyin."
        }
    }

    private var hasMeaningfulContent: Bool {
        !caption.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || parsedExternalMedia != nil
    }

    private var parsedExternalMedia: ContentSource? {
        guard let selectedExternalPlatform,
              let parsed = ExternalMediaParser.parse(externalMediaURL),
              parsed.externalMedia?.platform == selectedExternalPlatform else { return nil }
        return parsed
    }

    private var externalMediaPicker: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text("Uygulama simgesine dokun. İçeriği seçip Paylaş → Bağlantıyı kopyala yap; LociAR’a dönünce Tamam’a dokun.")
                        .font(.subheadline)
                        .foregroundStyle(LociTheme.secondaryText)

                    // Facebook is not offered (2 Oct 2026); the enum case stays so old stored posts still decode.
                    let platforms = ExternalMediaPlatform.allCases.filter { $0 != .facebook }
                    let columnCount = 3
                    VStack(spacing: 12) {
                        ForEach(0..<((platforms.count + columnCount - 1) / columnCount), id: \.self) { row in
                            HStack(spacing: 12) {
                                ForEach(0..<columnCount, id: \.self) { column in
                                    let index = row * columnCount + column
                                    if index < platforms.count {
                                        let platform = platforms[index]
                                        Button {
                                            selectAndOpenExternalPlatform(platform)
                                        } label: {
                                            VStack(spacing: 10) {
                                                ZStack(alignment: .topTrailing) {
                                                    RoundedRectangle(cornerRadius: 18)
                                                        .fill(platform.brandColor.opacity(0.13))
                                                        .frame(width: 66, height: 66)
                                                    BrandLogoView(platform: platform, size: 42)
                                                        .frame(width: 66, height: 66)
                                                    if selectedExternalPlatform == platform {
                                                        Image(systemName: "checkmark.circle.fill")
                                                            .foregroundStyle(LociTheme.accent)
                                                            .background(.black, in: Circle())
                                                    }
                                                }
                                                Text(platform.rawValue)
                                                    .font(.caption.weight(.semibold))
                                                    .foregroundStyle(.white)
                                            }
                                            .frame(maxWidth: .infinity, minHeight: 108)
                                            .background(LociTheme.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                                            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(
                                                selectedExternalPlatform == platform ? platform.brandColor.opacity(0.75) : LociTheme.hairline,
                                                lineWidth: selectedExternalPlatform == platform ? 1.5 : 1
                                            ))
                                        }
                                        .buttonStyle(.plain)
                                        .accessibilityIdentifier("external-platform-\(platform.rawValue.lowercased())")
                                    } else {
                                        Color.clear.frame(maxWidth: .infinity, minHeight: 108)
                                    }
                                }
                            }
                        }
                    }

                    if let selectedExternalPlatform {
                        LociInlineNotice(
                            title: "\(selectedExternalPlatform.rawValue) içeriğini seç",
                            message: "İçeriği aç, Paylaş menüsünden bağlantıyı kopyala ve bu ekrana dön. Tamam bağlantıyı doğrulayıp karta ekler.",
                            symbol: "arrowshape.turn.up.right.fill",
                            color: selectedExternalPlatform.brandColor
                        )
                        .accessibilityIdentifier("external-import-instruction")

                        Button("\(selectedExternalPlatform.rawValue) uygulamasını aç", systemImage: "arrow.up.forward.app") {
                            openExternalPlatform(selectedExternalPlatform)
                        }
                        .buttonStyle(LociPrimaryButtonStyle())
                        .accessibilityIdentifier("external-open-selected-app")
                    }

                    if let externalImportMessage {
                        Label(externalImportMessage, systemImage: "exclamationmark.circle.fill")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.orange)
                            .accessibilityIdentifier("external-import-error")
                    }

                    LociInlineNotice(
                        title: "Bağlantı güvenli biçimde eklenir",
                        message: "Yalnız seçtiğin platforma ait geçerli paylaşım bağlantısı kabul edilir.",
                        symbol: "checkmark.seal.fill"
                    )
                }
                .padding(20)
            }
            .background(LociScreenBackground())
            .navigationTitle("Platform seç")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Vazgeç") { showExternalMediaPicker = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Tamam") { completeExternalMediaImport() }
                        .disabled(selectedExternalPlatform == nil)
                        .accessibilityIdentifier("external-import-complete")
                }
            }
        }
        .ignoresSafeArea(.keyboard)
        .presentationDetents([.medium, .large], selection: $externalPickerDetent)
        .presentationContentInteraction(.scrolls)
        .presentationDragIndicator(.visible)
        .onAppear { dismissKeyboard() }
    }

    private func presentExternalMediaPicker() {
        isCaptionFocused = false
        dismissKeyboard()
        externalImportMessage = nil
        externalPickerDetent = .large
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(250))
            showExternalMediaPicker = true
        }
    }

    private func dismissKeyboard() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }

    private func selectAndOpenExternalPlatform(_ platform: ExternalMediaPlatform) {
        if selectedExternalPlatform != platform { externalMediaURL = "" }
        selectedExternalPlatform = platform
        externalImportMessage = nil
        openExternalPlatform(platform)
    }

    private func openExternalPlatform(_ platform: ExternalMediaPlatform) {
        guard !ProcessInfo.processInfo.arguments.contains("UITEST_DISABLE_EXTERNAL_APP_LAUNCH") else { return }
        openURL(platform.appLaunchURL) { accepted in
            if !accepted { openURL(platform.webLaunchURL) }
        }
    }

    private func completeExternalMediaImport() {
        guard let platform = selectedExternalPlatform else { return }
        var candidates = [externalMediaURL]
#if DEBUG
        if ProcessInfo.processInfo.arguments.contains("UITEST_DISABLE_EXTERNAL_APP_LAUNCH") {
            if let fixture = ProcessInfo.processInfo.environment["UITEST_EXTERNAL_MEDIA_URL"] {
                candidates.append(fixture)
            }
        }
#endif
        if candidates.compactMap({ validatedExternalMedia($0, platform: platform) }).first == nil,
           let copied = UIPasteboard.general.string {
            candidates.append(copied)
        }
        guard let source = candidates.compactMap({ validatedExternalMedia($0, platform: platform) }).first,
              let external = source.externalMedia else {
            if let anyCopied = UIPasteboard.general.string,
               let anyParsed = ExternalMediaParser.parseSharedText(anyCopied),
               let anyExternal = anyParsed.externalMedia {
                selectedExternalPlatform = anyExternal.platform
                externalMediaURL = anyExternal.url.absoluteString
                externalImportMessage = nil
                showExternalMediaPicker = false
                return
            }
            externalImportMessage = "Panoda geçerli bir \(platform.rawValue) paylaşım bağlantısı bulunamadı. İçerikte Paylaş → Bağlantıyı kopyala adımını kullan."
            return
        }
        externalMediaURL = external.url.absoluteString
        externalImportMessage = nil
        showExternalMediaPicker = false
    }

    private func validatedExternalMedia(_ input: String, platform: ExternalMediaPlatform) -> ContentSource? {
        guard let parsed = ExternalMediaParser.parseSharedText(input),
              parsed.externalMedia?.platform == platform else { return nil }
        return parsed
    }

    private func detectExternalMediaInCaptionIfNeeded(_ input: String) {
        guard selectedExternalPlatform == nil else { return }
        guard let parsed = ExternalMediaParser.parseSharedText(input),
              let external = parsed.externalMedia else { return }
        selectedExternalPlatform = external.platform
        externalMediaURL = external.url.absoluteString
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed == external.url.absoluteString || ExternalMediaParser.parse(trimmed) != nil {
            caption = ""
        }
    }

    private func platformColor(_ platform: ExternalMediaPlatform) -> Color {
        platform.brandColor
    }

    private var resolvedCaption: String {
        let clean = caption.trimmingCharacters(in: .whitespacesAndNewlines)
        if !clean.isEmpty { return clean }
        if let platform = parsedExternalMedia?.externalMedia?.platform { return "\(platform.rawValue) paylaşımı" }
        return "Mekânsal post"
    }

    private func commitPlacement(_ anchor: SurfaceAnchor) async {
        if !anchor.pinQuality.isPhysicalSurface {
            selectedAnchor = engine.currentAnchor ?? anchor
            engine.stopSession()
            return
        }
        if session.isLocalPreview {
            selectedAnchor = engine.currentAnchor ?? anchor
            engine.stopSession()
            return
        }
        defer { savingStatus = nil }
        // Geo-tag the pin precisely when ARCore Geospatial is localized (outdoors, VPS coverage).
        if let transform = engine.currentPinTransform, let geospatial = container.arcore.geospatialPose(for: transform) {
            engine.attachGeospatial(geospatial)
        }
        // 1) Google Cloud Anchor: exact surface for every viewer, no world-map upload.
        if let persistence = await hostCloudAnchor(for: anchor) {
            engine.attachPersistence(persistence)
            selectedAnchor = engine.currentAnchor ?? anchor
            engine.stopSession()
            return
        }
        // 2) Fallback: ARKit world map (offline, no token, or hosting failed).
        savingStatus = "Yüzey kaydı hazırlanıyor…"
        do {
            let package = try await engine.saveWorldMap()
            engine.attachPersistence(package.persistence)
            selectedAnchor = engine.currentAnchor ?? anchor
            engine.stopSession()
        } catch {
            offerFallbackToApproximate = true
            message = "Fiziksel çevre haritası kaydedilemedi. Dilersen 'Yaklaşık olarak devam et' ile postunu hemen oluşturabilir veya tekrar tarayabilirsin."
            return
        }
    }

    /// Hosts the pin as a Google Cloud Anchor. Waits (bounded) until ARCore has seen the surface
    /// well enough, guiding the user to move around it. Returns nil to fall back to the world map.
    private func hostCloudAnchor(for anchor: SurfaceAnchor) async -> WorldLockPersistence? {
        let arcore = container.arcore
        guard container.connectivity.isOnline else { return nil }
        savingStatus = "Google AR hazırlanıyor…"
        guard await arcore.waitUntilReady(), let arAnchor = engine.currentPinARAnchor() else { return nil }
        let deadline = Date().addingTimeInterval(20)
        func sufficient() -> Bool {
            guard let transform = engine.currentPinTransform else { return false }
            return arcore.isHostingQualitySufficient(for: transform)
        }
        while !sufficient(), Date() < deadline {
            savingStatus = "Telefonu yüzeyin etrafında yavaşça gezdir…"
            try? await Task.sleep(for: .milliseconds(400))
        }
        guard sufficient() else { return nil }
        savingStatus = "Yüzey Google AR'a kaydediliyor…"
        guard let cloudAnchorId = await arcore.hostCloudAnchor(arAnchor) else { return nil }
        var persistence = WorldLockPersistence(originalNativeAnchorId: engine.currentAnchor?.id ?? anchor.id, hostedAt: Date())
        persistence.kind = .arcoreCloudAnchor
        persistence.cloudAnchorId = cloudAnchorId
        persistence.expiresAt = Calendar.current.date(byAdding: .day, value: ARCoreService.cloudAnchorTTLDays, to: Date())
        return persistence
    }
}

