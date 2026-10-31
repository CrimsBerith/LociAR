import StoreKit
import SwiftUI

/// A giving hand and heart, distinct from the adjacent like button.
struct PostSupportIcon: View {
    var body: some View {
        ZStack {
            Path { path in
                path.move(to: CGPoint(x: 2, y: 21))
                path.addLine(to: CGPoint(x: 7, y: 16))
                path.addCurve(to: CGPoint(x: 13, y: 17), control1: CGPoint(x: 9, y: 15), control2: CGPoint(x: 11, y: 17))
                path.addLine(to: CGPoint(x: 18, y: 17))
                path.addCurve(to: CGPoint(x: 18, y: 21), control1: CGPoint(x: 21, y: 17), control2: CGPoint(x: 21, y: 21))
                path.addLine(to: CGPoint(x: 12, y: 21))
                path.move(to: CGPoint(x: 18, y: 20))
                path.addLine(to: CGPoint(x: 24, y: 16))
                path.addCurve(to: CGPoint(x: 26, y: 19), control1: CGPoint(x: 27, y: 14), control2: CGPoint(x: 29, y: 16))
                path.addLine(to: CGPoint(x: 16, y: 26))
                path.addCurve(to: CGPoint(x: 10, y: 26), control1: CGPoint(x: 14, y: 28), control2: CGPoint(x: 12, y: 28))
                path.addLine(to: CGPoint(x: 5, y: 23))
            }.stroke(style: StrokeStyle(lineWidth: 1.7, lineCap: .round, lineJoin: .round))
            Image(systemName: "heart").font(.system(size: 13, weight: .medium)).offset(x: 3, y: -8)
        }.frame(width: 30, height: 30).accessibilityHidden(true)
    }
}

struct PostSupportView: View {
    let post: LociPost
    @Environment(AppContainer.self) private var container
    @Environment(AppSession.self) private var session
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase
    @State private var catalog: PostSupportCatalog?
    @State private var products: [Product] = []
    @State private var storefront = ""
    @State private var method = "stripe"
    @State private var selection: String?
    @State private var busy = false
    @State private var didLoad = false
    @State private var message: String?
    @State private var pendingReceipt: PostSupportReceipt?
    @State private var recorded = false
    @State private var refunded = false
    @State private var generation = UUID()
    @State private var paymentEnvironment: String?
    @State private var previousIntentID: UUID?

    private var accountID: UUID? {
        guard case let .signedIn(user) = session.phase, !user.isAnonymousAccount else { return nil }
        return user.id
    }
    private var pendingIntent: UUID? { pendingReceipt?.status == .awaitingPayment ? pendingReceipt?.intentId : nil }

