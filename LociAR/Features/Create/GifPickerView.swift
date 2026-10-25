import SwiftUI

/// GIPHY search for the post editor. An empty search shows trending GIFs. Results come from the
/// `searchGifs` callable; the picker only ever hands back a `GifReference` (an id and a size).
struct GifPickerView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppContainer.self) private var container
    let onPick: (GifReference) -> Void

    @State private var query = ""
    @State private var results: [GifSearchResult] = []
    @State private var nextOffset: Int?
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var searchGeneration = 0
    @State private var activeQuery: String?
    @State private var paginationGate = ScreenRefreshGate()

    private var normalizedQuery: String { GifSearchQuery.normalized(query) }

    private let columns = [GridItem(.flexible(), spacing: 6), GridItem(.flexible(), spacing: 6)]

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVGrid(columns: columns, spacing: 6) {
                    ForEach(results) { result in
                        Button {
                            onPick(result.gif)
                            dismiss()
                        } label: {
                            AnimatedGIFView(url: result.gif.previewURL, contentMode: .fill)
                                .aspectRatio(min(max(result.gif.aspectRatio, 0.6), 1.8), contentMode: .fit)
                                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(result.title.isEmpty ? String(localized: "GIF") : result.title)
                        .accessibilityIdentifier("gif-result")
                        .onAppear {
                            if result.id == results.last?.id { Task { await loadMore() } }
                        }
                    }
                }
                .padding(.horizontal, 10)
                if isLoading {
                    ProgressView().tint(LociTheme.accent).padding()
                } else if let errorMessage {
                    LociInlineNotice(title: String(localized: "GIF"), message: errorMessage, symbol: "exclamationmark.triangle.fill", color: .orange)
                        .padding()
                } else if results.isEmpty {
                    Text("GIF bulunamadı.")
                        .font(.subheadline).foregroundStyle(.secondary).padding(.top, 40)
                }
            }
            .background(LociTheme.background)
            .safeAreaInset(edge: .bottom) {
                // GIPHY's API terms require visible attribution wherever its results are shown.
                Text(verbatim: "Powered by GIPHY")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(.ultraThinMaterial)
                    .accessibilityIdentifier("gif-attribution")
            }
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: Text("GIF ara"))
            .navigationTitle("GIF seç")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Kapat") { dismiss() } }
            }
            .task(id: normalizedQuery) {
                searchGeneration += 1
                let generation = searchGeneration, requestedQuery = normalizedQuery
                activeQuery = requestedQuery
                results = []; nextOffset = nil; errorMessage = nil; isLoading = true
                // Debounce typing; an empty query loads trending GIFs immediately.
                if !requestedQuery.isEmpty {
                    do { try await Task.sleep(for: .milliseconds(350)) } catch { return }
                }
                guard !Task.isCancelled else { return }
                await search(query: requestedQuery, generation: generation)
            }
        }
        .preferredColorScheme(.dark)
    }

    private func search(query: String, generation: Int) async {
        isLoading = true
        errorMessage = nil
        defer { if generation == searchGeneration { isLoading = false } }
        do {
            let page = try await container.gifs.search(query: query, offset: 0)
            guard !Task.isCancelled, generation == searchGeneration, query == normalizedQuery else { return }
            results = page.results
            nextOffset = page.nextOffset
        } catch {
            guard !Task.isCancelled, generation == searchGeneration, query == normalizedQuery else { return }
            results = []
            nextOffset = nil
            errorMessage = (error as? GifSearchError)?.errorDescription ?? GifSearchError.unavailable.errorDescription
        }
    }

    private func loadMore() async {
        let requestedQuery = normalizedQuery
        guard let offset = nextOffset, !isLoading, activeQuery == requestedQuery else { return }
        let revision = ClientReadCaches.generation
        guard let ticket = paginationGate.begin(scope: "\(requestedQuery)|\(offset)", revision: revision, force: true) else { return }
        var succeeded = false
        var failure: Error?
        let generation = searchGeneration
        isLoading = true
        defer {
            if generation == searchGeneration { isLoading = false }
            paginationGate.finish(ticket, succeeded: succeeded, error: failure)
        }
        do {
            let page = try await container.gifs.search(query: requestedQuery, offset: offset)
            guard !Task.isCancelled, generation == searchGeneration, requestedQuery == normalizedQuery else { return }
            let known = Set(results.map(\.id))
            results.append(contentsOf: page.results.filter { !known.contains($0.id) })
            nextOffset = page.nextOffset; succeeded = true
        } catch {
            guard !Task.isCancelled, generation == searchGeneration, requestedQuery == normalizedQuery else { return }
            failure = error
            errorMessage = (error as? GifSearchError)?.errorDescription ?? GifSearchError.unavailable.errorDescription
        }
    }
}
