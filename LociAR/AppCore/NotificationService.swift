import Foundation
import OSLog
import UIKit
import UserNotifications
@preconcurrency import FirebaseCore
@preconcurrency import FirebaseCrashlytics
@preconcurrency import FirebaseMessaging

/// Push notifications for likes, comments and follows (sent by Cloud Functions through FCM).
/// The FCM token is registered with the `registerPushToken` callable only while signed in and
/// removed with `unregisterPushToken` before sign-out; the app never writes it to Firestore.
@MainActor
final class NotificationService: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationService()

    private(set) var isAuthorized = false
    private(set) var authorizationStatus: UNAuthorizationStatus = .notDetermined
    /// Most recently received FCM registration token (nil until first token delivery).
    private(set) var fcmToken: String?
    /// Hex form of the last APNs device token (diagnostics; FCM uses the raw data).
    private(set) var deviceTokenString: String?
    var onPostNotificationTapped: ((UUID) -> Void)?
    /// Set by AppContainer when the backend is configured; nil in previews and UI tests.
    var callables: CallableClient?

    private var isSignedIn = false
    private var uploadedToken: String?
    private var isConfigured = false
    private let logger = Logger(subsystem: "com.khankartal.lociar", category: "push")

    private override init() {
        super.init()
    }

    func configure() {
        UNUserNotificationCenter.current().delegate = self
        // Messaging needs a configured FirebaseApp (missing config → previews / UI tests).
        guard FirebaseApp.app() != nil else { return }
        Messaging.messaging().delegate = self
        isConfigured = true
        Task { await refreshAuthorization() }
    }

    func refreshAuthorization() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        authorizationStatus = settings.authorizationStatus
        isAuthorized = settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional
        // APNs hands out a fresh device token on every launch; FCM maps it to its registration token.
        if isAuthorized, isConfigured { UIApplication.shared.registerForRemoteNotifications() }
    }

    /// Asks for permission the first time it makes sense (after the user's first publish), never at launch.
    func requestAuthorizationInContext() async {
        await refreshAuthorization()
        guard authorizationStatus == .notDetermined, isConfigured else { return }
        do {
            let granted = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound])
            isAuthorized = granted
            authorizationStatus = granted ? .authorized : .denied
            if granted { UIApplication.shared.registerForRemoteNotifications() }
        } catch {
            logger.error("push_authorization_failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Called whenever the session phase changes.
    func sessionChanged(signedIn: Bool) async {
        isSignedIn = signedIn
        if signedIn {
            await refreshAuthorization()
            await uploadTokenIfNeeded()
        }
    }

    /// Must run while the Firebase user is still signed in (the callable needs auth).
    func prepareForSignOut() async {
        defer { isSignedIn = false }
        guard let token = uploadedToken, let callables else { return }
        struct Payload: Encodable, Sendable { let token: String }
        do {
            let _: Acknowledgement = try await callables.call("unregisterPushToken", payload: Payload(token: token), timeout: 8)
        } catch {
            logger.error("push_unregister_failed: \(error.localizedDescription, privacy: .public)")
        }
        uploadedToken = nil
    }

    /// The server deletes every device of a deleted account; only local state is reset here.
    func accountDeleted() async {
        isSignedIn = false
        uploadedToken = nil
        guard isConfigured else { return }
        try? await Messaging.messaging().deleteToken()
        fcmToken = nil
    }

    private struct Acknowledgement: Decodable, Sendable {}

    private func uploadTokenIfNeeded() async {
        guard isSignedIn, isAuthorized, let token = fcmToken, token != uploadedToken, let callables else { return }
        struct Payload: Encodable, Sendable { let token: String; let locale: String }
        do {
            let _: Acknowledgement = try await callables.call(
                "registerPushToken", payload: Payload(token: token, locale: Locale.preferredLanguages.first ?? "en"), timeout: 10
            )
            uploadedToken = token
        } catch {
            logger.error("push_register_failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    func didRegisterForRemoteNotifications(deviceToken: Data) {
        deviceTokenString = deviceToken.map { String(format: "%02x", $0) }.joined()
        guard isConfigured else { return }
        // Forward the APNs token to Firebase so it can map it to an FCM token.
        Messaging.messaging().apnsToken = deviceToken
    }

    func didFailToRegisterForRemoteNotifications(error: Error) {
        logger.error("apns_registration_failed: \(error.localizedDescription, privacy: .public)")
        if isConfigured { Crashlytics.crashlytics().record(error: error) }
    }

    fileprivate func receivedRegistrationToken(_ token: String) async {
        fcmToken = token
        await uploadTokenIfNeeded()
    }

    // MARK: - UNUserNotificationCenterDelegate

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .badge]
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        let userInfo = response.notification.request.content.userInfo
        if let postIDString = userInfo["post_id"] as? String, let postUUID = UUID(uuidString: postIDString) {
            await MainActor.run {
                self.onPostNotificationTapped?(postUUID)
            }
        }
    }
}

// MARK: - MessagingDelegate

extension NotificationService: MessagingDelegate {
    nonisolated func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let fcmToken else { return }
        Task { @MainActor in
            await self.receivedRegistrationToken(fcmToken)
        }
    }
}

// MARK: - Crash reporting preference

/// Crash reports (Firebase Crashlytics) are on by default and can be turned off in Profile → Settings.
@MainActor
enum CrashReportingPreference {
    static let key = "crash_reports_enabled"

    static var isEnabled: Bool {
        get { UserDefaults.standard.object(forKey: key) as? Bool ?? true }
        set {
            UserDefaults.standard.set(newValue, forKey: key)
            apply()
        }
    }

    static func apply() {
        guard FirebaseApp.app() != nil else { return }
        Crashlytics.crashlytics().setCrashlyticsCollectionEnabled(isEnabled)
    }
}

// MARK: - UIApplicationDelegate

final class LociAppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        CrashReportingPreference.apply()
        NotificationService.shared.configure()
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        NotificationService.shared.didRegisterForRemoteNotifications(deviceToken: deviceToken)
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        NotificationService.shared.didFailToRegisterForRemoteNotifications(error: error)
    }
}
