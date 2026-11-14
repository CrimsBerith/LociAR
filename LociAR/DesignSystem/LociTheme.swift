import SwiftUI
import UIKit

enum LociTheme {
    private static func rgb(_ red: CGFloat, _ green: CGFloat, _ blue: CGFloat) -> UIColor {
        UIColor(red: red / 255, green: green / 255, blue: blue / 255, alpha: 1)
    }

    struct Palette {
        let background: UIColor
        let surface: UIColor
        let elevated: UIColor
        let rowSurface: UIColor
        let authSurface: UIColor
        let authField: UIColor
        let profileSurface: UIColor
        let arSearchSurface: UIColor
        let arSearchInk: UIColor
        let accent: UIColor
        let ambientBlue: UIColor
        let warning: UIColor
        let danger: UIColor
        let textPrimary: UIColor
        let secondaryText: UIColor
        let tertiaryText: UIColor
        let hairline: UIColor
        let field: UIColor
        let glassBorder: UIColor
        let onAccent: UIColor
        let onDanger: UIColor
        let social: UIColor
        let discoveryAccent: UIColor
        let identityAccent: UIColor
        let mapAR: UIColor
        let mapLocation: UIColor
        let mediaOverlayText: UIColor
        let mediaOverlayScrim: UIColor
        let scrim: UIColor

        init(style: UIUserInterfaceStyle, highContrast: Bool = false) {
            // Palette matches the app icon: graphite #1C2226 and warm cream #F2EFE8.
            // Dark mode is graphite with cream accent; light mode is cream paper with graphite
            // accent. Text pairs keep 4.5:1 contrast.
            let dark = style == .dark
            let ink = LociTheme.rgb(28, 34, 38)
            let cream = LociTheme.rgb(242, 239, 232)
            background = dark ? ink : cream
            surface = dark ? LociTheme.rgb(35, 42, 46) : LociTheme.rgb(249, 247, 242)
            elevated = dark ? LociTheme.rgb(47, 55, 60) : LociTheme.rgb(229, 225, 215)
            rowSurface = dark ? LociTheme.rgb(32, 39, 43) : LociTheme.rgb(246, 243, 237)
            authSurface = dark ? LociTheme.rgb(35, 42, 46) : LociTheme.rgb(249, 247, 242)
            authField = dark ? LociTheme.rgb(47, 55, 60) : LociTheme.rgb(253, 252, 249)
            profileSurface = dark ? LociTheme.rgb(32, 39, 43) : LociTheme.rgb(237, 233, 224)
            arSearchSurface = cream
            arSearchInk = ink
            accent = dark ? cream : ink
            ambientBlue = LociTheme.rgb(75, 101, 138)
            warning = dark ? LociTheme.rgb(240, 190, 110) : LociTheme.rgb(146, 84, 0)
            danger = dark ? LociTheme.rgb(242, 132, 132) : LociTheme.rgb(168, 42, 48)
            textPrimary = dark ? cream : ink
            secondaryText = dark ? LociTheme.rgb(186, 188, 184) : LociTheme.rgb(66, 72, 76)
            tertiaryText = dark ? LociTheme.rgb(156, 160, 158) : LociTheme.rgb(84, 89, 92)
            hairline = dark
                ? cream.withAlphaComponent(0.14)
                : ink.withAlphaComponent(0.16)
            field = dark ? cream.withAlphaComponent(0.07) : LociTheme.rgb(253, 252, 249)
            glassBorder = highContrast
                ? (dark ? cream : ink)
                : (dark ? LociTheme.rgb(112, 120, 124) : LociTheme.rgb(118, 116, 108))
            onAccent = dark ? ink : cream
            onDanger = dark ? LociTheme.rgb(53, 16, 20) : .white
            social = dark ? LociTheme.rgb(240, 150, 172) : LociTheme.rgb(158, 44, 84)
            discoveryAccent = dark ? LociTheme.rgb(150, 182, 224) : LociTheme.rgb(44, 78, 136)
            identityAccent = dark ? LociTheme.rgb(196, 182, 236) : LociTheme.rgb(98, 70, 150)
            mapAR = dark ? LociTheme.rgb(150, 186, 236) : LociTheme.rgb(40, 82, 160)
            mapLocation = dark ? LociTheme.rgb(240, 190, 110) : LociTheme.rgb(146, 84, 0)
            mediaOverlayText = .white
            mediaOverlayScrim = .black
            scrim = .black
        }
    }

