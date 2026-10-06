import AVFoundation
import SwiftUI
import SwiftData
import UIKit

struct DiscoverView: View {
    @Environment(AppSession.self) private var session
    @Environment(AppContainer.self) private var container
    @Environment(\.modelContext) private var modelContext
    @State private var posts: [LociPost] = []
    @State private var query = ""
    @State private var message: String?
    @State private var nextCursor: String?
    @State private var pageGeneration = 0
    @State private var isLoadingMore = false
    @State private var isLoading = true

    var body: some View {
        Group {
            if isLoading {
                LociLoadingView(title: String(localized: "Keşfet hazırlanıyor…"))
            } else if filteredPosts.isEmpty {
                LociEmptyState(
                    title: query.isEmpty ? String(localized: "Henüz içerik yok") : String(localized: "Sonuç bulunamadı"),
                    message: message ?? (query.isEmpty ? String(localized: "Yeni mekânsal postlar burada görünecek.") : String(localized: "Farklı bir kelimeyle tekrar ara.")),
                    symbol: "sparkle.magnifyingglass",
                    actionTitle: message == nil || !container.isBackendConfigured ? nil : "Tekrar dene",
                    action: message == nil ? nil : { Task { await load() } }
                )
            } else {
                List(filteredPosts) { post in
                    NavigationLink(value: post) { PostCard(post: post) }
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                        .listRowInsets(EdgeInsets(top: 7, leading: 16, bottom: 7, trailing: 16))
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .refreshable { await load() }
                .navigationDestination(for: LociPost.self) { PostPreviewView(post: $0) }
            }
        }
        .background(LociScreenBackground())
        .navigationTitle("Keşfet")
        .searchable(text: $query, prompt: String(localized: "Kişi, yer veya içerik"))
        .task { await load() }
        .safeAreaInset(edge: .bottom) {
            if nextCursor != nil {
                Button("Daha fazla göster") { Task { await loadMore() } }
                    .disabled(isLoadingMore || isLoading).padding().background(.ultraThinMaterial)
            }
        }
        .accessibilityIdentifier("screen-discover")
    }

    private var filteredPosts: [LociPost] {
        posts.filter { post in
            guard PublicSafetyPolicy.isListedInPublicDiscover(post) else { return false }
            return query.isEmpty
                || post.caption.localizedCaseInsensitiveContains(query)
                || (post.creatorHandle?.localizedCaseInsensitiveContains(query) ?? false)
        }
    }

    private func load() async {
        pageGeneration += 1
        nextCursor = nil
        isLoading = posts.isEmpty
        message = nil
        defer { isLoading = false }
        let local = localDiscoverDrafts()
        if UITestFixtures.sampleContentEnabled || session.isLocalPreview {
            posts = mergedDiscoverPosts(local + [UITestFixtures.post])
            return
        }
        guard container.isBackendConfigured else {
            posts = local
            message = posts.isEmpty ? String(localized: "Bağlantı ayarları tamamlandığında içerikler burada görünecek.") : nil
            return
        }
        do { let page = try await container.posts.discoverPage(cursor: nil); posts = mergedDiscoverPosts(local + page.posts); nextCursor = page.next }
        catch {
            posts = local
            message = posts.isEmpty ? String(localized: "İçerikler şu anda yüklenemiyor. Biraz sonra tekrar dene.") : nil
        }
    }

    private func localDiscoverDrafts() -> [LociPost] {
        guard case let .signedIn(user) = session.phase else { return [] }
        var descriptor = FetchDescriptor<DraftRecord>(sortBy: [SortDescriptor(\.updatedAt, order: .reverse)])
        descriptor.fetchLimit = 30
        guard let records = try? modelContext.fetch(descriptor) else { return [] }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return records.compactMap { try? decoder.decode(LociPost.self, from: $0.payload) }
            .filter { $0.creatorID == user.id }
    }

    private func mergedDiscoverPosts(_ source: [LociPost]) -> [LociPost] {
        var unique: [UUID: LociPost] = [:]
        for post in source { unique[post.id] = post }
        return Array(unique.values).sorted { $0.createdAt > $1.createdAt }
    }
    private func loadMore() async {
        guard let cursor = nextCursor, !isLoadingMore, case let .signedIn(viewer) = session.phase else { return }
        let generation = pageGeneration
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let page = try await container.posts.discoverPage(cursor: cursor)
            guard !Task.isCancelled, generation == pageGeneration, case let .signedIn(current) = session.phase, current.id == viewer.id else { return }
            posts = mergedDiscoverPosts(posts + page.posts)
            nextCursor = page.next
        } catch { message = String(localized: "İçerikler şu anda yüklenemiyor. Biraz sonra tekrar dene.") }
    }

}
