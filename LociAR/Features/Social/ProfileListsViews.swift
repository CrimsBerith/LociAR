import AVFoundation
import SwiftUI
import SwiftData
import UIKit

struct CollectionsView: View {
    @Environment(AppSession.self) private var session
    @Environment(AppContainer.self) private var container
    @State private var collections: [LociCollection] = []
    @State private var title = ""
    @State private var showCreate = false
    @State private var message: String?
    @State private var isLoading = true

    var body: some View {
        Group {
            if isLoading { LociLoadingView(title: String(localized: "Koleksiyonlar yükleniyor…")) }
            else if collections.isEmpty {
                if let message {
                    LociEmptyState.failure(message: message, retry: retryAction)
                } else {
                    LociEmptyState(
                        title: String(localized: "Henüz koleksiyon yok"),
                        message: String(localized: "Kaydettiğin notları özel koleksiyonlarda düzenleyebilirsin."),
                        symbol: "square.stack.3d.up",
                        actionTitle: String(localized: "İlk koleksiyonu oluştur"),
                        action: { showCreate = true }
                    )
                }
            } else {
                List {
                    if let message {
                        LociInlineNotice(title: String(localized: "Bir sorun oluştu"), message: message, symbol: "exclamationmark.triangle.fill", color: LociTheme.danger)
                            .listRowBackground(Color.clear)
                    }
                    ForEach(collections) { collection in
                    NavigationLink {
                        CollectionDetailView(collection: collection)
                    } label: {
                        HStack(spacing: LociTheme.Spacing.m) {
                            ZStack {
                                RoundedRectangle(cornerRadius: LociTheme.Radius.small, style: .continuous).fill(LociTheme.identityAccent.opacity(0.16)).frame(width: 42, height: 42)
                                Image(systemName: "folder.fill").foregroundStyle(LociTheme.identityAccent)
                            }
                            VStack(alignment: .leading, spacing: LociTheme.Spacing.xs) {
                                Text(collection.title).font(.headline)
                                Text("Özel koleksiyon").font(.caption).foregroundStyle(LociTheme.secondaryText)
                            }
                        }
                    }
                    .listRowBackground(Color.clear)
                    }
                }
                .lociListStyle()
                .refreshable { await load() }
            }
        }
        .background(LociScreenBackground())
        .navigationTitle("Koleksiyonlar")
        .toolbar { Button("Yeni", systemImage: "plus") { showCreate = true } }
        .alert("Yeni koleksiyon", isPresented: $showCreate) {
            TextField("Başlık", text: $title)
            Button("Oluştur") { Task { await create() } }.disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            Button("Vazgeç", role: .cancel) { /* SwiftUI dismisses the alert; cancellation performs no write. */ }
        }
        .task { await load() }
    }

    /// UI-test fixture sessions (Debug only) use the in-memory social repository even when the build
    /// carries no Firebase configuration, as on CI runners.
    private var canUseCollections: Bool {
        if container.isBackendConfigured { return true }
        #if DEBUG
        return UITestFixtures.authenticatedSessionEnabled
        #else
        return false
        #endif
    }

    /// Retry is only offered when a backend exists to retry against.
    private var retryAction: (() -> Void)? {
        guard container.isBackendConfigured else { return nil }
        return { Task { await load() } }
    }

    private func load() async {
        isLoading = collections.isEmpty
        message = nil
        defer { isLoading = false }
        guard case let .signedIn(user) = session.phase, canUseCollections else {
            message = String(localized: "Koleksiyonlar için sunucu bağlantısı gerekiyor.")
            return
        }
        do { collections = try await container.social.collections(for: user.id) }
        catch { message = String(localized: "Koleksiyonlar şu anda yüklenemiyor.") }
    }

