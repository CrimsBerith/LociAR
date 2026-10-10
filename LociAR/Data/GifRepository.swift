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
        let data: Data
        do {
            data = try await callables.callRaw("searchGifs", object: [
                "query": query, "offset": offset, "locale": Locale.current.identifier,
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
