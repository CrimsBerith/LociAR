import AVFoundation
import SwiftUI
import SwiftData

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
            if isLoading { LociLoadingView(title: "Koleksiyonlar yükleniyor…") }
            else if collections.isEmpty {
                if let message {
                    LociEmptyState.failure(message: message, retry: retryAction)
                } else {
                    LociEmptyState(
                        title: "Henüz koleksiyon yok",
                        message: "Kaydettiğin postları özel koleksiyonlarda düzenleyebilirsin.",
                        symbol: "square.stack.3d.up",
                        actionTitle: "İlk koleksiyonu oluştur",
                        action: { showCreate = true }
                    )
                }
            } else {
                List {
                    if let message {
                        LociInlineNotice(title: "Bir sorun oluştu", message: message, symbol: "exclamationmark.triangle.fill", color: .orange)
                            .listRowBackground(Color.clear)
                    }
                    ForEach(collections) { collection in
                    NavigationLink {
                        CollectionDetailView(collection: collection)
                    } label: {
                        HStack(spacing: 13) {
                            ZStack {
                                RoundedRectangle(cornerRadius: 10).fill(Color.purple.opacity(0.16)).frame(width: 42, height: 42)
                                Image(systemName: "folder.fill").foregroundStyle(.purple)
                            }
                            VStack(alignment: .leading, spacing: 3) {
                                Text(collection.title).font(.headline)
                                Text("Özel koleksiyon").font(.caption).foregroundStyle(.secondary)
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
            Button("Vazgeç", role: .cancel) {}
        }
        .task { await load() }
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
        guard case let .signedIn(user) = session.phase, container.isBackendConfigured else {
            message = "Koleksiyonlar için sunucu bağlantısı gerekiyor."
            return
        }
        do { collections = try await container.social.collections(for: user.id) }
        catch { message = "Koleksiyonlar şu anda yüklenemiyor." }
    }

    private func create() async {
        let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard case let .signedIn(user) = session.phase, container.isBackendConfigured, !cleanTitle.isEmpty else { return }
        guard cleanTitle.count <= 80 else { message = "Koleksiyon başlığı en fazla 80 karakter olabilir."; return }
        message = nil
        do {
            let created = try await container.social.createCollection(title: cleanTitle, userID: user.id)
            collections.insert(created, at: 0)
            title = ""
            message = nil
        } catch { message = "Koleksiyon oluşturulamadı. Biraz sonra tekrar dene." }
    }
}

struct CollectionDetailView: View {
    @Environment(AppSession.self) private var session
    @Environment(AppContainer.self) private var container
    let collection: LociCollection
    @State private var posts: [LociPost] = []
    @State private var isLoading = true
    @State private var message: String?

    var body: some View {
        Group {
            if isLoading {
                LociLoadingView(title: "Koleksiyon yükleniyor…")
            } else if posts.isEmpty {
                if let message {
                    // A failed load must not read as an empty collection.
                    LociEmptyState.failure(message: message, retry: { Task { await load() } })
                } else {
                    LociEmptyState(
                        title: "Bu koleksiyon boş",
                        message: "Beğendiğin veya kaydettiğin postları detayından bu koleksiyona ekleyebilirsin.",
                        symbol: "folder.badge.plus"
                    )
                }
            } else {
                List {
                    if let message {
                        LociInlineNotice(title: "Bazı postlar gösterilemiyor", message: message, symbol: "exclamationmark.triangle.fill", color: .orange)
                            .listRowBackground(Color.clear)
                    }
                    ForEach(posts) { post in
                        NavigationLink {
                            PostPreviewView(post: post)
                        } label: {
                            HStack(spacing: 12) {
                                LociAvatar(handle: String(post.creatorID.uuidString.prefix(6)), size: 36)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(post.caption.isEmpty ? "Mekânsal post".localizedUI : post.caption)
                                        .font(.subheadline.bold())
                                        .lineLimit(2)
                                    Text(post.anchorBundle.anchor.pinQuality.isPhysicalSurface ? "Fiziksel yüzey" : "Yaklaşık")
                                        .font(.caption2)
                                        .foregroundStyle(post.anchorBundle.anchor.pinQuality.isPhysicalSurface ? LociTheme.accent : .orange)
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
        isLoading = posts.isEmpty
        message = nil
        defer { isLoading = false }
        do {
            let postIDs = try await container.social.postIDs(in: collection.id)
            var loadedPosts: [LociPost] = []
            var failedCount = 0
            for id in postIDs {
                do {
                    // nil = removed, hidden or blocked: intentionally skipped. A throw is a real failure.
                    if let post = try await container.posts.publicPost(id: id) { loadedPosts.append(post) }
                } catch {
                    failedCount += 1
                }
            }
            posts = loadedPosts
            if failedCount > 0 {
                message = loadedPosts.isEmpty ? "Postlar yüklenemedi." : String(localized: "\(failedCount) post şu anda yüklenemedi. Yenilemek için aşağı çek.")
            }
        } catch {
            message = "Postlar yüklenemedi."
        }
    }

    private func remove(post: LociPost) async {
        do {
            try await container.social.remove(postID: post.id, from: collection.id)
            withAnimation {
                posts.removeAll { $0.id == post.id }
            }
        } catch {
            message = "Post koleksiyondan çıkarılamadı."
        }
    }
}

struct SavedPostsView: View {
    @Environment(AppSession.self) private var session
    @Environment(AppContainer.self) private var container
    @State private var posts: [LociPost] = []
    @State private var message: String?
    @State private var isLoading = true
    var body: some View {
        Group {
            if isLoading { LociLoadingView(title: "Kaydedilenler yükleniyor…") }
            else if posts.isEmpty {
                LociEmptyState(title: "Kaydedilen post yok", message: message ?? "Kaydettiğin postlar burada görünür.", symbol: "bookmark", actionTitle: message == nil || !container.isBackendConfigured ? nil : "Tekrar dene", action: message == nil ? nil : { Task { await load() } })
            } else {
                List(posts) { post in
                    NavigationLink(value: post) { PostCard(post: post) }
                        .listRowBackground(Color.clear).listRowSeparator(.hidden)
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
        isLoading = posts.isEmpty
        message = nil
        defer { isLoading = false }
        guard case let .signedIn(user) = session.phase, container.isBackendConfigured else {
            message = "Kaydedilenler için sunucu bağlantısı gerekiyor."
            return
        }
        do {
            let ids = try await container.social.savedPostIDs(for: user.id)
            guard !ids.isEmpty else {
                posts = []
                return
            }
            // nil post = removed or hidden (skipped); a thrown error = could not load (reported).
            let loaded = await withTaskGroup(of: (Int, LociPost?, Bool).self) { group in
                for (index, id) in ids.enumerated() {
                    group.addTask {
                        do { return (index, try await container.posts.publicPost(id: id), false) }
                        catch { return (index, nil, true) }
                    }
                }
                var results: [(Int, LociPost)] = []
                var failures = 0
                for await (index, post, failed) in group {
                    if let post { results.append((index, post)) }
                    if failed { failures += 1 }
                }
                return (results.sorted { $0.0 < $1.0 }.map(\.1), failures)
            }
            posts = loaded.0
            if loaded.1 > 0 {
                message = "Kaydedilen postların bir kısmı yüklenemedi. Yenilemek için aşağı çek."
            }
        } catch { message = "Kaydedilen postlar şu anda yüklenemiyor." }
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
            if isLoading { LociLoadingView(title: "Engellenen hesaplar yükleniyor…") }
            else if ids.isEmpty {
                LociEmptyState(title: "Engellenen hesap yok", message: message ?? "Engellediğin hesaplar burada görünür.", symbol: "person.crop.circle.badge.xmark", actionTitle: message == nil || !container.isBackendConfigured ? nil : "Tekrar dene", action: message == nil ? nil : { Task { await load() } })
            } else {
                List(ids, id: \.self) { id in
                    HStack(spacing: 12) {
                        LociAvatar(handle: "E", size: 42)
                        Text("Engellenen hesap").font(.headline)
                        Spacer()
                        Button("Engeli kaldır") { Task { await unblock(id) } }.buttonStyle(.bordered).controlSize(.small)
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
            message = "Engellenen hesaplar için sunucu bağlantısı gerekiyor."
            return
        }
        do { ids = try await container.social.blockedUserIDs(for: user.id) }
        catch { message = "Engellenen hesaplar şu anda yüklenemiyor." }
    }
    private func unblock(_ id: UUID) async {
        guard case let .signedIn(user) = session.phase, container.isBackendConfigured else { return }
        do {
            try await container.social.setBlocked(false, targetID: id, userID: user.id)
            ids.removeAll { $0 == id }
            message = nil
        } catch { message = "Engel kaldırılamadı. Tekrar dene." }
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
    @State private var isLoading = true
    @State private var isRetrying = false
    @State private var postToDelete: LociPost?
    @State private var deleteError: String?
    @State private var isDeleting = false

    var body: some View {
        Group {
            if isLoading { LociLoadingView(title: "Postların yükleniyor…") }
            else if posts.isEmpty {
                LociEmptyState(title: "Henüz post yok", message: message ?? "Yayınlanan ve incelemedeki postların burada görünür.", symbol: "rectangle.stack.badge.plus", actionTitle: message == nil || !container.isBackendConfigured ? nil : "Tekrar dene", action: message == nil ? nil : { Task { await load() } })
            } else {
                List(posts) { post in
                    NavigationLink(value: post) {
                        VStack(alignment: .leading, spacing: 8) {
                            if failedIDs.contains(post.id) {
                                LociStatusPill(title: "İşlem gerekiyor", symbol: "exclamationmark.triangle.fill", color: .red)
                            } else if pendingIDs.contains(post.id) {
                                LociStatusPill(title: "Yayın bekliyor", symbol: "arrow.triangle.2.circlepath", color: .orange)
                            } else if post.status == .pendingReview {
                                LociStatusPill(title: "İncelemede", symbol: "clock.fill", color: .orange)
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
                .lociListStyle().refreshable { await load() }
            }
        }
        .background(LociScreenBackground())
        .navigationTitle("Postlarım")
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
        .task { await load() }
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
            Text("Post Keşfet, profil ve AR listesinden kaldırılır.")
        }
        .alert("Post silinemedi", isPresented: Binding(
            get: { deleteError != nil },
            set: { if !$0 { deleteError = nil } }
        )) {
            Button("Tamam", role: .cancel) {}
        } message: {
            Text((deleteError ?? "").localizedUI)
        }
    }

    private func load() async {
        isLoading = posts.isEmpty
        message = nil
        defer { isLoading = false }
        guard case let .signedIn(user) = session.phase else {
            posts = []
            pendingIDs = []
            failedIDs = []
            message = "Postları görmek için tekrar giriş yap."
            return
        }
        let localPosts = loadLocalDrafts(ownerID: user.id)
        let queueDescriptor = FetchDescriptor<SyncQueueRecord>()
        let queues = ((try? modelContext.fetch(queueDescriptor)) ?? []).filter { $0.ownerID == user.id }
        failedIDs = Set(queues.filter { $0.deadLetterReason != nil }.map(\.id))
        pendingIDs = Set(localPosts.map(\.id)).subtracting(failedIDs)
        posts = localPosts
        if session.isLocalPreview {
            if posts.isEmpty { posts = [UITestFixtures.post] }
            return
        }
        guard container.isBackendConfigured else { message = "Postların için sunucu bağlantısı gerekiyor."; return }
        do {
            let remotePosts = try await container.posts.myPosts(limit: 50)
            let remoteIDs = Set(remotePosts.map(\.id))
            pendingIDs.subtract(remoteIDs)
            failedIDs.subtract(remoteIDs)
            posts = (remotePosts + localPosts.filter { !remoteIDs.contains($0.id) })
                .sorted { $0.createdAt > $1.createdAt }
        } catch {
            message = localPosts.isEmpty ? "Postların şu anda yüklenemiyor." : "Bekleyen post cihazda güvende. Yayını tekrar deneyebilirsin."
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
                try await container.posts.removeOwnPost(id: post.id)
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
            deleteError = "Post şu anda silinemiyor. Bağlantını kontrol edip tekrar dene."
        }
    }
}
