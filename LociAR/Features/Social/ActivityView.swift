import AVFoundation
import SwiftUI
import SwiftData
import UIKit

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
