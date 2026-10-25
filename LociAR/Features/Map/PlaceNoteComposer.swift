@preconcurrency import CoreLocation
import MapKit
import Observation
import OSLog
import SwiftUI

@MainActor
final class PlaceNoteClient {
    static let shared = PlaceNoteClient()
    private var callables: CallableClient?
    func configure(callables: CallableClient) { self.callables = callables }

    enum Source: String, Encodable { case gps, manual, geospatial }
    private struct Payload: Encodable {
        let userId: String; let clientMutationId: String; let lat: Double; let lng: Double
        let source: Source; let accuracy: Double; let measuredLat: Double?; let measuredLng: Double?; let text: String
    }
    struct Response: Decodable {
        let publishStatus: PostStatus
        var confirmationMessage: String {
            switch publishStatus {
            case .active: String(localized: "Notun yayınlandı. Haritada görünüyor.")
            case .pendingReview: String(localized: "Post gönderildi ve incelemeye alındı. Durumu Profil > Postlarım'dan takip edebilirsin.")
            default: String(localized: "Post bulunamadı ya da zaten kaldırılmış.")
            }
        }
    }

    func receipt(mutation: UUID, user: UUID) async throws -> Response? {
        guard let callables, FirebaseIdentity.currentLUID() == user else { throw AuthFlowError.notSignedIn }
        struct Request: Encodable { let mode = "own_receipt"; let postId: String }
        struct Existing: Decodable { let receipt: PostPublishReceipt? }
        let result: Existing = try await callables.call("readPublicContent", payload: Request(postId: FirebaseIdentity.key(mutation)), timeout: 15)
        guard !Task.isCancelled, FirebaseIdentity.currentLUID() == user else { throw AuthFlowError.notSignedIn }
        guard let receipt = result.receipt, receipt.postID == mutation else { return nil }
        return Response(publishStatus: receipt.status)
    }

    func create(at pin: CLLocationCoordinate2D, source: Source, measured: LocationEstimate, text: String, mutation: UUID, user: UUID) async throws -> Response {
        guard let callables, FirebaseIdentity.currentLUID() == user else { throw AuthFlowError.notSignedIn }
        do {
            return try await callables.call("createPlaceNote", payload: Payload(
                userId: FirebaseIdentity.key(user), clientMutationId: mutation.uuidString.lowercased(),
                lat: pin.latitude, lng: pin.longitude, source: source, accuracy: measured.accuracy,
                measuredLat: source == .manual ? measured.latitude : nil, measuredLng: source == .manual ? measured.longitude : nil,
                text: text), timeout: 60)
        } catch BackendCallError.rejected(_, let message, let reason) {
            throw PostPublishError.rejected(FirestorePostRepository.serverMessage(message, reason: reason))
        }
    }
}

/// Only an opaque, account-scoped intent UUID reaches disk. Never store note text or a text digest.
@MainActor
struct PlaceNotePendingIntentStore {
    var defaults: UserDefaults = .standard

    private func key(for user: UUID) -> String { "place-note.pending-intent.\(user.uuidString.lowercased())" }

    func pending(for user: UUID) -> UUID? {
        defaults.string(forKey: key(for: user)).flatMap(UUID.init(uuidString:))
    }

    func save(_ mutation: UUID, for user: UUID) {
        defaults.set(mutation.uuidString.lowercased(), forKey: key(for: user))
        // Flush the opaque id before the network write can commit and its response can be lost.
        defaults.synchronize()
    }

    func clear(_ mutation: UUID, for user: UUID) {
        guard pending(for: user) == mutation else { return }
        defaults.removeObject(forKey: key(for: user))
    }
}

