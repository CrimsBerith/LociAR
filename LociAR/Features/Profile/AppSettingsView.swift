import SwiftUI
import UserNotifications

/// Profile → Settings: notification permission and the crash-report opt-out promised in the privacy policy.
struct AppSettingsView: View {
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.openURL) private var openURL
    @State private var crashReports = CrashReportingPreference.isEnabled
    @State private var notificationStatus: UNAuthorizationStatus = .notDetermined
    @State private var sharing = UserContextService.shared
    @State private var arrivals = CampaignArrivalService.shared

    var body: some View {
        List {
            Section {
                Toggle(String(localized: "Bildirimler"), isOn: Binding(
                    get: { sharing.notificationsEnabled },
                    set: { enabled in Task {
                        await sharing.setSharing(telemetry: sharing.telemetryEnabled, location: sharing.locationEnabled, notifications: enabled)
                        if enabled, sharing.errorMessage == nil {
                            await NotificationService.shared.requestAuthorizationInContext()
                            arrivals.requestPermissions()
                            await arrivals.synchronize()
                        }
                        await refresh()
                    } }
                ))
                .accessibilityIdentifier("settings-notifications")
                Text("Beğeni, yorum, takip, konum notu ve yönetici mesajı bildirimlerini açar. Mesaj kilit ekranında görünebilir. Her zaman konum izniyle uygulama kapalıyken de beğenilen bir notun bulunduğu yere gelince haber verir; yalnızca not alanları izlenir, alana yaklaşınca en fazla 30 dakika hassas GPS kullanılır ve konum geçmişin saklanmaz. Ölçümler yönetici konumuna eklenmez. Kesin Konum ve internet gerekir. Telefon GPS’i genellikle 5–30 m sapar.")
                    .font(.caption).foregroundStyle(.secondary)
                // Marketing has its own opt-in (App Review 4.5.4), only available with Notifications on.
                Toggle(String(localized: "Kampanyalar ve teklifler"), isOn: Binding(
                    get: { sharing.notificationsEnabled && sharing.promotionsEnabled },
                    set: { enabled in Task {
                        await sharing.setSharing(telemetry: sharing.telemetryEnabled, location: sharing.locationEnabled, promotions: enabled, notifications: true)
                        if enabled, sharing.errorMessage == nil { arrivals.requestPermissions(); await arrivals.synchronize() }
                        await refresh()
                    } }
                ))
                .disabled(!sharing.notificationsEnabled)
                .accessibilityIdentifier("settings-promotions")
                Text("İsteğe bağlı. Açarsan markaların kampanyaları, örneğin bir indirim kodu, kampanya alanına girince, orada kalınca veya sık kaldığın yerden çıkınca bildirim olarak gelebilir. Sık kaldığın yer iOS ziyaret kayıtlarından yalnızca telefonunda öğrenilir, bize gönderilmez ve ev olarak etiketlenmez. Markalar konumunu ve kim olduğunu görmez. İstediğin an kapatabilirsin.")
                    .font(.caption).foregroundStyle(.secondary)
                if arrivals.needsPreciseLocation {
                    Text("Konum notu bildirimleri için Ayarlar’da LociAR konumunda Kesin Konum’u aç.").font(.caption)
                    if !arrivals.needsAlwaysPermission {
                        Button("iOS Ayarları'nda değiştir") {
                            if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                        }
                    }
                }
                if arrivals.needsAlwaysPermission {
                    Text("Arka planda varış bildirimi için konum iznini Her zaman olarak ayarla.").font(.caption)
                    Button("iOS Ayarları'nda değiştir") {
                        if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                    }
                }
                if arrivals.needsBackgroundRefresh {
                    Text("Konuma bağlı bildirimler için iOS Ayarları’nda Arka Planda Uygulama Yenile’yi aç.").font(.caption)
                    Button("iOS Ayarları'nda değiştir") {
                        if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                    }
                }
                if sharing.notificationsEnabled && notificationStatus == .denied {
                    Button("iOS Ayarları'nda değiştir") {
                        if let url = URL(string: UIApplication.openNotificationSettingsURLString) { openURL(url) }
                    }
                }
            }
            .disabled(sharing.isBusy)

            Section {
                Toggle(String(localized: "Teknik ve kullanım verilerini paylaş"), isOn: Binding(
                    get: { sharing.telemetryEnabled },
                    set: { enabled in Task { await sharing.setSharing(telemetry: enabled, location: sharing.locationEnabled) } }
                ))
                .accessibilityIdentifier("settings-share-telemetry")
                Text("Paylaşılanlar: cihaz türü, iOS ve uygulama sürümü, dil, saat dilimi, rastgele kurulum kimliği, bağlantı IP adresi ve kullanım zamanları. Yetkili yöneticiler görebilir.")
                    .font(.caption).foregroundStyle(.secondary)
                Toggle(String(localized: "Konumumu yöneticilerle paylaş"), isOn: Binding(
                    get: { sharing.locationEnabled },
                    set: { enabled in Task { await sharing.setSharing(telemetry: sharing.telemetryEnabled, location: enabled) } }
                ))
                .accessibilityIdentifier("settings-share-admin-location")
                Text("Uygulama açıkken son konumun, doğruluğu ve zamanı yöneticilere gönderilir; anonim postların hesabınla ilişkilendirilebilir. Arka planda paylaşılmaz. Kapatınca son konum silinir. Post konumu ve iOS izni ayrı kalır.")
                    .font(.caption).foregroundStyle(.secondary)
                if sharing.locationPermissionDenied {
                    Text("Konum izni kapalı. Ayarlar’dan LociAR için konumu açın.").font(.caption)
                    Button("iOS Ayarları'nda değiştir") {
                        if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                    }
                }
                if let message = sharing.errorMessage {
                    Text(message).font(.caption).foregroundStyle(.orange)
                    Button("Tekrar dene") {
                        Task { await sharing.setSharing(telemetry: sharing.telemetryEnabled, location: sharing.locationEnabled) }
                    }
                }
            } header: {
                Text("Veri paylaşımı")
            }
            .disabled(sharing.isBusy)

            Section {
                Toggle(String(localized: "Çökme raporları"), isOn: $crashReports)
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
        .onChange(of: scenePhase) { _, phase in if phase == .active { Task { await refresh() } } }
    }

    private var notificationStatusText: String {
        switch notificationStatus {
        case .authorized, .provisional, .ephemeral: String(localized: "Açık")
        case .denied: String(localized: "Kapalı")
        default: String(localized: "Sorulmadı")
        }
    }

    private func refresh() async {
        await NotificationService.shared.refreshAuthorization()
        notificationStatus = NotificationService.shared.authorizationStatus
    }
}
