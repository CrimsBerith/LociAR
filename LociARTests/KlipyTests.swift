import XCTest
@testable import LociAR

/// KLIPY client rules that need no network: which URLs are loaded, what is sent, how responses decode.
final class KlipyTests: XCTestCase {
    private func url(_ text: String) throws -> URL { try XCTUnwrap(URL(string: text)) }

    func testOnlyKlipyHttpsMediaHostsAreLoaded() throws {
        for accepted in [
            "https://static.klipy.com/ii/d7aec6f6f171607374b2065c836f92f4/dd/b9/DY6Mz2RN.gif",
            "https://static1.klipy.com/ii/a/b.mp4",
            "https://STATIC2.klipy.com/ii/a/b.jpg",
        ] {
            XCTAssertTrue(KlipyAPI.isMediaURL(try url(accepted)), accepted)
        }
        for refused in [
            "http://static.klipy.com/ii/a.gif",
            "https://api.klipy.com/ii/a.gif",
            "https://klipy.com/ii/a.gif",
            "https://static.klipy.com.evil.example/a.gif",
            "https://evil.static.klipy.com/a.gif",
            "https://static1.evil.klipy.com/a.gif",
            "https://staticx.klipy.com/a.gif",
            "https://user@static.klipy.com/a.gif",
            "https://static.klipy.com:8443/a.gif",
            "https://evil.example/x.gif",
            "file:///private/var/a.gif",
        ] {
            XCTAssertFalse(KlipyAPI.isMediaURL(try url(refused)), refused)
        }
    }

    func testCustomerIDIsStableAndDoesNotRevealTheAccountID() throws {
        let luid = try XCTUnwrap(UUID(uuidString: "0F1E2D3C-4B5A-4978-8695-A4B3C2D1E0F9"))
        let id = KlipyAPI.customerID(for: luid)
        XCTAssertEqual(id, KlipyAPI.customerID(for: luid))
        XCTAssertEqual(id.count, 32)
        XCTAssertTrue(id.allSatisfy { $0.isHexDigit })
        XCTAssertFalse(id.lowercased().contains("0f1e2d3c"))
        XCTAssertNotEqual(id, KlipyAPI.customerID(for: UUID()))
    }

    func testRequestURLKeepsTheKeyInThePathAndEncodesTheQuery() throws {
        let key = "emulatorKlipyKey0123456789abcdefABCDEF"
        let built = try XCTUnwrap(KlipyAPI.url(appKey: key, path: "search", query: [URLQueryItem(name: "q", value: "kedi & köpek")]))
        XCTAssertEqual(built.host, "api.klipy.com")
        XCTAssertEqual(built.path, "/api/v1/\(key)/gifs/search")
        XCTAssertEqual(URLComponents(url: built, resolvingAgainstBaseURL: false)?.queryItems?.first?.value, "kedi & köpek")
        XCTAssertNil(KlipyAPI.url(appKey: "bad/key", path: "search", query: []))
        XCTAssertNil(KlipyAPI.url(appKey: "", path: "trending", query: []))
    }

    func testSearchSendsAPseudonymTheFilterAndTheCountry() throws {
        let luid = UUID()
        let config = GifClientConfig(provider: "klipy", appKey: "k", contentFilter: "low", perPage: 24)
        let search = FirebaseGifRepository.queryItems(query: "kedi", page: 3, config: config, region: "tr", owner: luid)
        let values = Dictionary(uniqueKeysWithValues: search.map { ($0.name, $0.value ?? "") })
        XCTAssertEqual(values["q"], "kedi")
        XCTAssertEqual(values["page"], "3")
        XCTAssertEqual(values["per_page"], "24")
        XCTAssertEqual(values["locale"], "tr")
        XCTAssertEqual(values["content_filter"], "low")
        XCTAssertEqual(values["customer_id"], KlipyAPI.customerID(for: luid))
        XCTAssertFalse(search.contains { ($0.value ?? "").localizedCaseInsensitiveContains(luid.uuidString) })
        let trending = FirebaseGifRepository.queryItems(query: "", page: 1, config: config, region: "", owner: luid)
        XCTAssertFalse(trending.contains { $0.name == "q" || $0.name == "locale" })
    }

