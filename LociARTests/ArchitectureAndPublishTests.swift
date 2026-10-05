import SwiftData
import SwiftUI
import UIKit
import XCTest
@testable import LociAR

@MainActor
final class ArchitectureAndPublishTests: XCTestCase {
    func testFeatureLayerDoesNotConstructInfrastructureAdapters() throws {
        let root = try sourceCheckoutRoot()
        let featureRoot = root.appendingPathComponent("LociAR/Features")
        let files = try swiftFiles(below: featureRoot)
        let forbidden = ["FirestorePostRepository(", "FirestoreSocialRepository(", "FirebaseAuthRepository(", "WorldMapStore(", "Firestore.firestore()", "Storage.storage()"]

        for file in files {
            let source = try String(contentsOf: file, encoding: .utf8)
            for token in forbidden {
                XCTAssertFalse(source.contains(token), "\(file.lastPathComponent) infrastructure adapter kurmamalı: \(token)")
            }
        }
    }

    func testApplicationOwnsExactlyOneARPinningEngine() throws {
        let root = try sourceCheckoutRoot()
        let files = try swiftFiles(below: root.appendingPathComponent("LociAR"))
        let count = try files.reduce(into: 0) { result, file in
            let source = try String(contentsOf: file, encoding: .utf8)
            result += source.components(separatedBy: "ARPinningEngine()").count - 1
        }
        XCTAssertEqual(count, 1, "ARSession sahibi yalnız AppContainer olmalı")
    }

    func testUITestAuthenticationBypassIsDebugOnly() throws {
        let root = try sourceCheckoutRoot()
        let sessionSource = try String(
            contentsOf: root.appendingPathComponent("LociAR/AppCore/AppSession.swift"),
            encoding: .utf8
        )
        let debugGuard = try XCTUnwrap(sessionSource.range(of: "#if DEBUG"))
        let bypass = try XCTUnwrap(sessionSource.range(of: "UITestFixtures.authenticatedSessionEnabled"))
        let debugEnd = try XCTUnwrap(sessionSource.range(of: "#endif", range: bypass.lowerBound..<sessionSource.endIndex))
        XCTAssertLessThan(debugGuard.lowerBound, bypass.lowerBound)
        XCTAssertLessThan(bypass.lowerBound, debugEnd.lowerBound)
    }

    func testStorageRulesKeepAssetsPrivateAndOwnerScoped() throws {
        let root = try sourceCheckoutRoot()
        let rules = try String(contentsOf: root.appendingPathComponent("storage.rules"), encoding: .utf8)
        XCTAssertTrue(rules.contains("request.auth.token.luid == luid"))
        XCTAssertTrue(rules.contains("match /post-world-maps/{luid}/{postId}/{file}"))
        XCTAssertTrue(rules.contains("match /{allPaths=**} {\n      allow read, write: if false;"))
        XCTAssertFalse(rules.contains("allow read: if true;\n      allow create, update: if owner(luid) && maxMB(50)"))
    }

    func testNativeCreatePostValidatesPrivateWorldMapStorageContract() throws {
        let root = try sourceCheckoutRoot()
        let function = try String(
            contentsOf: root.appendingPathComponent("functions/src/placement.ts"),
            encoding: .utf8
        )
        XCTAssertTrue(function.contains("persistence.storagePath ?? persistence.assetURI ?? persistence.assetUri"))
        XCTAssertTrue(function.contains("path?.toLowerCase() === expected ? path : null"))
        XCTAssertTrue(function.contains("objectExists(nativeWorldMapPath(anchor, luid, postId))"))
        XCTAssertTrue(function.contains("hasValidPersistentResolver(anchor, worldMapExists)"))
        XCTAssertTrue(function.contains("hasStrictARKitWorldLockEvidence(body)"))
        XCTAssertTrue(function.contains("anchor.id ?? anchor.nativeAnchorId"))
        XCTAssertTrue(function.contains("nested && typeof nested === 'object'"))
        XCTAssertTrue(function.contains("anchor.pinQuality === 'planeGeometry'"))
        XCTAssertTrue(function.contains("anchor.worldMappingStatus === 'extending' || anchor.worldMappingStatus === 'mapped'"))
    }

