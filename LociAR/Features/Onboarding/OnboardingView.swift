import SwiftUI

struct OnboardingView: View {
    let onComplete: () -> Void
    @State private var currentStep = 0

    private struct OnboardingStep {
        let title: String
        let description: String
        let symbol: String
        let accentColor: Color
    }

    private let steps: [OnboardingStep] = [
        OnboardingStep(
            title: String(localized: "Bulunduğun yere not bırak"),
            description: String(localized: "İstersen AR ile bir yüzeye sabitle."),
            symbol: "location.viewfinder",
            accentColor: LociTheme.accent
        ),
        OnboardingStep(
            title: String(localized: "Yakınındaki notları keşfet"),
            description: String(localized: "Haritada bul, konum notlarını yerinde aç."),
            symbol: "map.fill",
            accentColor: LociTheme.discoveryAccent
        ),
        OnboardingStep(
            title: String(localized: "Üyeliğinle gir, nasıl paylaşacağını seç"),
            description: String(localized: "Notların varsayılan olarak anonimdir. İstersen kullanıcı adını gösterebilirsin."),
            symbol: "shield.checkered",
            accentColor: LociTheme.identityAccent
        )
    ]

    var body: some View {
        ZStack {
            LociTheme.spatialGradient.ignoresSafeArea()

            VStack(spacing: 0) {
                HStack {
                    Spacer()
                    Button("Atla") {
                        withAnimation(.easeInOut) { onComplete() }
                    }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(LociTheme.secondaryText)
                    .padding(.horizontal, LociTheme.Spacing.xl)
                    .padding(.top, LociTheme.Spacing.l)
                    .opacity(currentStep < steps.count - 1 ? 1 : 0)
                    .disabled(currentStep >= steps.count - 1)
                }
                .frame(minHeight: 44)

                TabView(selection: $currentStep) {
                    ForEach(0..<steps.count, id: \.self) { index in
                        stepView(steps[index])
                            .tag(index)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))

                pageDots
                    .padding(.bottom, LociTheme.Spacing.l)

                bottomControlBar
                    .padding(.horizontal, LociTheme.Spacing.xl)
                    .padding(.bottom, LociTheme.Spacing.xxxl)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("screen-onboarding")
    }

    private func stepView(_ step: OnboardingStep) -> some View {
        VStack(spacing: LociTheme.Spacing.xxl) {
            Spacer()

            ZStack {
                Circle()
                    .fill(step.accentColor.opacity(0.12))
                    .frame(width: 140, height: 140)
                    .blur(radius: 20)

                Circle()
                    .stroke(step.accentColor.opacity(0.3), lineWidth: LociTheme.Stroke.subtle)
                    .frame(width: 110, height: 110)

                Image(systemName: step.symbol)
                    .font(.system(size: 52, weight: .semibold))
                    .foregroundStyle(step.accentColor)
            }

            VStack(spacing: LociTheme.Spacing.m) {
                Text(step.title.localizedUI)
                    .font(.title.bold())
                    .foregroundStyle(LociTheme.textPrimary)
                    .multilineTextAlignment(.center)

                Text(step.description.localizedUI)
                    .font(.body)
                    .foregroundStyle(LociTheme.secondaryText)
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
                    .padding(.horizontal, LociTheme.Spacing.l)
            }
            // Top-aligned in a shared minimum height so the icon sits at the same place on every page.
            .frame(minHeight: 190, alignment: .top)

            Spacer()
        }
        .padding(.horizontal, LociTheme.Spacing.xl2)
    }

    /// Own page dots: the system ones are pale grey on the light background and nearly invisible.
    private var pageDots: some View {
        HStack(spacing: LociTheme.Spacing.s) {
            ForEach(0..<steps.count, id: \.self) { index in
                Capsule()
                    .fill(index == currentStep ? LociTheme.accent : LociTheme.tertiaryText.opacity(0.4))
                    .frame(width: index == currentStep ? 22 : 8, height: 8)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: currentStep)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: "\(currentStep + 1) / \(steps.count)"))
    }

    private var bottomControlBar: some View {
        VStack(spacing: LociTheme.Spacing.m) {
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
                    Text("Devam et")
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
