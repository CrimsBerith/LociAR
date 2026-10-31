import BackgroundTasks
import Foundation
import UIKit
import UserNotifications
@preconcurrency import FirebaseCore
@preconcurrency import FirebaseAuth
@preconcurrency import FirebaseCrashlytics
@preconcurrency import FirebaseMessaging
@preconcurrency import FirebaseInstallations

@MainActor
protocol PushRegistrationClient: AnyObject {
    func register(token: String, installationID: UUID, userID: UUID, locale: String) async throws
    func unregister(installationID: UUID, userID: UUID) async throws
}

@MainActor
private final class CallablePushRegistrationClient: PushRegistrationClient {
    private let callables: CallableClient
    init(callables: CallableClient) { self.callables = callables }
    private struct Response: Decodable { let ok: Bool }

    private func checkSession(_ userID: UUID) throws {
        guard let uid = Auth.auth().currentUser?.uid,
              FirebaseIdentity.luid(forFirebaseUID: uid) == userID else { throw AuthFlowError.notSignedIn }
    }

    func register(token: String, installationID: UUID, userID: UUID, locale: String) async throws {
        try checkSession(userID)
        struct Payload: Encodable {
            let fid: String
            let installationId: String
            let userId: String
            let locale: String
        }
        let response: Response = try await callables.call("registerPushToken", payload: Payload(
            fid: token, installationId: installationID.uuidString.lowercased(),
            userId: userID.uuidString.lowercased(), locale: locale
        ))
        guard response.ok else { throw BackendCallError.invalidResponse }
    }

    func unregister(installationID: UUID, userID: UUID) async throws {
        try checkSession(userID)
        struct Payload: Encodable { let installationId: String; let userId: String }
        let response: Response = try await callables.call("unregisterPushToken", payload: Payload(
            installationId: installationID.uuidString.lowercased(), userId: userID.uuidString.lowercased()
        ))
        guard response.ok else { throw BackendCallError.invalidResponse }
    }
}

/// Serializes registration/rotation and drains an in-flight registration before unregistering.
/// It has no UIKit/FCM side effects and is exercised with an injected client in native unit tests.
@MainActor
final class PushTokenCoordinator {
    private struct Registration: Equatable { let userID: UUID; let token: String; let locale: String }
    private let client: any PushRegistrationClient
    let installationID: UUID
    private let locale: () -> String
    private(set) var userID: UUID?
    private var token: String?
    private var registered: Registration?
    private var registeredAt: Date?
    private var revision = 0
    private var task: Task<Void, Never>?
    var onFailure: ((Error) -> Void)?

    init(client: any PushRegistrationClient, installationID: UUID, locale: @escaping () -> String = { Locale.preferredLanguages.first ?? "en" }) {
        self.client = client
        self.installationID = installationID
        self.locale = locale
    }

    func updateUser(_ id: UUID?) {
        if userID != id { revision += 1; registered = nil; userID = id }
        if id == nil { task?.cancel() }
        schedule()
    }

    func updateToken(_ value: String?) {
        if token != value { revision += 1; registered = nil; token = value }
        schedule()
    }

    private func schedule() {
        guard let userID, let token, !token.isEmpty else { return }
        let target = Registration(userID: userID, token: token, locale: locale())
        let revision = revision
        let previous = task
        task = Task { [weak self] in
            await previous?.value
            guard let self, !Task.isCancelled, self.revision == revision,
                  self.userID == target.userID, self.token == target.token else { return }
            if self.registered == target, let at = self.registeredAt, Date().timeIntervalSince(at) < 86_400 { return }
            do {
                try await self.client.register(token: target.token, installationID: self.installationID,
                                               userID: target.userID, locale: target.locale)
                guard self.revision == revision else { return }
                self.registered = target
                self.registeredAt = Date()
            } catch { self.onFailure?(error) }
        }
    }

    func finishPendingRegistration() async { await task?.value }

