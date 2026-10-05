import AVFoundation
import SwiftUI
import SwiftData

struct PostCard: View {
    let post: LociPost
    var likeCount: Int? = nil
    var viewCount: Int? = nil
    var openMedia: (() -> Void)? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                LociAvatar(handle: post.creatorHandle ?? "Loci", size: 36)
                VStack(alignment: .leading, spacing: 1) {
                    Text(post.creatorHandle.map { "@\($0)" } ?? "Loci")
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                        .truncationMode(.tail)
                    Text(post.createdAt, style: .relative).font(.caption2).foregroundStyle(.secondary)
                }
                .layoutPriority(1)
                Spacer()
                LociStatusPill(
                    title: post.anchorBundle.anchor.pinQuality == .freeSpaceApproximate ? "Yaklaşık" : "Sabit",
                    symbol: post.anchorBundle.anchor.pinQuality.isPhysicalSurface ? "viewfinder" : "exclamationmark",
                    color: post.anchorBundle.anchor.pinQuality.isPhysicalSurface ? LociTheme.accent : .orange
                )
            }
            Text(post.caption.isEmpty ? "Mekânsal post".localizedUI : post.caption)
                .font(.body.weight(.semibold))
                .lineLimit(4)
                .foregroundStyle(.white.opacity(0.94))

            PostMediaHero(post: post, openMedia: openMedia)

            HStack(spacing: 18) {
                LociMetricLabel(value: likeCount ?? post.counts.likes, title: "beğeni", symbol: "heart.fill", color: .pink)
                LociMetricLabel(value: viewCount ?? post.counts.views, title: "görüntülenme", symbol: "eye.fill", color: LociTheme.accent)
                LociMetricLabel(value: post.counts.comments, title: "yorum", symbol: "bubble.right.fill", color: .white.opacity(0.8))
                Spacer()
            }
        }
        .padding(17)
        .background(LociTheme.surface.opacity(0.94), in: RoundedRectangle(cornerRadius: 21, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 21, style: .continuous).stroke(LociTheme.hairline))
        .accessibilityElement(children: .contain)
    }

}

struct PostMediaHero: View {
    let post: LociPost
    var openMedia: (() -> Void)? = nil

    @ViewBuilder var body: some View {
        if let external = post.contentSource?.externalMedia {
            if let openMedia {
                Button(action: openMedia) {
                    externalMediaBanner(external: external)
                }
                .buttonStyle(.plain)
            } else {
                externalMediaBanner(external: external)
            }
        }
    }

    private func externalMediaBanner(external: (platform: ExternalMediaPlatform, url: URL)) -> some View {
        HStack(spacing: 14) {
            BrandLogoView(platform: external.platform, size: 42)
            VStack(alignment: .leading, spacing: 3) {
                Text(external.platform.rawValue).font(.headline)
                Text("Paylaşımı görüntüle").font(.caption).foregroundStyle(.white.opacity(0.66))
            }
            Spacer()
            Image(systemName: "arrow.up.right").font(.subheadline.weight(.bold))
        }
        .foregroundStyle(.white)
        .padding(15)
        .background(
            LinearGradient(
                colors: [external.platform.brandColor.opacity(0.34), external.platform.brandColor.opacity(0.10)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 16, style: .continuous)
        )
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(external.platform.brandColor.opacity(0.28)))
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
