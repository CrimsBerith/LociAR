import Foundation

/// One GIPHY search result. `title` is shown to VoiceOver only.
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

/// Server contract: functions/src/giphy.ts (`searchGifs`). The GIPHY key never reaches the app.
protocol GifRepository: Sendable {
    /// An empty query returns trending GIFs.
    func search(query: String, offset: Int) async throws -> GifSearchPage
}

final class FirebaseGifRepository: GifRepository, @unchecked Sendable {
    private let callables: CallableClient

    init(callables: CallableClient) { self.callables = callables }

    private struct Response: Decodable {
        struct Item: Decodable { let id: String; let title: String; let width: Int; let height: Int }
        let gifs: [Item]
        let nextOffset: Int?
    }

    func search(query: String, offset: Int) async throws -> GifSearchPage {
        guard let owner = FirebaseIdentity.currentLUID() else { throw AuthFlowError.notSignedIn }
        let locale = Locale.current.identifier
        // Match the server's 50 UTF-16-unit query and bounded offset before keying memory.
        let normalized = GifSearchQuery.normalized(query)
        let offset = max(0, min(offset, 480))
        let key = "\(owner.uuidString)|\(locale)|\(offset)|\(normalized)"
        let client = callables
        let page = try await ClientReadCaches.gifs.value(for: key, ttl: 120, cost: { page in
            page.results.reduce(64) { $0 + $1.title.utf8.count + $1.gif.id.utf8.count + 64 }
        }) {
            guard FirebaseIdentity.currentLUID() == owner else { throw AuthFlowError.notSignedIn }
            let page = try await Self.fetch(client: client, query: normalized, offset: offset, locale: locale)
            guard FirebaseIdentity.currentLUID() == owner else { throw AuthFlowError.notSignedIn }
            return page
        }
        guard !Task.isCancelled, FirebaseIdentity.currentLUID() == owner else { throw AuthFlowError.notSignedIn }
        return page
    }

    private static func fetch(client: CallableClient, query: String, offset: Int, locale: String) async throws -> GifSearchPage {
        let data: Data
        do {
            data = try await client.callRaw("searchGifs", object: [
                "query": query, "offset": offset, "locale": locale,
            ] as [String: Any])
        } catch BackendCallError.rejected(_, _, let reason) where reason == "rate_limited" {
            throw GifSearchError.rateLimited
        } catch BackendCallError.rejected {
            throw GifSearchError.unavailable
        }
        let response = try JSONDecoder().decode(Response.self, from: data)
        let results = response.gifs.compactMap { item in
            GifReference(id: item.id, width: item.width, height: item.height).map { GifSearchResult(gif: $0, title: item.title) }
        }
        return GifSearchPage(results: results, nextOffset: response.nextOffset)
    }
}

/// Preview/UI-test builds: no backend, so there are no GIFs to search.
struct PreviewGifRepository: GifRepository {
    func search(query: String, offset: Int) async throws -> GifSearchPage {
        GifSearchPage(results: [], nextOffset: nil)
    }
}
