import XCTest
import UIKit
@testable import LociAR

final class GifPostTests: XCTestCase {
    private let gif = GifReference(klipySlug: "happy-cat-f7u", width: 480, height: 270)!

    func testKlipyGifLayerRoundTripsAsSlugAndProvider() throws {
        let klipyGif = try XCTUnwrap(GifReference(klipySlug: "happy-cat-f7u", width: 480, height: 270))
        let layer = EditLayer(id: UUID(), kind: .gif, text: nil, assetURL: nil, points: [], colorHex: "#FFFFFF", opacity: 1, scale: 1, rotation: 0, gif: klipyGif)
        let data = try JSONEncoder().encode(EditData(layers: [layer]))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let stored = try XCTUnwrap((json["layers"] as? [[String: Any]])?.first)
        XCTAssertEqual(stored["type"] as? String, "gif")
        XCTAssertEqual(stored["provider"] as? String, "klipy")
        XCTAssertEqual(stored["gifSlug"] as? String, "happy-cat-f7u")
        XCTAssertNil(stored["uri"], "a GIF layer never carries a URL")
        let decoded = try JSONDecoder().decode(EditData.self, from: data)
        XCTAssertEqual(decoded.layers.first?.gif, klipyGif)
        XCTAssertEqual(decoded.layers.first?.gif?.provider, .klipy)
    }

    func testKlipySlugsCannotCarryURLsOrPaths() {
        for slug in ["", "a/b", "../x", "https://api.klipy.com/x", "a b", "ğ", String(repeating: "a", count: 129)] {
            XCTAssertNil(GifReference(klipySlug: slug, width: 1, height: 1), slug)
        }
        let valid = GifReference(klipySlug: "valid-slug_123", width: 100, height: 100)
        XCTAssertNotNil(valid)
        XCTAssertEqual(valid?.provider, .klipy)
    }

    func testUnknownOrMalformedLayersAreSkippedInsteadOfFailingThePost() throws {
        let json = """
        {"version":1,"layers":[
          {"id":"\(UUID().uuidString)","type":"text","text":"Selam"},
          {"id":"\(UUID().uuidString)","type":"gif","gifId":"../evil","width":10,"height":10},
          {"id":"\(UUID().uuidString)","type":"sticker"}
        ]}
        """
        let decoded = try JSONDecoder().decode(EditData.self, from: Data(json.utf8))
        XCTAssertEqual(decoded.layers.map(\.kind), [.text])
    }

    func testMessageTextComesFromTheTextLayerNotTheFallbackCaption() {
        var post = UITestFixtures.post
        post.caption = "GIF"
        post.editData = EditData(layers: [
            EditLayer(id: UUID(), kind: .gif, text: nil, assetURL: nil, points: [], colorHex: "#FFFFFF", opacity: 1, scale: 1, rotation: 0, gif: gif),
        ])
        XCTAssertNil(post.messageText)
        XCTAssertEqual(post.gif, gif)
    }

    func testGifBubbleReportsTheGifAreaForTheARVideo() throws {
        let rendered = try XCTUnwrap(SpatialContentRenderer.drawMessageBubble(text: "Buradaydık!", handle: "loci", gif: gif, gifStill: nil))
        let area = try XCTUnwrap(rendered.gifRect)
        XCTAssertGreaterThan(area.minX, 0)
        XCTAssertGreaterThan(area.minY, 0, "the handle sits above the GIF")
        XCTAssertLessThan(area.maxX, 1)
        XCTAssertLessThan(area.maxY, 1, "the text sits below the GIF")
        let pixelAspect = (area.width * CGFloat(rendered.image.width)) / (area.height * CGFloat(rendered.image.height))
        XCTAssertEqual(pixelAspect, CGFloat(gif.aspectRatio), accuracy: 0.02)

        let textOnly = try XCTUnwrap(SpatialContentRenderer.drawMessageBubble(text: "Merhaba", handle: nil, gif: nil, gifStill: nil))
        XCTAssertNil(textOnly.gifRect)
        XCTAssertNil(SpatialContentRenderer.drawMessageBubble(text: "  ", handle: "loci", gif: nil, gifStill: nil))

        let previewSize = CGSize(width: textOnly.image.width, height: textOnly.image.height)
        let preview = UIGraphicsImageRenderer(size: previewSize).image { renderer in
            let midpoint = previewSize.width / 2
            renderer.cgContext.setFillColor(UIColor(red: 0.11, green: 0.30, blue: 0.48, alpha: 1).cgColor)
            renderer.cgContext.fill(CGRect(x: 0, y: 0, width: midpoint, height: previewSize.height))
            renderer.cgContext.setFillColor(UIColor(red: 0.30, green: 0.16, blue: 0.40, alpha: 1).cgColor)
            renderer.cgContext.fill(CGRect(x: midpoint, y: 0, width: previewSize.width - midpoint, height: previewSize.height))
            UIImage(cgImage: textOnly.image).draw(in: CGRect(origin: .zero, size: previewSize))
        }
        let attachment = XCTAttachment(image: preview)
        attachment.name = "AR-glass-note-texture-preview"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