    func disconnect(userID: UUID) async {
        updateUser(nil)
        updateToken(nil)
        await finishPendingRegistration()
        do { try await client.unregister(installationID: installationID, userID: userID) }
        catch { onFailure?(error) }
    }
}

struct PushNotificationTarget: Equatable, Sendable {
    let recipientID: UUID
    let postID: UUID?
    let activityID: String?
    /// Dense-spot alerts open the map here instead of a post.
    var mapFocus: MapFocus? = nil

    init?(recipient: String?, post: String?, activity: String? = nil, focusLat: Double? = nil, focusLng: Double? = nil) {
        guard let recipient, let id = UUID(uuidString: recipient) else { return nil }
        if let post, !post.isEmpty, UUID(uuidString: post) == nil { return nil }
        if let activity, !SocialActivity.isValidID(activity) { return nil }
        recipientID = id
        postID = post.flatMap(UUID.init(uuidString:))
        activityID = activity
        if let focusLat, let focusLng, ProximityPolicy.isValidCoordinate(latitude: focusLat, longitude: focusLng) {
            mapFocus = MapFocus(latitude: focusLat, longitude: focusLng)
        }
    }
}

/// APNs callbacks and foreground refresh share one SDK registration; sign-out drains it first.
@MainActor
final class PushSDKRegistrationFlight {
    private var flight: (id: UUID, task: Task<Void, Error>)?
    func register(_ operation: @escaping @MainActor () async throws -> Void) async throws {
        let current: (id: UUID, task: Task<Void, Error>)
        if let flight { current = flight }
        else {
            current = (UUID(), Task { try await operation() })
            flight = current
        }
        defer { if flight?.id == current.id { flight = nil } }
        try await current.task.value
    }
    func drain() async {
        guard let current = flight else { return }
        _ = try? await current.task.value
        if flight?.id == current.id { flight = nil }
    }
}

@MainActor
final class NotificationService: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationService()
    private(set) var isAuthorized = false
    private(set) var authorizationDenied = false
    private(set) var authorizationStatus: UNAuthorizationStatus = .notDetermined
    private(set) var deviceTokenString: String?
    private(set) var firebaseInstallationID: String?
    var onPostNotificationTapped: ((UUID) -> Void)? { didSet { consumePendingTap() } }
    var onActivityNotificationTapped: (() -> Void)? { didSet { consumePendingTap() } }
    var onMapFocusNotificationTapped: ((MapFocus) -> Void)? { didSet { consumePendingTap() } }
    private var coordinator: PushTokenCoordinator?
    private let messagingRegistration = PushSDKRegistrationFlight()
    private var desiredUserID: UUID?
    private var boundUserID: UUID?
    private var transition: Task<Void, Never>?
    private var acceptsTokens = false
    private var deliveryEnabled = false
    private var tokenRevision = 0
    private var pendingTap: PushNotificationTarget?
    private var social: (any SocialRepository)?

    private override init() { super.init() }

    /// Called only after Firebase configuration; previews never configure Messaging.
    func configure(callables: CallableClient, social: any SocialRepository) {
        guard coordinator == nil else { return }
        let defaults = UserDefaults.standard
        let key = "lociar.push-installation-id"
        let installationID = defaults.string(forKey: key).flatMap(UUID.init(uuidString:)) ?? UUID()
        defaults.set(installationID.uuidString, forKey: key)
        let coordinator = PushTokenCoordinator(client: CallablePushRegistrationClient(callables: callables), installationID: installationID)
        coordinator.onFailure = { error in Self.recordFailure(error) }
        self.coordinator = coordinator
        self.social = social
        UNUserNotificationCenter.current().delegate = self
        Messaging.messaging().isAutoInitEnabled = false
        Messaging.messaging().delegate = self
    }

    private static func recordFailure(_ error: Error) {
        debugTrace("failure domain=\((error as NSError).domain) code=\((error as NSError).code)")
        DiagnosticsReporter.report(error, component: .push)
    }

    private static func debugTrace(_ message: String) {
#if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--push-diagnostics") {
            NSLog("[LociAR.Push] %@", message)
        }
