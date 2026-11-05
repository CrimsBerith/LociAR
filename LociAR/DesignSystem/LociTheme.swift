import SwiftUI
import UIKit

enum LociTheme {
    static let background = Color(red: 11 / 255, green: 17 / 255, blue: 24 / 255)
    static let surface = Color(red: 18 / 255, green: 28 / 255, blue: 40 / 255)
    static let elevated = Color(red: 26 / 255, green: 40 / 255, blue: 55 / 255)
    static let surfaceStrong = elevated
    static let accent = Color(red: 0.22, green: 0.88, blue: 0.72)
    static let ambientBlue = Color(red: 0.20, green: 0.48, blue: 1.0)
    static let warning = Color.orange
    static let danger = Color.red
    static let secondaryText = Color(red: 184 / 255, green: 195 / 255, blue: 204 / 255)
    static let tertiaryText = Color(red: 147 / 255, green: 162 / 255, blue: 176 / 255)
    static let hairline = Color.white.opacity(0.10)
    static let field = Color.white.opacity(0.07)
    static let glassTint = accent.opacity(0.07)
    static let glassBorder = Color.white.opacity(0.15)
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
        colors: [surface, background],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
}

/// App surfaces share one glass language; floating controls and reading cards use different tint strengths.
enum LociSurfaceAppearance {
    case content
    case floating
}

private struct LociGlassPanelKey: EnvironmentKey {
    static let defaultValue = false
}

private extension EnvironmentValues {
    var lociGlassPanel: Bool {
        get { self[LociGlassPanelKey.self] }
        set { self[LociGlassPanelKey.self] = newValue }
    }
}

private struct LociGlassSurface: ViewModifier {
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    let shape: AnyShape

    @ViewBuilder
    func body(content: Content) -> some View {
        if reduceTransparency {
            content
                .environment(\.lociGlassPanel, true)
                .background(LociTheme.surfaceStrong, in: shape)
                .overlay(shape.stroke(LociTheme.glassBorder))
        } else if #available(iOS 26.0, *) {
            content
                .environment(\.lociGlassPanel, true)
                .glassEffect(.regular.tint(LociTheme.glassTint), in: shape)
                .overlay(shape.stroke(LociTheme.glassBorder))
                .shadow(color: Color.black.opacity(0.18), radius: 18, y: 8)
        } else {
            content
                .environment(\.lociGlassPanel, true)
                .background(.regularMaterial, in: shape)
                .overlay(shape.fill(LociTheme.glassTint))
                .overlay(shape.stroke(LociTheme.glassBorder))
                .shadow(color: Color.black.opacity(0.18), radius: 18, y: 8)
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
                .glassEffect(.regular.tint(LociTheme.glassTint), in: shape)
                .overlay(shape.stroke(LociTheme.glassBorder))
        } else {
            shape.fill(.ultraThinMaterial)
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
            Circle()
                .fill(LociTheme.accent.opacity(0.055))
                .frame(width: 330, height: 330)
                .blur(radius: 28)
                .offset(x: 170, y: -310)
            Circle()
                .fill(LociTheme.ambientBlue.opacity(0.045))
                .frame(width: 280, height: 280)
                .blur(radius: 34)
                .offset(x: -180, y: 300)
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
            content.padding(16).lociGlassSurface(cornerRadius: 20)
        case .floating:
            content.padding(16).lociGlassSurface()
        }
    }
}

struct LociStatusPill: View {
    let title: String
    let symbol: String
    let color: Color

    var body: some View {
        Label(title.localizedUI, systemImage: symbol)
            .labelStyle(.titleAndIcon)
            .font(.caption.weight(.semibold))
            .foregroundStyle(color)
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
        .background(.ultraThinMaterial, in: Capsule())
        .overlay(Capsule().fill(color.opacity(0.10)))
        .overlay(Capsule().stroke(color.opacity(0.30)))
            .fixedSize(horizontal: false, vertical: true)
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
                Text(title.localizedUI)
                    .font(.caption2)
                    .foregroundStyle(LociTheme.secondaryText)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(value) " + title.localizedUI)
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
                Text(title.localizedUI).font(.subheadline.weight(.semibold))
                Text(message.localizedUI).font(.caption).foregroundStyle(LociTheme.secondaryText)
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(color.opacity(0.07)))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(color.opacity(0.24)))
    }
}

