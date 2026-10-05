@preconcurrency import CoreGraphics
@preconcurrency import CoreText
import Foundation
@preconcurrency import ImageIO
@preconcurrency import UIKit

actor SpatialContentRenderer {
    nonisolated static let externalPreviewCardPixelSize = CGSize(width: 900, height: 620)
    nonisolated static let externalPreviewTitleFontSize: CGFloat = 46
    nonisolated static let externalCaptionFontSize: CGFloat = 26

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
        let textOnly = !hasImage && !hasDrawing && post.contentSource?.externalMedia == nil && {
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

        if post.contentSource?.externalMedia != nil {
            var width = maximumWidth
            var height = width / aspect
            if height > PhysicalRectMeters.externalMaximumHeight {
                height = PhysicalRectMeters.externalMaximumHeight
                width = height * aspect
            }
            return PhysicalRectMeters(width: min(width, maximumWidth), height: min(height, PhysicalRectMeters.externalMaximumHeight))
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
        if let external = post.contentSource?.externalMedia {
            return drawExternalPost(platform: external.platform, url: external.url, caption: post.caption)
        }

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

    nonisolated private static func drawExternalPost(
        platform: ExternalMediaPlatform,
        url: URL,
        caption: String
    ) -> CGImage? {
        let width = Int(externalPreviewCardPixelSize.width)
        let height = Int(externalPreviewCardPixelSize.height)
        guard let context = makeContext(width: width, height: height) else { return nil }
        let bounds = CGRect(x: 8, y: 8, width: width - 16, height: height - 16)
        drawRoundedPanel(in: bounds, context: context)
        context.saveGState()
        context.addPath(CGPath(roundedRect: bounds, cornerWidth: 54, cornerHeight: 54, transform: nil))
        context.clip()
        drawExternalCard(platform: platform, url: url, caption: caption, context: context, width: width, height: height)
        context.restoreGState()
        context.setStrokeColor(CGColor(red: 0.22, green: 0.88, blue: 0.72, alpha: 0.66))
        context.setLineWidth(7)
        context.addPath(CGPath(roundedRect: bounds, cornerWidth: 54, cornerHeight: 54, transform: nil))
        context.strokePath()
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

    nonisolated private static func drawRoundedPanel(in rect: CGRect, context: CGContext) {
        context.saveGState()
        let path = CGPath(roundedRect: rect, cornerWidth: 54, cornerHeight: 54, transform: nil)
        context.addPath(path)
        context.clip()
        let colors = [
            CGColor(red: 0.055, green: 0.23, blue: 0.23, alpha: 0.94),
            CGColor(red: 0.055, green: 0.10, blue: 0.16, alpha: 0.94)
        ] as CFArray
        if let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1]) {
            context.drawLinearGradient(gradient, start: CGPoint(x: rect.minX, y: rect.maxY), end: CGPoint(x: rect.maxX, y: rect.minY), options: [])
        }
        context.restoreGState()
        context.setStrokeColor(CGColor(red: 0.22, green: 0.88, blue: 0.72, alpha: 0.66))
        context.setLineWidth(7)
        context.addPath(path)
        context.strokePath()
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
        caption: String? = nil,
        externalPlatform: ExternalMediaPlatform? = nil
    ) -> CGImage? {
        let width = max(1, Int(editData.canvasWidth))
        let height = max(1, Int(editData.canvasHeight))
        guard let context = CGContext(
            data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return nil }
        context.clear(CGRect(x: 0, y: 0, width: width, height: height))

        if let externalPlatform {
            drawExternalCard(platform: externalPlatform, url: nil, caption: caption ?? "", context: context, width: width, height: height)
            return context.makeImage()
        }

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

    nonisolated private static func drawExternalCard(
        platform: ExternalMediaPlatform,
        url: URL?,
        caption: String,
        context: CGContext,
        width: Int,
        height: Int
    ) {
        let accent: CGColor
        switch platform {
        case .spotify: accent = CGColor(red: 30 / 255, green: 215 / 255, blue: 96 / 255, alpha: 1)
        case .youtube: accent = CGColor(red: 1, green: 0, blue: 51 / 255, alpha: 1)
        case .facebook: accent = CGColor(red: 8 / 255, green: 102 / 255, blue: 1, alpha: 1)
        case .instagram: accent = CGColor(red: 0.79, green: 0.16, blue: 0.48, alpha: 1)
        case .x: accent = CGColor(gray: 0.92, alpha: 1)
        }
        let canvasWidth = CGFloat(width)
        let canvasHeight = CGFloat(height)
        let header = CGRect(x: 0, y: canvasHeight * 0.76, width: canvasWidth, height: canvasHeight * 0.24)
        context.setFillColor(accent)
        context.fill(header)
        let headerColor = platform == .x ? CGColor(gray: 0.04, alpha: 1) : CGColor(gray: 1, alpha: 1)
        let logoRect = CGRect(x: 58, y: canvasHeight * 0.805, width: 82, height: 82)
        drawBrandLogo(platform, in: logoRect, forHeader: true, context: context)
        drawText(platform.rawValue, in: CGRect(x: 164, y: canvasHeight * 0.79, width: canvasWidth - 222, height: canvasHeight * 0.14), fontSize: 54, color: headerColor, context: context)

        let previewRect = CGRect(x: 48, y: 164, width: canvasWidth - 96, height: canvasHeight * 0.47)
        context.setFillColor(CGColor(red: 0.025, green: 0.045, blue: 0.07, alpha: 0.92))
        context.addPath(CGPath(roundedRect: previewRect, cornerWidth: 34, cornerHeight: 34, transform: nil))
        context.fillPath()
        context.setStrokeColor(accent.copy(alpha: 0.55) ?? accent)
        context.setLineWidth(4)
        context.addPath(CGPath(roundedRect: previewRect, cornerWidth: 34, cornerHeight: 34, transform: nil))
        context.strokePath()

        let previewLogo = CGRect(x: 82, y: previewRect.midY - 66, width: 132, height: 132)
        drawBrandLogo(platform, in: previewLogo, forHeader: false, context: context)
        drawText(
            externalPreviewTitle(platform: platform, url: url),
            in: CGRect(x: 250, y: previewRect.midY + 8, width: previewRect.maxX - 286, height: 72),
            fontSize: externalPreviewTitleFontSize,
            color: CGColor(gray: 1, alpha: 1),
            context: context
        )
        drawText(
            externalPreviewIdentifier(url),
            in: CGRect(x: 250, y: previewRect.midY - 60, width: previewRect.maxX - 286, height: 54),
            fontSize: 27,
            color: CGColor(gray: 0.72, alpha: 1),
            context: context
        )
        drawText(
            "Gönderi önizlemesi · Detaydan aç".localizedUI,
            in: CGRect(x: 82, y: previewRect.minY + 24, width: previewRect.width - 68, height: 42),
            fontSize: 22,
            color: accent,
            context: context
        )

        let cleanCaption = caption.trimmingCharacters(in: .whitespacesAndNewlines)
        if !cleanCaption.isEmpty {
            drawText("CAPTION", in: CGRect(x: 58, y: 116, width: canvasWidth - 116, height: 24), fontSize: 17, color: CGColor(gray: 0.54, alpha: 1), context: context)
            drawText(cleanCaption, in: CGRect(x: 58, y: 48, width: canvasWidth - 116, height: 64), fontSize: externalCaptionFontSize, color: CGColor(gray: 0.90, alpha: 1), context: context)
        }
    }

    nonisolated private static func externalPreviewTitle(
        platform: ExternalMediaPlatform,
        url: URL?
    ) -> String {
        externalPreviewTitleKey(platform: platform, url: url).localizedUI
    }

    nonisolated private static func externalPreviewTitleKey(
        platform: ExternalMediaPlatform,
        url: URL?
    ) -> String {
        let firstPath = url?.pathComponents.dropFirst().first?.lowercased()
        switch platform {
        case .spotify:
            switch firstPath {
            case "album": return "Albüm önizlemesi"
            case "playlist": return "Çalma listesi"
            case "episode", "show": return "Podcast önizlemesi"
            default: return "Parça önizlemesi"
            }
        case .youtube: return "Video önizlemesi"
        case .facebook: return firstPath == "reel" ? "Reels önizlemesi" : "Gönderi önizlemesi"
        case .instagram: return firstPath == "reel" ? "Reels önizlemesi" : "Gönderi önizlemesi"
        case .x: return "Gönderi önizlemesi"
        }
    }

    nonisolated private static func externalPreviewIdentifier(_ url: URL?) -> String {
        guard let url else { return "Bağlantılı sosyal içerik".localizedUI }
        let identifier = url.pathComponents
            .filter { $0 != "/" }
            .suffix(2)
            .joined(separator: " / ")
        return identifier.isEmpty ? (url.host ?? "Bağlantılı sosyal içerik".localizedUI) : identifier
    }

    nonisolated private static func drawBrandLogo(
        _ platform: ExternalMediaPlatform,
        in rect: CGRect,
        forHeader: Bool,
        context: CGContext
    ) {
        let assetName: String
        switch (platform, forHeader) {
        case (.spotify, true): assetName = "BrandSpotifyBlack"
        case (.youtube, true): assetName = "BrandYouTubeWhite"
        case (.facebook, true): assetName = "BrandFacebookWhite"
        case (.instagram, true): assetName = "BrandInstagramWhite"
        case (.x, true): assetName = "BrandXBlack"
        case (.spotify, false): assetName = "BrandSpotify"
        case (.youtube, false): assetName = "BrandYouTube"
        case (.facebook, false): assetName = "BrandFacebook"
        case (.instagram, false): assetName = "BrandInstagram"
        case (.x, false): assetName = "BrandXWhite"
        }
        guard let image = UIImage(named: assetName)?.cgImage else { return }

        context.saveGState()
        defer { context.restoreGState() }
        context.interpolationQuality = .high
        context.draw(image, in: rect)
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
