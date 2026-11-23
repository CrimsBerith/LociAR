import Foundation

/// Field-test recorder: event timings for AR and location-note delivery, appended to a file in the
/// app's own Application Support folder so they can be copied off a development-installed phone.
///
/// Off unless switched on with the launch argument `-LociFieldTest ON` (remembered until `OFF`).
/// App Store users never pass it, so the recorder stays inert there. It records event names,
/// durations and counters only: no coordinates, note text, account identifiers or camera data, and
/// nothing is sent anywhere.
enum FieldTestLog {
    nonisolated static let defaultsKey = "LociFieldTestLogEnabled"
    nonisolated static let relativePath = "FieldTest/log.jsonl"
    private nonisolated static let queue = DispatchQueue(label: "com.khankartal.lociar.fieldtest", qos: .utility)
    /// Keeps one long outing from growing the file without bound.
    private nonisolated static let maxBytes = 4 * 1_024 * 1_024

    nonisolated static var isEnabled: Bool { UserDefaults.standard.bool(forKey: defaultsKey) }

    /// Reads `-LociFieldTest ON|OFF` once per launch. `ON` also starts a new session marker.
    nonisolated static func configure(arguments: [String] = ProcessInfo.processInfo.arguments,
                                      defaults: UserDefaults = .standard) {
        if let index = arguments.firstIndex(of: "-LociFieldTest"), arguments.indices.contains(index + 1) {
            switch arguments[index + 1].uppercased() {
            case "ON": defaults.set(true, forKey: defaultsKey)
            case "OFF": defaults.set(false, forKey: defaultsKey)
            default: break
            }
        }
        guard defaults.bool(forKey: defaultsKey) else { return }
        record("launch", ["thermal": thermalName(ProcessInfo.processInfo.thermalState),
                          "lowPower": ProcessInfo.processInfo.isLowPowerModeEnabled ? "1" : "0"])
    }

    nonisolated static func record(_ event: String, _ fields: [String: String] = [:]) {
        guard isEnabled else { return }
        write(line(event: event, fields: fields, at: Date()), to: fileURL())
    }

    nonisolated static func thermalName(_ state: ProcessInfo.ThermalState) -> String {
        switch state {
        case .nominal: return "nominal"
        case .fair: return "fair"
        case .serious: return "serious"
        case .critical: return "critical"
        @unknown default: return "unknown"
        }
    }

    /// One JSON object per line: `t` (ISO-8601 with milliseconds), `e` (event) and the fields.
    nonisolated static func line(event: String, fields: [String: String], at date: Date) -> Data {
        var object: [String: String] = fields
        object["t"] = FirestoreJSON.isoString(date)
        object["e"] = event
        var data = (try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])) ?? Data()
        data.append(0x0A)
        return data
    }

    nonisolated static func fileURL(base: URL? = nil) -> URL {
        let root = base ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return root.appendingPathComponent(relativePath)
    }

    nonisolated static func write(_ data: Data, to url: URL, synchronously: Bool = false) {
        let work: @Sendable () -> Void = {
            let manager = FileManager.default
            try? manager.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            if let size = (try? manager.attributesOfItem(atPath: url.path))?[.size] as? Int, size > maxBytes {
                try? manager.removeItem(at: url)
            }
            if !manager.fileExists(atPath: url.path) {
                // Readable after first unlock: region events arrive while the phone is locked.
                manager.createFile(atPath: url.path, contents: nil,
                                   attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
            }
            guard let handle = try? FileHandle(forWritingTo: url) else { return }
            defer { try? handle.close() }
            _ = try? handle.seekToEnd()
            try? handle.write(contentsOf: data)
        }
        if synchronously { queue.sync(execute: work) } else { queue.async(execute: work) }
    }
}
