@preconcurrency import CoreGraphics
@preconcurrency import CoreText
import Foundation
@preconcurrency import ImageIO
@preconcurrency import UIKit

actor SpatialContentRenderer {

    private var assetDataCache: [URL: Data] = [:]
    private var renderedPostCache: [String: CGImage] = [:]
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
        let key = postCacheKey(post)
        if let cached = renderedPostCache[key] {
            return cached
        }
        let assets = await loadAssets(post.editData)
        let sourceImageData: Data?
        if case .image(let url)? = post.contentSource {
            sourceImageData = await loadAsset(url)
        } else {
            sourceImageData = nil
        }
        let image = await Task.detached(priority: .userInitiated) {
            Self.drawPost(post, assets: assets, sourceImageData: sourceImageData)
        }.value
        if let image {
            recordRenderedImage(image, forKey: key)
        }
        return image
    }

    func handleMemoryPressure() {
        renderedPostCache.removeAll()
        renderedCacheOrder.removeAll()
        assetDataCache.removeAll()
    }

    private func postCacheKey(_ post: LociPost) -> String {
        "\(post.id.uuidString)_\(post.hashValue)"
    }

    private func recordRenderedImage(_ image: CGImage, forKey key: String) {
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
        let textOnly = !hasImage && !hasDrawing && {
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
    ) -> CGImage? {
        let orderedImageData = post.editData.layers.compactMap { layer in
            layer.kind == .image ? assets[layer.id] : nil
        }
        if let primaryImageData = orderedImageData.first ?? sourceImageData,
           let primaryImage = decodedImage(primaryImageData) {
            return drawImagePost(primaryImage, caption: post.caption)
        }

        let layerText = post.editData.layers
            .filter { $0.kind == .text }
            .compactMap(\.text)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first(where: { !$0.isEmpty })
        let cleanCaption = post.caption.trimmingCharacters(in: .whitespacesAndNewlines)
        if !cleanCaption.isEmpty {
            return drawTextPost(cleanCaption)
        } else if let layerText {
            return drawTextPost(layerText)
        }

        return trimmedToVisibleContent(draw(post.editData, assets: assets))
    }

    nonisolated private static func drawTextPost(_ text: String) -> CGImage? {
        let count = text.count
        let fontSize: CGFloat = count <= 42 ? 52 : count <= 105 ? 43 : 36
        let maxTextWidth: CGFloat = 640
        let attributes: [CFString: Any] = [
            kCTFontAttributeName: CTFontCreateWithName("HelveticaNeue-Bold" as CFString, fontSize, nil),
            kCTForegroundColorAttributeName: CGColor(gray: 1, alpha: 1)
        ]
        guard let attributed = CFAttributedStringCreate(nil, text as CFString, attributes as CFDictionary) else { return nil }
        let framesetter = CTFramesetterCreateWithAttributedString(attributed)
        let fit = CTFramesetterSuggestFrameSizeWithConstraints(
            framesetter,
            CFRange(location: 0, length: 0),
            nil,
            CGSize(width: maxTextWidth, height: CGFloat.greatestFiniteMagnitude),
            nil
        )
        let padX: CGFloat = 10
        let padY: CGFloat = 6
        let width = max(24, Int(ceil(min(maxTextWidth, fit.width) + padX * 2)))
        let height = max(24, Int(ceil(fit.height + padY * 2)))
        guard let context = makeContext(width: width, height: height) else { return nil }
        let textRect = CGRect(x: padX, y: padY, width: CGFloat(width) - padX * 2, height: CGFloat(height) - padY * 2)
        context.setShadow(offset: CGSize(width: 0, height: -1), blur: 5, color: CGColor(gray: 0, alpha: 0.72))
        drawText(text, in: textRect, fontSize: fontSize, color: CGColor(gray: 1, alpha: 1), context: context)
        return context.makeImage()
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
        context: CGContext
    ) {
        let attributes: [CFString: Any] = [
            kCTFontAttributeName: CTFontCreateWithName("HelveticaNeue-Bold" as CFString, fontSize, nil),
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
