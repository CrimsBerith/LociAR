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

/// Profile text limits. Firestore rules `string.size()` counts UTF-16 code units (an emoji counts as 2, a
/// family emoji as 8), so the composer counts and clamps the same way and never cuts a character in half.
enum ProfileTextPolicy {
    static let bioLimit = 300
    static let displayNameLimit = 60

    static func length(_ text: String) -> Int { text.utf16.count }

    static func clamped(_ text: String, limit: Int) -> String {
        guard length(text) > limit else { return text }
        var result = "", used = 0
        for character in text {
            let size = character.utf16.count
            if used + size > limit { break }
            result.append(character)
            used += size
        }
        return result
    }
}

enum PublicSafetyPolicy {
    static func isListedInPublicDiscover(_ post: LociPost) -> Bool {
        post.status == .active
            && post.visibility == .public
            && post.ageRating != .plus18
    }
}
