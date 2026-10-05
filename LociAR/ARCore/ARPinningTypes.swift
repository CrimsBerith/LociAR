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
        case .unsupported: String(localized: "Bu cihaz gelişmiş AR yüzey taramasını desteklemiyor.")
        case .cameraDenied: String(localized: "Kamera izni verilmedi.")
        case .noAnchor: String(localized: "Önce bir yüzey seçin.")
        case .mappingNotReady: String(localized: "Yüzey kaydı henüz hazır değil. Çevreyi yavaşça tarayın.")
        case .mapUnavailable: String(localized: "Yüzey kaydı oluşturulamadı.")
        case .invalidWorldMap: String(localized: "Kaydedilmiş yüzey bilgisi açılamadı.")
        case .anchorMissing: String(localized: "Postun bağlı olduğu yüzey kaydı bulunamadı.")
        case .renderAnchorMissing: String(localized: "Yüzey bulundu ancak post anchor'ı sahneye bağlanamadı.")
        case .renderContentUnavailable: String(localized: "Postun yüzey içeriği hazırlanamadı.")
        }
    }
}