    static func palette(for style: UIUserInterfaceStyle, highContrast: Bool = false) -> Palette {
        Palette(style: style, highContrast: highContrast)
    }

    private static func color(_ keyPath: KeyPath<Palette, UIColor>) -> Color {
        Color(uiColor: UIColor { traits in
            Self.palette(for: traits.userInterfaceStyle, highContrast: traits.accessibilityContrast == .high)[keyPath: keyPath]
        })
    }

    static let background = color(\.background)
    static let surface = color(\.surface)
    static let elevated = color(\.elevated)
    static let surfaceStrong = elevated
    static let rowSurface = color(\.rowSurface)
    static let authSurface = color(\.authSurface)
    static let authField = color(\.authField)
    static let profileSurface = color(\.profileSurface)
    static let arSearchSurface = color(\.arSearchSurface)
    static let arSearchInk = color(\.arSearchInk)
    static let accent = color(\.accent)
    static let ambientBlue = color(\.ambientBlue)
    static let warning = color(\.warning)
    static let danger = color(\.danger)
    static let textPrimary = color(\.textPrimary)
    static let secondaryText = color(\.secondaryText)
    static let tertiaryText = color(\.tertiaryText)
    static let hairline = color(\.hairline)
    static let field = color(\.field)
    static let glassTint = accent.opacity(0.07)
    static let glassBorder = color(\.glassBorder)
    static let onAccent = color(\.onAccent)
    static let onDanger = color(\.onDanger)
    static let scrim = color(\.scrim)

    static let textSecondary = secondaryText
    static let textTertiary = tertiaryText
    static let actionPrimary = accent
    static let onActionPrimary = onAccent
    static let border = hairline
    static let divider = hairline
    static let focus = accent
    static let success = accent
    static let error = danger
    static let social = color(\.social)
    static let discoveryAccent = color(\.discoveryAccent)
    static let identityAccent = color(\.identityAccent)
    static let mapAR = color(\.mapAR)
    static let mapLocation = color(\.mapLocation)
    static let mediaOverlayText = color(\.mediaOverlayText)
    static let mediaOverlayScrim = color(\.mediaOverlayScrim)

    enum Typography {
        static let display = Font.system(.largeTitle, design: .serif).weight(.semibold)
        static let title = Font.system(.title2, design: .default).weight(.bold)
        /// Small tracked label above a section or card, like a dossier heading.
        static let eyebrow = Font.system(.caption, design: .default).weight(.semibold)
        /// The wordmark: a serif with slight tracking, used on the sign-in and loading screens. Scales with Dynamic Type (34 pt at the default size).
        static let wordmark = Font.system(.largeTitle, design: .serif).weight(.semibold)
        static let headline = Font.system(.headline, design: .default)
        static let body = Font.system(.body, design: .default)
        static let bodyEmphasis = Font.system(.body, design: .default).weight(.semibold)
        static let callout = Font.system(.callout, design: .default)
        static let label = Font.system(.subheadline, design: .default).weight(.semibold)
        static let caption = Font.system(.caption, design: .default)
        static let numeric = Font.system(.subheadline, design: .rounded).weight(.bold)
    }

    enum Radius {
        static let small: CGFloat = 10
        static let medium: CGFloat = 14
        static let large: CGFloat = 18
        static let extraLarge: CGFloat = 22
        static let pill: CGFloat = 999
    }

    enum Stroke {
        static let hairline: CGFloat = 1
        static let subtle: CGFloat = 1.5
        static let focus: CGFloat = 2
        static let emphasis: CGFloat = 3
    }

    enum Spacing {
        static let xxs: CGFloat = 2
        static let xs: CGFloat = 4
        static let s: CGFloat = 8
        static let m: CGFloat = 12
        static let l: CGFloat = 16
        static let xl2: CGFloat = 20
        static let xl: CGFloat = 24
        static let xxl: CGFloat = 32
        static let xxxl: CGFloat = 40
    }

    enum Control {
        static let minimumTapTarget: CGFloat = 44
        static let primaryButtonHeight: CGFloat = 50
        static let secondaryButtonHeight: CGFloat = 46
        static let formButtonHeight: CGFloat = 48
        static let actionTileHeight: CGFloat = 58
    }

