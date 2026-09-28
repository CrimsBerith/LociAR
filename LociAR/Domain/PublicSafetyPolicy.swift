enum PublicSafetyPolicy {
    static func isListedInPublicDiscover(_ post: LociPost) -> Bool {
        post.status == .active
            && post.visibility == .public
            && post.ageRating != .plus18
            && post.status != .blockedProtectedZone
    }

    static func createRejectionReason(for post: LociPost) -> String? {
        if post.ageRating == .plus18 {
            return "18+ içerik bu sürümde kabul edilmez."
        }
        if post.status == .blockedProtectedZone {
            return "Bu korumalı bölgede post yayınlanamaz."
        }
        return nil
    }
}
