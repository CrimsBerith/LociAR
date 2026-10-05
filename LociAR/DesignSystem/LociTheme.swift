import SwiftUI
import UIKit

enum LociTheme {
    static let background = Color(red: 0.025, green: 0.035, blue: 0.055)
    static let surface = Color(red: 0.065, green: 0.088, blue: 0.125)
    static let elevated = Color(red: 0.095, green: 0.125, blue: 0.175)
    static let surfaceStrong = Color(red: 0.075, green: 0.105, blue: 0.15)
    static let accent = Color(red: 0.22, green: 0.88, blue: 0.72)
    static let warning = Color.orange
    static let danger = Color.red
    static let secondaryText = Color.white.opacity(0.74)
    static let tertiaryText = Color.white.opacity(0.58)
    static let hairline = Color.white.opacity(0.10)
    static let field = Color.white.opacity(0.07)
    /// Text/icons drawn on the accent color (primary buttons).
    static let onAccent = Color.black

    enum Radius {
        static let small: CGFloat = 12
        static let medium: CGFloat = 16
        static let large: CGFloat = 20
    }

    enum Spacing {
        static let xs: CGFloat = 4
        static let s: CGFloat = 8
        static let m: CGFloat = 12
        static let l: CGFloat = 16
        static let xl: CGFloat = 24
    }

    static let spatialGradient = LinearGradient(
        colors: [Color(red: 0.03, green: 0.06, blue: 0.1), Color(red: 0.02, green: 0.03, blue: 0.055)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
}

struct LociScreenBackground: View {
    var body: some View {
        ZStack {
            LociTheme.spatialGradient
            Circle()
                .fill(LociTheme.accent.opacity(0.055))
                .frame(width: 330, height: 330)
                .blur(radius: 28)
                .offset(x: 170, y: -310)
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }
}

struct LociCard<Content: View>: View {
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(16)
            .background {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(reduceTransparency ? LociTheme.surfaceStrong : LociTheme.surface.opacity(0.86))
            }
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(LociTheme.hairline))
            .shadow(color: .black.opacity(0.14), radius: 14, y: 7)
    }
}

struct LociStatusPill: View {
    let title: String
    let symbol: String
    let color: Color

    var body: some View {
        Label(title, systemImage: symbol)
            .font(.caption.weight(.semibold))
            .foregroundStyle(color)
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(color.opacity(0.14), in: Capsule())
            .overlay(Capsule().stroke(color.opacity(0.18)))
    }
}

struct LociMetricLabel: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let value: Int
    let title: String
    let symbol: String
    var color: Color = .white

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: symbol)
                .font(.caption.weight(.semibold))
                .foregroundStyle(color)
            VStack(alignment: .leading, spacing: 0) {
                Text(value >= 10_000 ? value.formatted(.number.notation(.compactName)) : value.formatted())
                    .font(.subheadline.weight(.bold))
                    .monospacedDigit()
                    .contentTransition(.numericText(value: Double(value)))
                    .animation(reduceMotion ? nil : .snappy, value: value)
                Text(title)
                    .font(.caption2)
                    .foregroundStyle(LociTheme.secondaryText)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(value) \(title)")
    }
}

struct LociInlineNotice: View {
    let title: String
    let message: String
    let symbol: String
    var color: Color = LociTheme.accent

    var body: some View {
        HStack(alignment: .top, spacing: 11) {
            Image(systemName: symbol)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(color)
                .frame(width: 22)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.subheadline.weight(.semibold))
                Text(message).font(.caption).foregroundStyle(LociTheme.secondaryText)
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(color.opacity(0.09), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(color.opacity(0.16)))
    }
}

struct LociPrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            // Disabled: light text on a subtle fill stays readable (white on white 24% was ~2:1).
            .foregroundStyle(isEnabled ? LociTheme.onAccent : LociTheme.tertiaryText)
            .frame(maxWidth: .infinity, minHeight: 50)
            .padding(.horizontal, 16)
            .background(
                isEnabled ? LociTheme.accent.opacity(configuration.isPressed ? 0.76 : 1) : Color.white.opacity(0.14),
                in: RoundedRectangle(cornerRadius: LociTheme.Radius.medium, style: .continuous)
            )
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.985 : 1)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.14), value: configuration.isPressed)
    }
}

struct LociSecondaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(isEnabled ? Color.white : LociTheme.tertiaryText)
            .frame(maxWidth: .infinity, minHeight: 46)
            .padding(.horizontal, 14)
            .background(LociTheme.field.opacity(configuration.isPressed ? 0.65 : 1), in: RoundedRectangle(cornerRadius: 15, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 15, style: .continuous).stroke(LociTheme.hairline))
    }
}

struct LociSectionLabel: View {
    let title: String
    let symbol: String

    var body: some View {
        Label(title, systemImage: symbol)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white.opacity(0.88))
    }
}

struct LociLoadingView: View {
    let title: String

    var body: some View {
        VStack(spacing: 14) {
            ProgressView().controlSize(.large).tint(LociTheme.accent)
            Text(title).font(.subheadline.weight(.medium)).foregroundStyle(LociTheme.secondaryText)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .combine)
    }
}

