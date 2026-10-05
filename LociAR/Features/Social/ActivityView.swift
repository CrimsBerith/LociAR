import AVFoundation
import SwiftUI
import SwiftData

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
                            Text(item.body.localizedUI).font(.headline)
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