    enum Depth {
        static let smallRadius: CGFloat = 4
        static let mediumRadius: CGFloat = 12
        static let cardRadius: CGFloat = 14
        static let cardOffset: CGFloat = 6
        static let floatingRadius: CGFloat = 18
        static let floatingOffset: CGFloat = 8
        static let shadowOpacity: CGFloat = 0.18
    }

    enum Layout {
        static let readableContentWidth: CGFloat = 640
        static let gridGutter: CGFloat = 16
        static let characterCountClearance: CGFloat = 34
    }

    static let spatialGradient = LinearGradient(
        colors: [surface, background],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    /// Brushed-metal sheen for primary actions: the accent lit from the top-left.
    static let accentSheen = LinearGradient(
        stops: [
            .init(color: accent.opacity(0.92), location: 0),
            .init(color: accent, location: 0.45),
            .init(color: accent.opacity(0.82), location: 1),
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
}

/// App surfaces share one glass language; floating controls and reading cards use different tint strengths.
enum LociSurfaceAppearance {
    case content
    case floating
    case auth
    case arSearch
}

private struct LociGlassSurface: ViewModifier {
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    let shape: AnyShape

    @ViewBuilder
    func body(content: Content) -> some View {
        if reduceTransparency {
            content
                .background(LociTheme.surfaceStrong, in: shape)
                .overlay(shape.stroke(LociTheme.glassBorder))
        } else if #available(iOS 26.0, *) {
            content
                .glassEffect(.regular.tint(LociTheme.glassTint), in: shape)
                .overlay(shape.stroke(LociTheme.glassBorder))
                .shadow(color: Color.black.opacity(LociTheme.Depth.shadowOpacity), radius: LociTheme.Depth.floatingRadius, y: LociTheme.Depth.floatingOffset)
        } else {
            content
                .background(.regularMaterial, in: shape)
                .overlay(shape.fill(LociTheme.glassTint))
                .overlay(shape.stroke(LociTheme.glassBorder))
                .shadow(color: Color.black.opacity(LociTheme.Depth.shadowOpacity), radius: LociTheme.Depth.floatingRadius, y: LociTheme.Depth.floatingOffset)
        }
    }
}

private struct LociGlassRowSurface: View {
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    var cornerRadius: CGFloat

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        if reduceTransparency {
            shape.fill(LociTheme.surfaceStrong).overlay(shape.stroke(LociTheme.glassBorder))
        } else if #available(iOS 26.0, *) {
            shape.fill(.clear)
                .background(shape.fill(LociTheme.rowSurface.opacity(0.94)))
                .glassEffect(.regular.tint(LociTheme.glassTint), in: shape)
                .overlay(shape.stroke(LociTheme.glassBorder))
        } else {
            shape.fill(LociTheme.rowSurface.opacity(0.96))
                .overlay(shape.fill(LociTheme.glassTint))
                .overlay(shape.stroke(LociTheme.glassBorder))
        }
    }
}

extension View {
    /// A single glass layer for a floating group; nested buttons use flat fills.
    func lociGlassSurface(cornerRadius: CGFloat = LociTheme.Radius.large) -> some View {
        modifier(LociGlassSurface(shape: AnyShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))))
    }

    /// Applies the same glass treatment to controls whose geometry is not a rounded rectangle.
    func lociGlassSurface<S: Shape>(in shape: S) -> some View {
        modifier(LociGlassSurface(shape: AnyShape(shape)))
    }
}

struct LociScreenBackground: View {
    var body: some View {
        ZStack {
            LociTheme.spatialGradient
            // A single warm light source high on the trailing edge and a cold counter-glow low
            // on the leading edge: depth without decoration.
            Circle()
                .fill(LociTheme.accent.opacity(0.07))
                .frame(width: 420, height: 420)
                .blur(radius: 60)
                .offset(x: 190, y: -360)
            Circle()
                .fill(LociTheme.ambientBlue.opacity(0.06))
                .frame(width: 360, height: 360)
                .blur(radius: 70)
                .offset(x: -200, y: 340)
            // Hairline rule under the status bar area, like the edge of a document.
            VStack {
                Rectangle().fill(LociTheme.accent.opacity(0.18)).frame(height: 0.5).padding(.top, 2)
                Spacer()
            }
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }
}

struct LociCard<Content: View>: View {
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    var appearance: LociSurfaceAppearance = .content
    @ViewBuilder var content: Content

