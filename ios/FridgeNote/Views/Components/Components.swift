import SwiftUI

// MARK: - Card

struct Card<Content: View>: View {
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0, content: content)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(Theme.Spacing.lg)
            .background(Theme.surface)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg))
            .shadow(color: .black.opacity(0.06), radius: 4, x: 0, y: 1)
    }
}

// MARK: - Button

enum AppButtonVariant {
    case primary, secondary, danger, ghost
}

struct AppButton: View {
    let title: String
    var variant: AppButtonVariant
    var loading: Bool
    var fullWidth: Bool
    let action: () -> Void

    @Environment(\.isEnabled) private var isEnabled

    // private な @Environment を持つと memberwise init が private になるため、明示的に定義する。
    init(
        title: String,
        variant: AppButtonVariant = .primary,
        loading: Bool = false,
        fullWidth: Bool = true,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.variant = variant
        self.loading = loading
        self.fullWidth = fullWidth
        self.action = action
    }

    private var foreground: Color {
        switch variant {
        case .primary, .danger: return .white
        case .secondary: return Theme.primaryDark
        case .ghost: return Theme.textMuted
        }
    }

    private var background: Color {
        switch variant {
        case .primary: return Theme.primary
        case .secondary: return Theme.primaryLight
        case .danger: return Theme.danger
        case .ghost: return .clear
        }
    }

    var body: some View {
        Button(action: action) {
            Group {
                if loading {
                    ProgressView()
                        .tint(variant == .secondary || variant == .ghost ? Theme.primary : .white)
                } else {
                    Text(title).font(.system(size: 16, weight: .semibold))
                }
            }
            .foregroundStyle(foreground)
            .padding(.vertical, 14)
            .padding(.horizontal, Theme.Spacing.lg)
            .frame(maxWidth: fullWidth ? .infinity : nil)
            .background(background)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
        }
        .disabled(loading)
        .opacity(loading || !isEnabled ? 0.5 : 1)
    }
}

// MARK: - Tiles

struct ActionTile: View {
    let emoji: String
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Text(emoji).font(.system(size: 26))
                Text(label)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.text)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, Theme.Spacing.md)
            .background(Theme.surface)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg))
            .overlay(RoundedRectangle(cornerRadius: Theme.Radius.lg).stroke(Theme.border, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

struct MenuTile: View {
    let emoji: String
    let label: String
    let description: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: Theme.Spacing.md) {
                Text(emoji).font(.system(size: 28))
                VStack(alignment: .leading, spacing: 2) {
                    Text(label)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(Theme.text)
                    Text(description)
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.textMuted)
                        .multilineTextAlignment(.leading)
                }
                Spacer(minLength: 0)
                Text("›").font(.system(size: 22)).foregroundStyle(Theme.textFaint)
            }
            .padding(Theme.Spacing.lg)
            .background(Theme.surface)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.lg))
            .overlay(RoundedRectangle(cornerRadius: Theme.Radius.lg).stroke(Theme.border, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

struct IconButton: View {
    let emoji: String
    let accessibilityLabel: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(emoji)
                .font(.system(size: 15))
                .frame(width: 32, height: 32)
                .background(Theme.background)
                .clipShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityLabel)
    }
}

// MARK: - Inputs

struct AppTextField: View {
    let placeholder: String
    @Binding var text: String
    var keyboard: UIKeyboardType = .default
    var secure = false
    var autocapitalize = true

    var body: some View {
        Group {
            if secure {
                SecureField(placeholder, text: $text)
            } else {
                TextField(placeholder, text: $text)
            }
        }
        .keyboardType(keyboard)
        .textInputAutocapitalization(autocapitalize ? .sentences : .never)
        .autocorrectionDisabled(!autocapitalize)
        .font(.system(size: 16))
        .foregroundStyle(Theme.text)
        .padding(.vertical, 12)
        .padding(.horizontal, Theme.Spacing.md)
        .background(Theme.background)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
        .overlay(RoundedRectangle(cornerRadius: Theme.Radius.md).stroke(Theme.border, lineWidth: 1))
    }
}

struct LabeledField: View {
    let label: String
    var placeholder = ""
    @Binding var text: String
    var keyboard: UIKeyboardType = .default

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.textMuted)
            AppTextField(placeholder: placeholder, text: $text, keyboard: keyboard)
        }
        .padding(.bottom, Theme.Spacing.md)
    }
}

/// タップで入力値を正式名称に置き換えるサジェストチップ。
struct IngredientSuggestionsView: View {
    let suggestions: [IngredientCandidate]
    let onSelect: (String) -> Void

