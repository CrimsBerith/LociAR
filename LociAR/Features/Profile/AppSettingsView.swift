import SwiftUI
import UserNotifications

/// Profile → Settings: notification permission and the crash-report opt-out promised in the privacy policy.
struct AppSettingsView: View {
    @Environment(\.openURL) private var openURL
    @State private var crashReports = CrashReportingPreference.isEnabled
    @State private var notificationStatus: UNAuthorizationStatus = .notDetermined

    var body: some View {
        List {
            Section {
                HStack {
                    Label("Bildirimler", systemImage: "bell.badge")
                    Spacer()
                    Text(notificationStatusText)
                        .foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .combine)
                if notificationStatus == .notDetermined {
                    Button("Bildirimlere izin ver") {
                        Task {
                            await NotificationService.shared.requestAuthorizationInContext()
                            await refresh()
                        }
                    }
                    .accessibilityIdentifier("settings-allow-notifications")
                } else {
                    Button("iOS Ayarları'nda değiştir") {
                        if let url = URL(string: UIApplication.openNotificationSettingsURLString) { openURL(url) }
                    }
                    .accessibilityIdentifier("settings-open-notification-settings")
                }
            } header: {
                Text("Bildirimler")
            } footer: {
                Text("Postların beğenildiğinde, yorum aldığında ve biri seni takip ettiğinde bildirim gönderilir.")
            }

            Section {
                Toggle("Çökme raporları", isOn: $crashReports)
                    .onChange(of: crashReports) { _, enabled in CrashReportingPreference.isEnabled = enabled }
                    .accessibilityIdentifier("settings-crash-reports")
            } header: {
                Text("Tanılama")
            } footer: {
                Text("Uygulama çökerse cihaz modeli, iOS sürümü ve hata kaydı Firebase Crashlytics ile gönderilir. Konum, içerik veya kişisel bilgi gönderilmez.")
            }
        }
        .navigationTitle("Ayarlar")
        .navigationBarTitleDisplayMode(.inline)
        .task { await refresh() }
    }

    private var notificationStatusText: LocalizedStringKey {
        switch notificationStatus {
        case .authorized, .provisional, .ephemeral: "Açık"
        case .denied: "Kapalı"
        default: "Sorulmadı"
        }
    }

    private func refresh() async {
        await NotificationService.shared.refreshAuthorization()
        notificationStatus = NotificationService.shared.authorizationStatus
    }
}