    @ViewBuilder
    var body: some View {
        switch appearance {
        case .content:
            content.padding(LociTheme.Spacing.l).lociGlassSurface(cornerRadius: LociTheme.Radius.large)
        case .floating:
            content.padding(LociTheme.Spacing.l).lociGlassSurface()
        case .auth:
            let shape = RoundedRectangle(cornerRadius: LociTheme.Radius.extraLarge, style: .continuous)
            content
                .padding(LociTheme.Spacing.l)
                .background(LociTheme.authSurface, in: shape)
                .overlay(shape.stroke(LociTheme.glassBorder))
                .shadow(color: .black.opacity(LociTheme.Depth.shadowOpacity), radius: LociTheme.Depth.cardRadius, y: LociTheme.Depth.cardOffset)
        case .arSearch:
            let shape = RoundedRectangle(cornerRadius: LociTheme.Radius.large, style: .continuous)
            content
                // This surface intentionally stays light while AR is scanning, including in Dark Mode.
                // Do not inherit the system's white primary text into it.
                .foregroundStyle(LociTheme.arSearchInk)
                .padding(LociTheme.Spacing.l)
                .background(LociTheme.arSearchSurface, in: shape)
                .overlay(shape.stroke(LociTheme.arSearchInk.opacity(0.14)))
        }
    }
}

struct LociStatusPill: View {
    let title: String
    let symbol: String
    let color: Color
    var isARSearching = false

    var body: some View {
        Label(title.localizedUI, systemImage: symbol)
            .labelStyle(.titleAndIcon)
            .font(LociTheme.Typography.caption.weight(.semibold))
            .foregroundStyle(isARSearching ? LociTheme.arSearchInk : color)
            .padding(.horizontal, LociTheme.Spacing.m)
            .padding(.vertical, LociTheme.Spacing.xs)
        .background(isARSearching ? LociTheme.arSearchSurface : LociTheme.rowSurface, in: Capsule())
        .overlay(Capsule().stroke(isARSearching ? LociTheme.arSearchInk.opacity(0.16) : color.opacity(0.30)))
            .fixedSize(horizontal: false, vertical: true)
    }
}

struct LociMetricLabel: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let value: Int
    let title: String
    let symbol: String
    var color: Color = LociTheme.textPrimary

    var body: some View {
        HStack(spacing: LociTheme.Spacing.xs) {
            Image(systemName: symbol)
                .font(.caption.weight(.semibold))
                .foregroundStyle(color)
            VStack(alignment: .leading, spacing: LociTheme.Spacing.xxs) {
                Text(value >= 10_000 ? value.formatted(.number.notation(.compactName)) : value.formatted())
                    .font(LociTheme.Typography.numeric)
                    .monospacedDigit()
                    .contentTransition(.numericText(value: Double(value)))
                    .animation(reduceMotion ? nil : .snappy, value: value)
                Text(title.localizedUI)
                    .font(.caption2)
                    .foregroundStyle(LociTheme.secondaryText)
            }
        }
        .accessibilityElement(children: .ignore)
        // verbatim: both parts are already localized; a literal here would extract a "%lld %@" catalog key.
        .accessibilityLabel(Text(verbatim: "\(value.formatted()) \(title.localizedUI)"))
    }
}

struct LociInlineNotice: View {
    let title: String
    let message: String
    let symbol: String
    var color: Color = LociTheme.accent

    var body: some View {
        HStack(alignment: .top, spacing: LociTheme.Spacing.m) {
            Image(systemName: symbol)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(color)
                .frame(width: LociTheme.Control.minimumTapTarget / 2)
            VStack(alignment: .leading, spacing: LociTheme.Spacing.s) {
                Text(title.localizedUI).font(LociTheme.Typography.label)
                Text(message.localizedUI).font(.footnote).foregroundStyle(LociTheme.secondaryText)
            }
            Spacer(minLength: 0)
        }
        .padding(LociTheme.Spacing.m)
        .background(LociTheme.rowSurface, in: RoundedRectangle(cornerRadius: LociTheme.Radius.small, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: LociTheme.Radius.small, style: .continuous).stroke(color.opacity(0.24)))
    }
}

