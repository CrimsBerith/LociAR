import XCTest
@testable import LociAR

final class GifPostTests: XCTestCase {
    private let gif = GifReference(id: "l0MYt5jPR6QX5pnqM", width: 480, height: 270)!

    func testGifLayerRoundTripsAsIdAndSizeOnly() throws {
        let layer = EditLayer(id: UUID(), kind: .gif, text: nil, assetURL: nil, points: [], colorHex: "#FFFFFF", opacity: 1, scale: 1, rotation: 0, gif: gif)
        let data = try JSONEncoder().encode(EditData(layers: [layer]))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let stored = try XCTUnwrap((json["layers"] as? [[String: Any]])?.first)
        XCTAssertEqual(stored["type"] as? String, "gif")
        XCTAssertEqual(stored["gifId"] as? String, "l0MYt5jPR6QX5pnqM")
        XCTAssertNil(stored["uri"], "a GIF layer never carries a URL")
        let decoded = try JSONDecoder().decode(EditData.self, from: data)
        XCTAssertEqual(decoded.layers.first?.gif, gif)
    }

    func testGifIdsCannotCarryURLsOrPaths() {
        for id in ["", "a/b", "../x", "https://media.giphy.com/x", "a b", "ğ", String(repeating: "a", count: 65)] {
            XCTAssertNil(GifReference(id: id, width: 1, height: 1), id)
        }
        XCTAssertEqual(gif.videoURL.host, "media.giphy.com")
        XCTAssertEqual(gif.videoURL.path, "/media/l0MYt5jPR6QX5pnqM/giphy.mp4")
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
    }
}
