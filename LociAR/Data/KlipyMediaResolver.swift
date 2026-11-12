import CryptoKit
import Foundation

/// Client settings for GIF search, served by the `getGifConfig` callable (functions/src/gifConfig.ts).
struct GifClientConfig: Decodable, Sendable, Equatable {
    let provider: String
    let appKey: String
    let contentFilter: String
    let perPage: Int
}

enum KlipyError: Error, Equatable, Sendable {
    case rateLimited
    case unavailable
}

/// KLIPY's API (docs.klipy.com). KLIPY requires searches and media to be requested by the user's
/// device, and its media URLs to be used exactly as returned, so nothing here goes through
/// LociAR's servers and no media URL is ever built by hand.
enum KlipyAPI {
    /// Requests and media stay out of the on-disk URL cache: KLIPY media must not be retained.
    static let session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 10
        configuration.timeoutIntervalForResource = 30
        configuration.waitsForConnectivity = false
        return URLSession(configuration: configuration)
    }()

    /// KLIPY serves media from static.klipy.com, static1.klipy.com and static2.klipy.com over HTTPS.
    /// Anything else in a response is dropped instead of being loaded.
    static func isMediaURL(_ url: URL) -> Bool {
        guard url.scheme?.lowercased() == "https", url.user == nil, url.port == nil,
              let host = url.host?.lowercased() else { return false }
        guard host.hasSuffix(".klipy.com") else { return false }
        let label = host.dropLast(".klipy.com".count)
        guard label.hasPrefix("static") else { return false }
        return label.dropFirst("static".count).allSatisfy { $0.isASCII && $0.isNumber }
    }

    /// KLIPY keys are letters and digits; the key is a path component of every request.
    static func isValidAppKey(_ key: String) -> Bool {
        (16...128).contains(key.unicodeScalars.count)
            && key.unicodeScalars.allSatisfy { $0.isASCII && CharacterSet.alphanumerics.contains($0) }
    }

    /// A stable pseudonym for KLIPY's `customer_id`. The account id itself is never sent.
    static func customerID(for luid: UUID) -> String {
        let digest = SHA256.hash(data: Data("klipy:\(luid.uuidString.lowercased())".utf8))
        return digest.prefix(16).map { String(format: "%02x", $0) }.joined()
    }

    /// KLIPY's `locale` is an ISO 3166 alpha-2 country code.
    static func regionCode(_ locale: Locale = .current) -> String? {
        guard let code = locale.region?.identifier.lowercased(), code.count == 2,
              code.unicodeScalars.allSatisfy({ $0.isASCII && CharacterSet.lowercaseLetters.contains($0) }) else { return nil }
        return code
    }

    static func url(appKey: String, path: String, query: [URLQueryItem]) -> URL? {
        guard isValidAppKey(appKey) else { return nil }
        var components = URLComponents()
        components.scheme = "https"
        components.host = "api.klipy.com"
        components.path = "/api/v1/\(appKey)/gifs/\(path)"
        components.queryItems = query.isEmpty ? nil : query
        return components.url
    }

    // MARK: Response

    struct Envelope: Decodable {
        let result: Bool?
        let data: Page?
    }

    struct Page: Decodable {
        let items: [Item]
        let hasNext: Bool

        private enum CodingKeys: String, CodingKey {
            case data
            case hasNext = "has_next"
        }

        init(from decoder: Decoder) throws {
            let values = try decoder.container(keyedBy: CodingKeys.self)
            // One malformed item must not hide the rest of the page.
            items = (try values.decodeIfPresent([Lossy<Item>].self, forKey: .data) ?? []).compactMap(\.value)
            hasNext = (try? values.decodeIfPresent(Bool.self, forKey: .hasNext)) ?? false
        }
    }

    struct Lossy<Value: Decodable>: Decodable {
        let value: Value?
        init(from decoder: Decoder) throws { value = try? Value(from: decoder) }
    }

    struct Asset: Decodable {
        let url: String?
        let width: Int?
        let height: Int?
    }

    struct Item: Decodable {
        let slug: String
        let title: String?
        /// size (`hd`, `md`, `sm`, `xs`) → format (`gif`, `mp4`, `jpg`, …) → asset.
        let file: [String: [String: Lossy<Asset>]]?

        private func asset(_ format: String, sizes: [String]) -> (url: URL, width: Int, height: Int)? {
            for size in sizes {
                guard let asset = file?[size]?[format]?.value,
                      let text = asset.url, let url = URL(string: text), KlipyAPI.isMediaURL(url) else { continue }
                return (url, asset.width ?? 0, asset.height ?? 0)
            }
            return nil
        }

        /// The renditions LociAR shows. Nil when KLIPY did not return a usable preview, still and video.
        var media: GifMedia? {
            guard let preview = asset("gif", sizes: ["sm", "md", "xs", "hd"]),
                  let still = asset("jpg", sizes: ["md", "sm", "hd", "xs"]),
                  let video = asset("mp4", sizes: ["md", "sm", "hd", "xs"]) else { return nil }
            return GifMedia(videoURL: video.url, previewURL: preview.url, stillURL: still.url)
        }

        /// Pixel size used for layout; falls back to 16:9 when KLIPY reports none.
        var size: (width: Int, height: Int) {
            for candidate in [asset("gif", sizes: ["md", "hd", "sm", "xs"]), asset("mp4", sizes: ["md", "sm", "hd", "xs"])] {
                if let candidate, candidate.width > 0, candidate.height > 0 { return (candidate.width, candidate.height) }
            }
            return (480, 270)
        }
    }

    static func decodePage(_ data: Data) -> Page? {
        guard let envelope = try? JSONDecoder().decode(Envelope.self, from: data), envelope.result == true else { return nil }
        return envelope.data
    }

    // MARK: Requests

    /// Calls one KLIPY GIF endpoint. A rejected key is read again from the server once.
    static func page(path: String, query: [URLQueryItem]) async throws(KlipyError) -> Page {
        for attempt in 0..<2 {
            guard let config = await KlipyConfigStore.shared.config(),
                  let endpoint = Self.url(appKey: config.appKey, path: path, query: query) else { throw .unavailable }
            let data: Data
            let response: URLResponse
            do {
                (data, response) = try await session.data(from: endpoint)
            } catch {
                throw .unavailable
            }
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if status == 429 { throw .rateLimited }
            // KLIPY answers an unknown key with 404 and `result: false`.
            if [401, 403, 404].contains(status), attempt == 0 {
                await KlipyConfigStore.shared.invalidate(config)
                continue
            }
            guard (200...299).contains(status), let decoded = decodePage(data) else { throw .unavailable }
            return decoded
        }
        throw .unavailable
    }

    static func lookup(slug: String) async -> KlipyMediaResolver.Lookup {
        guard GifReference.isValidKlipySlug(slug) else { return .notFound }
        guard let config = await KlipyConfigStore.shared.config() else { return .failed }
        do {
            let found = try await Self.page(path: "items", query: [
                URLQueryItem(name: "slugs", value: slug),
                URLQueryItem(name: "content_filter", value: config.contentFilter),
            ])
            guard let media = found.items.first?.media else { return .notFound }
            return .found(media)
        } catch {
            return .failed
        }
    }
}