struct LociPrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @ViewBuilder
    func makeBody(configuration: Configuration) -> some View {
        let label = configuration.label
            .font(LociTheme.Typography.headline)
            // High-contrast legible text on solid accent; dim tertiaryText when disabled
            .foregroundStyle(isEnabled ? LociTheme.onAccent : LociTheme.tertiaryText)
            .frame(maxWidth: .infinity, minHeight: LociTheme.Control.primaryButtonHeight)
            .padding(.horizontal, LociTheme.Spacing.l)
        let shape = RoundedRectangle(cornerRadius: LociTheme.Radius.medium, style: .continuous)
        label
            .background {
                if isEnabled {
                    shape.fill(LociTheme.accentSheen)
                        .opacity(configuration.isPressed ? 0.82 : 1)
                } else {
                    shape.fill(LociTheme.rowSurface)
                        .overlay(shape.fill(LociTheme.accent.opacity(0.14)))
                }
            }
            .overlay(
                // Thin highlight along the top edge reads as a machined bevel.
                shape.stroke(
                    isEnabled
                        ? LinearGradient(colors: [Color.white.opacity(0.35), Color.white.opacity(0.04)], startPoint: .top, endPoint: .bottom)
                        : LinearGradient(colors: [LociTheme.glassBorder.opacity(0.8)], startPoint: .top, endPoint: .bottom),
                    lineWidth: 1
                )
            )
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.985 : 1)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.14), value: configuration.isPressed)
    }
}

struct LociSecondaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    @ViewBuilder
    func makeBody(configuration: Configuration) -> some View {
        let label = configuration.label
            .font(LociTheme.Typography.label)
            .foregroundStyle(isEnabled ? LociTheme.textPrimary : LociTheme.tertiaryText)
            .frame(maxWidth: .infinity, minHeight: LociTheme.Control.secondaryButtonHeight)
            .padding(.horizontal, LociTheme.Spacing.m)
        let shape = RoundedRectangle(cornerRadius: LociTheme.Radius.medium, style: .continuous)
        label
            .background(reduceTransparency ? LociTheme.elevated : LociTheme.rowSurface.opacity(configuration.isPressed ? 0.78 : 1), in: shape)
            .overlay(shape.stroke(LociTheme.glassBorder))
    }
}

struct LociCompactButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        let shape = RoundedRectangle(cornerRadius: LociTheme.Radius.small, style: .continuous)
        return configuration.label
            .font(LociTheme.Typography.caption.weight(.semibold))
            .foregroundStyle(isEnabled ? LociTheme.textPrimary : LociTheme.tertiaryText)
            .padding(.horizontal, LociTheme.Spacing.m)
            .frame(minHeight: LociTheme.Control.minimumTapTarget)
            .background(LociTheme.rowSurface.opacity(configuration.isPressed ? 0.78 : 1), in: shape)
            .overlay(shape.stroke(LociTheme.glassBorder))
    }
}

struct LociSectionLabel: View {
    let title: String
    let symbol: String

    var body: some View {
        // Dossier-style heading: small, tracked capitals in the signal colour.
        Label(title.localizedUI, systemImage: symbol)
            .font(LociTheme.Typography.eyebrow)
            .textCase(.uppercase)
            .kerning(1.1)
            .foregroundStyle(LociTheme.accent)
    }
}

/// The LociDrop wordmark with its tagline, shared by the sign-in and loading screens.
struct LociWordmark: View {
    var tagline: String? = nil
    var symbolSize: CGFloat = 38

    var body: some View {
        VStack(spacing: LociTheme.Spacing.m) {
            Image(.lociMark)
                .renderingMode(.template)
                .resizable()
                .scaledToFit()
                .frame(width: symbolSize * 2.3, height: symbolSize * 2.3)
                .foregroundStyle(LociTheme.accent)
                .accessibilityHidden(true)
            VStack(spacing: LociTheme.Spacing.s) {
                Text(verbatim: "LociDrop")
                    .font(LociTheme.Typography.wordmark)
                    .kerning(1.5)
                    .foregroundStyle(LociTheme.textPrimary)
                if let tagline {
                    Text(tagline.localizedUI)
                        .font(LociTheme.Typography.eyebrow)
                        .textCase(.uppercase)
                        .kerning(1.6)
                        .foregroundStyle(LociTheme.secondaryText)
                        .multilineTextAlignment(.center)
                }
            }
        }
    }
}

struct LociLoadingView: View {
    let title: String

    var body: some View {
        VStack(spacing: LociTheme.Spacing.m) {
            ProgressView().controlSize(.large).tint(LociTheme.accent)
            Text(title.localizedUI).font(LociTheme.Typography.label).foregroundStyle(LociTheme.secondaryText)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .combine)
    }
}

