import AVFoundation
import SwiftUI
import SwiftData

struct ProfileView: View {
    @Environment(AppSession.self) private var session
    @Environment(AppContainer.self) private var container
    @Environment(\.modelContext) private var modelContext
    let user: LociUser
    @State private var confirmDeletion = false
    @State private var showEditProfile = false
    @State private var message: String?
    @State private var isDeletingAccount = false
    /// Email accounts confirm deletion with their password (re-authentication).
    @State private var askDeletionPassword = false
    @State private var deletionPassword = ""
    @State private var isSigningOut = false

    var body: some View {
        List {
            Section {
                HStack(spacing: 16) {
                    LociAvatar(handle: user.handle, avatarURL: user.avatarURL, size: 66)
                    VStack(alignment: .leading, spacing: 5) {
                        Text("@\(user.handle)").font(.title3.bold())
                        if let email = user.email { Text(email).font(.caption).foregroundStyle(.secondary) }
                        LociStatusPill(title: "Hesap aktif", symbol: "checkmark.seal.fill", color: LociTheme.accent)
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
                NavigationLink { MyPostsView() } label: { ProfileLinkRow(title: "Postlarım", symbol: "rectangle.stack.fill", color: LociTheme.accent) }
                NavigationLink { ActivityView() } label: {
                    ProfileLinkRow(title: "Aktivite", symbol: "bell.fill", color: .orange)
                }
                .accessibilityIdentifier("profile-activity")
                NavigationLink { CollectionsView() } label: { ProfileLinkRow(title: "Koleksiyonlar", symbol: "square.stack.3d.up.fill", color: .purple) }
                NavigationLink { SavedPostsView() } label: { ProfileLinkRow(title: "Kaydedilenler", symbol: "bookmark.fill", color: .blue) }
            } header: {
                profileSectionText("İçerik")
            }
            Section {
                NavigationLink { BlockedUsersView() } label: { ProfileLinkRow(title: "Engellenen hesaplar", symbol: "person.crop.circle.badge.xmark", color: .orange) }
                NavigationLink { AppSettingsView() } label: { ProfileLinkRow(title: "Ayarlar", symbol: "gearshape.fill", color: .gray) }
                    .accessibilityIdentifier("profile-settings")
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
                    .disabled(isDeletingAccount)
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
            Button("Hesabı sil", role: .destructive) { Task { await deleteAccount() } }
            Button("Vazgeç", role: .cancel) {}
        } message: { Text("Postlarınız ve sosyal verileriniz sunucudan silinir. Bu işlem geri alınamaz.") }
        .alert("Şifreni gir", isPresented: $askDeletionPassword) {
            SecureField("Şifre", text: $deletionPassword)
                .textContentType(.password)
            Button("Hesabı sil", role: .destructive) {
                let password = deletionPassword
                deletionPassword = ""
                Task { await deleteAccount(password: password) }
            }
            Button("Vazgeç", role: .cancel) { deletionPassword = "" }
        } message: { Text("Güvenlik için hesabını silmeden önce şifreni gir.") }
        .alert("Hesap silinemedi", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })) {
            Button("Tamam", role: .cancel) {}
        } message: { Text((message ?? "").localizedUI) }
        .sheet(isPresented: $showEditProfile) {
            ProfileEditView(user: user)
        }
        .accessibilityIdentifier("screen-profile")
    }

    private func profileSectionText(_ value: String) -> some View {
        Text(value.localizedUI)
            .foregroundStyle(.white)
            .textCase(nil)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func deleteAccount(password: String? = nil) async {
        guard !isDeletingAccount else { return }
        isDeletingAccount = true
        defer { isDeletingAccount = false }
        do {
            try await session.deleteAccount(password: password)
        } catch AuthFlowError.passwordRequired {
            askDeletionPassword = true
            return
        } catch let error as AuthFlowError {
            // Re-sign-in needed, Apple re-authorization cancelled or Apple revocation failed:
            // nothing was deleted and the message says what to do.
            message = error.localizedDescription
            return
        } catch {
            message = "Hesap şu anda silinemiyor. Biraz sonra tekrar dene."
            return
        }
        // Account deleted server-side. Clean up local data best-effort — the view may be
        // dismissing already (Auth state listener fires before we get here).
        try? modelContext.delete(model: DraftRecord.self)
        try? modelContext.delete(model: SyncQueueRecord.self)
        try? modelContext.delete(model: PreferenceRecord.self)
        try? modelContext.save()
        await MediaAssetStore.purgeAllLocalAssets()
    }
}
