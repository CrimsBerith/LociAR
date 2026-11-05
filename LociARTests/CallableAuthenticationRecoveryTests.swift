import Foundation
import FirebaseFunctions
import XCTest
@testable import LociAR

final class CallableAuthenticationRecoveryTests: XCTestCase, @unchecked Sendable {
    private func unauthenticated() -> NSError {
        NSError(domain: FunctionsErrorDomain, code: FunctionsErrorCode.unauthenticated.rawValue,
                userInfo: [NSLocalizedDescriptionKey: "UNAUTHENTICATED"])
    }

    func testExpiredTokenRefreshesOnceAndReturnsRetriedResponse() async throws {
        var calls = 0, refreshes = 0
        let response = try await CallableAuthenticationRecovery.run(
            expectedUID: "original", currentUID: { "original" },
            refreshToken: { refreshes += 1 },
            request: {
                calls += 1
                if calls == 1 { throw self.unauthenticated() }
                return Data("recovered".utf8)
            }
        )
        XCTAssertEqual(response, Data("recovered".utf8))
        XCTAssertEqual(calls, 2)
        XCTAssertEqual(refreshes, 1)
    }

    func testRefreshFailureDoesNotReplayRequestWithStaleToken() async {
        let offline = NSError(domain: NSURLErrorDomain, code: NSURLErrorNotConnectedToInternet)
        var calls = 0, refreshes = 0
        do {
            let _: Data = try await CallableAuthenticationRecovery.run(
                expectedUID: "original", currentUID: { "original" },
                refreshToken: { refreshes += 1; throw offline },
                request: { calls += 1; throw self.unauthenticated() }
            )
            XCTFail("A failed refresh must terminate the request")
        } catch {
            XCTAssertEqual((error as NSError).domain, NSURLErrorDomain)
            XCTAssertEqual((error as NSError).code, NSURLErrorNotConnectedToInternet)
        }
        XCTAssertEqual(calls, 1)
        XCTAssertEqual(refreshes, 1)
    }

    func testRepeatedAuthenticationFailureStopsAfterOneRefresh() async {
        var calls = 0, refreshes = 0
        do {
            let _: Data = try await CallableAuthenticationRecovery.run(
                expectedUID: "original", currentUID: { "original" },
                refreshToken: { refreshes += 1 },
                request: { calls += 1; throw self.unauthenticated() }
            )
            XCTFail("Repeated authentication failure must remain a failure")
        } catch {
            XCTAssertEqual((error as NSError).code, FunctionsErrorCode.unauthenticated.rawValue)
        }
        XCTAssertEqual(calls, 2)
        XCTAssertEqual(refreshes, 1)
    }

    func testAccountChangeDuringRefreshNeverRetriesUnderNewAccount() async {
        var uid = "original", calls = 0
        do {
            let _: Data = try await CallableAuthenticationRecovery.run(
                expectedUID: "original", currentUID: { uid },
                refreshToken: { uid = "different" },
                request: { calls += 1; throw self.unauthenticated() }
            )
            XCTFail("Old account request must not be replayed")
        } catch {
            guard case AuthFlowError.notSignedIn = error else { return XCTFail("Unexpected error: \(error)") }
        }
        XCTAssertEqual(calls, 1)
    }

    func testLateSuccessIsRejectedAfterAccountChange() async {
        var uid = "original", refreshes = 0
        do {
            let _: Data = try await CallableAuthenticationRecovery.run(
                expectedUID: "original", currentUID: { uid },
                refreshToken: { refreshes += 1 },
                request: { uid = "different"; return Data("private response".utf8) }
            )
            XCTFail("Old account response must not be delivered")
        } catch {
            guard case AuthFlowError.notSignedIn = error else { return XCTFail("Unexpected error: \(error)") }
        }
        XCTAssertEqual(refreshes, 0)
    }

    func testNonAuthenticationFailuresAndCancellationAreNotReplayed() async {
        let unavailable = NSError(domain: FunctionsErrorDomain, code: FunctionsErrorCode.unavailable.rawValue)
        for failure in [unavailable as Error, CancellationError()] {
            var calls = 0, refreshes = 0
            do {
                let _: Data = try await CallableAuthenticationRecovery.run(
                    expectedUID: "original", currentUID: { "original" },
                    refreshToken: { refreshes += 1 },
                    request: { calls += 1; throw failure }
                )
                XCTFail("Failure must remain visible")
            } catch {
                if failure is CancellationError { XCTAssertTrue(error is CancellationError) }
                else { XCTAssertEqual((error as NSError).code, unavailable.code) }
            }
            XCTAssertEqual(calls, 1)
            XCTAssertEqual(refreshes, 0)
        }
    }

    func testInviteErrorsNeverExposeRawProviderDiagnostics() {
        let authMessage = String(localized: "Oturumun doğrulanamadı. Tekrar dene.")
        XCTAssertEqual(InviteFailurePresentation.message(for: unauthenticated()), authMessage)
        XCTAssertEqual(InviteFailurePresentation.message(for: AuthFlowError.notSignedIn), authMessage)
        XCTAssertEqual(InviteFailurePresentation.message(for: InviteFlowError.invalid), InviteFlowError.invalid.localizedDescription)
        let raw = NSError(domain: "Provider", code: 17,
                          userInfo: [NSLocalizedDescriptionKey: "SECRET diagnostic / private account ID"])
        XCTAssertEqual(InviteFailurePresentation.message(for: raw), InviteFlowError.unavailable.localizedDescription)
        XCTAssertFalse(InviteFailurePresentation.message(for: raw).contains("SECRET"))
    }
}
