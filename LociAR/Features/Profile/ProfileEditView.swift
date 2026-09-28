import SwiftUI

struct ProfileEditView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    let user: LociUser

    @State private var handle: String
    @State private var avatarURLString: String
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var selectedPresetAvatar: String?

    private static let presetAvatars: [String] = [
        "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=200&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&auto=format&fit=crop&q=80"
    ]

    init(user: LociUser) {
        self.user = user
        _handle = State(initialValue: user.handle)
        _avatarURLString = State(initialValue: user.avatarURL?.absoluteString ?? "")
    }

    private var parsedAvatarURL: URL? {
        let trimmed = avatarURLString.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        return URL(string: trimmed)
    }

    private var cleanHandle: String {
        handle.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines.union(CharacterSet(charactersIn: "@")))
    }

    private var isValid: Bool {
        cleanHandle.count >= 3 && cleanHandle.count <= 30
    }

    var body: some View {
        NavigationStack {
            ZStack {
                LociScreenBackground()
                ScrollView {
                    VStack(spacing: 24) {
                        avatarPreviewSection
                        fieldsSection
                        presetAvatarsSection
                        if let errorMessage {
                            LociInlineNotice(
                                title: "Profil Güncellenemedi",
                                message: errorMessage,
                                symbol: "exclamationmark.triangle.fill",
                                color: .orange
                            )
                        }
                    }
                    .padding(20)
                }
            }
            .navigationTitle("Profili Düzenle")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Vazgeç") { dismiss() }
                        .foregroundStyle(.secondary)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await saveProfile() }
                    } label: {
                        if isSaving {
                            ProgressView().tint(LociTheme.accent)
                        } else {
                            Text("Kaydet")
                                .bold()
                                .foregroundStyle(isValid ? LociTheme.accent : .secondary)
                        }
                    }
                    .disabled(!isValid || isSaving)
                    .accessibilityIdentifier("profile-edit-save")
                }
            }
        }
    }

    private var avatarPreviewSection: some View {
        VStack(spacing: 12) {
            LociAvatar(
                handle: cleanHandle.isEmpty ? "loci" : cleanHandle,
                avatarURL: parsedAvatarURL,
                size: 88
            )
            .shadow(color: LociTheme.accent.opacity(0.2), radius: 12)

            Text("@\(cleanHandle.isEmpty ? "kullanıcı" : cleanHandle)")
                .font(.headline)
                .foregroundStyle(.white)
        }
        .padding(.vertical, 8)
    }

    private var fieldsSection: some View {
        LociCard {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Kullanıcı Adı")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(LociTheme.secondaryText)
                    HStack {
                        Text("@")
                            .foregroundStyle(LociTheme.accent)
                            .font(.headline)
                        TextField("kullanıcı_adı", text: $handle)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .font(.body)
                    }
                    .padding(12)
                    .background(LociTheme.field, in: RoundedRectangle(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(LociTheme.hairline))
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("Avatar Görsel URL (İsteğe bağlı)")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(LociTheme.secondaryText)
                    TextField("https://...", text: $avatarURLString)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                        .font(.body)
                        .padding(12)
                        .background(LociTheme.field, in: RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(LociTheme.hairline))
                }
            }
        }
    }

    private var presetAvatarsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Hazır Avatarlar")
                .font(.caption.weight(.semibold))
                .foregroundStyle(LociTheme.secondaryText)
                .padding(.horizontal, 4)

            HStack(spacing: 14) {
                ForEach(Self.presetAvatars, id: \.self) { urlString in
                    Button {
                        avatarURLString = urlString
                    } label: {
                        AsyncImage(url: URL(string: urlString)) { image in
                            image
                                .resizable()
                                .scaledToFill()
                        } placeholder: {
                            ProgressView()
                        }
                        .frame(width: 48, height: 48)
                        .clipShape(Circle())
                        .overlay(
                            Circle()
                                .stroke(avatarURLString == urlString ? LociTheme.accent : Color.clear, lineWidth: 3)
                        )
                    }
                    .buttonStyle(.plain)
                }

                if !avatarURLString.isEmpty {
                    Button {
                        avatarURLString = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.title2)
                            .foregroundStyle(.secondary)
                            .frame(width: 48, height: 48)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Avatarı temizle")
                }
            }
            .padding(.horizontal, 4)
        }
    }

    private func saveProfile() async {
        guard isValid, !isSaving else { return }
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }

        do {
            try await session.updateProfile(handle: cleanHandle, avatarURL: parsedAvatarURL)
            dismiss()
        } catch {
            errorMessage = "Profil güncellenemedi: \(error.localizedDescription)"
        }
    }
}
