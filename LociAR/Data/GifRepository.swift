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
            let page = try await Self.fetch(query: normalized, offset: offset, region: region, owner: owner)
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
