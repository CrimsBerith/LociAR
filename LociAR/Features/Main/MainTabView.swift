import SwiftUI

struct MainTabView: View {
    let user: LociUser
    @Environment(AppRouter.self) private var router
    @Environment(AppContainer.self) private var container
    @State private var deepLinkedPost: LociPost?
    @State private var deepLinkMessage: String?

    var body: some View {
        @Bindable var router = router
        let createPresented = Binding(
            get: { router.isCreatePresented || UITestFixtures.openEditorDirectly },
            set: { router.isCreatePresented = $0 }
        )
        TabView(selection: $router.selectedTab) {
            NavigationStack { ARExperienceView() }
                .id("tab-ar")
                .accessibilityElement(children: .contain)
                .tabItem { Label("AR", systemImage: "viewfinder") }
                .tag(AppRouter.Tab.ar)
                .accessibilityIdentifier("tab-ar")

            NavigationStack { MapFeatureView(showCreate: $router.isCreatePresented) }
                .accessibilityElement(children: .contain)
                .tabItem { Label("Harita", systemImage: "map.fill") }
                .tag(AppRouter.Tab.map)
                .accessibilityIdentifier("tab-map")

            NavigationStack { ARExperienceView(mode: .create) }
                .id("tab-create")
                .accessibilityElement(children: .contain)
                .tabItem { Label("Paylaş", systemImage: "plus.circle.fill") }
                .tag(AppRouter.Tab.create)
                .accessibilityIdentifier("tab-create")

            NavigationStack { DiscoverView() }
                .accessibilityElement(children: .contain)
                .tabItem { Label("Keşfet", systemImage: "safari.fill") }
                .tag(AppRouter.Tab.discover)
                .accessibilityIdentifier("tab-discover")

            NavigationStack {
                ProfileView(user: user)
                    .navigationDestination(isPresented: $router.isActivityPresented) { ActivityView() }
            }
                .accessibilityElement(children: .contain)
                .tabItem { Label("Profil", systemImage: "person.crop.circle.fill") }
                .tag(AppRouter.Tab.profile)
                .accessibilityIdentifier("tab-profile")
        }
        .tint(LociTheme.accent)
        .toolbarBackground(.visible, for: .tabBar)
        .toolbarBackground(.ultraThinMaterial, for: .tabBar)
        .sheet(isPresented: createPresented) {
            CreatePostView(anchor: UITestFixtures.editorPreviewEnabled ? UITestFixtures.anchor : nil)
        }
        .sheet(isPresented: Binding(
            get: { UITestFixtures.openPostDirectly },
            set: { _ in }
        )) {
            NavigationStack {
                PostPreviewView(post: UITestFixtures.post)
            }
        }
        .sheet(item: $deepLinkedPost) { post in
            NavigationStack {
                PostPreviewView(post: post)
            }
        }
        .onChange(of: router.pendingPostID, initial: true) { _, postID in
            guard let postID else { return }
            Task {
                let result: Result<LociPost?, Error>
                do { result = .success(try await container.posts.publicPost(id: postID)) } catch { result = .failure(error) }
                guard case let .signedIn(current) = container.session.phase,
                      current.id == user.id, router.pendingPostID == postID else { return }
                switch result {
                case .success(let post?):
                    deepLinkedPost = post
                case .success(nil):
                    router.selectActivity()
                    deepLinkMessage = String(localized: "Bu post bulunamadı ya da artık görüntülenemiyor.")
                case .failure:
                    deepLinkMessage = String(localized: "Post şu anda açılamadı. Bağlantını kontrol edip tekrar dene.")
                }
                router.pendingPostID = nil
            }
        }
        .alert("LociAR", isPresented: Binding(get: { deepLinkMessage != nil }, set: { if !$0 { deepLinkMessage = nil } })) {
            Button("Tamam", role: .cancel) {}
        } message: { Text((deepLinkMessage ?? "").localizedUI) }
    }
}
