import CoreLocation
import UIKit
import XCTest
@testable import LociAR

final class BackendAndPolicyTests: XCTestCase {
    func testV2AnchorEncoderPreservesLegacyTopLevelShape() throws {
        let anchor = SurfaceAnchor(
            transform: Array(repeating: 0, count: 16), pinQuality: .estimatedPlane,
            hitSource: .estimatedPlane, surfaceAlignment: .horizontal,
            trackingQuality: .normal, worldMappingStatus: .mapped,
            geoPose: GeoPose(latitude: 41, longitude: 29, heading: 15)
        )
        let encoder = JSONEncoder(); encoder.dateEncodingStrategy = .iso8601
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: encoder.encode(AnchorBundle(anchor: anchor))) as? [String: Any])
        XCTAssertEqual(json["schemaVersion"] as? Int, 2)
        XCTAssertNotNil(json["nativeAnchorId"])
        XCTAssertNotNil(json["planeTransform"])
        XCTAssertEqual(json["pinQuality"] as? String, "estimatedPlane")
        XCTAssertNotNil(json["geoPose"])
        XCTAssertNil(json["anchor"], "v2 must remain additive to the deployed JSONB shape")
    }

    func testEditDataMatchesBackendCanvasAndLayerContract() throws {
        let layer = EditLayer(id: UUID(), kind: .text, text: "Merhaba", assetURL: nil, points: [], colorHex: "#FFFFFF", opacity: 1, scale: 1, rotation: 0)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(EditData(layers: [layer]))) as? [String: Any])
        XCTAssertEqual(json["version"] as? Int, 1)
        XCTAssertNotNil(json["canvas"] as? [String: Any])
        let layers = try XCTUnwrap(json["layers"] as? [[String: Any]])
        XCTAssertEqual(layers.first?["type"] as? String, "text")
    }

    func testNormalPinNeverSilentlyFallsBackToApproximate() {
        XCTAssertEqual(PinPlacementPolicy.decide(trackingNormal: true, candidateStable: true, hasPlaneGeometry: false, hasEstimatedPlane: false, approximateExplicitlyConfirmed: false), .offerApproximate)
        XCTAssertEqual(PinPlacementPolicy.decide(trackingNormal: false, candidateStable: false, hasPlaneGeometry: false, hasEstimatedPlane: false, approximateExplicitlyConfirmed: true), .freeSpaceApproximate)
    }

    func testApproximatePublishContractCannotClaimARKitWorldLock() {
        let approximate = BackendPlacementContract(quality: .freeSpaceApproximate, hasRemotePersistence: true)
        XCTAssertEqual(approximate.coordinateSpace, "camera_free_space")
        XCTAssertEqual(approximate.state, "free_space_approximate")
        XCTAssertEqual(approximate.resolverStrategy, ["geo_pose"])
        XCTAssertNil(approximate.nativeProvider)

        let anchor = SurfaceAnchor(
            transform: Array(repeating: 0, count: 16), pinQuality: .freeSpaceApproximate,
            hitSource: .frontOfCamera, surfaceAlignment: .freeSpace,
            trackingQuality: .normal, worldMappingStatus: .mapped
        )
        let bundle = AnchorBundle(anchor: anchor)
        XCTAssertEqual(bundle.coordinateSpace, "camera_free_space")
        XCTAssertEqual(bundle.provider, "native_ios_camera")
    }

    func testGeoHeadingRejectsUnavailableSensorValues() {
        XCTAssertNil(GeoPoseCaptureService.validHeading(-1))
        XCTAssertNil(GeoPoseCaptureService.validHeading(.nan))
        XCTAssertEqual(GeoPoseCaptureService.validHeading(360), 0)
        XCTAssertEqual(GeoPoseCaptureService.validHeading(725), 5)
    }

    func testSignedHeadingDeltaTurnsTheShortWay() {
        XCTAssertEqual(ProximityPolicy.signedHeadingDelta(from: 0, to: 90), 90, accuracy: 0.01)
        XCTAssertEqual(ProximityPolicy.signedHeadingDelta(from: 0, to: 270), -90, accuracy: 0.01)
        XCTAssertEqual(ProximityPolicy.signedHeadingDelta(from: 350, to: 10), 20, accuracy: 0.01)
        XCTAssertEqual(ProximityPolicy.signedHeadingDelta(from: 10, to: 350), -20, accuracy: 0.01)
    }

    func testCorruptGeoValuesFailClosedWithoutIntegerConversionCrash() {
        var post = makePost(quality: .planeGeometry, heading: 0)
        post.anchorBundle.anchor.geoPose = GeoPose(latitude: .nan, longitude: 29, heading: .infinity)
        let viewer = CLLocation(latitude: 41, longitude: 29)

        let decision = ProximityPolicy.evaluate(post: post, viewer: viewer, viewerHeading: .nan, targeted: true)
        let guidance = ProximityPolicy.viewAim(post: post, viewer: viewer, viewerHeading: .infinity, cameraPitchDegrees: 0)

        XCTAssertFalse(decision.allowed)
        XCTAssertNil(ProximityPolicy.roundedMeters(decision.distanceMeters))
        XCTAssertFalse(guidance.readyToReveal)
        XCTAssertEqual(ProximityPolicy.signedHeadingDelta(from: .nan, to: .infinity), 0)
    }

    func testViewAimGuidesTurnThenLooksForSurface() {
        let atPin = CLLocation(
            coordinate: CLLocationCoordinate2D(latitude: 41, longitude: 29),
            altitude: 0, horizontalAccuracy: 4, verticalAccuracy: 4, timestamp: Date()
        )
        var wall = makePost(quality: .planeGeometry, heading: 90)
        wall.anchorBundle.anchor.surfaceAlignment = .vertical
        let turnRight = ProximityPolicy.viewAim(post: wall, viewer: atPin, viewerHeading: 0, cameraPitchDegrees: 0)
        XCTAssertFalse(turnRight.headingAligned)
        XCTAssertEqual(turnRight.title, String(localized: "Sağa dön"))
        XCTAssertGreaterThan(turnRight.signedHeadingDelta, 0)

        let aligned = ProximityPolicy.viewAim(post: wall, viewer: atPin, viewerHeading: 90, cameraPitchDegrees: 0)
        XCTAssertTrue(aligned.readyToReveal)
        XCTAssertEqual(aligned.title, String(localized: "Nokta atışı"))

        var floor = makePost(quality: .planeGeometry, heading: 0)
        floor.anchorBundle.anchor.surfaceAlignment = .horizontal
        let lookDown = ProximityPolicy.viewAim(post: floor, viewer: atPin, viewerHeading: 0, cameraPitchDegrees: 10)
        XCTAssertTrue(lookDown.headingAligned)
        XCTAssertFalse(lookDown.pitchAligned)
        XCTAssertEqual(lookDown.title, String(localized: "Kamerayı eğ"))

        let waitingCompass = ProximityPolicy.viewAim(post: wall, viewer: atPin, viewerHeading: nil, cameraPitchDegrees: 0)
        XCTAssertFalse(waitingCompass.headingAligned)
        XCTAssertFalse(waitingCompass.readyToReveal)
        XCTAssertEqual(waitingCompass.title, String(localized: "Yön kilitleniyor"))
    }

    func testViewAimIgnoresGPSBearingForSamePlacePosts() {
        let viewer = CLLocation(latitude: 41.0, longitude: 29.0)
        var post = makePost(quality: .planeGeometry, heading: 90)
        post.anchorBundle.anchor.surfaceAlignment = .vertical
        post.anchorBundle.anchor.geoPose = GeoPose(latitude: 41.0, longitude: 29.0002, heading: 90)
        let aim = ProximityPolicy.viewAim(post: post, viewer: viewer, viewerHeading: 90, cameraPitchDegrees: 0)
        XCTAssertTrue(aim.headingAligned)
        XCTAssertEqual(aim.title, String(localized: "Nokta atışı"))
    }

    func testPinpointHeadingRejectsLooseAlignment() {
        let atPin = CLLocation(
            coordinate: CLLocationCoordinate2D(latitude: 41, longitude: 29),
            altitude: 0, horizontalAccuracy: 4, verticalAccuracy: 4, timestamp: Date()
        )
        var wall = makePost(quality: .planeGeometry, heading: 0)
        wall.anchorBundle.anchor.surfaceAlignment = .vertical
        let loose = ProximityPolicy.viewAim(post: wall, viewer: atPin, viewerHeading: 40, cameraPitchDegrees: 0)
        XCTAssertFalse(loose.headingAligned)
        let tight = ProximityPolicy.viewAim(post: wall, viewer: atPin, viewerHeading: 5, cameraPitchDegrees: 0)
        XCTAssertTrue(tight.headingAligned)
    }

    func testProximityWorldMapIgnoresHeadingButApproximateDoesNot() {
        let viewer = CLLocation(latitude: 41.0, longitude: 29.0)
        let physical = makePost(quality: .planeGeometry, heading: 180)
        let approximate = makePost(quality: .freeSpaceApproximate, heading: 180)
        XCTAssertTrue(ProximityPolicy.evaluate(post: physical, viewer: viewer, viewerHeading: 0, targeted: false).allowed)
        XCTAssertFalse(ProximityPolicy.evaluate(post: approximate, viewer: viewer, viewerHeading: 0, targeted: false).allowed)
    }

    func testNearbyARDiscoveryReturnsOnlyViewablePostsNearestFirst() {
        let viewer = CLLocation(latitude: 41.0, longitude: 29.0)
        var near = makePost(quality: .planeGeometry, heading: 0)
        near.anchorBundle.anchor.geoPose = GeoPose(latitude: 41.00005, longitude: 29.0, heading: 0)
        var farther = makePost(quality: .planeGeometry, heading: 0)
        farther.anchorBundle.anchor.geoPose = GeoPose(latitude: 41.0003, longitude: 29.0, heading: 0)
        var outside = makePost(quality: .planeGeometry, heading: 0)
        outside.anchorBundle.anchor.geoPose = GeoPose(latitude: 41.002, longitude: 29.0, heading: 0)

        let results = ProximityPolicy.viewablePosts([outside, farther, near], viewer: viewer, viewerHeading: 0)

        XCTAssertEqual(results.map(\.id), [near.id, farther.id])
    }

    func testRetryPolicyCapsAndDeadLetters() {
        XCTAssertEqual(RetryPolicy.delay(afterAttempt: 1), 30)
        XCTAssertLessThanOrEqual(RetryPolicy.delay(afterAttempt: 99), 3_600)
        XCTAssertFalse(RetryPolicy.shouldDeadLetter(afterAttempt: 4))
        XCTAssertTrue(RetryPolicy.shouldDeadLetter(afterAttempt: 5))
        XCTAssertEqual(ARPinningEngine.relocalizationTimeoutSeconds, 45)
    }

    func testCandidateSamplingCanSpanRequiredStabilityWindowAtHighRaycastRate() {
        let start = Date(timeIntervalSince1970: 100)
        XCTAssertTrue(ARPinningEngine.shouldAppendCandidateSample(last: nil, now: start))
        XCTAssertFalse(ARPinningEngine.shouldAppendCandidateSample(last: start, now: start.addingTimeInterval(0.04)))
        XCTAssertTrue(ARPinningEngine.shouldAppendCandidateSample(last: start, now: start.addingTimeInterval(0.081)))
        XCTAssertGreaterThanOrEqual(ARPinningEngine.candidateSampleMinimumInterval * 4, ARPinningEngine.estimatedStabilityDuration)
        XCTAssertEqual(ARPinningEngine.approximateDistanceMeters, 0.8)
    }

    func testBackendRowMapsPoseIntoV2Anchor() throws {
        let id = UUID(), creator = UUID(), anchor = UUID(), layer = UUID()
        let fixture: [String: Any] = [
            "id": id.uuidString, "creator_id": creator.uuidString, "created_at": "2026-08-21T12:00:00Z",
            "pose": ["latitude": 41.0, "longitude": 29.0, "heading": 90.0],
            "edit_data": ["version": 1, "canvas": ["width": 1080, "height": 1920], "layers": [[
                "id": layer.uuidString, "type": "text", "text": "Loci", "color": "#FFFFFF", "opacity": 1, "scale": 1, "rotation": 0
            ]]],
            "caption": "Test", "status": "active", "visibility": "public", "age_rating": "all",
            "anchor_bundle": [
                "schemaVersion": 2, "provider": "arkit", "coordinateSpace": "arkit_world", "nativeAnchorId": anchor.uuidString,
                "planeTransform": Array(repeating: 0, count: 16), "trackingQuality": "normal", "surfaceAlignment": "vertical",
                "pinQuality": "planeGeometry", "hitSource": "planeGeometry", "worldMappingStatus": "mapped", "capturedAt": "2026-08-21T12:00:00Z"
            ],
            "views_count": 1, "likes_count": 2, "comments_count": 3
        ]
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
        let post = try decoder.decode(BackendPostRow.self, from: JSONSerialization.data(withJSONObject: fixture)).domainPost()
        XCTAssertEqual(post.anchorBundle.anchor.geoPose?.latitude, 41)
        XCTAssertEqual(post.counts.likes, 2)
    }

    func testSpatialRendererProducesTextureImage() async {
        let layer = EditLayer(id: UUID(), kind: .text, text: "LociAR", assetURL: nil, points: [], colorHex: "#FFFFFF", opacity: 1, scale: 1, rotation: 0)
        let image = await SpatialContentRenderer().render(EditData(layers: [layer], canvasWidth: 320, canvasHeight: 480))
        XCTAssertEqual(image?.width, 320)
        XCTAssertEqual(image?.height, 480)
    }

    func testTextPostRendersAsCompactPostSizedCard() async throws {
        let caption = "Fiziksel pin cihaz testi"
        let layer = EditLayer(id: UUID(), kind: .text, text: caption, assetURL: nil, points: [], colorHex: "#FFFFFF", opacity: 1, scale: 1, rotation: 0)
        let post = LociPost(
            id: UUID(), creatorID: UUID(), createdAt: Date(), caption: caption, status: .active,
            visibility: .public, ageRating: .all,
            anchorBundle: AnchorBundle(anchor: SurfaceAnchor(
                transform: Array(repeating: 0, count: 16), pinQuality: .planeGeometry,
                hitSource: .planeGeometry, surfaceAlignment: .vertical,
                trackingQuality: .normal, worldMappingStatus: .mapped,
                physicalRectMeters: PhysicalRectMeters(width: 0.34, height: 0.60)
            )),
            editData: EditData(layers: [layer]), contentSource: nil, counts: PostCounts()
        )
        let rendered = await SpatialContentRenderer().render(post)
        let image = try XCTUnwrap(rendered)
        let size = SpatialContentRenderer.physicalSize(
            for: post,
            renderedPixelSize: CGSize(width: image.width, height: image.height)
        )
        XCTAssertLessThan(image.width, 720)
        XCTAssertLessThan(image.height, 140)
        XCTAssertLessThanOrEqual(size.width, PhysicalRectMeters.textMaximum.width)
        XCTAssertLessThanOrEqual(size.height, PhysicalRectMeters.textMaximum.height)
        XCTAssertGreaterThan(size.width / size.height, 2)
        let attachment = XCTAttachment(image: UIImage(cgImage: image))
        attachment.name = "compact-text-post-texture"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func testMediaSurfacePreservesPostAspectWithinARBounds() {
        let post = LociPost(
            id: UUID(), creatorID: UUID(), createdAt: Date(), caption: "Yatay görsel", status: .active,
            visibility: .public, ageRating: .all,
            anchorBundle: AnchorBundle(anchor: SurfaceAnchor(
                transform: Array(repeating: 0, count: 16), pinQuality: .planeGeometry,
                hitSource: .planeGeometry, surfaceAlignment: .vertical,
                trackingQuality: .normal, worldMappingStatus: .mapped,
                physicalRectMeters: PhysicalRectMeters(width: 0.34, height: 0.60)
            )),
            editData: EditData(layers: [
                EditLayer(id: UUID(), kind: .image, text: nil, assetURL: nil, points: [], colorHex: "#FFFFFF", opacity: 1, scale: 1, rotation: 0)
            ]),
            contentSource: nil, counts: PostCounts()
        )
        let size = SpatialContentRenderer.physicalSize(for: post, renderedPixelSize: CGSize(width: 1_200, height: 600))
        XCTAssertLessThanOrEqual(size.width, PhysicalRectMeters.default.width)
        XCTAssertLessThanOrEqual(size.height, PhysicalRectMeters.default.height)
        XCTAssertEqual(size.width / size.height, 2, accuracy: 0.05)
    }

    func testSupportedExternalMediaURLsAreStrictlyClassified() throws {
        XCTAssertEqual(ExternalMediaParser.parse("https://open.spotify.com/track/abc")?.externalMedia?.platform, .spotify)
        XCTAssertEqual(ExternalMediaParser.parse("https://youtu.be/abc123")?.externalMedia?.platform, .youtube)
        XCTAssertEqual(ExternalMediaParser.parse("https://www.facebook.com/loci/posts/123")?.externalMedia?.platform, .facebook)
        XCTAssertEqual(ExternalMediaParser.parse("https://fb.watch/abc123/")?.externalMedia?.platform, .facebook)
        XCTAssertEqual(ExternalMediaParser.parse("https://www.instagram.com/reel/ABC123/")?.externalMedia?.platform, .instagram)
        XCTAssertEqual(ExternalMediaParser.parse("https://x.com/loci/status/123")?.externalMedia?.platform, .x)
        XCTAssertNil(ExternalMediaParser.parse("http://x.com/loci/status/123"))
        XCTAssertNil(ExternalMediaParser.parse("https://x.com.example.org/loci/status/123"))
        XCTAssertNil(ExternalMediaParser.parse("https://youtube.com/channel/not-a-post"))
        XCTAssertNil(ExternalMediaParser.parse("https://instagram.com/loci"))
        XCTAssertNil(ExternalMediaParser.parse("https://facebook.com/loci"))
        XCTAssertNil(ExternalMediaParser.parse("https://open.spotify.com/unsupported/abc"))
        XCTAssertNil(ExternalMediaParser.parse("https://x.com/loci/status/not-a-number"))
        XCTAssertEqual(
            ExternalMediaParser.parseSharedText("Dinle: https://open.spotify.com/track/55fmthmn3rgnk9Wyx7G5dU")?.externalMedia?.platform,
            .spotify
        )
        XCTAssertEqual(ExternalMediaPlatform.spotify.appLaunchURL.scheme, "spotify")
        XCTAssertEqual(ExternalMediaPlatform.spotify.webLaunchURL.host, "open.spotify.com")

        let source = try XCTUnwrap(ExternalMediaParser.parse("https://www.youtube.com/watch?v=abc123"))
        let encoded = try JSONEncoder().encode(source)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        XCTAssertEqual(json["platform"] as? String, "youtube")
        XCTAssertEqual(json["mediaKind"] as? String, "embed")

        let facebook = try XCTUnwrap(ExternalMediaParser.parse("https://facebook.com/loci/videos/123"))
        let facebookJSON = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(facebook)) as? [String: Any])
        XCTAssertEqual(facebookJSON["platform"] as? String, "facebook")
    }

    func testLocalWorldMapStoreReadsOnlyItsProtectedDirectory() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("lociar-world-map-test-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }

        let anchorID = UUID()
        let mapURL = root.appendingPathComponent("\(anchorID.uuidString).lociarmap")
        let referenceURL = root.appendingPathComponent("\(anchorID.uuidString).jpg")
        let mapData = Data(repeating: 0x5A, count: 128)
        let referenceData = Data(repeating: 0xA5, count: 32)
        try mapData.write(to: mapURL)
        try referenceData.write(to: referenceURL)
        let persistence = WorldLockPersistence(
            originalNativeAnchorId: anchorID,
            assetURI: mapURL.absoluteString,
            referenceImageURI: referenceURL.absoluteString,
            hostedAt: Date()
        )
        let store = LocalWorldMapStore(allowedDirectory: root)

        let loadedMap = try await store.download(persistence)
        let loadedReference = try await store.downloadReference(persistence)
        XCTAssertEqual(loadedMap, mapData)
        XCTAssertEqual(loadedReference, referenceData)

        var escaped = persistence
        escaped.assetURI = FileManager.default.temporaryDirectory
            .appendingPathComponent(anchorID.uuidString + ".lociarmap").absoluteString
        do {
            _ = try await store.download(escaped)
            XCTFail("İzin verilen klasör dışındaki world-map reddedilmeliydi.")
        } catch {
            XCTAssertTrue(error is LocalWorldMapStore.LocalStoreError)
        }

        var movedContainer = persistence
        movedContainer.assetURI = URL(fileURLWithPath: "/var/mobile/Containers/Data/Application/OLD/Library/Application Support/LociARWorldMaps")
            .appendingPathComponent(anchorID.uuidString + ".lociarmap").absoluteString
        movedContainer.referenceImageURI = URL(fileURLWithPath: "/var/mobile/Containers/Data/Application/OLD/Library/Application Support/LociARWorldMaps")
            .appendingPathComponent(anchorID.uuidString + ".jpg").absoluteString
        let reboundMap = try await store.download(movedContainer)
        let reboundReference = try await store.downloadReference(movedContainer)
        XCTAssertEqual(reboundMap, mapData)
        XCTAssertEqual(reboundReference, referenceData)
    }

    func testExternalMediaSurfaceRendererIncludesCaptionCard() async {
        let post = LociPost(
            id: UUID(), creatorID: UUID(), createdAt: Date(), caption: "Bu şarkı bu duvara ait.", status: .active,
            visibility: .public, ageRating: .all,
            anchorBundle: AnchorBundle(anchor: SurfaceAnchor(
                transform: Array(repeating: 0, count: 16), pinQuality: .planeGeometry,
                hitSource: .planeGeometry, surfaceAlignment: .vertical,
                trackingQuality: .normal, worldMappingStatus: .mapped
            )),
            editData: EditData(canvasWidth: 320, canvasHeight: 480),
            contentSource: .spotify(URL(string: "https://open.spotify.com/track/55fmthmn3rgnk9Wyx7G5dU")!),
            counts: PostCounts()
        )
        let image = await SpatialContentRenderer().render(post)
        XCTAssertEqual(image?.width, Int(SpatialContentRenderer.externalPreviewCardPixelSize.width))
        XCTAssertEqual(image?.height, Int(SpatialContentRenderer.externalPreviewCardPixelSize.height))
        XCTAssertLessThan(
            SpatialContentRenderer.externalCaptionFontSize,
            SpatialContentRenderer.externalPreviewTitleFontSize
        )
        if let image {
            let attachment = XCTAttachment(image: UIImage(cgImage: image))
            attachment.name = "social-ar-preview-card-small-caption"
            attachment.lifetime = .keepAlways
            add(attachment)
        }
        let size = SpatialContentRenderer.physicalSize(
            for: post,
            renderedPixelSize: image.map { CGSize(width: $0.width, height: $0.height) }
        )
        XCTAssertLessThanOrEqual(size.width, PhysicalRectMeters.default.width)
        XCTAssertLessThanOrEqual(size.height, PhysicalRectMeters.externalMaximumHeight)
    }

    func testOfficialSocialBrandAssetsAreBundledAtHighResolution() throws {
        let names = [
            "BrandSpotify", "BrandSpotifyBlack", "BrandYouTube", "BrandYouTubeWhite",
            "BrandFacebook", "BrandFacebookWhite", "BrandInstagram", "BrandInstagramWhite",
            "BrandXBlack", "BrandXWhite"
        ]
        for name in names {
            let image = try XCTUnwrap(UIImage(named: name), "Missing official brand asset: \(name)")
            let pixels = try XCTUnwrap(image.cgImage)
            XCTAssertGreaterThanOrEqual(max(pixels.width, pixels.height), 900, "\(name) must remain suitable for AR card rendering")
        }
    }

    func testOfficialLogosRenderOnEverySocialARCard() async throws {
        let links = [
            ("spotify", "https://open.spotify.com/track/55fmthmn3rgnk9Wyx7G5dU"),
            ("youtube", "https://youtu.be/abc123"),
            ("facebook", "https://www.facebook.com/loci/posts/123"),
            ("instagram", "https://www.instagram.com/p/ABC123/"),
            ("x", "https://x.com/loci/status/123")
        ]

        for (platform, link) in links {
            let source = try XCTUnwrap(ExternalMediaParser.parse(link))
            let post = LociPost(
                id: UUID(), creatorID: UUID(), createdAt: Date(), caption: "Küçük caption", status: .active,
                visibility: .public, ageRating: .all,
                anchorBundle: AnchorBundle(anchor: SurfaceAnchor(
                    transform: Array(repeating: 0, count: 16), pinQuality: .planeGeometry,
                    hitSource: .planeGeometry, surfaceAlignment: .vertical,
                    trackingQuality: .normal, worldMappingStatus: .mapped
                )),
                editData: EditData(canvasWidth: 320, canvasHeight: 480),
                contentSource: source,
                counts: PostCounts()
            )
            let rendered = await SpatialContentRenderer().render(post)
            let image = try XCTUnwrap(rendered)
            let attachment = XCTAttachment(image: UIImage(cgImage: image))
            attachment.name = "official-\(platform)-ar-card"
            attachment.lifetime = .keepAlways
            add(attachment)
        }
    }

    func testStorageOwnerFolderMatchesFirebaseLUIDTextContract() {
        let id = UUID(uuidString: "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE")!
        XCTAssertEqual(StorageObjectPath.ownerFolder(id), "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")
        XCTAssertEqual(
            StorageObjectPath.anchorFileName(id, fileExtension: "lociarmap"),
            "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.lociarmap"
        )
    }

    func testPrivateStorageReferencesRoundTripWithoutPublicURL() throws {
        let path = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/33333333-3333-3333-3333-333333333333/layers/image.jpg"
        let url = MediaAssetStore.storageURL(bucket: "post-layer-assets", path: path)
        let reference = try XCTUnwrap(StorageAssetReference(url: url))
        XCTAssertEqual(reference.bucket, "post-layer-assets")
        XCTAssertEqual(reference.path, path)
        XCTAssertNil(StorageAssetReference(url: URL(string: "https://example.com/image.jpg")!))
    }

    func testDrawingCoordinatesScaleAcrossCanvasSizes() {
        let normalized = SpatialContentRenderer.drawingPoints([0.25, 0.75], width: 400, height: 800)
        XCTAssertEqual(normalized.first?.x, 100)
        XCTAssertEqual(normalized.first?.y, 200)

        let legacy = SpatialContentRenderer.drawingPoints([100, 600], width: 400, height: 800)
        XCTAssertEqual(legacy.first?.x, 100)
        XCTAssertEqual(legacy.first?.y, 200)
    }

    private func makePost(quality: PinQuality, heading: Double) -> LociPost {
        let anchor = SurfaceAnchor(
            transform: Array(repeating: 0, count: 16), pinQuality: quality,
            hitSource: quality == .freeSpaceApproximate ? .frontOfCamera : .planeGeometry,
            surfaceAlignment: quality == .freeSpaceApproximate ? .freeSpace : .vertical,
            trackingQuality: .normal, worldMappingStatus: .mapped,
            geoPose: GeoPose(latitude: 41, longitude: 29, heading: heading)
        )
        return LociPost(
            id: UUID(), creatorID: UUID(), createdAt: Date(), caption: "Test", status: .active,
            visibility: .public, ageRating: .all, anchorBundle: AnchorBundle(anchor: anchor),
            editData: EditData(), counts: PostCounts()
        )
    }

    func testServerRejectionsUseLocalizedMessages() {
        XCTAssertEqual(FirestorePostRepository.serverMessage("Creation is blocked in protected zone: Ayasofya"), String(localized: "Bu korumalı bölgede post yayınlanamaz."))
        XCTAssertEqual(FirestorePostRepository.serverMessage("Only text posts and social media links are allowed"), String(localized: "Postlar yalnızca metin ve sosyal medya bağlantısı içerebilir; fotoğraf ve video desteklenmiyor."))
        XCTAssertTrue(FirestorePostRepository.serverMessage("Only social media links are allowed").contains("Spotify"))
        XCTAssertEqual(FirestorePostRepository.serverMessage("Invalid social media link"), String(localized: "Sosyal medya bağlantısı geçersiz. Paylaşım bağlantısını uygulamadan tekrar kopyala."))
        XCTAssertFalse(FirestorePostRepository.serverMessage("At least one edit layer is required").contains("medya"))
    }

    func testQueuedDeviceMediaPostsAreDetected() {
        var post = UITestFixtures.post
        post.contentSource = .spotify(URL(string: "https://open.spotify.com/track/1")!)
        post.editData = EditData(layers: [])
        XCTAssertFalse(post.containsDeviceMedia)
        post.contentSource = .video(URL(fileURLWithPath: "/tmp/v.mov"))
        XCTAssertTrue(post.containsDeviceMedia)
        post.contentSource = nil
        post.editData = EditData(layers: [
            EditLayer(id: UUID(), kind: .image, text: nil, assetURL: URL(fileURLWithPath: "/tmp/a.jpg"), points: [], colorHex: "#FFFFFF", opacity: 1, scale: 1, rotation: 0)
        ])
        XCTAssertTrue(post.containsDeviceMedia)
    }

    func testAvatarPresetsRoundTripAndMatchRules() throws {
        for name in AvatarReference.presets {
            XCTAssertEqual(AvatarReference.presetName(AvatarReference.presetURL(name)), name)
        }
        XCTAssertNil(AvatarReference.presetURL("https://example.org/a.jpg"))
        XCTAssertNil(AvatarReference.presetName(URL(string: "https://example.org/a.jpg")))
    }

    // gRPC status codes used by FunctionsErrorCode: invalidArgument 3, notFound 5, alreadyExists 6,
    // permissionDenied 7, resourceExhausted 8, failedPrecondition 9, aborted 10, unavailable 14, unauthenticated 16.
    func testPermanentFunctionsErrorsMapToRejectedWithServerReason() throws {
        let details: [String: Any] = ["details": ["reason": "profile_missing"]]
        let mapped = try XCTUnwrap(BackendErrorPolicy.map(code: 9, message: "Profile missing; call ensureProfile first", userInfo: details))
        XCTAssertEqual(mapped.reason, "profile_missing")
        XCTAssertEqual(mapped.errorDescription, "Profile missing; call ensureProfile first")

        let noReason = try XCTUnwrap(BackendErrorPolicy.map(code: 7, message: "denied", userInfo: [:]))
        XCTAssertNil(noReason.reason)
        for code in [3, 5, 6, 7, 8, 9] {
            XCTAssertNotNil(BackendErrorPolicy.map(code: code, message: "x", userInfo: [:]), "code \(code) is permanent")
        }
    }

    func testTransientFunctionsErrorsAreNotMapped() {
        // aborted, unavailable, deadline exceeded, internal and unauthenticated must stay retryable.
        for code in [4, 10, 13, 14, 16] {
            XCTAssertNil(BackendErrorPolicy.map(code: code, message: "x", userInfo: [:]), "code \(code) is retryable")
        }
    }

    func testExpiredWorldMapDraftIsAPermanentLocalizedPublishRejection() throws {
        let failure = try XCTUnwrap(BackendErrorPolicy.map(
            code: 9,
            message: "World map draft expired; create a new draft",
            userInfo: ["details": ["reason": "draft_expired"]]
        ))
        XCTAssertEqual(failure.reason, "draft_expired")
        let message = FirestorePostRepository.serverMessage("server wording may change", reason: failure.reason)
        XCTAssertEqual(message, String(localized: "Fiziksel AR yüzey kaydı eksik. Yüzeyi yeniden tarayıp kesin kilit oluşturun."))
        XCTAssertEqual(PostPublishError.rejected(message).localizedDescription, message)
    }

    func testServerReasonBeatsMessageText() {
        XCTAssertEqual(
            FirestorePostRepository.serverMessage("Creation limit reached for this area or account", reason: "rate_limited"),
            "Bu bölge veya hesap için yayın sınırına ulaşıldı. Daha sonra tekrar deneyin."
        )
        XCTAssertEqual(
            FirestorePostRepository.serverMessage("anything", reason: "protected_zone"),
            "Bu korumalı bölgede post yayınlanamaz."
        )
        // Old servers send no reason: the text fallback still works.
        XCTAssertEqual(
            FirestorePostRepository.serverMessage("Creation is blocked in protected zone: X"),
            "Bu korumalı bölgede post yayınlanamaz."
        )
    }

    func testHiddenPostStoreIsScopedPerAccount() async throws {
        let suite = "test.hidden.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { UserDefaults.standard.removePersistentDomain(forName: suite) }
        let store = HiddenPostStore(defaults: defaults)
        let post = UUID()
        await store.hide(post, owner: "alice")
        await store.hide(post, owner: "alice") // idempotent
        let alice = await store.hiddenIDs(owner: "alice")
        let bob = await store.hiddenIDs(owner: "bob")
        XCTAssertEqual(alice, [post.uuidString.lowercased()])
        XCTAssertTrue(bob.isEmpty)
    }

    func testWorldMapDecoderBoundsCompressedExpansionAndLegacyFiles() throws {
        let oversized = Data(repeating: 0, count: WorldMapCodec.maximumDecodedBytes + 1)
        XCTAssertThrowsError(try WorldMapCodec.decode(oversized))
        let compressed = try (oversized as NSData).compressed(using: .lzfse) as Data
        XCTAssertLessThan(compressed.count, WorldMapCodec.maximumUploadBytes)
        XCTAssertThrowsError(try WorldMapCodec.decode(WorldMapCodec.magic + compressed))
        XCTAssertThrowsError(try WorldMapCodec.encode(oversized))
    }

    func testWorldMapCodecRoundTripsAndReadsLegacyUncompressedMaps() throws {
        let raw = Data((0..<200_000).map { UInt8($0 % 17) })
        let encoded = try WorldMapCodec.encode(raw)
        XCTAssertTrue(encoded.starts(with: WorldMapCodec.magic))
        XCTAssertLessThan(encoded.count, raw.count)
        XCTAssertEqual(try WorldMapCodec.decode(encoded), raw)
        // Pre-compression uploads (NSKeyedArchiver binary plists) come back unchanged.
        let legacy = Data("bplist00".utf8) + raw
        XCTAssertEqual(try WorldMapCodec.decode(legacy), legacy)
        XCTAssertThrowsError(try WorldMapCodec.decode(WorldMapCodec.magic + Data([1, 2, 3])))
    }

    func testWorldMapDownloadCacheIsKeyedByLocatorAndPrunesOldestFirst() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("wm-cache-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: dir) }
        let cache = WorldMapDownloadCache(directory: dir)
        let a = "storage://post-world-maps/u/p1/a.lociarmap"
        let b = "storage://post-world-maps/u/p2/b.lociarmap"
        XCTAssertNotEqual(WorldMapDownloadCache.fileName(for: a), WorldMapDownloadCache.fileName(for: b))
        XCTAssertNil(cache.read(a))
        cache.write(Data(repeating: 1, count: 1_000), for: a)
        let old = dir.appendingPathComponent(WorldMapDownloadCache.fileName(for: a))
        try FileManager.default.setAttributes([.modificationDate: Date(timeIntervalSinceNow: -3_600)], ofItemAtPath: old.path)
        cache.write(Data(repeating: 2, count: 1_000), for: b)
        cache.prune(limit: 1_500)
        XCTAssertNil(cache.read(a), "least recently used entry is pruned")
        XCTAssertEqual(cache.read(b)?.count, 1_000)
    }

    @MainActor
    func testPushRegistrationWaitsForSessionAndDeduplicatesSuccessfulRegistration() async {
        let client = RecordingPushClient()
        let coordinator = PushTokenCoordinator(client: client, installationID: UUID(), locale: { "tr-TR" })
        let user = UUID()
        coordinator.updateToken("first-token")
        await coordinator.finishPendingRegistration()
        XCTAssertTrue(client.calls.isEmpty)
        coordinator.updateUser(user)
        await coordinator.finishPendingRegistration()
        coordinator.updateUser(user)
        coordinator.updateToken("first-token")
        await coordinator.finishPendingRegistration()
        XCTAssertEqual(client.calls, [.register(user, "first-token", "tr-TR")])
    }

    @MainActor
    func testPushRotationAndLocaleChangeRefreshRegistration() async {
        let client = RecordingPushClient()
        var locale = "tr"
        let coordinator = PushTokenCoordinator(client: client, installationID: UUID(), locale: { locale })
        let user = UUID()
        coordinator.updateUser(user)
        coordinator.updateToken("first-token")
        await coordinator.finishPendingRegistration()
        coordinator.updateToken("rotated-token")
        await coordinator.finishPendingRegistration()
        locale = "en"
        coordinator.updateUser(user)
        await coordinator.finishPendingRegistration()
        XCTAssertEqual(client.calls, [
            .register(user, "first-token", "tr"), .register(user, "rotated-token", "tr"),
            .register(user, "rotated-token", "en")
        ])
    }

    @MainActor
    func testFailedPushRegistrationCanRetryWithoutTokenChange() async {
        let client = RecordingPushClient()
        client.failNextRegistration = true
        let coordinator = PushTokenCoordinator(client: client, installationID: UUID(), locale: { "en" })
        let user = UUID()
        var failures = 0
        coordinator.onFailure = { _ in failures += 1 }
        coordinator.updateUser(user)
        coordinator.updateToken("token")
        await coordinator.finishPendingRegistration()
        coordinator.updateUser(user)
        await coordinator.finishPendingRegistration()
        XCTAssertEqual(failures, 1)
        XCTAssertEqual(client.calls, [.register(user, "token", "en"), .register(user, "token", "en")])
    }

    @MainActor
    func testPushSignOutDrainsInFlightRegistrationBeforeUnregistering() async {
        let client = RecordingPushClient()
        client.pauseNextRegistration = true
        let coordinator = PushTokenCoordinator(client: client, installationID: UUID(), locale: { "en" })
        let user = UUID()
        coordinator.updateUser(user)
        coordinator.updateToken("old-token")
        await client.waitForRegistrationStart()
        coordinator.updateToken("queued-token")
        let disconnectStarted = AsyncStream<Void>.makeStream()
        let disconnect = Task {
            coordinator.updateUser(nil)
            disconnectStarted.continuation.yield(())
            disconnectStarted.continuation.finish()
            await coordinator.disconnect(userID: user)
        }
        for await _ in disconnectStarted.stream { break }
        XCTAssertEqual(client.calls, [.register(user, "old-token", "en")])
        client.releaseRegistration()
        await disconnect.value
        XCTAssertNil(coordinator.userID)
        XCTAssertFalse(client.unregisteredWhileRegistering)
        XCTAssertEqual(client.calls, [.register(user, "old-token", "en"), .unregister(user)])
    }

    @MainActor
    func testQueuedPushRegistrationCannotBindAnObsoleteSession() async {
        let client = RecordingPushClient()
        let coordinator = PushTokenCoordinator(client: client, installationID: UUID(), locale: { "en" })
        let oldUser = UUID(), newUser = UUID()
        coordinator.updateUser(oldUser)
        coordinator.updateToken("token")
        coordinator.updateUser(newUser)
        await coordinator.finishPendingRegistration()
        XCTAssertEqual(client.calls, [.register(newUser, "token", "en")])
    }

    func testPushTargetsRequireRecipientAndValidateOptionalPost() {
        let recipient = UUID(), post = UUID()
        XCTAssertNil(PushNotificationTarget(recipient: nil, post: post.uuidString))
        XCTAssertNil(PushNotificationTarget(recipient: "invalid", post: nil))
        XCTAssertNil(PushNotificationTarget(recipient: recipient.uuidString, post: "invalid"))
        XCTAssertEqual(PushNotificationTarget(recipient: recipient.uuidString, post: post.uuidString)?.postID, post)
        XCTAssertNil(PushNotificationTarget(recipient: recipient.uuidString, post: "")?.postID)
        XCTAssertEqual(PushNotificationTarget(recipient: recipient.uuidString, post: nil)?.recipientID, recipient)
        let activity = "like_\(post.uuidString.lowercased())_\(recipient.uuidString.lowercased())"
        XCTAssertEqual(PushNotificationTarget(recipient: recipient.uuidString, post: nil, activity: activity)?.activityID, activity)
        XCTAssertNil(PushNotificationTarget(recipient: recipient.uuidString, post: nil, activity: "a/b"))
        XCTAssertNil(PushNotificationTarget(recipient: recipient.uuidString, post: nil, activity: "a\n"))
    }

    func testActivityKeepsCompositeDocumentIdentityThroughDecoding() throws {
        let recipient = UUID()
        let id = "follow_\(UUID().uuidString.lowercased())_\(recipient.uuidString.lowercased())"
        let fixture: [String: Any] = ["id": id, "kind": "follow", "recipient_id": recipient.uuidString,
                                    "body": "fixture", "created_at": "2026-10-04T12:00:00.000Z"]
        let item = try FirestoreJSON.decoder().decode(SocialActivity.self, from: JSONSerialization.data(withJSONObject: fixture))
        XCTAssertEqual(item.id, id)
        XCTAssertEqual(item.recipientID, recipient)
        XCTAssertNil(item.readAt)
    }

    func testActivityReadAcknowledgementPreservesIdentityAndFirstReadTime() {
        let item = SocialActivity(id: "like_composite", kind: "like", actorID: nil, recipientID: UUID(), postID: nil,
                                  body: "fixture", createdAt: Date(timeIntervalSince1970: 10), readAt: nil)
        let first = item.markingRead(at: Date(timeIntervalSince1970: 20))
        XCTAssertEqual(first.id, item.id)
        XCTAssertEqual(first.readAt, Date(timeIntervalSince1970: 20))
        XCTAssertEqual(first.markingRead(at: Date(timeIntervalSince1970: 30)), first)
    }

    func testAccountDeletionProviderSelectionRequiresAppleRevocationForLinkedAccounts() throws {
        XCTAssertEqual(try AccountDeletionMethod.resolve(providerIDs: ["password"], email: "ci@example.test"), .password)
        XCTAssertEqual(try AccountDeletionMethod.resolve(providerIDs: ["apple.com"], email: nil), .apple)
        XCTAssertEqual(try AccountDeletionMethod.resolve(providerIDs: ["password", "apple.com"], email: "ci@example.test"), .apple)
        XCTAssertThrowsError(try AccountDeletionMethod.resolve(providerIDs: ["password"], email: nil))
        XCTAssertThrowsError(try AccountDeletionMethod.resolve(providerIDs: ["google.com"], email: "ci@example.test"))
    }

    func testAppleReauthenticationUsesFreshNonceAndSHA256Hash() {
        let values = (0..<128).map { _ in AppleAuthorizationNonce.make() }
        XCTAssertEqual(Set(values).count, values.count)
        XCTAssertTrue(values.allSatisfy { $0.count == 32 })
        XCTAssertEqual(AppleAuthorizationNonce.hash("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    }

    @MainActor
    func testPasswordDeletionReauthenticatesAndRefreshesBeforeDelete() async throws {
        let client = RecordingDeletionClient(method: .password)
        try await AccountDeletionFlow.run(client: client, password: "ci-placeholder")
        XCTAssertEqual(client.calls, ["reauthenticate", "refresh", "delete"])
        XCTAssertEqual(client.receivedPassword, "ci-placeholder")
        XCTAssertNil(client.receivedAppleCode)
    }

    @MainActor
    func testAppleDeletionCarriesTheCodeAfterFirebaseReauthentication() async throws {
        let client = RecordingDeletionClient(method: .apple)
        try await AccountDeletionFlow.run(client: client, password: nil)
        XCTAssertEqual(client.calls, ["reauthenticate", "refresh", "delete"])
        XCTAssertEqual(client.receivedAppleCode, "synthetic-authorization-code")
    }

    @MainActor
    func testPasswordDeletionWithoutCredentialDoesNotStartReauthentication() async {
        for password in [nil, ""] as [String?] {
            let client = RecordingDeletionClient(method: .password)
            do { try await AccountDeletionFlow.run(client: client, password: password); XCTFail("Missing password must stop deletion") }
            catch { XCTAssertTrue(client.calls.isEmpty) }
        }
    }

    @MainActor
    func testReauthenticationFailureNeverRefreshesOrDeletes() async {
        let client = RecordingDeletionClient(method: .apple)
        client.reauthenticationError = AuthFlowError.reauthenticationCancelled
        do { try await AccountDeletionFlow.run(client: client, password: nil); XCTFail("Cancellation must stop deletion") }
        catch { XCTAssertEqual(client.calls, ["reauthenticate"]) }
    }

    @MainActor
    func testTokenRefreshFailureNeverDeletes() async {
        let client = RecordingDeletionClient(method: .apple)
        client.refreshError = RecordingDeletionClient.SyntheticFailure.unavailable
        do { try await AccountDeletionFlow.run(client: client, password: nil); XCTFail("Refresh failure must stop deletion") }
        catch { XCTAssertEqual(client.calls, ["reauthenticate", "refresh"]) }
    }

    @MainActor
    func testSessionChangeDuringReauthenticationNeverDeletes() async {
        let client = RecordingDeletionClient(method: .apple)
        client.changeSessionAfterReauthentication = true
        do { try await AccountDeletionFlow.run(client: client, password: nil); XCTFail("Changed session must stop deletion") }
        catch { XCTAssertEqual(client.calls, ["reauthenticate"]) }
    }

    @MainActor
    func testSessionChangeDuringRefreshNeverDeletes() async {
        let client = RecordingDeletionClient(method: .apple)
        client.changeSessionAfterRefresh = true
        do { try await AccountDeletionFlow.run(client: client, password: nil); XCTFail("Changed session must stop deletion") }
        catch { XCTAssertEqual(client.calls, ["reauthenticate", "refresh"]) }
    }

    @MainActor
    func testCancelledDeletionTaskMakesNoAuthenticationOrDeleteRequest() async {
        let client = RecordingDeletionClient(method: .apple)
        let task = Task { try await AccountDeletionFlow.run(client: client, password: nil) }
        task.cancel()
        do { try await task.value; XCTFail("Cancelled task must stop deletion") }
        catch { XCTAssertTrue(error is CancellationError); XCTAssertTrue(client.calls.isEmpty) }
    }

    @MainActor
    func testAppleRevocationFailurePropagatesFromDelete() async {
        let client = RecordingDeletionClient(method: .apple)
        client.deletionError = AuthFlowError.appleRevocationFailed
        do { try await AccountDeletionFlow.run(client: client, password: nil); XCTFail("Revocation failure must surface") }
        catch let error as AuthFlowError {
            if case .appleRevocationFailed = error {} else { XCTFail("Unexpected auth error") }
            XCTAssertEqual(client.calls, ["reauthenticate", "refresh", "delete"])
        } catch { XCTFail("Unexpected error type") }
    }
}

@MainActor
private final class RecordingDeletionClient: AccountDeletionClient {
    enum SyntheticFailure: Error { case unavailable }
    let method: AccountDeletionMethod
    private(set) var calls: [String] = []
    private(set) var receivedPassword: String?
    private(set) var receivedAppleCode: String?
    var reauthenticationError: Error?
    var refreshError: Error?
    var deletionError: Error?
    var changeSessionAfterReauthentication = false
    var changeSessionAfterRefresh = false
    private var sessionMatches = true
    init(method: AccountDeletionMethod) { self.method = method }
    func assertCurrentSession() throws { if !sessionMatches { throw AuthFlowError.notSignedIn } }
    func reauthenticate(password: String?) async throws -> String? {
        calls.append("reauthenticate")
        receivedPassword = password
        if let reauthenticationError { throw reauthenticationError }
        if changeSessionAfterReauthentication { sessionMatches = false }
        return method == .apple ? "synthetic-authorization-code" : nil
    }
    func refreshSession() async throws {
        calls.append("refresh")
        if let refreshError { throw refreshError }
        if changeSessionAfterRefresh { sessionMatches = false }
    }
    func delete(appleAuthorizationCode: String?) async throws {
        calls.append("delete")
        receivedAppleCode = appleAuthorizationCode
        if let deletionError { throw deletionError }
    }
}

@MainActor
private final class RecordingPushClient: PushRegistrationClient {
    enum Call: Equatable {
        case register(UUID, String, String)
        case unregister(UUID)
    }
    enum SyntheticFailure: Error { case unavailable }
    private(set) var calls: [Call] = []
    var failNextRegistration = false
    var pauseNextRegistration = false
    private var registrationStarted = false
    private var startWaiter: CheckedContinuation<Void, Never>?
    private var releaseWaiter: CheckedContinuation<Void, Never>?
    private var registrationInFlight = false
    private(set) var unregisteredWhileRegistering = false

    func register(token: String, installationID: UUID, userID: UUID, locale: String) async throws {
        calls.append(.register(userID, token, locale))
        registrationInFlight = true
        defer { registrationInFlight = false }
        registrationStarted = true
        if pauseNextRegistration {
            pauseNextRegistration = false
            await withCheckedContinuation { continuation in
                releaseWaiter = continuation
                startWaiter?.resume()
                startWaiter = nil
            }
        }
        if failNextRegistration {
            failNextRegistration = false
            throw SyntheticFailure.unavailable
        }
    }

    func unregister(installationID: UUID, userID: UUID) async throws {
        unregisteredWhileRegistering = registrationInFlight
        calls.append(.unregister(userID))
    }
    func waitForRegistrationStart() async {
        guard !registrationStarted else { return }
        await withCheckedContinuation { startWaiter = $0 }
    }
    func releaseRegistration() { releaseWaiter?.resume(); releaseWaiter = nil }
}

final class LocalizationBundleTests: XCTestCase {
    func testAllSupportedLanguagesShipCompiledUITranslations() throws {
        for locale in ["tr", "en", "zh-Hans", "hi", "es", "fr", "ar", "bn", "pt", "ru", "de", "ja"] {
            let path = try XCTUnwrap(Bundle.main.path(forResource: locale, ofType: "lproj"), "Missing compiled locale: \(locale)")
            let bundle = try XCTUnwrap(Bundle(path: path))
            let value = bundle.localizedString(forKey: "Hesabı sil", value: nil, table: "Localizable")
            XCTAssertFalse(value.isEmpty)
            if locale != "tr" { XCTAssertNotEqual(value, "Hesabı sil", "Locale \(locale) fell back to the key") }
        }
    }

    func testCompiledEnglishMessagesRetainTypedArgumentsAndARTerminology() throws {
        let path = try XCTUnwrap(Bundle.main.path(forResource: "en", ofType: "lproj"))
        let bundle = try XCTUnwrap(Bundle(path: path))
        XCTAssertEqual(bundle.localizedString(forKey: "Yön kilitleniyor", value: nil, table: "Localizable"), "Aligning direction")
        let format = bundle.localizedString(forKey: "Paylaşırken baktığın yöne %lld° sağa dön.", value: nil, table: "Localizable")
        XCTAssertEqual(String(format: format, 15), "Turn 15° right toward the direction you faced when posting.")
    }

    func testPermissionsShipLocalizedCameraLocationAndPreciseLocationPurpose() throws {
        for locale in ["tr", "en", "zh-Hans", "hi", "es", "fr", "ar", "bn", "pt", "ru", "de", "ja"] {
            let path = try XCTUnwrap(Bundle.main.path(forResource: locale, ofType: "lproj"))
            let bundle = try XCTUnwrap(Bundle(path: path))
            for key in ["NSCameraUsageDescription", "NSLocationWhenInUseUsageDescription", "GeospatialAccuracy"] {
                let value = bundle.localizedString(forKey: key, value: nil, table: "InfoPlist")
                XCTAssertNotEqual(value, key, "Permission \(key) is missing for \(locale)")
                XCTAssertFalse(value.isEmpty)
            }
        }
    }
}

final class AcceptedDeletionErrorPolicyTests: XCTestCase {
    func testAcceptedDeletionReachesDedicatedUIWhileOtherUnavailableErrorsRemainRetryable() throws {
        let pending = try XCTUnwrap(BackendErrorPolicy.map(code: 14, message: "pending", userInfo: ["details": ["reason": "deletion_pending"]]))
        XCTAssertEqual(pending.reason, "deletion_pending")
        for reason in ["busy_retry", "service_paused"] {
            XCTAssertNil(BackendErrorPolicy.map(code: 14, message: "retry", userInfo: ["details": ["reason": reason]]))
        }
    }
}

final class AdminContentDecodingTests: XCTestCase {
    func testPanelPostRemainsApproximateWhenDecodedByTheNativeReader() throws {
        let postID = UUID(), authorID = UUID(), anchorID = UUID(), layerID = UUID()
        let geo: [String: Any] = ["latitude": 41.0, "longitude": 29.0, "altitude": 0, "heading": 0]
        let anchor: [String: Any] = [
            "id": anchorID.uuidString, "transform": [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -1.5, 1],
            "pinQuality": "freeSpaceApproximate", "hitSource": "frontOfCamera", "surfaceAlignment": "free_space",
            "trackingQuality": "unknown", "worldMappingStatus": "notAvailable", "geoPose": geo,
            "physicalRectMeters": ["width": 0.45, "height": 0.51], "capturedAt": "2026-10-05T00:00:00Z"
        ]
        let row: [String: Any] = [
            "id": postID.uuidString, "creator_id": authorID.uuidString, "creator_handle": "panel_author",
            "created_at": "2026-10-05T00:00:00.123Z", "pose": geo, "caption": "Panel post",
            "status": "active", "visibility": "public", "age_rating": "all",
            "anchor_bundle": ["schemaVersion": 2, "provider": "admin", "coordinateSpace": "admin_geo_estimate", "anchor": anchor],
            "edit_data": ["version": 1, "canvas": ["width": 1080, "height": 1920], "layers": [[
                "id": layerID.uuidString, "type": "text", "text": "AR text", "color": "#00FF00", "opacity": 0.8, "scale": 1.2, "rotation": 15
            ]]], "content_source": ["platform": "other", "title": "AR text"]
        ]
        let post = try FirestoreJSON.decoder().decode(BackendPostRow.self, from: JSONSerialization.data(withJSONObject: row)).domainPost()
        XCTAssertEqual(post.creatorID, authorID)
        XCTAssertEqual(post.anchorBundle.provider, "admin")
        XCTAssertEqual(post.anchorBundle.coordinateSpace, "admin_geo_estimate")
        XCTAssertEqual(post.anchorBundle.anchor.pinQuality, .freeSpaceApproximate)
        XCTAssertNil(post.anchorBundle.anchor.persistence)
        XCTAssertEqual(post.editData.layers.first?.colorHex, "#00FF00")
        XCTAssertEqual(post.contentSource, ContentSource.text("AR text"))
        let pageJSON: [String: Any] = ["posts": [["invalid_legacy_row": true], row], "next": "raw-page-cursor"]
        let page = try FirestoreJSON.decoder().decode(BackendPostPageResponse.self, from: JSONSerialization.data(withJSONObject: pageJSON))
        XCTAssertEqual(page.posts.map(\.id), [postID])
        XCTAssertEqual(page.next, "raw-page-cursor", "A discarded row must not stop pagination")
    }
}
