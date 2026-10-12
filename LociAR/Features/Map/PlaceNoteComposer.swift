import MapKit
import SwiftUI

struct MapBusinessSelection: Identifiable, Equatable, Sendable {
    let id: UUID
    let name: String
    let lat: Double
    let lng: Double
    var coordinate: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: lat, longitude: lng) }
}

@MainActor
final class PlaceNoteClient {
    static let shared = PlaceNoteClient()
    private var callables: CallableClient?
    func configure(callables: CallableClient) { self.callables = callables }
    private struct Payload: Encodable { let userId: String; let clientMutationId: String; let name: String; let lat: Double; let lng: Double; let text: String }
    struct Response: Decodable { let publishStatus: PostStatus }
    func create(_ place: MapBusinessSelection, text: String, mutation: UUID, user: UUID) async throws -> Response {
        guard let callables, FirebaseIdentity.currentLUID() == user else { throw AuthFlowError.notSignedIn }
        do {
            return try await callables.call("createPlaceNote", payload: Payload(userId: FirebaseIdentity.key(user), clientMutationId: mutation.uuidString.lowercased(),
                name: place.name, lat: place.lat, lng: place.lng, text: text), timeout: 60)
        } catch BackendCallError.rejected(_, let message, let reason) {
            throw PostPublishError.rejected(FirestorePostRepository.serverMessage(message, reason: reason))
        }
    }
}

struct PlaceNoteComposer: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppSession.self) private var session
    let region: MKCoordinateRegion?
    @State private var query = ""
    @State private var results: [MapBusinessSelection] = []
    @State private var selected: MapBusinessSelection?
    @State private var text = ""
    @State private var mutation = UUID()
    @State private var busy = false
    @State private var message: String?
    @State private var submitted = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack {
                        TextField("İşletme adı", text: $query)
                        Button("Ara") { Task { await search() } }.disabled(query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || busy)
                    }
                    ForEach(results) { place in
                        Button { selected = place; mutation = UUID() } label: {
                            HStack { Text(place.name); Spacer(); if selected?.id == place.id { Image(systemName: "checkmark") } }
                        }
                    }
                }
                if let selected {
                    Section {
                        Map(initialPosition: .region(MKCoordinateRegion(center: selected.coordinate, latitudinalMeters: 500, longitudinalMeters: 500))) {
                            Marker(selected.name, coordinate: selected.coordinate)
                        }.frame(height: 180).id(selected.id)
                        TextField("İşletme notun", text: $text, axis: .vertical).lineLimit(3...6)
                            .onChange(of: text) { _, _ in mutation = UUID() }
                        Text("En fazla 220 karakter.").font(.caption).foregroundStyle(.secondary)
                        Text("Not anonim yayınlanır ve incelemeye gider. Haritadan seçilen konum yaklaşık kabul edilir. Bildirimleri açan ziyaretçiler yaklaşınca notunu görebilir.")
                            .font(.caption).foregroundStyle(.secondary)
                        Button("Notu incelemeye gönder") { Task { await submit(selected) } }
                            .disabled(busy || submitted || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || text.count > 220)
                    }
                }
                if let message { Text(message).font(.caption).foregroundStyle(.secondary) }
                if busy { ProgressView() }
            }
            .disabled(busy || submitted)
            .navigationTitle("İşletmeye not bırak")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Kapat") { dismiss() } } }
        }
    }

    private func search() async {
        busy = true; message = nil
        defer { busy = false }
        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = query
        request.resultTypes = .pointOfInterest
        if let region { request.region = region }
        do {
            let response = try await MKLocalSearch(request: request).start()
            results = response.mapItems.prefix(20).compactMap { item in
                guard let name = item.name, !name.isEmpty else { return nil }
                return MapBusinessSelection(id: UUID(), name: name, lat: item.placemark.coordinate.latitude, lng: item.placemark.coordinate.longitude)
            }
            selected = nil
            if results.isEmpty { message = String(localized: "İşletme bulunamadı. Adını veya bulunduğu semti yazarak tekrar ara.") }
        } catch { message = String(localized: "İşletmeler aranamadı. Bağlantını kontrol edip tekrar dene.") }
    }

    private func submit(_ place: MapBusinessSelection) async {
        guard case let .signedIn(user) = session.phase, !session.isLocalPreview else { return }
        busy = true; message = nil
        defer { busy = false }
        do {
            _ = try await PlaceNoteClient.shared.create(place, text: text.trimmingCharacters(in: .whitespacesAndNewlines), mutation: mutation, user: user.id)
            submitted = true
            message = String(localized: "Notun incelemeye gönderildi. Onaylanınca haritada ve uygun ziyaretçi bildirimlerinde görünür.")
        } catch { message = error.localizedDescription }
    }
}
