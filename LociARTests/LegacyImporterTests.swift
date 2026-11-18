import XCTest
@testable import LociAR

final class LegacyImporterTests: XCTestCase {
    @MainActor
    func testLegacyAppearanceModeSupportsJSONAndRawValues() {
        XCTAssertEqual(
            LegacyMigrationCoordinator.importedAppearancePreference(from: Data("\"light\"".utf8)),
            LociAppearancePreference.light.rawValue
        )
        XCTAssertEqual(
            LegacyMigrationCoordinator.importedAppearancePreference(from: Data("automatic".utf8)),
            LociAppearancePreference.system.rawValue
        )
        XCTAssertNil(LegacyMigrationCoordinator.importedAppearancePreference(from: Data("unexpected".utf8)))
    }

    @MainActor
    func testLegacyMockupRowsBecomeDecodableLocalDrafts() throws {
        let id = UUID(), creator = UUID(), layer = UUID()
        let row: [String: Any] = [
            "id": id.uuidString, "creator_id": creator.uuidString, "status": "active",
            "pose": ["latitude": 41.0, "longitude": 29.0, "heading": 90.0],
            "editData": ["version": 1, "canvas": ["width": 1080, "height": 1920], "layers": [[
                "id": layer.uuidString, "type": "text", "text": "Loci", "color": "#FFFFFF", "opacity": 1, "scale": 1, "rotation": 0
            ]]],
            "caption": "Eski taslak", "visibility": "public"
        ]
        let post = try XCTUnwrap(LegacyMigrationCoordinator.legacyDraftPost(row))
        XCTAssertEqual(post.id, id)
        XCTAssertEqual(post.creatorID, creator)
        XCTAssertEqual(post.status, .draft)
        XCTAssertNil(LegacyMigrationCoordinator.legacyDraftPost(["id": "draft"]))
    }

    func testManifestImportIsAllowListedAndIdempotent() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let directory = root.appendingPathComponent("RCTAsyncLocalStorage_V1")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let manifest: [String: Any] = [
            "lociar_posts_v4_mockup": "[{\"id\":\"draft\"}]",
            "supabase.auth-token": "must-not-import",
            "unknown": "skip"
        ]
        try JSONSerialization.data(withJSONObject: manifest).write(to: directory.appendingPathComponent("manifest.json"))
        let suite = UserDefaults(suiteName: UUID().uuidString)!
        let importer = LegacyAsyncStorageImporter(userDefaults: suite)
        let first = try importer.importIfNeeded(applicationSupportURL: root)
        XCTAssertNotNil(first.values["lociar_posts_v4_mockup"])
        XCTAssertNil(first.values["supabase.auth-token"])
        importer.markCompleted()
        XCTAssertTrue(try importer.importIfNeeded(applicationSupportURL: root).values.isEmpty)
    }

    func testLargeValueUsesReactNativeMD5FilenameAndBundlePath() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let directory = root.appendingPathComponent("com.khankartal.lociar/RCTAsyncLocalStorage_V1")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let key = "lociar_pending_sync"
        try JSONSerialization.data(withJSONObject: [key: NSNull()]).write(to: directory.appendingPathComponent("manifest.json"))
        try Data("[]".utf8).write(to: directory.appendingPathComponent(LegacyAsyncStorageImporter.storageFileName(for: key)))
        let suite = UserDefaults(suiteName: UUID().uuidString)!
        let result = try LegacyAsyncStorageImporter(userDefaults: suite).importIfNeeded(
            applicationSupportURL: root, bundleIdentifier: "com.khankartal.lociar"
        )
        XCTAssertEqual(result.values[key], Data("[]".utf8))
        XCTAssertEqual(LegacyAsyncStorageImporter.storageFileName(for: key).count, 32)
    }
}