#endif
    }

    func checkAuthorizationStatus() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        authorizationStatus = settings.authorizationStatus
        isAuthorized = settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional
        authorizationDenied = settings.authorizationStatus == .denied
        Self.debugTrace("authorization=\(settings.authorizationStatus.rawValue) delivery=\(deliveryEnabled) user=\(desiredUserID != nil)")
    }

    /// Never prompts at launch: the profile button explicitly requests permission.
    func requestAuthorization() async -> Bool {
        guard coordinator != nil, desiredUserID != nil else { return false }
        do {
            _ = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound])
            await refreshForCurrentUser()
            return isAuthorized
        } catch { Self.recordFailure(error); return false }
    }

    /// Settings and contextual prompts reuse the session-fenced registration path.
    func refreshAuthorization() async {
        await checkAuthorizationStatus()
        await refreshForCurrentUser()
    }

    func requestAuthorizationInContext() async {
        await checkAuthorizationStatus()
        guard authorizationStatus == .notDetermined else { return }
        _ = await requestAuthorization()
    }

    func setUser(_ userID: UUID?) {
        guard coordinator != nil else { return }
        if desiredUserID == userID {
            if userID != nil { scheduleTransition(to: userID) }
            return
        }
        desiredUserID = userID
        tokenRevision += 1
        acceptsTokens = false
        coordinator?.updateUser(nil) // immediately fence any queued registration
        if userID == nil { pendingTap = nil }
        scheduleTransition(to: userID)
    }

    func setDeliveryEnabled(_ enabled: Bool) {
        guard enabled != deliveryEnabled else { return }
        deliveryEnabled = enabled
        if !enabled { acceptsTokens = false; coordinator?.updateUser(nil) }
        scheduleTransition(to: desiredUserID)
    }

    func refreshForCurrentUser() async {
        guard coordinator != nil else { return }
        scheduleTransition(to: desiredUserID)
        await transition?.value
    }

    private func scheduleTransition(to userID: UUID?) {
        let previous = transition
        transition = Task { [weak self] in
            await previous?.value
            guard let self, self.desiredUserID == userID else { return }
            if self.boundUserID != userID {
                if let old = self.boundUserID { await self.disconnect(userID: old) }
                self.boundUserID = nil
                guard self.desiredUserID == userID else { return }
                self.boundUserID = userID
            }
            guard let userID else { return }
            await self.checkAuthorizationStatus()
            guard self.desiredUserID == userID else { return }
            if !self.isAuthorized || !self.deliveryEnabled {
                await self.disconnect(userID: userID)
                return
            }
            self.coordinator?.updateUser(userID)
            self.acceptsTokens = true
            Messaging.messaging().isAutoInitEnabled = true
            UIApplication.shared.registerForRemoteNotifications()
            self.consumePendingTap()
            if Messaging.messaging().apnsToken != nil { await self.registerMessaging() }
        }
    }

    private func registerMessaging() async {
        guard acceptsTokens, let userID = desiredUserID else { return }
        Self.debugTrace("messaging registration started")
        let revision = tokenRevision
        do {
            try await messagingRegistration.register { try await Messaging.messaging().register() }
            guard acceptsTokens, tokenRevision == revision, desiredUserID == userID, boundUserID == userID else { return }
            await refreshInstallationIdentity()
        } catch { Self.recordFailure(error) }
    }

    private func refreshInstallationIdentity() async {
        guard acceptsTokens, Messaging.messaging().apnsToken != nil, let userID = desiredUserID else { return }
        let revision = tokenRevision
        do {
            // Read current SDK state; a delayed callback's identity may belong to an older session.
            let fid = try await Installations.installations().installationID()
            guard acceptsTokens, tokenRevision == revision, desiredUserID == userID, boundUserID == userID else { return }
            firebaseInstallationID = fid
            Self.debugTrace("installation identity ready")
            coordinator?.updateToken(fid)
        } catch { Self.recordFailure(error) }
    }

    /// Call before Firebase Auth sign-out while the old session can still unregister its device.
    func prepareForSignOut() async {
        setUser(nil)
        await transition?.value
    }

    private func disconnect(userID: UUID) async {
        tokenRevision += 1
        acceptsTokens = false
        Messaging.messaging().isAutoInitEnabled = false
        UIApplication.shared.unregisterForRemoteNotifications()
        await coordinator?.disconnect(userID: userID)
        await messagingRegistration.drain()
        do { try await Messaging.messaging().unregister() }
        catch { Self.recordFailure(error) }
        deviceTokenString = nil
        firebaseInstallationID = nil
        if pendingTap?.recipientID == userID || desiredUserID == nil { pendingTap = nil }
        UNUserNotificationCenter.current().removeAllDeliveredNotifications()
        UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
        try? await UNUserNotificationCenter.current().setBadgeCount(0)
    }

    func didRegisterForRemoteNotifications(deviceToken: Data) {
        Self.debugTrace("APNs registration succeeded")
        deviceTokenString = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        Messaging.messaging().apnsToken = deviceToken
        if acceptsTokens { Task { await registerMessaging() } }
    }

    func didFailToRegisterForRemoteNotifications(error: Error) { Self.recordFailure(error) }

    private func consumePendingTap() {
        guard let target = pendingTap, let userID = desiredUserID, userID == boundUserID else { return }
        guard target.recipientID == userID else { pendingTap = nil; return }
        if let focus = target.mapFocus {
            guard let onMapFocusNotificationTapped else { return }
            pendingTap = nil
            onMapFocusNotificationTapped(focus)
        } else if let postID = target.postID {
            guard let onPostNotificationTapped else { return }
            pendingTap = nil
            onPostNotificationTapped(postID)
        } else {
            guard let onActivityNotificationTapped else { return }
            pendingTap = nil
            onActivityNotificationTapped()
        }
        if let activityID = target.activityID, let social {
            Task {
                guard self.desiredUserID == userID else { return }
                do { _ = try await social.markActivityRead(ids: [activityID], for: userID) }
                catch { Self.recordFailure(error) }
            }
        }
    }

    nonisolated func userNotificationCenter(_ _: UNUserNotificationCenter, willPresent notification: UNNotification,
                                           withCompletionHandler completionHandler: @escaping @Sendable (UNNotificationPresentationOptions) -> Void) {
        let recipient = notification.request.content.userInfo["recipient_id"] as? String
        let id = recipient.flatMap(UUID.init(uuidString:))
        Task { @MainActor in
            guard let id, self.acceptsTokens, self.desiredUserID == id, self.boundUserID == id else {
                completionHandler([]); return
            }
            ContentUpdates.shared.activityChanged()
            completionHandler([.banner, .sound, .badge])
        }
    }

    nonisolated func userNotificationCenter(_ _: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                           withCompletionHandler completionHandler: @escaping @Sendable () -> Void) {
        let info = response.notification.request.content.userInfo
        let target = PushNotificationTarget(recipient: info["recipient_id"] as? String, post: info["post_id"] as? String, activity: info["activity_id"] as? String,
                                            focusLat: info["focus_lat"] as? Double, focusLng: info["focus_lng"] as? Double)
        // UIKit's background-to-foreground restoration requires completion on main.
        // The async Objective-C bridge may otherwise invoke it on a worker executor.
        Task { @MainActor in
            defer { completionHandler() }
            guard let target else { return }
            self.pendingTap = target
            self.consumePendingTap()
        }
    }
}

