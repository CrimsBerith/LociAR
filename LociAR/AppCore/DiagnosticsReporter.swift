import Foundation
import CoreLocation
@preconcurrency import FirebaseCore
@preconcurrency import FirebaseCrashlytics
@preconcurrency import FirebaseFunctions

/// Only fixed categories cross the diagnostics boundary. Never forward an SDK error's
/// description, userInfo, domain, request, content, identity or location to Crashlytics.
enum DiagnosticComponent: String, CaseIterable, Sendable {
    case backend, publishing, reading, accountDeletion, profile, push, regionMonitoring, ar

    nonisolated static func callable(_ name: String) -> Self {
        switch name {
        case "createPost", "createPlaceNote", "createComment": .publishing
        case "readPublicContent", "listMapContent", "listNearbyPosts": .reading
        case "deleteAccount": .accountDeletion
        case "ensureProfile", "updateHandle", "screenAvatar": .profile
        case "registerPushToken", "unregisterPushToken": .push
        case "getArcoreToken", "registerCloudAnchor": .ar
        default: .backend
        }
    }
}

enum DiagnosticFailure: Int, CaseIterable, Sendable {
    case serverInternal = 1, serverUnavailable, timeout, invalidResponse, network, sdk, monitoring, arSession
}

struct DiagnosticEvent: Hashable, Sendable {
    let component: DiagnosticComponent
    let failure: DiagnosticFailure

    nonisolated var sanitizedError: NSError {
        NSError(domain: "LociAR.\(component.rawValue)", code: failure.rawValue,
                userInfo: [NSLocalizedDescriptionKey: "LociAR diagnostic category \(failure.rawValue)"])
    }
}

enum DiagnosticsPolicy {
    nonisolated static func classify(_ error: Error, component: DiagnosticComponent) -> DiagnosticEvent? {
        if error is CancellationError || error is BackendTransientError || error is AuthFlowError { return nil }
        let failure: DiagnosticFailure
        if let backend = error as? BackendCallError {
            guard case .invalidResponse = backend else { return nil }
            failure = .invalidResponse
        } else if error is DecodingError {
            failure = .invalidResponse
        } else {
            let ns = error as NSError
            switch ns.domain {
            case FunctionsErrorDomain:
                let reason = (ns.userInfo["details"] as? [String: Any])?["reason"] as? String
                if ["service_paused", "busy_retry", "deletion_pending"].contains(reason) { return nil }
                switch FunctionsErrorCode(rawValue: ns.code) {
                case .internal, .unknown, .dataLoss: failure = .serverInternal
                case .unavailable: failure = .serverUnavailable
                case .deadlineExceeded: failure = .timeout
                default: return nil // Validation, permission, auth and quota rejections are expected.
                }
            case NSURLErrorDomain:
                switch URLError.Code(rawValue: ns.code) {
                case .timedOut: failure = .timeout
                case .cannotFindHost, .cannotConnectToHost, .networkConnectionLost,
                     .secureConnectionFailed, .serverCertificateUntrusted: failure = .network
                default: return nil // Cancellation and offline use must not flood the issue list.
                }
            case kCLErrorDomain:
                guard component == .regionMonitoring,
                      ns.code != CLError.denied.rawValue, ns.code != CLError.locationUnknown.rawValue else { return nil }
                failure = .monitoring
            default:
                guard component == .push else { return nil }
                failure = .sdk
            }
        }
        return DiagnosticEvent(component: component, failure: failure)
    }
}

/// Fatal crashes remain automatic. Nonfatal diagnostics are bounded independently of
/// retries/GPS callbacks: the same category at most every 5 minutes, at most 8 per process.
@MainActor
final class DiagnosticsReporter {
    static let shared = DiagnosticsReporter(
        enabled: { FirebaseApp.app() != nil && CrashReportingPreference.isEnabled },
        sink: { Crashlytics.crashlytics().record(error: $0.sanitizedError) }
    )

    private let enabled: () -> Bool
    private let clock: () -> TimeInterval
    private let sink: (DiagnosticEvent) -> Void
    private var lastSent: [DiagnosticEvent: TimeInterval] = [:]
    private var count = 0

    init(enabled: @escaping () -> Bool, clock: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime },
         sink: @escaping (DiagnosticEvent) -> Void) {
        self.enabled = enabled; self.clock = clock; self.sink = sink
    }

    func record(_ event: DiagnosticEvent) {
        guard enabled(), count < 8 else { return }
        let now = clock()
        if let previous = lastSent[event], now - previous < 300 { return }
        lastSent[event] = now
        count += 1
        sink(event)
    }

    nonisolated static func report(_ error: Error, component: DiagnosticComponent) {
        guard let event = DiagnosticsPolicy.classify(error, component: component) else { return }
        Task { @MainActor in shared.record(event) }
    }
}
