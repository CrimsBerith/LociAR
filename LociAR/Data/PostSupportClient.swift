import Foundation
import Observation
import StoreKit

struct PostSupportCatalog: Decodable, Sendable {
    struct Offer: Decodable, Sendable, Identifiable {
        let productId: String
        let currency: String
        let grossMilliunits: Int64
        var id: String { productId }
        var price: String { (Decimal(grossMilliunits) / 1000).formatted(.currency(code: currency)) }
    }
    let writerShareBps: Int
    let appleEnabled: Bool
    let stripeEnabled: Bool
    let cryptoEnabled: Bool
    let externalIOSAllowed: Bool
    let environment: String
    let cryptoProvider: String
    let offers: [Offer]
    let cryptoOffers: [Offer]
}

struct PostSupportReceipt: Decodable, Sendable {
    enum Status: String, Decodable, Sendable { case none, awaitingPayment = "awaiting_payment", pending, refunded, expired }
    let status: Status
    let writerShareBps: Int
    var intentId: UUID? = nil
    var processor: String? = nil
    var url: URL? = nil
    var environment: String? = nil
    var externalIOSAllowed: Bool? = nil
    var recorded: Bool { status == .pending && writerShareBps == 7200 && ["sandbox", "production"].contains(environment ?? "") }
}

struct SupportEarnings: Decodable, Sendable {
    struct Balance: Decodable, Sendable, Identifiable {
        let currency: String
        let environment: String
        let pendingMilliunits: Int64
        var id: String { currency + environment }
        var amount: String { (Decimal(pendingMilliunits) / 1000).formatted(.currency(code: currency)) }
    }
    let writerShareBps: Int
    let payoutsAvailable: Bool
    let balances: [Balance]
}

enum PostSupportError: LocalizedError {
    case unavailable, pending, verification
    var errorDescription: String? {
        switch self {
        case .unavailable: String(localized: "Destek ödemeleri henüz kullanıma açık değil.")
        case .pending: String(localized: "Ödemenin onayı bekleniyor. Tekrar ödeme yapmana gerek yok.")
        case .verification: String(localized: "Ödeme henüz doğrulanamadı. Tekrar ödeme yapmadan durumunu kontrol et.")
        }
    }
}

@MainActor
protocol PostSupportServing {
    func storefrontCountry() async -> String
    func catalog() async throws -> PostSupportCatalog
    func purchase(_ product: Product, postID: UUID, previousIntentID: UUID?) async throws -> PostSupportReceipt?
    func externalCheckout(postID: UUID, productID: String, crypto: Bool, processor: String, storefront: String, previousIntentID: UUID?) async throws -> (UUID, URL)
    func pending(postID: UUID) async throws -> PostSupportReceipt
    func receipt(_ id: UUID, processor: String) async throws -> PostSupportReceipt
    func earnings() async throws -> SupportEarnings
}

@MainActor
@Observable
final class PostSupportClient: PostSupportServing {
    static let shared = PostSupportClient()
    nonisolated static let productIDs = ["com.khankartal.lociar.support.small", "com.khankartal.lociar.support.medium", "com.khankartal.lociar.support.large"]
    @ObservationIgnored private var callables: CallableClient?
    @ObservationIgnored private var updates: Task<Void, Never>?

    func storefrontCountry() async -> String { await Storefront.current?.countryCode ?? "" }

    nonisolated static func validCheckoutURL(_ url: URL, processor: String) -> Bool {
        let hosts = processor == "nowpayments" ? ["nowpayments.io", "payment.nowpayments.io"] : ["checkout.stripe.com"]
        return ["stripe", "nowpayments"].contains(processor) && url.scheme == "https"
            && url.host.map(hosts.contains) == true && url.user == nil && url.password == nil
            && (url.port == nil || url.port == 443)
    }

    nonisolated static func validate(_ receipt: PostSupportReceipt, expectedID: UUID? = nil) throws -> PostSupportReceipt {
        guard receipt.writerShareBps == 7200,
              receipt.status == .none || ["sandbox", "production"].contains(receipt.environment ?? ""),
              expectedID == nil || receipt.intentId == expectedID,
              receipt.status != .awaitingPayment || (receipt.intentId != nil && ["stripe", "nowpayments"].contains(receipt.processor ?? "")),
              receipt.url.map({ validCheckoutURL($0, processor: receipt.processor ?? "") }) != false else { throw PostSupportError.verification }
        return receipt
    }

    nonisolated static func validate(_ catalog: PostSupportCatalog) throws -> PostSupportCatalog {
        guard catalog.writerShareBps == 7200, ["sandbox", "production"].contains(catalog.environment),
              ["stripe", "nowpayments"].contains(catalog.cryptoProvider) else { throw PostSupportError.unavailable }
        for offers in [catalog.offers, catalog.cryptoOffers] {
            guard offers.count <= productIDs.count, Set(offers.map(\.id)).count == offers.count,
                  offers.allSatisfy({ productIDs.contains($0.productId) && $0.grossMilliunits > 0
                      && $0.grossMilliunits <= 1_000_000_000 && $0.currency.utf8.count == 3
                      && $0.currency.utf8.allSatisfy { (65...90).contains($0) } }) else { throw PostSupportError.unavailable }
        }
        return catalog
    }

