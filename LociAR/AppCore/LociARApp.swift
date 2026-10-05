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
                    NotificationService.shared.onActivityNotificationTapped = {
                        container.router.selectActivity()
                    }
                    await container.session.bootstrap()
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