    func testPhysicalShareFlowCannotSilentlySkipWorldMapPersistence() throws {
        let root = try sourceCheckoutRoot()
        let source = try String(
            contentsOf: root.appendingPathComponent("LociAR/Features/AR/ARExperienceView.swift"),
            encoding: .utf8
        )
        XCTAssertTrue(source.contains(".disabled(isPreparingContent || !canPrepareContent)"))
        XCTAssertTrue(source.contains("errorMessage = (error as? LocalizedError)?.errorDescription"))
        XCTAssertFalse(source.contains("Keep the live physical pin"))
    }

    func testLimitedWorldMapUIIsFailClosedAndOffersRecovery() throws {
        let root = try sourceCheckoutRoot()
        let createSource = try String(
            contentsOf: root.appendingPathComponent("LociAR/Features/Create/CreatePostView.swift"),
            encoding: .utf8
        )
        let arSource = try String(
            contentsOf: root.appendingPathComponent("LociAR/Features/AR/ARExperienceView.swift"),
            encoding: .utf8
        )

        XCTAssertTrue(createSource.contains(".disabled(!canUsePlacement(anchor))"))
        XCTAssertTrue(createSource.contains("engine.mappingQuality.canPersist"))
        XCTAssertFalse(createSource.contains("Yine de sabitleyebilirsin"))
        XCTAssertTrue(createSource.contains("Button(\"Tekrar tara\""))
        XCTAssertTrue(arSource.contains("Çevre haritası hazır olmadı"))
        XCTAssertTrue(arSource.contains("accessibilityIdentifier(\"ar-cancel-mapping\")"))
        XCTAssertTrue(arSource.contains(".onChange(of: canPrepareContent)"))
        XCTAssertTrue(arSource.contains("accessibilityIdentifier(\"ar-mapping-diagnostic\")"))
    }

    func testARWorldMappingUsesDeviceOptimizedCameraAndBoundedCaptureRetry() throws {
        let root = try sourceCheckoutRoot()
        let source = try String(
            contentsOf: root.appendingPathComponent("LociAR/ARCore/ARPinningEngine.swift"),
            encoding: .utf8
        )

        XCTAssertFalse(source.contains("configuration.videoFormat ="))
        XCTAssertTrue(source.contains("configuration.sceneReconstruction = .mesh"))
        XCTAssertEqual(ARPinningEngine.mappingReadinessTimeoutSeconds, 15)
        XCTAssertEqual(ARPinningEngine.worldMapCaptureMaximumAttempts, 6)
        XCTAssertTrue(source.contains("Yalnız tahmini yüzey bulundu"))
    }

    func testSinglePostDeletionAlsoCleansPrivateRemoteAssets() throws {
        let root = try sourceCheckoutRoot()
        let source = try String(
            contentsOf: root.appendingPathComponent("LociAR/Data/PostRepository.swift"),
            encoding: .utf8
        )
        let function = try String(contentsOf: root.appendingPathComponent("functions/src/posts.ts"), encoding: .utf8)
        let media = try String(contentsOf: root.appendingPathComponent("LociAR/Data/WorldMapStore.swift"), encoding: .utf8)
        XCTAssertTrue(source.contains("callables.call(\"deleteOwnPost\""))
        XCTAssertTrue(source.contains("await MediaAssetStore.removeRemoteAssets(ownerID: post.creatorID, postID: post.id)"))
        XCTAssertTrue(function.contains("await deleteStoragePrefix(`${caller.luid}/${postId.toLowerCase()}/`);"))
        XCTAssertTrue(media.contains("\"post-world-maps\", \"post-reference-images\", \"post-layer-assets\""))
        XCTAssertFalse(source.contains("removeOwnPosts()"))
    }