struct LociPrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.lociGlassPanel) private var isInsideGlassPanel

    @ViewBuilder
    func makeBody(configuration: Configuration) -> some View {
        let label = configuration.label
            .font(.headline)
            // Disabled: light text on a subtle fill stays readable (white on white 24% was ~2:1).
            .foregroundStyle(isEnabled ? LociTheme.onAccent : LociTheme.tertiaryText)
            .frame(maxWidth: .infinity, minHeight: 50)
            .padding(.horizontal, 16)
        let shape = RoundedRectangle(cornerRadius: LociTheme.Radius.medium, style: .continuous)
        if #available(iOS 26.0, *), isEnabled, !reduceTransparency, !isInsideGlassPanel {
            label.glassEffect(.regular.tint(LociTheme.accent).interactive(), in: shape)
        } else {
            label
                .background(isEnabled ? LociTheme.accent.opacity(configuration.isPressed ? 0.76 : 1) : LociTheme.elevated, in: shape)
                .scaleEffect(configuration.isPressed && !reduceMotion ? 0.985 : 1)
                .animation(reduceMotion ? nil : .easeOut(duration: 0.14), value: configuration.isPressed)
        }
    }
}

struct LociSecondaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.lociGlassPanel) private var isInsideGlassPanel

    @ViewBuilder
    func makeBody(configuration: Configuration) -> some View {
        let label = configuration.label
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(isEnabled ? Color.white : LociTheme.tertiaryText)
            .frame(maxWidth: .infinity, minHeight: 46)
            .padding(.horizontal, 14)
        let shape = RoundedRectangle(cornerRadius: LociTheme.Radius.medium, style: .continuous)
        if #available(iOS 26.0, *), isEnabled, !reduceTransparency, !isInsideGlassPanel {
            label.glassEffect(.regular.interactive(), in: shape)
        } else {
            label
                .background(reduceTransparency ? LociTheme.elevated : LociTheme.field.opacity(configuration.isPressed ? 0.65 : 1), in: shape)
                .overlay(shape.stroke(LociTheme.hairline))
        }
    }
}

struct LociSectionLabel: View {
    let title: String
    let symbol: String

    var body: some View {
        Label(title.localizedUI, systemImage: symbol)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white.opacity(0.88))
    }
}

struct LociLoadingView: View {
    let title: String

    var body: some View {
        VStack(spacing: 14) {
            ProgressView().controlSize(.large).tint(LociTheme.accent)
            Text(title.localizedUI).font(.subheadline.weight(.medium)).foregroundStyle(LociTheme.secondaryText)
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
                HStack(spacing: 8) {
                    if isLoading { ProgressView().tint(LociTheme.accent) }
                    Text("Daha fazla göster")
                }
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(isEnabled && !isLoading ? Color.white : LociTheme.tertiaryText)
                .padding(.horizontal, 18)
                .padding(.vertical, 11)
                .background(Color.white.opacity(0.08), in: Capsule())
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
        VStack(spacing: 16) {
            ZStack {
                Circle().fill(symbolColor.opacity(0.12)).frame(width: 74, height: 74)
                Image(systemName: symbol).font(.system(size: 29, weight: .semibold)).foregroundStyle(symbolColor)
            }
            VStack(spacing: 7) {
                Text(title.localizedUI).font(.title3.bold())
                Text(message.localizedUI).font(.subheadline).foregroundStyle(LociTheme.secondaryText).multilineTextAlignment(.center)
            }
            if let actionTitle, let action {
                Button(actionTitle.localizedUI, action: action)
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
            actionTitle: retry == nil ? nil : "Tekrar dene", action: retry,
            symbolColor: LociTheme.warning
        )
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
    func lociGlassRowBackground(cornerRadius: CGFloat = 16) -> some View {
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