/// Holds the callable client the GIF code uses to read `getGifConfig`; set once by the repository.
final class KlipyCallables: @unchecked Sendable {
    static let shared = KlipyCallables()
    private let lock = NSLock()
    private var client: CallableClient?

    func set(_ client: CallableClient) {
        lock.lock(); defer { lock.unlock() }
        self.client = client
    }

    var current: CallableClient? {
        lock.lock(); defer { lock.unlock() }
        return client
    }
}

/// Reads and caches the KLIPY client settings. The key lives in memory only.
actor KlipyConfigStore {
    static let shared = KlipyConfigStore()
    private static let lifetime: TimeInterval = 3_600
    private var cached: (config: GifClientConfig, expiresAt: Date)?
    private var inFlight: Task<GifClientConfig?, Never>?

    func config() async -> GifClientConfig? {
        if let cached, cached.expiresAt > Date() { return cached.config }
        if let inFlight { return await inFlight.value }
        let task = Task<GifClientConfig?, Never> {
            guard let client = KlipyCallables.shared.current,
                  let data = try? await client.callRaw("getGifConfig", object: [:] as [String: Any]),
                  let config = try? JSONDecoder().decode(GifClientConfig.self, from: data),
                  config.provider == "klipy", KlipyAPI.isValidAppKey(config.appKey) else { return nil }
            return config
        }
        inFlight = task
        let config = await task.value
        inFlight = nil
        if let config { cached = (config, Date().addingTimeInterval(Self.lifetime)) }
        return config
    }

    /// Forgets a key KLIPY rejected, unless a newer one has already replaced it.
    func invalidate(_ config: GifClientConfig) {
        if cached?.config == config { cached = nil }
    }
}