    func testLocationPermissionRequiresExplicitFeatureStart() throws {
        let root = try sourceCheckoutRoot()
        let controller = try String(
            contentsOf: root.appendingPathComponent("LociAR/AppCore/LocationController.swift"),
            encoding: .utf8
        )
        let geoCapture = try String(
            contentsOf: root.appendingPathComponent("LociAR/ARCore/GeoPoseCaptureService.swift"),
            encoding: .utf8
        )
        XCTAssertTrue(controller.contains("guard wantsLocationUpdates else { return }"))
        XCTAssertTrue(geoCapture.contains("guard continuation != nil else { return }"))
    }

    func testAppLaunchNeverDeletesUserPostsOrDrafts() throws {
        let root = try sourceCheckoutRoot()
        let rootView = try String(
            contentsOf: root.appendingPathComponent("LociAR/AppCore/RootView.swift"),
            encoding: .utf8
        )

        XCTAssertFalse(rootView.contains("removeOwnPosts()"), "Uygulama açılışı uzak kullanıcı postlarını silmemeli")
        XCTAssertFalse(
            rootView.contains("modelContext.delete(model: DraftRecord.self)"),
            "Uygulama açılışı yerel taslakları topluca silmemeli"
        )
    }

    func testPublishFailureLeavesCrashSafeDraftAndQueue() async throws {
        let context = try makeContext()
        let coordinator = PublishPostCoordinator(postRepository: PublishRepositoryStub(shouldFail: true))

        let outcome = try await coordinator.submit(UITestFixtures.post, attemptRemote: true, modelContext: context)

        XCTAssertEqual(outcome, .queued(.backendUnavailable))
        XCTAssertEqual(try context.fetch(FetchDescriptor<DraftRecord>()).count, 1)
        let queued = try XCTUnwrap(context.fetch(FetchDescriptor<SyncQueueRecord>()).first)
        XCTAssertEqual(queued.ownerID, UITestFixtures.post.creatorID)
        XCTAssertEqual(queued.operation, "publish_post")
        XCTAssertEqual(queued.attemptCount, 1)
        XCTAssertNotNil(queued.lastErrorMessage)
    }

    func testRejectedPublishStopsAutomaticRetryAndKeepsDraft() async throws {
        let context = try makeContext()
        let coordinator = PublishPostCoordinator(postRepository: PublishRepositoryStub(
            shouldFail: false,
            rejectionMessage: "Korumalı bölge"
        ))

        let outcome = try await coordinator.submit(UITestFixtures.post, attemptRemote: true, modelContext: context)

        XCTAssertEqual(outcome, .rejected("Korumalı bölge"))
        XCTAssertEqual(try context.fetch(FetchDescriptor<DraftRecord>()).count, 1)
        let queued = try XCTUnwrap(context.fetch(FetchDescriptor<SyncQueueRecord>()).first)
        XCTAssertEqual(queued.attemptCount, RetryPolicy.maximumAttempts)
        XCTAssertEqual(queued.deadLetterReason, "Korumalı bölge")
    }

    func testPublishSuccessCleansDurableWorkOnlyAfterRemoteSuccess() async throws {
        let context = try makeContext()
        let repository = PublishRepositoryStub(shouldFail: false)
        let coordinator = PublishPostCoordinator(postRepository: repository)

        let outcome = try await coordinator.submit(UITestFixtures.post, attemptRemote: true, modelContext: context)

        XCTAssertEqual(outcome, .published(PostPublishReceipt(
            postID: UITestFixtures.post.id,
            status: .active,
            placementState: "arkit_world_locked",
            idempotentReplay: false
        )))
        let publishedCount = await repository.publishedCount
        XCTAssertEqual(publishedCount, 1)
        XCTAssertTrue(try context.fetch(FetchDescriptor<DraftRecord>()).isEmpty)
        XCTAssertTrue(try context.fetch(FetchDescriptor<SyncQueueRecord>()).isEmpty)
    }