    var body: some View {
        if !suggestions.isEmpty {
            FlowLayout(spacing: Theme.Spacing.xs) {
                ForEach(suggestions) { s in
                    Button {
                        onSelect(s.name)
                    } label: {
                        Text(s.name)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(Theme.primaryDark)
                            .padding(.vertical, 4)
                            .padding(.horizontal, 10)
                            .background(Theme.primaryLight)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.bottom, Theme.Spacing.sm)
        }
    }
}

/// 折り返しレイアウト(iOS 16 の Layout プロトコル)。
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        arrange(in: proposal.width ?? .infinity, subviews: subviews).size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrange(in: bounds.width, subviews: subviews)
        for (index, origin) in result.origins.enumerated() {
            subviews[index].place(
                at: CGPoint(x: bounds.minX + origin.x, y: bounds.minY + origin.y),
                proposal: .unspecified
            )
        }
    }

    private func arrange(in width: CGFloat, subviews: Subviews) -> (size: CGSize, origins: [CGPoint]) {
        var origins: [CGPoint] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var maxX: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            origins.append(CGPoint(x: x, y: y))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
            maxX = max(maxX, x - spacing)
        }
        return (CGSize(width: maxX, height: y + rowHeight), origins)
    }
}

// MARK: - Indicators

struct ExpiryBadge: View {
    let status: ExpiryStatus

    var body: some View {
        switch status {
        case .expired: badge("⚠️ 期限切れ", background: Theme.dangerLight, color: Theme.danger)
        case .soon: badge("⏰ まもなく期限", background: Theme.warningLight, color: Theme.warning)
        case .ok, .none: EmptyView()
        }
    }

    private func badge(_ label: String, background: Color, color: Color) -> some View {
        Text(label)
            .font(.system(size: 12, weight: .bold))
            .foregroundStyle(color)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(background)
            .clipShape(Capsule())
    }
}

struct ConfidenceBar: View {
    let confidence: Double

    var body: some View {
        let percent = Int((confidence * 100).rounded())
        let color = confidence < LOW_CONFIDENCE_THRESHOLD ? Theme.warning : Theme.success
        HStack(spacing: 8) {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.border)
                    Capsule().fill(color)
                        .frame(width: geo.size.width * CGFloat(min(max(confidence, 0), 1)))
                }
            }
            .frame(height: 6)
            Text("\(percent)%")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(color)
                .frame(width: 38, alignment: .trailing)
        }
    }
}

struct LowConfidenceNotice: View {
    let confidence: Double

    var body: some View {
        if confidence < LOW_CONFIDENCE_THRESHOLD {
            Text("💡 確信度が低めです。内容を確認してください")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.warning)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, Theme.Spacing.sm)
                .padding(.horizontal, Theme.Spacing.md)
                .background(Theme.warningLight)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
        }
    }
}

struct EmptyStateView: View {
    let emoji: String
    let message: String

    var body: some View {
        VStack(spacing: Theme.Spacing.sm) {
            Text(emoji).font(.system(size: 40))
            Text(message).font(.appBodyMuted).foregroundStyle(Theme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, Theme.Spacing.xxl)
    }
}

struct WaitingView: View {
    let message: String

    var body: some View {
        VStack(spacing: 6) {
            ProgressView().controlSize(.large).tint(Theme.primary)
            Text(message)
                .font(.appBody.weight(.semibold))
                .foregroundStyle(Theme.text)
                .padding(.top, 12)
            Text("少々お待ちください...")
                .font(.appBodyMuted)
                .foregroundStyle(Theme.textMuted)
        }
        .padding(Theme.Spacing.xl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.background)
    }
}

/// 解析失敗・タイムアウト時に手動登録へ誘導する。
struct ManualFallbackView: View {
    let message: String
    @EnvironmentObject private var router: Router

    init(message: String) {
        self.message = message
    }

    var body: some View {
        VStack(spacing: 0) {
            Text("😕").font(.system(size: 40)).padding(.bottom, Theme.Spacing.md)
            Text(message)
                .font(.appBody)
                .foregroundStyle(Theme.text)
                .multilineTextAlignment(.center)
                .padding(.bottom, Theme.Spacing.lg)
            AppButton(title: "手動で登録する", fullWidth: false) {
                router.replaceTop(with: .addItemManual)
            }
            .frame(minWidth: 200)
        }
        .padding(Theme.Spacing.xl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.background)
    }
}

extension View {
    /// 画面共通の背景色。
    func screenBackground() -> some View {
        background(Theme.background.ignoresSafeArea())
    }
}