    func configure(callables: CallableClient) {
        self.callables = callables
        guard updates == nil else { return }
        updates = Task { [weak self] in
            for await result in StoreKit.Transaction.updates {
                guard !Task.isCancelled else { return }
                _ = try? await self?.confirm(result)
            }
        }
    }

    func resumeUnfinishedPurchases() async {
        guard callables != nil else { return }
        for await result in StoreKit.Transaction.unfinished { _ = try? await confirm(result) }
    }

    func catalog() async throws -> PostSupportCatalog {
        guard let callables else { throw PostSupportError.unavailable }
        let catalog: PostSupportCatalog = try await callables.call("readSupportCatalog")
        return try Self.validate(catalog)
    }

    func purchase(_ product: Product, postID: UUID, previousIntentID: UUID?) async throws -> PostSupportReceipt? {
        guard let callables, Self.productIDs.contains(product.id) else { throw PostSupportError.unavailable }
        struct Payload: Encodable { let postId: String; let productId: String; let previousIntentId: String? }
        struct Intent: Decodable { let intentId: UUID }
        let intent: Intent = try await callables.call("beginApplePostSupport", payload: Payload(
            postId: postID.uuidString.lowercased(), productId: product.id, previousIntentId: previousIntentID?.uuidString.lowercased()))
        switch try await product.purchase(options: [.appAccountToken(intent.intentId)]) {
        case let .success(result): return try await confirm(result)
        case .pending: throw PostSupportError.pending
        case .userCancelled: return nil
        @unknown default: throw PostSupportError.unavailable
        }
    }

    private func confirm(_ result: VerificationResult<StoreKit.Transaction>) async throws -> PostSupportReceipt {
        guard case let .verified(transaction) = result, Self.productIDs.contains(transaction.productID),
              let callables else { throw PostSupportError.verification }
        struct Payload: Encodable { let signedTransaction: String }
        let receipt: PostSupportReceipt = try await callables.call("confirmApplePostSupport",
            payload: Payload(signedTransaction: result.jwsRepresentation), timeout: 60)
        guard receipt.writerShareBps == 7200, [.pending, .refunded].contains(receipt.status),
              ["sandbox", "production"].contains(receipt.environment ?? "") else { throw PostSupportError.verification }
        // Unconfirmed purchases remain unfinished for safe retry after network/auth recovery.
        await transaction.finish()
        return receipt
    }

    func externalCheckout(postID: UUID, productID: String, crypto: Bool, processor: String, storefront: String, previousIntentID: UUID?) async throws -> (UUID, URL) {
        guard let callables, storefront == "USA" else { throw PostSupportError.unavailable }
        struct Payload: Encodable {
            let postId: String; let productId: String; let provider: String
            let channel = "ios"; let storefront: String; let previousIntentId: String?
        }
        struct Checkout: Decodable { let intentId: UUID; let url: URL }
        let name = crypto && processor == "nowpayments" ? "beginCryptoPostSupport" : "beginExternalPostSupport"
        let checkout: Checkout = try await callables.call(name, payload: Payload(postId: postID.uuidString.lowercased(),
            productId: productID, provider: crypto ? "crypto" : "stripe", storefront: storefront,
            previousIntentId: previousIntentID?.uuidString.lowercased()), timeout: 60)
        guard Self.validCheckoutURL(checkout.url, processor: crypto && processor == "nowpayments" ? "nowpayments" : "stripe") else { throw PostSupportError.unavailable }
        return (checkout.intentId, checkout.url)
    }

    func pending(postID: UUID) async throws -> PostSupportReceipt {
        guard let callables else { throw PostSupportError.unavailable }
        struct Payload: Encodable { let postId: String }
        return try Self.validate(await callables.call("readMyPostSupport", payload: Payload(postId: postID.uuidString.lowercased())))
    }

    func receipt(_ id: UUID, processor: String) async throws -> PostSupportReceipt {
        guard let callables else { throw PostSupportError.unavailable }
        guard ["stripe", "nowpayments"].contains(processor) else { throw PostSupportError.verification }
        struct Payload: Encodable { let intentId: String }
        return try Self.validate(await callables.call(processor == "stripe" ? "refreshStripePostSupport" : "readMyPostSupport",
            payload: Payload(intentId: id.uuidString.lowercased()), timeout: 60), expectedID: id)
    }

