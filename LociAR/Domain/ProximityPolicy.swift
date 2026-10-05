import CoreLocation
import Foundation

struct ProximityDecision: Equatable, Sendable {
    let allowed: Bool
    let distanceMeters: Double
    let headingDelta: Double
    let reason: String
}

struct ViewAimGuidance: Equatable, Sendable {
    var headingAligned: Bool
    var pitchAligned: Bool
    var closeEnough: Bool
    var readyToReveal: Bool
    var signedHeadingDelta: Double
    var distanceMeters: Double
    var title: String
    var message: String
    var symbol: String
}

enum ProximityPolicy {
    static let distanceMeters = 60.0
    static let headingDegrees = 42.0
    static let revealHeadingDegrees = 15.0
    static let lookDownPitchDegrees = -12.0
    static let lookLevelPitchDegrees = 25.0

    static func evaluate(post: LociPost, viewer: CLLocation, viewerHeading: Double?, targeted: Bool) -> ProximityDecision {
        guard let target = post.anchorBundle.anchor.geoPose,
              isValidCoordinate(latitude: target.latitude, longitude: target.longitude),
              isValidCoordinate(
                latitude: viewer.coordinate.latitude,
                longitude: viewer.coordinate.longitude
              ) else {
            return ProximityDecision(allowed: false, distanceMeters: .infinity, headingDelta: 180, reason: String(localized: "Post konum bilgisi eksik."))
        }
        let destination = CLLocation(latitude: target.latitude, longitude: target.longitude)
        let distance = viewer.distance(from: destination)
        guard distance.isFinite, distance >= 0 else {
            return ProximityDecision(allowed: false, distanceMeters: .infinity, headingDelta: 180, reason: String(localized: "Post konum bilgisi geçersiz."))
        }
        let maxDistance = distanceMeters * (targeted ? 1.35 : 1)
        guard distance < maxDistance else {
            return ProximityDecision(allowed: false, distanceMeters: distance, headingDelta: 180, reason: String(localized: "AR görüntüleme için posta yaklaşın."))
        }

        if let viewerAltitude = viewer.verticalAccuracy >= 0 && viewer.altitude.isFinite ? viewer.altitude : nil,
           let targetAltitude = target.altitude, targetAltitude.isFinite,
           abs(viewerAltitude - targetAltitude) > (post.anchorBundle.anchor.pinQuality.isPhysicalSurface ? 18 : 8) {
            return ProximityDecision(allowed: false, distanceMeters: distance, headingDelta: 180, reason: String(localized: "Post farklı bir yükseklikte."))
        }

        guard let targetHeading = GeoPoseCaptureService.validHeading(target.heading) else {
            return ProximityDecision(allowed: false, distanceMeters: distance, headingDelta: 180, reason: String(localized: "Post yön bilgisi geçersiz."))
        }
        let delta = angularDelta(
            GeoPoseCaptureService.validHeading(viewerHeading) ?? targetHeading,
            targetHeading
        )
        if post.anchorBundle.anchor.pinQuality.isPhysicalSurface {
            return ProximityDecision(allowed: true, distanceMeters: distance, headingDelta: delta, reason: String(localized: "Doğru konumdasın. Yüzey aranıyor."))
        }
        let maxHeading = headingDegrees * (targeted ? 2.2 : 1.6)
        return ProximityDecision(
            allowed: delta < maxHeading, distanceMeters: distance, headingDelta: delta,
            reason: delta < maxHeading ? String(localized: "Yaklaşık görünüm hazır.") : String(localized: "Telefonu postun yönüne çevirin.")
        )
    }

    /// Shortest signed turn from the viewer heading to the post heading.
    /// Positive values mean the post is to the right.
    static func signedHeadingDelta(from viewer: Double, to target: Double) -> Double {
        guard viewer.isFinite, target.isFinite else { return 0 }
        var delta = (target - viewer).truncatingRemainder(dividingBy: 360)
        if delta > 180 { delta -= 360 }
        if delta <= -180 { delta += 360 }
        return delta
    }

