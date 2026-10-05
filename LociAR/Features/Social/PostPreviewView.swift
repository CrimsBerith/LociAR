import AVFoundation
import SwiftUI
import SwiftData

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
                    .accessibilityLabel("Diğer seçenekler")
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
                        .accessibilityLabel("Yorumu gönder")
                        .accessibilityIdentifier("comment-submit")
                    }
                    if commentText.count > 400 {
                        Text("\(commentText.count)/500")
                            .font(.caption2)
                            .foregroundStyle(commentText.count > 500 ? .red : .secondary)
                    }
                }
                if let message { Text(message.localizedUI).font(.caption).foregroundStyle(.secondary) }
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
                Button(reason.rawValue.localizedUI) { Task { await report(target, reason: reason) } }
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
        do {
            comments = try await container.social.comments(for: post.id)
        } catch {
            message = "Yorumlar şu anda yüklenemedi."
        }
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
        do { try await container.social.add(postID: post.id, to: collection.id); message = String(localized: "\(collection.title) koleksiyonuna eklendi.") }
        catch { message = "Koleksiyona eklenemedi." }
    }

    private var creatorUser: LociUser {
        LociUser(id: post.creatorID, handle: post.creatorHandle ?? "loci")
    }
}
