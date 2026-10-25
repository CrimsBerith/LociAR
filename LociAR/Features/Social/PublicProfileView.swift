import AVFoundation
import SwiftUI
import SwiftData
import UIKit

struct PublicProfileView: View {
    @Environment(AppSession.self) private var session
    @Environment(AppContainer.self) private var container
    let user: LociUser
    @State private var refreshGate = ScreenRefreshGate()
    @State private var paginationGate = ScreenRefreshGate()
    @State private var loadedRevision: UUID?
    @State private var hasLoadedMore = false
    @State private var profile: PublicProfileProjection?
    @State private var posts: [LociPost] = []
    @State private var following = false
    @State private var message: String?
    @State private var nextCursor: String?
    @State private var pageGeneration = 0
    @State private var isLoadingMore = false
    @State private var isLoading = true
    @State private var isFollowMutating = false
    @State private var followMutationRevision = 0
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
                        Text(verbatim: "@\(profile?.handle ?? user.handle)").font(.title2.bold())
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
                        Text(message.localizedUI).font(.caption).foregroundStyle(.secondary)
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
        .onChange(of: refreshScope) { _, scope in
            if refreshGate.prepare(scope: scope, revision: ContentUpdates.shared.revision) { posts = []; nextCursor = nil; profile = nil }
        }
        .onChange(of: ContentUpdates.shared.revision) { _, value in
            if loadedRevision != value { posts = []; nextCursor = nil; profile = nil }
        }
        .visibleContentRefresh(gate: refreshGate, scope: refreshScope, revision: ContentUpdates.shared.revision, enabled: !isBlocked) { opening in
            await load(force: false, automatic: !opening)
        }
        .safeAreaInset(edge: .bottom) {
            if nextCursor != nil {
                Button("Daha fazla göster") { Task { await loadMore() } }
                    .disabled(isLoadingMore || isLoading).padding().background(.ultraThinMaterial)
            }
        }
        .confirmationDialog("Kullanıcı engellensin mi?", isPresented: $confirmBlock, titleVisibility: .visible) {
            Button("Engelle", role: .destructive) { Task { await block() } }
            Button("Vazgeç", role: .cancel) { /* Closes the dialog; nothing to undo. */ }
        } message: {
            Text("Bu kullanıcının adıyla paylaşılanları ve yorumlarını görmezsin, seni takip edemez. Anonim notlar kimseye yazarını göstermediği için bu engelden etkilenmez.")
        }
        .confirmationDialog("Neden bildiriyorsun?", isPresented: $reportingUser, titleVisibility: .visible) {
            ForEach(ReportReason.allCases) { reason in
                Button(NSLocalizedString(reason.rawValue, comment: "Report reason")) { Task { await reportUser(reason) } }
            }
            Button("Vazgeç", role: .cancel) { /* Closes the dialog; nothing to undo. */ }
        }
    }

    private func reportUser(_ reason: ReportReason) async {
        guard case let .signedIn(viewer) = session.phase, container.isBackendConfigured else { return }
        do {
            try await container.social.reportUser(targetID: user.id, userID: viewer.id, reason: reason.rawValue)
            message = String(localized: "Bildirimin incelemeye gönderildi. Teşekkürler.")
        } catch BackendCallError.rejected(_, _, let reason) where reason == "rate_limited" {
            message = String(localized: "Şikâyet sınırına ulaştın. Biraz sonra tekrar dene.")
        } catch {
            message = String(localized: "Bildirim gönderilemedi.")
        }
    }

    private var refreshScope: String {
        let owner: String
        if case let .signedIn(viewer) = session.phase { owner = viewer.id.uuidString } else { owner = "signed-out" }
        return "\(owner)|\(user.id.uuidString)"
    }

    private func load(force: Bool = true, automatic: Bool = false) async {
        let revision = ContentUpdates.shared.revision, scope = refreshScope
        let followRevision = followMutationRevision
        if refreshGate.prepare(scope: refreshScope, revision: revision) { posts = []; nextCursor = nil; profile = nil }
        guard !isLoadingMore, !isBlockMutating, !isFollowMutating,
              !(automatic && hasLoadedMore && loadedRevision == revision),
              let ticket = refreshGate.begin(scope: scope, revision: revision, force: force) else { return }
        if loadedRevision != nil && loadedRevision != revision { profile = nil; posts = []; nextCursor = nil }
        pageGeneration += 1
        isLoading = profile == nil
        message = nil
        var succeeded = false
        var failure: Error?
        defer {
            if refreshGate.isCurrent(ticket, scope: refreshScope, revision: ContentUpdates.shared.revision) { isLoading = false }
            refreshGate.finish(ticket, succeeded: succeeded, error: failure)
        }
        if UITestFixtures.sampleContentEnabled || session.isLocalPreview {
            profile = PublicProfileProjection(
                id: UITestFixtures.creator.id, handle: UITestFixtures.creator.handle, avatarURL: nil,
                bio: "Şehrin unutulan hikâyelerini yüzeylere bırakıyorum.", publicPostCount: 1,
                followerCount: 248, followingCount: 73
            )
            posts = [UITestFixtures.post]; loadedRevision = revision; succeeded = true
            return
        }
        guard container.isBackendConfigured else { message = String(localized: "Sunucu bağlantısı henüz hazır değil."); return }
        do {
            async let loadedProfile = container.posts.publicProfile(creatorID: user.id)
            async let loadedPage = container.posts.publicPostsPage(creatorID: user.id, cursor: nil)
            let (newProfile, page) = try await (loadedProfile, loadedPage)
            guard !Task.isCancelled, scope == refreshScope, revision == ContentUpdates.shared.revision,
                  refreshGate.isCurrent(ticket, scope: scope, revision: revision) else { return }
            let loadedFollowing: Bool
            if newProfile == nil { loadedFollowing = false }
            else if automatic { loadedFollowing = following }
            else if case let .signedIn(viewer) = session.phase {
                loadedFollowing = try await container.social.isFollowing(targetID: user.id, userID: viewer.id)
            } else { loadedFollowing = false }
            guard !Task.isCancelled, scope == refreshScope, revision == ContentUpdates.shared.revision,
                  refreshGate.isCurrent(ticket, scope: scope, revision: revision) else { return }
            profile = newProfile; posts = page.posts; nextCursor = page.next
            if followRevision == followMutationRevision { following = loadedFollowing }
            loadedRevision = revision; hasLoadedMore = false; succeeded = true
        } catch {
            guard !Task.isCancelled, scope == refreshScope, revision == ContentUpdates.shared.revision,
                  refreshGate.isCurrent(ticket, scope: scope, revision: revision) else { return }
            failure = error
            if let backend = error as? BackendCallError, case .rejected = backend { profile = nil; posts = []; nextCursor = nil }
            message = String(localized: "Profil şu anda yüklenemiyor.")
        }
    }

    private func toggleFollow() async {
        guard !isFollowMutating, !isBlockMutating else { return }
        guard case let .signedIn(viewer) = session.phase, container.isBackendConfigured else { return }
        isFollowMutating = true
        followMutationRevision += 1
        defer { isFollowMutating = false; followMutationRevision += 1 }
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
            let page = try await container.posts.publicPostsPage(creatorID: user.id, cursor: cursor)
            guard !Task.isCancelled, revision == ContentUpdates.shared.revision, generation == pageGeneration, case let .signedIn(current) = session.phase, current.id == viewer.id else { return }
            pageSucceeded = true
            hasLoadedMore = true
            var unique = Dictionary(posts.map { ($0.id, $0) }, uniquingKeysWith: { _, latest in latest }); for post in page.posts { unique[post.id] = post }; posts = unique.values.sorted { $0.createdAt > $1.createdAt }
            nextCursor = page.next
        } catch {
            guard !Task.isCancelled, revision == ContentUpdates.shared.revision, generation == pageGeneration, case let .signedIn(current) = session.phase, current.id == viewer.id else { return }
            pageFailure = error
            message = String(localized: "İçerikler şu anda yüklenemiyor. Biraz sonra tekrar dene.")
        }
    }

    private func profileMetric(value: Int, label: String) -> some View {
        VStack(spacing: 2) { Text(value, format: .number).font(.headline); Text(label.localizedUI).font(.caption).foregroundStyle(.secondary) }
    }
}

/// Reasons offered when reporting a post, comment or user (Guideline 1.2).
