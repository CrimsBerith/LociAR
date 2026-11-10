import AVFoundation
import SwiftUI
import SwiftData
import UIKit

struct PostCard: View {
    let post: LociPost
    var likeCount: Int? = nil
    var viewCount: Int? = nil
    var allowsTranslationControls = false
    var textLineLimit: Int? = 4
    /// Opt-in only for detail screens: list cards already sit inside their own navigation link.
    var authorProfile: LociUser? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: LociTheme.Spacing.m) {
            if post.sponsorship != nil {
                Label("Sponsorlu", systemImage: "tag.fill").font(.caption.bold()).foregroundStyle(LociTheme.warning)
            }
            authorHeader
            if let gif = post.gif {
                AnimatedGIFView(url: gif.previewURL)
                    .aspectRatio(min(max(gif.aspectRatio, 0.6), 1.8), contentMode: .fit)
                    .frame(maxWidth: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: LociTheme.Radius.small, style: .continuous))
                    .overlay(alignment: .bottomTrailing) {
                        Text(verbatim: "GIPHY")
                            .font(.caption2.weight(.heavy))
                            .padding(.horizontal, LociTheme.Spacing.s).padding(.vertical, LociTheme.Spacing.xs)
                            .background(LociTheme.background.opacity(0.72), in: Capsule()).overlay(Capsule().stroke(LociTheme.hairline))
                            .padding(LociTheme.Spacing.xs)
                    }
                    .accessibilityElement()
                    .accessibilityLabel(Text("GIF"))
                if let text = post.messageText {
                    TranslatedPostText(text: text, isReadable: !post.isLocked, allowsControls: allowsTranslationControls, lineLimit: textLineLimit)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(LociTheme.textPrimary)
                }
            } else {
                if post.isLocked {
                    Text("Kilitli not").font(.body.weight(.semibold)).foregroundStyle(LociTheme.textPrimary)
                } else if post.caption.isEmpty {
                    Text("AR notu").font(.body.weight(.semibold)).foregroundStyle(LociTheme.textPrimary)
                } else {
                    TranslatedPostText(text: post.caption, allowsControls: allowsTranslationControls, lineLimit: textLineLimit)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(LociTheme.textPrimary)
                }
            }

            HStack(spacing: LociTheme.Spacing.xl2) {
                LociMetricLabel(value: likeCount ?? post.counts.likes, title: String(localized: "beğeni"), symbol: "heart.fill", color: LociTheme.social)
                LociMetricLabel(value: viewCount ?? post.counts.views, title: String(localized: "görüntülenme"), symbol: "eye.fill", color: LociTheme.tertiaryText)
                LociMetricLabel(value: post.counts.comments, title: String(localized: "yorum"), symbol: "bubble.right.fill", color: LociTheme.secondaryText)
                Spacer()
            }
        }
        .padding(LociTheme.Spacing.l)
        .lociGlassSurface(cornerRadius: LociTheme.Radius.large)
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private var authorHeader: some View {
        // Anonymous cards never expose a profile route, even if a caller supplies one.
        if !post.isAnonymous, let authorProfile {
            NavigationLink { PublicProfileView(user: authorProfile) } label: { headerContent }
                .buttonStyle(.plain)
                .accessibilityHint(Text("Profili görüntüle"))
                .accessibilityIdentifier("post-open-profile")
        } else {
            headerContent
        }
    }

    private var headerContent: some View {
        HStack(spacing: LociTheme.Spacing.m) {
            LociAvatar(handle: post.isAnonymous ? String(localized: "Anonim") : post.creatorHandle ?? "Loci", avatarURL: post.isAnonymous ? nil : post.creatorAvatarURL, size: 36)
            VStack(alignment: .leading, spacing: LociTheme.Spacing.xxs) {
                Text(post.isAnonymous ? String(localized: "Anonim") : post.creatorHandle.map { "@\($0)" } ?? "Loci")
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                    .truncationMode(.tail)
                HStack(spacing: LociTheme.Spacing.s) {
                    Text(post.createdAt, style: .relative).font(.caption).foregroundStyle(LociTheme.secondaryText).lineLimit(1)
                    if post.isOfficialContent { OfficialContentBadge() }
                }
            }
            .layoutPriority(1)
            Spacer(minLength: 8)
            if post.isLocationNote {
                LociStatusPill(title: String(localized: "Konum notu"), symbol: "mappin.and.ellipse", color: LociTheme.accent)
                    .fixedSize(horizontal: true, vertical: true)
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("post-kind-badge")
            } else {
                LociStatusPill(
                    title: post.anchorBundle.anchor.pinQuality == .freeSpaceApproximate ? String(localized: "Yaklaşık") : "Sabit",
                    symbol: post.anchorBundle.anchor.pinQuality.isPhysicalSurface ? "viewfinder" : "exclamationmark",
                    color: post.anchorBundle.anchor.pinQuality.isPhysicalSurface ? LociTheme.accent : LociTheme.warning
                )
                .fixedSize(horizontal: true, vertical: true)
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("post-kind-badge")
            }
        }
        .contentShape(Rectangle())
    }
}

