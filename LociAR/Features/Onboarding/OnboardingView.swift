import SwiftUI

struct OnboardingView: View {
    let onComplete: () -> Void
    @State private var currentStep = 0

    private struct OnboardingStep {
        let title: String
        let subtitle: String
        let description: String
        let symbol: String
        let accentColor: Color
    }

    private let steps: [OnboardingStep] = [
        OnboardingStep(
            title: String(localized: "Fiziksel Dünyaya Sabitle"),
            subtitle: String(localized: "Mekânsal İçerik Üretimi"),
            description: String(localized: "Düşüncelerini ve favori sosyal medya bağlantılarını (Spotify, YouTube, Instagram...) gerçek duvarlara ve mekânlara AR yüzey kilitleme ile sabitle."),
            symbol: "location.viewfinder",
            accentColor: LociTheme.accent
        ),
        OnboardingStep(
            title: String(localized: "Mekânları Keşfet"),
            subtitle: String(localized: "Çevrendeki Dijital İzler"),
            description: String(localized: "Şehrinde yürürken diğer kaşiflerin bıraktığı mekânsal paylaşımları tam konumlarında AR kameranla keşfet."),
            symbol: "map.fill",
            accentColor: Color.blue
        ),
        OnboardingStep(
            title: String(localized: "Güvenli ve Kontrolünde"),
            subtitle: String(localized: "Kamera ve Konum İzinleri"),
            description: String(localized: "Kameran sadece yüzey algılamak, konumun ise yakındaki postları açmak için kullanılır. Gizliliğin daima koruma altında."),
            symbol: "shield.checkered",
            accentColor: Color.purple
        )
    ]

    var body: some View {
        ZStack {
            LociTheme.spatialGradient.ignoresSafeArea()

            VStack(spacing: 0) {
                HStack {
                    Spacer()
                    if currentStep < steps.count - 1 {
                        Button("Atla") {
                            withAnimation(.easeInOut) { onComplete() }
                        }
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(LociTheme.secondaryText)
                        .padding(.horizontal, 24)
                        .padding(.top, 16)
                    }
                }

                TabView(selection: $currentStep) {
                    ForEach(0..<steps.count, id: \.self) { index in
                        stepView(steps[index])
                            .tag(index)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .always))

                bottomControlBar
                    .padding(.horizontal, 24)
                    .padding(.bottom, 36)
            }
        }
        .preferredColorScheme(.dark)
        .accessibilityIdentifier("screen-onboarding")
    }

    private func stepView(_ step: OnboardingStep) -> some View {
        VStack(spacing: 28) {
            Spacer()

            ZStack {
                Circle()
                    .fill(step.accentColor.opacity(0.12))
                    .frame(width: 140, height: 140)
                    .blur(radius: 20)

                Circle()
                    .stroke(step.accentColor.opacity(0.3), lineWidth: 1.5)
                    .frame(width: 110, height: 110)

                Image(systemName: step.symbol)
                    .font(.system(size: 52, weight: .semibold))
                    .foregroundStyle(step.accentColor)
            }

            VStack(spacing: 10) {
                Text(step.subtitle.localizedUI)
                    .textCase(.uppercase)
                    .font(.caption.weight(.bold))
                    .tracking(2)
                    .foregroundStyle(step.accentColor)

                Text(step.title.localizedUI)
                    .font(.title.bold())
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)

                Text(step.description.localizedUI)
                    .font(.body)
                    .foregroundStyle(LociTheme.secondaryText)
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
                    .padding(.horizontal, 16)
            }

            Spacer()
        }
        .padding(.horizontal, 20)
    }

    private var bottomControlBar: some View {
        VStack(spacing: 12) {
            if currentStep == steps.count - 1 {
                Button {
                    requestPermissionsAndFinish()
                } label: {
                    Label("Başlayalım", systemImage: "arrow.right.circle.fill")
                }
                .buttonStyle(LociPrimaryButtonStyle())
                .accessibilityIdentifier("onboarding-finish")
            } else {
                Button {
                    withAnimation(.easeInOut) {
                        currentStep += 1
                    }
                } label: {
                    Text("Devam Et")
                }
                .buttonStyle(LociPrimaryButtonStyle())
                .accessibilityIdentifier("onboarding-next")
            }
        }
    }

    /// Camera and location are requested in context (AR screen, map, publish), where the system
    /// prompt makes sense to the user; asking here out of context invites a denial.
    private func requestPermissionsAndFinish() {
        withAnimation(.easeInOut) {
            onComplete()
        }
    }
}