    private func create() async {
        let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard case let .signedIn(user) = session.phase, canUseCollections, !cleanTitle.isEmpty else { return }
        guard cleanTitle.count <= 80 else { message = String(localized: "Koleksiyon başlığı en fazla 80 karakter olabilir."); return }
        message = nil
        do {
            let created = try await container.social.createCollection(title: cleanTitle, userID: user.id)
            collections.insert(created, at: 0)
            title = ""
            message = nil
        } catch { message = String(localized: "Koleksiyon oluşturulamadı. Biraz sonra tekrar dene.") }
    }
}

struct CollectionDetailView: View {
    @Environment(AppSession.self) private var session
    @Environment(AppContainer.self) private var container
    let collection: LociCollection
    @State private var posts: [LociPost] = []
    @State private var isLoading = true
    @State private var message: String?
    @State private var nextCursor: String?
    @State private var isLoadingMore = false
    @State private var loadID = UUID()

    var body: some View {
        Group {
            if isLoading {
                LociLoadingView(title: String(localized: "Koleksiyon yükleniyor…"))
            } else if posts.isEmpty && nextCursor == nil {
                if let message {
                    // A failed load must not read as an empty collection.
                    LociEmptyState.failure(message: message, retry: { Task { await load() } })
                } else {
                    LociEmptyState(
                        title: String(localized: "Bu koleksiyon boş"),
                        message: String(localized: "Notları ayrıntı ekranından bu koleksiyona ekleyebilirsin."),
                        symbol: "folder.badge.plus"
                    )
                }
            } else {
                List {
                    if let message {
                        LociInlineNotice(title: String(localized: "Bazı notlar gösterilemiyor"), message: message, symbol: "exclamationmark.triangle.fill", color: LociTheme.warning)
                            .listRowBackground(Color.clear)
                    }
                    ForEach(posts) { post in
                        NavigationLink {
                            PostPreviewView(post: post)
                        } label: {
                            HStack(spacing: LociTheme.Spacing.m) {
                                LociAvatar(handle: String(post.creatorID.uuidString.prefix(6)), avatarURL: post.creatorAvatarURL, size: 36)
                                VStack(alignment: .leading, spacing: LociTheme.Spacing.xs) {
                                    if post.isLocked { Text("Kilitli not").font(.subheadline.bold()) }
                                    else if post.caption.isEmpty { Text("AR notu").font(.subheadline.bold()) }
                                    else { TranslatedPostText(text: post.caption, lineLimit: 2).font(.subheadline.bold()) }
                                    if post.isOfficialContent { OfficialContentBadge() }
                                    Text(post.anchorBundle.anchor.pinQuality.isPhysicalSurface ? String(localized: "Fiziksel yüzey") : String(localized: "Yaklaşık"))
                                        .font(.caption2)
                                        .foregroundStyle(post.anchorBundle.anchor.pinQuality.isPhysicalSurface ? LociTheme.accent : LociTheme.warning)
                                }
                            }
                        }
                        .listRowBackground(Color.clear)
                        .swipeActions(edge: .trailing) {
                            Button(role: .destructive) {
                                Task { await remove(post: post) }
                            } label: {
                                Label("Çıkar", systemImage: "trash")
                            }
                        }
                    }
                    if nextCursor != nil {
                        Button("Daha fazla göster") { Task { await loadMore() } }
                            .disabled(isLoadingMore)
                            .overlay { if isLoadingMore { ProgressView() } }
                            .listRowBackground(Color.clear)
                    }
                }
                .lociListStyle()
                .refreshable { await load() }
            }
        }
        .background(LociScreenBackground())
        .navigationTitle(collection.title)
        .task { await load() }
    }

    private func load() async {
        let requestID = UUID(); loadID = requestID
        isLoading = posts.isEmpty
        isLoadingMore = false; nextCursor = nil
        message = nil
        defer { if loadID == requestID { isLoading = false } }
        guard case let .signedIn(user) = session.phase, user.id == collection.ownerID, container.isBackendConfigured else {
            message = String(localized: "Notlar yüklenemedi."); return
        }
        do {
            let page = try await container.social.collectionPostsPage(in: collection.id, userID: user.id, cursor: nil)
            guard !Task.isCancelled, loadID == requestID, case let .signedIn(current) = session.phase, current.id == user.id else { return }
            posts = page.posts; nextCursor = page.next
        } catch {
            guard !Task.isCancelled, loadID == requestID else { return }
            message = String(localized: "Notlar yüklenemedi.")
        }
    }