/// Finds the media of a GIF. GIPHY media follows from the id; KLIPY media is read from KLIPY by
/// slug and remembered for a while, so a feed does not ask again for every card.
actor KlipyMediaResolver {
    enum Lookup: Sendable, Equatable {
        case found(GifMedia)
        /// KLIPY no longer has this GIF (removed or filtered).
        case notFound
        /// Network or service error: worth asking again soon.
        case failed
    }

    static let shared = KlipyMediaResolver()
    static let lifetime: TimeInterval = 1_800
    static let missingLifetime: TimeInterval = 300
    static let maximumEntries = 400

    private let lookup: @Sendable (String) async -> Lookup
    private let now: @Sendable () -> Date
    private var cache: [String: (media: GifMedia, expiresAt: Date)] = [:]
    private var missing: [String: Date] = [:]
    private var inFlight: [String: Task<Lookup, Never>] = [:]

    init(
        lookup: @escaping @Sendable (String) async -> Lookup = { await KlipyAPI.lookup(slug: $0) },
        now: @escaping @Sendable () -> Date = { Date() }
    ) {
        self.lookup = lookup
        self.now = now
    }

    /// Search results already carry their media; remember it so a picked GIF needs no second request.
    func register(_ entries: [(slug: String, media: GifMedia)]) {
        let expiresAt = now().addingTimeInterval(Self.lifetime)
        for entry in entries {
            cache[entry.slug] = (entry.media, expiresAt)
            missing[entry.slug] = nil
        }
        trim()
    }

    func media(for gif: GifReference) async -> GifMedia? {
        switch gif.provider {
        case .giphy: return gif.giphyMedia
        case .klipy: return await media(forKlipySlug: gif.id)
        }
    }

    func media(forKlipySlug slug: String) async -> GifMedia? {
        let date = now()
        if let cached = cache[slug], cached.expiresAt > date { return cached.media }
        if let until = missing[slug], until > date { return nil }
        let task: Task<Lookup, Never>
        if let existing = inFlight[slug] {
            task = existing
        } else {
            let lookup = self.lookup
            task = Task { await lookup(slug) }
            inFlight[slug] = task
        }
        let result = await task.value
        if inFlight[slug] == task { inFlight[slug] = nil }
        switch result {
        case .found(let media):
            cache[slug] = (media, now().addingTimeInterval(Self.lifetime))
            missing[slug] = nil
            trim()
            return media
        case .notFound:
            missing[slug] = now().addingTimeInterval(Self.missingLifetime)
            if missing.count > Self.maximumEntries { missing.removeAll() }
            return nil
        case .failed:
            return nil
        }
    }

    private func trim() {
        guard cache.count > Self.maximumEntries else { return }
        let date = now()
        cache = cache.filter { $0.value.expiresAt > date }
        guard cache.count > Self.maximumEntries else { return }
        let oldest = cache.sorted { $0.value.expiresAt < $1.value.expiresAt }.prefix(cache.count - Self.maximumEntries)
        for entry in oldest { cache[entry.key] = nil }
    }
}
