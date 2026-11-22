#!/usr/bin/env python3
"""Execute two current Swift implementations with synthetic I/O, without an app or network.

Passing reproduces remaining behavior; it is a diagnostic, not a release acceptance test.
The actor/coordinator bodies are extracted verbatim from production source on each run.
"""
from pathlib import Path
import hashlib
import json
import subprocess
import tempfile

root = Path(__file__).resolve().parent.parent
gif_file = root / "LociAR/DesignSystem/AnimatedGIFView.swift"
region_file = root / "LociAR/AppCore/ArrivalRuntimePolicy.swift"
def section(path, start, end=None):
    """The source between two markers; a clear error, not an IndexError, when the code moved."""
    text = path.read_text(encoding="utf-8")
    if start not in text or (end is not None and end not in text.split(start, 1)[1]):
        raise SystemExit(f"{path.name}: marker not found ({start!r}); update this audit to the current code.")
    body = text.split(start, 1)[1]
    return body.split(end, 1)[0] if end is not None else body


gif = section(gif_file, "actor GifDataCache {", "\n/// Plays a GIF")
gif = "actor GifDataCache {" + gif
region = section(region_file, "@MainActor\nfinal class ArrivalRegionRefreshCoordinator")
region = "@MainActor\nfinal class ArrivalRegionRefreshCoordinator" + region.split("\n/// Complete restore plan", 1)[0]
harness = r'''
final class RequestCount: @unchecked Sendable {
    static let shared = RequestCount()
    private let lock = NSLock()
    private var value = 0
    func increment() { lock.lock(); value += 1; lock.unlock() }
    func read() -> Int { lock.lock(); defer { lock.unlock() }; return value }
}
final class AuditMediaProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "lociar-cost-audit.invalid" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        RequestCount.shared.increment()
        DispatchQueue.global().asyncAfter(deadline: .now() + 0.05) { [self] in
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: "HTTP/1.1",
                headerFields: ["Content-Type": "image/gif", "Cache-Control": "no-store"])!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: Data("GIF89a".utf8))
            client?.urlProtocolDidFinishLoading(self)
        }
    }
    override func stopLoading() {}
}
@MainActor final class RegionProbe {
    let coordinator = ArrivalRegionRefreshCoordinator()
    var operations = 0
    var applied = 0
    var followers: [Task<Bool, Never>] = []
    func operation() async -> Bool {
        operations += 1
        let expectedRevision = coordinator.revision
        if operations <= 5 {
            // Same requested area/account/consent each time, like repeated GPS callbacks.
            followers.append(Task { await self.coordinator.refresh { await self.operation() } })
        }
        try? await Task.sleep(for: .milliseconds(10))
        // This is synchronizeOnce's existing revision fence, without Firebase/GPS side effects.
        guard expectedRevision == coordinator.revision else { return false }
        applied += 1
        return true
    }
    func run() async -> [String: Int] {
        let result = await coordinator.refresh { await self.operation() }
        for task in followers { _ = await task.value }
        precondition(result && operations == 6 && applied == 1)
        return ["identicalRefreshRequests": 6, "networkOperationRounds": operations, "appliedRounds": applied]
    }
}
@main struct AuditMain {
    @MainActor static func main() async throws {
        precondition(URLProtocol.registerClass(AuditMediaProtocol.self))
        let url = URL(string: "https://lociar-cost-audit.invalid/only-synthetic-media.gif")!
        let consumers = await withTaskGroup(of: Int.self, returning: Int.self) { group in
            for _ in 0..<8 { group.addTask { await GifDataCache.shared.data(for: url)?.count == 6 ? 1 : 0 } }
            var loaded = 0
            for await result in group { loaded += result }
            return loaded
        }
        let requests = RequestCount.shared.read()
        _ = await GifDataCache.shared.data(for: url)
        precondition(consumers == 8 && requests == 1 && RequestCount.shared.read() == requests)
        let regions = await RegionProbe().run()
        let data = try JSONSerialization.data(withJSONObject: [
            "gifMedia": ["concurrentConsumers": consumers, "syntheticURLRequests": requests,
                         "extraRequestsForLaterSerialHit": RequestCount.shared.read() - requests],
            "regionRefresh": regions,
            "externalNetworkUsed": false,
        ], options: [.sortedKeys])
        print(String(decoding: data, as: UTF8.self))
    }
}
'''
with tempfile.TemporaryDirectory(prefix="lociar-native-cost-audit-") as directory:
    source = Path(directory) / "Audit.swift"
    binary = Path(directory) / "Audit"
    source.write_text("import Foundation\n" + gif + "\n" + region + "\n" + harness)
    subprocess.run(["xcrun", "swiftc", "-parse-as-library", "-swift-version", "6", str(source), "-o", str(binary)], check=True, timeout=600)
    result = subprocess.run([str(binary)], check=True, capture_output=True, text=True, timeout=300)
    print(result.stdout.strip())
    print(json.dumps({"extractedSourceSHA256": {
        str(gif_file.relative_to(root)): hashlib.sha256(gif.encode()).hexdigest(),
        str(region_file.relative_to(root)): hashlib.sha256(region.encode()).hexdigest(),
    }}, sort_keys=True))
