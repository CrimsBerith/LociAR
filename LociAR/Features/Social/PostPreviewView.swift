import AVFoundation
import MapKit
import SwiftUI
import SwiftData
import UIKit

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
    @Environment(AppRouter.self) private var router
    @Environment(\.openURL) private var openURL
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let post: LociPost
    @State private var refreshGate = ScreenRefreshGate()
    @State private var paginationGate = ScreenRefreshGate()
    @State private var loadedRevision: UUID?
    @State private var hasLoadedOlder = false
    @State private var comments: [LociComment] = []
    @State private var olderCommentsCursor: CommentPageCursor?
    @State private var isLoadingOlderComments = false
    @State private var commentsFailed = false
    /// Someone else's location note: its comments open only after reading the note on site.
    @State private var commentsNeedVisit = false
    @State private var commentsLoadID = UUID()
    @State private var commentMutationRevision = 0
    @State private var commentText = ""
    @State private var saved = false
    @State private var liked = false
    /// True once liked/saved reflect the server; until then a tap reads them first instead of guessing.
    @State private var membershipKnown = false
    @State private var likeCount: Int
    @State private var viewCount: Int
    @State private var didCountView = false
    @State private var collections: [LociCollection] = []
    @State private var showCollectionPicker = false
    @State private var collectionsLoading = false
    @State private var collectionsMessage: String?
    @State private var message: String?
    @State private var showAR = false
    @State private var isLoading = true
    @State private var isLikeMutating = false
    @State private var isSaveMutating = false
    @State private var isCommentSending = false
    @State private var isReporting = false
    @State private var reportTarget: ReportTarget?
    @State private var confirmBlock = false
    @State private var confirmOwnAnonymousComment = false
    @State private var showAccountCreation = false
    @State private var showPostSupport = false
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
            VStack(alignment: .leading, spacing: LociTheme.Spacing.xl2) {
                PostCard(post: post, likeCount: likeCount, viewCount: viewCount, allowsTranslationControls: true,
                         textLineLimit: nil, authorProfile: post.isAnonymous ? nil : creatorUser)
                if post.isLocked {
                    Label("Bu not konumunda açılır.", systemImage: "lock.fill")
                        .font(.callout)
                    if let spot = post.denseSpot {
                        Button { router.focusMap(MapFocus(latitude: spot.lat, longitude: spot.lng)); dismiss() } label: {
                            Label("Konumu gör", systemImage: "map")
                        }
                    }
                }

                if post.isLocationNote, let pose = post.anchorBundle.anchor.geoPose {
                    Button {
                        MKMapItem(placemark: MKPlacemark(coordinate: CLLocationCoordinate2D(latitude: pose.latitude, longitude: pose.longitude)))
                            .openInMaps(launchOptions: [MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeWalking])
                    } label: { Label("Konumu gör", systemImage: "map") }
                        .buttonStyle(LociCompactButtonStyle())
                        .accessibilityIdentifier("post-show-location")
                }
                if let sponsorship = post.sponsorship {
                    Text(sponsorship.terms).font(.body)
                    ForEach(sponsorship.codes ?? [], id: \.self) { code in
                        Label(code, systemImage: "ticket.fill").font(.title3.monospaced().bold()).textSelection(.enabled)
                    }
                    Text(sponsorship.expiresAt, style: .date).font(.caption).foregroundStyle(LociTheme.secondaryText)
                    Button {
                        if let pose = post.anchorBundle.anchor.geoPose,
                           let url = URL(string: "https://maps.apple.com/?daddr=\(pose.latitude),\(pose.longitude)&dirflg=w") { openURL(url) }
                    } label: {
                        Label("Konumu gör", systemImage: "map")
                    }
                }
                if !post.isLocationNote {
                    LociInlineNotice(
                        title: post.anchorBundle.anchor.pinQuality.isPhysicalSurface ? String(localized: "AR notu") : String(localized: "Yaklaşık yerleştirme"),
                        message: post.anchorBundle.anchor.pinQuality.isPhysicalSurface
                            ? String(localized: "AR için notun konumuna git.")
                            : String(localized: "Bu not bir yüzeye sabitlenmedi."),
                        symbol: post.anchorBundle.anchor.pinQuality.isPhysicalSurface ? "location.fill.viewfinder" : "exclamationmark.triangle.fill",
                        color: post.anchorBundle.anchor.pinQuality.isPhysicalSurface ? LociTheme.accent : LociTheme.warning
                    )
                }
                if post.sponsorship == nil {
                postActions

                if !post.isLocked {
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
                    ProgressView().tint(LociTheme.accent).frame(maxWidth: .infinity).padding(LociTheme.Spacing.l)
                } else if commentsNeedVisit {
                    Text("Yorumlar notun bulunduğu yerde açılır.").font(.subheadline).foregroundStyle(LociTheme.secondaryText)
                        .padding(.vertical, LociTheme.Spacing.s)
                        .accessibilityIdentifier("comments-need-visit")
                } else if commentsFailed {
                    Text("Yorumlar şu anda yüklenemiyor. Tekrar dene.").font(.subheadline).foregroundStyle(LociTheme.secondaryText)
                    Button("Tekrar dene") { Task { await load() } }
                } else if comments.isEmpty {
                    Text("İlk yorumu sen yaz.").font(.subheadline).foregroundStyle(LociTheme.secondaryText).padding(.vertical, LociTheme.Spacing.s)
                } else {
                    ForEach(comments) { comment in
                        HStack(alignment: .top, spacing: LociTheme.Spacing.m) {
                            LociAvatar(handle: comment.username, size: 34)
                            VStack(alignment: .leading, spacing: LociTheme.Spacing.xs) {
                                HStack { Text(verbatim: "@\(comment.username)").font(.caption.bold()); Text(comment.createdAt, style: .relative).font(.caption2).foregroundStyle(LociTheme.secondaryText) }
                                TranslatedPostText(text: comment.text, isReadable: !post.isLocked, allowsControls: true).font(.subheadline)
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
                                    .foregroundStyle(LociTheme.secondaryText)
                                    .frame(minWidth: LociTheme.Control.minimumTapTarget, minHeight: LociTheme.Control.minimumTapTarget)
                                    .contentShape(Rectangle())
                            }
                            .accessibilityLabel(Text("Yorum seçenekleri"))
                            .accessibilityIdentifier("comment-actions")
                        }
                        .padding(.vertical, LociTheme.Spacing.xs)
                        .accessibilityElement(children: .contain)
                    }
                }
                if isGuest {
                    // Comments need a verified account (firestore.rules verifiedIdentity()).
                    Button { showAccountCreation = true } label: {
                        Label("Yorum yazmak için giriş yap", systemImage: "person.crop.circle.badge.plus")
                    }
                    .accessibilityIdentifier("comment-account-required")
                } else {
                if commentRevealsAuthor {
                    LociInlineNotice(
                        title: String(localized: "Bu not anonim"),
                        message: String(localized: "Buraya yazacağın yorum @\(ownHandle) adınla görünür ve notun sana ait olduğunu belli eder."),
                        symbol: "eye.trianglebadge.exclamationmark",
                        color: LociTheme.warning
                    )
                    .accessibilityIdentifier("comment-reveals-author")
                }
                VStack(alignment: .trailing, spacing: LociTheme.Spacing.s) {
                    HStack(spacing: LociTheme.Spacing.m) {
                        TextField("Yorum yaz…", text: $commentText, axis: .vertical)
                            .lineLimit(1...4)
                            .padding(.horizontal, LociTheme.Spacing.m)
                            .padding(.vertical, LociTheme.Spacing.s)
                            .lociFieldSurface(cornerRadius: LociTheme.Radius.small)
                        Button {
                            if commentRevealsAuthor { confirmOwnAnonymousComment = true } else { Task { await addComment() } }
                        } label: {
                            if isCommentSending {
                                ProgressView().tint(LociTheme.accent)
                                    .frame(width: LociTheme.Control.minimumTapTarget, height: LociTheme.Control.minimumTapTarget)
                            } else {
                                Image(systemName: "paperplane.fill")
                                    .font(.headline)
                                    .foregroundStyle(commentText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? LociTheme.secondaryText : LociTheme.accent)
                                    .frame(width: LociTheme.Control.minimumTapTarget, height: LociTheme.Control.minimumTapTarget)
                            }
                        }
                        .disabled(isCommentSending || commentText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        .accessibilityLabel(Text("Yorumu gönder"))
                        .accessibilityIdentifier("comment-submit")
                    }
                    if commentText.count > 400 {
                        Text(verbatim: "\(commentText.count.formatted())/500")
                            .font(.caption2)
                            .foregroundStyle(commentText.count > 500 ? LociTheme.danger : LociTheme.secondaryText)
                    }
                }
                }
                }
                }
                if let message { Text(message.localizedUI).font(.caption).foregroundStyle(LociTheme.secondaryText) }
            }.padding(LociTheme.Spacing.l)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(LociScreenBackground())
        .navigationTitle("Not")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            // Sponsored location notes have no social action row; retain their secondary AR entry.
            if post.isLocationNote, post.sponsorship != nil {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu { openARButton } label: {
                        Image(systemName: "ellipsis")
                            .frame(minWidth: LociTheme.Control.minimumTapTarget, minHeight: LociTheme.Control.minimumTapTarget)
                    }
                    .accessibilityLabel(Text("Diğer seçenekler"))
                    .accessibilityIdentifier("post-more-menu")
                }
            }
        }
        .sensoryFeedback(.selection, trigger: likeTaps)
        .sensoryFeedback(.selection, trigger: saveTaps)
        .sensoryFeedback(.success, trigger: commentsSent)
        .onChange(of: refreshScope) { _, scope in
            if refreshGate.prepare(scope: scope, revision: ContentUpdates.shared.revision) { comments = []; olderCommentsCursor = nil }
        }
        .onChange(of: ContentUpdates.shared.revision) { _, value in
            if loadedRevision != value { comments = []; olderCommentsCursor = nil }
        }
        .visibleContentRefresh(gate: refreshGate, scope: refreshScope, revision: ContentUpdates.shared.revision,
                               enabled: !showAR && !showCollectionPicker && !showAccountCreation && !showPostSupport) { opening in
            await load(force: false, automatic: !opening)
        }
        .refreshable { await load() }
        .safeAreaInset(edge: .bottom) {
            if !post.isLocationNote {
                openARButton
                    .buttonStyle(LociPrimaryButtonStyle())
                    .padding(.horizontal, LociTheme.Spacing.l)
                    .padding(.top, LociTheme.Spacing.l)
                    .padding(.bottom, LociTheme.Spacing.m)
                    .background(LociTheme.background.opacity(0.98))
            }
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
            Button("Vazgeç", role: .cancel) { /* Closes the dialog; nothing to undo. */ }
        } message: { _ in
            Text("Bildirimler 24 saat içinde incelenir. İçeriği görmek istemiyorsan kullanıcıyı engelleyebilirsin.")
        }
        .confirmationDialog(
            post.isAnonymous ? String(localized: "Bu yazarın notları gizlensin mi?") : String(localized: "@\(creatorUser.handle) engellensin mi?"),
            isPresented: $confirmBlock, titleVisibility: .visible
        ) {
            Button(post.isAnonymous ? String(localized: "Gizle") : String(localized: "Engelle"), role: .destructive) { Task { await blockCreator() } }
            Button("Vazgeç", role: .cancel) { /* Closes the dialog; nothing to undo. */ }
        } message: {
            Text(post.isAnonymous
                 ? String(localized: "Bu yazarın anonim notları yalnız senin için gizlenir. Yazarın kimliği gösterilmez.")
                 : String(localized: "Bu hesabın adıyla paylaştığı notları ve yorumları görmezsin; seni takip edemez. Anonim notlar bu engelden etkilenmez."))
        }
        .confirmationDialog("Yorumun adınla görünecek", isPresented: $confirmOwnAnonymousComment, titleVisibility: .visible) {
            Button("Yine de gönder") { Task { await addComment() } }
            Button("Vazgeç", role: .cancel) { /* Keeps the draft; nothing is sent. */ }
        } message: {
            Text("Bu yorum, anonim notun sana ait olduğunu diğer kullanıcılara gösterir.")
        }
        .sheet(isPresented: $showAccountCreation) { AuthView() }
        .sheet(isPresented: $showCollectionPicker) {
            NavigationStack {
                Group {
                    if collectionsLoading { ProgressView().tint(LociTheme.accent) }
                    else if let collectionsMessage { Text(collectionsMessage.localizedUI).foregroundStyle(LociTheme.secondaryText) }
                    else if collections.isEmpty { Text("Henüz koleksiyon yok").foregroundStyle(LociTheme.secondaryText) }
                    else {
                        List(collections) { collection in
                            Button(collection.title) {
                                Task { await add(to: collection); showCollectionPicker = false }
                            }
                            .foregroundStyle(LociTheme.textPrimary)
                            .listRowBackground(Color.clear)
                        }
                        .lociListStyle()
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(LociScreenBackground())
                .navigationTitle("Koleksiyonlar")
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Kapat") { showCollectionPicker = false }.foregroundStyle(LociTheme.secondaryText) } }
                .task { await loadCollections() }
            }
        }
        .sheet(isPresented: $showPostSupport) {
            if isGuest { NavigationStack { AccountRequiredView() } }
            else { PostSupportView(post: post) }
        }
        .onChange(of: isGuest) { _, guest in if !guest { showAccountCreation = false } }
    }

    private var postActions: some View {
        LazyVGrid(columns: actionColumns, spacing: LociTheme.Spacing.m) {
            Button { Task { await toggleLike() } } label: {
                PostActionLabel(title: String(localized: "Beğen"), symbol: liked ? "heart.fill" : "heart",
                                color: liked ? LociTheme.social : LociTheme.textPrimary, effectValue: liked)
            }
            .buttonStyle(.plain)
            .disabled(isLikeMutating)
            .accessibilityValue(liked ? String(localized: "Beğenildi") : String(localized: "Beğenilmedi"))
            .accessibilityIdentifier("post-like-button")

            // Saving remains one tap; collections are a separate choice under More.
            Button { Task { await toggleSaved() } } label: {
                PostActionLabel(title: String(localized: "Kaydet"), symbol: saved ? "bookmark.fill" : "bookmark",
                                color: saved ? LociTheme.accent : LociTheme.textPrimary, effectValue: saved)
            }
            .buttonStyle(.plain)
            .disabled(isSaveMutating)
            .accessibilityValue(saved ? String(localized: "Kaydedildi") : String(localized: "Kaydedilmedi"))
            .accessibilityIdentifier("post-save-button")

            if !ownsPost {
                Button { reportTarget = .post } label: {
                    PostActionLabel(title: String(localized: "Bildir"), symbol: "exclamationmark.bubble", color: LociTheme.textPrimary)
                }
                .buttonStyle(.plain)
                .disabled(isReporting)
                .accessibilityIdentifier("post-report")
            }
            if hasMoreActions { postMoreMenu }
            if showsSupportEntryPoint {
                Button { showPostSupport = true } label: {
                    PostSupportIcon().foregroundStyle(LociTheme.accent)
                        .frame(minWidth: LociTheme.Control.minimumTapTarget, minHeight: LociTheme.Control.actionTileHeight).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text("Yazara destek ol"))
                .accessibilityIdentifier("post-support-button")
            }
        }
    }

    private var postMoreMenu: some View {
        Menu {
            if !post.isLocked {
                Button { showCollectionPicker = true } label: {
                    Label("Koleksiyona ekle", systemImage: "folder.badge.plus")
                }
                .accessibilityIdentifier("post-add-to-collection")
            }
            if post.isLocationNote { openARButton }
            if !ownsPost {
                Button(role: .destructive) { confirmBlock = true } label: {
                    // An anonymous mute affects this viewer only and never opens an author profile.
                    Label(post.isAnonymous ? String(localized: "Bu yazarın notlarını gizle") : String(localized: "Kullanıcıyı engelle"),
                          systemImage: "person.crop.circle.badge.xmark")
                }
                .accessibilityIdentifier("post-block-user")
            }
        } label: {
            PostActionLabel(title: String(localized: "Diğer"), symbol: "ellipsis", color: LociTheme.textPrimary)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text("Diğer seçenekler"))
        .accessibilityIdentifier("post-more-menu")
    }

    private var openARButton: some View {
        Button("AR’da aç", systemImage: "viewfinder") { showAR = true }
            .accessibilityIdentifier("post-open-ar")
    }

    private var showsSupportEntryPoint: Bool {
        PostSupportAvailability.showsEntryPoints && !ownsPost && !post.isLocked
    }

    private var hasMoreActions: Bool {
        !post.isLocked || !ownsPost || post.isLocationNote
    }

    private var actionColumns: [GridItem] {
        let count = 2 + (ownsPost ? 0 : 1) + (hasMoreActions ? 1 : 0) + (showsSupportEntryPoint ? 1 : 0)
        return Array(repeating: GridItem(.flexible(), spacing: LociTheme.Spacing.m),
                     count: dynamicTypeSize.isAccessibilitySize ? min(2, count) : count)
    }

    private var ownsPost: Bool {
        guard case let .signedIn(user) = session.phase else { return false }
        return post.creatorID == user.id
    }

    private var isGuest: Bool {
        guard case let .signedIn(user) = session.phase else { return false }
        return user.isAnonymousAccount
    }

    /// The author's own comment shows their handle and so reveals who wrote an anonymous note.
    private var commentRevealsAuthor: Bool { post.isAnonymous && ownsPost }

    private var ownHandle: String {
        guard case let .signedIn(user) = session.phase else { return "" }
        return user.handle
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
        commentMutationRevision += 1
        defer { commentMutationRevision += 1 }
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

    private var refreshScope: String {
        "\(commentViewerID?.uuidString ?? "signed-out")|\(post.id.uuidString)|\(post.isLocked)"
    }

    private func load(force: Bool = true, automatic: Bool = false) async {
        let revision = ContentUpdates.shared.revision
        if refreshGate.prepare(scope: refreshScope, revision: revision) { comments = []; olderCommentsCursor = nil }
        guard !isLoadingOlderComments, !isCommentSending, !isLikeMutating, !isSaveMutating,
              !(automatic && hasLoadedOlder && loadedRevision == revision),
              let ticket = refreshGate.begin(scope: refreshScope, revision: revision, force: force) else { return }
        let requestID = ticket.id
        let viewerID = commentViewerID
        let mutationRevision = commentMutationRevision
        let likeRevision = likeTaps, saveRevision = saveTaps
        commentsLoadID = requestID
        if loadedRevision != nil && loadedRevision != revision { comments = []; olderCommentsCursor = nil }
        var succeeded = false
        var failure: Error?
        commentsFailed = false
        message = nil
        isLoadingOlderComments = false
        isLoading = comments.isEmpty
        defer {
            if refreshGate.isCurrent(ticket, scope: refreshScope, revision: ContentUpdates.shared.revision) { isLoading = false }
            refreshGate.finish(ticket, succeeded: succeeded, error: failure)
        }
        if !post.isLocked { await recordViewIfNeeded() }
        if post.sponsorship != nil { succeeded = true; return }
        guard isCurrentCommentsLoad(requestID, viewerID: viewerID), revision == ContentUpdates.shared.revision,
              mutationRevision == commentMutationRevision else { return }
        if UITestFixtures.sampleContentEnabled {
            comments = UITestFixtures.comments
            collections = []; loadedRevision = revision; succeeded = true
            return
        }
        guard container.isBackendConfigured || session.isLocalPreview else { return }
        if !post.isLocked {
        do {
            let page = try await container.social.commentPage(for: post.id, before: nil)
            guard isCurrentCommentsLoad(requestID, viewerID: viewerID), revision == ContentUpdates.shared.revision,
                  mutationRevision == commentMutationRevision else { return }
            comments = LociComment.merging([], with: page.comments)
            olderCommentsCursor = page.olderCursor
            commentsNeedVisit = false
        } catch {
            guard isCurrentCommentsLoad(requestID, viewerID: viewerID), revision == ContentUpdates.shared.revision,
                  mutationRevision == commentMutationRevision else { return }
            commentsFailed = true; failure = error
            if let backend = error as? BackendCallError, case .rejected = backend {
                comments = []; olderCommentsCursor = nil
                // The server allows comments on another author's location note only after an on-site read.
                commentsNeedVisit = post.isLocationNote && !ownsPost && backend.isPermissionDenied
            }
        }
        }
        if !automatic, case let .signedIn(user) = session.phase {
            async let membership = container.social.membership(postID: post.id, userID: user.id)
            let membershipResult = try? await membership
            guard isCurrentCommentsLoad(requestID, viewerID: viewerID), revision == ContentUpdates.shared.revision else { return }
            if let membershipResult {
                if saveTaps == saveRevision { saved = membershipResult.saved }
                if likeTaps == likeRevision { liked = membershipResult.liked }
                if saveTaps == saveRevision, likeTaps == likeRevision { membershipKnown = true }
            }
        }
        loadedRevision = revision; hasLoadedOlder = false; succeeded = !commentsFailed
    }

    private func loadCollections() async {
        guard !collectionsLoading, case let .signedIn(user) = session.phase else { return }
        collectionsLoading = true; collectionsMessage = nil; collections = []
        defer { collectionsLoading = false }
        do {
            let result = try await container.social.collections(for: user.id)
            guard !Task.isCancelled, commentViewerID == user.id else { return }
            collections = result
        } catch {
            guard !Task.isCancelled, commentViewerID == user.id else { return }
            collectionsMessage = String(localized: "Koleksiyonlar şu anda yüklenemiyor.")
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
        guard !isLoading, !isLoadingOlderComments, !refreshGate.isInFlight, let cursor = olderCommentsCursor else { return }
        let revision = ContentUpdates.shared.revision
        guard let pageTicket = paginationGate.begin(scope: "\(refreshScope)|\(cursor.documentID)", revision: revision, force: true) else { return }
        var pageSucceeded = false
        var pageFailure: Error?
        defer { paginationGate.finish(pageTicket, succeeded: pageSucceeded, error: pageFailure) }
        let requestID = commentsLoadID
        let viewerID = commentViewerID
        let mutationRevision = commentMutationRevision
        isLoadingOlderComments = true
        message = nil
        defer { if commentsLoadID == requestID { isLoadingOlderComments = false } }
        do {
            let page = try await container.social.commentPage(for: post.id, before: cursor)
            guard isCurrentCommentsLoad(requestID, viewerID: viewerID), revision == ContentUpdates.shared.revision,
                  mutationRevision == commentMutationRevision else { return }
            pageSucceeded = true
            hasLoadedOlder = true
            comments = LociComment.merging(comments, with: page.comments)
            olderCommentsCursor = page.olderCursor
        } catch {
            guard isCurrentCommentsLoad(requestID, viewerID: viewerID), revision == ContentUpdates.shared.revision,
                  mutationRevision == commentMutationRevision else { return }
            pageFailure = error
            message = String(localized: "Yorumlar şu anda yüklenemiyor. Tekrar dene.")
        }
    }
    /// A tap before the opening load returned membership would flip a guessed state (and move the
    /// counter the wrong way on an already liked post), so read the real state first.
    private func ensureMembership(userID: UUID) async {
        guard !membershipKnown, !session.isLocalPreview, container.isBackendConfigured,
              let membership = try? await container.social.membership(postID: post.id, userID: userID),
              case let .signedIn(current) = session.phase, current.id == userID else { return }
        liked = membership.liked
        saved = membership.saved
        membershipKnown = true
    }

    private func toggleLike() async {
        guard !isLikeMutating else { return }
        guard case let .signedIn(user) = session.phase else { return }
        isLikeMutating = true
        defer { isLikeMutating = false }
        await ensureMembership(userID: user.id)
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
        if session.isLocalPreview { didCountView = true; viewCount += 1; return }
        guard case let .signedIn(user) = session.phase else { return }
        didCountView = true
        do {
            let count = try await container.social.recordView(postID: post.id, userID: user.id)
            guard !Task.isCancelled, commentViewerID == user.id else { return }
            if let count { viewCount = count }
        } catch {
            // A failed mutation is not remembered as a successful daily receipt.
            didCountView = false
        }
    }
    private func toggleSaved() async {
        guard !isSaveMutating else { return }
        guard case let .signedIn(user) = session.phase, container.isBackendConfigured || session.isLocalPreview else { return }
        isSaveMutating = true
        defer { isSaveMutating = false }
        await ensureMembership(userID: user.id)
        saveTaps += 1
        do { try await container.social.setSaved(!saved, postID: post.id, userID: user.id); saved.toggle() } catch { message = String(localized: "Kaydetme durumu güncellenemedi.") }
    }
    private func addComment() async {
        guard !isCommentSending else { return }
        guard case let .signedIn(user) = session.phase, container.isBackendConfigured || session.isLocalPreview else { return }
        let cleanText = commentText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanText.isEmpty, cleanText.count <= 500 else { message = String(localized: "Yorum en fazla 500 karakter olabilir."); return }
        isCommentSending = true
        commentMutationRevision += 1
        defer { isCommentSending = false; commentMutationRevision += 1 }
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
        } catch BackendCallError.rejected(_, _, let reason) where reason == "rate_limited" {
            message = String(localized: "Şikâyet sınırına ulaştın. Biraz sonra tekrar dene.")
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
            if post.isAnonymous {
                try await container.social.blockAnonymousAuthor(postID: post.id, userID: user.id)
            } else {
                try await container.social.setBlocked(true, targetID: post.creatorID, userID: user.id)
            }
            // The creator's content must disappear right away, including this screen.
            dismiss()
        } catch {
            message = String(localized: "Kullanıcı engellenemedi.")
        }
    }
    private func add(to collection: LociCollection) async {
        guard container.isBackendConfigured else { return }
        do { try await container.social.add(postID: post.id, to: collection.id); message = String(localized: "\(collection.title) koleksiyonuna eklendi.") }
        catch { message = String(localized: "Koleksiyona eklenemedi.") }
    }

    private var creatorUser: LociUser {
        LociUser(id: post.creatorID, handle: post.isAnonymous ? String(localized: "Anonim") : post.creatorHandle ?? "loci")
    }
}
