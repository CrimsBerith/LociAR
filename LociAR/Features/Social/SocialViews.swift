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

struct ActivityView: View {
    @Environment(AppSession.self) private var session
    @Environment(AppContainer.self) private var container
    @State private var items: [SocialActivity] = []
    @State private var message: String?
    @State private var nextCursor: String?
    @State private var pageGeneration = 0
    @State private var isLoadingMore = false
    @State private var isLoading = true
    @State private var loadID: UUID?

    var body: some View {
        Group {
            if isLoading {
                LociLoadingView(title: String(localized: "Aktiviteler yükleniyor…"))
            } else if items.isEmpty {
                LociEmptyState(
                    title: String(localized: "Henüz aktivite yok"),
                    message: message ?? String(localized: "Beğeni, yorum ve takip bildirimleri burada görünür."),
                    symbol: "bell.slash",
                    actionTitle: session.isLocalPreview || message == nil || !container.isBackendConfigured ? nil : String(localized: "Tekrar dene"),
                    action: session.isLocalPreview || message == nil ? nil : { Task { await load() } }
                )
            } else {
                List {
                    if let message {
                        LociInlineNotice(title: String(localized: "Bir sorun oluştu"), message: message, symbol: "exclamationmark.triangle.fill", color: .orange)
                        Button("Tekrar dene") { Task { await load() } }
                    }
                    ForEach(items) { item in
                        HStack(spacing: 13) {
                            ZStack {
                                Circle().fill(LociTheme.accent.opacity(0.12)).frame(width: 42, height: 42)
                                Image(systemName: symbol(for: item.kind)).foregroundStyle(LociTheme.accent)
                            }
                            VStack(alignment: .leading, spacing: 4) {
                                Text(body(for: item)).font(.headline)
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
                }
                .lociListStyle()
                .refreshable { await load() }
            }
        }
        .background(LociScreenBackground())
        .navigationTitle("Aktivite")
        .task { await load() }
        .safeAreaInset(edge: .bottom) {
            if nextCursor != nil {
                Button("Daha fazla göster") { Task { await loadMore() } }
                    .disabled(isLoadingMore || isLoading).padding().background(.ultraThinMaterial)
            }
        }
        .accessibilityIdentifier("screen-activity")
    }

    private func load() async {
        pageGeneration += 1
        nextCursor = nil
        let requestID = UUID()
        loadID = requestID
        isLoading = items.isEmpty
        message = nil
        defer { if loadID == requestID { isLoading = false } }
        if session.isLocalPreview {
            message = String(localized: "Cihaz test modunda yeni aktivite bulunmuyor.")
            return
        }
        guard case let .signedIn(user) = session.phase, container.isBackendConfigured else {
            message = String(localized: "Aktiviteler için sunucu bağlantısı gerekiyor.")
            return
        }
        do {
            let page = try await container.social.activityPage(for: user.id, cursor: nil)
            let loaded = page.items
            nextCursor = page.next
            guard isCurrentLoad(requestID, userID: user.id) else { return }
            items = loaded
            isLoading = false
            let unread = loaded.filter { $0.readAt == nil }.map(\.id)
            guard !unread.isEmpty else { return }
            do {
                let acknowledged = try await container.social.markActivityRead(ids: unread, for: user.id)
                guard isCurrentLoad(requestID, userID: user.id) else { return }
                items = items.map { item in acknowledged[item.id].map { item.markingRead(at: $0) } ?? item }
            } catch {
                guard isCurrentLoad(requestID, userID: user.id) else { return }
                message = String(localized: "Okundu bilgisi kaydedilemedi. Bağlantını kontrol edip tekrar dene.")
            }
        } catch {
            guard isCurrentLoad(requestID, userID: user.id) else { return }
            message = String(localized: "Aktiviteler şu anda yüklenemiyor. Biraz sonra tekrar dene.")
        }
    }

    private func isCurrentLoad(_ requestID: UUID, userID: UUID) -> Bool {
        guard !Task.isCancelled, loadID == requestID, case let .signedIn(current) = session.phase else { return false }
        return current.id == userID
    }

    private func body(for item: SocialActivity) -> String {
        switch item.kind {
        case "like": String(localized: "Postun beğenildi.")
        case "comment": String(localized: "Postuna yorum yapıldı.")
        case "follow": String(localized: "Yeni bir takipçin var.")
        default: item.body
        }
    }

    private func symbol(for kind: String) -> String {
        ["like": "heart.fill", "comment": "bubble.right.fill", "follow": "person.badge.plus", "save": "bookmark.fill"][kind] ?? "bell.fill"
    }
    private func loadMore() async {
        guard let cursor = nextCursor, !isLoadingMore, case let .signedIn(viewer) = session.phase else { return }
        let generation = pageGeneration
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let page = try await container.social.activityPage(for: viewer.id, cursor: cursor)
            guard !Task.isCancelled, generation == pageGeneration, case let .signedIn(current) = session.phase, current.id == viewer.id else { return }
            var unique = Dictionary(items.map { ($0.id, $0) }, uniquingKeysWith: { _, latest in latest }); for item in page.items { unique[item.id] = item }; items = unique.values.sorted { $0.createdAt > $1.createdAt }
            nextCursor = page.next
            let unread = page.items.filter { $0.readAt == nil }.map(\.id)
            if !unread.isEmpty {
                do {
                    let acknowledged = try await container.social.markActivityRead(ids: unread, for: viewer.id)
                    guard !Task.isCancelled, generation == pageGeneration, case let .signedIn(current) = session.phase, current.id == viewer.id else { return }
                    items = items.map { item in acknowledged[item.id].map { item.markingRead(at: $0) } ?? item }
                } catch {
                    message = String(localized: "Okundu bilgisi kaydedilemedi. Bağlantını kontrol edip tekrar dene.")
                }
            }
        } catch { message = String(localized: "İçerikler şu anda yüklenemiyor. Biraz sonra tekrar dene.") }
    }

}

struct ProfileView: View {
    @Environment(AppSession.self) private var session
    @Environment(AppContainer.self) private var container
    @Environment(\.modelContext) private var modelContext
    let user: LociUser
    @State private var confirmDeletion = false
    @State private var showDeletionReauthentication = false
    @State private var showEditProfile = false
    @State private var isDeletingAccount = false
    @State private var isSigningOut = false
    @State private var notificationsAuthorized = false
    @State private var notificationsDenied = false
    @State private var isRequestingNotifications = false

    var body: some View {
        List {
            Section {
                HStack(spacing: 16) {
                    LociAvatar(handle: user.handle, avatarURL: user.avatarURL, size: 66)
                    VStack(alignment: .leading, spacing: 5) {
                        Text("@\(user.handle)").font(.title3.bold())
                        if let email = user.email { Text(email).font(.caption).foregroundStyle(.secondary) }
                        LociStatusPill(title: String(localized: "Hesap aktif"), symbol: "checkmark.seal.fill", color: LociTheme.accent)
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
                NavigationLink { MyPostsView() } label: { ProfileLinkRow(title: String(localized: "Postlarım"), symbol: "rectangle.stack.fill", color: LociTheme.accent) }
                NavigationLink { ActivityView() } label: {
                    ProfileLinkRow(title: "Aktivite", symbol: "bell.fill", color: .orange)
                }
                .accessibilityIdentifier("profile-activity")
                NavigationLink { CollectionsView() } label: { ProfileLinkRow(title: String(localized: "Koleksiyonlar"), symbol: "square.stack.3d.up.fill", color: .purple) }
                NavigationLink { SavedPostsView() } label: { ProfileLinkRow(title: String(localized: "Kaydedilenler"), symbol: "bookmark.fill", color: .blue) }
            } header: {
                profileSectionText("İçerik")
            }
            Section {
                NavigationLink { AppSettingsView() } label: { ProfileLinkRow(title: String(localized: "Ayarlar"), symbol: "gearshape", color: .gray) }
                NavigationLink { BlockedUsersView() } label: { ProfileLinkRow(title: String(localized: "Engellenen hesaplar"), symbol: "person.crop.circle.badge.xmark", color: .orange) }
                Button {
                    guard !isRequestingNotifications else { return }
                    if notificationsAuthorized || notificationsDenied {
                        if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                    } else {
                        isRequestingNotifications = true
                        Task {
                            notificationsAuthorized = await NotificationService.shared.requestAuthorization()
                            notificationsDenied = NotificationService.shared.authorizationDenied
                            isRequestingNotifications = false
                        }
                    }
                } label: {
                    if notificationsAuthorized || notificationsDenied {
                        Label("Bildirim ayarları", systemImage: "bell.badge")
                    } else {
                        Label("Bildirimleri etkinleştir", systemImage: "bell.badge")
                    }
                }
                .disabled(isRequestingNotifications || session.isLocalPreview || !container.isBackendConfigured)
                .accessibilityIdentifier("profile-push-permission")
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
                Button(role: .destructive) {
                    guard !isSigningOut else { return }
                    isSigningOut = true
                    Task { await session.signOut(); isSigningOut = false }
                } label: {
                    Label("Çıkış yap", systemImage: "rectangle.portrait.and.arrow.right")
                }
                    .disabled(isDeletingAccount || isSigningOut)
                    .accessibilityIdentifier("profile-sign-out")
                Button(role: .destructive) { confirmDeletion = true } label: {
                    Label("Hesabı kalıcı olarak sil", systemImage: "trash")
                }
                    .disabled(isDeletingAccount || isSigningOut || session.isLocalPreview || !container.isBackendConfigured)
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
            Button("Devam et", role: .destructive) { showDeletionReauthentication = true }
            Button("Vazgeç", role: .cancel) {}
        } message: { Text("Postlarınız ve sosyal verileriniz sunucudan silinir. Bu işlem geri alınamaz.") }
        .sheet(isPresented: $showEditProfile) {
            ProfileEditView(user: user)
        }
        .sheet(isPresented: $showDeletionReauthentication) {
            AccountDeletionView(email: user.email) { password in try await deleteAccount(password: password) }
        }
        .accessibilityIdentifier("screen-profile")
        .task {
            guard !session.isLocalPreview, container.isBackendConfigured else { return }
            await NotificationService.shared.checkAuthorizationStatus()
            notificationsAuthorized = NotificationService.shared.isAuthorized
            notificationsDenied = NotificationService.shared.authorizationDenied
        }
    }

    private func profileSectionText(_ value: String) -> some View {
        Text(LocalizedStringKey(value))
            .foregroundStyle(.white)
            .textCase(nil)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func deleteAccount(password: String?) async throws {
        isDeletingAccount = true
        defer { isDeletingAccount = false }
        do { try await session.deleteAccount(password: password) }
        catch AuthFlowError.deletionPending {
            await LocalAccountDeletion.resume(in: modelContext)
            throw AuthFlowError.deletionPending
        }
        await LocalAccountDeletion.resume(in: modelContext)
    }
}

private struct AccountDeletionView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    let email: String?
    let onConfirm: (String?) async throws -> Void
    @State private var method: AccountDeletionMethod?
    @State private var password = ""
    @State private var isWorking = false
    @State private var deletionAccepted = false
    @State private var message: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Hesabı silmeden önce kimliğini doğrula.")
                    if let email { Text(email).foregroundStyle(.secondary) }
                    if method == .password {
                        SecureField("Mevcut parola", text: $password)
                            .textContentType(.password)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .disabled(isWorking || deletionAccepted)
                            .accessibilityIdentifier("account-delete-password")
                    } else if method == nil, message == nil { ProgressView() }
                    if let message { Text(message).foregroundStyle(deletionAccepted ? Color.secondary : Color.red) }
                }
                Section {
                    if method == .apple {
                        Button("Apple ile doğrula ve sil", role: .destructive) { Task { await submit() } }
                            .disabled(isWorking || deletionAccepted)
                            .accessibilityIdentifier("account-delete-confirm")
                    } else if method == .password {
                        Button("Doğrula ve sil", role: .destructive) { Task { await submit() } }
                            .disabled(isWorking || deletionAccepted || password.isEmpty)
                            .accessibilityIdentifier("account-delete-confirm")
                    } else if message != nil {
                        Button("Tekrar dene") { Task { await loadMethod() } }
                    }
                    if isWorking { ProgressView() }
                } footer: {
                    Text("Postlarınız ve sosyal verileriniz sunucudan silinir. Bu işlem geri alınamaz.")
                }
            }
            .navigationTitle("Hesabı sil")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(deletionAccepted ? String(localized: "Kapat") : String(localized: "Vazgeç")) { password = ""; dismiss() }.disabled(isWorking)
                }
            }
        }
        .interactiveDismissDisabled(isWorking)
        .accessibilityIdentifier("screen-account-deletion")
        .task { await loadMethod() }
        .onDisappear { password = "" }
    }

    private func loadMethod() async {
        message = nil
        do { method = try await session.accountDeletionMethod() }
        catch { message = String(localized: "Hesap şu anda silinemiyor. Biraz sonra tekrar dene.") }
    }

    private func submit() async {
        guard !isWorking, !deletionAccepted, let method else { return }
        isWorking = true
        message = nil
        let submitted = method == .password ? password : nil
        password = ""
        defer { isWorking = false }
        do { try await onConfirm(submitted); dismiss() }
        catch let error as AuthFlowError {
            if case .deletionPending = error { deletionAccepted = true }
            message = error.localizedDescription
        }
        catch is CancellationError { message = AuthFlowError.reauthenticationCancelled.localizedDescription }
        catch { message = String(localized: "Hesap şu anda silinemiyor. Biraz sonra tekrar dene.") }
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
            if isLoading { LociLoadingView(title: String(localized: "Koleksiyonlar yükleniyor…")) }
            else if collections.isEmpty {
                if let message {
                    LociEmptyState.failure(message: message, retry: retryAction)
                } else {
                    LociEmptyState(
                        title: String(localized: "Henüz koleksiyon yok"),
                        message: String(localized: "Kaydettiğin postları özel koleksiyonlarda düzenleyebilirsin."),
                        symbol: "square.stack.3d.up",
                        actionTitle: String(localized: "İlk koleksiyonu oluştur"),
                        action: { showCreate = true }
                    )
                }
            } else {
                List {
                    if let message {
                        LociInlineNotice(title: String(localized: "Bir sorun oluştu"), message: message, symbol: "exclamationmark.triangle.fill", color: .orange)
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
            message = String(localized: "Koleksiyonlar için sunucu bağlantısı gerekiyor.")
            return
        }
        do { collections = try await container.social.collections(for: user.id) }
        catch { message = String(localized: "Koleksiyonlar şu anda yüklenemiyor.") }
    }

    private func create() async {
        let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard case let .signedIn(user) = session.phase, container.isBackendConfigured, !cleanTitle.isEmpty else { return }
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

    var body: some View {
        Group {
            if isLoading {
                LociLoadingView(title: String(localized: "Koleksiyon yükleniyor…"))
            } else if posts.isEmpty {
                if let message {
                    // A failed load must not read as an empty collection.
                    LociEmptyState.failure(message: message, retry: { Task { await load() } })
                } else {
                    LociEmptyState(
                        title: String(localized: "Bu koleksiyon boş"),
                        message: String(localized: "Beğendiğin veya kaydettiğin postları detayından bu koleksiyona ekleyebilirsin."),
                        symbol: "folder.badge.plus"
                    )
                }
            } else {
                List {
                    if let message {
                        LociInlineNotice(title: String(localized: "Bazı postlar gösterilemiyor"), message: message, symbol: "exclamationmark.triangle.fill", color: .orange)
                            .listRowBackground(Color.clear)
                    }
                    ForEach(posts) { post in
                        NavigationLink {
                            PostPreviewView(post: post)
                        } label: {
                            HStack(spacing: 12) {
                                LociAvatar(handle: String(post.creatorID.uuidString.prefix(6)), size: 36)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(post.caption.isEmpty ? String(localized: "Mekânsal post") : post.caption)
                                        .font(.subheadline.bold())
                                        .lineLimit(2)
                                    Text(post.anchorBundle.anchor.pinQuality.isPhysicalSurface ? String(localized: "Fiziksel yüzey") : String(localized: "Yaklaşık"))
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
                message = loadedPosts.isEmpty ? String(localized: "Postlar yüklenemedi.") : String(localized: "\(failedCount) post şu anda yüklenemedi. Yenilemek için aşağı çek.")
            }
        } catch {
            message = String(localized: "Postlar yüklenemedi.")
        }
    }

    private func remove(post: LociPost) async {
        do {
            try await container.social.remove(postID: post.id, from: collection.id)
            withAnimation {
                posts.removeAll { $0.id == post.id }
            }
        } catch {
            message = String(localized: "Post koleksiyondan çıkarılamadı.")
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
            if isLoading { LociLoadingView(title: String(localized: "Kaydedilenler yükleniyor…")) }
            else if posts.isEmpty {
                LociEmptyState(title: String(localized: "Kaydedilen post yok"), message: message ?? String(localized: "Kaydettiğin postlar burada görünür."), symbol: "bookmark", actionTitle: message == nil || !container.isBackendConfigured ? nil : "Tekrar dene", action: message == nil ? nil : { Task { await load() } })
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
            message = String(localized: "Kaydedilenler için sunucu bağlantısı gerekiyor.")
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
        } catch { message = String(localized: "Kaydedilen postlar şu anda yüklenemiyor.") }
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
                LociEmptyState(title: String(localized: "Engellenen hesap yok"), message: message ?? String(localized: "Engellediğin hesaplar burada görünür."), symbol: "person.crop.circle.badge.xmark", actionTitle: message == nil || !container.isBackendConfigured ? nil : "Tekrar dene", action: message == nil ? nil : { Task { await load() } })
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

    var body: some View {
        Group {
            if isLoading { LociLoadingView(title: String(localized: "Postların yükleniyor…")) }
            else if posts.isEmpty {
                LociEmptyState(title: String(localized: "Henüz post yok"), message: message ?? String(localized: "Yayınlanan ve incelemedeki postların burada görünür."), symbol: "rectangle.stack.badge.plus", actionTitle: message == nil || !container.isBackendConfigured ? nil : "Tekrar dene", action: message == nil ? nil : { Task { await load() } })
            } else {
                List(posts) { post in
                    NavigationLink(value: post) {
                        VStack(alignment: .leading, spacing: 8) {
                            if failedIDs.contains(post.id) {
                                LociStatusPill(title: String(localized: "İşlem gerekiyor"), symbol: "exclamationmark.triangle.fill", color: .red)
                            } else if pendingIDs.contains(post.id) {
                                LociStatusPill(title: String(localized: "Yayın bekliyor"), symbol: "arrow.triangle.2.circlepath", color: .orange)
                            } else if post.status == .pendingReview {
                                LociStatusPill(title: String(localized: "İncelemede"), symbol: "clock.fill", color: .orange)
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
        .safeAreaInset(edge: .bottom) {
            if nextCursor != nil {
                Button("Daha fazla göster") { Task { await loadMore() } }
                    .disabled(isLoadingMore || isLoading).padding().background(.ultraThinMaterial)
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
        pageGeneration += 1
        nextCursor = nil
        isLoading = posts.isEmpty
        message = nil
        defer { isLoading = false }
        guard case let .signedIn(user) = session.phase else {
            posts = []
            pendingIDs = []
            failedIDs = []
            message = String(localized: "Postları görmek için tekrar giriş yap.")
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
        guard container.isBackendConfigured else { message = String(localized: "Postların için sunucu bağlantısı gerekiyor."); return }
        do {
            let page = try await container.posts.myPostsPage(cursor: nil)
            let remotePosts = page.posts
            nextCursor = page.next
            let remoteIDs = Set(remotePosts.map(\.id))
            pendingIDs.subtract(remoteIDs)
            failedIDs.subtract(remoteIDs)
            posts = (remotePosts + localPosts.filter { !remoteIDs.contains($0.id) })
                .sorted { $0.createdAt > $1.createdAt }
        } catch {
            message = localPosts.isEmpty ? String(localized: "Postların şu anda yüklenemiyor.") : String(localized: "Bekleyen post cihazda güvende. Yayını tekrar deneyebilirsin.")
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
            deleteError = String(localized: "Post şu anda silinemiyor. Bağlantını kontrol edip tekrar dene.")
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

struct PublicProfileView: View {
    @Environment(AppSession.self) private var session
    @Environment(AppContainer.self) private var container
    let user: LociUser
    @State private var profile: PublicProfileProjection?
    @State private var posts: [LociPost] = []
    @State private var following = false
    @State private var message: String?
    @State private var nextCursor: String?
    @State private var pageGeneration = 0
    @State private var isLoadingMore = false
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
                        profileMetric(value: profile?.publicPostCount ?? posts.count, label: String(localized: "Post"))
                        profileMetric(value: profile?.followerCount ?? 0, label: String(localized: "Takipçi"))
                    }
                    Button(following ? String(localized: "Takibi bırak") : String(localized: "Takip et")) { Task { await toggleFollow() } }
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
                else if posts.isEmpty { LociEmptyState(title: String(localized: "Henüz paylaşım yok"), message: message ?? String(localized: "Bu hesap henüz bir post paylaşmadı."), symbol: "rectangle.stack") }
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
        .safeAreaInset(edge: .bottom) {
            if nextCursor != nil {
                Button("Daha fazla göster") { Task { await loadMore() } }
                    .disabled(isLoadingMore || isLoading).padding().background(.ultraThinMaterial)
            }
        }
        .confirmationDialog("Kullanıcı engellensin mi?", isPresented: $confirmBlock, titleVisibility: .visible) {
            Button("Engelle", role: .destructive) { Task { await block() } }
            Button("Vazgeç", role: .cancel) {}
        } message: {
            Text("Bu kullanıcının postlarını ve yorumlarını görmezsin; seni takip edemez, postlarına yorum yapamaz.")
        }
        .confirmationDialog("Neden bildiriyorsun?", isPresented: $reportingUser, titleVisibility: .visible) {
            ForEach(ReportReason.allCases) { reason in
                Button(NSLocalizedString(reason.rawValue, comment: "Report reason")) { Task { await reportUser(reason) } }
            }
            Button("Vazgeç", role: .cancel) {}
        }
    }

    private func reportUser(_ reason: ReportReason) async {
        guard case let .signedIn(viewer) = session.phase, container.isBackendConfigured else { return }
        do {
            try await container.social.reportUser(targetID: user.id, userID: viewer.id, reason: reason.rawValue)
            message = String(localized: "Bildirimin incelemeye gönderildi. Teşekkürler.")
        } catch {
            message = String(localized: "Bildirim gönderilemedi.")
        }
    }

    private func load() async {
        pageGeneration += 1
        nextCursor = nil
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
        guard container.isBackendConfigured else { message = String(localized: "Sunucu bağlantısı henüz hazır değil."); return }
        do {
            async let loadedProfile = container.posts.publicProfile(creatorID: user.id)
            async let loadedPage = container.posts.publicPostsPage(creatorID: user.id, cursor: nil)
            let (newProfile, page) = try await (loadedProfile, loadedPage)
            profile = newProfile; posts = page.posts; nextCursor = page.next
            if case let .signedIn(viewer) = session.phase {
                following = (try await container.social.followingIDs(for: viewer.id)).contains(user.id)
            }
        } catch { message = String(localized: "Profil şu anda yüklenemiyor.") }
    }

    private func toggleFollow() async {
        guard !isFollowMutating, !isBlockMutating else { return }
        guard case let .signedIn(viewer) = session.phase, container.isBackendConfigured else { return }
        isFollowMutating = true
        defer { isFollowMutating = false }
        do { try await container.social.setFollowing(!following, targetID: user.id, userID: viewer.id); following.toggle() }
        catch { message = String(localized: "Takip durumu güncellenemedi.") }
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
            message = String(localized: "Kullanıcı engellendi.")
        } catch {
            message = String(localized: "Hesap engellenemedi. Tekrar dene.")
        }
    }

    private func loadMore() async {
        guard let cursor = nextCursor, !isLoadingMore, case let .signedIn(viewer) = session.phase else { return }
        let generation = pageGeneration
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let page = try await container.posts.publicPostsPage(creatorID: user.id, cursor: cursor)
            guard !Task.isCancelled, generation == pageGeneration, case let .signedIn(current) = session.phase, current.id == viewer.id else { return }
            var unique = Dictionary(posts.map { ($0.id, $0) }, uniquingKeysWith: { _, latest in latest }); for post in page.posts { unique[post.id] = post }; posts = unique.values.sorted { $0.createdAt > $1.createdAt }
            nextCursor = page.next
        } catch { message = String(localized: "İçerikler şu anda yüklenemiyor. Biraz sonra tekrar dene.") }
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
    @State private var olderCommentsCursor: CommentPageCursor?
    @State private var isLoadingOlderComments = false
    @State private var commentsFailed = false
    @State private var commentsLoadID = UUID()
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
                    title: post.anchorBundle.anchor.pinQuality.isPhysicalSurface ? String(localized: "Konuma bağlı AR") : String(localized: "Yaklaşık yerleştirme"),
                    message: post.anchorBundle.anchor.pinQuality.isPhysicalSurface
                        ? String(localized: "AR görünümü yalnız postun kaydedildiği konumda açılır.")
                        : String(localized: "Bu içerik fiziksel bir yüzeye kilitli değildir."),
                    symbol: post.anchorBundle.anchor.pinQuality.isPhysicalSurface ? "location.fill.viewfinder" : "exclamationmark.triangle.fill",
                    color: post.anchorBundle.anchor.pinQuality.isPhysicalSurface ? LociTheme.accent : .orange
                )
                HStack(spacing: 10) {
                    Button { Task { await toggleLike() } } label: {
                        PostActionLabel(title: liked ? String(localized: "Beğenildi") : String(localized: "Beğen"), symbol: liked ? "heart.fill" : "heart", color: liked ? .pink : .white, effectValue: liked)
                    }
                    .buttonStyle(.plain)
                    .disabled(isLikeMutating)
                    .accessibilityIdentifier("post-like-button")
                    Button { Task { await toggleSaved() } } label: {
                        PostActionLabel(title: saved ? String(localized: "Kaydedildi") : "Kaydet", symbol: saved ? "bookmark.fill" : "bookmark", color: saved ? LociTheme.accent : .white, effectValue: saved)
                    }
                    .buttonStyle(.plain)
                    .disabled(isSaveMutating)
                    .accessibilityIdentifier("post-save-button")
                    Button { reportTarget = .post } label: {
                        PostActionLabel(title: String(localized: "Bildir"), symbol: "exclamationmark.bubble", color: .white)
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
                    .accessibilityLabel("Diğer seçenekler")
                    .accessibilityIdentifier("post-more-menu")
                    if !collections.isEmpty {
                        Menu(String(localized: "Koleksiyona ekle")) {
                            ForEach(collections) { collection in Button(collection.title) { Task { await add(to: collection) } } }
                        }
                    }
                }

                LociSectionLabel(title: "Yorumlar", symbol: "bubble.left.and.bubble.right")
                Button("Yeni yorumları yenile") { Task { await load() } }
                    .disabled(isLoading || isLoadingOlderComments)
                    .accessibilityIdentifier("comments-refresh")
                if olderCommentsCursor != nil && !isLoading {
                    Button { Task { await loadOlderComments() } } label: {
                        if isLoadingOlderComments { ProgressView().tint(LociTheme.accent) }
                        else { Text("Önceki yorumları yükle") }
                    }
                    .disabled(isLoadingOlderComments)
                    .accessibilityIdentifier("comments-load-older")
                }
                if isLoading {
                    ProgressView().tint(LociTheme.accent).frame(maxWidth: .infinity).padding()
                } else if commentsFailed {
                    Text("Yorumlar şu anda yüklenemiyor. Tekrar dene.").font(.subheadline).foregroundStyle(.secondary)
                    Button("Tekrar dene") { Task { await load() } }
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
                        .accessibilityLabel("Yorumu gönder")
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
        .task(id: commentViewerID) { await load() }
        .refreshable { await load() }
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
                Button(NSLocalizedString(reason.rawValue, comment: "Report reason")) { Task { await report(target, reason: reason) } }
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
        let viewerID = commentViewerID
        do {
            try await container.social.deleteComment(id: comment.id)
            guard !Task.isCancelled, commentViewerID == viewerID else { return }
            withAnimation { comments.removeAll { $0.id == comment.id } }
            message = String(localized: "Yorum silindi.")
        } catch {
            guard !Task.isCancelled, commentViewerID == viewerID else { return }
            message = String(localized: "Yorum silinemedi.")
        }
    }

    private func load() async {
        let requestID = UUID()
        let viewerID = commentViewerID
        commentsLoadID = requestID
        comments = []
        olderCommentsCursor = nil
        commentsFailed = false
        message = nil
        isLoadingOlderComments = false
        isLoading = true
        defer { if commentsLoadID == requestID { isLoading = false } }
        await recordViewIfNeeded()
        guard isCurrentCommentsLoad(requestID, viewerID: viewerID) else { return }
        if UITestFixtures.sampleContentEnabled {
            comments = UITestFixtures.comments
            collections = []
            return
        }
        guard container.isBackendConfigured || session.isLocalPreview else { return }
        do {
            let page = try await container.social.commentPage(for: post.id, before: nil)
            guard isCurrentCommentsLoad(requestID, viewerID: viewerID) else { return }
            comments = LociComment.merging(comments, with: page.comments)
            olderCommentsCursor = page.olderCursor
        } catch {
            guard isCurrentCommentsLoad(requestID, viewerID: viewerID) else { return }
            commentsFailed = true
        }
        if case let .signedIn(user) = session.phase {
            async let savedIDs = container.social.savedPostIDs(for: user.id)
            async let likedIDs = container.social.likedPostIDs(for: user.id)
            async let loadedLikeCount = container.social.likeCount(for: post.id)
            async let loadedCollections = container.social.collections(for: user.id)
            let savedResult = (try? await savedIDs) ?? []
            let likedResult = (try? await likedIDs) ?? []
            let countResult = (try? await loadedLikeCount) ?? likeCount
            let collectionsResult = (try? await loadedCollections) ?? []
            guard isCurrentCommentsLoad(requestID, viewerID: viewerID) else { return }
            saved = savedResult.contains(post.id)
            liked = likedResult.contains(post.id)
            likeCount = countResult
            collections = collectionsResult
        }
    }

    private var commentViewerID: UUID? {
        if case let .signedIn(user) = session.phase { return user.id }
        return nil
    }

    private func isCurrentCommentsLoad(_ requestID: UUID, viewerID: UUID?) -> Bool {
        !Task.isCancelled && commentsLoadID == requestID && commentViewerID == viewerID
    }

    private func loadOlderComments() async {
        guard !isLoading, !isLoadingOlderComments, let cursor = olderCommentsCursor else { return }
        let requestID = commentsLoadID
        let viewerID = commentViewerID
        isLoadingOlderComments = true
        message = nil
        defer { if commentsLoadID == requestID { isLoadingOlderComments = false } }
        do {
            let page = try await container.social.commentPage(for: post.id, before: cursor)
            guard isCurrentCommentsLoad(requestID, viewerID: viewerID) else { return }
            comments = LociComment.merging(comments, with: page.comments)
            olderCommentsCursor = page.olderCursor
        } catch {
            guard isCurrentCommentsLoad(requestID, viewerID: viewerID) else { return }
            message = String(localized: "Yorumlar şu anda yüklenemiyor. Tekrar dene.")
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
            message = String(localized: "Beğeni güncellenemedi.")
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
        do { try await container.social.setSaved(!saved, postID: post.id, userID: user.id); saved.toggle() } catch { message = String(localized: "Kaydetme durumu güncellenemedi.") }
    }
    private func addComment() async {
        guard !isCommentSending else { return }
        guard case let .signedIn(user) = session.phase, container.isBackendConfigured || session.isLocalPreview else { return }
        let cleanText = commentText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanText.isEmpty, cleanText.count <= 500 else { message = String(localized: "Yorum en fazla 500 karakter olabilir."); return }
        isCommentSending = true
        defer { isCommentSending = false }
        do {
            let comment = try await container.social.addComment(postID: post.id, user: user, text: cleanText)
            guard !Task.isCancelled, commentViewerID == user.id else { return }
            withAnimation(.spring(duration: 0.3)) {
                comments = LociComment.merging(comments, with: [comment])
            }
            commentsSent += 1
            commentText = ""
            commentsFailed = false
        } catch {
            guard !Task.isCancelled, commentViewerID == user.id else { return }
            message = String(localized: "Yorum gönderilemedi.")
        }
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
            message = String(localized: "Bildirimin incelemeye gönderildi. Teşekkürler.")
        } catch {
            message = String(localized: "Bildirim gönderilemedi.")
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
            message = String(localized: "Kullanıcı engellenemedi.")
        }
    }
    private func add(to collection: LociCollection) async {
        guard container.isBackendConfigured else { return }
        do { try await container.social.add(postID: post.id, to: collection.id); message = "\(collection.title) koleksiyonuna eklendi." }
        catch { message = String(localized: "Koleksiyona eklenemedi.") }
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
                    title: post.anchorBundle.anchor.pinQuality == .freeSpaceApproximate ? String(localized: "Yaklaşık") : "Sabit",
                    symbol: post.anchorBundle.anchor.pinQuality.isPhysicalSurface ? "viewfinder" : "exclamationmark",
                    color: post.anchorBundle.anchor.pinQuality.isPhysicalSurface ? LociTheme.accent : .orange
                )
            }
            Text(post.caption.isEmpty ? String(localized: "Mekânsal post") : post.caption)
                .font(.body.weight(.semibold))
                .lineLimit(4)
                .foregroundStyle(.white.opacity(0.94))

            PostMediaHero(post: post, openMedia: openMedia)

            HStack(spacing: 18) {
                LociMetricLabel(value: likeCount ?? post.counts.likes, title: String(localized: "beğeni"), symbol: "heart.fill", color: .pink)
                LociMetricLabel(value: viewCount ?? post.counts.views, title: String(localized: "görüntülenme"), symbol: "eye.fill", color: LociTheme.accent)
                LociMetricLabel(value: post.counts.comments, title: String(localized: "yorum"), symbol: "bubble.right.fill", color: .white.opacity(0.8))
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
        if let external = post.contentSource?.externalMedia {
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