/// Content-sized pagination, with an explicit style so native defaults cannot grow an inset.
struct LociPaginationFooter: View {
    let isLoading: Bool
    var isEnabled = true
    var accessibilityID = "pagination-load-more"
    let action: () -> Void

    var body: some View {
        HStack {
            Spacer(minLength: 0)
            Button(action: action) {
                HStack(spacing: LociTheme.Spacing.s) {
                    if isLoading { ProgressView().tint(LociTheme.accent) }
                    Text("Daha fazla göster")
                }
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(isEnabled && !isLoading ? LociTheme.textPrimary : LociTheme.tertiaryText)
                .padding(.horizontal, LociTheme.Spacing.m)
                .padding(.vertical, LociTheme.Spacing.s)
                .background(LociTheme.field, in: Capsule())
                .overlay(Capsule().stroke(LociTheme.glassBorder))
            }
            .buttonStyle(.plain)
            .disabled(isLoading || !isEnabled)
            .accessibilityIdentifier(accessibilityID)
            Spacer(minLength: 0)
        }
        .padding(.vertical, 4)
    }
}

struct LociEmptyState: View {
    let title: String
    let message: String
    let symbol: String
    var actionTitle: String?
    var action: (() -> Void)?
    var symbolColor: Color = LociTheme.accent

