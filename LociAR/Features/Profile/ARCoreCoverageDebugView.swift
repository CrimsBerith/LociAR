#if DEBUG
import CoreLocation
import SwiftUI

/// Debug-only: asks ARCore whether Google's VPS (Street View based localization) covers the
/// places LociAR targets. Coordinates are sample street points; the phone does not need to be there.
struct ARCoreCoverageDebugView: View {
    @Environment(AppContainer.self) private var container
    @State private var results: [String: String] = [:]
    @State private var isChecking = false

    private static let places: [(name: String, latitude: Double, longitude: Double)] = [
        ("İstanbul · İstiklal Cd.", 41.0335, 28.9780),
        ("İstanbul · Kadıköy Çarşı", 40.9903, 29.0255),
        ("İstanbul · Beşiktaş Meydan", 41.0428, 29.0075),
        ("İstanbul · Eminönü", 41.0170, 28.9700),
        ("Ankara · Kızılay", 39.9208, 32.8541),
        ("İzmir · Alsancak Kordon", 38.4381, 27.1418),
        ("Referans · London Trafalgar Sq.", 51.5080, -0.1281),
    ]

    var body: some View {
        List {
            Section {
                ForEach(Self.places, id: \.name) { place in
                    HStack {
                        Text(place.name)
                        Spacer()
                        Text(results[place.name] ?? "—").foregroundStyle(.secondary)
                    }
                    .accessibilityElement(children: .combine)
                }
            } footer: {
                Text("ARCore durumu: \(String(describing: container.arcore.availability))"
                     + (container.arcore.lastError.map { "\nSon hata: \($0)" } ?? ""))
            }
            Section {
                Button(isChecking ? "Kontrol ediliyor…" : "VPS kapsamını kontrol et") {
                    Task { await check() }
                }
                .disabled(isChecking)
                .accessibilityIdentifier("debug-arcore-check")
            }
        }
        .navigationTitle("ARCore kapsamı")
    }

    private func check() async {
        isChecking = true
        defer { isChecking = false }
        for place in Self.places {
            let coordinate = CLLocationCoordinate2D(latitude: place.latitude, longitude: place.longitude)
            results[place.name] = await container.arcore.vpsAvailability(at: coordinate)
        }
    }
}
#endif