struct OfficialContentBadge: View {
    var body: some View {
        Label { Text(verbatim: "LociAR") } icon: { Image(systemName: "checkmark.seal.fill") }
            .lineLimit(1).fixedSize(horizontal: true, vertical: false)
            .font(.caption2.weight(.semibold)).foregroundStyle(LociTheme.accent)
            .padding(.horizontal, LociTheme.Spacing.s).padding(.vertical, LociTheme.Spacing.xs)
            .background(LociTheme.accent.opacity(0.12), in: Capsule())
            .accessibilityIdentifier("post-official-badge")
    }
}

struct PostActionLabel: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let title: String
    let symbol: String
    let color: Color
    /// Changing this value plays a one-shot bounce on the symbol (skipped with Reduce Motion).
    var effectValue: Bool = false

    var body: some View {
        VStack(spacing: LociTheme.Spacing.s) {
            Image(systemName: symbol).font(.headline).foregroundStyle(color)
                .symbolEffect(.bounce, value: reduceMotion ? false : effectValue)
            Text(title.localizedUI)
                .font(.caption.weight(.semibold))
                .foregroundStyle(LociTheme.textPrimary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, minHeight: 58)
        .background(LociTheme.rowSurface, in: RoundedRectangle(cornerRadius: LociTheme.Radius.medium, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: LociTheme.Radius.medium, style: .continuous).stroke(LociTheme.glassBorder))
    }
}

struct ProfileLinkRow: View {
    let title: String
    let symbol: String
    let color: Color

    var body: some View {
        Label {
            Text(title.localizedUI)
                .font(.body)
                .foregroundStyle(LociTheme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
        } icon: {
            Image(systemName: symbol)
                .foregroundStyle(color)
                .frame(width: 26)
        }
        .padding(.vertical, LociTheme.Spacing.xs)
        .frame(minHeight: LociTheme.Control.minimumTapTarget)
        .contentShape(Rectangle())
    }
}

/// The composer owns the default and snapshots the selection for its server-authoritative publish request.
struct PublishingIdentityPicker: View {
    @Binding var anonymously: Bool
    var showsExplanation = true
    var showsCard = true

    var body: some View {
        Group {
            if showsCard {
                LociCard { content }
            } else {
                content
            }
        }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: LociTheme.Spacing.s) {
            Toggle(String(localized: "Anonim paylaş"), isOn: $anonymously)
                .tint(LociTheme.accent)
                .accessibilityIdentifier("publish-anonymously")
            if showsExplanation {
                Text(anonymously
                     ? String(localized: "Adın diğer kullanıcılara görünmez.")
                     : String(localized: "Kullanıcı adın notta görünür."))
                    .font(.footnote)
                    .foregroundStyle(LociTheme.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

/// Shown to guests instead of a composer. Notes and comments need a verified Apple or email
/// account (App Store 1.2; `mayPublishAnonymously` in functions/src/anonymous.ts).
/// The app entry gate also rejects legacy guest sessions; linking preserves their data.
struct AccountRequiredView: View {
    @Environment(AppSession.self) private var session
    @State private var showAccountCreation = false

    var body: some View {
        ScrollView {
            VStack(spacing: LociTheme.Spacing.l) {
                Image(systemName: "person.crop.circle.badge.plus")
                    .font(.system(size: 52))
                    .foregroundStyle(LociTheme.accent)
                    .accessibilityHidden(true)
                Text("Paylaşmak için giriş yap")
                    .font(.title3.bold())
                    .multilineTextAlignment(.center)
                Text("Not bırakmak ve yorum yapmak için Apple veya e-posta ile devam edebilirsin.")
                    .font(.subheadline)
                    .foregroundStyle(LociTheme.secondaryText)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                Button { showAccountCreation = true } label: { Text("Giriş yap") }
                    .buttonStyle(LociPrimaryButtonStyle())
                    .accessibilityIdentifier("account-required-create")
            }
            .padding(LociTheme.Spacing.xl)
            .frame(maxWidth: .infinity)
        }
        .background(LociScreenBackground())
        .onChange(of: isGuest) { _, guest in if !guest { showAccountCreation = false } }
        .sheet(isPresented: $showAccountCreation) { AuthView() }
        .accessibilityIdentifier("screen-account-required")
    }

    private var isGuest: Bool {
        if case let .signedIn(user) = session.phase { return user.isAnonymousAccount }
        return false
    }
}