/// Foreground GPS for one composer. Starts on open so the fix settles while the author types.
@MainActor
@Observable
final class LocationNoteMeasurement: NSObject, @preconcurrency CLLocationManagerDelegate {
    private(set) var estimate: LocationEstimate?
    private(set) var ready = false
    private(set) var denied = false
    private(set) var reducedAccuracy = false
    @ObservationIgnored private var estimator = LocationFixEstimator(startedAt: Date())
    @ObservationIgnored private let manager = CLLocationManager()
    @ObservationIgnored private let logger = Logger(subsystem: "com.khankartal.lociar", category: "location-note")
    @ObservationIgnored private var readyLogged = false
    @ObservationIgnored private var running = false
    @ObservationIgnored private var requestedPreciseAccuracy = false

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = kCLDistanceFilterNone
        manager.activityType = .other
    }

    func start(seed: [CLLocation] = []) {
        running = true; requestedPreciseAccuracy = false
        // Seeded fixes count as warm-up time already spent on the map.
        let now = Date()
        // Check raw Core Location provenance before LocationSample's simulator fixture conversion.
        let genuineSeed = seed.filter { $0.sourceInformation?.isSimulatedBySoftware != true && $0.timestamp <= now }
        let oldest = genuineSeed.map(\.timestamp).min()
        estimator = LocationFixEstimator(startedAt: oldest.map { min(now, $0) } ?? now)
        estimator.seed(genuineSeed.map(LocationSample.init), now: now)
        estimate = estimator.estimate; ready = estimator.isReady(now: now); readyLogged = false
        switch manager.authorizationStatus {
        case .notDetermined: manager.requestWhenInUseAuthorization()
        case .denied, .restricted: denied = true
        default: begin()
        }
    }

    func stop() { running = false; manager.stopUpdatingLocation() }

    func refreshEstimate() {
        let now = Date()
        estimator.prune(at: now)
        estimate = estimator.estimate; ready = estimator.isReady(now: now)
    }

    private func begin() {
        guard running else { return }
        denied = false
        reducedAccuracy = manager.accuracyAuthorization == .reducedAccuracy
        if reducedAccuracy, !requestedPreciseAccuracy {
            requestedPreciseAccuracy = true
            manager.requestTemporaryFullAccuracyAuthorization(withPurposeKey: LocationController.geospatialAccuracyPurposeKey)
        }
        manager.startUpdatingLocation()
    }

    /// Waits until the estimate is ready or `maxWait` passes, then classifies the best estimate.
    func settle(maxWait: TimeInterval = LocationNotePolicy.maxPublishWait) async -> LocationFixEstimator.Outcome {
        let deadline = Date().addingTimeInterval(maxWait)
        refreshEstimate()
        while !ready, Date() < deadline, !Task.isCancelled, !denied {
            do { try await Task.sleep(for: .milliseconds(250)) } catch { return .noFix }
            refreshEstimate()
        }
        refreshEstimate()
        return Task.isCancelled || denied ? .noFix : estimator.outcome
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard running else { return }
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways: begin()
        case .denied, .restricted: denied = true; manager.stopUpdatingLocation()
        default: break
        }
        reducedAccuracy = manager.accuracyAuthorization == .reducedAccuracy
    }

    func locationManager(_ _: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard running else { return }
        let now = Date()
        for location in locations where location.sourceInformation?.isSimulatedBySoftware != true && location.timestamp <= now {
            estimator.add(LocationSample(location), now: now)
        }
        estimate = estimator.estimate
        ready = estimator.isReady(now: now)
        if ready, !readyLogged, let estimate {
            readyLogged = true
            // Field calibration: distribution of time-to-ready and accuracy at ready.
            logger.info("location note fix ready after \(now.timeIntervalSince(self.estimator.startedAt), format: .fixed(precision: 1)) s at \(estimate.accuracy, format: .fixed(precision: 1)) m")
        }
    }

    func locationManager(_ _: CLLocationManager, didFailWithError error: Error) {
        if (error as? CLError)?.code == .denied { denied = true }
    }
}

struct PlaceNoteComposer: View {
    /// Recent fixes from the map, so the estimate is often ready as soon as the composer opens.
    var seed: [CLLocation] = []
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @Environment(AppSession.self) private var session
    @Environment(AppContainer.self) private var container
    @State private var measurement = LocationNoteMeasurement()
    /// ARCore Geospatial fix from "Refine with camera"; wins over GPS while set.
    @State private var cameraFix: LocationSample?
    @State private var showCameraRefine = false
    @State private var camera: MapCameraPosition = .automatic
    /// Map centre while the author places the pin by hand; nil while following GPS.
    @State private var manualPin: CLLocationCoordinate2D?
    @State private var text = ""
    @State private var mutation = UUID()
    @State private var mutationOwner: UUID?
    @State private var hasPendingIntent = false
    // Re-entered text after reopening belongs to the recovered intent. Once submitted in this
    // screen, editing explicitly starts a new intent. No draft text survives process termination.
    @State private var submittedTextInThisScreen = false
    @State private var submittedPin: CLLocationCoordinate2D?
    private let pendingIntents = PlaceNotePendingIntentStore()
    @State private var busy = false
    @State private var waiting = false
    @State private var message: String?
    @State private var submitted = false
    @FocusState private var isTextFocused: Bool

