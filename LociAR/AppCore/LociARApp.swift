import SwiftData
import SwiftUI

@main
struct LociARApp: App {
    @UIApplicationDelegateAdaptor(LociAppDelegate.self) private var appDelegate
    @State private var container = AppContainer()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(container)
                .environment(container.session)
                .environment(container.arSession)
                .environment(container.router)
                .task {
                    NotificationService.shared.onPostNotificationTapped = { postID in
                        container.router.selectPost(id: postID)
                    }
                    await container.session.bootstrap()
                }
                .onChange(of: container.session.phase) { _, phase in
                    let signedIn: Bool
                    if case .signedIn = phase { signedIn = !container.session.isLocalPreview } else { signedIn = false }
                    Task { await NotificationService.shared.sessionChanged(signedIn: signedIn) }
                }
                .onOpenURL { url in
                    if AppSession.isAllowedAuthCallback(url) {
                        Task { await container.session.handleOpenURL(url) }
                    } else {
                        container.router.handleDeepLink(url)
                    }
                }
        }
        .modelContainer(for: [DraftRecord.self, SyncQueueRecord.self, PreferenceRecord.self])
    }
}
