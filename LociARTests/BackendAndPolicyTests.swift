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
        XCTAssertEqual(turnRight.title, "Sağa dön")
        XCTAssertGreaterThan(turnRight.signedHeadingDelta, 0)

        let aligned = ProximityPolicy.viewAim(post: wall, viewer: atPin, viewerHeading: 90, cameraPitchDegrees: 0)
        XCTAssertTrue(aligned.readyToReveal)
        XCTAssertEqual(aligned.title, "Nokta atışı")

        var floor = makePost(quality: .planeGeometry, heading: 0)
        floor.anchorBundle.anchor.surfaceAlignment = .horizontal
        let lookDown = ProximityPolicy.viewAim(post: floor, viewer: atPin, viewerHeading: 0, cameraPitchDegrees: 10)
        XCTAssertTrue(lookDown.headingAligned)
        XCTAssertFalse(lookDown.pitchAligned)
        XCTAssertEqual(lookDown.title, "Kamerayı eğ")

        let waitingCompass = ProximityPolicy.viewAim(post: wall, viewer: atPin, viewerHeading: nil, cameraPitchDegrees: 0)
        XCTAssertFalse(waitingCompass.headingAligned)
        XCTAssertFalse(waitingCompass.readyToReveal)
        XCTAssertEqual(waitingCompass.title, "Yön kilitleniyor")
    }

    func testViewAimIgnoresGPSBearingForSamePlacePosts() {
        let viewer = CLLocation(latitude: 41.0, longitude: 29.0)
        var post = makePost(quality: .planeGeometry, heading: 90)
        post.anchorBundle.anchor.surfaceAlignment = .vertical
        post.anchorBundle.anchor.geoPose = GeoPose(latitude: 41.0, longitude: 29.0002, heading: 90)
        let aim = ProximityPolicy.viewAim(post: post, viewer: viewer, viewerHeading: 90, cameraPitchDegrees: 0)
        XCTAssertTrue(aim.headingAligned)
        XCTAssertEqual(aim.title, "Nokta atışı")
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

    func testServerRejectionsAreShownInTurkish() {
        XCTAssertEqual(FirestorePostRepository.serverMessage("Creation is blocked in protected zone: Ayasofya"), "Bu korumalı bölgede post yayınlanamaz.")
        XCTAssertTrue(FirestorePostRepository.serverMessage("Only text posts and social media links are allowed").contains("fotoğraf ve video desteklenmiyor"))
        XCTAssertTrue(FirestorePostRepository.serverMessage("Only social media links are allowed").contains("Spotify"))
        XCTAssertTrue(FirestorePostRepository.serverMessage("Invalid social media link").contains("bağlantısı geçersiz"))
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
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = HiddenPostStore(defaults: defaults)
        let post = UUID()
        await store.hide(post, owner: "alice")
        await store.hide(post, owner: "alice") // idempotent
        let alice = await store.hiddenIDs(owner: "alice")
        let bob = await store.hiddenIDs(owner: "bob")
        XCTAssertEqual(alice, [post.uuidString.lowercased()])
        XCTAssertTrue(bob.isEmpty)
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
}