    private var externalAllowed: Bool { storefront == "USA" && catalog?.externalIOSAllowed == true }
    private var methods: [String] {
        guard let catalog else { return [] }
        let hasCryptoOffer = catalog.cryptoProvider == "nowpayments" ? !catalog.cryptoOffers.isEmpty
            : catalog.offers.contains { $0.currency == "USD" }
        return (externalAllowed && catalog.stripeEnabled && !catalog.offers.isEmpty ? ["stripe"] : [])
            + (externalAllowed && catalog.cryptoEnabled && hasCryptoOffer ? ["crypto"] : [])
            + (catalog.appleEnabled && !products.isEmpty ? ["apple"] : [])
    }
    private var offers: [PostSupportCatalog.Offer] {
        guard let catalog else { return [] }
        if method == "crypto", catalog.cryptoProvider == "nowpayments" { return catalog.cryptoOffers }
        return catalog.offers.filter { method != "crypto" || $0.currency == "USD" }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 22) {
                    if recorded {
                        Image(systemName: "checkmark.circle.fill").font(.system(size: 54, weight: .light))
                            .foregroundStyle(LociTheme.accent).accessibilityHidden(true)
                    } else {
                        PostSupportIcon().scaleEffect(1.6).frame(height: 54).foregroundStyle(LociTheme.accent)
                    }
                    Text(recorded ? String(localized: "Desteğin kaydedildi") : String(localized: "Yazara destek ol"))
                        .font(.title2.bold())
                    Text("Desteğinin %72’si yazara ayrılır. Kalan tutar ödeme ve platform masraflarını karşılar.")
                        .font(.callout).foregroundStyle(LociTheme.secondaryText).multilineTextAlignment(.center)
                    Label("Yazarın kimliği ve ödeme hesabı paylaşılmaz.", systemImage: "lock")
                        .font(.caption).foregroundStyle(LociTheme.secondaryText)
                    if paymentEnvironment == "sandbox" || catalog?.environment == "sandbox" {
                        Text("Test ödemesi · gerçek para değildir.").font(.caption).foregroundStyle(.orange)
                    }
                    if recorded {
                        Text("Notlar ücretsizdir. Destek göndermek görünürlüğü veya sıralamayı değiştirmez.")
                            .font(.callout).foregroundStyle(LociTheme.secondaryText)
                        Button("Yazara destek ol") { Task { await load(newSupport: true) } }.disabled(busy)
                            .accessibilityIdentifier("support-send-again")
                        Button("Nota dön") { dismiss() }.buttonStyle(LociPrimaryButtonStyle())
                    } else if refunded {
                        Button("Yazara destek ol") { Task { await load(newSupport: true) } }.disabled(busy)
                            .accessibilityIdentifier("support-send-again")
                        Button("Nota dön") { dismiss() }.buttonStyle(LociPrimaryButtonStyle())
                    } else if !didLoad {
                        ProgressView()
                    } else if pendingIntent != nil {
                        Text("Ödemenin onayı bekleniyor. Tekrar ödeme yapmana gerek yok.")
                            .font(.callout).foregroundStyle(LociTheme.secondaryText)
                        Button("Ödeme durumunu kontrol et") { Task { await refreshReceipt() } }
                            .buttonStyle(LociPrimaryButtonStyle()).disabled(busy)
                            .accessibilityIdentifier("support-check-status")
                        if pendingReceipt?.url != nil, storefront == "USA", pendingReceipt?.externalIOSAllowed == true {
                            Button("Ödemeye devam et") { Task { await resumePayment() } }.disabled(busy)
                                .accessibilityIdentifier("support-resume")
                        }
                    } else if methods.isEmpty {
                        if message == nil {
                            Text("Destek ödemeleri henüz kullanıma açık değil.")
                                .foregroundStyle(LociTheme.secondaryText)
                        }
                    } else {
                        Picker(String(localized: "Ödeme yöntemi"), selection: $method) {
                            ForEach(methods, id: \.self) { value in
                                Text(value == "crypto" ? String(localized: "Kripto") : value == "apple" ? "App Store" : "Stripe").tag(value)
                            }
                        }.pickerStyle(.segmented).disabled(busy || pendingIntent != nil)
                        if method == "apple" {
                            ForEach(products, id: \.id) { product in
                                amountButton(id: product.id, title: product.displayPrice)
                            }
                        } else {
                            ForEach(offers) { offer in amountButton(id: offer.id, title: offer.price) }
                            if method == "stripe" {
                                Text("Kartlar, Apple Pay ve diğer uygun yöntemler ödeme sayfasında gösterilir.")
                                    .font(.caption).foregroundStyle(LociTheme.secondaryText)
                            }
                        }
                        Button { Task { await pay() } } label: {
                            if busy { ProgressView().tint(.black).frame(maxWidth: .infinity) }
                            else { Text("Desteği gönder").frame(maxWidth: .infinity) }
                        }
                        .buttonStyle(LociPrimaryButtonStyle()).disabled(busy || selection == nil)
                        .accessibilityIdentifier("support-pay")
                    }
                    if let message { Text(message).font(.callout).foregroundStyle(.orange).accessibilityIdentifier("support-status") }
                    if didLoad && methods.isEmpty && pendingIntent == nil && !recorded && !refunded {
                        Button("Tekrar dene") { Task { await load() } }.disabled(busy)
                    }
                }.padding(24)
            }
            .background(LociScreenBackground())
            .navigationTitle("Yazara destek ol").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Kapat") { dismiss() }.disabled(busy) } }
            .interactiveDismissDisabled(busy)
            .task(id: [accountID, post.id]) { await load(reset: true) }
            .onChange(of: method) { _, _ in selection = method == "apple" ? products.first?.id : offers.first?.id }
            .onChange(of: scenePhase) { _, phase in if phase == .active, pendingIntent != nil { Task { await refreshReceipt() } } }
        }
    }

    private func amountButton(id: String, title: String) -> some View {
        Button { selection = id } label: {
            HStack { Text(verbatim: title).font(.headline); Spacer(); Image(systemName: selection == id ? "checkmark.circle.fill" : "circle") }
                .padding(18).foregroundStyle(selection == id ? LociTheme.accent : .white)
                .background(LociTheme.surface, in: RoundedRectangle(cornerRadius: 16))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(selection == id ? LociTheme.accent : LociTheme.hairline))
        }.buttonStyle(.plain).disabled(busy || pendingIntent != nil)
    }

    private func isCurrent(_ token: UUID, _ user: UUID?) -> Bool {
        token == generation && user != nil && user == accountID && !Task.isCancelled
    }

    private func apply(_ receipt: PostSupportReceipt) {
        recorded = receipt.recorded
        paymentEnvironment = receipt.environment
        refunded = receipt.status == .refunded
        pendingReceipt = receipt.status == .awaitingPayment ? receipt : nil
        switch receipt.status {
        case .expired: message = String(localized: "Ödeme süresi doldu. Yeniden destek gönderebilirsin.")
        case .refunded: message = String(localized: "Bu destek ödemesi iade edildi.")
        default: message = nil
        }
    }

    private func load(reset: Bool = false, newSupport: Bool = false) async {
        guard reset || !busy else { return }
        let token = UUID(), user = accountID
        generation = token; busy = true; message = nil; didLoad = false
        catalog = nil; products = []; selection = nil; pendingReceipt = nil; recorded = false; refunded = false; paymentEnvironment = nil; previousIntentID = nil
        defer { if token == generation { busy = false; didLoad = true } }
        guard user != nil else { message = PostSupportError.unavailable.localizedDescription; return }
        do {
            let country = await container.postSupport.storefrontCountry()
            guard isCurrent(token, user) else { return }
            storefront = country
            // Server-owned references recover after dismissal, process death or a lost Checkout response.
            let prior = try await container.postSupport.pending(postID: post.id)
            guard isCurrent(token, user) else { return }
            // Repeating a completed/refunded donation requires this separate, explicit action.
            if !newSupport || ![.pending, .refunded].contains(prior.status) { apply(prior) }
            else { previousIntentID = prior.intentId }
            if let id = pendingIntent, prior.processor == "stripe" {
                do {
                    let updated = try await container.postSupport.receipt(id, processor: "stripe")
                    guard isCurrent(token, user) else { return }
                    apply(updated)
                } catch { if isCurrent(token, user) { message = PostSupportError.verification.localizedDescription } }
            }
            if pendingIntent != nil || recorded || refunded { return }
            let loaded = try await container.postSupport.catalog()
            guard isCurrent(token, user) else { return }
            storefront = country; catalog = loaded
            if catalog?.appleEnabled == true {
                let loadedProducts = (try? await Product.products(for: PostSupportClient.productIDs))?.sorted { $0.price < $1.price } ?? []
                guard isCurrent(token, user) else { return }
                products = loadedProducts
            }
            method = methods.first ?? "stripe"
            selection = method == "apple" ? products.first?.id : offers.first?.id
        } catch { if isCurrent(token, user) { message = PostSupportError.unavailable.localizedDescription } }
    }

    private func pay() async {
        guard !busy, let selection else { return }; busy = true; message = nil
        let token = generation, user = accountID
        defer { if token == generation { busy = false } }
        do {
            if method == "apple", let product = products.first(where: { $0.id == selection }) {
                if let receipt = try await container.postSupport.purchase(product, postID: post.id, previousIntentID: previousIntentID) {
                    guard isCurrent(token, user) else { return }
                    apply(receipt)
                }
            } else {
                let processor = method == "crypto" ? catalog?.cryptoProvider ?? "nowpayments" : "stripe"
                let (id, url) = try await container.postSupport.externalCheckout(postID: post.id, productID: selection,
                    crypto: method == "crypto", processor: catalog?.cryptoProvider ?? "nowpayments", storefront: storefront,
                    previousIntentID: previousIntentID)
                guard isCurrent(token, user) else { return }
                pendingReceipt = PostSupportReceipt(status: .awaitingPayment, writerShareBps: 7200,
                    intentId: id, processor: processor, url: url, environment: catalog?.environment,
                    externalIOSAllowed: catalog?.externalIOSAllowed)
                paymentEnvironment = catalog?.environment
                let currentCountry = await container.postSupport.storefrontCountry()
                guard isCurrent(token, user) else { return }
                guard currentCountry == "USA" else { message = PostSupportError.unavailable.localizedDescription; return }
                openURL(url) { accepted in if !accepted, isCurrent(token, user) { message = PostSupportError.verification.localizedDescription } }
            }
        } catch {
            guard isCurrent(token, user) else { return }
            // An RPC timeout may hide a successful creation; never present another Pay button without recovery.
            catalog = nil; self.selection = nil
            if let recovered = try? await container.postSupport.pending(postID: post.id), isCurrent(token, user) { apply(recovered) }
            if isCurrent(token, user), !recorded, !refunded { message = (error as? PostSupportError)?.localizedDescription ?? PostSupportError.verification.localizedDescription }
        }
    }

    private func resumePayment() async {
        guard !busy, let url = pendingReceipt?.url, pendingReceipt?.externalIOSAllowed == true else { return }
        let token = generation, user = accountID
        busy = true
        defer { if token == generation { busy = false } }
        let country = await container.postSupport.storefrontCountry()
        guard isCurrent(token, user) else { return }
        guard country == "USA" else { message = PostSupportError.unavailable.localizedDescription; return }
        openURL(url) { accepted in if !accepted, isCurrent(token, user) { message = PostSupportError.verification.localizedDescription } }
    }

    private func refreshReceipt() async {
        guard !busy, let pendingIntent else { return }; busy = true
        let token = generation, user = accountID
        defer { if token == generation { busy = false } }
        do {
            let receipt = try await container.postSupport.receipt(pendingIntent, processor: pendingReceipt?.processor ?? "")
            guard isCurrent(token, user) else { return }
            apply(receipt)
            if receipt.status == .expired {
                busy = false
                await load()
                if isCurrent(generation, user), self.pendingIntent == nil, !recorded, !refunded {
                    message = String(localized: "Ödeme süresi doldu. Yeniden destek gönderebilirsin.")
                }
            }
        } catch { if isCurrent(token, user) { message = PostSupportError.verification.localizedDescription } }
    }
}

