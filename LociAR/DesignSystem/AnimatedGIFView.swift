@preconcurrency import ImageIO
import SwiftUI
import UIKit

/// Downloads GIF media once per URL and keeps it in memory only; GIFs are shared between the picker, the editor and cards.
actor GifDataCache {
    static let shared = GifDataCache()
    private let cache = NSCache<NSURL, NSData>()
    private var inFlight = [URL: Task<Data?, Never>]()

    init() { cache.totalCostLimit = 24 * 1_024 * 1_024 }

    func data(for url: URL) async -> Data? {
        if let cached = cache.object(forKey: url as NSURL) { return cached as Data }
        if let existing = inFlight[url] {
            return await existing.value
        }
        let task = Task<Data?, Never> {
            guard let (data, response) = try? await KlipyAPI.session.data(from: url),
                  (response as? HTTPURLResponse).map({ (200...299).contains($0.statusCode) }) == true else { return nil }
            return data
        }
        inFlight[url] = task
        let data = await task.value
        inFlight.removeValue(forKey: url)
        if let data {
            cache.setObject(data as NSData, forKey: url as NSURL, cost: data.count)
        }
        return data
    }
}

/// Plays a GIF by streaming its frames with ImageIO (`CGAnimateImageDataWithBlock`), so only the
/// current frame is decoded. Shows a neutral placeholder while loading or when the GIF fails.
struct AnimatedGIFView: View {
    private enum Source: Hashable {
        case url(URL)
        /// A post's GIF: its media is looked up first (KLIPY URLs are not derivable from the slug).
        case gif(GifReference)
    }

    private let source: Source
    var contentMode: ContentMode
    var accessibilityLabel: String?

    @State private var data: Data?
    @State private var failed = false

    init(url: URL, contentMode: ContentMode = .fit, accessibilityLabel: String? = nil) {
        self.source = .url(url)
        self.contentMode = contentMode
        self.accessibilityLabel = accessibilityLabel
    }

    init(gif: GifReference, contentMode: ContentMode = .fit, accessibilityLabel: String? = nil) {
        self.source = .gif(gif)
        self.contentMode = contentMode
        self.accessibilityLabel = accessibilityLabel
    }

    var body: some View {
        ZStack {
            // Placeholder follows the theme so it stays visible in light mode too.
            Rectangle().fill(LociTheme.elevated)
            if let data {
                AnimatedGIFRepresentable(data: data, contentMode: contentMode)
            } else if failed {
                Image(systemName: "photo")
                    .font(.title3)
                    .foregroundStyle(LociTheme.tertiaryText)
            } else {
                ProgressView().tint(LociTheme.secondaryText)
            }
        }
        .clipped()
        .task(id: source) {
            data = nil
            failed = false
            let url: URL?
            switch source {
            case .url(let direct): url = direct
            case .gif(let gif): url = await KlipyMediaResolver.shared.media(for: gif)?.previewURL
            }
            guard !Task.isCancelled else { return }
            var loaded: Data?
            if let url { loaded = await GifDataCache.shared.data(for: url) }
            guard !Task.isCancelled else { return }
            data = loaded
            failed = loaded == nil
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(accessibilityLabel ?? String(localized: "GIF animasyonu")))
    }
}

private struct AnimatedGIFRepresentable: UIViewRepresentable {
    let data: Data
    let contentMode: ContentMode

    func makeUIView(context: Context) -> AnimatedGIFUIView {
        let view = AnimatedGIFUIView(frame: .zero)
        view.clipsToBounds = true
        return view
    }

    func updateUIView(_ view: AnimatedGIFUIView, context: Context) {
        view.contentMode = contentMode == .fit ? .scaleAspectFit : .scaleAspectFill
        view.play(data)
    }

    static func dismantleUIView(_ view: AnimatedGIFUIView, coordinator: ()) {
        view.stop()
    }
}

final class AnimatedGIFUIView: UIImageView {
    /// The GIF this view shows; kept while off screen so it can resume when shown again.
    private var source: Data?
    private var playing: Data?
    private var generation = 0

    override init(frame: CGRect) {
        super.init(frame: frame)
        setContentHuggingPriority(.defaultLow, for: .horizontal)
        setContentHuggingPriority(.defaultLow, for: .vertical)
        setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        setContentCompressionResistancePriority(.defaultLow, for: .vertical)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    func play(_ data: Data) {
        source = data
        guard data != playing, window != nil else { return }
        stop()
        playing = data
        let current = generation
        // ImageIO calls the block on the main queue; it stops when this view starts another GIF or goes away.
        CGAnimateImageDataWithBlock(data as CFData, nil) { [weak self] _, image, stop in
            MainActor.assumeIsolated {
                guard let self, self.generation == current else {
                    stop.pointee = true
                    return
                }
                self.image = UIImage(cgImage: image)
            }
        }
    }

    func stop() {
        generation += 1
        playing = nil
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window == nil { stop() } else if let source { play(source) }
    }
}