    static func bearing(from origin: CLLocationCoordinate2D, to destination: CLLocationCoordinate2D) -> Double {
        guard isValidCoordinate(latitude: origin.latitude, longitude: origin.longitude),
              isValidCoordinate(latitude: destination.latitude, longitude: destination.longitude) else { return 0 }
        let lat1 = origin.latitude * .pi / 180
        let lat2 = destination.latitude * .pi / 180
        let dLon = (destination.longitude - origin.longitude) * .pi / 180
        let y = sin(dLon) * cos(lat2)
        let x = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dLon)
        let degrees = atan2(y, x) * 180 / .pi
        return (degrees + 360).truncatingRemainder(dividingBy: 360)
    }

    static func viewAim(
        post: LociPost,
        viewer: CLLocation?,
        viewerHeading: Double?,
        cameraPitchDegrees: Double?
    ) -> ViewAimGuidance {
        let geo = post.anchorBundle.anchor.geoPose.flatMap {
            isValidCoordinate(latitude: $0.latitude, longitude: $0.longitude) ? $0 : nil
        }
        let destination = geo.map { CLLocation(latitude: $0.latitude, longitude: $0.longitude) }
        let measuredDistance = if let viewer, let destination,
                                  isValidCoordinate(latitude: viewer.coordinate.latitude, longitude: viewer.coordinate.longitude) {
            viewer.distance(from: destination)
        } else {
            0.0
        }
        let distance = measuredDistance.isFinite && measuredDistance >= 0 ? measuredDistance : 0
        let pinHeading = GeoPoseCaptureService.validHeading(geo?.heading)
        let safeViewerHeading = GeoPoseCaptureService.validHeading(viewerHeading)
        let alignment = post.anchorBundle.anchor.surfaceAlignment
        let floorPost = alignment == .horizontal

        let signed: Double
        let headingAligned: Bool
        if floorPost {
            signed = if let safeViewerHeading, let pinHeading {
                signedHeadingDelta(from: safeViewerHeading, to: pinHeading)
            } else {
                0
            }
            headingAligned = true
        } else if let safeViewerHeading, let pinHeading {
            signed = signedHeadingDelta(from: safeViewerHeading, to: pinHeading)
            headingAligned = abs(signed) <= revealHeadingDegrees
        } else {
            signed = 0
            headingAligned = false
        }

        let pitchAligned: Bool
        if let cameraPitchDegrees {
            switch alignment {
            case .horizontal:
                pitchAligned = cameraPitchDegrees <= lookDownPitchDegrees
            case .vertical:
                pitchAligned = abs(cameraPitchDegrees) <= lookLevelPitchDegrees
            case .angled, .freeSpace, .unknown:
                pitchAligned = true
            }
        } else {
            pitchAligned = false
        }

        if !floorPost, pinHeading == nil || safeViewerHeading == nil {
            return ViewAimGuidance(
                headingAligned: false, pitchAligned: pitchAligned, closeEnough: true,
                readyToReveal: false, signedHeadingDelta: 0, distanceMeters: distance,
                title: String(localized: "Yön kilitleniyor"),
                message: String(localized: "Paylaşırken baktığın duvara dön. Telefonu yavaşça çevir."),
                symbol: "location.north.line"
            )
        }

        if !headingAligned {
            let degrees = max(1, Int(abs(signed).rounded()))
            if signed > 0 {
                return ViewAimGuidance(
                    headingAligned: false, pitchAligned: pitchAligned, closeEnough: true,
                    readyToReveal: false, signedHeadingDelta: signed, distanceMeters: distance,
                    title: String(localized: "Sağa dön"),
                    message: String(localized: "Paylaşırken baktığın yöne \(degrees)° sağa dön."),
                    symbol: "arrow.turn.up.right"
                )
            }
            return ViewAimGuidance(
                headingAligned: false, pitchAligned: pitchAligned, closeEnough: true,
                readyToReveal: false, signedHeadingDelta: signed, distanceMeters: distance,
                title: String(localized: "Sola dön"),
                message: String(localized: "Paylaşırken baktığın yöne \(degrees)° sola dön."),
                symbol: "arrow.turn.up.left"
            )
        }

        if !pitchAligned {
            if alignment == .horizontal {
                return ViewAimGuidance(
                    headingAligned: true, pitchAligned: false, closeEnough: true,
                    readyToReveal: false, signedHeadingDelta: signed, distanceMeters: distance,
                    title: String(localized: "Kamerayı eğ"),
                    message: String(localized: "Post zeminde. Nişanı yüzeye indir, ortala."),
                    symbol: "arrow.down.circle"
                )
            }
            return ViewAimGuidance(
                headingAligned: true, pitchAligned: false, closeEnough: true,
                readyToReveal: false, signedHeadingDelta: signed, distanceMeters: distance,
                title: String(localized: "Kamerayı kaldır"),
                message: String(localized: "Post duvarda. Nişanı o duvara tut, ortala."),
                symbol: "arrow.up.circle"
            )
        }

        let surfaceHint = alignment == .vertical
            ? String(localized: "Nokta atışı. Duvarı kadrajın tam ortasına al.")
            : String(localized: "Nokta atışı. Zemini kadrajın tam ortasına al.")
        return ViewAimGuidance(
            headingAligned: true, pitchAligned: true, closeEnough: true,
            readyToReveal: true, signedHeadingDelta: signed, distanceMeters: distance,
            title: String(localized: "Nokta atışı"),
            message: surfaceHint,
            symbol: "viewfinder"
        )
    }

    static func viewablePosts(_ posts: [LociPost], viewer: CLLocation, viewerHeading: Double?) -> [LociPost] {
        posts.compactMap { post -> (post: LociPost, distance: Double)? in
            let decision = evaluate(post: post, viewer: viewer, viewerHeading: viewerHeading, targeted: true)
            guard decision.allowed else { return nil }
            return (post, decision.distanceMeters)
        }
        .sorted { lhs, rhs in
            if lhs.distance == rhs.distance { return lhs.post.createdAt > rhs.post.createdAt }
            return lhs.distance < rhs.distance
        }
        .map(\.post)
    }

    private static func angularDelta(_ lhs: Double, _ rhs: Double) -> Double {
        guard lhs.isFinite, rhs.isFinite else { return 180 }
        let raw = abs(lhs - rhs).truncatingRemainder(dividingBy: 360)
        return min(raw, 360 - raw)
    }

    static func roundedMeters(_ value: Double) -> Int? {
        guard value.isFinite, value >= 0, value <= Double(Int.max) else { return nil }
        return Int(value.rounded())
    }

    static func isValidCoordinate(latitude: Double, longitude: Double) -> Bool {
        latitude.isFinite && longitude.isFinite
            && (-90...90).contains(latitude)
            && (-180...180).contains(longitude)
    }
}
