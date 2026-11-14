import PhotosUI
import SwiftUI

struct ProfileEditView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    let user: LociUser

    @State private var handle: String
    @State private var bio: String
    @State private var avatarChoice: AvatarChoice = .unchanged
    @State private var pickedPhoto: PhotosPickerItem?
    @State private var photoPreview: UIImage?
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var photoSubmitted = false

    init(user: LociUser) {
        self.user = user
        _handle = State(initialValue: user.handle)
        _bio = State(initialValue: user.bio ?? "")
    }

    private var cleanHandle: String {
        handle.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines.union(CharacterSet(charactersIn: "@"))).lowercased()
    }

    private var isValid: Bool {
        cleanHandle.range(of: "^[a-z0-9_.]{3,30}$", options: .regularExpression) != nil
    }

    private var previewURL: URL? {
        if case .preset(let name) = avatarChoice { return AvatarReference.presetURL(name) }
        return user.avatarURL
    }

    var body: some View {
        NavigationStack {
            ZStack {
                LociScreenBackground()
                ScrollView {
                    VStack(spacing: LociTheme.Spacing.xl) {
                        avatarPreviewSection
                        fieldsSection
                        presetAvatarsSection
                        photoSection
                        if let errorMessage {
                            LociInlineNotice(
                                title: String(localized: "Profil Güncellenemedi"),
                                message: errorMessage,
                                symbol: "exclamationmark.triangle.fill",
                                color: LociTheme.warning
                            )
                        }
                    }
                    .padding(LociTheme.Spacing.xl2)
                }
                .scrollDismissesKeyboard(.interactively)
            }
            .navigationTitle("Profili düzenle")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Vazgeç") { dismiss() }
                        .foregroundStyle(LociTheme.secondaryText)
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
                                .foregroundStyle(isValid ? LociTheme.accent : LociTheme.tertiaryText)
                        }
                    }
                    .disabled(!isValid || isSaving)
                    .accessibilityIdentifier("profile-edit-save")
                }
            }
            .onChange(of: pickedPhoto) { _, item in
                Task { await loadPhoto(item) }
            }
            .alert("Fotoğraf incelemeye gönderildi", isPresented: $photoSubmitted) {
                Button("Tamam") { dismiss() }
            } message: {
                Text("Profil fotoğrafın otomatik güvenlik kontrolünden geçtikten sonra görünecek. Uygunsuz içerik reddedilir.")
            }
        }
    }

    private var avatarPreviewSection: some View {
        VStack(spacing: LociTheme.Spacing.m) {
            Group {
                if let photoPreview {
                    Image(uiImage: photoPreview)
                        .resizable()
                        .scaledToFill()
                        .frame(width: 88, height: 88)
                        .clipShape(Circle())
                } else {
                    LociAvatar(handle: cleanHandle.isEmpty ? "loci" : cleanHandle, avatarURL: previewURL, size: 88)
                }
            }
            .shadow(color: LociTheme.accent.opacity(0.2), radius: LociTheme.Depth.mediumRadius)

            Text(verbatim: "@\(cleanHandle.isEmpty ? String(localized: "kullanıcı") : cleanHandle)")
                .font(.headline)
                .foregroundStyle(LociTheme.textPrimary)
        }
        .padding(.vertical, LociTheme.Spacing.s)
    }

    private var fieldsSection: some View {
        LociCard {
            VStack(alignment: .leading, spacing: LociTheme.Spacing.s) {
                Text("Kullanıcı adı")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(LociTheme.secondaryText)
                HStack {
                    Text(verbatim: "@")
                        .foregroundStyle(LociTheme.accent)
                        .font(.headline)
                    TextField("kullanıcı_adı", text: $handle)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .font(.body)
                }
                .padding(LociTheme.Spacing.m)
                .lociGlassSurface(cornerRadius: LociTheme.Radius.small)
                                Text("3–30 karakter; küçük harf, rakam, alt çizgi ve nokta.")
                    .font(.footnote)
                    .foregroundStyle(LociTheme.secondaryText)

                Divider()
                    .padding(.vertical, LociTheme.Spacing.xs)

                Text("Hakkında")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(LociTheme.secondaryText)
                TextField("Kendinden kısaca bahset...", text: $bio, axis: .vertical)
                    .lineLimit(3...5)
                    .font(.body)
                    .padding(LociTheme.Spacing.m)
                    .lociGlassSurface(cornerRadius: LociTheme.Radius.small)
                    .onChange(of: bio) { _, newValue in
                        let clamped = ProfileTextPolicy.clamped(newValue, limit: ProfileTextPolicy.bioLimit)
                        if clamped != newValue { bio = clamped }
                    }
                HStack {
                    Spacer()
                    Text(verbatim: "\(ProfileTextPolicy.length(bio))/\(ProfileTextPolicy.bioLimit)")
                        .font(.caption2)
                        .foregroundStyle(LociTheme.tertiaryText)
                }
            }
        }
    }

    private var presetAvatarsSection: some View {
        VStack(alignment: .leading, spacing: LociTheme.Spacing.m) {
            Text("Hazır avatarlar")
                .font(.caption.weight(.semibold))
                .foregroundStyle(LociTheme.secondaryText)
                .padding(.horizontal, LociTheme.Spacing.xs)

            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: LociTheme.Spacing.m), count: 6), spacing: LociTheme.Spacing.m) {
                ForEach(AvatarReference.presets, id: \.self) { name in
                    let selected = avatarChoice == .preset(name)
                    Button {
                        avatarChoice = .preset(name)
                        pickedPhoto = nil
                        photoPreview = nil
                    } label: {
                        LociAvatar(handle: name, avatarURL: AvatarReference.presetURL(name), size: 46)
                            .overlay(Circle().stroke(selected ? LociTheme.accent : .clear, lineWidth: LociTheme.Stroke.emphasis))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(Text("Hazır avatar \(name)"))
                    .accessibilityAddTraits(selected ? .isSelected : [])
                }
            }
            .padding(.horizontal, LociTheme.Spacing.xs)
        }
    }

    private var photoSection: some View {
        LociCard {
            VStack(alignment: .leading, spacing: LociTheme.Spacing.s) {
                PhotosPicker(selection: $pickedPhoto, matching: .images) {
                    Label("Fotoğraf seç", systemImage: "photo.on.rectangle")
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .accessibilityIdentifier("profile-edit-photo")
                Text("Fotoğraflar yayınlanmadan önce otomatik olarak incelenir; çıplaklık, müstehcenlik veya şiddet içerenler reddedilir.")
                    .font(.caption2)
                    .foregroundStyle(LociTheme.tertiaryText)
            }
        }
    }

    private func loadPhoto(_ item: PhotosPickerItem?) async {
        guard let item else { return }
        guard let data = try? await item.loadTransferable(type: Data.self),
              let image = UIImage(data: data) else {
            errorMessage = AuthFlowError.invalidPhoto.localizedDescription
            return
        }
        errorMessage = nil
        photoPreview = image
        avatarChoice = .photo(data)
    }

    private func saveProfile() async {
        guard isValid, !isSaving else { return }
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }

        do {
            let cleanBio = bio.trimmingCharacters(in: .whitespacesAndNewlines)
            try await session.updateProfile(handle: cleanHandle, avatar: avatarChoice, bio: cleanBio.isEmpty ? nil : cleanBio)
            if case .photo = avatarChoice {
                photoSubmitted = true
            } else {
                dismiss()
            }
        } catch let error as AuthFlowError {
            errorMessage = error.localizedDescription
        } catch {
            errorMessage = String(localized: "Profil güncellenemedi. Bağlantını kontrol edip tekrar dene.")
        }
    }
}
