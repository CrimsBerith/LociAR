import CryptoKit
import Foundation
@preconcurrency import FirebaseAuth
@preconcurrency import FirebaseFirestore
@preconcurrency import FirebaseFunctions

// MARK: - Identity

/// Maps a Firebase UID to the UUID ("luid") LociAR uses for every ownership field.
/// Must stay byte-identical with functions/src/core.ts (`luidForUid`, UUIDv5 + fixed namespace).
enum FirebaseIdentity {
    nonisolated static let namespace = UUID(uuidString: "6f1c6d0e-3b8a-5c7e-9f21-4c0a7d2e9b13")!

    nonisolated static func luid(forFirebaseUID uid: String) -> UUID {
        var bytes = [UInt8]()
        withUnsafeBytes(of: namespace.uuid) { bytes.append(contentsOf: $0) }
        bytes.append(contentsOf: Array(uid.utf8))
        var hash = Array(Insecure.SHA1.hash(data: Data(bytes)).prefix(16))
        hash[6] = (hash[6] & 0x0F) | 0x50
        hash[8] = (hash[8] & 0x3F) | 0x80
        let tuple: uuid_t = (hash[0], hash[1], hash[2], hash[3], hash[4], hash[5], hash[6], hash[7],
                             hash[8], hash[9], hash[10], hash[11], hash[12], hash[13], hash[14], hash[15])
        return UUID(uuid: tuple)
    }

    /// Current signed-in, verified user's luid (nil when signed out).
    nonisolated static func currentLUID() -> UUID? {
        guard let uid = Auth.auth().currentUser?.uid else { return nil }
        return luid(forFirebaseUID: uid)
    }

    nonisolated static func key(_ id: UUID) -> String { id.uuidString.lowercased() }
}

// MARK: - Geohash (same algorithm as functions/src/geo.ts)

enum Geohash {
    private nonisolated static let base32 = Array("0123456789bcdefghjkmnpqrstuvwxyz")
    nonisolated static let earthRadiusMeters = 6_371_008.8

    nonisolated static func encode(latitude: Double, longitude: Double, precision: Int = 10) -> String {
        var latRange = (-90.0, 90.0)
        var lngRange = (-180.0, 180.0)
        var hash = ""
        var bit = 0
        var ch = 0
        var even = true
        while hash.count < precision {
            if even {
                let mid = (lngRange.0 + lngRange.1) / 2
                if longitude >= mid { ch = (ch << 1) | 1; lngRange.0 = mid } else { ch = ch << 1; lngRange.1 = mid }
            } else {
                let mid = (latRange.0 + latRange.1) / 2
                if latitude >= mid { ch = (ch << 1) | 1; latRange.0 = mid } else { ch = ch << 1; latRange.1 = mid }
            }
            even.toggle()
            bit += 1
            if bit == 5 {
                hash.append(base32[ch])
                bit = 0
                ch = 0
            }
        }
        return hash
    }

    nonisolated static func distanceMeters(_ lat1: Double, _ lng1: Double, _ lat2: Double, _ lng2: Double) -> Double {
        let toRad = { (degrees: Double) in degrees * .pi / 180 }
        let dLat = toRad(lat2 - lat1)
        let dLng = toRad(lng2 - lng1)
        let a = pow(sin(dLat / 2), 2) + cos(toRad(lat1)) * cos(toRad(lat2)) * pow(sin(dLng / 2), 2)
        return 2 * earthRadiusMeters * asin(min(1, sqrt(a)))
    }

    private nonisolated static func cellSize(precision: Int, latitude: Double) -> (height: Double, width: Double, dLat: Double, dLng: Double) {
        let bits = precision * 5
        let dLat = 180 / pow(2, Double(bits / 2))
        let dLng = 360 / pow(2, Double((bits + 1) / 2))
        let height = dLat * .pi * earthRadiusMeters / 180
        let width = dLng * .pi * earthRadiusMeters * max(0.01, cos(latitude * .pi / 180)) / 180
        return (height, width, dLat, dLng)
    }