    private func loadMore() async {
        guard !isLoading, !isLoadingMore, let cursor = nextCursor,
              case let .signedIn(user) = session.phase, user.id == collection.ownerID else { return }
        let requestID = loadID
        isLoadingMore = true; message = nil
        defer { if loadID == requestID { isLoadingMore = false } }
        do {
            let page = try await container.social.collectionPostsPage(in: collection.id, userID: user.id, cursor: cursor)
            guard !Task.isCancelled, loadID == requestID, case let .signedIn(current) = session.phase, current.id == user.id else { return }
            let known = Set(posts.map(\.id)); posts += page.posts.filter { !known.contains($0.id) }
            nextCursor = page.next
        } catch {
            guard !Task.isCancelled, loadID == requestID else { return }
            message = String(localized: "Notlar yüklenemedi.")
        }
    }

    private func remove(post: LociPost) async {
        do {
            try await container.social.remove(postID: post.id, from: collection.id)
            loadID = UUID(); isLoadingMore = false
            withAnimation {
                posts.removeAll { $0.id == post.id }
            }
        } catch {
            message = String(localized: "Not koleksiyondan çıkarılamadı.")
        }
    }
}

struct SavedPostsView: View {
    @Environment(AppSession.self) private var session
    @Environment(AppContainer.self) private var container
    @State private var posts: [LociPost] = []
    @State private var message: String?
    @State private var isLoading = true
    @State private var nextCursor: String?
    @State private var isLoadingMore = false
    @State private var loadID = UUID()
    var body: some View {
        Group {
            if isLoading { LociLoadingView(title: String(localized: "Kaydedilenler yükleniyor…")) }
            else if posts.isEmpty && nextCursor == nil {
                if let message {
                    LociEmptyState.failure(message: message, retry: container.isBackendConfigured ? { Task { await load() } } : nil)
                } else {
                    LociEmptyState(title: String(localized: "Kaydedilen not yok"), message: String(localized: "Kaydettiğin notlar burada görünür."), symbol: "bookmark")
                }
            } else {
                List {
                    if let message {
                        LociInlineNotice(title: String(localized: "Bazı notlar gösterilemiyor"), message: message, symbol: "exclamationmark.triangle.fill", color: LociTheme.warning)
                            .listRowBackground(Color.clear)
                    }
                    ForEach(posts) { post in
                        NavigationLink(value: post) { PostCard(post: post) }
                            .listRowBackground(Color.clear).listRowSeparator(.hidden)
                    }
                    if nextCursor != nil {
                        Button("Daha fazla göster") { Task { await loadMore() } }
                            .disabled(isLoadingMore)
                            .overlay { if isLoadingMore { ProgressView() } }
                            .listRowBackground(Color.clear)
                    }
                }
                .lociListStyle().refreshable { await load() }
            }
        }
        .background(LociScreenBackground())
        .navigationTitle("Kaydedilenler")
        .navigationDestination(for: LociPost.self) { PostPreviewView(post: $0) }
        .task { await load() }
    }
    private func load() async {
        let requestID = UUID(); loadID = requestID
        isLoading = posts.isEmpty
        isLoadingMore = false; nextCursor = nil
        message = nil
        defer { if loadID == requestID { isLoading = false } }
        guard case let .signedIn(user) = session.phase, container.isBackendConfigured else {
            message = String(localized: "Kaydedilenler için sunucu bağlantısı gerekiyor.")
            return
        }
        do {
            let page = try await container.social.savedPostsPage(for: user.id, cursor: nil)
            guard !Task.isCancelled, loadID == requestID, case let .signedIn(current) = session.phase, current.id == user.id else { return }
            posts = page.posts; nextCursor = page.next
        } catch {
            guard !Task.isCancelled, loadID == requestID else { return }
            message = String(localized: "Kaydedilen notlar şu anda yüklenemiyor.")
        }
    }

