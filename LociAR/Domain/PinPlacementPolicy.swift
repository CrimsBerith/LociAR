import Foundation

enum PinPlacementDecision: Equatable, Sendable {
    case planeGeometry
    case estimatedPlane
    case offerApproximate
    case freeSpaceApproximate
}

enum PinPlacementPolicy {
    static func decide(
        trackingNormal: Bool,
        candidateStable: Bool,
        hasPlaneGeometry: Bool,
        hasEstimatedPlane: Bool,
        approximateExplicitlyConfirmed: Bool
    ) -> PinPlacementDecision {
        if approximateExplicitlyConfirmed { return .freeSpaceApproximate }
        guard trackingNormal, candidateStable else { return .offerApproximate }
        if hasPlaneGeometry { return .planeGeometry }
        if hasEstimatedPlane { return .estimatedPlane }
        return .offerApproximate
    }
}
