import Observation

@MainActor
@Observable
final class AppContainer {
    let configuration: AppConfiguration
    let session: AppSession
    let posts: any PostRepository
    let social: any SocialRepository
    let invites: any InviteRepository
    let worldMaps: (any WorldMapRepository)?
    let publisher: any PublishPostUseCase
    let arSession: ARPinningEngine
    let arcore: ARCoreService
    let connectivity: ConnectivityMonitor
    let router: AppRouter

    var isBackendConfigured: Bool { configuration.isBackendConfigured }

    init(configuration: AppConfiguration = .load()) {
        self.configuration = configuration
        let firebaseReady = configuration.configureFirebaseIfNeeded()
        let auth: any AuthRepository
        let posts: any PostRepository
        let social: any SocialRepository
        let invites: any InviteRepository
        let worldMaps: (any WorldMapRepository)?
        var arcoreCallables: CallableClient?

        if UITestFixtures.authenticatedSessionEnabled {
            auth = UnavailableAuthRepository()
            posts = PreviewPostRepository()
            social = PreviewSocialRepository()
            invites = PreviewInviteRepository()
            worldMaps = LocalWorldMapStore()
        } else if firebaseReady, let firebase = configuration.firebase {
            let callables = CallableClient(region: firebase.functionsRegion)
            // The local emulator suite cannot mint ARCore tokens; ARCore stays off there.
            if configuration.emulatorHost == nil { arcoreCallables = callables }
            auth = FirebaseAuthRepository(functionsRegion: firebase.functionsRegion)
            posts = FirestorePostRepository(callables: callables)
            social = FirestoreSocialRepository(callables: callables)
            invites = FirestoreInviteRepository(callables: callables)
            worldMaps = WorldMapStore()
        } else {
            auth = UnavailableAuthRepository()
            posts = PreviewPostRepository()
            social = PreviewSocialRepository()
            invites = PreviewInviteRepository()
            worldMaps = LocalWorldMapStore()
        }

        self.posts = posts
        self.social = social
        self.invites = invites
        self.worldMaps = worldMaps
        self.publisher = PublishPostCoordinator(postRepository: posts)
        self.arSession = ARPinningEngine()
        // Preview/UI-test builds get an inert service (no callables → never starts ARCore).
        let arcore = ARCoreService(callables: arcoreCallables)
        self.arcore = arcore
        self.connectivity = ConnectivityMonitor()
        self.router = AppRouter()
        self.session = AppSession(authRepository: auth, backendConfigured: configuration.isBackendConfigured)
        // After every stored property is set (Swift requires it before using self).
        arSession.frameSink = { [weak arcore] frame in arcore?.consume(frame) }
    }
}
