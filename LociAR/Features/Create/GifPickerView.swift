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
            .task(id: query) {
                // Debounce typing; an empty query loads trending GIFs immediately.
                if !query.isEmpty {
                    do { try await Task.sleep(for: .milliseconds(350)) } catch { return }
                }
                await search()
            }
        }
        .preferredColorScheme(.dark)
    }

    private func search() async {
        searchGeneration += 1
        let generation = searchGeneration
        isLoading = true
        errorMessage = nil
        defer { if generation == searchGeneration { isLoading = false } }
        do {
            let page = try await container.gifs.search(query: query.trimmingCharacters(in: .whitespacesAndNewlines), offset: 0)
            guard generation == searchGeneration else { return }
            results = page.results
            nextOffset = page.nextOffset
        } catch {
            guard generation == searchGeneration else { return }
            results = []
            nextOffset = nil
            errorMessage = (error as? GifSearchError)?.errorDescription ?? GifSearchError.unavailable.errorDescription
        }
    }

    private func loadMore() async {
        guard let offset = nextOffset, !isLoading else { return }
        let generation = searchGeneration
        isLoading = true
        defer { if generation == searchGeneration { isLoading = false } }
        guard let page = try? await container.gifs.search(query: query.trimmingCharacters(in: .whitespacesAndNewlines), offset: offset),
              generation == searchGeneration else { return }
        let known = Set(results.map(\.id))
        results.append(contentsOf: page.results.filter { !known.contains($0.id) })
        nextOffset = page.nextOffset
    }
}
