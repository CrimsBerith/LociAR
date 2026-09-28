import XCTest
@testable import LociAR

final class LegacyImporterTests: XCTestCase {
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
