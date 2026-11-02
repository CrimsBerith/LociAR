import SwiftUI
import CoreLocation
import UserNotifications

/// A concise overview; permission and data-sharing decisions stay on their relevant detail pages.
struct AppSettingsView: View {
    enum Page { case overview, notifications, privacy, translation, diagnostics }

    let page: Page
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.openURL) private var openURL
    @State private var crashReports = CrashReportingPreference.isEnabled
    @State private var notificationStatus: UNAuthorizationStatus = .notDetermined
    @State private var sharing = UserContextService.shared
    @State private var arrivals = CampaignArrivalService.shared
    @AppStorage(NoteTranslationPreference.key) private var translateNotes = true

    init(page: Page = .overview) { self.page = page }

    var body: some View {
        List {
            switch page {
            case .overview: overview
            case .notifications: notifications
            case .privacy: privacy
            case .translation: translation
            case .diagnostics: diagnostics
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(LociScreenBackground())
        .tint(LociTheme.accent)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .task { await refresh() }
        .onChange(of: scenePhase) { _, phase in if phase == .active { Task { await refresh() } } }
    }

    private var title: String {
        switch page {
        case .overview: String(localized: "Ayarlar")
        case .notifications: String(localized: "Bildirimler")
        case .privacy: String(localized: "Gizlilik ve veri")
        case .translation: String(localized: "Çeviri")
        case .diagnostics: String(localized: "Tanılama")
        }
    }

    private var overview: some View {
        Section {
            settingsLink(String(localized: "Bildirimler"), symbol: "bell", summary: notificationSummary,
                         destination: .notifications, identifier: "settings-open-notifications")
            settingsLink(String(localized: "Gizlilik ve veri"), symbol: "hand.raised",
                         summary: String(localized: "Paylaşım tercihleri"), destination: .privacy, identifier: "settings-open-privacy")
            settingsLink(String(localized: "Çeviri"), symbol: "character.bubble",
                         summary: translateNotes && supportsDeviceTranslation ? String(localized: "Otomatik") : String(localized: "Kapalı"),
                         destination: .translation, identifier: "settings-open-translation")
            settingsLink(String(localized: "Tanılama"), symbol: "waveform.path.ecg",
                         summary: crashReports ? String(localized: "Açık") : String(localized: "Kapalı"),
                         destination: .diagnostics, identifier: "settings-open-diagnostics")
        }
    }

    private func settingsLink(_ label: String, symbol: String, summary: String,
                              destination: Page, identifier: String) -> some View {
        NavigationLink { AppSettingsView(page: destination) } label: {
            HStack(spacing: 12) {
                Image(systemName: symbol).foregroundStyle(LociTheme.accent).frame(width: 26)
                Text(verbatim: label)
                Spacer(minLength: 8)
                Text(verbatim: summary).font(.subheadline).foregroundStyle(.secondary)
                    .multilineTextAlignment(.trailing)
            }
            .padding(.vertical, 4)
        }
        .accessibilityIdentifier(identifier)
    }

    @ViewBuilder private var notifications: some View {
        Section {
            Toggle(String(localized: "Bildirimler"), isOn: Binding(
                get: { sharing.notificationsEnabled },
                set: { enabled in Task {
                    await sharing.setSharing(telemetry: sharing.telemetryEnabled, location: sharing.locationEnabled, notifications: enabled)
                    if enabled, sharing.notificationsEnabled, sharing.errorMessage == nil {
                        await NotificationService.shared.requestAuthorizationInContext()
                    }
                    await arrivals.synchronize()
                    await refresh()
                } }
            ))
            .accessibilityIdentifier("settings-notifications")
            if sharing.notificationsEnabled && notificationStatus == .denied {
                Button("Ayarları aç") { openNotificationSettings() }
            }
        } footer: {
            Text("Beğeni, yorum, takip ve yönetici mesajı bildirimlerini al. Mesajlar kilit ekranında görünebilir.")
        }
        .disabled(sharing.isBusy)

        Section {
            Toggle(String(localized: "Yakındaki notlar"), isOn: Binding(
                get: { sharing.placeNotesEnabled },
                set: { enabled in Task {
                    await sharing.setSharing(telemetry: sharing.telemetryEnabled, location: sharing.locationEnabled, placeNotes: enabled)
                    if enabled, sharing.notificationsEnabled, sharing.placeNotesEnabled, sharing.errorMessage == nil {
                        arrivals.requestPermissions()
                    }
                    await arrivals.synchronize()
                    await refresh()
                } }
            ))
            .accessibilityIdentifier("settings-place-notes")
            .disabled(!sharing.notificationsEnabled)
            DisclosureGroup(String(localized: "Nasıl çalışır?")) {
                Text("Yalnızca not alanları izlenir. Alana yaklaşınca en fazla 30 dakika hassas GPS kullanılır; konum geçmişin saklanmaz ve ölçümler yönetici konumuna eklenmez. Kesin Konum ve internet gerekir. Telefon GPS’i genellikle 5–30 m sapar.")
                    .font(.footnote).foregroundStyle(.secondary)
                Text("iOS arka plan çalışmasını sınırlayabilir. Uygulamayı zorla kapatırsan konum bildirimi gecikebilir veya gelmeyebilir.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        } footer: {
            Text("Beğenilen bir notun bulunduğu yere gelince haber verir. Arka planda çalışması için Her zaman konum izni gerekir. Bildirimler kapalıyken haber verilmez.")
        }
        .disabled(sharing.isBusy)

        Section {
            Toggle(String(localized: "Kampanyalar ve teklifler"), isOn: Binding(
                get: { sharing.notificationsEnabled && sharing.promotionsEnabled },
                set: { enabled in Task {
                    await sharing.setSharing(telemetry: sharing.telemetryEnabled, location: sharing.locationEnabled, promotions: enabled)
                    if enabled, sharing.notificationsEnabled, sharing.promotionsEnabled, sharing.errorMessage == nil {
                        arrivals.requestPermissions()
                    }
                    await arrivals.synchronize()
                    await refresh()
                } }
            ))
            .disabled(!sharing.notificationsEnabled)
            .accessibilityIdentifier("settings-promotions")
            DisclosureGroup(String(localized: "Nasıl çalışır?")) {
                Text("Kampanya alanına girince, orada kalınca veya sık kaldığın yerden çıkınca bildirim gelebilir. Sık kaldığın yer yalnızca telefonunda öğrenilir; bize gönderilmez ve ev olarak etiketlenmez. Markalar konumunu ve kim olduğunu görmez. İstediğin an kapatabilirsin.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        } footer: { Text("Konumuna göre kampanya ve teklif bildirimleri al. Bu tercih isteğe bağlıdır.") }
        .disabled(sharing.isBusy)

        if sharing.notificationsEnabled && (sharing.placeNotesEnabled || sharing.promotionsEnabled) {
            locationNotificationStatus
        }
        preferenceError
    }

    private var locationNotificationStatus: some View {
        Section {
            Label(locationNotificationsReady ? String(localized: "Konum bildirimleri hazır") : String(localized: "Konum bildirimleri için ayarları kontrol et"),
                  systemImage: locationNotificationsReady ? "checkmark.circle.fill" : "exclamationmark.circle")
                .foregroundStyle(locationNotificationsReady ? Color.green : Color.orange)
                .accessibilityIdentifier("settings-location-notification-status")
            if arrivals.needsPreciseLocation {
                Text("Yakındaki notlar için Kesin Konum’u aç.").font(.footnote)
            }
            if arrivals.needsAlwaysPermission {
                Text("Arka planda varış bildirimi için konum iznini Her zaman olarak ayarla.").font(.footnote)
            }
            if arrivals.needsPreciseLocation || arrivals.needsAlwaysPermission || arrivals.needsBackgroundRefresh {
                if arrivals.needsBackgroundRefresh {
                    Text("Konuma bağlı bildirimler için iOS Ayarları’nda Arka Planda Uygulama Yenile’yi aç.").font(.footnote)
                }
                Button("Ayarları aç") { openAppSettings() }
            }
            if arrivals.needsMonitoringRecovery {
                Text("Konum alanları iOS’a kaydedilemedi. Bildirimler gecikebilir; tekrar dene.").font(.footnote)
                Button("Tekrar dene") { arrivals.retryMonitoring(); Task { await arrivals.synchronize() } }
            }
        }
    }

    @ViewBuilder private var privacy: some View {
        Section {
            Toggle(String(localized: "Kullanım verilerini paylaş"), isOn: Binding(
                get: { sharing.telemetryEnabled },
                set: { enabled in Task { await sharing.setSharing(telemetry: enabled, location: sharing.locationEnabled) } }
            ))
            .accessibilityIdentifier("settings-share-telemetry")
            Text("Cihaz, kullanım ve IP bilgileri yetkili yöneticilere iletilir.")
                .font(.footnote).foregroundStyle(.secondary)
            DisclosureGroup(String(localized: "Paylaşılan veriler")) {
                Text("Paylaşılanlar: cihaz türü, iOS ve uygulama sürümü, dil, saat dilimi, rastgele kurulum kimliği, bağlantı IP adresi ve kullanım zamanları. Yetkili yöneticiler görebilir.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .disabled(sharing.isBusy)

        Section {
            Toggle(String(localized: "Konumumu yöneticilerle paylaş"), isOn: Binding(
                get: { sharing.locationEnabled },
                set: { enabled in Task { await sharing.setSharing(telemetry: sharing.telemetryEnabled, location: enabled) } }
            ))
            .accessibilityIdentifier("settings-share-admin-location")
            Text("Uygulama açıkken son konumun, doğruluğu ve zamanı yetkili yöneticilere gönderilir. Anonim notların hesabınla ilişkilendirilebilir.")
                .font(.footnote).foregroundStyle(.secondary)
            Text("Arka planda paylaşılmaz. Kapatınca paylaşılan son konum silinir; notlarının konumu ve iOS konum izni değişmez.")
                .font(.footnote).foregroundStyle(.secondary)
            if sharing.locationPermissionDenied {
                Text("Konum izni kapalı. Ayarlar’dan LociAR için konumu açın.").font(.footnote)
                Button("Ayarları aç") { openAppSettings() }
            }
        }
        .disabled(sharing.isBusy)
        preferenceError
    }

    @ViewBuilder private var translation: some View {
        Section {
            Toggle(String(localized: "Notları otomatik çevir"), isOn: $translateNotes)
                .accessibilityIdentifier("settings-translate-notes")
                .disabled(!supportsDeviceTranslation)
        } footer: {
            Text("Çeviri cihazında yapılır. Desteklenmeyen dillerde orijinal metin gösterilir.")
        }
        Section {
            Text("Yalnızca okunabilir notlar çevrilir. Orijinal metne her zaman dönebilirsin.")
            Text("Dil paketi gerektiğinde çeviriyi sen başlatırsın ve Apple indirme izni ister. Notlar ve çeviriler diske kaydedilmez.")
        } header: { Text("Dil paketleri") }
    }

    private var diagnostics: some View {
        Section {
            Toggle(String(localized: "Çökme raporları"), isOn: $crashReports)
                .onChange(of: crashReports) { _, enabled in CrashReportingPreference.isEnabled = enabled }
                .accessibilityIdentifier("settings-crash-reports")
        } footer: {
            Text("Uygulama çökerse cihaz modeli, iOS sürümü ve hata kaydı Firebase Crashlytics ile gönderilir. Konum, içerik veya kişisel bilgi gönderilmez.")
        }
    }

    @ViewBuilder private var preferenceError: some View {
        if let message = sharing.errorMessage {
            Section {
                Text(message).font(.footnote).foregroundStyle(.orange)
                Button("Tekrar dene") {
                    Task { await sharing.setSharing(telemetry: sharing.telemetryEnabled, location: sharing.locationEnabled) }
                }
            }
        }
    }

    private var notificationSummary: String {
        if !sharing.notificationsEnabled { return String(localized: "Kapalı") }
        return [.authorized, .provisional, .ephemeral].contains(notificationStatus)
            ? String(localized: "Açık") : String(localized: "İzin gerekiyor")
    }

    private var supportsDeviceTranslation: Bool {
        if #available(iOS 18.0, *) { return true }
        return false
    }

    private var locationNotificationsReady: Bool {
        [.authorized, .provisional, .ephemeral].contains(notificationStatus)
            && arrivals.hasAlwaysLocationAuthorization && arrivals.isSupported && !arrivals.needsAlwaysPermission
            && !arrivals.needsPreciseLocation && !arrivals.needsBackgroundRefresh && !arrivals.needsMonitoringRecovery
    }

    private func openAppSettings() {
        if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
    }

    private func openNotificationSettings() {
        if let url = URL(string: UIApplication.openNotificationSettingsURLString) { openURL(url) }
    }

    private func refresh() async {
        arrivals.refreshPermissions()
        await NotificationService.shared.refreshAuthorization()
        notificationStatus = NotificationService.shared.authorizationStatus
    }
}