    func earnings() async throws -> SupportEarnings {
        guard let callables else { throw PostSupportError.unavailable }
        let earnings: SupportEarnings = try await callables.call("readMySupportEarnings")
        guard earnings.writerShareBps == 7200, earnings.balances.count <= 100,
              Set(earnings.balances.map(\.id)).count == earnings.balances.count,
              earnings.balances.allSatisfy({ $0.currency.utf8.count == 3 && $0.currency.utf8.allSatisfy { (65...90).contains($0) }
                  && ["sandbox", "production"].contains($0.environment) && $0.pendingMilliunits >= 0
                  && $0.pendingMilliunits <= 9_007_199_254_740_991 }) else { throw PostSupportError.verification }
        return earnings
    }
}

#if DEBUG
/// Deterministic UI fixtures. Never configures a provider or creates a payment.
@MainActor
final class SupportUITestClient: PostSupportServing {
    private let args = ProcessInfo.processInfo.arguments
    private let scenario = ProcessInfo.processInfo.environment["UITEST_SUPPORT_SCENARIO"] ?? ""
    private let id = UUID(uuidString: "99999999-9999-4999-8999-999999999999")!
    private let repeatID = UUID(uuidString: "88888888-8888-4888-8888-888888888888")!
    private var attemptedCheckout = false
    private var failedRecovery = false
    private var receiptReads = 0
    private var verifiedStatus: PostSupportReceipt.Status?
    func storefrontCountry() async -> String { args.contains("UITEST_SUPPORT_FOREIGN_STOREFRONT") ? "TUR" : "USA" }
    func catalog() async throws -> PostSupportCatalog {
        guard args.contains("UITEST_SUPPORT_PENDING") || !scenario.isEmpty,
              !args.contains("UITEST_SUPPORT_CATALOG_UNAVAILABLE") else { throw PostSupportError.unavailable }
        let crypto = scenario == "checkout_timeout_crypto"
        let offer = PostSupportCatalog.Offer(productId: PostSupportClient.productIDs[0], currency: "GBP", grossMilliunits: 1990)
        return PostSupportCatalog(writerShareBps: 7200, appleEnabled: false, stripeEnabled: !crypto, cryptoEnabled: crypto,
            externalIOSAllowed: true, environment: "sandbox", cryptoProvider: "nowpayments",
            offers: crypto ? [] : [offer], cryptoOffers: crypto ? [offer] : [])
    }
    func pending(postID: UUID) async throws -> PostSupportReceipt {
        if scenario.hasPrefix("checkout_timeout") {
            if !attemptedCheckout { return PostSupportReceipt(status: .none, writerShareBps: 7200, environment: "sandbox") }
            if scenario == "checkout_timeout_recovery_unavailable", !failedRecovery {
                failedRecovery = true
                throw URLError(.notConnectedToInternet)
            }
        } else if !args.contains("UITEST_SUPPORT_PENDING"), scenario.isEmpty { throw PostSupportError.unavailable }
        return PostSupportReceipt(status: scenario == "settled_before_launch" && !attemptedCheckout ? .pending : verifiedStatus ?? .awaitingPayment,
            writerShareBps: 7200, intentId: scenario == "settled_before_launch" && attemptedCheckout ? repeatID : id,
            processor: scenario == "checkout_timeout_crypto" ? "nowpayments" : "stripe",
            url: args.contains("UITEST_SUPPORT_FOREIGN_STOREFRONT") ? URL(string: "https://checkout.stripe.com/c/pay/ui-fixture") : nil,
            environment: "sandbox", externalIOSAllowed: true)
    }
    func receipt(_ id: UUID, processor: String) async throws -> PostSupportReceipt {
        receiptReads += 1
        if scenario == "refresh_unavailable", receiptReads > 1 { throw URLError(.notConnectedToInternet) }
        let status: PostSupportReceipt.Status = args.contains("UITEST_SUPPORT_EXPIRED") ? .expired
            : receiptReads > 1 && scenario == "confirmed" ? .pending
            : receiptReads > 1 && scenario == "refunded" ? .refunded : .awaitingPayment
        if [.pending, .refunded].contains(status) { verifiedStatus = status }
        return PostSupportReceipt(status: status,
            writerShareBps: 7200, intentId: id, processor: processor,
            url: args.contains("UITEST_SUPPORT_FOREIGN_STOREFRONT") ? URL(string: "https://checkout.stripe.com/c/pay/ui-fixture") : nil,
            environment: "sandbox", externalIOSAllowed: true)
    }
    func purchase(_ product: Product, postID: UUID, previousIntentID: UUID?) async throws -> PostSupportReceipt? { throw PostSupportError.unavailable }
    func externalCheckout(postID: UUID, productID: String, crypto: Bool, processor: String, storefront: String, previousIntentID: UUID?) async throws -> (UUID, URL) {
        if scenario == "settled_before_launch" {
            guard previousIntentID == id, !crypto else { throw PostSupportError.verification }
        } else {
            guard scenario.hasPrefix("checkout_timeout"), crypto == (scenario == "checkout_timeout_crypto") else { throw PostSupportError.unavailable }
        }
        attemptedCheckout = true
        throw URLError(.timedOut)
    }
    func earnings() async throws -> SupportEarnings { throw PostSupportError.unavailable }
}
#endif
