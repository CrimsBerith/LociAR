import Observation

@MainActor
@Observable
final class AppContainer {
    let configuration: AppConfiguration
    let session: AppSession
    let posts: any PostRepository
    let social: any SocialRepository
    let worldMaps: (any WorldMapRepository)?
    let publisher: any PublishPostUseCase
    let arSession: ARPinningEngine
    let connectivity: ConnectivityMonitor
    let router: AppRouter

    var isBackendConfigured: Bool { configuration.isBackendConfigured }

    init(configuration: AppConfiguration = .load()) {
        self.configuration = configuration
        let firebaseReady = configuration.configureFirebaseIfNeeded()
        let auth: any AuthRepository
        let posts: any PostRepository
        let social: any SocialRepository
        let worldMaps: (any WorldMapRepository)?

        if UITestFixtures.authenticatedSessionEnabled {
            auth = UnavailableAuthRepository()
            posts = PreviewPostRepository()
            social = PreviewSocialRepository()
            worldMaps = LocalWorldMapStore()
        } else if firebaseReady, let firebase = configuration.firebase {
            let callables = CallableClient(region: firebase.functionsRegion)
            auth = FirebaseAuthRepository(functionsRegion: firebase.functionsRegion)
            posts = FirestorePostRepository(callables: callables)
            social = FirestoreSocialRepository(callables: callables)
            worldMaps = WorldMapStore()
        } else {
            auth = UnavailableAuthRepository()
            posts = PreviewPostRepository()
            social = PreviewSocialRepository()
            worldMaps = LocalWorldMapStore()
        }

        self.posts = posts
        self.social = social
        self.worldMaps = worldMaps
        self.publisher = PublishPostCoordinator(postRepository: posts)
        self.arSession = ARPinningEngine()
        self.connectivity = ConnectivityMonitor()
        self.router = AppRouter()
        self.session = AppSession(authRepository: auth, backendConfigured: configuration.isBackendConfigured)
    }
}
