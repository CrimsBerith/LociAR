import Foundation

/// One GIF search result. `title` is shown to VoiceOver only.
struct GifSearchResult: Hashable, Sendable, Identifiable {
    let gif: GifReference
    let title: String
    var id: String { gif.id }
}

struct GifSearchPage: Sendable {
    let results: [GifSearchResult]
    /// Offset for the next page; nil when there are no more results.
    let nextOffset: Int?
}

enum GifSearchQuery {
    nonisolated static func normalized(_ query: String) -> String {
        String(decoding: query.trimmingCharacters(in: .whitespacesAndNewlines).utf16.prefix(50), as: UTF16.self)
    }
}

enum GifSearchError: LocalizedError, Equatable, Sendable {
    case rateLimited
    case unavailable

    var errorDescription: String? {
        switch self {
        case .rateLimited: String(localized: "Çok fazla GIF araması yapıldı. Biraz sonra tekrar dene.")
        case .unavailable: String(localized: "GIF'ler şu anda yüklenemiyor. Tekrar dene.")
        }
    }
}

/// Upper bound for an awaited step whose underlying API may ignore cancellation (Firebase callables,
/// App Check token fetches). The caller resumes when the deadline passes; the late result is dropped.
enum GifDeadline {
    struct Expired: Error, Equatable {}

    /// Resumes exactly once: whichever of the work or the deadline finishes first.
    private final class Gate<Value: Sendable>: @unchecked Sendable {
        private let lock = NSLock()
        private var continuation: CheckedContinuation<Value, Error>?
        init(_ continuation: CheckedContinuation<Value, Error>) { self.continuation = continuation }
        @discardableResult
        func resume(_ result: Result<Value, Error>) -> Bool {
            lock.lock(); let pending = continuation; continuation = nil; lock.unlock()
            pending?.resume(with: result)
            return pending != nil
        }
    }

    nonisolated static func run<Value: Sendable>(seconds: Double, _ work: @escaping @Sendable () async throws -> Value) async throws -> Value {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Value, Error>) in
            let gate = Gate(continuation)
            let task = Task {
                do { gate.resume(.success(try await work())) } catch { gate.resume(.failure(error)) }
            }
            Task {
                try? await Task.sleep(for: .seconds(seconds))
                if gate.resume(.failure(Expired())) { task.cancel() }
            }
        }
    }
}

/// An empty query returns trending GIFs.
protocol GifRepository: Sendable {
    func search(query: String, offset: Int) async throws -> GifSearchPage
}

/// GIF search on KLIPY, called straight from the device (KLIPY does not allow a server in between).
/// The app key comes from the `getGifConfig` callable; see KlipyMediaResolver.swift.
final class FirebaseGifRepository: GifRepository, @unchecked Sendable {
    init(callables: CallableClient) {
        KlipyCallables.shared.set(callables)
    }

    func search(query: String, offset: Int) async throws -> GifSearchPage {
        guard let owner = FirebaseIdentity.currentLUID() else { throw AuthFlowError.notSignedIn }
        let region = KlipyAPI.regionCode() ?? ""
        // The picker pages by offset; KLIPY pages by number. 50 UTF-16 units and 480 are the picker's bounds.
        let normalized = GifSearchQuery.normalized(query)
        let offset = max(0, min(offset, 480))
        let key = "\(owner.uuidString)|\(region)|\(offset)|\(normalized)"
        let page = try await ClientReadCaches.gifs.value(for: key, ttl: 300, cost: { page in
            page.results.reduce(64) { $0 + $1.title.utf8.count + $1.gif.id.utf8.count + 64 }
        }) {
            guard FirebaseIdentity.currentLUID() == owner else { throw AuthFlowError.notSignedIn }
            let started = Date()
            let page: GifSearchPage
            do {
                // A stalled step (key read, App Check, network) must end in an error the picker can show,
                // never in a spinner that never stops (reported on device, 16 Nov 2026).
                page = try await GifDeadline.run(seconds: Self.searchDeadline) {
                    try await Self.fetch(query: normalized, offset: offset, region: region, owner: owner)
                }
                FieldTestLog.record("gif_search", ["ms": String(Int(Date().timeIntervalSince(started) * 1000)), "outcome": "ok",
                                                   "count": String(page.results.count), "trending": normalized.isEmpty ? "1" : "0"])
            } catch {
                FieldTestLog.record("gif_search", ["ms": String(Int(Date().timeIntervalSince(started) * 1000)),
                                                   "outcome": error is GifDeadline.Expired ? "timeout" : String(describing: error)])
                if error is GifDeadline.Expired { throw GifSearchError.unavailable }
                throw error
            }
            guard FirebaseIdentity.currentLUID() == owner else { throw AuthFlowError.notSignedIn }
            return page
        }
        guard !Task.isCancelled, FirebaseIdentity.currentLUID() == owner else { throw AuthFlowError.notSignedIn }
        return page
    }

