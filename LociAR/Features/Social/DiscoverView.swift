import AVFoundation
import SwiftUI
import SwiftData
import UIKit

struct DiscoverView: View {
    @Environment(AppSession.self) private var session
    @Environment(AppContainer.self) private var container
    @Environment(\.modelContext) private var modelContext
    @State private var refreshGate = ScreenRefreshGate()
    @State private var paginationGate = ScreenRefreshGate()
    @State private var loadedRevision: UUID?
    @State private var hasLoadedMore = false
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
                    title: query.isEmpty ? String(localized: "Henüz not yok") : String(localized: "Sonuç bulunamadı"),
                    message: message ?? (query.isEmpty ? String(localized: "Yeni notlar burada görünecek.") : String(localized: "Farklı bir kelimeyle tekrar ara.")),
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
        .searchable(text: $query, prompt: String(localized: "Notlarda ara"))
        .onChange(of: refreshScope) { _, scope in
            if refreshGate.prepare(scope: scope, revision: ContentUpdates.shared.revision) { posts = []; nextCursor = nil }
        }
        .onChange(of: ContentUpdates.shared.revision) { _, value in
            if loadedRevision != value { posts = []; nextCursor = nil }
        }
        .visibleContentRefresh(gate: refreshGate, scope: refreshScope, revision: ContentUpdates.shared.revision) { opening in
            await load(force: false, automatic: !opening)
        }
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

    private var refreshScope: String {
        if case let .signedIn(user) = session.phase { return user.id.uuidString }
        return "signed-out"
    }

    private func load(force: Bool = true, automatic: Bool = false) async {
        let revision = ContentUpdates.shared.revision
        if refreshGate.prepare(scope: refreshScope, revision: revision) { posts = []; nextCursor = nil }
        guard !isLoadingMore, !(automatic && hasLoadedMore && loadedRevision == revision),
              let ticket = refreshGate.begin(scope: refreshScope, revision: revision, force: force) else { return }
        let scope = refreshScope
        if loadedRevision != nil && loadedRevision != revision { posts = []; nextCursor = nil }
        pageGeneration += 1
        isLoading = posts.isEmpty
        message = nil
        var succeeded = false
        var failure: Error?
        defer {
            if refreshGate.isCurrent(ticket, scope: refreshScope, revision: ContentUpdates.shared.revision) { isLoading = false }
            refreshGate.finish(ticket, succeeded: succeeded, error: failure)
        }
        let local = localDiscoverDrafts()
        if UITestFixtures.sampleContentEnabled || session.isLocalPreview {
            posts = mergedDiscoverPosts(local + [UITestFixtures.post]); succeeded = true; loadedRevision = revision
            return
        }
        guard container.isBackendConfigured else {
            posts = local
            message = posts.isEmpty ? String(localized: "Notlar şu anda yüklenemiyor.") : nil
            succeeded = true
            return
        }
        do {
            let page = try await container.posts.discoverPage(cursor: nil)
            guard !Task.isCancelled, scope == refreshScope, revision == ContentUpdates.shared.revision,
                  refreshGate.isCurrent(ticket, scope: scope, revision: revision) else { return }
            posts = mergedDiscoverPosts(local + page.posts); nextCursor = page.next
            hasLoadedMore = false; loadedRevision = revision; succeeded = true
        } catch {
            guard !Task.isCancelled, scope == refreshScope, revision == ContentUpdates.shared.revision,
                  refreshGate.isCurrent(ticket, scope: scope, revision: revision) else { return }
            failure = error
            if let backend = error as? BackendCallError, case .rejected = backend { posts = local; nextCursor = nil }
            message = String(localized: "Notlar yüklenemedi. Tekrar dene.")
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

    /// Keeps the caller's order: own drafts first, then the server's feed (its first page is ranked
    /// by engagement, later pages are chronological). A later copy of a post replaces an earlier one.
    private func mergedDiscoverPosts(_ source: [LociPost]) -> [LociPost] {
        Self.orderPreservingMerge(source)
    }

    nonisolated static func orderPreservingMerge(_ source: [LociPost]) -> [LociPost] {
        var latest: [UUID: LociPost] = [:]
        var order: [UUID] = []
        for post in source {
            if latest[post.id] == nil { order.append(post.id) }
            latest[post.id] = post
        }
        return order.compactMap { latest[$0] }
    }
    private func loadMore() async {
        guard let cursor = nextCursor, !isLoadingMore, !refreshGate.isInFlight, case let .signedIn(viewer) = session.phase else { return }
        let revision = ContentUpdates.shared.revision
        guard let pageTicket = paginationGate.begin(scope: "\(refreshScope)|\(cursor)", revision: revision, force: true) else { return }
        var pageSucceeded = false
        var pageFailure: Error?
        defer { paginationGate.finish(pageTicket, succeeded: pageSucceeded, error: pageFailure) }
        let generation = pageGeneration
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let page = try await container.posts.discoverPage(cursor: cursor)
            guard !Task.isCancelled, revision == ContentUpdates.shared.revision, generation == pageGeneration, case let .signedIn(current) = session.phase, current.id == viewer.id else { return }
            pageSucceeded = true
            hasLoadedMore = true
            posts = mergedDiscoverPosts(posts + page.posts)
            nextCursor = page.next
        } catch {
            guard !Task.isCancelled, revision == ContentUpdates.shared.revision, generation == pageGeneration, case let .signedIn(current) = session.phase, current.id == viewer.id else { return }
            pageFailure = error
            message = String(localized: "Notlar yüklenemedi. Tekrar dene.")
        }
    }

}
