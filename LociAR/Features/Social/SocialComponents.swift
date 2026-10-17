import AVFoundation
import SwiftUI
import SwiftData
import UIKit

struct PostCard: View {
    let post: LociPost
    var likeCount: Int? = nil
    var viewCount: Int? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if post.sponsorship != nil {
                Label("Sponsorlu", systemImage: "tag.fill").font(.caption.bold()).foregroundStyle(.orange)
            }
            HStack(spacing: 10) {
                LociAvatar(handle: post.isAnonymous ? String(localized: "Anonim") : post.creatorHandle ?? "Loci", size: 36)
                VStack(alignment: .leading, spacing: 1) {
                    Text(post.isAnonymous ? String(localized: "Anonim") : post.creatorHandle.map { "@\($0)" } ?? "Loci")
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                        .truncationMode(.tail)
                    Text(post.createdAt, style: .relative).font(.caption2).foregroundStyle(.secondary)
                }
                .layoutPriority(1)
                Spacer()
                LociStatusPill(
                    title: post.anchorBundle.anchor.pinQuality == .freeSpaceApproximate ? String(localized: "Yaklaşık") : "Sabit",
                    symbol: post.anchorBundle.anchor.pinQuality.isPhysicalSurface ? "viewfinder" : "exclamationmark",
                    color: post.anchorBundle.anchor.pinQuality.isPhysicalSurface ? LociTheme.accent : .orange
                )
            }
            if let gif = post.gif {
                AnimatedGIFView(url: gif.previewURL)
                    .aspectRatio(min(max(gif.aspectRatio, 0.6), 1.8), contentMode: .fit)
                    .frame(maxWidth: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(alignment: .bottomTrailing) {
                        Text(verbatim: "GIPHY")
                            .font(.caption2.weight(.heavy))
                            .padding(.horizontal, 6).padding(.vertical, 3)
                            .background(.black.opacity(0.55), in: Capsule())
                            .padding(6)
                    }
                    .accessibilityElement()
                    .accessibilityLabel(Text("GIF"))
                if let text = post.messageText {
                    Text(text)
                        .font(.body.weight(.semibold))
                        .lineLimit(4)
                        .foregroundStyle(.white.opacity(0.94))
                }
            } else {
                Text(post.caption.isEmpty ? String(localized: "Mekânsal post") : post.caption)
                    .font(.body.weight(.semibold))
                    .lineLimit(4)
                    .foregroundStyle(.white.opacity(0.94))
            }

            HStack(spacing: 18) {
                LociMetricLabel(value: likeCount ?? post.counts.likes, title: String(localized: "beğeni"), symbol: "heart.fill", color: .pink)
                LociMetricLabel(value: viewCount ?? post.counts.views, title: String(localized: "görüntülenme"), symbol: "eye.fill", color: LociTheme.accent)
                LociMetricLabel(value: post.counts.comments, title: String(localized: "yorum"), symbol: "bubble.right.fill", color: .white.opacity(0.8))
                Spacer()
            }
        }
        .padding(17)
        .background(LociTheme.surface.opacity(0.94), in: RoundedRectangle(cornerRadius: 21, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 21, style: .continuous).stroke(LociTheme.hairline))
        .accessibilityElement(children: .contain)
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
        VStack(spacing: 6) {
            Image(systemName: symbol).font(.headline).foregroundStyle(color)
                .symbolEffect(.bounce, value: reduceMotion ? false : effectValue)
            Text(title.localizedUI).font(.caption.weight(.semibold)).foregroundStyle(.white)
        }
        .frame(maxWidth: .infinity, minHeight: 58)
        .background(LociTheme.field, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 15, style: .continuous).stroke(LociTheme.hairline))
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
                .fixedSize(horizontal: false, vertical: true)
        } icon: {
            Image(systemName: symbol)
                .foregroundStyle(color)
                .frame(width: 26)
        }
        .padding(.vertical, 3)
    }
}

/// Shown to guests instead of a composer. Notes and comments need a verified Apple or email
/// account (App Store 1.2; `mayPublishAnonymously` in functions/src/anonymous.ts). Guests can
/// still browse, like, report and block. Linking keeps the guest's likes and settings.
struct AccountRequiredView: View {
    @Environment(AppSession.self) private var session
    @State private var showAccountCreation = false

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                Image(systemName: "person.crop.circle.badge.plus")
                    .font(.system(size: 52))
                    .foregroundStyle(LociTheme.accent)
                    .accessibilityHidden(true)
                Text("Not bırakmak için hesap gerekiyor")
                    .font(.title3.bold())
                    .multilineTextAlignment(.center)
                Text("Hesapsız kullanımda notları görebilir, beğenebilir, şikâyet edebilir ve engelleyebilirsin. Not bırakmak ve yorum yazmak için Apple ile giriş yap ya da e-postanla hesap oluştur.")
                    .font(.subheadline)
                    .foregroundStyle(LociTheme.secondaryText)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                Button { showAccountCreation = true } label: { Text("Hesap oluştur") }
                    .buttonStyle(LociPrimaryButtonStyle())
                    .accessibilityIdentifier("account-required-create")
            }
            .padding(24)
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