extension NotificationService: MessagingDelegate {
    nonisolated func messaging(_ _: Messaging, didReceiveRegistration installationID: String?) {
        guard installationID != nil else { return }
        Task { @MainActor in
            guard self.acceptsTokens else { return }
            // Never register again from this callback: register() itself emits it.
            await self.refreshInstallationIdentity()
        }
    }
}

@MainActor
final class LociAppDelegate: NSObject, UIApplicationDelegate {
    private var backgroundAuthListener: AuthStateDidChangeListenerHandle?
    private var backgroundIdentityResolved = false

    /// Every launch path restores the same account-scoped services, without profile networking.
    private func restoreBackgroundServices() {
        guard !UITestFixtures.authenticatedSessionEnabled else { return }
        let configuration = AppConfiguration.load()
        guard configuration.configureFirebaseIfNeeded(), let firebase = configuration.firebase else { return }
        UserContextService.shared.configure(callables: CallableClient(region: firebase.functionsRegion))
        if let id = FirebaseIdentity.currentLUID() {
            NotificationService.shared.setUser(id)
            UserContextService.shared.setUser(id)
        }
        guard backgroundAuthListener == nil else { return }
        backgroundAuthListener = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            let id = user.map { FirebaseIdentity.luid(forFirebaseUID: $0.uid) }
            Task { @MainActor in
                guard FirebaseIdentity.currentLUID() == id else { return }
                self?.backgroundIdentityResolved = true
                NotificationService.shared.setUser(id)
                UserContextService.shared.setUser(id)
                if id != nil, UIApplication.shared.applicationState != .active {
                    CampaignArrivalService.shared.resumeBackgroundLocation()
                }
            }
        }
    }

    private func prepareBackgroundWake() async -> Bool {
        restoreBackgroundServices()
        guard FirebaseApp.app() != nil, !UITestFixtures.authenticatedSessionEnabled else { return false }
        let deadline = Date().addingTimeInterval(2)
        while !backgroundIdentityResolved, FirebaseIdentity.currentLUID() == nil, Date() < deadline {
            do { try await Task.sleep(for: .milliseconds(100)) } catch { return false }
        }
        guard !Task.isCancelled, let id = FirebaseIdentity.currentLUID() else { return false }
        NotificationService.shared.setUser(id)
        UserContextService.shared.setUser(id)
        return true
    }

    func application(_ _: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        restoreBackgroundServices()
        if launchOptions?[.location] != nil { CampaignArrivalService.shared.resumeBackgroundLocation() }
        // Periodic refresh of monitored note and campaign regions (safety net for missed pushes).
        BGTaskScheduler.shared.register(forTaskWithIdentifier: CampaignArrivalService.refreshTaskID, using: nil) { task in
            CampaignArrivalService.scheduleBackgroundRefresh()
            let work = Task { @MainActor in
                guard await self.prepareBackgroundWake() else { task.setTaskCompleted(success: false); return }
                let refreshed = await CampaignArrivalService.shared.handleSilentRefresh()
                task.setTaskCompleted(success: refreshed && !Task.isCancelled)
            }
            task.expirationHandler = { work.cancel() }
        }
        return true
    }
    /// Silent "region_refresh" pushes arrive when a campaign or notifying note goes live in this area.
    func application(_ _: UIApplication, didReceiveRemoteNotification userInfo: [AnyHashable: Any]) async -> UIBackgroundFetchResult {
        guard userInfo["type"] as? String == "region_refresh" else { return .noData }
        guard await prepareBackgroundWake() else { return .noData }
        return await CampaignArrivalService.shared.handleSilentRefresh() ? .newData : .noData
    }
    func applicationProtectedDataDidBecomeAvailable(_ _: UIApplication) { restoreBackgroundServices() }
    func application(_ _: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationService.shared.didRegisterForRemoteNotifications(deviceToken: deviceToken)
    }
    func application(_ _: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationService.shared.didFailToRegisterForRemoteNotifications(error: error)
    }
}

/// Applied only after Firebase configuration, including the persisted opt-out on each launch.
@MainActor
enum CrashReportingPreference {
    static let key = "crash_reports_enabled"
    static var isEnabled: Bool {
        get { UserDefaults.standard.object(forKey: key) as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: key); apply() }
    }
    static func apply() {
        guard FirebaseApp.app() != nil else { return }
        Crashlytics.crashlytics().setCrashlyticsCollectionEnabled(isEnabled)
        if !isEnabled { Crashlytics.crashlytics().deleteUnsentReports() }
    }
}