    func testRegionCodeIsATwoLetterCountry() {
        XCTAssertEqual(KlipyAPI.regionCode(Locale(identifier: "tr_TR")), "tr")
        XCTAssertEqual(KlipyAPI.regionCode(Locale(identifier: "en_US")), "us")
        XCTAssertNil(KlipyAPI.regionCode(Locale(identifier: "en")))
        XCTAssertNil(KlipyAPI.regionCode(Locale(identifier: "es_419")))
    }

    private let pageJSON = """
    {"result":true,"data":{"data":[
      {"id":8141312578838486,"slug":"wednesday-wednesday-dance","title":"Wednesday Dance","type":"gif","tags":[],"blur_preview":"data:image/jpeg;base64,AAAA",
       "file":{
         "hd":{"gif":{"url":"https://static.klipy.com/ii/h/hd.gif","width":480,"height":270,"size":1},"jpg":{"url":"https://static.klipy.com/ii/h/hd.jpg","width":480,"height":270,"size":1},"mp4":{"url":"https://static.klipy.com/ii/h/hd.mp4","width":480,"height":270,"size":1}},
         "md":{"gif":{"url":"https://static.klipy.com/ii/h/md.gif","width":480,"height":270,"size":1},"jpg":{"url":"https://static.klipy.com/ii/h/md.jpg","width":480,"height":270,"size":1},"mp4":{"url":"https://static.klipy.com/ii/h/md.mp4","width":480,"height":270,"size":1}},
         "sm":{"gif":{"url":"https://static.klipy.com/ii/h/sm.gif","width":220,"height":124,"size":1},"jpg":{"url":"https://static.klipy.com/ii/h/sm.jpg","width":220,"height":124,"size":1},"mp4":{"url":"https://static.klipy.com/ii/h/sm.mp4","width":320,"height":180,"size":1}}
       }},
      {"slug":"foreign-host","title":"x","file":{"md":{"gif":{"url":"https://evil.example/a.gif","width":1,"height":1},"jpg":{"url":"https://evil.example/a.jpg"},"mp4":{"url":"https://evil.example/a.mp4"}}}},
      {"title":"no slug"},
      "not an object",
      {"slug":"only-small","title":null,"file":{"sm":{"gif":{"url":"https://static2.klipy.com/ii/s/sm.gif","width":220,"height":220},"jpg":{"url":"https://static2.klipy.com/ii/s/sm.jpg"},"mp4":{"url":"https://static2.klipy.com/ii/s/sm.mp4"}}}}
    ],"current_page":1,"per_page":24,"has_next":true,"meta":{"item_min_width":80}}}
    """

    func testPageDecodingKeepsOrderAndSkipsBrokenItems() throws {
        let page = try XCTUnwrap(KlipyAPI.decodePage(Data(pageJSON.utf8)))
        XCTAssertTrue(page.hasNext)
        XCTAssertEqual(page.items.map(\.slug), ["wednesday-wednesday-dance", "foreign-host", "only-small"])

        let first = try XCTUnwrap(page.items[0].media)
        XCTAssertEqual(first.previewURL.absoluteString, "https://static.klipy.com/ii/h/sm.gif")
        XCTAssertEqual(first.stillURL.absoluteString, "https://static.klipy.com/ii/h/md.jpg")
        XCTAssertEqual(first.videoURL.absoluteString, "https://static.klipy.com/ii/h/md.mp4")
        XCTAssertEqual(page.items[0].size.width, 480)
        XCTAssertEqual(page.items[0].size.height, 270)

        XCTAssertNil(page.items[1].media, "media on another host is never loaded")

        let small = try XCTUnwrap(page.items[2].media)
        XCTAssertEqual(small.videoURL.absoluteString, "https://static2.klipy.com/ii/s/sm.mp4")
        XCTAssertEqual(page.items[2].size.width, 220)
    }

