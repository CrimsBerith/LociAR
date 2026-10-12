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
                Text("Tek ayar tüm bildirimleri açar: beğeni, yorum, takip, konum notları, marka indirimleri ve yönetici mesajları. Mesaj kilit ekranında görünebilir. Paylaştığın son konum ve post beğenileri teklif seçiminde kullanılabilir; markalar kişisel konumunu görmez. Onaylı bir notun yakınına gelince en fazla 10 dakika hassas GPS kullanılır; ölçümler yönetici konumuna eklenmez. Arka planda Her zaman konum izni, Kesin Konum ve internet gerekir. Telefon GPS’i genellikle 5–30 m sapar; bildirim notun çevresine girince gelir.")
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