    func testRetrySuccessCleansQueueAndMatchingDraft() async throws {
        let context = try makeContext()
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let payload = try encoder.encode(UITestFixtures.post)
        context.insert(DraftRecord(id: UITestFixtures.post.id, ownerID: UITestFixtures.post.creatorID, payload: payload))
        context.insert(SyncQueueRecord(id: UITestFixtures.post.id, ownerID: UITestFixtures.post.creatorID, operation: "publish_post", payload: payload))
        try context.save()

        await SyncQueueProcessor.process(
            modelContext: context,
            repository: PublishRepositoryStub(shouldFail: false),
            authenticatedUserID: UITestFixtures.creator.id
        )

        XCTAssertTrue(try context.fetch(FetchDescriptor<DraftRecord>()).isEmpty)
        XCTAssertTrue(try context.fetch(FetchDescriptor<SyncQueueRecord>()).isEmpty)
    }

    func testQueueOwnedByAnotherAccountIsNeverReboundOrPublished() async throws {
        let context = try makeContext()
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let payload = try encoder.encode(UITestFixtures.post)
        context.insert(SyncQueueRecord(ownerID: UITestFixtures.post.creatorID, operation: "publish_post", payload: payload))
        try context.save()
        let repository = PublishRepositoryStub(shouldFail: false)
        let authenticatedUserID = UUID()

        await SyncQueueProcessor.process(
            modelContext: context,
            repository: repository,
            authenticatedUserID: authenticatedUserID
        )

        let publishedCount = await repository.publishedCount
        XCTAssertEqual(publishedCount, 0)
        XCTAssertEqual(try context.fetch(FetchDescriptor<SyncQueueRecord>()).count, 1)
    }

    func testDeadLetterNeedsExplicitManualRetry() async throws {
        let context = try makeContext()
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let payload = try encoder.encode(UITestFixtures.post)
        let record = SyncQueueRecord(
            ownerID: UITestFixtures.post.creatorID,
            operation: "publish_post",
            payload: payload
        )
        record.deadLetterReason = "Permanent failure"
        context.insert(record)
        try context.save()
        let repository = PublishRepositoryStub(shouldFail: false)

        await SyncQueueProcessor.process(
            modelContext: context,
            repository: repository,
            authenticatedUserID: UITestFixtures.post.creatorID
        )

        let publishedCount = await repository.publishedCount
        XCTAssertEqual(publishedCount, 0)
        XCTAssertEqual(try context.fetch(FetchDescriptor<SyncQueueRecord>()).count, 1)
    }

    func testAuthCallbackRejectsUnexpectedSchemeHostAndPath() {
        XCTAssertTrue(AppSession.isAllowedAuthCallback(URL(string: "lociar://auth-callback?code=abc")!))
        XCTAssertTrue(AppSession.isAllowedAuthCallback(URL(string: "lociar://password-reset#access_token=abc")!))
        XCTAssertFalse(AppSession.isAllowedAuthCallback(URL(string: "https://auth-callback?code=abc")!))
        XCTAssertFalse(AppSession.isAllowedAuthCallback(URL(string: "lociar://attacker?code=abc")!))
        XCTAssertFalse(AppSession.isAllowedAuthCallback(URL(string: "lociar://auth-callback/unexpected?code=abc")!))
    }

    func testCoreVisibleTextPaletteMeetsWCAGAAContrast() {
        let surface = rgba(UIColor(LociTheme.surface))
        let elevated = rgba(UIColor(LociTheme.elevated))
        let background = rgba(UIColor(LociTheme.background))
        let disabledBackground = rgba(UIColor.white.withAlphaComponent(0.24)).over(surface)
        let pairs: [(String, RGBA, RGBA)] = [
            ("primary/background", rgba(.white), background),
            ("primary/surface", rgba(.white), surface),
            ("secondary/elevated", rgba(UIColor(LociTheme.secondaryText)), elevated),
            ("accent/surface", rgba(UIColor(LociTheme.accent)), surface),
            ("disabled primary", rgba(.white), disabledBackground)
        ]

        for (name, foreground, canvas) in pairs {
            let ratio = contrastRatio(foreground.over(canvas), canvas)
            XCTAssertGreaterThanOrEqual(ratio, 4.5, "\(name) contrast ratio: \(ratio)")
        }
    }

