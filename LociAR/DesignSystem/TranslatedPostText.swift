import SwiftUI
@preconcurrency import Translation

/// Only accepts already-authorized text. Locked rows pass no content to the translation framework.
struct TranslatedPostText: View {
    let text: String
    var isReadable = true
    var allowsControls = false
    var lineLimit: Int? = nil
    var showsText = true
    var onDisplayTextChange: ((String?) -> Void)? = nil

    var body: some View {
        if #available(iOS 18.0, *) {
            DeviceTranslatedPostText(text: text, isReadable: isReadable, allowsControls: allowsControls, lineLimit: lineLimit,
                                     showsText: showsText, onDisplayTextChange: onDisplayTextChange)
        } else {
            if showsText { Text(verbatim: isReadable ? text : "").lineLimit(lineLimit) }
        }
    }
}

@available(iOS 18.0, *)
private struct DeviceTranslatedPostText: View {
    let text: String
    let isReadable: Bool
    let allowsControls: Bool
    let lineLimit: Int?
    let showsText: Bool
    let onDisplayTextChange: ((String?) -> Void)?
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage(NoteTranslationPreference.key) private var automatic = true
    @State private var state = NoteTranslationState()
    @State private var readiness: Readiness = .checking
    @State private var configuration: TranslationSession.Configuration?
    @State private var operation: Operation?
    @State private var isRunning = false
    @State private var failed = false

    private enum Readiness: Equatable { case checking, sameLanguage, installed, downloadable, unsupported }
    private struct Identity: Equatable {
        let request: NoteTranslationRequest?
        let automatic: Bool
        let active: Bool
    }
    private struct Operation {
        let request: NoteTranslationRequest
        let generation: UUID
        let permitsDownload: Bool
    }
    private var request: NoteTranslationRequest? {
        NoteTranslationRequest(text: text, targetLanguage: NoteTranslationRequest.appLanguage(), isReadable: isReadable)
    }
    private var identity: Identity { Identity(request: request, automatic: automatic, active: scenePhase == .active) }
    private var displayedTranslation: String? {
        guard let request, state.request == request, !state.showsOriginal else { return nil }
        return state.translatedText
    }

    var body: some View {
        // Capture the job for this modifier, not mutable state from a later request/configuration.
        let job = operation
        VStack(alignment: .leading, spacing: 6) {
            if let request {
                if showsText { Text(verbatim: state.displayedText(for: request)).lineLimit(lineLimit) }
                if state.request == request, state.translatedText != nil {
                    HStack(spacing: 8) {
                        Text("Cihazında çevrildi").foregroundStyle(.secondary)
                        if allowsControls {
                            Button(state.showsOriginal ? String(localized: "Çeviriyi göster") : String(localized: "Orijinali göster")) {
                                state.toggleOriginal()
                            }.accessibilityIdentifier("note-translation-original")
                        }
                    }.font(.caption)
                } else if allowsControls, readiness != .sameLanguage {
                    controls
                }
            } else {
                if showsText { Text(verbatim: isReadable ? text : "").lineLimit(lineLimit) }
            }
        }
        .task(id: identity) { await prepare() }
        .translationTask(configuration) { session in
            guard let job else { return }
            await translate(using: session, operation: job)
        }
        .onChange(of: displayedTranslation, initial: true) { _, value in onDisplayTextChange?(value) }
        .onDisappear { clear(); onDisplayTextChange?(nil) }
    }

    @ViewBuilder private var controls: some View {
        if isRunning {
            HStack(spacing: 6) { ProgressView(); Text("Çevriliyor…") }.font(.caption)
        } else if readiness == .installed || readiness == .downloadable {
            Button { start(permitsDownload: true) } label: { Label("Çevir", systemImage: "translate") }
                .font(.caption).accessibilityIdentifier("note-translate")
            if failed {
                Text("Çeviri tamamlanamadı. Tekrar deneyebilirsin.").font(.caption).foregroundStyle(.secondary)
            } else if readiness == .downloadable {
                Text("Çeviri için dil paketi indirmen gerekebilir.").font(.caption).foregroundStyle(.secondary)
            }
        } else if readiness == .unsupported {
            Text("Bu cihazda veya dilde çeviri kullanılamıyor.")
                .font(.caption).foregroundStyle(.secondary).accessibilityIdentifier("note-translation-unavailable")
        }
    }

    @MainActor private func prepare() async {
        clear()
        guard scenePhase == .active, let request else { return }
        state.reset(to: request)
        let generation = state.generation
        if request.isAlreadyInTargetLanguage { readiness = .sameLanguage; return }
#if targetEnvironment(simulator)
        // Apple does not run Translation models in iOS simulators. Do not fake a translation.
        readiness = .unsupported
#else
        let availability = availability()
        do {
            let status = try await availability.status(for: request.original, to: Locale.Language(identifier: request.targetLanguage))
            guard !Task.isCancelled, state.generation == generation, self.request == request else { return }
            switch status {
            case .installed: readiness = .installed
            case .supported: readiness = .downloadable
            case .unsupported: readiness = .unsupported
            @unknown default: readiness = .unsupported
            }
            if automatic && readiness == .installed { start(permitsDownload: false) }
        } catch {
            guard !Task.isCancelled, state.generation == generation else { return }
            readiness = .unsupported
        }
#endif
    }

    @MainActor private func availability() -> LanguageAvailability {
        if #available(iOS 26.4, *) { return LanguageAvailability(preferredStrategy: .lowLatency) }
        return LanguageAvailability()
    }

    @MainActor private func start(permitsDownload: Bool) {
        guard !isRunning, scenePhase == .active, let request, state.request == request else { return }
        failed = false; isRunning = true
        operation = Operation(request: request, generation: state.generation, permitsDownload: permitsDownload)
        let source = request.detectedSource.map { Locale.Language(identifier: $0) }
        let target = Locale.Language(identifier: request.targetLanguage)
        if configuration != nil { configuration?.invalidate() }
        else if #available(iOS 26.4, *) {
            configuration = TranslationSession.Configuration(source: source, target: target, preferredStrategy: .lowLatency)
        } else { configuration = TranslationSession.Configuration(source: source, target: target) }
    }

    @MainActor private func translate(using session: TranslationSession, operation job: Operation) async {
        guard isCurrent(job) else { return }
        defer { if isCurrent(job) { isRunning = false } }
        do {
            if job.permitsDownload { try await session.prepareTranslation() }
            else {
                let status = try await availability().status(for: job.request.original, to: Locale.Language(identifier: job.request.targetLanguage))
                guard isCurrent(job) else { return }
                guard status == .installed else { readiness = status == .supported ? .downloadable : .unsupported; return }
            }
            guard isCurrent(job) else { return }
            let result = try await session.translate(job.request.original)
            guard isCurrent(job), NoteTranslationRequest.canonicalLanguage(result.targetLanguage.minimalIdentifier) == job.request.targetLanguage else { return }
            if state.accept(result.targetText, generation: job.generation) { readiness = .installed }
            else { failed = true }
        } catch {
            if isCurrent(job) { failed = true }
        }
    }

    @MainActor private func isCurrent(_ job: Operation) -> Bool {
        !Task.isCancelled && scenePhase == .active && state.generation == job.generation && request == job.request
    }

    @MainActor private func clear() {
        state.reset(to: nil); configuration = nil; operation = nil; isRunning = false; failed = false; readiness = .checking
    }
}
