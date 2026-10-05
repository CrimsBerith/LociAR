import AVFoundation
import SwiftUI
import SwiftData
import UIKit

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
        .task { await load() }
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
            Text("Bu kullanıcının postlarını ve yorumlarını görmezsin; seni takip edemez, postlarına yorum yapamaz.")
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

    private func profileMetric(value: Int, label: String) -> some View {
        VStack(spacing: 2) { Text("\(value)").font(.headline); Text(label.localizedUI).font(.caption).foregroundStyle(.secondary) }
    }
}

/// Reasons offered when reporting a post, comment or user (Guideline 1.2).
