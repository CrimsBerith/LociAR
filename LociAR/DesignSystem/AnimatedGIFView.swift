@preconcurrency import ImageIO
import SwiftUI
import UIKit

/// Downloads GIPHY media once per URL; GIFs are shared between the picker, the editor and cards.
actor GifDataCache {
    static let shared = GifDataCache()
    private let cache = NSCache<NSURL, NSData>()

    init() { cache.totalCostLimit = 24 * 1_024 * 1_024 }

    func data(for url: URL) async -> Data? {
        if let cached = cache.object(forKey: url as NSURL) { return cached as Data }
        guard let (data, response) = try? await URLSession.shared.data(from: url),
              (response as? HTTPURLResponse).map({ (200...299).contains($0.statusCode) }) == true else { return nil }
        cache.setObject(data as NSData, forKey: url as NSURL, cost: data.count)
        return data
    }
}

/// Plays a GIF by streaming its frames with ImageIO (`CGAnimateImageDataWithBlock`), so only the
/// current frame is decoded. Shows a neutral placeholder while loading or when the GIF fails.
struct AnimatedGIFView: View {
    let url: URL
    var contentMode: ContentMode = .fit

    @State private var data: Data?

    var body: some View {
        ZStack {
            Rectangle().fill(Color.white.opacity(0.06))
            if let data {
                AnimatedGIFRepresentable(data: data, contentMode: contentMode)
            } else {
                ProgressView().tint(.white.opacity(0.6))
            }
        }
        .clipped()
        .task(id: url) { data = await GifDataCache.shared.data(for: url) }
        .accessibilityHidden(true)
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