    private func loadMore() async {
        guard !isLoading, !isLoadingMore, let cursor = nextCursor, case let .signedIn(user) = session.phase else { return }
        let requestID = loadID
        isLoadingMore = true; message = nil
        defer { if loadID == requestID { isLoadingMore = false } }
        do {
            let page = try await container.social.savedPostsPage(for: user.id, cursor: cursor)
            guard !Task.isCancelled, loadID == requestID, case let .signedIn(current) = session.phase, current.id == user.id else { return }
            let known = Set(posts.map(\.id)); posts += page.posts.filter { !known.contains($0.id) }
            nextCursor = page.next
        } catch {
            guard !Task.isCancelled, loadID == requestID else { return }
            message = String(localized: "Kaydedilen notlar şu anda yüklenemiyor.")
        }
    }
}

struct BlockedUsersView: View {
    @Environment(AppSession.self) private var session
    @Environment(AppContainer.self) private var container
    @State private var ids: [UUID] = []
    @State private var message: String?
    @State private var isLoading = true
    var body: some View {
        Group {
            if isLoading { LociLoadingView(title: String(localized: "Engellenen hesaplar yükleniyor…")) }
            else if ids.isEmpty {
                if let message {
                    LociEmptyState.failure(message: message, retry: container.isBackendConfigured ? { Task { await load() } } : nil)
                } else {
                    LociEmptyState(title: String(localized: "Engellenen hesap yok"), message: String(localized: "Engellediğin hesaplar burada görünür."), symbol: "person.crop.circle.badge.xmark")
                }
            } else {
                List(ids, id: \.self) { id in
                    HStack(spacing: LociTheme.Spacing.m) {
                        LociAvatar(handle: "E", size: 42)
                        Text("Engellenen hesap").font(.headline)
                        Spacer()
                        Button("Engeli kaldır") { Task { await unblock(id) } }.buttonStyle(LociCompactButtonStyle())
                    }
                    .listRowBackground(Color.clear)
                }
                .lociListStyle().refreshable { await load() }
            }
        }
        .background(LociScreenBackground())
        .navigationTitle("Engellenenler").task { await load() }
    }
    private func load() async {
        isLoading = ids.isEmpty
        message = nil
        defer { isLoading = false }
        guard case let .signedIn(user) = session.phase, container.isBackendConfigured else {
            message = String(localized: "Engellenen hesaplar için sunucu bağlantısı gerekiyor.")
            return
        }
        do { ids = try await container.social.blockedUserIDs(for: user.id) }
        catch { message = String(localized: "Engellenen hesaplar şu anda yüklenemiyor.") }
    }
    private func unblock(_ id: UUID) async {
        guard case let .signedIn(user) = session.phase, container.isBackendConfigured else { return }
        do {
            try await container.social.setBlocked(false, targetID: id, userID: user.id)
            ids.removeAll { $0 == id }
            message = nil
        } catch { message = String(localized: "Engel kaldırılamadı. Tekrar dene.") }
    }
}

