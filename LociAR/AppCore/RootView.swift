import SwiftUI
import SwiftData

struct RootView: View {
    @Environment(AppSession.self) private var session
    @Environment(AppContainer.self) private var container
    @Environment(\.modelContext) private var modelContext
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("hasCompletedOnboarding") private var hasCompletedOnboarding = false
    @State private var syncLoop: Task<Void, Never>?

    private var shouldShowOnboarding: Bool {
        #if DEBUG
        if UITestFixtures.signedOutSessionEnabled || UITestFixtures.authenticatedSessionEnabled {
            return false
        }
        #endif
        return !hasCompletedOnboarding
    }

    var body: some View {
        Group {
            if shouldShowOnboarding {
                OnboardingView {
                    hasCompletedOnboarding = true
                }
            } else {
                switch session.phase {
                case .loading:
                    ZStack {
                        LociScreenBackground()
                        VStack(spacing: 16) {
                            Image(systemName: "location.viewfinder")
                                .font(.system(size: 44, weight: .semibold))
                                .foregroundStyle(LociTheme.accent)
                            Text("LociAR").font(.title.bold())
                            ProgressView().tint(LociTheme.accent)
                        }
                    }
                case .signedOut:
                    AuthView()
                case .signedIn(let user):
                    MainTabView(user: user)
                        .id(user.id)
                case .passwordRecovery:
                    PasswordRecoveryView()
                }
            }
        }
        .preferredColorScheme(.dark)
        .task {
            try? LegacyMigrationCoordinator.run(modelContext: modelContext)
            await LocalAccountDeletion.resume(in: modelContext)
        }
        .onChange(of: session.phase) { previous, phase in
            if case let .signedIn(oldUser) = previous,
               case let .signedIn(newUser) = phase, oldUser.id != newUser.id {
                container.router.resetForAuthenticationGate()
            }
            if case .signedIn = phase {
                startSyncLoop()
            } else if case .signedOut = phase {
                stopSyncLoop()
                container.router.resetForAuthenticationGate()
            }
        }
        .onChange(of: container.connectivity.isOnline) { _, online in
            if online {
                Task { await runSyncIfPossible() }
                if !session.isLocalPreview { Task { await NotificationService.shared.refreshForCurrentUser() } }
                startSyncLoop()
            } else {
                stopSyncLoop()
            }
        }
        .onChange(of: scenePhase) { previous, phase in
            if phase == .active {
                if !session.isLocalPreview { Task { await NotificationService.shared.refreshForCurrentUser() } }
                // Only a real return from the background re-validates the session. `.inactive`
                // blips (permission alerts, the Sign in with Apple sheet during account deletion,
                // Control Center) must not re-run ensureProfile or reset password recovery.
                if previous == .background, !session.isLocalPreview { Task { await session.bootstrap() } }
                startSyncLoop()
            } else { stopSyncLoop() }
        }
    }

    private func runSyncIfPossible() async {
        guard !session.isLocalPreview, container.isBackendConfigured, container.connectivity.isOnline,
              case .signedIn = session.phase else { return }
        guard case let .signedIn(user) = session.phase else { return }
        await SyncQueueProcessor.process(
            modelContext: modelContext,
            repository: container.posts,
            authenticatedUserID: user.id
        )
    }

    private func startSyncLoop() {
        guard scenePhase == .active, container.connectivity.isOnline,
              case .signedIn = session.phase else { return }
        syncLoop?.cancel()
        syncLoop = Task {
            while !Task.isCancelled {
                await runSyncIfPossible()
                try? await Task.sleep(for: .seconds(15))
            }
        }
    }

    private func stopSyncLoop() {
        syncLoop?.cancel()
        syncLoop = nil
    }
}
