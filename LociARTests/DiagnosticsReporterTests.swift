import Foundation
import CoreLocation
import XCTest
@preconcurrency import FirebaseFunctions
@testable import LociAR

final class DiagnosticsReporterTests: XCTestCase {
    func testServerErrorStripsEveryUntrustedValue() throws {
        let secret = "private-user@example.invalid/41.1,29.2/token/note"
        let original = NSError(domain: FunctionsErrorDomain, code: FunctionsErrorCode.internal.rawValue,
                               userInfo: [NSLocalizedDescriptionKey: secret, "details": ["reason": secret], "url": secret])
        let event = try XCTUnwrap(DiagnosticsPolicy.classify(original, component: .publishing))
        XCTAssertEqual(event, DiagnosticEvent(component: .publishing, failure: .serverInternal))
        let safe = event.sanitizedError
        XCTAssertEqual(safe.domain, "LociAR.publishing")
        XCTAssertFalse(String(describing: safe.userInfo).contains(secret))
        XCTAssertEqual(Set(safe.userInfo.keys), [NSLocalizedDescriptionKey])
        XCTAssertEqual(DiagnosticComponent.callable(secret), .backend)
    }

    func testExpectedFailuresAndOfflineUseAreNotReported() {
        for code in [FunctionsErrorCode.cancelled, .invalidArgument, .permissionDenied, .unauthenticated,
                     .resourceExhausted, .notFound, .alreadyExists, .failedPrecondition, .aborted] {
            XCTAssertNil(DiagnosticsPolicy.classify(NSError(domain: FunctionsErrorDomain, code: code.rawValue), component: .backend))
        }
        for reason in ["service_paused", "busy_retry", "deletion_pending"] {
            let error = NSError(domain: FunctionsErrorDomain, code: FunctionsErrorCode.unavailable.rawValue,
                                userInfo: ["details": ["reason": reason]])
            XCTAssertNil(DiagnosticsPolicy.classify(error, component: .accountDeletion))
        }
        for error in [CancellationError(), URLError(.notConnectedToInternet), URLError(.cancelled), AuthFlowError.notSignedIn] as [Error] {
            XCTAssertNil(DiagnosticsPolicy.classify(error, component: .push))
        }
    }

    func testResponseAndNetworkFailuresHaveStableCategories() {
        XCTAssertEqual(DiagnosticsPolicy.classify(BackendCallError.invalidResponse, component: .reading)?.failure, .invalidResponse)
        XCTAssertEqual(DiagnosticsPolicy.classify(URLError(.timedOut), component: .ar)?.failure, .timeout)
        XCTAssertNil(DiagnosticsPolicy.classify(NSError(domain: "private-domain", code: 912), component: .backend))
        XCTAssertEqual(DiagnosticsPolicy.classify(NSError(domain: "private-domain", code: 912), component: .push)?.failure, .sdk)
    }

    func testRegionPermissionAndUnknownLocationAreExpectedButMonitoringFaultIsReported() {
        for code in [CLError.denied, .locationUnknown] {
            XCTAssertNil(DiagnosticsPolicy.classify(NSError(domain: kCLErrorDomain, code: code.rawValue), component: .regionMonitoring))
        }
        let failure = NSError(domain: kCLErrorDomain, code: CLError.regionMonitoringFailure.rawValue,
                              userInfo: [NSLocalizedDescriptionKey: "private-region-and-location"])
        XCTAssertEqual(DiagnosticsPolicy.classify(failure, component: .regionMonitoring)?.failure, .monitoring)
    }

    func testDecodingErrorCannotIncludePayloadOrCodingPathInTheReport() throws {
        let privateValue = "private-note-token"
        let error = DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: privateValue))
        let event = try XCTUnwrap(DiagnosticsPolicy.classify(error, component: .reading))
        XCTAssertEqual(event.failure, .invalidResponse)
        XCTAssertFalse(String(describing: event.sanitizedError).contains(privateValue))
    }

    @MainActor
    func testOptOutAndDuplicateSuppressionDoNotConsumeBudget() {
        var enabled = false
        var time: TimeInterval = 100
        var sent: [DiagnosticEvent] = []
        let reporter = DiagnosticsReporter(enabled: { enabled }, clock: { time }, sink: { sent.append($0) })
        let event = DiagnosticEvent(component: .push, failure: .sdk)
        reporter.record(event)
        XCTAssertTrue(sent.isEmpty)
        enabled = true
        reporter.record(event)
        for _ in 0..<100 { reporter.record(event) }
        XCTAssertEqual(sent.count, 1)
        time += 299
        reporter.record(event)
        XCTAssertEqual(sent.count, 1)
        time += 1
        reporter.record(event)
        XCTAssertEqual(sent.count, 2)
        enabled = false
        time += 300
        reporter.record(event)
        XCTAssertEqual(sent.count, 2)
    }

    @MainActor
    func testNonfatalBudgetIsBoundedAcrossComponentsAndLongSessions() {
        var time: TimeInterval = 0
        var sent: [DiagnosticEvent] = []
        let reporter = DiagnosticsReporter(enabled: { true }, clock: { time }, sink: { sent.append($0) })
        for _ in 0..<10 {
            for component in DiagnosticComponent.allCases {
                reporter.record(DiagnosticEvent(component: component, failure: .serverUnavailable))
            }
            time += 301
        }
        XCTAssertEqual(sent.count, 8)
    }
}
