@preconcurrency import CoreGraphics
@preconcurrency import CoreText
import Foundation
@preconcurrency import ImageIO
@preconcurrency import UIKit

/// A post texture plus, for GIF posts, where the GIF sits in it (normalized, top-left origin) so
/// the AR view can lay the looping GIPHY video over that area.
struct RenderedPost: @unchecked Sendable {
    let image: CGImage
    let gifRect: CGRect?
}

actor SpatialContentRenderer {

    private var assetDataCache: [URL: Data] = [:]
    private var renderedPostCache: [String: RenderedPost] = [:]
    private var renderedCacheOrder: [String] = []
    private static let maximumRenderCacheCount = 30
    private static let maximumAssetCacheCount = 40

    func render(_ editData: EditData) async -> CGImage? {
        let assets = await loadAssets(editData)
        return await Task.detached(priority: .userInitiated) {
            Self.draw(editData, assets: assets)
        }.value
    }

    func render(_ post: LociPost) async -> CGImage? {
        await renderPost(post)?.image
    }

    func renderPost(_ post: LociPost) async -> RenderedPost? {
        let key = postCacheKey(post)
        if let cached = renderedPostCache[key] {
            return cached
        }
        let assets = await loadAssets(post.editData)
        let sourceImageData: Data?
        if case .image(let url)? = post.contentSource {
            sourceImageData = await loadAsset(url)
        } else if let gif = post.gif {
            // Poster frame under the AR video (and the whole GIF area if the video cannot play).
            sourceImageData = await loadAsset(gif.stillURL)
        } else {
            sourceImageData = nil
        }
        let rendered = await Task.detached(priority: .userInitiated) {
            Self.drawPost(post, assets: assets, sourceImageData: sourceImageData)
        }.value
        if let rendered {
            recordRenderedImage(rendered, forKey: key)
        }
        return rendered
    }

    func handleMemoryPressure() {
        renderedPostCache.removeAll()
        renderedCacheOrder.removeAll()
        assetDataCache.removeAll()
    }

    private func postCacheKey(_ post: LociPost) -> String {
        "\(post.id.uuidString)_\(post.hashValue)"
    }

    private func recordRenderedImage(_ image: RenderedPost, forKey key: String) {
        if renderedCacheOrder.count >= Self.maximumRenderCacheCount {
            let oldest = renderedCacheOrder.removeFirst()
            renderedPostCache.removeValue(forKey: oldest)
        }
        renderedPostCache[key] = image
        renderedCacheOrder.append(key)
    }

    nonisolated static func physicalSize(for post: LociPost, renderedPixelSize: CGSize? = nil) -> PhysicalRectMeters {
        let stored = post.anchorBundle.anchor.physicalRectMeters
        let maximumWidth = min(max(stored?.width ?? PhysicalRectMeters.default.width, PhysicalRectMeters.minimum.width), PhysicalRectMeters.default.width)
        let maximumHeight = min(max(stored?.height ?? PhysicalRectMeters.default.height, PhysicalRectMeters.minimum.height), PhysicalRectMeters.default.height)
        let hasImage = post.editData.layers.contains(where: { $0.kind == .image }) || {
            if case .image? = post.contentSource { return true }
            return false
        }()
        let hasDrawing = post.editData.layers.contains(where: { $0.kind == .drawing })
        let textOnly = !hasImage && !hasDrawing && post.gif == nil && {
            if case .video? = post.contentSource { return false }
            return true
        }()

        let fallbackWidth = max(1, post.editData.canvasWidth)
        let fallbackHeight = max(1, post.editData.canvasHeight)
        let pixelWidth = max(1, renderedPixelSize?.width ?? CGFloat(fallbackWidth))
        let pixelHeight = max(1, renderedPixelSize?.height ?? CGFloat(fallbackHeight))
        let aspect = min(max(Float(pixelWidth / pixelHeight), 0.2), 8.0)

        if textOnly {
            var width = Float(pixelWidth) * PhysicalRectMeters.metersPerPixel
            var height = Float(pixelHeight) * PhysicalRectMeters.metersPerPixel
            if height < PhysicalRectMeters.textMinimumHeight {
                let scale = PhysicalRectMeters.textMinimumHeight / height
                width *= scale
                height = PhysicalRectMeters.textMinimumHeight
            }
            width = min(width, PhysicalRectMeters.textMaximum.width)
            height = min(height, PhysicalRectMeters.textMaximum.height)
            return PhysicalRectMeters(width: width, height: height)
        }

        var width = maximumWidth
        var height = width / aspect
        if height > maximumHeight {
            height = maximumHeight
            width = height * aspect
        }
        return PhysicalRectMeters(width: width, height: height)
    }

    private func loadAssets(_ editData: EditData) async -> [UUID: Data] {
        let imageLayers = editData.layers.filter { $0.kind == .image && $0.assetURL != nil }
        guard !imageLayers.isEmpty else { return [:] }
        return await withTaskGroup(of: (UUID, Data?).self) { group in
            for layer in imageLayers {
                guard let url = layer.assetURL else { continue }
                group.addTask {
                    let data = await self.loadAsset(url)
                    return (layer.id, data)
                }
            }
            var assets: [UUID: Data] = [:]
            for await (id, data) in group {
                if let data { assets[id] = data }
            }
            return assets
        }
    }

    private func loadAsset(_ url: URL) async -> Data? {
        if let cached = assetDataCache[url] { return cached }
        let data: Data?
        if url.isFileURL {
            data = try? Data(contentsOf: url)
        } else if let (networkData, response) = try? await URLSession.shared.data(from: url),
                  (response as? HTTPURLResponse).map({ (200...299).contains($0.statusCode) }) == true {
            data = networkData
        } else {
            data = nil
        }
        if let data {
            if assetDataCache.count >= Self.maximumAssetCacheCount {
                assetDataCache.remove(at: assetDataCache.startIndex)
            }
            assetDataCache[url] = data
        }
        return data
    }

    nonisolated private static func drawPost(
        _ post: LociPost,
        assets: [UUID: Data],
        sourceImageData: Data?
    ) -> RenderedPost? {
        if let gif = post.gif {
            return drawMessageBubble(
                text: post.messageText, handle: post.creatorHandle, gif: gif,
                gifStill: sourceImageData.flatMap(decodedImage)
            )
        }
        // Legacy posts: photos (removed 29 Sep 2026) and drawings (removed 9 Oct 2026) keep their look.
        let orderedImageData = post.editData.layers.compactMap { layer in
            layer.kind == .image ? assets[layer.id] : nil
        }
        if let primaryImageData = orderedImageData.first ?? sourceImageData,
           let primaryImage = decodedImage(primaryImageData) {
            return drawImagePost(primaryImage, caption: post.caption).map { RenderedPost(image: $0, gifRect: nil) }
        }
        if post.editData.layers.contains(where: { $0.kind == .drawing }) {
            return trimmedToVisibleContent(draw(post.editData, assets: assets)).map { RenderedPost(image: $0, gifRect: nil) }
        }

        let cleanCaption = post.caption.trimmingCharacters(in: .whitespacesAndNewlines)
        if let text = post.messageText ?? (cleanCaption.isEmpty ? nil : cleanCaption) {
            return drawMessageBubble(text: text, handle: post.creatorHandle, gif: nil, gifStill: nil)
        }
        return trimmedToVisibleContent(draw(post.editData, assets: assets)).map { RenderedPost(image: $0, gifRect: nil) }
    }

    /// A chat-style message bubble: the author's handle, then the GIF (if any), then the text.
    /// Returns the GIF area so the AR view can play the GIPHY video over it.
    nonisolated static func drawMessageBubble(text: String?, handle: String?, gif: GifReference?, gifStill: CGImage?) -> RenderedPost? {
        let text = text?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
        let handle = handle?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty.map { "@\($0)" }
        guard text != nil || gif != nil else { return nil }
        let padding: CGFloat = 18
        let gap: CGFloat = 8
        let gifWidth: CGFloat = 560
        let maxTextWidth: CGFloat = gif != nil ? gifWidth : 640
        let fontSize: CGFloat = (text?.count ?? 0) <= 42 ? 46 : (text?.count ?? 0) <= 105 ? 40 : 34
        let textColor = CGColor(gray: 1, alpha: 1)
        let handleColor = CGColor(red: 0.55, green: 0.95, blue: 0.82, alpha: 1)
        let textFrame = text.map { measure($0, fontSize: fontSize, weight: "HelveticaNeue-Medium", maxWidth: maxTextWidth) } ?? .zero
        let handleFrame = handle.map { measure($0, fontSize: 24, weight: "HelveticaNeue-Bold", maxWidth: maxTextWidth) } ?? .zero
        let gifHeight: CGFloat = gif.map { gifWidth / CGFloat(min(max($0.aspectRatio, 0.6), 1.8)) } ?? 0

        let contentWidth = gif != nil ? gifWidth : min(maxTextWidth, max(textFrame.width, handleFrame.width))
        let sections: [CGFloat] = [handleFrame.height, gifHeight, textFrame.height].filter { $0 > 0 }
        let contentHeight = sections.reduce(0, +) + gap * CGFloat(max(0, sections.count - 1))
        let width = Int(ceil(contentWidth + padding * 2))
        let height = Int(ceil(contentHeight + padding * 2))
        guard let context = makeContext(width: width, height: height) else { return nil }

        let bounds = CGRect(x: 0, y: 0, width: width, height: height)
        let bubble = CGPath(roundedRect: bounds, cornerWidth: 30, cornerHeight: 30, transform: nil)
        context.addPath(bubble)
        context.setFillColor(CGColor(red: 0.0, green: 0.30, blue: 0.25, alpha: 0.94))
        context.fillPath()

        // CoreGraphics draws bottom-up: walk down from the top edge.
        var top = CGFloat(height) - padding
        if let handle {
            top -= handleFrame.height
            drawText(handle, in: CGRect(x: padding, y: top, width: contentWidth, height: handleFrame.height), fontSize: 24, color: handleColor, context: context, fontName: "HelveticaNeue-Bold")
            top -= gap
        }
        var gifRect: CGRect?
        if gif != nil {
            top -= gifHeight
            let area = CGRect(x: padding, y: top, width: gifWidth, height: gifHeight)
            context.saveGState()
            context.addPath(CGPath(roundedRect: area, cornerWidth: 18, cornerHeight: 18, transform: nil))
            context.clip()
            context.setFillColor(CGColor(gray: 0.08, alpha: 1))
            context.fill(area)
            if let gifStill { context.draw(gifStill, in: aspectFill(image: gifStill, rect: area)) }
            context.restoreGState()
            gifRect = CGRect(
                x: area.minX / CGFloat(width), y: (CGFloat(height) - area.maxY) / CGFloat(height),
                width: area.width / CGFloat(width), height: area.height / CGFloat(height)
            )
            top -= gap
        }
        if let text {
            top -= textFrame.height
            drawText(text, in: CGRect(x: padding, y: top, width: contentWidth, height: textFrame.height), fontSize: fontSize, color: textColor, context: context, fontName: "HelveticaNeue-Medium")
        }
        return context.makeImage().map { RenderedPost(image: $0, gifRect: gifRect) }
    }

    nonisolated private static func measure(_ text: String, fontSize: CGFloat, weight: String, maxWidth: CGFloat) -> CGSize {
        let attributes: [CFString: Any] = [kCTFontAttributeName: CTFontCreateWithName(weight as CFString, fontSize, nil)]
        guard let attributed = CFAttributedStringCreate(nil, text as CFString, attributes as CFDictionary) else { return .zero }
        let fit = CTFramesetterSuggestFrameSizeWithConstraints(
            CTFramesetterCreateWithAttributedString(attributed), CFRange(location: 0, length: 0), nil,
            CGSize(width: maxWidth, height: .greatestFiniteMagnitude), nil
        )
        return CGSize(width: ceil(min(maxWidth, fit.width)), height: ceil(fit.height))
    }

    nonisolated private static func drawImagePost(_ image: CGImage, caption: String) -> CGImage? {
        let longestSide = max(image.width, image.height)
        let shortestSide = max(1, min(image.width, image.height))
        let upperScale = 1_024 / CGFloat(max(1, longestSide))
        let lowerScale = 320 / CGFloat(shortestSide)
        let scale = min(upperScale, max(1, lowerScale))
        let width = max(1, Int((CGFloat(image.width) * scale).rounded()))
        let height = max(1, Int((CGFloat(image.height) * scale).rounded()))
        guard let context = makeContext(width: width, height: height) else { return nil }
        let bounds = CGRect(x: 0, y: 0, width: width, height: height)
        context.draw(image, in: aspectFill(image: image, rect: bounds))

        let cleanCaption = caption.trimmingCharacters(in: .whitespacesAndNewlines)
        if !cleanCaption.isEmpty {
            let panelHeight = min(CGFloat(height) * 0.26, 180)
            let panel = CGRect(x: 0, y: 0, width: CGFloat(width), height: panelHeight)
            context.setFillColor(CGColor(red: 0.025, green: 0.16, blue: 0.17, alpha: 0.82))
            context.fill(panel)
            drawText(
                cleanCaption,
                in: panel.insetBy(dx: 22, dy: 16),
                fontSize: min(40, CGFloat(width) * 0.048),
                color: CGColor(gray: 1, alpha: 1),
                context: context
            )
        }
        return context.makeImage()
    }

    nonisolated private static func makeContext(width: Int, height: Int) -> CGContext? {
        guard let context = CGContext(
            data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return nil }
        context.clear(CGRect(x: 0, y: 0, width: width, height: height))
        return context
    }

    nonisolated private static func decodedImage(_ data: Data) -> CGImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        return CGImageSourceCreateThumbnailAtIndex(source, 0, [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: 1_024
        ] as CFDictionary)
    }

    nonisolated private static func draw(
        _ editData: EditData,
        assets: [UUID: Data],
        caption: String? = nil
    ) -> CGImage? {
        let width = max(1, Int(editData.canvasWidth))
        let height = max(1, Int(editData.canvasHeight))
        guard let context = CGContext(
            data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return nil }
        context.clear(CGRect(x: 0, y: 0, width: width, height: height))

        for layer in editData.layers {
            context.saveGState()
            context.setAlpha(layer.opacity)
            switch layer.kind {
            case .drawing:
                let pairs = Self.drawingPoints(layer.points, width: width, height: height)
                if let first = pairs.first {
                    context.beginPath(); context.move(to: first)
                    for point in pairs.dropFirst() { context.addLine(to: point) }
                    context.setStrokeColor(color(layer.colorHex)); context.setLineWidth(12); context.setLineCap(.round); context.strokePath()
                }
            case .text:
                if let text = layer.text, !text.isEmpty {
                    drawText(
                        text, in: CGRect(x: 70, y: CGFloat(height) * 0.24, width: CGFloat(width) - 140, height: CGFloat(height) * 0.58),
                        fontSize: 74, color: color(layer.colorHex), context: context
                    )
                }
            case .image:
                if let data = assets[layer.id] as CFData?, let source = CGImageSourceCreateWithData(data, nil),
                   let image = CGImageSourceCreateImageAtIndex(source, 0, nil) {
                    context.draw(image, in: aspectFit(image: image, rect: CGRect(x: 0, y: 0, width: width, height: height)))
                }
            case .gif:
                break // Drawn by drawMessageBubble.
            }
            context.restoreGState()
        }

        if editData.layers.contains(where: { $0.kind == .image }), let caption, !caption.isEmpty {
            let panel = CGRect(x: 32, y: 32, width: CGFloat(width) - 64, height: CGFloat(height) * 0.28)
            context.setFillColor(CGColor(gray: 0.02, alpha: 0.84))
            context.fill(panel)
            drawText(caption, in: panel.insetBy(dx: 34, dy: 28), fontSize: 54, color: CGColor(gray: 1, alpha: 1), context: context)
        }
        return context.makeImage()
    }

    nonisolated private static func drawText(
        _ text: String,
        in rect: CGRect,
        fontSize: CGFloat,
        color: CGColor,
        context: CGContext,
        fontName: String = "HelveticaNeue-Bold"
    ) {
        let attributes: [CFString: Any] = [
            kCTFontAttributeName: CTFontCreateWithName(fontName as CFString, fontSize, nil),
            kCTForegroundColorAttributeName: color
        ]
        guard let attributed = CFAttributedStringCreate(nil, text as CFString, attributes as CFDictionary) else { return }
        let framesetter = CTFramesetterCreateWithAttributedString(attributed)
        let path = CGPath(rect: rect, transform: nil)
        let frame = CTFramesetterCreateFrame(framesetter, CFRange(location: 0, length: 0), path, nil)
        CTFrameDraw(frame, context)
    }

    nonisolated private static func aspectFit(image: CGImage, rect: CGRect) -> CGRect {
        let scale = min(rect.width / CGFloat(image.width), rect.height / CGFloat(image.height))
        let size = CGSize(width: CGFloat(image.width) * scale, height: CGFloat(image.height) * scale)
        return CGRect(x: rect.midX - size.width / 2, y: rect.midY - size.height / 2, width: size.width, height: size.height)
    }

    nonisolated private static func aspectFill(image: CGImage, rect: CGRect) -> CGRect {
        let scale = max(rect.width / CGFloat(image.width), rect.height / CGFloat(image.height))
        let size = CGSize(width: CGFloat(image.width) * scale, height: CGFloat(image.height) * scale)
        return CGRect(x: rect.midX - size.width / 2, y: rect.midY - size.height / 2, width: size.width, height: size.height)
    }

    nonisolated private static func trimmedToVisibleContent(_ image: CGImage?) -> CGImage? {
        guard let image, let provider = image.dataProvider, let data = provider.data, let pointer = CFDataGetBytePtr(data) else { return image }
        let width = image.width
        let height = image.height
        let bytesPerRow = image.bytesPerRow
        let bytesPerPixel = max(1, image.bitsPerPixel / 8)
        let alphaOffset: Int
        switch image.alphaInfo {
        case .premultipliedLast, .last: alphaOffset = min(3, bytesPerPixel - 1)
        case .premultipliedFirst, .first: alphaOffset = 0
        default: return image
        }
        var minX = width
        var minY = height
        var maxX = 0
        var maxY = 0
        for y in 0..<height {
            for x in 0..<width {
                if pointer[y * bytesPerRow + x * bytesPerPixel + alphaOffset] > 16 {
                    minX = min(minX, x)
                    maxX = max(maxX, x)
                    minY = min(minY, y)
                    maxY = max(maxY, y)
                }
            }
        }
        guard maxX >= minX, maxY >= minY else { return image }
        let padding = 6
        let crop = CGRect(
            x: max(0, minX - padding),
            y: max(0, minY - padding),
            width: min(width, maxX + padding + 1) - max(0, minX - padding),
            height: min(height, maxY + padding + 1) - max(0, minY - padding)
        )
        return image.cropping(to: crop) ?? image
    }

    nonisolated static func drawingPoints(_ values: [Float], width: Int, height: Int) -> [CGPoint] {
        let usable = values.prefix(values.count - values.count % 2)
        let normalized = usable.allSatisfy { $0 >= 0 && $0 <= 1 }
        return stride(from: 0, to: usable.count, by: 2).map { index in
            let x = CGFloat(usable[usable.index(usable.startIndex, offsetBy: index)])
            let y = CGFloat(usable[usable.index(usable.startIndex, offsetBy: index + 1)])
            return CGPoint(
                x: normalized ? x * CGFloat(width) : x,
                y: CGFloat(height) - (normalized ? y * CGFloat(height) : y)
            )
        }
    }

    nonisolated private static func color(_ hex: String) -> CGColor {
        let clean = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        guard clean.count == 6, let value = UInt64(clean, radix: 16) else { return CGColor(gray: 1, alpha: 1) }
        return CGColor(red: CGFloat((value >> 16) & 0xff) / 255, green: CGFloat((value >> 8) & 0xff) / 255, blue: CGFloat(value & 0xff) / 255, alpha: 1)
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
