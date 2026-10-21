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
        let oldest = seed.map(\.timestamp).min()
        estimator = LocationFixEstimator(startedAt: oldest.map { min(now, $0) } ?? now)
        estimator.seed(seed.map(LocationSample.init), now: now)
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
        for location in locations { estimator.add(LocationSample(location), now: now) }
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
                        .onChange(of: text) { _, _ in mutation = UUID() }
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
        .onDisappear { measurement.stop() }
        .onChange(of: measurement.estimate) { _, estimate in if manualPin == nil, cameraFix == nil { follow(estimate) } }
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
        guard case let .signedIn(user) = session.phase, !session.isLocalPreview else { return }
        isTextFocused = false
        busy = true; message = nil
        defer { busy = false; waiting = false }
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
        do {
            let response = try await PlaceNoteClient.shared.create(at: pin, source: source, measured: measured, text: trimmed, mutation: mutation, user: user)
            submitted = true
            measurement.stop()
            message = response.confirmationMessage
        } catch { message = error.localizedDescription }
    }
}
