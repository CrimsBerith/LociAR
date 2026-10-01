import Foundation
import UIKit
import UserNotifications

@MainActor
final class NotificationService: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationService()

    private(set) var isAuthorized = false
    private(set) var deviceTokenString: String?
    var onPostNotificationTapped: ((UUID) -> Void)?

    private override init() {
        super.init()
    }

    func configure() {
        UNUserNotificationCenter.current().delegate = self
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
    }

    func didFailToRegisterForRemoteNotifications(error: Error) {
        // Logged or handled silently in production
    }

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