    func testRefusedOrMalformedResponsesDecodeToNothing() {
        XCTAssertNil(KlipyAPI.decodePage(Data(#"{"result":false,"errors":{"message":["The provided API key is invalid."]}}"#.utf8)))
        XCTAssertNil(KlipyAPI.decodePage(Data("<html>".utf8)))
        XCTAssertEqual(KlipyAPI.decodePage(Data(#"{"result":true,"data":{"data":[],"has_next":false}}"#.utf8))?.items.count, 0)
    }

    private func media(_ name: String) throws -> GifMedia {
        GifMedia(
            videoURL: try url("https://static.klipy.com/ii/\(name).mp4"),
            previewURL: try url("https://static.klipy.com/ii/\(name).gif"),
            stillURL: try url("https://static.klipy.com/ii/\(name).jpg")
        )
    }

    private actor Counter {
        private(set) var calls: [String] = []
        func record(_ slug: String) { calls.append(slug) }
    }

    func testResolverAsksOncePerSlugAndRemembersTheAnswer() async throws {
        let counter = Counter()
        let expected = try media("a")
        let resolver = KlipyMediaResolver(lookup: { slug in
            await counter.record(slug)
            try? await Task.sleep(for: .milliseconds(30))
            return .found(expected)
        })
        let gif = try XCTUnwrap(GifReference(klipySlug: "happy-cat-f7u--kOKp0sbu4", width: 480, height: 270))
        async let first = resolver.media(for: gif)
        async let second = resolver.media(for: gif)
        let both = await [first, second]
        XCTAssertEqual(both, [expected, expected])
        let third = await resolver.media(for: gif)
        XCTAssertEqual(third, expected)
        let calls = await counter.calls
        XCTAssertEqual(calls, ["happy-cat-f7u--kOKp0sbu4"])
    }

    func testResolverRemembersRemovedGifsButRetriesFailures() async throws {
        let counter = Counter()
        let resolver = KlipyMediaResolver(lookup: { slug in
            await counter.record(slug)
            return slug == "gone" ? .notFound : .failed
        })
        for _ in 0..<3 {
            let gone = await resolver.media(forKlipySlug: "gone")
            XCTAssertNil(gone)
            let offline = await resolver.media(forKlipySlug: "offline")
            XCTAssertNil(offline)
        }
        let calls = await counter.calls
        XCTAssertEqual(calls.filter { $0 == "gone" }.count, 1)
        XCTAssertEqual(calls.filter { $0 == "offline" }.count, 3)
    }

    func testSearchResultsAreRegisteredWithoutAnotherLookup() async throws {
        let resolver = KlipyMediaResolver(lookup: { _ in
            XCTFail("no lookup expected")
            return .failed
        })
        let picked = try media("picked")
        await resolver.register([(slug: "picked-gif", media: picked)])
        let klipy = try XCTUnwrap(GifReference(klipySlug: "picked-gif", width: 1, height: 1))
        let resolved = await resolver.media(for: klipy)
        XCTAssertEqual(resolved, picked)
    }

    func testResolverForgetsAnswersAfterTheirLifetime() async throws {
        let counter = Counter()
        let clock = ClockBox()
        let expected = try media("a")
        let resolver = KlipyMediaResolver(
            lookup: { slug in
                await counter.record(slug)
                return .found(expected)
            },
            now: { clock.now }
        )
        _ = await resolver.media(forKlipySlug: "a")
        clock.advance(KlipyMediaResolver.lifetime - 1)
        _ = await resolver.media(forKlipySlug: "a")
        clock.advance(2)
        _ = await resolver.media(forKlipySlug: "a")
        let calls = await counter.calls
        XCTAssertEqual(calls.count, 2)
    }
}

private final class ClockBox: @unchecked Sendable {
    private let lock = NSLock()
    private var value = Date(timeIntervalSince1970: 1_800_000_000)
    var now: Date {
        lock.lock(); defer { lock.unlock() }
        return value
    }
    func advance(_ seconds: TimeInterval) {
        lock.lock(); defer { lock.unlock() }
        value = value.addingTimeInterval(seconds)
    }
}
