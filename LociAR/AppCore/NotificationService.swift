import Foundation
import UIKit
import UserNotifications
@preconcurrency import FirebaseCrashlytics
@preconcurrency import FirebaseMessaging

@MainActor
final class NotificationService: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationService()

    private(set) var isAuthorized = false
    private(set) var deviceTokenString: String?
    /// Most recently received FCM registration token (nil until first token delivery).
    private(set) var fcmToken: String?
    var onPostNotificationTapped: ((UUID) -> Void)?
    /// Set by the auth layer: receives every new FCM token so the server can target this device.
    var onFCMTokenUpdate: (@Sendable (String) -> Void)?

    private override init() {
        super.init()
    }

    func configure() {
        UNUserNotificationCenter.current().delegate = self
        Messaging.messaging().delegate = self
        Task { await checkAuthorizationStatus() }
    }

    func checkAuthorizationStatus() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        isAuthorized = settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional
    }

    func requestAuthorization() async -> Bool {
        do {
            let granted = try await UNUserNotificationCenter.current().requestAuthorization(
                options: [.alert, .badge, .sound]
            )
            isAuthorized = granted
            if granted {
                UIApplication.shared.registerForRemoteNotifications()
            }
            return granted
        } catch {
            isAuthorized = false
            return false
        }
    }

    func didRegisterForRemoteNotifications(deviceToken: Data) {
        let tokenParts = deviceToken.map { data in String(format: "%02.2hhx", data) }
        let token = tokenParts.joined()
        self.deviceTokenString = token
        // Forward APNs token to Firebase so it can map it to an FCM token.
        Messaging.messaging().apnsToken = deviceToken
    }

    func didFailToRegisterForRemoteNotifications(error: Error) {
        Crashlytics.crashlytics().record(error: error)
    }

    // MARK: - UNUserNotificationCenterDelegate

    // Foreground presentation
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .badge]
    }

    // Response when user taps the notification
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
            self.fcmToken = fcmToken
            self.onFCMTokenUpdate?(fcmToken)
        }
        // The token reaches the server only through the `registerPushToken` callable (FirebaseAuthRepository).
    }
}

// MARK: - UIApplicationDelegate

final class LociAppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
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
