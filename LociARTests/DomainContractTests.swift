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

    func testPublicDiscoverListsActivePublicPosts() {
        XCTAssertTrue(PublicSafetyPolicy.isListedInPublicDiscover(makePost(status: .active, visibility: .public, ageRating: .all)))
        XCTAssertFalse(PublicSafetyPolicy.isListedInPublicDiscover(makePost(status: .pendingReview, visibility: .public, ageRating: .all)))
        XCTAssertFalse(PublicSafetyPolicy.isListedInPublicDiscover(makePost(status: .active, visibility: .private, ageRating: .all)))
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

    func testGeospatialPoseValidationBoundaries() {
        let valid = GeospatialPose(
            latitude: 41.0082, longitude: 28.9784, altitude: 35.0,
            eusQuaternion: [0.0, 0.0, 0.0, 1.0],
            horizontalAccuracy: 4.9, verticalAccuracy: 2.0, yawAccuracy: 14.9
        )
        XCTAssertTrue(valid.isValid)

        var invalidLat = valid; invalidLat.latitude = 91.0
        XCTAssertFalse(invalidLat.isValid)

        var invalidLon = valid; invalidLon.longitude = 181.0
        XCTAssertFalse(invalidLon.isValid)

        var invalidAlt = valid; invalidAlt.altitude = .nan
        XCTAssertFalse(invalidAlt.isValid)

        var badQuat = valid; badQuat.eusQuaternion = [0.0, 0.0]
        XCTAssertFalse(badQuat.isValid)

        var badHorizontalAccuracy = valid; badHorizontalAccuracy.horizontalAccuracy = 5.1
        XCTAssertFalse(badHorizontalAccuracy.isValid)

        var badYawAccuracy = valid; badYawAccuracy.yawAccuracy = 15.1
        XCTAssertFalse(badYawAccuracy.isValid)

        var negativeAccuracy = valid; negativeAccuracy.horizontalAccuracy = -0.1
        XCTAssertFalse(negativeAccuracy.isValid)
    }

    func testWorldLockPersistenceResolvableCloudAnchorId() {
        let now = Date()
        let cloudValid = WorldLockPersistence(
            kind: .arcoreCloudAnchor,
            originalNativeAnchorId: UUID(),
            cloudAnchorId: "ua-12345",
            hostedAt: now,
            expiresAt: now.addingTimeInterval(86400 * 7)
        )
        XCTAssertEqual(cloudValid.resolvableCloudAnchorId, "ua-12345")

        let cloudExpired = WorldLockPersistence(
            kind: .arcoreCloudAnchor,
            originalNativeAnchorId: UUID(),
            cloudAnchorId: "ua-12345",
            hostedAt: now.addingTimeInterval(-86400 * 30),
            expiresAt: now.addingTimeInterval(-3600)
        )
        XCTAssertNil(cloudExpired.resolvableCloudAnchorId)

        let cloudEmpty = WorldLockPersistence(
            kind: .arcoreCloudAnchor,
            originalNativeAnchorId: UUID(),
            cloudAnchorId: "",
            hostedAt: now,
            expiresAt: now.addingTimeInterval(86400)
        )
        XCTAssertNil(cloudEmpty.resolvableCloudAnchorId)

        let worldMap = WorldLockPersistence(
            kind: .arkitWorldMap,
            originalNativeAnchorId: UUID(),
            cloudAnchorId: "ua-12345",
            hostedAt: now
        )
        XCTAssertNil(worldMap.resolvableCloudAnchorId)
    }

    func testBackendPlacementContractResolverStrategy() {
        let validGeo = GeospatialPose(
            latitude: 41.0, longitude: 29.0, altitude: 10.0,
            eusQuaternion: [0, 0, 0, 1],
            horizontalAccuracy: 3.0, verticalAccuracy: 2.0, yawAccuracy: 10.0
        )
        let persistence = WorldLockPersistence(
            kind: .arcoreCloudAnchor,
            originalNativeAnchorId: UUID(),
            storagePath: "maps/world.map",
            cloudAnchorId: "anchor-99",
            hostedAt: Date()
        )
        let surface = SurfaceAnchor(
            transform: Array(repeating: 0, count: 16),
            pinQuality: .planeGeometry,
            hitSource: .planeGeometry,
            surfaceAlignment: .vertical,
            trackingQuality: .normal,
            worldMappingStatus: .mapped,
            geospatial: validGeo,
            persistence: persistence
        )
        let contract = BackendPlacementContract(anchor: surface)
        XCTAssertEqual(contract.coordinateSpace, "arkit_world")
        XCTAssertEqual(contract.state, "placed")
        XCTAssertEqual(contract.qualityScore, 1.0)
        XCTAssertEqual(contract.resolverStrategy, ["cloud_anchor", "native_anchor", "geospatial", "geo_pose"])

        let approxSurface = SurfaceAnchor(
            transform: Array(repeating: 0, count: 16),
            pinQuality: .freeSpaceApproximate,
            hitSource: .legacyUnknown,
            surfaceAlignment: .horizontal,
            trackingQuality: .normal,
            worldMappingStatus: .notAvailable
        )
        let approxContract = BackendPlacementContract(anchor: approxSurface)
        XCTAssertEqual(approxContract.coordinateSpace, "camera_free_space")
        XCTAssertEqual(approxContract.state, "free_space_approximate")
        XCTAssertEqual(approxContract.qualityScore, 0.22)
        XCTAssertEqual(approxContract.resolverStrategy, ["geo_pose"])
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

extension DomainContractTests {
    func testCommentPagesMergeWithoutDuplicatingTheNewestCommentAndDisplayChronologically() {
        let postID = UUID()
        let userID = UUID()
        func comment(_ number: Int) -> LociComment {
            LociComment(id: UUID(uuidString: String(format: "00000000-0000-0000-0000-%012d", number))!,
                        postID: postID, userID: userID, username: "loci", text: "Comment \(number)",
                        createdAt: Date(timeIntervalSince1970: Double(number)))
        }
        let newest = (151...201).map(comment)
        let older = (101...151).map(comment)
        let merged = LociComment.merging(newest, with: older)
        XCTAssertEqual(merged.count, 101)
        XCTAssertEqual(merged.first?.text, "Comment 101")
        XCTAssertEqual(merged.last?.text, "Comment 201")
        XCTAssertEqual(Set(merged.map(\.id)).count, merged.count)
        XCTAssertEqual(LociComment.merging(merged, with: [comment(201)]).count, merged.count)
    }

    func testCommentPagesHaveDeterministicDisplayOrderWhenTimestampsMatch() {
        let postID = UUID(), userID = UUID(), date = Date(timeIntervalSince1970: 12)
        let lowerID = UUID(uuidString: "00000000-0000-0000-0000-000000000001")!
        let higherID = UUID(uuidString: "00000000-0000-0000-0000-000000000002")!
        let first = LociComment(id: lowerID, postID: postID, userID: userID, username: "loci", text: "First", createdAt: date)
        let second = LociComment(id: higherID, postID: postID, userID: userID, username: "loci", text: "Second", createdAt: date)
        XCTAssertEqual(LociComment.merging([second], with: [first]).map(\.id), [lowerID, higherID])
    }

    func testCommentCursorBindsToItsPostAndPreservesValidNanosecondBoundaries() {
        let postID = UUID()
        let valid = CommentPageCursor(postID: postID, documentID: "comment-id", seconds: 12, nanoseconds: 999_999_999)
        XCTAssertTrue(valid.isValid(for: postID))
        XCTAssertFalse(valid.isValid(for: UUID()))
        XCTAssertFalse(CommentPageCursor(postID: postID, documentID: "other/comment", seconds: 12, nanoseconds: 0).isValid(for: postID))
        XCTAssertFalse(CommentPageCursor(postID: postID, documentID: "comment-id", seconds: 12, nanoseconds: -1).isValid(for: postID))
        XCTAssertFalse(CommentPageCursor(postID: postID, documentID: "comment-id", seconds: 12, nanoseconds: 1_000_000_000).isValid(for: postID))
    }
}