struct SupportEarningsView: View {
    @Environment(AppContainer.self) private var container
    @Environment(AppSession.self) private var session
    @State private var earnings: SupportEarnings?
    @State private var message: String?
    @State private var generation = UUID()
    private var accountID: UUID? {
        guard case let .signedIn(user) = session.phase, !user.isAnonymousAccount else { return nil }
        return user.id
    }
    var body: some View {
        List {
            Section {
                Text("Yalnızca sen görebilirsin.").font(.caption).foregroundStyle(.secondary)
                Text("Destek tutarının %72’si yazar kazancı olarak kaydedilir.")
            }
            if let earnings {
                ForEach(earnings.balances) { balance in
                    Section {
                        LabeledContent(String(localized: "Bekleyen kazanç"), value: balance.amount)
                        if balance.environment == "sandbox" { Text("Test ödemesi · gerçek para değildir.").font(.caption).foregroundStyle(.orange) }
                    }
                }
                if earnings.balances.isEmpty { Text("Henüz destek kazancın yok.").foregroundStyle(.secondary) }
                Text("Banka aktarımı, ödeme hesabı ve mutabakat kurulumu tamamlandığında açılacak.")
                    .font(.caption).foregroundStyle(.secondary)
            } else if let message { Text(message).foregroundStyle(.secondary) }
            else { ProgressView() }
        }
        .navigationTitle("Kazançlarım")
        .task(id: accountID) { await load() }.refreshable { await load() }
    }
    private func load() async {
        let token = UUID(), user = accountID
        generation = token; earnings = nil; message = nil
        guard user != nil else { message = PostSupportError.unavailable.localizedDescription; return }
        do {
            let loaded = try await container.postSupport.earnings()
            guard token == generation, user == accountID, !Task.isCancelled else { return }
            earnings = loaded
        } catch {
            if token == generation, user == accountID, !Task.isCancelled { message = PostSupportError.unavailable.localizedDescription }
        }
    }
}