    /// Prefixes of the 3x3 block of cells around the point, at the finest precision whose cells
    /// are at least `radiusMeters` wide. Empty means "radius too large, don't filter by geohash".
    nonisolated static func coverPrefixes(latitude: Double, longitude: Double, radiusMeters: Double) -> [String] {
        var chosen = 0
        for precision in 1...9 {
            let size = cellSize(precision: precision, latitude: latitude)
            if min(size.height, size.width) >= radiusMeters { chosen = precision } else { break }
        }
        guard chosen > 0 else { return [] }
        let size = cellSize(precision: chosen, latitude: latitude)
        var prefixes = Set<String>()
        for i in -1...1 {
            for j in -1...1 {
                let lat = max(-89.999999, min(89.999999, latitude + Double(i) * size.dLat))
                var lng = longitude + Double(j) * size.dLng
                if lng > 180 { lng -= 360 }
                if lng < -180 { lng += 360 }
                prefixes.insert(encode(latitude: lat, longitude: lng, precision: chosen))
            }
        }
        return prefixes.sorted()
    }
}

// MARK: - Callable functions

enum BackendCallError: LocalizedError, Sendable {
    /// The server refused the request (validation, permission, rate limit). Not retryable.
    /// `reason` is the machine-readable `details.reason` the server attaches (functions/src/errors.ts);
    /// nil for older servers, in which case callers fall back to matching `message`.
    case rejected(code: Int, message: String, reason: String?)
    case invalidResponse

    var errorDescription: String? {
        switch self {
        case .rejected(_, let message, _): message
        case .invalidResponse: "Sunucudan beklenmeyen bir yanıt geldi."
        }
    }

    var reason: String? {
        if case .rejected(_, _, let reason) = self { return reason }
        return nil
    }
}

/// Which Cloud Functions failures are final and which are worth retrying. Pure, so it is unit-tested.
enum BackendErrorPolicy {
    /// The server said the request itself is wrong or not allowed: retrying cannot help.
    nonisolated static func isPermanent(_ code: FunctionsErrorCode?) -> Bool {
        switch code {
        case .invalidArgument, .permissionDenied, .resourceExhausted, .alreadyExists, .failedPrecondition, .notFound:
            true
        default:
            false
        }
    }

    /// Maps a Functions `NSError` (`code`, `localizedDescription`, `userInfo`) to `.rejected` for
    /// permanent failures; nil means "leave the original error alone" (transient: unavailable,
    /// deadline exceeded, aborted, internal, unauthenticated...).
    nonisolated static func map(code: Int, message: String, userInfo: [String: Any]) -> BackendCallError? {
        guard isPermanent(FunctionsErrorCode(rawValue: code)) else { return nil }
        // The SDK stores HttpsError.details under the "details" key (FunctionsErrorDetailsKey).
        let details = userInfo["details"] as? [String: Any]
        return .rejected(code: code, message: message, reason: details?["reason"] as? String)
    }
}

struct CallableClient: Sendable {
    let region: String

    nonisolated static func jsonEncoder() -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }

    /// Callables time out after 30 s unless the caller needs longer (createPost uses 60 s).
    nonisolated static let defaultTimeout: TimeInterval = 30

    nonisolated func call<Response: Decodable>(
        _ name: String, payload: some Encodable, timeout: TimeInterval = CallableClient.defaultTimeout
    ) async throws -> Response {
        let payloadData = try Self.jsonEncoder().encode(payload)
        let object = try JSONSerialization.jsonObject(with: payloadData)
        let data = try await callRaw(name, object: object, timeout: timeout)
        return try FirestoreJSON.decoder().decode(Response.self, from: data)
    }

    nonisolated func callRaw(
        _ name: String, object: Any, timeout: TimeInterval = CallableClient.defaultTimeout
    ) async throws -> Data {
        var refreshedToken = false
        while true {
            do {
                let callable = Functions.functions(region: region).httpsCallable(name)
                callable.timeoutInterval = timeout
                let result = try await callable.call(object)
                guard JSONSerialization.isValidJSONObject(result.data) else { throw BackendCallError.invalidResponse }
                return try JSONSerialization.data(withJSONObject: result.data)
            } catch let error as NSError where error.domain == FunctionsErrorDomain {
                // An expired ID token surfaces as `unauthenticated`; refresh once and retry.
                if FunctionsErrorCode(rawValue: error.code) == .unauthenticated,
                   !refreshedToken, let user = Auth.auth().currentUser {
                    refreshedToken = true
                    _ = try? await user.getIDTokenResult(forcingRefresh: true)
                    continue
                }
                throw BackendErrorPolicy.map(code: error.code, message: error.localizedDescription, userInfo: error.userInfo) ?? error
            }
        }
    }
}