struct MyPostsView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(AppSession.self) private var session
    @Environment(AppContainer.self) private var container
    @State private var posts: [LociPost] = []
    @State private var pendingIDs: Set<UUID> = []
    @State private var failedIDs: Set<UUID> = []
    @State private var message: String?
    @State private var nextCursor: String?
    @State private var pageGeneration = 0
    @State private var isLoadingMore = false
    @State private var isLoading = true
    @State private var isRetrying = false
    @State private var postToDelete: LociPost?
    @State private var deleteError: String?
    @State private var isDeleting = false
    @State private var displayOwnerID: UUID?

    private var viewerID: UUID? {
        if case let .signedIn(user) = session.phase { return user.id }
        return nil
    }

    var body: some View {
        Group {
            if isLoading || displayOwnerID != viewerID { LociLoadingView(title: String(localized: "Notların yükleniyor…")) }
            else if posts.isEmpty {
                if let message {
                    LociEmptyState.failure(message: message, retry: container.isBackendConfigured ? { Task { await load() } } : nil)
                } else {
                    LociEmptyState(title: String(localized: "Henüz not yok"), message: String(localized: "Yayınlanan ve incelemedeki notların burada görünür."), symbol: "rectangle.stack.badge.plus")
                }
            } else {
                List {
                    if let message {
                        LociInlineNotice(title: String(localized: "Şu anda yüklenemiyor"), message: message,
                                         symbol: "exclamationmark.triangle.fill", color: LociTheme.warning)
                            .listRowBackground(Color.clear)
                        Button("Tekrar dene") { Task { await load() } }
                            .listRowBackground(Color.clear)
                    }
                    ForEach(posts) { post in
                    NavigationLink(value: post) {
                        VStack(alignment: .leading, spacing: LociTheme.Spacing.s) {
                            if failedIDs.contains(post.id) {
                                LociStatusPill(title: String(localized: "İşlem gerekiyor"), symbol: "exclamationmark.triangle.fill", color: LociTheme.danger)
                            } else if pendingIDs.contains(post.id) {
                                LociStatusPill(title: String(localized: "Yayın bekliyor"), symbol: "arrow.triangle.2.circlepath", color: LociTheme.warning)
                            } else if post.status == .pendingReview {
                                LociStatusPill(title: String(localized: "İncelemede"), symbol: "clock.fill", color: LociTheme.warning)
                            }
                            PostCard(post: post)
                        }
                    }
                    .listRowBackground(Color.clear).listRowSeparator(.hidden)
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        Button("Sil", systemImage: "trash", role: .destructive) { postToDelete = post }
                            .disabled(isDeleting)
                            .accessibilityIdentifier("my-post-delete-\(post.id.uuidString)")
                    }
                    }
                }
                .lociListStyle().refreshable { await load() }
            }
        }
        .background(LociScreenBackground())
        .navigationTitle("Notlarım")
        .navigationDestination(for: LociPost.self) { PostPreviewView(post: $0) }
        .toolbar {
            if !pendingIDs.isEmpty || !failedIDs.isEmpty {
                ToolbarItem(placement: .primaryAction) {
                    Button("Şimdi yayınla", systemImage: "arrow.clockwise") { Task { await retryQueuedPosts() } }
                        .disabled(isRetrying)
                        .accessibilityIdentifier("my-posts-retry-pending")
                }
            }
        }
        .task(id: viewerID) { await load() }
        .safeAreaInset(edge: .bottom) {
            if nextCursor != nil {
                LociPaginationFooter(isLoading: isLoadingMore, isEnabled: !isLoading) {
                    Task { await loadMore() }
                }
            }
        }
        .confirmationDialog(
            "Bu post silinsin mi?",
            isPresented: Binding(
                get: { postToDelete != nil },
                set: { if !$0 { postToDelete = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Postu sil", role: .destructive) {
                guard let post = postToDelete else { return }
                postToDelete = nil
                Task { await delete(post) }
            }
            Button("Vazgeç", role: .cancel) { postToDelete = nil }
        } message: {
            Text("Notun Keşfet, profil ve AR listesinden kaldırılır.")
        }
        .alert("Post silinemedi", isPresented: Binding(
            get: { deleteError != nil },
            set: { if !$0 { deleteError = nil } }
        )) {
            Button("Tamam", role: .cancel) { /* Closes the alert. */ }
        } message: {
            Text((deleteError ?? "").localizedUI)
        }
    }

    private func load() async {
        pageGeneration += 1
        let generation = pageGeneration
        nextCursor = nil
        isLoading = posts.isEmpty
        message = nil
        defer { if pageGeneration == generation { isLoading = false } }
        guard case let .signedIn(user) = session.phase else {
            displayOwnerID = nil
            posts = []
            pendingIDs = []
            failedIDs = []
            message = String(localized: "Notları görmek için tekrar giriş yap.")
            return
        }
        let previousPosts = displayOwnerID == user.id ? posts : []
        displayOwnerID = user.id
        let localPosts = loadLocalDrafts(ownerID: user.id)
        let queueDescriptor = FetchDescriptor<SyncQueueRecord>()
        let queues = ((try? modelContext.fetch(queueDescriptor)) ?? []).filter { $0.ownerID == user.id }
        failedIDs = Set(queues.filter { $0.deadLetterReason != nil }.map(\.id))
        pendingIDs = Set(localPosts.map(\.id)).subtracting(failedIDs)
        let localIDs = Set(localPosts.map(\.id))
        // Retain already displayed remote posts while refreshing; never carry them across accounts.
        posts = (localPosts + previousPosts.filter { !localIDs.contains($0.id) })
            .sorted { $0.createdAt > $1.createdAt }
        if session.isLocalPreview {
            if posts.isEmpty { posts = [UITestFixtures.post] }
            return
        }
        guard container.isBackendConfigured else { message = String(localized: "Notların için sunucu bağlantısı gerekiyor."); return }
        do {
            let page = try await container.posts.myPostsPage(cursor: nil)
            guard !Task.isCancelled, pageGeneration == generation, viewerID == user.id else { return }
            let remotePosts = page.posts
            nextCursor = page.next
            let remoteIDs = Set(remotePosts.map(\.id))
            pendingIDs.subtract(remoteIDs)
            failedIDs.subtract(remoteIDs)
            posts = (remotePosts + localPosts.filter { !remoteIDs.contains($0.id) })
                .sorted { $0.createdAt > $1.createdAt }
        } catch {
            guard !Task.isCancelled, pageGeneration == generation, viewerID == user.id else { return }
            message = localPosts.isEmpty ? String(localized: "Notların şu anda yüklenemiyor.") : String(localized: "Bekleyen not cihazda güvende. Yayını tekrar deneyebilirsin.")
        }
    }

    private func loadLocalDrafts(ownerID: UUID) -> [LociPost] {
        let descriptor = FetchDescriptor<DraftRecord>(sortBy: [SortDescriptor(\.updatedAt, order: .reverse)])
        guard let records = try? modelContext.fetch(descriptor) else { return [] }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        var didAssignLegacyOwner = false
        let posts = records.compactMap { record -> LociPost? in
            guard let post = try? decoder.decode(LociPost.self, from: record.payload),
                  post.creatorID == ownerID else { return nil }
            if record.ownerID == nil {
                record.ownerID = post.creatorID
                didAssignLegacyOwner = true
            }
            guard record.ownerID == ownerID else { return nil }
            return post
        }
        if didAssignLegacyOwner { try? modelContext.save() }
        return posts
    }

    private func retryQueuedPosts() async {
        guard case let .signedIn(user) = session.phase else { return }
        isRetrying = true
        await SyncQueueProcessor.process(
            modelContext: modelContext,
            repository: container.posts,
            authenticatedUserID: user.id,
            force: true
        )
        isRetrying = false
        await load()
    }

    private func delete(_ post: LociPost) async {
        guard !isDeleting, case let .signedIn(user) = session.phase, post.creatorID == user.id else { return }
        isDeleting = true
        defer { isDeleting = false }
        do {
            if session.isLocalPreview || container.isBackendConfigured {
                do { try await container.posts.removeOwnPost(id: post.id) }
                catch let error as PostPublishError {
                    // "Not found": a queued or refused draft never reached the server, so only the local copy exists.
                    guard pendingIDs.contains(post.id) || failedIDs.contains(post.id) else { throw error }
                }
            } else {
                throw URLError(.notConnectedToInternet)
            }
            let postID = post.id
            let draft = FetchDescriptor<DraftRecord>(predicate: #Predicate { $0.id == postID })
            let queue = FetchDescriptor<SyncQueueRecord>(predicate: #Predicate { $0.id == postID })
            if let record = try modelContext.fetch(draft).first { modelContext.delete(record) }
            if let record = try modelContext.fetch(queue).first { modelContext.delete(record) }
            try modelContext.save()
            await MediaAssetStore.removeLocalAssets(in: post)
            posts.removeAll { $0.id == post.id }
            pendingIDs.remove(post.id)
            failedIDs.remove(post.id)
        } catch {
            deleteError = String(localized: "Not şu anda silinemiyor. Bağlantını kontrol edip tekrar dene.")
        }
    }
    private func loadMore() async {
        guard let cursor = nextCursor, !isLoadingMore, case let .signedIn(viewer) = session.phase else { return }
        let generation = pageGeneration
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let page = try await container.posts.myPostsPage(cursor: cursor)
            guard !Task.isCancelled, generation == pageGeneration, case let .signedIn(current) = session.phase, current.id == viewer.id else { return }
            var unique = Dictionary(posts.map { ($0.id, $0) }, uniquingKeysWith: { _, latest in latest }); for post in page.posts { unique[post.id] = post }; posts = unique.values.sorted { $0.createdAt > $1.createdAt }; pendingIDs.subtract(Set(page.posts.map(\.id))); failedIDs.subtract(Set(page.posts.map(\.id)))
            nextCursor = page.next
        } catch { message = String(localized: "İçerikler şu anda yüklenemiyor. Biraz sonra tekrar dene.") }
    }

}

// MARK: - Invites

struct InviteView: View {
    @Environment(AppContainer.self) private var container
    @Environment(AppSession.self) private var session
    @State private var codeInput = ""
    @State private var invites: [InviteCode] = []
    @State private var message: String?
    @State private var info: String?
    @State private var isBusy = false
    @State private var isLoading = true
    @State private var needsInvite = false
    @State private var loadMessage: String?
    @State private var activeLoadID: UUID?
    @State private var accountGeneration = UUID()

    private var signedInID: UUID? {
        if case let .signedIn(user) = session.phase { return user.id }
        return nil
    }

    private var normalizedInput: String {
        codeInput.uppercased().filter { $0.isLetter || $0.isNumber }
    }

    var body: some View {
        List {
            Section {
                TextField("Davet kodu", text: $codeInput)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .font(.system(.body, design: .monospaced))
                    .accessibilityIdentifier("invite-code-field")
                    .lociGlassRowBackground()
                Button {
                    Task { await redeem() }
                } label: {
                    Label("Kodu kullan", systemImage: "ticket.fill")
                }
                .buttonStyle(LociPrimaryButtonStyle())
                .disabled(isBusy || activeLoadID != nil || normalizedInput.count < 8)
                .accessibilityIdentifier("invite-redeem-button")
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
                if needsInvite {
                    Text("Paylaşmak için davet kodunu gir.")
                        .font(.footnote)
                        .foregroundStyle(LociTheme.secondaryText)
                        .lociGlassRowBackground()
                }
            } header: {
                Text("Sana verilen kod")
            }
            Section {
                if isLoading {
                    ProgressView().accessibilityLabel(Text("Davet kodları yükleniyor…"))
                        .lociGlassRowBackground()
                } else if let loadMessage {
                    LociInlineNotice(title: String(localized: "Davet kodları yüklenemedi"), message: loadMessage,
                                     symbol: "exclamationmark.triangle.fill", color: LociTheme.warning)
                        .lociGlassRowBackground()
                    Button("Tekrar dene") { Task { await loadInvites() } }
                        .disabled(isBusy)
                        .accessibilityIdentifier("invite-retry-load")
                        .lociGlassRowBackground()
                }
                if !isLoading && loadMessage == nil && invites.isEmpty {
                    Text(needsInvite ? String(localized: "Kodlarını görmek için önce sana verilen kodu gir.") : String(localized: "Henüz davet kodun yok."))
                        .font(.footnote)
                        .foregroundStyle(LociTheme.secondaryText)
                        .lociGlassRowBackground()
                }
                if !isLoading && !invites.isEmpty {
                    ForEach(invites) { invite in
                        HStack {
                            Text(invite.code)
                                .font(.system(.body, design: .monospaced).weight(.semibold))
                                .strikethrough(invite.redeemed)
                                .foregroundStyle(invite.redeemed ? LociTheme.secondaryText : LociTheme.textPrimary)
                            Spacer()
                            if invite.redeemed {
                                Text("Kullanıldı").font(.caption).foregroundStyle(LociTheme.secondaryText)
                            } else {
                                ShareLink(item: String(localized: "LociAR'a davetlisin. Davet kodun: \(invite.code)")) {
                                    Image(systemName: "square.and.arrow.up")
                                        .frame(width: LociTheme.Control.minimumTapTarget, height: LociTheme.Control.minimumTapTarget)
                                        .background(LociTheme.field, in: RoundedRectangle(cornerRadius: LociTheme.Radius.small, style: .continuous))
                                        .overlay(RoundedRectangle(cornerRadius: LociTheme.Radius.small, style: .continuous).stroke(LociTheme.glassBorder))
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel(Text("Kodu paylaş"))
                            }
                        }
                        .lociGlassRowBackground()
                    }
                }
                Text("Her hesap en fazla 3 kod verebilir. Her kod tek kullanımlıktır.")
                    .font(.footnote)
                    .foregroundStyle(LociTheme.secondaryText)
                    .lociGlassRowBackground()
            } header: {
                Text("Senin kodların")
            }
            if let info {
                Section { Text(info).foregroundStyle(LociTheme.accent).lociGlassRowBackground() }
            }
            if let message {
                Section { Text(message).foregroundStyle(LociTheme.danger).lociGlassRowBackground() }
            }
        }
        .lociListStyle()
        .navigationTitle("Davet kodu")
        .task(id: signedInID) {
            // Discard state from the previous account, including in-flight read results and drafts.
            accountGeneration = UUID()
            activeLoadID = nil
            invites = []; codeInput = ""; message = nil; info = nil; loadMessage = nil
            needsInvite = false; isBusy = false; isLoading = true
            await loadInvites()
        }
    }

    private func redeem() async {
        guard !isBusy, let userID = signedInID else { return }
        let generation = accountGeneration
        isBusy = true
        message = nil
        info = nil
        defer { if signedInID == userID, accountGeneration == generation { isBusy = false } }
        do {
            try await container.invites.redeem(code: normalizedInput)
            guard !Task.isCancelled, signedInID == userID, accountGeneration == generation else { return }
            codeInput = ""
            info = String(localized: "Davet kodu kabul edildi.")
            await loadInvites()
        } catch {
            guard !Task.isCancelled, signedInID == userID, accountGeneration == generation else { return }
            // Preserve the typed code so a recoverable failure can be retried.
            message = InviteFailurePresentation.message(for: error)
        }
    }

    private func loadInvites() async {
        guard activeLoadID == nil else { return }
        guard container.isBackendConfigured else { isLoading = false; return }
        guard let userID = signedInID else {
            isLoading = false
            loadMessage = InviteFailurePresentation.message(for: AuthFlowError.notSignedIn)
            return
        }
        let ticket = UUID()
        activeLoadID = ticket
        isLoading = invites.isEmpty
        loadMessage = nil
        defer {
            if activeLoadID == ticket { activeLoadID = nil; isLoading = false }
        }
        do {
            let loaded = try await container.invites.myInvites()
            guard !Task.isCancelled, activeLoadID == ticket, signedInID == userID else { return }
            invites = loaded
            needsInvite = false
        } catch InviteFlowError.needsInviteFirst {
            guard !Task.isCancelled, activeLoadID == ticket, signedInID == userID else { return }
            invites = []
            needsInvite = true
        } catch {
            guard !Task.isCancelled, activeLoadID == ticket, signedInID == userID else { return }
            loadMessage = InviteFailurePresentation.message(for: error)
        }
    }
}