    func testSuccessfulPublishRemovesOwnedStagedMedia() async throws {
        let context = try makeContext()
        let localURL = try await MediaAssetStore.stage(
            data: Data(repeating: 0x42, count: 128),
            id: UUID(),
            isVideo: true
        )
        var post = UITestFixtures.post
        post.contentSource = .video(localURL)
        let coordinator = PublishPostCoordinator(postRepository: PublishRepositoryStub(shouldFail: false))

        XCTAssertTrue(FileManager.default.fileExists(atPath: localURL.path))
        let outcome = try await coordinator.submit(post, attemptRemote: true, modelContext: context)
        XCTAssertEqual(outcome, .published(PostPublishReceipt(
            postID: post.id,
            status: .active,
            placementState: "arkit_world_locked",
            idempotentReplay: false
        )))
        XCTAssertFalse(FileManager.default.fileExists(atPath: localURL.path))
    }

    private func makeContext() throws -> ModelContext {
        let schema = Schema([DraftRecord.self, SyncQueueRecord.self, PreferenceRecord.self])
        let configuration = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        return ModelContext(try ModelContainer(for: schema, configurations: [configuration]))
    }

    private func swiftFiles(below root: URL) throws -> [URL] {
        let keys: [URLResourceKey] = [.isRegularFileKey]
        let enumerator = FileManager.default.enumerator(at: root, includingPropertiesForKeys: keys)
        return (enumerator?.allObjects as? [URL] ?? []).filter { $0.pathExtension == "swift" }
    }

    private func sourceCheckoutRoot() throws -> URL {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        guard FileManager.default.fileExists(atPath: root.appendingPathComponent("LociAR.xcodeproj").path) else {
            throw XCTSkip("Bu mimari denetim Mac üzerindeki kaynak checkout'unu gerektirir.")
        }
        return root
    }

    private struct RGBA {
        let red: Double
        let green: Double
        let blue: Double
        let alpha: Double

        func over(_ background: RGBA) -> RGBA {
            RGBA(
                red: red * alpha + background.red * (1 - alpha),
                green: green * alpha + background.green * (1 - alpha),
                blue: blue * alpha + background.blue * (1 - alpha),
                alpha: 1
            )
        }
    }

    private func rgba(_ color: UIColor) -> RGBA {
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 0
        XCTAssertTrue(color.resolvedColor(with: UITraitCollection(userInterfaceStyle: .dark)).getRed(
            &red, green: &green, blue: &blue, alpha: &alpha
        ))
        return RGBA(red: red, green: green, blue: blue, alpha: alpha)
    }

    private func contrastRatio(_ foreground: RGBA, _ background: RGBA) -> Double {
        let lighter = max(relativeLuminance(foreground), relativeLuminance(background))
        let darker = min(relativeLuminance(foreground), relativeLuminance(background))
        return (lighter + 0.05) / (darker + 0.05)
    }

