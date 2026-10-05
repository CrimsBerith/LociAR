import Foundation

struct PinDiagnosticSnapshot: Codable, Sendable {
    var timestamp: Date
    var state: PinSessionState
    var trackingQuality: TrackingQuality
    var mappingQuality: WorldMappingQuality
    var pinQuality: PinQuality?
    var hitSource: PinHitSource?
    var surfaceAlignment: SurfaceAlignment?
    var anchorID: UUID?
    var message: String
    var rawFeaturePointCount: Int = 0
    var planeAnchorCount: Int = 0
    var meshAnchorCount: Int = 0
    var secondsSinceSessionStart: Double?
    var secondsSincePhysicalPin: Double?
}

struct SavedWorldMapPackage: Sendable {
    var mapData: Data
    var referenceImageData: Data?
    var persistence: WorldLockPersistence
}

enum ARPinningError: LocalizedError {
    case unsupported
    case cameraDenied
    case noAnchor
    case mappingNotReady
    case mapUnavailable
    case invalidWorldMap
    case anchorMissing
    case renderAnchorMissing
    case renderContentUnavailable

    var errorDescription: String? {
        switch self {
        case .unsupported: "Bu cihaz gelişmiş AR yüzey taramasını desteklemiyor."
        case .cameraDenied: "Kamera izni verilmedi."
        case .noAnchor: "Önce bir yüzey seçin."
        case .mappingNotReady: "Yüzey kaydı henüz hazır değil. Çevreyi yavaşça tarayın."
        case .mapUnavailable: "Yüzey kaydı oluşturulamadı."
        case .invalidWorldMap: "Kaydedilmiş yüzey bilgisi açılamadı."
        case .anchorMissing: "Postun bağlı olduğu yüzey kaydı bulunamadı."
        case .renderAnchorMissing: "Yüzey bulundu ancak post anchor'ı sahneye bağlanamadı."
        case .renderContentUnavailable: "Postun yüzey içeriği hazırlanamadı."
        }
    }
}