private struct EmptyPayload: Encodable, Sendable {}

extension CallableClient {
    nonisolated func call<Response: Decodable>(_ name: String) async throws -> Response {
        try await call(name, payload: EmptyPayload())
    }
}

// MARK: - Firestore document → Codable bridge

enum FirestoreJSON {
    /// Accepts ISO-8601 with or without fractional seconds (Cloud Functions write milliseconds).
    nonisolated static func decoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let raw = try container.decode(String.self)
            let fractional = ISO8601DateFormatter()
            fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            let plain = ISO8601DateFormatter()
            plain.formatOptions = [.withInternetDateTime]
            if let date = fractional.date(from: raw) ?? plain.date(from: raw) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date \(raw)")
        }
        return decoder
    }

    nonisolated static func isoString(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }

    /// Converts Firestore values (Timestamp, nested maps, JSON-string blobs) into JSON-safe values.
    nonisolated static func jsonSafe(_ value: Any?) -> Any {
        switch value {
        case nil, is NSNull: return NSNull()
        case let timestamp as Timestamp: return isoString(timestamp.dateValue())
        case let date as Date: return isoString(date)
        case let map as [String: Any]: return map.mapValues { jsonSafe($0) }
        case let array as [Any]: return array.map { jsonSafe($0) }
        case let reference as DocumentReference: return reference.path
        default: return value ?? NSNull()
        }
    }

    /// Parses a field that holds a JSON document serialised as a string (pose_json, edit_data_json, ...).
    nonisolated static func parseEmbedded(_ value: Any?) -> Any {
        guard let raw = value as? String, let data = raw.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) else { return NSNull() }
        return object
    }

    nonisolated static func decode<T: Decodable>(_ type: T.Type, from object: [String: Any]) throws -> T {
        let data = try JSONSerialization.data(withJSONObject: object)
        return try decoder().decode(T.self, from: data)
    }

    nonisolated static func date(_ value: Any?) -> Date? {
        (value as? Timestamp)?.dateValue()
    }
}

// MARK: - Post documents

enum FirestorePostMapper {
    /// Builds the same row shape the Supabase REST API returned, so BackendPostRow stays the
    /// single decoding path for posts.
    nonisolated static func row(id: String, data: [String: Any]) throws -> BackendPostRow {
        let createdAt = FirestoreJSON.date(data["created_at"]) ?? Date()
        let contentSource = FirestoreJSON.parseEmbedded(data["content_source_json"])
        let object: [String: Any] = [
            "id": id,
            "creator_id": data["creator_id"] ?? NSNull(),
            "creator_handle": data["creator_handle"] ?? NSNull(),
            "created_at": FirestoreJSON.isoString(createdAt),
            "pose": FirestoreJSON.parseEmbedded(data["pose_json"]),
            "edit_data": FirestoreJSON.parseEmbedded(data["edit_data_json"]),
            "content_source": contentSource,
            "link_preview": (contentSource as? [String: Any])?["preview"] ?? NSNull(),
            "anchor_bundle": FirestoreJSON.parseEmbedded(data["anchor_bundle_json"]),
            "caption": data["caption"] ?? "",
            "status": data["status"] ?? "pending_review",
            "visibility": data["visibility"] ?? "public",
            "age_rating": data["age_rating"] ?? "all",
            "views_count": data["views_count"] ?? 0,
            "likes_count": data["likes_count"] ?? 0,
            "comments_count": data["comments_count"] ?? 0,
        ]
        return try FirestoreJSON.decode(BackendPostRow.self, from: object)
    }

    nonisolated static func isPubliclyListed(_ data: [String: Any]) -> Bool {
        (data["status"] as? String) == "active"
            && (data["visibility"] as? String) == "public"
            && (data["deleted_at"] == nil || data["deleted_at"] is NSNull)
    }
}
