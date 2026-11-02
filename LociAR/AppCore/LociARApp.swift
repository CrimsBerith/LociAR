import SwiftData
import SwiftUI

@main
struct LociARApp: App {
    @Environment(\.scenePhase) private var scenePhase
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
                    NotificationService.shared.onMapFocusNotificationTapped = { focus in
                        container.router.focusMap(focus)
                    }
                    await container.session.bootstrap()
                    await PostSupportClient.shared.resumeUnfinishedPurchases()
                }
                .onOpenURL { url in
                    if AppSession.isAllowedAuthCallback(url) {
                        Task { await container.session.handleOpenURL(url) }
                    } else {
                        container.router.handleDeepLink(url)
                    }
                }
                .onChange(of: scenePhase, initial: true) { _, phase in
                    UserContextService.shared.setForeground(phase == .active)
                }
                .onChange(of: container.session.phase) { _, phase in
                    if case .signedIn = phase { Task { await PostSupportClient.shared.resumeUnfinishedPurchases() } }
                }
                .onReceive(NotificationCenter.default.publisher(for: UIApplication.didReceiveMemoryWarningNotification)) { _ in
                    ClientReadCaches.clear()
                }
        }
        .modelContainer(for: [DraftRecord.self, SyncQueueRecord.self, PreferenceRecord.self])
    }
}
