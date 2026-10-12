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

    enum Source: String, Encodable { case gps, manual }
    private struct Payload: Encodable {
        let userId: String; let clientMutationId: String; let lat: Double; let lng: Double
        let source: Source; let accuracy: Double; let measuredLat: Double?; let measuredLng: Double?; let text: String
    }
    struct Response: Decodable { let publishStatus: PostStatus }

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

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = kCLDistanceFilterNone
        manager.activityType = .other
    }

    func start() {
        estimator = LocationFixEstimator(startedAt: Date())
        estimate = nil; ready = false; readyLogged = false
        switch manager.authorizationStatus {
        case .notDetermined: manager.requestWhenInUseAuthorization()
        case .denied, .restricted: denied = true
        default: begin()
        }
    }

    func stop() { manager.stopUpdatingLocation() }

    private func begin() {
        denied = false
        reducedAccuracy = manager.accuracyAuthorization == .reducedAccuracy
        if reducedAccuracy {
            manager.requestTemporaryFullAccuracyAuthorization(withPurposeKey: LocationController.geospatialAccuracyPurposeKey)
        }
        manager.startUpdatingLocation()
    }

    /// Waits until the estimate is ready or `maxWait` passes, then classifies the best estimate.
    func settle(maxWait: TimeInterval = LocationNotePolicy.maxPublishWait) async -> LocationFixEstimator.Outcome {
        let deadline = Date().addingTimeInterval(maxWait)
        while !estimator.isReady(now: Date()), Date() < deadline, !Task.isCancelled {
            try? await Task.sleep(for: .milliseconds(250))
        }
        return estimator.outcome
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways: begin()
        case .denied, .restricted: denied = true; manager.stopUpdatingLocation()
        default: break
        }
        reducedAccuracy = manager.accuracyAuthorization == .reducedAccuracy
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
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

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        if (error as? CLError)?.code == .denied { denied = true }
    }
}

struct PlaceNoteComposer: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @Environment(AppSession.self) private var session
    @State private var measurement = LocationNoteMeasurement()
    @State private var camera: MapCameraPosition = .automatic
    /// Map centre while the author places the pin by hand; nil while following GPS.
    @State private var manualPin: CLLocationCoordinate2D?
    @State private var text = ""
    @State private var mutation = UUID()
    @State private var busy = false
    @State private var waiting = false
    @State private var message: String?
    @State private var submitted = false

    private var trimmed: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }
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
                    } else {
                        Button("Konumuma dön", systemImage: "location.fill") { manualPin = nil; follow(measurement.estimate) }
                    }
                }
                Section {
                    TextField("Bu konum için notun", text: $text, axis: .vertical).lineLimit(3...6)
                        .onChange(of: text) { _, _ in mutation = UUID() }
                    Text("En fazla 220 karakter.").font(.caption).foregroundStyle(.secondary)
                    Text("Not anonim yayınlanır ve incelemeye gider. Bulunduğun nokta kaydedilir. Beğenilen ve onaylanan notlar, o noktaya gelen ziyaretçilere bir kez bildirim olarak gidebilir.")
                        .font(.caption).foregroundStyle(.secondary)
                    Button { Task { await publish() } } label: {
                        if waiting { Label("Konum netleşiyor…", systemImage: "location.circle") }
                        else { Label("Burada yayınla", systemImage: "mappin.and.ellipse") }
                    }
                    .disabled(busy || submitted || trimmed.isEmpty || text.count > 220 || measurement.denied)
                    .accessibilityIdentifier("place-note-publish")
                }
                if let message { Text(message).font(.caption).foregroundStyle(.secondary) }
                if busy && !waiting { ProgressView() }
            }
            .disabled(submitted)
            .navigationTitle("Konum notu bırak")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Kapat") { dismiss() } } }
        }
        .task { measurement.start() }
        .onDisappear { measurement.stop() }
        .onChange(of: measurement.estimate) { _, estimate in if manualPin == nil { follow(estimate) } }
    }

    private var map: some View {
        Map(position: $camera) {
            if let estimate = measurement.estimate {
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
        } else if let estimate = measurement.estimate {
            let meters = Int(estimate.accuracy.rounded())
            Label(measurement.ready ? String(localized: "Konum hazır · ±\(meters) m")
                                    : String(localized: "Konum hassaslaşıyor · ±\(meters) m"),
                  systemImage: measurement.ready ? "checkmark.circle.fill" : "location.circle")
                .font(.caption).foregroundStyle(measurement.ready ? LociTheme.accent : .secondary)
        } else {
            Text("Konum aranıyor. Açık bir alanda kısa süre bekleyin.").font(.caption).foregroundStyle(.secondary)
        }
        if measurement.reducedAccuracy {
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
        manualPin = estimate.coordinate
        camera = .camera(MapCamera(centerCoordinate: estimate.coordinate, distance: 250))
    }

    private func publish() async {
        guard case let .signedIn(user) = session.phase, !session.isLocalPreview else { return }
        busy = true; message = nil
        defer { busy = false; waiting = false }
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
            _ = try await PlaceNoteClient.shared.create(at: pin, source: source, measured: measured, text: trimmed, mutation: mutation, user: user)
            submitted = true
            measurement.stop()
            message = String(localized: "Notun incelemeye gönderildi. Onaylanınca haritada görünür.")
        } catch { message = error.localizedDescription }
    }
}
