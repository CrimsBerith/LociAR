import Foundation
import UIKit

enum UITestFixtures {
#if DEBUG
    static var signedOutSessionEnabled: Bool { ProcessInfo.processInfo.arguments.contains("UITEST_SIGNED_OUT") }
    static var authenticatedSessionEnabled: Bool { ProcessInfo.processInfo.arguments.contains("UITEST_AUTHENTICATED") }
    static var sampleContentEnabled: Bool { ProcessInfo.processInfo.arguments.contains("UITEST_SAMPLE_CONTENT") }
    static var socialARPreviewEnabled: Bool { ProcessInfo.processInfo.arguments.contains("UITEST_SOCIAL_AR_PREVIEW") }
    static var editorPreviewEnabled: Bool { ProcessInfo.processInfo.arguments.contains("UITEST_EDITOR_PREVIEW") }
    static var openEditorDirectly: Bool { ProcessInfo.processInfo.arguments.contains("UITEST_OPEN_EDITOR_DIRECTLY") }
    static var openPostDirectly: Bool { ProcessInfo.processInfo.arguments.contains("UITEST_OPEN_POST_DIRECTLY") }
    static var cameraPermissionDenied: Bool { ProcessInfo.processInfo.arguments.contains("UITEST_CAMERA_DENIED") }
    static var locationPermissionDenied: Bool { ProcessInfo.processInfo.arguments.contains("UITEST_LOCATION_DENIED") }
    static var attachSampleImageEnabled: Bool { ProcessInfo.processInfo.arguments.contains("UITEST_ATTACH_SAMPLE_IMAGE") }
#else
    static let signedOutSessionEnabled = false
    static let authenticatedSessionEnabled = false
    static let sampleContentEnabled = false
    static let socialARPreviewEnabled = false
    static let editorPreviewEnabled = false
    static let openEditorDirectly = false
    static let openPostDirectly = false
    static let cameraPermissionDenied = false
    static let locationPermissionDenied = false
    static let attachSampleImageEnabled = false
#endif

    static let creator = LociUser(
        id: UUID(uuidString: "11111111-1111-1111-1111-111111111111")!,
        handle: "mekan_kasifi",
        email: nil
    )

    static let anchor = SurfaceAnchor(
        id: UUID(uuidString: "22222222-2222-2222-2222-222222222222")!,
        transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -0.8, 1],
        pinQuality: .planeGeometry,
        hitSource: .planeGeometry,
        surfaceAlignment: .vertical,
        trackingQuality: .normal,
        worldMappingStatus: .mapped,
        surfaceNormal: Vector3(x: 0, y: 0, z: 1),
        physicalRectMeters: PhysicalRectMeters(width: 0.34, height: 0.60),
        geoPose: GeoPose(latitude: 41.0082, longitude: 28.9784, altitude: 35, heading: 90, accuracy: 5)
    )

    static var samplePhotoURL: URL {
        let tempDir = FileManager.default.temporaryDirectory
        let fileURL = tempDir.appendingPathComponent("loci_sample_wall_photo.jpg")
        if !FileManager.default.fileExists(atPath: fileURL.path) {
            let size = CGSize(width: 800, height: 600)
            let renderer = UIGraphicsImageRenderer(size: size)
            let image = renderer.image { context in
                let cgContext = context.cgContext
                let colors = [
                    UIColor(red: 0.10, green: 0.65, blue: 0.85, alpha: 1.0).cgColor,
                    UIColor(red: 0.20, green: 0.88, blue: 0.60, alpha: 1.0).cgColor
                ] as CFArray
                let colorSpace = CGColorSpaceCreateDeviceRGB()
                if let gradient = CGGradient(colorsSpace: colorSpace, colors: colors, locations: [0.0, 1.0]) {
                    cgContext.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: size.width, y: size.height), options: [])
                }
                let badgeRect = CGRect(x: 100, y: 160, width: 600, height: 280)
                UIColor.black.withAlphaComponent(0.45).setFill()
                UIBezierPath(roundedRect: badgeRect, cornerRadius: 28).fill()
                
                let text = "LociAR\nDuvar Fotoğrafı"
                let paragraphStyle = NSMutableParagraphStyle()
                paragraphStyle.alignment = .center
                let attrs: [NSAttributedString.Key: Any] = [
                    .font: UIFont.systemFont(ofSize: 48, weight: .bold),
                    .foregroundColor: UIColor.white,
                    .paragraphStyle: paragraphStyle
                ]
                (text as NSString).draw(in: CGRect(x: 120, y: 220, width: 560, height: 160), withAttributes: attrs)
            }
            if let data = image.jpegData(compressionQuality: 0.9) {
                try? data.write(to: fileURL)
            }
        }
        return fileURL
    }

    static var post: LociPost {
#if DEBUG
        let platformKey = ProcessInfo.processInfo.environment["UITEST_FIXTURE_PLATFORM"]?.lowercased()
#else
        let platformKey: String? = nil
#endif
        let source: ContentSource
        let caption: String
        var layers: [EditLayer] = []

        if let platformKey {
            switch platformKey {
            case "text":
                caption = "Bu tarihi taş duvar, mahallenin hafızasını taşıyor."
                source = .text(caption)
                layers = [
                    EditLayer(id: UUID(), kind: .text, text: caption, assetURL: nil, points: [], colorHex: "#FFFFFF", opacity: 1, scale: 1, rotation: 0)
                ]
            case "photo":
                caption = "Tarihi taş duvarın özel anı fotoğrafı."
                let photoURL = samplePhotoURL
                source = .image(photoURL)
                layers = [
                    EditLayer(id: UUID(), kind: .image, text: nil, assetURL: photoURL, points: [], colorHex: "#FFFFFF", opacity: 1, scale: 1, rotation: 0)
                ]
            default:
                // Social media links were removed (9 Oct 2026); any other key falls back to a text post.
                caption = "Bu tarihi taş duvar, mahallenin hafızasını taşıyor."
                source = .text(caption)
            }
        } else {
            source = .text("Buradaydık.")
            caption = "Bu duvar, mahallenin yıllardır değişmeyen buluşma noktası."
            layers = [
                EditLayer(id: UUID(), kind: .text, text: "Buradaydık.", assetURL: nil, points: [], colorHex: "#FFFFFF", opacity: 1, scale: 1, rotation: 0)
            ]
        }

        return LociPost(
            id: UUID(uuidString: "33333333-3333-3333-3333-333333333333")!,
            creatorID: creator.id,
            creatorHandle: creator.handle,
            createdAt: Date().addingTimeInterval(-1_800),
            caption: caption,
            status: .active,
            visibility: .public,
            ageRating: .all,
            anchorBundle: AnchorBundle(anchor: anchor),
            editData: EditData(layers: layers.isEmpty ? [
                EditLayer(id: UUID(), kind: .text, text: caption, assetURL: nil, points: [], colorHex: "#FFFFFF", opacity: 1, scale: 1, rotation: 0)
            ] : layers),
            contentSource: source,
            counts: PostCounts(views: 128, likes: 24, comments: 2)
        )
    }

    static let comments = [
        LociComment(id: UUID(), postID: post.id, userID: UUID(), username: "deniz", text: "Bu hikâyeyi bilmiyordum.", createdAt: Date().addingTimeInterval(-900)),
        LociComment(id: UUID(), postID: post.id, userID: UUID(), username: "arda", text: "Bir sonraki gelişimde AR’da bakacağım.", createdAt: Date().addingTimeInterval(-420))
    ]
}