    var body: some View {
        VStack(spacing: LociTheme.Spacing.l) {
            ZStack {
                Circle().fill(symbolColor.opacity(0.12)).frame(width: 74, height: 74)
                Image(systemName: symbol).font(.system(size: 29, weight: .semibold)).foregroundStyle(symbolColor)
            }
            VStack(spacing: LociTheme.Spacing.s) {
                Text(title.localizedUI).font(.title3.bold())
                Text(message.localizedUI).font(.subheadline).foregroundStyle(LociTheme.secondaryText).multilineTextAlignment(.center)
            }
            if let actionTitle, let action {
                Button(actionTitle.localizedUI, action: action)
                    .buttonStyle(LociPrimaryButtonStyle())
            }
        }
        .padding(LociTheme.Spacing.xxl)
        .frame(maxWidth: LociTheme.Layout.readableContentWidth)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

extension LociEmptyState {
    /// Error variant of the empty state: its own icon and (when `retry` is given) a "Tekrar dene"
    /// button, so a failed load never reads as "nothing here".
    static func failure(title: String = String(localized: "Şu anda yüklenemiyor"), message: String, retry: (() -> Void)? = nil) -> LociEmptyState {
        LociEmptyState(
            title: title, message: message, symbol: "exclamationmark.triangle",
            actionTitle: retry == nil ? nil : "Tekrar dene", action: retry,
            symbolColor: LociTheme.warning
        )
    }
}

enum LociAppearancePreference: String, CaseIterable, Identifiable {
    case system
    case light
    case dark

    static let storageKey = "loci.appearance"

    var id: String { rawValue }

    var colorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }
}

struct LociAvatar: View {
    @Environment(\.displayScale) private var displayScale
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
            let generation = ClientReadCaches.generation
            guard let avatarURL, avatarURL.scheme == "storage" else { return }
            let data = await AvatarURLCache.shared.data(for: avatarURL)
            guard !Task.isCancelled, ClientReadCaches.generation == generation else { return }
            let image = if let data { await AvatarReference.thumbnail(from: data, maxPixelSize: Int((size * displayScale).rounded(.up))) } else { nil as UIImage? }
            guard !Task.isCancelled, ClientReadCaches.generation == generation else { return }
            storageAvatar = image
        }
    }

    private func presetAvatar(_ name: String) -> some View {
        let style = LociAvatar.presetStyle(name)
        return ZStack {
            Circle().fill(LinearGradient(colors: style.colors, startPoint: .topLeading, endPoint: .bottomTrailing))
            Circle()
                .fill(.white.opacity(0.13))
                .frame(width: size * 0.48, height: size * 0.48)
                .offset(x: size * 0.23, y: -size * 0.22)
            Image(systemName: style.symbol)
                .font(.system(size: size * 0.46, weight: .semibold))
                .foregroundStyle(.white)
                .shadow(color: .black.opacity(0.18), radius: 2, y: 1)
        }
        .clipShape(Circle())
    }

    /// SF Symbols only: no bundled artwork, no licensing or likeness questions.
    static func presetStyle(_ name: String) -> (symbol: String, colors: [Color]) {
        switch name {
        case "hare": ("hare.fill", [Color(red: 1, green: 0.55, blue: 0.31), Color(red: 0.85, green: 0.20, blue: 0.32)])
        case "tortoise": ("tortoise.fill", [Color(red: 0.49, green: 0.78, blue: 0.35), Color(red: 0.10, green: 0.48, blue: 0.42)])
        case "cat": ("cat.fill", [Color(red: 0.72, green: 0.48, blue: 0.96), Color(red: 0.37, green: 0.27, blue: 0.76)])
        case "dog": ("dog.fill", [Color(red: 0.87, green: 0.65, blue: 0.42), Color(red: 0.56, green: 0.32, blue: 0.22)])
        case "bear": ("teddybear.fill", [Color(red: 1, green: 0.49, blue: 0.61), Color(red: 0.76, green: 0.25, blue: 0.49)])
        case "bird": ("bird.fill", [Color(red: 0.30, green: 0.82, blue: 0.93), Color(red: 0.13, green: 0.43, blue: 0.79)])
        case "fish": ("fish.fill", [Color(red: 0.30, green: 0.63, blue: 1), Color(red: 0.20, green: 0.32, blue: 0.80)])
        case "leaf": ("leaf.fill", [Color(red: 0.33, green: 0.88, blue: 0.67), Color(red: 0.08, green: 0.49, blue: 0.46)])
        case "star": ("star.fill", [Color(red: 1, green: 0.82, blue: 0.33), Color(red: 0.93, green: 0.49, blue: 0.20)])
        case "moon": ("moon.fill", [Color(red: 0.56, green: 0.62, blue: 1), Color(red: 0.34, green: 0.32, blue: 0.78)])
        case "sun": ("sun.max.fill", [Color(red: 1, green: 0.53, blue: 0.36), Color(red: 0.87, green: 0.27, blue: 0.36)])
        default: ("bolt.fill", [Color(red: 0.31, green: 0.86, blue: 0.80), Color(red: 0.11, green: 0.45, blue: 0.68)])
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
    func lociGlassRowBackground(cornerRadius: CGFloat = LociTheme.Radius.medium) -> some View {
        listRowBackground(LociGlassRowSurface(cornerRadius: cornerRadius))
    }

    func visibleContentRefresh(gate: ScreenRefreshGate, scope: String, revision: UUID,
                               enabled: Bool = true, action: @escaping @MainActor (Bool) async -> Void) -> some View {
        modifier(VisibleContentRefresh(gate: gate, scope: scope, revision: revision, enabled: enabled, action: action))
    }

    func lociListStyle() -> some View {
        self
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .listRowSpacing(LociTheme.Spacing.m)
            .listSectionSpacing(LociTheme.Spacing.xl)
            .lociGlassRowBackground()
            .background(LociScreenBackground())
    }
}

private struct ContentRefreshAllowedKey: EnvironmentKey {
    static let defaultValue = true
}

extension EnvironmentValues {
    var contentRefreshAllowed: Bool {
        get { self[ContentRefreshAllowedKey.self] }
        set { self[ContentRefreshAllowedKey.self] = newValue }
    }
}

private struct VisibleContentRefresh: ViewModifier {
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.contentRefreshAllowed) private var presentationAllowed
    @Environment(AppContainer.self) private var container
    @State private var visible = false
    @State private var connectionWake = UUID()
    let gate: ScreenRefreshGate
    let scope: String
    let revision: UUID
    let enabled: Bool
    let action: @MainActor (Bool) async -> Void

    private struct Activation: Equatable { let active: Bool; let scope: String; let revision: UUID; let connection: UUID }
    func body(content: Content) -> some View {
        let activation = Activation(active: visible && scenePhase == .active && enabled && presentationAllowed,
                                    scope: scope, revision: revision, connection: connectionWake)
        content
            .onAppear { visible = true }
            .onDisappear { visible = false }
            .onChange(of: container.connectivity.isOnline) { _, online in
                if online, gate.connectionRestored() { connectionWake = UUID() }
            }
            .task(id: activation) {
                guard activation.active else { return }
                var opening = true
                while !Task.isCancelled {
                    await action(opening)
                    opening = false
                    guard container.isBackendConfigured, !container.session.isLocalPreview,
                          !UITestFixtures.authenticatedSessionEnabled, !UITestFixtures.sampleContentEnabled else { return }
                    do { try await Task.sleep(for: .seconds(gate.nextDelay)) } catch { return }
                }
            }
    }
}