    private func relativeLuminance(_ color: RGBA) -> Double {
        func linearize(_ component: Double) -> Double {
            component <= 0.04045 ? component / 12.92 : pow((component + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * linearize(color.red)
            + 0.7152 * linearize(color.green)
            + 0.0722 * linearize(color.blue)
    }
}

private actor PublishRepositoryStub: PostRepository {
    let shouldFail: Bool
    let rejectionMessage: String?
    private(set) var publishedCount = 0
    private(set) var lastPublishedCreatorID: UUID?

    init(shouldFail: Bool, rejectionMessage: String? = nil) {
        self.shouldFail = shouldFail
        self.rejectionMessage = rejectionMessage
    }

    func nearby(latitude: Double, longitude: Double, radiusMeters: Double) async throws -> [LociPost] { [] }
    func discover() async throws -> [LociPost] { [] }
    func publish(_ post: LociPost) async throws -> PostPublishReceipt {
        if let rejectionMessage { throw PostPublishError.rejected(rejectionMessage) }
        if shouldFail { throw StubFailure.expected }
        publishedCount += 1
        lastPublishedCreatorID = post.creatorID
        return PostPublishReceipt(
            postID: post.id,
            status: .active,
            placementState: "arkit_world_locked",
            idempotentReplay: false
        )
    }
    func myPosts(limit: Int) async throws -> [LociPost] { [] }
    func publicPosts(creatorID: UUID, limit: Int) async throws -> [LociPost] { [] }
    func publicProfile(creatorID: UUID) async throws -> PublicProfileProjection? { nil }
    func publicPost(id: UUID) async throws -> LociPost? { nil }
    func removeOwnPost(id: UUID) async throws {}

    enum StubFailure: Error { case expected }
}

@MainActor
final class AccountScopedDeletionTests: XCTestCase {
    func testAcceptedDeletionResumesWithoutDeletingAnotherAccountsRecordsOrHiddenList() async throws {
        let a = UUID(), b = UUID(), hidden = UUID()
        let schema = Schema([DraftRecord.self, SyncQueueRecord.self, PreferenceRecord.self])
        let container = try ModelContainer(for: schema, configurations: [ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)])
        let context = ModelContext(container)
        let marker = "lociar.acceptedAccountDeletions", previous = UserDefaults.standard.object(forKey: marker)
        UserDefaults.standard.removeObject(forKey: marker)
        defer {
            if let previous { UserDefaults.standard.set(previous, forKey: marker) } else { UserDefaults.standard.removeObject(forKey: marker) }
            UserDefaults.standard.removeObject(forKey: "hidden_post_ids." + b.uuidString.lowercased())
        }
        for owner in [a, b] {
            context.insert(DraftRecord(id: UUID(), ownerID: owner, payload: Data()))
            context.insert(SyncQueueRecord(ownerID: owner, operation: "publish", payload: Data()))
            context.insert(PreferenceRecord(key: owner.uuidString.lowercased() + ".editor", value: "preserved"))
            context.insert(PreferenceRecord(key: "legacy.lociar_saved_posts_v1:user:" + owner.uuidString, value: "legacy scoped"))
            await HiddenPostStore.shared.hide(hidden, owner: owner.uuidString.lowercased())
        }
        try context.save()
        LocalAccountDeletion.markAccepted(a)
        await LocalAccountDeletion.resume(in: context)
        XCTAssertEqual(try context.fetch(FetchDescriptor<DraftRecord>()).map(\.ownerID), [b])
        XCTAssertEqual(try context.fetch(FetchDescriptor<SyncQueueRecord>()).map(\.ownerID), [b])
        XCTAssertEqual(try context.fetch(FetchDescriptor<PreferenceRecord>()).map(\.key).sorted(), [b.uuidString.lowercased() + ".editor", "legacy.lociar_saved_posts_v1:user:" + b.uuidString].sorted())
        let hiddenA = await HiddenPostStore.shared.hiddenIDs(owner: a.uuidString.lowercased())
        let hiddenB = await HiddenPostStore.shared.hiddenIDs(owner: b.uuidString.lowercased())
        XCTAssertTrue(hiddenA.isEmpty)
        XCTAssertEqual(hiddenB, [hidden.uuidString.lowercased()])
        XCTAssertEqual(UserDefaults.standard.stringArray(forKey: marker), [])
        await LocalAccountDeletion.resume(in: context)
        XCTAssertEqual(try context.fetch(FetchDescriptor<DraftRecord>()).count, 1)
    }
}
