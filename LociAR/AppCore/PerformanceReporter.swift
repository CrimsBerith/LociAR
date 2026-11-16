import FirebaseCore
@preconcurrency import FirebaseCrashlytics
import Foundation
import MetricKit

/// Field performance from MetricKit: iOS delivers at most one summary a day for the previous day.
/// The reporter turns it into a few numbers and sends one Crashlytics non-fatal event
/// ("LociPerformance", code 1), under the same "Crash reports" switch in Settings. No location,
/// content, account identifier or free text leaves the device.
final class PerformanceReporter: NSObject, MXMetricManagerSubscriber, @unchecked Sendable {
    static let shared = PerformanceReporter()
    nonisolated static let errorDomain = "LociPerformance"
    private var started = false
    private let lock = NSLock()

    func start() {
        lock.lock(); defer { lock.unlock() }
        guard !started else { return }
        started = true
        MXMetricManager.shared.add(self)
    }

    nonisolated func didReceive(_ payloads: [MXMetricPayload]) {
        for payload in payloads {
            let summary = PerformanceSummary(payload)
            Task { @MainActor in Self.send(summary) }
        }
    }

    nonisolated func didReceive(_ payloads: [MXDiagnosticPayload]) {
        // Crashlytics already reports crashes; hangs and CPU/disk exceptions are counted here.
        let hangs = payloads.reduce(0) { $0 + ($1.hangDiagnostics?.count ?? 0) }
        let cpu = payloads.reduce(0) { $0 + ($1.cpuExceptionDiagnostics?.count ?? 0) }
        let disk = payloads.reduce(0) { $0 + ($1.diskWriteExceptionDiagnostics?.count ?? 0) }
        guard hangs + cpu + disk > 0 else { return }
        let fields = ["hang_reports": hangs, "cpu_exceptions": cpu, "disk_write_exceptions": disk].mapValues { NSNumber(value: $0) }
        Task { @MainActor in Self.record(code: 2, fields: fields) }
    }

    @MainActor private static func send(_ summary: PerformanceSummary) {
        record(code: 1, fields: summary.fields)
    }

    @MainActor private static func record(code: Int, fields: [String: Any]) {
        guard FirebaseApp.isDefaultAppConfigured(), CrashReportingPreference.isEnabled, !fields.isEmpty else { return }
        Crashlytics.crashlytics().record(error: NSError(domain: errorDomain, code: code, userInfo: fields))
    }
}

/// Numbers only. Histograms become their bucket-midpoint mean; absent metrics are left out.
struct PerformanceSummary: Equatable, Sendable {
    var launchMs: Int?
    var resumeMs: Int?
    var hangMsTotal: Int?
    var scrollHitchMsPerS: Double?
    var peakMemoryMB: Int?
    var cpuSeconds: Int?
    var foregroundAbnormalExits: Int?
    var foregroundMemoryExits: Int?

    init(launchMs: Int? = nil, resumeMs: Int? = nil, hangMsTotal: Int? = nil, scrollHitchMsPerS: Double? = nil,
         peakMemoryMB: Int? = nil, cpuSeconds: Int? = nil, foregroundAbnormalExits: Int? = nil, foregroundMemoryExits: Int? = nil) {
        self.launchMs = launchMs; self.resumeMs = resumeMs; self.hangMsTotal = hangMsTotal; self.scrollHitchMsPerS = scrollHitchMsPerS
        self.peakMemoryMB = peakMemoryMB; self.cpuSeconds = cpuSeconds
        self.foregroundAbnormalExits = foregroundAbnormalExits; self.foregroundMemoryExits = foregroundMemoryExits
    }

    init(_ payload: MXMetricPayload) {
        self.init()
        if let launch = payload.applicationLaunchMetrics {
            launchMs = Self.mean(Self.buckets(launch.histogrammedTimeToFirstDraw)).map { Int($0) }
            resumeMs = Self.mean(Self.buckets(launch.histogrammedApplicationResumeTime)).map { Int($0) }
        }
        if let responsiveness = payload.applicationResponsivenessMetrics {
            let hangs = Self.buckets(responsiveness.histogrammedApplicationHangTime)
            hangMsTotal = hangs.isEmpty ? nil : Int(hangs.reduce(0) { $0 + ($1.start + $1.end) / 2 * Double($1.count) })
        }
        if let ratio = payload.animationMetrics?.scrollHitchTimeRatio {
            // Reported as milliseconds of hitch per second of scrolling.
            scrollHitchMsPerS = (ratio.value * 100).rounded() / 100
        }
        if let memory = payload.memoryMetrics?.peakMemoryUsage {
            peakMemoryMB = Int(memory.converted(to: .megabytes).value.rounded())
        }
        if let cpu = payload.cpuMetrics?.cumulativeCPUTime {
            cpuSeconds = Int(cpu.converted(to: .seconds).value.rounded())
        }
        if let exits = payload.applicationExitMetrics?.foregroundExitData {
            foregroundAbnormalExits = exits.cumulativeAbnormalExitCount
            foregroundMemoryExits = exits.cumulativeMemoryResourceLimitExitCount
        }
    }

    /// Keys that reach Crashlytics; values are numbers only.
    var fields: [String: Any] {
        var out: [String: Any] = [:]
        if let launchMs { out["launch_ms"] = launchMs }
        if let resumeMs { out["resume_ms"] = resumeMs }
        if let hangMsTotal { out["hang_ms_total"] = hangMsTotal }
        if let scrollHitchMsPerS { out["scroll_hitch_ms_per_s"] = scrollHitchMsPerS }
        if let peakMemoryMB { out["peak_memory_mb"] = peakMemoryMB }
        if let cpuSeconds { out["cpu_s"] = cpuSeconds }
        if let foregroundAbnormalExits { out["fg_abnormal_exits"] = foregroundAbnormalExits }
        if let foregroundMemoryExits { out["fg_memory_exits"] = foregroundMemoryExits }
        return out
    }

    typealias Bucket = (start: Double, end: Double, count: Int)

    /// Bucket bounds in milliseconds.
    static func buckets(_ histogram: MXHistogram<UnitDuration>) -> [Bucket] {
        histogram.bucketEnumerator.compactMap { item -> Bucket? in
            guard let bucket = item as? MXHistogramBucket<UnitDuration> else { return nil }
            return (bucket.bucketStart.converted(to: .milliseconds).value, bucket.bucketEnd.converted(to: .milliseconds).value, bucket.bucketCount)
        }
    }

    /// Count-weighted mean of the bucket midpoints; nil when the histogram is empty.
    static func mean(_ buckets: [Bucket]) -> Double? {
        let total = buckets.reduce(0) { $0 + $1.count }
        guard total > 0 else { return nil }
        return buckets.reduce(0) { $0 + ($1.start + $1.end) / 2 * Double($1.count) } / Double(total)
    }
}
