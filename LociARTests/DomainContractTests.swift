import XCTest
@testable import LociAR

final class DomainContractTests: XCTestCase {
    func testAnchorBundleV2RoundTrip() throws {
        let id = UUID()
        let anchor = SurfaceAnchor(
            id: id,
            transform: Array(repeating: 0, count: 16),
            pinQuality: .planeGeometry,
            hitSource: .planeGeometry,
            surfaceAlignment: .vertical,
            trackingQuality: .normal,
            worldMappingStatus: .mapped,
            geoPose: GeoPose(latitude: 41.0082, longitude: 28.9784, altitude: 35, heading: 90, accuracy: 5)
        )
        let encoder = JSONEncoder(); encoder.dateEncodingStrategy = .iso8601
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode(AnchorBundle.self, from: encoder.encode(AnchorBundle(anchor: anchor)))
        XCTAssertEqual(decoded.schemaVersion, 2)
        XCTAssertEqual(decoded.anchor.id, id)
        XCTAssertEqual(decoded.anchor.pinQuality, .planeGeometry)
        XCTAssertEqual(decoded.anchor.geoPose, anchor.geoPose)
    }

    func testLegacyBundleDecodesWithoutSchemaVersion() throws {
        let data = Data(#"{"provider":"arkit","coordinateSpace":"arkit_world","planeTransform":[1,0,0,0],"trackingQuality":"normal","surfaceAlignment":"vertical"}"#.utf8)
        let bundle = try JSONDecoder().decode(AnchorBundle.self, from: data)
        XCTAssertEqual(bundle.schemaVersion, 1)
        XCTAssertEqual(bundle.anchor.hitSource, .legacyUnknown)
        XCTAssertEqual(bundle.anchor.surfaceAlignment, .vertical)
    }

    func testApproximateIsNeverPhysicalSurface() {
        XCTAssertFalse(PinQuality.freeSpaceApproximate.isPhysicalSurface)
        XCTAssertTrue(PinQuality.planeGeometry.isPhysicalSurface)
        XCTAssertTrue(PinQuality.estimatedPlane.isPhysicalSurface)
    }

    func testWorldMapGate() {
        XCTAssertFalse(WorldMappingQuality.notAvailable.canPersist)
        XCTAssertTrue(WorldMappingQuality.limited.canPersist)
        XCTAssertTrue(WorldMappingQuality.extending.canPersist)
        XCTAssertTrue(WorldMappingQuality.mapped.canPersist)
    }

    func testPublicDiscoverOmitsEighteenPlusAndProtectedZonePosts() {
        XCTAssertTrue(PublicSafetyPolicy.isListedInPublicDiscover(makePost(status: .active, visibility: .public, ageRating: .all)))
        XCTAssertFalse(PublicSafetyPolicy.isListedInPublicDiscover(makePost(status: .active, visibility: .public, ageRating: .plus18)))
        XCTAssertFalse(PublicSafetyPolicy.isListedInPublicDiscover(makePost(status: .blockedProtectedZone, visibility: .public, ageRating: .all)))
        XCTAssertFalse(PublicSafetyPolicy.isListedInPublicDiscover(makePost(status: .pendingReview, visibility: .public, ageRating: .all)))
        XCTAssertFalse(PublicSafetyPolicy.isListedInPublicDiscover(makePost(status: .active, visibility: .private, ageRating: .all)))
    }

    func testCreatePolicyRejectsEighteenPlusAndProtectedZone() {
        XCTAssertEqual(
            PublicSafetyPolicy.createRejectionReason(for: makePost(status: .active, visibility: .public, ageRating: .plus18)),
            "18+ içerik bu sürümde kabul edilmez."
        )
        XCTAssertEqual(
            PublicSafetyPolicy.createRejectionReason(for: makePost(status: .blockedProtectedZone, visibility: .public, ageRating: .all)),
            "Bu korumalı bölgede post yayınlanamaz."
        )
        XCTAssertNil(PublicSafetyPolicy.createRejectionReason(for: makePost(status: .active, visibility: .public, ageRating: .all)))
    }

    func testWorldLockPersistenceExpiryCalculations() {
        let now = Date()
        let expired = WorldLockPersistence(
            originalNativeAnchorId: UUID(),
            hostedAt: now.addingTimeInterval(-86400 * 30),
            expiresAt: now.addingTimeInterval(-3600)
        )
        XCTAssertTrue(expired.isExpired)
        XCTAssertFalse(expired.expiresWithin24Hours)

        let expiringSoon = WorldLockPersistence(
            originalNativeAnchorId: UUID(),
            hostedAt: now,
            expiresAt: now.addingTimeInterval(3600 * 4)
        )
        XCTAssertFalse(expiringSoon.isExpired)
        XCTAssertTrue(expiringSoon.expiresWithin24Hours)

        let fresh = WorldLockPersistence(
            originalNativeAnchorId: UUID(),
            hostedAt: now,
            expiresAt: now.addingTimeInterval(86400 * 10)
        )
        XCTAssertFalse(fresh.isExpired)
        XCTAssertFalse(fresh.expiresWithin24Hours)

        let indefinite = WorldLockPersistence(
            originalNativeAnchorId: UUID(),
            hostedAt: now,
            expiresAt: nil
        )
        XCTAssertFalse(indefinite.isExpired)
        XCTAssertFalse(indefinite.expiresWithin24Hours)
    }

    @MainActor
    func testAppRouterDeepLinkPostParsing() {
        let router = AppRouter()
        let postUUID = UUID()
        let validURL = URL(string: "lociar://post/\(postUUID.uuidString)")!
        let result = router.handleDeepLink(validURL)
        XCTAssertTrue(result)
        XCTAssertEqual(router.pendingPostID, postUUID)
        XCTAssertEqual(router.selectedTab, .discover)

        let invalidScheme = URL(string: "https://post/\(postUUID.uuidString)")!
        XCTAssertFalse(router.handleDeepLink(invalidScheme))

        let invalidHost = URL(string: "lociar://invalid/\(postUUID.uuidString)")!
        XCTAssertFalse(router.handleDeepLink(invalidHost))

        let invalidUUID = URL(string: "lociar://post/not-a-uuid")!
        XCTAssertFalse(router.handleDeepLink(invalidUUID))
    }

    @MainActor
    func testNotificationServiceDeviceTokenFormatting() {
        let service = NotificationService.shared
        let bytes: [UInt8] = [0x12, 0x34, 0xAB, 0xCD, 0xEF]
        let tokenData = Data(bytes)
        service.didRegisterForRemoteNotifications(deviceToken: tokenData)
        XCTAssertEqual(service.deviceTokenString, "1234abcdef")
    }

    func testSpatialContentRendererMemoryPressureClearsSafely() async {
        let renderer = SpatialContentRenderer()
        await renderer.handleMemoryPressure()
    }

    private func makePost(status: PostStatus, visibility: Visibility, ageRating: AgeRating) -> LociPost {
        LociPost(
            id: UUID(), creatorID: UUID(), createdAt: Date(), caption: "Test",
            status: status, visibility: visibility, ageRating: ageRating,
            anchorBundle: AnchorBundle(anchor: SurfaceAnchor(
                transform: Array(repeating: 0, count: 16), pinQuality: .planeGeometry,
                hitSource: .planeGeometry, surfaceAlignment: .vertical,
                trackingQuality: .normal, worldMappingStatus: .mapped
            )),
            editData: EditData(), counts: PostCounts()
        )
    }
}