    static func queryItems(query: String, page: Int, config: GifClientConfig, region: String, owner: UUID) -> [URLQueryItem] {
        var items = [
            URLQueryItem(name: "page", value: String(page)),
            URLQueryItem(name: "per_page", value: String(config.perPage)),
            URLQueryItem(name: "customer_id", value: KlipyAPI.customerID(for: owner)),
            URLQueryItem(name: "content_filter", value: config.contentFilter),
            // Only the renditions the app shows.
            URLQueryItem(name: "format_filter", value: "gif,jpg,mp4"),
        ]
        if !query.isEmpty { items.append(URLQueryItem(name: "q", value: query)) }
        if !region.isEmpty { items.append(URLQueryItem(name: "locale", value: region)) }
        return items
    }

    /// Longest the picker waits for one page: key read (12 s) plus one KLIPY request with its retry.
    nonisolated static let searchDeadline: Double = 25

    private static func fetch(query: String, offset: Int, region: String, owner: UUID) async throws -> GifSearchPage {
        guard let config = await KlipyConfigStore.shared.config() else { throw GifSearchError.unavailable }
        let perPage = min(max(config.perPage, 8), 50)
        let settings = GifClientConfig(provider: config.provider, appKey: config.appKey, contentFilter: config.contentFilter, perPage: perPage)
        let items = queryItems(query: query, page: offset / perPage + 1, config: settings, region: region, owner: owner)
        let page: KlipyAPI.Page
        do {
            page = try await KlipyAPI.page(path: query.isEmpty ? "trending" : "search", query: items)
        } catch KlipyError.rateLimited {
            throw GifSearchError.rateLimited
        } catch {
            throw GifSearchError.unavailable
        }
        // KLIPY's order is kept as returned; only items the app cannot show safely are left out.
        var media: [(slug: String, media: GifMedia)] = []
        var results: [GifSearchResult] = []
        for item in page.items {
            guard let itemMedia = item.media,
                  let gif = GifReference(klipySlug: item.slug, width: item.size.width, height: item.size.height) else { continue }
            media.append((item.slug, itemMedia))
            results.append(GifSearchResult(gif: gif, title: item.title ?? ""))
        }
        await KlipyMediaResolver.shared.register(media)
        return GifSearchPage(results: results, nextOffset: page.hasNext && offset + perPage <= 480 ? offset + perPage : nil)
    }
}

/// Preview builds stay empty; sample-content UI tests receive one selectable fixture.
struct PreviewGifRepository: GifRepository {
    func search(query: String, offset: Int) async throws -> GifSearchPage {
#if DEBUG
        if UITestFixtures.sampleContentEnabled, offset == 0,
           let gif = GifReference(klipySlug: "sample-dance-gif", width: 200, height: 200) {
            return GifSearchPage(results: [GifSearchResult(gif: gif, title: "")], nextOffset: nil)
        }
#endif
        return GifSearchPage(results: [], nextOffset: nil)
    }
}