    private var trimmed: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }
    // Match createPlaceNote/validateCreatePostBody and the AR composer, including emoji.
    private var textLength: Int { trimmed.utf16.count }
    private var dragDistance: CLLocationDistance? {
        guard let manualPin, let estimate = measurement.estimate else { return nil }
        return CLLocation(latitude: manualPin.latitude, longitude: manualPin.longitude).distance(from: estimate.location)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    map
                    status
                    if manualPin == nil {
                        Button("Pini elle ayarla", systemImage: "hand.point.up.left") { enterManual(at: measurement.estimate) }
                            .disabled(measurement.estimate == nil)
                        if container.arcore.isEnabled, CameraLocationRefineView.isSupported {
                            Button("Kamerayla hassaslaştır", systemImage: "camera.viewfinder") { showCameraRefine = true }
                                .accessibilityIdentifier("place-note-camera-refine")
                        }
                    } else {
                        Button("Konumuma dön", systemImage: "location.fill") { manualPin = nil; follow(measurement.estimate) }
                    }
                }
                .disabled(busy || submitted)
                Section {
                    TextField("Bu konum için notun", text: $text, axis: .vertical).lineLimit(3...6)
                        .focused($isTextFocused)
                        .accessibilityIdentifier("place-note-text")
                        .onChange(of: text) { _, _ in
                            if !hasPendingIntent || submittedTextInThisScreen { startNewIntent(restartMeasurement: false) }
                        }
                    Text("En fazla 220 karakter.").font(.caption).foregroundStyle(.secondary)
                    Text("Not anonim ve hemen yayınlanır. Bulunduğun nokta kaydedilir. Yeterince beğenilen notlar, o noktaya gelen ziyaretçilere bir kez bildirim olarak gider; şikayet edilen notlar gizlenir.")
                        .font(.caption).foregroundStyle(.secondary)
                    Button { Task { await publish() } } label: {
                        if waiting { Label("Konum netleşiyor…", systemImage: "location.circle") }
                        else { Label("Burada yayınla", systemImage: "mappin.and.ellipse") }
                    }
                    .disabled(busy || submitted || trimmed.isEmpty || textLength > 220 || measurement.denied)
                    .accessibilityIdentifier("place-note-publish")
                }
                .disabled(busy || submitted)
                if hasPendingIntent || submitted {
                    Button("Yeni", systemImage: "plus") { startNewIntent(clearText: true) }
                        .disabled(busy)
                        .accessibilityIdentifier("place-note-new-intent")
                }
                if busy && !waiting { ProgressView() }
            }
            .scrollDismissesKeyboard(.interactively)
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if let message {
                    Text(message).font(.caption).foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding().background(.regularMaterial)
                        .accessibilityIdentifier("place-note-status")
                }
            }
            .navigationTitle("Konum notu bırak")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Kapat") { dismiss() }.disabled(busy) }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Bitti") { isTextFocused = false }
                        .accessibilityIdentifier("keyboard-done-button")
                }
            }
        }
        .interactiveDismissDisabled(busy)
        .fullScreenCover(isPresented: $showCameraRefine) {
            CameraLocationRefineView { fix in
                cameraFix = fix
                follow(LocationEstimate(latitude: fix.latitude, longitude: fix.longitude, accuracy: fix.accuracy, timestamp: fix.timestamp))
            }
        }
        .task { measurement.start(seed: seed) }
        .task(id: currentOwner) { await restorePendingIntent() }
        .onDisappear { measurement.stop() }
        .onChange(of: measurement.estimate) { _, estimate in if manualPin == nil, cameraFix == nil { follow(estimate) } }
    }

    private var currentOwner: UUID? {
        guard case let .signedIn(user) = session.phase, !session.isLocalPreview, !user.isAnonymousAccount else { return nil }
        return user.id
    }

    private func ownsIntent(_ id: UUID, user: UUID) -> Bool {
        !Task.isCancelled && currentOwner == user && mutationOwner == user && mutation == id
    }

    private func startNewIntent(clearText: Bool = false, restartMeasurement: Bool = true) {
        if let owner = mutationOwner { pendingIntents.clear(mutation, for: owner) }
        mutation = UUID()
        hasPendingIntent = false
        submittedTextInThisScreen = false
        submitted = false
        submittedPin = nil
        message = nil
        if clearText { text = "" }
        if restartMeasurement { measurement.start(seed: seed) }
    }

    private func restorePendingIntent() async {
        guard let owner = currentOwner else {
            mutationOwner = nil; text = ""; submitted = false; hasPendingIntent = false; busy = false
            return
        }
        if mutationOwner != owner {
            busy = false
            text = ""; submitted = false; submittedTextInThisScreen = false; submittedPin = nil
            mutationOwner = owner
            mutation = pendingIntents.pending(for: owner) ?? UUID()
        }
        hasPendingIntent = pendingIntents.pending(for: owner) == mutation
        guard hasPendingIntent else { return }
        busy = true
        defer { if currentOwner == owner { busy = false } }
        do { _ = try await reconcile(mutation, user: owner) }
        catch { if ownsIntent(mutation, user: owner) { message = error.localizedDescription } }
    }

    /// Reconciliation never returns note text. An absent or uncertain receipt preserves the id.
    private func reconcile(_ id: UUID, user: UUID) async throws -> Bool {
        let response = try await PlaceNoteClient.shared.receipt(mutation: id, user: user)
        guard ownsIntent(id, user: user) else { return false }
        guard let response else { return false }
        complete(response, mutation: id, user: user, pin: submittedPin ?? measurement.estimate?.coordinate)
        return true
    }

    private func complete(_ response: PlaceNoteClient.Response, mutation id: UUID, user: UUID, pin: CLLocationCoordinate2D?) {
        guard ownsIntent(id, user: user) else { return }
        pendingIntents.clear(id, for: user)
        hasPendingIntent = false
        submitted = true
        measurement.stop()
        message = response.confirmationMessage
        if response.publishStatus == .active, let pin {
            container.router.focusMap(.init(latitude: pin.latitude, longitude: pin.longitude))
        }
    }

    private var map: some View {
        Map(position: $camera) {
            if let fix = cameraFix, manualPin == nil {
                MapCircle(center: fix.location.coordinate, radius: fix.accuracy)
                    .foregroundStyle(LociTheme.accent.opacity(0.15))
                    .stroke(LociTheme.accent.opacity(0.6), lineWidth: 1)
                Marker("Not konumu", systemImage: "camera.viewfinder", coordinate: fix.location.coordinate).tint(LociTheme.accent)
            } else if let estimate = measurement.estimate {
                MapCircle(center: estimate.coordinate, radius: estimate.accuracy)
                    .foregroundStyle(LociTheme.accent.opacity(0.15))
                    .stroke(LociTheme.accent.opacity(0.6), lineWidth: 1)
                if manualPin == nil {
                    Marker("Not konumu", systemImage: "mappin", coordinate: estimate.coordinate).tint(LociTheme.accent)
                }
            }
        }
        .onMapCameraChange(frequency: .continuous) { context in
            if manualPin != nil { manualPin = context.region.center }
        }
        .overlay {
            if manualPin != nil {
                Image(systemName: "mappin")
                    .font(.title.bold()).foregroundStyle(.orange)
                    .offset(y: -12)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
        }
        .frame(height: 260)
        .allowsHitTesting(!busy && !submitted)
        .listRowInsets(EdgeInsets())
        .accessibilityLabel("Not konumu haritası")
    }

    @ViewBuilder private var status: some View {
        if measurement.denied {
            VStack(alignment: .leading, spacing: 6) {
                Text("Konum izni kapalı. Ayarlar’dan LociAR için konumu açın.").font(.caption)
                Button("Ayarlar") { if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) } }
            }
        } else if let distance = dragDistance {
            let meters = Int(distance.rounded())
            Text("Haritayı kaydırarak pini tam bulunduğun yere getir. Pin konumundan \(meters) m uzakta.")
                .font(.caption).foregroundStyle(distance > LocationNotePolicy.maxPinDrag ? .red : .secondary)
        } else if let fix = cameraFix {
            let meters = Int(fix.accuracy.rounded())
            Label(String(localized: "Kamera konumu · ±\(meters) m"), systemImage: "checkmark.circle.fill")
                .font(.caption).foregroundStyle(LociTheme.accent)
        } else if let estimate = measurement.estimate {
            let meters = Int(estimate.accuracy.rounded())
            Label(measurement.ready ? String(localized: "Konum hazır · ±\(meters) m")
                                    : String(localized: "Konum hassaslaşıyor · ±\(meters) m"),
                  systemImage: measurement.ready ? "checkmark.circle.fill" : "location.circle")
                .font(.caption).foregroundStyle(measurement.ready ? LociTheme.accent : .secondary)
        } else {
            Text("Konum aranıyor. Açık bir alanda kısa süre bekleyin.").font(.caption).foregroundStyle(.secondary)
        }
        if measurement.reducedAccuracy && !measurement.denied {
            Text("Yaklaşık konum izni açık. Notu doğru yere bırakmak için Ayarlar’dan Kesin Konum’u aç.")
                .font(.caption).foregroundStyle(.orange)
        }
    }

    private func follow(_ estimate: LocationEstimate?) {
        guard let estimate else { return }
        camera = .camera(MapCamera(centerCoordinate: estimate.coordinate, distance: max(300, estimate.accuracy * 8)))
    }

    private func enterManual(at estimate: LocationEstimate?) {
        guard let estimate else { return }
        cameraFix = nil
        manualPin = estimate.coordinate
        camera = .camera(MapCamera(centerCoordinate: estimate.coordinate, distance: 250))
    }

    private func publish() async {
        guard !busy, !submitted, !trimmed.isEmpty, textLength <= 220, !measurement.denied else { return }
        guard case let .signedIn(user) = session.phase, currentOwner == user.id else { return }
        if mutationOwner != user.id { await restorePendingIntent() }
        guard mutationOwner == user.id, !submitted else { return }
        isTextFocused = false
        let publishIntent = mutation
        busy = true; message = nil
        defer {
            if mutationOwner == user.id, mutation == publishIntent { busy = false; waiting = false }
        }
        if hasPendingIntent {
            do { if try await reconcile(mutation, user: user.id) { return } }
            catch { message = error.localizedDescription; return }
        }
        guard currentOwner == user.id, !Task.isCancelled else { return }
        measurement.refreshEstimate()
        if let pin = manualPin {
            guard let measured = measurement.estimate else {
                message = String(localized: "Konum aranıyor. Açık bir alanda kısa süre bekleyin."); return
            }
            guard (dragDistance ?? 0) <= LocationNotePolicy.maxPinDrag else {
                message = String(localized: "Pin, konumundan en fazla 50 m uzağa taşınabilir."); return
            }
            guard measured.accuracy <= LocationNotePolicy.maxCreateAccuracy else {
                message = Self.tooUncertain(measured.accuracy); return
            }
            await submit(pin: pin, source: .manual, measured: measured, user: user.id)
            return
        }
        if let fix = cameraFix, fix.isUsable(at: Date()) {
            let measured = LocationEstimate(latitude: fix.latitude, longitude: fix.longitude, accuracy: fix.accuracy, timestamp: fix.timestamp)
            await submit(pin: measured.coordinate, source: .geospatial, measured: measured, user: user.id)
            return
        }
        cameraFix = nil
        waiting = true
        let outcome = await measurement.settle()
        waiting = false
        switch outcome {
        case .gps(let estimate):
            await submit(pin: estimate.coordinate, source: .gps, measured: estimate, user: user.id)
        case .needsManualPin(let estimate):
            enterManual(at: estimate)
            let meters = Int(estimate.accuracy.rounded())
            message = String(localized: "Konum ±\(meters) m. Pini tam bulunduğun yere getirip tekrar Burada yayınla’ya bas.")
        case .tooUncertain(let accuracy):
            message = Self.tooUncertain(accuracy)
        case .noFix:
            message = String(localized: "Konum alınamadı. Açık bir alanda kısa süre bekleyip tekrar deneyin.")
        }
    }

    private static func tooUncertain(_ accuracy: CLLocationAccuracy) -> String {
        let meters = Int(accuracy.rounded())
        return String(localized: "Konum çok belirsiz (±\(meters) m). Açık bir alana çıkıp tekrar dene.")
    }

    private func submit(pin: CLLocationCoordinate2D, source: PlaceNoteClient.Source, measured: LocationEstimate, user: UUID) async {
        let id = mutation
        guard ownsIntent(id, user: user) else { return }
        let age = Date().timeIntervalSince(measured.timestamp)
        guard measured.accuracy.isFinite, measured.accuracy >= 0 else {
            message = String(localized: "Konum alınamadı. Açık bir alanda kısa süre bekleyip tekrar deneyin.")
            return
        }
        guard measured.accuracy < ProximityPolicy.maxHorizontalAccuracy else {
            message = Self.tooUncertain(min(measured.accuracy, 1_000_000))
            return
        }
        guard age.isFinite, age >= 0, age < ProximityPolicy.maxFixAge, !measurement.denied else {
            message = String(localized: "Konum alınamadı. Açık bir alanda kısa süre bekleyip tekrar deneyin.")
            return
        }
        pendingIntents.save(id, for: user)
        hasPendingIntent = true
        submittedTextInThisScreen = true
        submittedPin = pin
        do {
            let response = try await PlaceNoteClient.shared.create(at: pin, source: source, measured: measured, text: trimmed, mutation: id, user: user)
            complete(response, mutation: id, user: user, pin: pin)
        } catch {
            guard ownsIntent(id, user: user) else { return }
            let publishError = error
            do { if try await reconcile(id, user: user) { return } }
            catch { /* Keep the original failure and the opaque pending id for a later retry. */ }
            if ownsIntent(id, user: user) { message = publishError.localizedDescription }
        }
    }
}
