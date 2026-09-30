import AVFoundation
import SwiftUI
import SwiftData

struct DiscoverView: View {
    @Environment(AppSession.self) private var session
    @Environment(AppContainer.self) private var container
    @Environment(\.modelContext) private var modelContext
    @State private var posts: [LociPost] = []
    @State private var query = ""
    @State private var message: String?
    @State private var isLoading = true

    var body: some View {
        Group {
            if isLoading {
                LociLoadingView(title: "Keşfet hazırlanıyor…")
            } else if filteredPosts.isEmpty {
                LociEmptyState(
                    title: query.isEmpty ? "Henüz içerik yok" : "Sonuç bulunamadı",
                    message: message ?? (query.isEmpty ? "Yeni mekânsal postlar burada görünecek." : "Farklı bir kelimeyle tekrar ara."),
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
        .searchable(text: $query, prompt: "Kişi, yer veya içerik")
        .task { await load() }
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
            message = posts.isEmpty ? "Bağlantı ayarları tamamlandığında içerikler burada görünecek." : nil
            return
        }
        do { posts = mergedDiscoverPosts(local + (try await container.posts.discover())) }
        catch {
            posts = local
            message = posts.isEmpty ? "İçerikler şu anda yüklenemiyor. Biraz sonra tekrar dene." : nil
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
}

struct ActivityView: View {
    @Environment(AppSession.self) private var session
    @Environment(AppContainer.self) private var container
    @State private var items: [SocialActivity] = []
    @State private var message: String?
    @State private var isLoading = true

    var body: some View {
        Group {
            if isLoading {
                LociLoadingView(title: "Aktiviteler yükleniyor…")
            } else if items.isEmpty {
                LociEmptyState(
                    title: "Henüz aktivite yok",
                    message: message ?? "Beğeni, yorum ve takip bildirimleri burada görünür.",
                    symbol: "bell.slash",
                    actionTitle: session.isLocalPreview || message == nil || !container.isBackendConfigured ? nil : "Tekrar dene",
                    action: session.isLocalPreview || message == nil ? nil : { Task { await load() } }
                )
            } else {
                List(items) { item in
                    HStack(spacing: 13) {
                        ZStack {
                            Circle().fill(LociTheme.accent.opacity(0.12)).frame(width: 42, height: 42)
                            Image(systemName: symbol(for: item.kind)).foregroundStyle(LociTheme.accent)
                        }
                        VStack(alignment: .leading, spacing: 4) {
                            Text(item.body).font(.headline)
                            Text(item.createdAt, style: .relative).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        if item.readAt == nil {
                            Circle().fill(LociTheme.accent).frame(width: 7, height: 7)
                                .accessibilityLabel("Okunmadı")
                        }
                    }
                    .accessibilityElement(children: .combine)
                    .padding(.vertical, 5)
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                }
                .lociListStyle()
                .refreshable { await load() }
            }
        }
        .background(LociScreenBackground())
        .navigationTitle("Aktivite")
        .task { await load() }
        .accessibilityIdentifier("screen-activity")
    }

    private func load() async {
        isLoading = items.isEmpty
        message = nil
        defer { isLoading = false }
        if session.isLocalPreview {
            message = "Cihaz test modunda yeni aktivite bulunmuyor."
            return
        }
        guard case let .signedIn(user) = session.phase, container.isBackendConfigured else {
            message = "Aktiviteler için sunucu bağlantısı gerekiyor."
            return
        }
        do { items = try await container.social.activity(for: user.id) }
        catch { message = "Aktiviteler şu anda yüklenemiyor. Biraz sonra tekrar dene." }
    }

    private func symbol(for kind: String) -> String {
        ["like": "heart.fill", "comment": "bubble.right.fill", "follow": "person.badge.plus", "save": "bookmark.fill"][kind] ?? "bell.fill"
    }
}

struct ProfileView: View {
    @Environment(AppSession.self) private var session
    @Environment(AppContainer.self) private var container
    @Environment(\.modelContext) private var modelContext
    let user: LociUser
    @State private var confirmDeletion = false
    @State private var showEditProfile = false
    @State private var message: String?
    @State private var isDeletingAccount = false

    var body: some View {
        List {
            Section {
                HStack(spacing: 16) {
                    LociAvatar(handle: user.handle, avatarURL: user.avatarURL, size: 66)
                    VStack(alignment: .leading, spacing: 5) {
                        Text("@\(user.handle)").font(.title3.bold())
                        if let email = user.email { Text(email).font(.caption).foregroundStyle(.secondary) }
                        LociStatusPill(title: "Hesap aktif", symbol: "checkmark.seal.fill", color: LociTheme.accent)
                    }
                    Spacer()
                    Button {
                        showEditProfile = true
                    } label: {
                        Image(systemName: "pencil.circle.fill")
                            .font(.title2)
                            .foregroundStyle(LociTheme.accent)
                            .frame(minWidth: 44, minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Profili düzenle")
                    .accessibilityIdentifier("profile-edit-button")
                }.padding(.vertical, 8)
            }
            Section {
                NavigationLink { MyPostsView() } label: { ProfileLinkRow(title: "Postlarım", symbol: "rectangle.stack.fill", color: LociTheme.accent) }
                NavigationLink { ActivityView() } label: {
                    ProfileLinkRow(title: "Aktivite", symbol: "bell.fill", color: .orange)
                }
                .accessibilityIdentifier("profile-activity")
                NavigationLink { CollectionsView() } label: { ProfileLinkRow(title: "Koleksiyonlar", symbol: "square.stack.3d.up.fill", color: .purple) }
                NavigationLink { SavedPostsView() } label: { ProfileLinkRow(title: "Kaydedilenler", symbol: "bookmark.fill", color: .blue) }
            } header: {
                profileSectionText("İçerik")
            }
            Section {
                NavigationLink { BlockedUsersView() } label: { ProfileLinkRow(title: "Engellenen hesaplar", symbol: "person.crop.circle.badge.xmark", color: .orange) }
            } header: {
                profileSectionText("Gizlilik ve güvenlik")
            }
            Section {
                if let url = container.configuration.privacyPolicyURL {
                    Link("Gizlilik politikası", destination: url)
                        .accessibilityIdentifier("profile-privacy")
                }
                if let url = container.configuration.termsURL {
                    Link("Kullanım koşulları", destination: url)
                        .accessibilityIdentifier("profile-terms")
                }
                if let url = container.configuration.supportURL {
                    Link("Destek", destination: url)
                        .accessibilityIdentifier("profile-support")
                }
            } header: {
                profileSectionText("Yasal")
            }
#if DEBUG
            Section {
                NavigationLink { ARCoreCoverageDebugView() } label: {
                    ProfileLinkRow(title: "ARCore kapsam kontrolü (debug)", symbol: "globe.europe.africa", color: .blue)
                }
                .accessibilityIdentifier("profile-debug-arcore")
            }
#endif
            Section {
                Button(role: .destructive) { Task { await session.signOut() } } label: {
                    Label("Çıkış yap", systemImage: "rectangle.portrait.and.arrow.right")
                }
                    .disabled(isDeletingAccount)
                    .accessibilityIdentifier("profile-sign-out")
                Button(role: .destructive) { confirmDeletion = true } label: {
                    Label("Hesabı kalıcı olarak sil", systemImage: "trash")
                }
                    .disabled(isDeletingAccount)
                    .accessibilityIdentifier("profile-delete-account")
            } footer: {
                profileSectionText("Hesap silme işlemi geri alınamaz.")
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(LociScreenBackground())
        .navigationTitle("Profil")
        .alert("Hesabı kalıcı olarak sil?", isPresented: $confirmDeletion) {
            Button("Hesabı sil", role: .destructive) { Task { await deleteAccount() } }
            Button("Vazgeç", role: .cancel) {}
        } message: { Text("Postlarınız ve sosyal verileriniz sunucudan silinir. Bu işlem geri alınamaz.") }
        .alert("Hesap silinemedi", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })) {
            Button("Tamam", role: .cancel) {}
        } message: { Text(message ?? "") }
        .sheet(isPresented: $showEditProfile) {
            ProfileEditView(user: user)
        }
        .accessibilityIdentifier("screen-profile")
    }

    private func profileSectionText(_ value: String) -> some View {
        Text(value)
            .foregroundStyle(.white)
            .textCase(nil)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func deleteAccount() async {
        guard !isDeletingAccount else { return }
        isDeletingAccount = true
        defer { isDeletingAccount = false }
        do {
            try await session.deleteAccount()
        } catch AuthFlowError.appleReauthenticationRequired {
            message = AuthFlowError.appleReauthenticationRequired.localizedDescription
            return
        } catch {
            message = "Hesap şu anda silinemiyor. Biraz sonra tekrar dene."
            return
        }
        // Account deleted server-side. Clean up local data best-effort — the view may be
        // dismissing already (Auth state listener fires before we get here).
        try? modelContext.delete(model: DraftRecord.self)
        try? modelContext.delete(model: SyncQueueRecord.self)
        try? modelContext.delete(model: PreferenceRecord.self)
        try? modelContext.save()
        await MediaAssetStore.purgeAllLocalAssets()
    }
}

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
                                    Text(post.caption.isEmpty ? "Mekânsal post" : post.caption)
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
                message = loadedPosts.isEmpty ? "Postlar yüklenemedi." : "\(failedCount) post şu anda yüklenemedi. Yenilemek için aşağı çek."
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
            let loaded = await withTaskGroup(of: (Int, LociPost?).self) { group in
                for (index, id) in ids.enumerated() {
                    group.addTask {
                        let post = try? await container.posts.publicPost(id: id)
                        return (index, post)
                    }
                }
                var results: [(Int, LociPost)] = []
                for await (index, post) in group {
                    if let post { results.append((index, post)) }
                }
                return results.sorted { $0.0 < $1.0 }.map(\.1)
            }
            posts = loaded
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
            Text(deleteError ?? "")
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

struct PublicProfileView: View {
    @Environment(AppSession.self) private var session
    @Environment(AppContainer.self) private var container
    let user: LociUser
    @State private var profile: PublicProfileProjection?
    @State private var posts: [LociPost] = []
    @State private var following = false
    @State private var message: String?
    @State private var isLoading = true
    @State private var isFollowMutating = false
    @State private var isBlockMutating = false
    @State private var isBlocked = false
    @State private var confirmBlock = false
    @State private var reportingUser = false

    var body: some View {
        List {
            Section {
                VStack(spacing: 14) {
                    LociAvatar(handle: profile?.handle ?? user.handle, avatarURL: isBlocked ? nil : profile?.avatarURL, size: 78)
                    VStack(spacing: 5) {
                        Text("@\(profile?.handle ?? user.handle)").font(.title2.bold())
                        if let bio = profile?.bio, !bio.isEmpty { Text(bio).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center) }
                    }
                    HStack(spacing: 22) {
                        profileMetric(value: profile?.publicPostCount ?? posts.count, label: "Post")
                        profileMetric(value: profile?.followerCount ?? 0, label: "Takipçi")
                    }
                    Button(following ? "Takibi bırak" : "Takip et") { Task { await toggleFollow() } }
                        .buttonStyle(.borderedProminent).tint(following ? .white.opacity(0.16) : LociTheme.accent)
                        .foregroundStyle(following ? .white : .black).frame(maxWidth: .infinity)
                        .disabled(isFollowMutating || isBlockMutating || isBlocked)
                    if isBlocked {
                        Text("Bu kullanıcıyı engelledin. İçerikleri gizlendi; engeli Profil > Engellenenler'den kaldırabilirsin.")
                            .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    } else {
                        Button("Kullanıcıyı engelle", role: .destructive) { confirmBlock = true }
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .disabled(isFollowMutating || isBlockMutating)
                            .accessibilityIdentifier("profile-block-user")
                    }
                    Button("Kullanıcıyı bildir") { reportingUser = true }
                        .font(.footnote)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .accessibilityIdentifier("profile-report-user")
                    if let message, !posts.isEmpty {
                        Text(message).font(.caption).foregroundStyle(.secondary)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
            }
            Section("Paylaşımlar") {
                if isLoading { HStack { Spacer(); ProgressView().tint(LociTheme.accent); Spacer() }.padding() }
                else if posts.isEmpty { LociEmptyState(title: "Henüz paylaşım yok", message: message ?? "Bu hesap henüz bir post paylaşmadı.", symbol: "rectangle.stack") }
                ForEach(posts) { post in
                    NavigationLink(value: post) { PostCard(post: post) }.listRowBackground(Color.clear).listRowSeparator(.hidden)
                }
            }
        }
        .listStyle(.insetGrouped).scrollContentBackground(.hidden).background(LociScreenBackground())
        .navigationTitle("Profil")
        .navigationDestination(for: LociPost.self) { PostPreviewView(post: $0) }
        .refreshable { await load() }
        .task { await load() }
        .confirmationDialog("Kullanıcı engellensin mi?", isPresented: $confirmBlock, titleVisibility: .visible) {
            Button("Engelle", role: .destructive) { Task { await block() } }
            Button("Vazgeç", role: .cancel) {}
        } message: {
            Text("Bu kullanıcının postlarını ve yorumlarını görmezsin; seni takip edemez, postlarına yorum yapamaz.")
        }
        .confirmationDialog("Neden bildiriyorsun?", isPresented: $reportingUser, titleVisibility: .visible) {
            ForEach(ReportReason.allCases) { reason in
                Button(reason.rawValue) { Task { await reportUser(reason) } }
            }
            Button("Vazgeç", role: .cancel) {}
        }
    }

    private func reportUser(_ reason: ReportReason) async {
        guard case let .signedIn(viewer) = session.phase, container.isBackendConfigured else { return }
        do {
            try await container.social.reportUser(targetID: user.id, userID: viewer.id, reason: reason.rawValue)
            message = "Bildirimin incelemeye gönderildi. Teşekkürler."
        } catch {
            message = "Bildirim gönderilemedi."
        }
    }

    private func load() async {
        isLoading = true
        message = nil
        defer { isLoading = false }
        if UITestFixtures.sampleContentEnabled || session.isLocalPreview {
            profile = PublicProfileProjection(
                id: UITestFixtures.creator.id, handle: UITestFixtures.creator.handle, avatarURL: nil,
                bio: "Şehrin unutulan hikâyelerini yüzeylere bırakıyorum.", publicPostCount: 1,
                followerCount: 248, followingCount: 73
            )
            posts = [UITestFixtures.post]
            return
        }
        guard container.isBackendConfigured else { message = "Sunucu bağlantısı henüz hazır değil."; return }
        do {
            async let loadedProfile = container.posts.publicProfile(creatorID: user.id)
            async let loadedPosts = container.posts.publicPosts(creatorID: user.id, limit: 60)
            (profile, posts) = try await (loadedProfile, loadedPosts)
            if case let .signedIn(viewer) = session.phase {
                following = (try await container.social.followingIDs(for: viewer.id)).contains(user.id)
            }
        } catch { message = "Profil şu anda yüklenemiyor." }
    }

    private func toggleFollow() async {
        guard !isFollowMutating, !isBlockMutating else { return }
        guard case let .signedIn(viewer) = session.phase, container.isBackendConfigured else { return }
        isFollowMutating = true
        defer { isFollowMutating = false }
        do { try await container.social.setFollowing(!following, targetID: user.id, userID: viewer.id); following.toggle() }
        catch { message = "Takip durumu güncellenemedi." }
    }

    private func block() async {
        guard !isBlockMutating, !isFollowMutating else { return }
        guard case let .signedIn(viewer) = session.phase, container.isBackendConfigured else { return }
        isBlockMutating = true
        defer { isBlockMutating = false }
        do {
            try await container.social.setBlocked(true, targetID: user.id, userID: viewer.id)
            isBlocked = true
            following = false
            posts = []
            message = "Kullanıcı engellendi."
        } catch {
            message = "Hesap engellenemedi. Tekrar dene."
        }
    }

    private func profileMetric(value: Int, label: String) -> some View {
        VStack(spacing: 2) { Text("\(value)").font(.headline); Text(label).font(.caption).foregroundStyle(.secondary) }
    }
}

/// Reasons offered when reporting a post, comment or user (Guideline 1.2).
enum ReportReason: String, CaseIterable, Identifiable {
    case spam = "Spam veya yanıltıcı"
    case harassment = "Taciz veya zorbalık"
    case hate = "Nefret söylemi"
    case sexual = "Cinsel içerik"
    case violence = "Şiddet veya tehlikeli içerik"
    case other = "Diğer"
    var id: String { rawValue }
}

enum ReportTarget: Identifiable {
    case post
    case comment(LociComment)
    var id: String {
        switch self {
        case .post: "post"
        case .comment(let comment): comment.id.uuidString
        }
    }
}

struct PostPreviewView: View {
    @Environment(AppSession.self) private var session
    @Environment(AppContainer.self) private var container
    @Environment(\.openURL) private var openURL
    @Environment(\.dismiss) private var dismiss
    let post: LociPost
    @State private var comments: [LociComment] = []
    @State private var commentText = ""
    @State private var saved = false
    @State private var liked = false
    @State private var likeCount: Int
    @State private var viewCount: Int
    @State private var didCountView = false
    @State private var collections: [LociCollection] = []
    @State private var message: String?
    @State private var showAR = false
    @State private var isLoading = true
    @State private var isLikeMutating = false
    @State private var isSaveMutating = false
    @State private var isCommentSending = false
    @State private var isReporting = false
    @State private var reportTarget: ReportTarget?
    @State private var confirmBlock = false
    // Bumped on user actions only, so loading server state never fires a haptic.
    @State private var likeTaps = 0
    @State private var saveTaps = 0
    @State private var commentsSent = 0

    init(post: LociPost) {
        self.post = post
        _likeCount = State(initialValue: post.counts.likes)
        _viewCount = State(initialValue: post.counts.views)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                PostCard(post: post, likeCount: likeCount, viewCount: viewCount, openMedia: post.contentSource?.externalMedia.map { external in
                    {
                        openURL(external.platform.appLaunchURL) { accepted in
                            if !accepted { openURL(external.url) }
                        }
                    }
                })
                NavigationLink {
                    PublicProfileView(user: creatorUser)
                } label: {
                    HStack(spacing: 10) {
                        LociAvatar(handle: creatorUser.handle, size: 36)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("@\(creatorUser.handle)").font(.subheadline.weight(.semibold))
                            Text("Profili görüntüle").font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Image(systemName: "chevron.right").font(.caption).foregroundStyle(.secondary)
                    }
                    .padding(12).background(LociTheme.field, in: RoundedRectangle(cornerRadius: 16))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("post-open-profile")
                LociInlineNotice(
                    title: post.anchorBundle.anchor.pinQuality.isPhysicalSurface ? "Konuma bağlı AR" : "Yaklaşık yerleştirme",
                    message: post.anchorBundle.anchor.pinQuality.isPhysicalSurface
                        ? "AR görünümü yalnız postun kaydedildiği konumda açılır."
                        : "Bu içerik fiziksel bir yüzeye kilitli değildir.",
                    symbol: post.anchorBundle.anchor.pinQuality.isPhysicalSurface ? "location.fill.viewfinder" : "exclamationmark.triangle.fill",
                    color: post.anchorBundle.anchor.pinQuality.isPhysicalSurface ? LociTheme.accent : .orange
                )
                HStack(spacing: 10) {
                    Button { Task { await toggleLike() } } label: {
                        PostActionLabel(title: liked ? "Beğenildi" : "Beğen", symbol: liked ? "heart.fill" : "heart", color: liked ? .pink : .white, effectValue: liked)
                    }
                    .buttonStyle(.plain)
                    .disabled(isLikeMutating)
                    .accessibilityIdentifier("post-like-button")
                    Button { Task { await toggleSaved() } } label: {
                        PostActionLabel(title: saved ? "Kaydedildi" : "Kaydet", symbol: saved ? "bookmark.fill" : "bookmark", color: saved ? LociTheme.accent : .white, effectValue: saved)
                    }
                    .buttonStyle(.plain)
                    .disabled(isSaveMutating)
                    .accessibilityIdentifier("post-save-button")
                    Button { reportTarget = .post } label: {
                        PostActionLabel(title: "Bildir", symbol: "exclamationmark.bubble", color: .white)
                    }
                    .buttonStyle(.plain)
                    .disabled(isReporting)
                    .accessibilityIdentifier("post-report")
                    Menu {
                        Button(role: .destructive) { confirmBlock = true } label: {
                            Label("Kullanıcıyı engelle", systemImage: "person.crop.circle.badge.xmark")
                        }
                        .accessibilityIdentifier("post-block-user")
                    } label: {
                        Image(systemName: "ellipsis.circle")
                            .font(.title3)
                            .foregroundStyle(.secondary)
                            .frame(minWidth: 44, minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .accessibilityIdentifier("post-more-menu")
                    if !collections.isEmpty {
                        Menu("Koleksiyona ekle") {
                            ForEach(collections) { collection in Button(collection.title) { Task { await add(to: collection) } } }
                        }
                    }
                }

                LociSectionLabel(title: "Yorumlar", symbol: "bubble.left.and.bubble.right")
                if isLoading {
                    ProgressView().tint(LociTheme.accent).frame(maxWidth: .infinity).padding()
                } else if comments.isEmpty {
                    Text("İlk yorumu sen yaz.").font(.subheadline).foregroundStyle(.secondary).padding(.vertical, 6)
                } else {
                    ForEach(comments) { comment in
                        HStack(alignment: .top, spacing: 10) {
                            LociAvatar(handle: comment.username, size: 34)
                            VStack(alignment: .leading, spacing: 4) {
                                HStack { Text("@\(comment.username)").font(.caption.bold()); Text(comment.createdAt, style: .relative).font(.caption2).foregroundStyle(.secondary) }
                                Text(comment.text).font(.subheadline)
                            }
                            Spacer(minLength: 0)
                            Menu {
                                if !isMine(comment) {
                                    Button { reportTarget = .comment(comment) } label: {
                                        Label("Yorumu bildir", systemImage: "exclamationmark.bubble")
                                    }
                                }
                                if canDelete(comment) {
                                    Button(role: .destructive) { Task { await deleteComment(comment) } } label: {
                                        Label("Yorumu sil", systemImage: "trash")
                                    }
                                }
                            } label: {
                                Image(systemName: "ellipsis")
                                    .foregroundStyle(.secondary)
                                    .frame(minWidth: 44, minHeight: 44)
                                    .contentShape(Rectangle())
                            }
                            .accessibilityLabel("Yorum seçenekleri")
                            .accessibilityIdentifier("comment-actions")
                        }
                        .padding(.vertical, 4)
                        .accessibilityElement(children: .contain)
                    }
                }
                VStack(alignment: .trailing, spacing: 6) {
                    HStack(spacing: 10) {
                        TextField("Yorum yaz…", text: $commentText, axis: .vertical)
                            .lineLimit(1...4)
                            .padding(.horizontal, 13)
                            .padding(.vertical, 10)
                            .background(LociTheme.field, in: RoundedRectangle(cornerRadius: 14))
                        Button {
                            Task { await addComment() }
                        } label: {
                            if isCommentSending {
                                ProgressView().tint(LociTheme.accent)
                                    .frame(width: 44, height: 44)
                            } else {
                                Image(systemName: "paperplane.fill")
                                    .font(.headline)
                                    .foregroundStyle(commentText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? Color.secondary : LociTheme.accent)
                                    .frame(width: 44, height: 44)
                            }
                        }
                        .disabled(isCommentSending || commentText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        .accessibilityIdentifier("comment-submit")
                    }
                    if commentText.count > 400 {
                        Text("\(commentText.count)/500")
                            .font(.caption2)
                            .foregroundStyle(commentText.count > 500 ? .red : .secondary)
                    }
                }
                if let message { Text(message).font(.caption).foregroundStyle(.secondary) }
            }.padding()
        }
        .background(LociScreenBackground())
        .navigationTitle("Post")
        .navigationBarTitleDisplayMode(.inline)
        .sensoryFeedback(.selection, trigger: likeTaps)
        .sensoryFeedback(.selection, trigger: saveTaps)
        .sensoryFeedback(.success, trigger: commentsSent)
        .task { await load() }
        .safeAreaInset(edge: .bottom) {
            Button("AR’da aç", systemImage: "viewfinder") { showAR = true }
                .buttonStyle(LociPrimaryButtonStyle())
                .padding(.horizontal, 16).padding(.vertical, 9)
                .background(.ultraThinMaterial)
                .accessibilityIdentifier("post-open-ar")
        }
        .fullScreenCover(isPresented: $showAR) { ARPostViewerView(post: post) }
        .confirmationDialog(
            "Neden bildiriyorsun?",
            isPresented: Binding(get: { reportTarget != nil }, set: { if !$0 { reportTarget = nil } }),
            titleVisibility: .visible,
            presenting: reportTarget
        ) { target in
            ForEach(ReportReason.allCases) { reason in
                Button(reason.rawValue) { Task { await report(target, reason: reason) } }
            }
            Button("Vazgeç", role: .cancel) {}
        } message: { _ in
            Text("Bildirimler 24 saat içinde incelenir. İçeriği görmek istemiyorsan kullanıcıyı engelleyebilirsin.")
        }
        .confirmationDialog("@\(creatorUser.handle) engellensin mi?", isPresented: $confirmBlock, titleVisibility: .visible) {
            Button("Engelle", role: .destructive) { Task { await blockCreator() } }
            Button("Vazgeç", role: .cancel) {}
        } message: {
            Text("Bu kullanıcının postlarını ve yorumlarını görmezsin; seni takip edemez, postlarına yorum yapamaz.")
        }
    }

    private func isMine(_ comment: LociComment) -> Bool {
        if case let .signedIn(user) = session.phase { return comment.userID == user.id }
        return false
    }

    private func canDelete(_ comment: LociComment) -> Bool {
        guard case let .signedIn(user) = session.phase else { return false }
        return comment.userID == user.id || post.creatorID == user.id
    }

    private func deleteComment(_ comment: LociComment) async {
        guard container.isBackendConfigured || session.isLocalPreview else { return }
        do {
            try await container.social.deleteComment(id: comment.id)
            withAnimation { comments.removeAll { $0.id == comment.id } }
            message = "Yorum silindi."
        } catch {
            message = "Yorum silinemedi."
        }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        await recordViewIfNeeded()
        if UITestFixtures.sampleContentEnabled {
            comments = UITestFixtures.comments
            collections = []
            return
        }
        guard container.isBackendConfigured || session.isLocalPreview else { return }
        comments = (try? await container.social.comments(for: post.id)) ?? []
        if case let .signedIn(user) = session.phase {
            async let savedIDs = container.social.savedPostIDs(for: user.id)
            async let likedIDs = container.social.likedPostIDs(for: user.id)
            async let loadedLikeCount = container.social.likeCount(for: post.id)
            async let loadedCollections = container.social.collections(for: user.id)
            saved = ((try? await savedIDs) ?? []).contains(post.id)
            liked = ((try? await likedIDs) ?? []).contains(post.id)
            likeCount = (try? await loadedLikeCount) ?? likeCount
            collections = (try? await loadedCollections) ?? []
        }
    }
    private func toggleLike() async {
        guard !isLikeMutating else { return }
        guard case let .signedIn(user) = session.phase else { return }
        isLikeMutating = true
        defer { isLikeMutating = false }
        likeTaps += 1
        let next = !liked
        liked = next
        likeCount = max(0, likeCount + (next ? 1 : -1))
        if session.isLocalPreview { return }
        guard container.isBackendConfigured else {
            liked.toggle(); likeCount = max(0, likeCount + (next ? -1 : 1)); return
        }
        do { try await container.social.setLiked(next, postID: post.id, userID: user.id) }
        catch {
            liked.toggle()
            likeCount = max(0, likeCount + (next ? -1 : 1))
            message = "Beğeni güncellenemedi."
        }
    }

    private func recordViewIfNeeded() async {
        guard !didCountView else { return }
        didCountView = true
        if session.isLocalPreview { viewCount += 1; return }
        guard case let .signedIn(user) = session.phase else { return }
        if let authoritativeCount = try? await container.social.recordView(postID: post.id, userID: user.id) {
            viewCount = authoritativeCount
        }
    }
    private func toggleSaved() async {
        guard !isSaveMutating else { return }
        guard case let .signedIn(user) = session.phase, container.isBackendConfigured || session.isLocalPreview else { return }
        isSaveMutating = true
        defer { isSaveMutating = false }
        saveTaps += 1
        do { try await container.social.setSaved(!saved, postID: post.id, userID: user.id); saved.toggle() } catch { message = "Kaydetme durumu güncellenemedi." }
    }
    private func addComment() async {
        guard !isCommentSending else { return }
        guard case let .signedIn(user) = session.phase, container.isBackendConfigured || session.isLocalPreview else { return }
        let cleanText = commentText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanText.isEmpty, cleanText.count <= 500 else { message = "Yorum en fazla 500 karakter olabilir."; return }
        isCommentSending = true
        defer { isCommentSending = false }
        do {
            let comment = try await container.social.addComment(postID: post.id, user: user, text: cleanText)
            withAnimation(.spring(duration: 0.3)) {
                comments.append(comment)
            }
            commentsSent += 1
            commentText = ""
        } catch { message = "Yorum gönderilemedi." }
    }
    private func report(_ target: ReportTarget, reason: ReportReason) async {
        guard !isReporting else { return }
        guard case let .signedIn(user) = session.phase, container.isBackendConfigured else { return }
        isReporting = true
        defer { isReporting = false }
        do {
            switch target {
            case .post:
                try await container.social.report(postID: post.id, userID: user.id, reason: reason.rawValue)
                // Hide it for this reporter immediately, then leave the screen.
                await HiddenPostStore.shared.hide(post.id, owner: user.id.uuidString.lowercased())
                dismiss()
                return
            case .comment(let comment):
                try await container.social.reportComment(comment, userID: user.id, reason: reason.rawValue)
                withAnimation { comments.removeAll { $0.id == comment.id } }
            }
            message = "Bildirimin incelemeye gönderildi. Teşekkürler."
        } catch {
            message = "Bildirim gönderilemedi."
        }
    }
    private func blockCreator() async {
        guard !isReporting else { return }
        guard case let .signedIn(user) = session.phase, container.isBackendConfigured else { return }
        isReporting = true
        defer { isReporting = false }
        do {
            try await container.social.setBlocked(true, targetID: post.creatorID, userID: user.id)
            // The creator's content must disappear right away, including this screen.
            dismiss()
        } catch {
            message = "Kullanıcı engellenemedi."
        }
    }
    private func add(to collection: LociCollection) async {
        guard container.isBackendConfigured else { return }
        do { try await container.social.add(postID: post.id, to: collection.id); message = "\(collection.title) koleksiyonuna eklendi." }
        catch { message = "Koleksiyona eklenemedi." }
    }

    private var creatorUser: LociUser {
        LociUser(id: post.creatorID, handle: post.creatorHandle ?? "loci")
    }
}

private struct PostCard: View {
    let post: LociPost
    var likeCount: Int? = nil
    var viewCount: Int? = nil
    var openMedia: (() -> Void)? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                LociAvatar(handle: post.creatorHandle ?? "Loci", size: 36)
                VStack(alignment: .leading, spacing: 1) {
                    Text(post.creatorHandle.map { "@\($0)" } ?? "Loci")
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                        .truncationMode(.tail)
                    Text(post.createdAt, style: .relative).font(.caption2).foregroundStyle(.secondary)
                }
                .layoutPriority(1)
                Spacer()
                LociStatusPill(
                    title: post.anchorBundle.anchor.pinQuality == .freeSpaceApproximate ? "Yaklaşık" : "Sabit",
                    symbol: post.anchorBundle.anchor.pinQuality.isPhysicalSurface ? "viewfinder" : "exclamationmark",
                    color: post.anchorBundle.anchor.pinQuality.isPhysicalSurface ? LociTheme.accent : .orange
                )
            }
            Text(post.caption.isEmpty ? "Mekânsal post" : post.caption)
                .font(.body.weight(.semibold))
                .lineLimit(4)
                .foregroundStyle(.white.opacity(0.94))

            PostMediaHero(post: post, openMedia: openMedia)

            HStack(spacing: 18) {
                LociMetricLabel(value: likeCount ?? post.counts.likes, title: "beğeni", symbol: "heart.fill", color: .pink)
                LociMetricLabel(value: viewCount ?? post.counts.views, title: "görüntülenme", symbol: "eye.fill", color: LociTheme.accent)
                LociMetricLabel(value: post.counts.comments, title: "yorum", symbol: "bubble.right.fill", color: .white.opacity(0.8))
                Spacer()
            }
        }
        .padding(17)
        .background(LociTheme.surface.opacity(0.94), in: RoundedRectangle(cornerRadius: 21, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 21, style: .continuous).stroke(LociTheme.hairline))
        .accessibilityElement(children: .contain)
    }

}

private struct PostMediaHero: View {
    let post: LociPost
    var openMedia: (() -> Void)? = nil

    @ViewBuilder var body: some View {
        switch post.contentSource {
        case .image(let url):
            imagePreview(url: url)
        case .video(let url):
            VideoPreviewHero(url: url)
        case .some(let source) where source.externalMedia != nil:
            if let external = source.externalMedia {
                Group {
                    if let openMedia {
                        Button(action: openMedia) {
                            externalMediaBanner(external: external)
                        }
                        .buttonStyle(.plain)
                    } else {
                        externalMediaBanner(external: external)
                    }
                }
            }
        default:
            if let imageURL = post.editData.layers.first(where: { $0.kind == .image })?.assetURL {
                imagePreview(url: imageURL)
            }
        }
    }

    private func imagePreview(url: URL) -> some View {
        AsyncImage(url: url) { phase in
            if let image = phase.image {
                image.resizable().scaledToFill()
            } else {
                mediaPlaceholder(symbol: "photo.fill", title: "Fotoğraf")
            }
        }
        .frame(maxWidth: .infinity, minHeight: 128, maxHeight: 190)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func externalMediaBanner(external: (platform: ExternalMediaPlatform, url: URL)) -> some View {
        HStack(spacing: 14) {
            BrandLogoView(platform: external.platform, size: 42)
            VStack(alignment: .leading, spacing: 3) {
                Text(external.platform.rawValue).font(.headline)
                Text("Paylaşımı görüntüle").font(.caption).foregroundStyle(.white.opacity(0.66))
            }
            Spacer()
            Image(systemName: "arrow.up.right").font(.subheadline.weight(.bold))
        }
        .foregroundStyle(.white)
        .padding(15)
        .background(
            LinearGradient(
                colors: [external.platform.brandColor.opacity(0.34), external.platform.brandColor.opacity(0.10)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 16, style: .continuous)
        )
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(external.platform.brandColor.opacity(0.28)))
    }

    private func mediaPlaceholder(symbol: String, title: String) -> some View {
        ZStack {
            LinearGradient(colors: [LociTheme.elevated, LociTheme.background], startPoint: .topLeading, endPoint: .bottomTrailing)
            VStack(spacing: 8) {
                Image(systemName: symbol).font(.title2).foregroundStyle(LociTheme.accent)
                Text(title).font(.caption.weight(.semibold)).foregroundStyle(LociTheme.secondaryText)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

private struct VideoPreviewHero: View {
    let url: URL
    @State private var thumbnail: UIImage?

    var body: some View {
        ZStack {
            if let thumbnail {
                Image(uiImage: thumbnail)
                    .resizable()
                    .scaledToFill()
                    .frame(maxWidth: .infinity, minHeight: 128, maxHeight: 190)
                    .clipped()
            } else {
                LinearGradient(colors: [LociTheme.elevated, LociTheme.background], startPoint: .topLeading, endPoint: .bottomTrailing)
                    .frame(minHeight: 128)
            }
            Circle()
                .fill(.black.opacity(0.55))
                .frame(width: 44, height: 44)
            Image(systemName: "play.fill")
                .font(.title3.weight(.bold))
                .foregroundStyle(.white)
        }
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .task {
            let asset = AVURLAsset(url: url)
            let generator = AVAssetImageGenerator(asset: asset)
            generator.appliesPreferredTrackTransform = true
            let time = CMTime(seconds: 0.1, preferredTimescale: 600)
            if let cgImage = try? await generator.image(at: time).image {
                thumbnail = UIImage(cgImage: cgImage)
            }
        }
    }
}

private struct PostActionLabel: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let title: String
    let symbol: String
    let color: Color
    /// Changing this value plays a one-shot bounce on the symbol (skipped with Reduce Motion).
    var effectValue: Bool = false

    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: symbol).font(.headline).foregroundStyle(color)
                .symbolEffect(.bounce, value: reduceMotion ? false : effectValue)
            Text(title).font(.caption.weight(.semibold)).foregroundStyle(.white)
        }
        .frame(maxWidth: .infinity, minHeight: 58)
        .background(LociTheme.field, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 15, style: .continuous).stroke(LociTheme.hairline))
    }
}

private struct ProfileLinkRow: View {
    let title: String
    let symbol: String
    let color: Color

    var body: some View {
        Label {
            Text(title)
                .font(.body)
                .fixedSize(horizontal: false, vertical: true)
        } icon: {
            Image(systemName: symbol)
                .foregroundStyle(color)
                .frame(width: 26)
        }
        .padding(.vertical, 3)
    }
}
