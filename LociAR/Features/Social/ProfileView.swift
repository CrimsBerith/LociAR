import AVFoundation
import SwiftUI
import SwiftData
import UIKit

struct ProfileView: View {
    @Environment(AppSession.self) private var session
    @Environment(AppContainer.self) private var container
    @Environment(\.modelContext) private var modelContext
    let user: LociUser
    @State private var confirmDeletion = false
    @State private var showDeletionReauthentication = false
    @State private var showEditProfile = false
    @State private var isDeletingAccount = false
    @State private var isSigningOut = false
    @State private var notificationsAuthorized = false
    @State private var notificationsDenied = false
    @State private var isRequestingNotifications = false

    var body: some View {
        List {
            Section {
                HStack(spacing: 16) {
                    LociAvatar(handle: user.handle, avatarURL: user.avatarURL, size: 66)
                    VStack(alignment: .leading, spacing: 5) {
                        Text("@\(user.handle)").font(.title3.bold())
                        if let email = user.email { Text(email).font(.caption).foregroundStyle(.secondary) }
                        LociStatusPill(title: String(localized: "Hesap aktif"), symbol: "checkmark.seal.fill", color: LociTheme.accent)
                    }
                    Spacer()
                    Button {
                        showEditProfile = true
                    } label: {
                        Image(systemName: "pencil.circle.fill")
                            .font(.title2)
                            .foregroundStyle(LociTheme.accent)
                            .frame(minWidth: 44, minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Profili düzenle")
                    .accessibilityIdentifier("profile-edit-button")
                }.padding(.vertical, 8)
            }
            Section {
                NavigationLink { MyPostsView() } label: { ProfileLinkRow(title: String(localized: "Postlarım"), symbol: "rectangle.stack.fill", color: LociTheme.accent) }
                NavigationLink { ActivityView() } label: {
                    ProfileLinkRow(title: "Aktivite", symbol: "bell.fill", color: .orange)
                }
                .accessibilityIdentifier("profile-activity")
                NavigationLink { CollectionsView() } label: { ProfileLinkRow(title: String(localized: "Koleksiyonlar"), symbol: "square.stack.3d.up.fill", color: .purple) }
                NavigationLink { SavedPostsView() } label: { ProfileLinkRow(title: String(localized: "Kaydedilenler"), symbol: "bookmark.fill", color: .blue) }
            } header: {
                profileSectionText("İçerik")
            }
            Section {
                NavigationLink { AppSettingsView() } label: { ProfileLinkRow(title: String(localized: "Ayarlar"), symbol: "gearshape", color: .gray) }
                    .accessibilityIdentifier("profile-settings")
                NavigationLink { BlockedUsersView() } label: { ProfileLinkRow(title: String(localized: "Engellenen hesaplar"), symbol: "person.crop.circle.badge.xmark", color: .orange) }
                Button {
                    guard !isRequestingNotifications else { return }
                    if notificationsAuthorized || notificationsDenied {
                        if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                    } else {
                        isRequestingNotifications = true
                        Task {
                            notificationsAuthorized = await NotificationService.shared.requestAuthorization()
                            notificationsDenied = NotificationService.shared.authorizationDenied
                            isRequestingNotifications = false
                        }
                    }
                } label: {
                    if notificationsAuthorized || notificationsDenied {
                        Label("Bildirim ayarları", systemImage: "bell.badge")
                    } else {
                        Label("Bildirimleri etkinleştir", systemImage: "bell.badge")
                    }
                }
                .disabled(isRequestingNotifications || session.isLocalPreview || !container.isBackendConfigured)
                .accessibilityIdentifier("profile-push-permission")
            } header: {
                profileSectionText("Gizlilik ve güvenlik")
            }
            Section {
                if let url = container.configuration.privacyPolicyURL {
                    Link("Gizlilik politikası", destination: url)
                        .accessibilityIdentifier("profile-privacy")
                }
                if let url = container.configuration.termsURL {
                    Link("Kullanım koşulları", destination: url)
                        .accessibilityIdentifier("profile-terms")
                }
                if let url = container.configuration.supportURL {
                    Link("Destek", destination: url)
                        .accessibilityIdentifier("profile-support")
                }
            } header: {
                profileSectionText("Yasal")
            }
#if DEBUG
            Section {
                NavigationLink { ARCoreCoverageDebugView() } label: {
                    ProfileLinkRow(title: "ARCore kapsam kontrolü (debug)", symbol: "globe.europe.africa", color: .blue)
                }
                .accessibilityIdentifier("profile-debug-arcore")
            }
#endif
            Section {
                Button(role: .destructive) {
                    guard !isSigningOut else { return }
                    isSigningOut = true
                    Task { await session.signOut(); isSigningOut = false }
                } label: {
                    Label("Çıkış yap", systemImage: "rectangle.portrait.and.arrow.right")
                }
                    .disabled(isDeletingAccount || isSigningOut)
                    .accessibilityIdentifier("profile-sign-out")
                Button(role: .destructive) { confirmDeletion = true } label: {
                    Label("Hesabı kalıcı olarak sil", systemImage: "trash")
                }
                    .disabled(isDeletingAccount || isSigningOut || session.isLocalPreview || !container.isBackendConfigured)
                    .accessibilityIdentifier("profile-delete-account")
            } footer: {
                profileSectionText("Hesap silme işlemi geri alınamaz.")
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(LociScreenBackground())
        .navigationTitle("Profil")
        .alert("Hesabı kalıcı olarak sil?", isPresented: $confirmDeletion) {
            Button("Devam et", role: .destructive) { showDeletionReauthentication = true }
            Button("Vazgeç", role: .cancel) {}
        } message: { Text("Postlarınız ve sosyal verileriniz sunucudan silinir. Bu işlem geri alınamaz.") }
        .sheet(isPresented: $showEditProfile) {
            ProfileEditView(user: user)
        }
        .sheet(isPresented: $showDeletionReauthentication) {
            AccountDeletionView(email: user.email) { password in try await deleteAccount(password: password) }
        }
        .accessibilityIdentifier("screen-profile")
        .task {
            guard !session.isLocalPreview, container.isBackendConfigured else { return }
            await NotificationService.shared.checkAuthorizationStatus()
            notificationsAuthorized = NotificationService.shared.isAuthorized
            notificationsDenied = NotificationService.shared.authorizationDenied
        }
    }

    private func profileSectionText(_ value: String) -> some View {
        Text(LocalizedStringKey(value))
            .foregroundStyle(.white)
            .textCase(nil)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func deleteAccount(password: String?) async throws {
        isDeletingAccount = true
        defer { isDeletingAccount = false }
        do { try await session.deleteAccount(password: password) }
        catch AuthFlowError.deletionPending {
            await LocalAccountDeletion.resume(in: modelContext)
            throw AuthFlowError.deletionPending
        }
        await LocalAccountDeletion.resume(in: modelContext)
    }
}

private struct AccountDeletionView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    let email: String?
    let onConfirm: (String?) async throws -> Void
    @State private var method: AccountDeletionMethod?
    @State private var password = ""
    @State private var isWorking = false
    @State private var deletionAccepted = false
    @State private var message: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Hesabı silmeden önce kimliğini doğrula.")
                    if let email { Text(email).foregroundStyle(.secondary) }
                    if method == .password {
                        SecureField("Mevcut parola", text: $password)
                            .textContentType(.password)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .disabled(isWorking || deletionAccepted)
                            .accessibilityIdentifier("account-delete-password")
                    } else if method == nil, message == nil { ProgressView() }
                    if let message { Text(message).foregroundStyle(deletionAccepted ? Color.secondary : Color.red) }
                }
                Section {
                    if method == .apple {
                        Button("Apple ile doğrula ve sil", role: .destructive) { Task { await submit() } }
                            .disabled(isWorking || deletionAccepted)
                            .accessibilityIdentifier("account-delete-confirm")
                    } else if method == .password {
                        Button("Doğrula ve sil", role: .destructive) { Task { await submit() } }
                            .disabled(isWorking || deletionAccepted || password.isEmpty)
                            .accessibilityIdentifier("account-delete-confirm")
                    } else if message != nil {
                        Button("Tekrar dene") { Task { await loadMethod() } }
                    }
                    if isWorking { ProgressView() }
                } footer: {
                    Text("Postlarınız ve sosyal verileriniz sunucudan silinir. Bu işlem geri alınamaz.")
                }
            }
            .navigationTitle("Hesabı sil")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(deletionAccepted ? String(localized: "Kapat") : String(localized: "Vazgeç")) { password = ""; dismiss() }.disabled(isWorking)
                }
            }
        }
        .interactiveDismissDisabled(isWorking)
        .accessibilityIdentifier("screen-account-deletion")
        .task { await loadMethod() }
        .onDisappear { password = "" }
    }

    private func loadMethod() async {
        message = nil
        do { method = try await session.accountDeletionMethod() }
        catch { message = String(localized: "Hesap şu anda silinemiyor. Biraz sonra tekrar dene.") }
    }

    private func submit() async {
        guard !isWorking, !deletionAccepted, let method else { return }
        isWorking = true
        message = nil
        let submitted = method == .password ? password : nil
        password = ""
        defer { isWorking = false }
        do { try await onConfirm(submitted); dismiss() }
        catch let error as AuthFlowError {
            if case .deletionPending = error { deletionAccepted = true }
            message = error.localizedDescription
        }
        catch is CancellationError { message = AuthFlowError.reauthenticationCancelled.localizedDescription }
        catch { message = String(localized: "Hesap şu anda silinemiyor. Biraz sonra tekrar dene.") }
    }
}
