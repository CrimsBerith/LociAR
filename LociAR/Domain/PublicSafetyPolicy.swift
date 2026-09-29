enum PublicSafetyPolicy {
    static func isListedInPublicDiscover(_ post: LociPost) -> Bool {
        post.status == .active
            && post.visibility == .public
    }
}
