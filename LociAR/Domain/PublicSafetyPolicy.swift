extension LociPost {
    /// Device photos/videos were removed on 29 Sep 2026; the server rejects them.
    var containsDeviceMedia: Bool {
        if editData.layers.contains(where: { $0.kind == .image }) { return true }
        switch contentSource {
        case .some(.image), .some(.video): return true
        default: return false
        }
    }
}

enum PublicSafetyPolicy {
    static func isListedInPublicDiscover(_ post: LociPost) -> Bool {
        post.status == .active
            && post.visibility == .public
    }
}
