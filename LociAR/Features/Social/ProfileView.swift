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
    @State private var showAccountCreation = false
    @State private var showDeletionReauthentication = false
    @State private var showEditProfile = false
    @State private var isDeletingAccount = false
    @State private var isSigningOut = false

    var body: some View {
        List {
            Section {
                HStack(spacing: 16) {
                    LociAvatar(handle: user.isAnonymousAccount ? "guest" : user.handle,
                               avatarURL: user.isAnonymousAccount ? nil : user.avatarURL, size: 66)
                    VStack(alignment: .leading, spacing: 5) {
                        if user.isAnonymousAccount {
                            Text("Misafir").font(.title3.bold())
                        } else {
                            Text(verbatim: "@\(user.handle)").font(.title3.bold())
                            if let email = user.email { Text(email).font(.subheadline).foregroundStyle(.secondary) }
                        }
                    }
                    Spacer()
                    if !user.isAnonymousAccount {
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
                    }
                }.padding(.vertical, 8)
            }
            if user.isAnonymousAccount {
                Section {
                    Button("Giriş yap") { showAccountCreation = true }
                        .accessibilityIdentifier("profile-create-account")
                    Text("Devam etmek için giriş yap.")
                        .font(.subheadline).foregroundStyle(.secondary)
                }
            }
            Section {
                NavigationLink { MyPostsView() } label: { ProfileLinkRow(title: String(localized: "Notlarım"), symbol: "rectangle.stack.fill", color: LociTheme.accent) }
                NavigationLink { ActivityView() } label: {
                    ProfileLinkRow(title: "Aktivite", symbol: "bell.fill", color: LociTheme.accent)
                }
                .accessibilityIdentifier("profile-activity")
                NavigationLink { CollectionsView() } label: { ProfileLinkRow(title: String(localized: "Koleksiyonlar"), symbol: "square.stack.3d.up.fill", color: LociTheme.accent) }
                    .accessibilityIdentifier("profile-collections")
                NavigationLink { SavedPostsView() } label: { ProfileLinkRow(title: String(localized: "Kaydedilenler"), symbol: "bookmark.fill", color: LociTheme.accent) }
                    .accessibilityIdentifier("profile-saved")
                if PostSupportAvailability.showsEntryPoints && !user.isAnonymousAccount {
                    NavigationLink { SupportEarningsView() } label: {
                        ProfileLinkRow(title: String(localized: "Kazançlarım"), symbol: "heart.circle", color: LociTheme.accent)
                    }.accessibilityIdentifier("profile-support-earnings")
                }
            } header: {
                profileSectionText("İçerik")
            }
            Section {
                NavigationLink { AppSettingsView() } label: { ProfileLinkRow(title: String(localized: "Ayarlar"), symbol: "gearshape", color: .gray) }
                    .accessibilityIdentifier("profile-settings")
                NavigationLink { BlockedUsersView() } label: { ProfileLinkRow(title: String(localized: "Engellenen hesaplar"), symbol: "person.crop.circle.badge.xmark", color: .gray) }
                NavigationLink { InviteView() } label: { ProfileLinkRow(title: String(localized: "Davet kodu"), symbol: "ticket", color: .gray) }
                    .accessibilityIdentifier("profile-invite")
            } header: {
                profileSectionText(String(localized: "Tercihler"))
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
                Button {
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
            Button(user.isAnonymousAccount ? String(localized: "Devam et") : String(localized: "Kimliğini doğrula")) { showDeletionReauthentication = true }
            Button("Vazgeç", role: .cancel) { /* Closes the dialog; nothing to undo. */ }
        } message: { Text("Notların ve sosyal verilerin sunucudan silinir. Bu işlem geri alınamaz.") }
        .onChange(of: user.isAnonymousAccount) { _, anonymous in
            if !anonymous { showAccountCreation = false }
        }
        .sheet(isPresented: $showAccountCreation) { AuthView() }
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
                    } else if method == .anonymous {
                        Button("Hesabı kalıcı olarak sil", role: .destructive) { Task { await submit() } }
                            .disabled(isWorking || deletionAccepted)
                            .accessibilityIdentifier("account-delete-confirm")
                    } else if message != nil {
                        Button("Tekrar dene") { Task { await loadMethod() } }
                    }
                    if isWorking { ProgressView() }
                } footer: {
                    Text("Notların ve sosyal verilerin sunucudan silinir. Bu işlem geri alınamaz.")
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
