import MapKit
import UIKit
import XCTest
@testable import LociAR

final class LaunchReadabilityTests: XCTestCase {
    func testHeatViewportIncludesBothSidesOfDateLine() {
        for center in [179.9, -179.9] {
            let region = MKCoordinateRegion(center: .init(latitude: 10, longitude: center), span: .init(latitudeDelta: 1, longitudeDelta: 0.4))
            let boxes = NoteDensityBounds.covering(region)
            XCTAssertEqual(boxes.count, 2)
            for longitude in [179.95, -179.95] {
                XCTAssertTrue(boxes.contains { $0.minLng <= longitude && longitude <= $0.maxLng })
            }
            XCTAssertFalse(boxes.contains { $0.minLng <= 0 && 0 <= $0.maxLng })
            XCTAssertTrue(boxes.allSatisfy { $0.minLat == 9.5 && $0.maxLat == 10.5 && $0.minLng <= $0.maxLng })
        }
    }

    func testWorldAndOrdinaryHeatViewportDoNotDuplicateRequests() {
        let world = MKCoordinateRegion(center: .init(latitude: 0, longitude: 170), span: .init(latitudeDelta: 180, longitudeDelta: 360))
        XCTAssertEqual(NoteDensityBounds.covering(world), [.init(minLat: -90, maxLat: 90, minLng: -180, maxLng: 180)])
        let istanbul = MKCoordinateRegion(center: .init(latitude: 41, longitude: 29), span: .init(latitudeDelta: 1, longitudeDelta: 2))
        XCTAssertEqual(NoteDensityBounds.covering(istanbul), [.init(minLat: 40.5, maxLat: 41.5, minLng: 28, maxLng: 30)])
    }

    @MainActor func testOfficialBadgeDoesNotGuessProvenanceFromAHandleAndOldPostsDecode() throws {
        var post = UITestFixtures.post
        post.creatorHandle = "loci.guide"
        XCTAssertFalse(post.isOfficialContent)
        post.adminManaged = true
        XCTAssertTrue(post.isOfficialContent)
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(post)) as? [String: Any])
        object.removeValue(forKey: "adminManaged")
        let old = try JSONDecoder().decode(LociPost.self, from: JSONSerialization.data(withJSONObject: object))
        XCTAssertFalse(old.isOfficialContent)
    }

    @MainActor func testARTranslationIsTransientAndDoesNotReplaceOriginalOrItsTexture() async throws {
        var post = UITestFixtures.post
        post.caption = "Gün batımında gel."
        post.editData.layers = []
        post.contentSource = .text(post.caption)
        let renderer = SpatialContentRenderer()
        let firstImage = await renderer.renderPost(post)
        let translatedImage = await renderer.renderPost(post, displayedText: "Come at sunset.")
        let restoredImage = await renderer.renderPost(post)
        let original = try XCTUnwrap(firstImage)
        let translated = try XCTUnwrap(translatedImage)
        let restored = try XCTUnwrap(restoredImage)
        XCTAssertNotEqual(UIImage(cgImage: original.image).pngData(), UIImage(cgImage: translated.image).pngData())
        XCTAssertEqual(UIImage(cgImage: original.image).pngData(), UIImage(cgImage: restored.image).pngData())
        XCTAssertEqual(post.caption, "Gün batımında gel.")
    }
}