struct LociEmptyState: View {
    let title: String
    let message: String
    let symbol: String
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        VStack(spacing: 16) {
            ZStack {
                Circle().fill(LociTheme.accent.opacity(0.12)).frame(width: 74, height: 74)
                Image(systemName: symbol).font(.system(size: 29, weight: .semibold)).foregroundStyle(LociTheme.accent)
            }
            VStack(spacing: 7) {
                Text(title).font(.title3.bold())
                Text(message).font(.subheadline).foregroundStyle(LociTheme.secondaryText).multilineTextAlignment(.center)
            }
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .buttonStyle(.borderedProminent).tint(LociTheme.accent).foregroundStyle(.black)
            }
        }
        .padding(28)
        .frame(maxWidth: 430)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

extension LociEmptyState {
    /// Error variant of the empty state: its own icon and (when `retry` is given) a "Tekrar dene"
    /// button, so a failed load never reads as "nothing here".
    static func failure(title: String = String(localized: "Şu anda yüklenemiyor"), message: String, retry: (() -> Void)? = nil) -> LociEmptyState {
        LociEmptyState(
            title: title, message: message, symbol: "exclamationmark.triangle",
            actionTitle: retry == nil ? nil : "Tekrar dene", action: retry
        )
    }
}

struct LociAvatar: View {
    let handle: String
    var avatarURL: URL? = nil
    var size: CGFloat = 44
    @State private var storageAvatar: UIImage?

    var body: some View {
        Group {
            if let preset = AvatarReference.presetName(avatarURL) {
                presetAvatar(preset)
            } else if let avatarURL, avatarURL.scheme == "storage" {
                if let storageAvatar {
                    Image(uiImage: storageAvatar).resizable().scaledToFill().frame(width: size, height: size).clipShape(Circle())
                } else { fallbackAvatar }
            } else if let avatarURL {
                AsyncImage(url: avatarURL) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                            .frame(width: size, height: size)
                            .clipShape(Circle())
                    case .failure, .empty:
                        fallbackAvatar
                    @unknown default:
                        fallbackAvatar
                    }
                }
            } else {
                fallbackAvatar
            }
        }
        .frame(width: size, height: size)
        .overlay(Circle().stroke(LociTheme.accent.opacity(0.18)))
        .accessibilityHidden(true)
        .task(id: avatarURL) {
            storageAvatar = nil
            guard let avatarURL, avatarURL.scheme == "storage" else { return }
            let data = await AvatarURLCache.shared.data(for: avatarURL)
            guard !Task.isCancelled else { return }
            storageAvatar = data.flatMap { UIImage(data: $0) }
        }
    }

    private func presetAvatar(_ name: String) -> some View {
        let style = LociAvatar.presetStyle(name)
        return ZStack {
            Circle().fill(style.color.gradient)
            Image(systemName: style.symbol)
                .font(.system(size: size * 0.46, weight: .semibold))
                .foregroundStyle(.white)
        }
    }

    /// SF Symbols only: no bundled artwork, no licensing or likeness questions.
    static func presetStyle(_ name: String) -> (symbol: String, color: Color) {
        switch name {
        case "hare": ("hare.fill", .orange)
        case "tortoise": ("tortoise.fill", .green)
        case "cat": ("cat.fill", .purple)
        case "dog": ("dog.fill", .brown)
        case "bear": ("teddybear.fill", .pink)
        case "bird": ("bird.fill", .cyan)
        case "fish": ("fish.fill", .blue)
        case "leaf": ("leaf.fill", .mint)
        case "star": ("star.fill", .yellow)
        case "moon": ("moon.fill", .indigo)
        case "sun": ("sun.max.fill", .red)
        default: ("bolt.fill", .teal)
        }
    }

    private var fallbackAvatar: some View {
        ZStack {
            Circle().fill(LociTheme.accent.opacity(0.14))
            Text(String(handle.trimmingCharacters(in: CharacterSet(charactersIn: "@")).prefix(1)).uppercased())
                .font(.system(size: size * 0.38, weight: .bold, design: .rounded))
                .foregroundStyle(LociTheme.accent)
        }
    }
}

extension View {
    func lociListStyle() -> some View {
        self
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(LociScreenBackground())
    }
}

extension ExternalMediaPlatform {
    var brandColor: Color {
        switch self {
        case .spotify: Color(red: 30 / 255, green: 215 / 255, blue: 96 / 255)
        case .youtube: Color(red: 1, green: 0, blue: 51 / 255)
        case .facebook: Color(red: 8 / 255, green: 102 / 255, blue: 1)
        case .instagram: Color(red: 0.88, green: 0.22, blue: 0.52)
        case .x: .white
        }
    }

    var brandAssetName: String {
        switch self {
        case .spotify: "BrandSpotify"
        case .youtube: "BrandYouTube"
        case .facebook: "BrandFacebook"
        case .instagram: "BrandInstagram"
        case .x: "BrandXBlack"
        }
    }
}

struct BrandLogoView: View {
    let platform: ExternalMediaPlatform
    var size: CGFloat = 28

    var body: some View {
        Group {
            if platform == .x {
                ZStack {
                    Circle().fill(.white)
                    Image(platform.brandAssetName)
                        .resizable()
                        .scaledToFit()
                        .padding(size * 0.22)
                }
            } else {
                Image(platform.brandAssetName)
                    .resizable()
                    .scaledToFit()
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}
