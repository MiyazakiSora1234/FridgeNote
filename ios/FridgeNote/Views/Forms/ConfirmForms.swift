import SwiftUI

// AI/OCR/文字起こしの出力は、ここでユーザーが確認・修正して確定するまで在庫に反映しない。

// MARK: - 食材1点

struct FoodConfirmView: View {
    let analysisId: String
    let result: FoodAnalysisResult

    @EnvironmentObject private var router: Router
    @State private var name: String
    @State private var quantity: String
    @State private var unit: String
    @State private var expiresAt: String
    @State private var submitting = false
    @State private var alert: AlertInfo?
    @StateObject private var suggester = IngredientSuggester()

    init(analysisId: String, result: FoodAnalysisResult) {
        self.analysisId = analysisId
        self.result = result
        _name = State(initialValue: result.name)
        _quantity = State(initialValue: formatQuantity(result.quantity))
        _unit = State(initialValue: result.unit)
        _expiresAt = State(initialValue: result.expiresAtEstimate ?? "")
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.lg) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("認識結果を確認してください").font(.appHeading).foregroundStyle(Theme.text)
                    Text("内容を確認・修正してから登録してください。")
                        .font(.appBodyMuted)
                        .foregroundStyle(Theme.textMuted)
                }

                Card {
                    VStack(alignment: .leading, spacing: 2) {
                        LowConfidenceNotice(confidence: result.confidence)
                        ConfidenceBar(confidence: result.confidence)
                            .padding(.bottom, Theme.Spacing.sm)
                        LabeledField(label: "食材名", text: $name)
                        IngredientSuggestionsView(suggestions: suggester.suggestions) { name = $0 }
                        LabeledField(label: "数量", text: $quantity, keyboard: .decimalPad)
                        LabeledField(label: "単位", text: $unit)
                        LabeledField(label: "賞味期限(推定・修正可)", placeholder: "YYYY-MM-DD", text: $expiresAt)
                    }
                }

                AppButton(title: submitting ? "登録中..." : "この内容で登録する", loading: submitting) {
                    Task { await confirm() }
                }
            }
            .padding(Theme.Spacing.lg)
        }
        .scrollDismissesKeyboard(.interactively)
        .screenBackground()
        .onAppear { suggester.update(query: name) }
        .onChange(of: name) { suggester.update(query: $0) }
        .alertInfo($alert)
    }

    private func confirm() async {
        guard let quantityNum = QuantityValidation.parsePositiveQuantity(quantity),
              !name.trimmingCharacters(in: .whitespaces).isEmpty,
              QuantityValidation.isNonEmptyUnit(unit)
        else {
            alert = AlertInfo("入力内容を確認してください")
            return
        }
        submitting = true
        defer { submitting = false }
        do {
            let trimmedExpiry = expiresAt.trimmingCharacters(in: .whitespaces)
            try await APIClient.shared.createFridgeItem(
                CreateFridgeItemBody(
                    ingredientName: name.trimmingCharacters(in: .whitespaces),
                    quantity: quantityNum,
                    unit: unit.trimmingCharacters(in: .whitespaces),
                    expiresAt: trimmedExpiry.isEmpty ? nil : trimmedExpiry,
                    sourceAnalysisId: analysisId
                )
            )
            router.popToRoot()
        } catch {
            alert = AlertInfo("登録に失敗しました", error: error)
        }
    }
}

// MARK: - 料理(使った食材を減らす)

struct DishConfirmView: View {
    private struct Draft: Identifiable {
        let id: String // ingredientId
        let name: String
        let confidence: Double
        var checked = true
        var quantity = "1"
        var unit = ""
    }

    let analysisId: String
    let dish: String

    @EnvironmentObject private var router: Router
    @State private var drafts: [Draft]
    @State private var submitting = false
    @State private var alert: AlertInfo?

    init(analysisId: String, dish: String, ingredients: [DishAnalysisIngredient]) {
        self.analysisId = analysisId
        self.dish = dish
        _drafts = State(
            initialValue: ingredients.map { Draft(id: $0.ingredientId, name: $0.name, confidence: $0.confidence) }
        )
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                Text("🍽️ \(dish)").font(.appHeading).foregroundStyle(Theme.text)
                Text("使ったものだけチェックして、数量を確認してから確定してください。在庫は確定するまで変わりません。")
                    .font(.appBodyMuted)
                    .foregroundStyle(Theme.textMuted)
                    .padding(.bottom, Theme.Spacing.xs)

                ForEach($drafts) { $draft in
                    Card {
                        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                            HStack(spacing: Theme.Spacing.sm) {
                                Toggle("", isOn: $draft.checked).labelsHidden().tint(Theme.primary)
                                Text(draft.name)
                                    .font(.system(size: 16, weight: .bold))
                                    .foregroundStyle(Theme.text)
                                Spacer(minLength: 0)
                            }
                            ConfidenceBar(confidence: draft.confidence)
                            LowConfidenceNotice(confidence: draft.confidence)
                            if draft.checked {
                                HStack(spacing: Theme.Spacing.sm) {
                                    AppTextField(placeholder: "数量", text: $draft.quantity, keyboard: .decimalPad)
                                    AppTextField(placeholder: "単位(g/個等)", text: $draft.unit)
                                }
                            }
                        }
                    }
                    .opacity(draft.checked ? 1 : 0.55)
                }

                AppButton(title: submitting ? "更新中..." : "使用した食材を確定する", loading: submitting) {
                    Task { await confirm() }
                }
            }
            .padding(Theme.Spacing.lg)
        }
        .scrollDismissesKeyboard(.interactively)
        .screenBackground()
        .alertInfo($alert)
    }

    private func confirm() async {
        let selected = drafts.filter(\.checked)
        if selected.isEmpty {
            alert = AlertInfo("使用した食材を1つ以上選択してください")
            return
        }
        var consumed: [ConsumedIngredientBody] = []
        for draft in selected {
            guard let quantity = QuantityValidation.parsePositiveQuantity(draft.quantity),
                  QuantityValidation.isNonEmptyUnit(draft.unit)
            else {
                alert = AlertInfo("\(draft.name) の数量・単位を正しく入力してください")
                return
            }
            consumed.append(
                ConsumedIngredientBody(
                    ingredientId: draft.id,
                    quantity: quantity,
                    unit: draft.unit.trimmingCharacters(in: .whitespaces)
                )
            )
        }
        submitting = true
        defer { submitting = false }
        do {
            try await APIClient.shared.consume(ConsumeBody(sourceAnalysisId: analysisId, consumedIngredients: consumed))
            router.popToRoot()
        } catch {
            alert = AlertInfo("在庫の更新に失敗しました", error: error)
        }
    }
}

// MARK: - レシート・音声(まとめて追加)

struct ParsedItemsBulkView: View {
    struct Draft: Identifiable {
        let id = UUID()
        var name: String
        let confidence: Double
        var checked: Bool
        var quantity: String
        var unit: String
    }

    let analysisId: String
    let source: String // "receipt" | "voice"
    let title: String

    @EnvironmentObject private var router: Router
    @State private var drafts: [Draft]
    @State private var submitting = false
    @State private var alert: AlertInfo?

    init(analysisId: String, source: String, items: [ParsedIngredientItem], title: String) {
        self.analysisId = analysisId
        self.source = source
        self.title = title
        _drafts = State(
            initialValue: items.map {
                Draft(
                    name: $0.name,
                    confidence: $0.confidence,
                    checked: !$0.belowConfidenceThreshold,
                    quantity: formatQuantity($0.quantity),
                    unit: $0.unit
                )
            }
        )
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                Text(title).font(.appHeading).foregroundStyle(Theme.text)
                Text("内容を確認し、追加したいものだけチェックしてから確定してください。確定するまで在庫は変わりません。")
                    .font(.appBodyMuted)
                    .foregroundStyle(Theme.textMuted)
                    .padding(.bottom, Theme.Spacing.xs)

                ForEach($drafts) { $draft in
                    ParsedItemRow(draft: $draft)
                }

                AppButton(title: submitting ? "追加中..." : "すべて追加する", loading: submitting) {
                    Task { await confirm() }
                }
            }
            .padding(Theme.Spacing.lg)
        }
        .scrollDismissesKeyboard(.interactively)
        .screenBackground()
        .alertInfo($alert)
    }

    private func confirm() async {
        let selected = drafts.filter(\.checked)
        if selected.isEmpty {
            alert = AlertInfo("追加する食材を1つ以上選択してください")
            return
        }
        var bodyItems: [BulkItemBody] = []
        for draft in selected {
            let name = draft.name.trimmingCharacters(in: .whitespaces)
            guard !name.isEmpty,
                  let quantity = QuantityValidation.parsePositiveQuantity(draft.quantity),
                  QuantityValidation.isNonEmptyUnit(draft.unit)
            else {
                alert = AlertInfo("\(name.isEmpty ? "項目" : name) の内容を正しく入力してください")
                return
            }
            bodyItems.append(
                BulkItemBody(ingredientName: name, quantity: quantity, unit: draft.unit.trimmingCharacters(in: .whitespaces))
            )
        }
        submitting = true
        defer { submitting = false }
        do {
            try await APIClient.shared.createFridgeItemsBulk(
                BulkCreateBody(source: source, sourceAnalysisId: analysisId, items: bodyItems)
            )
            router.popToRoot()
        } catch {
            alert = AlertInfo("追加に失敗しました", error: error)
        }
    }
}

private struct ParsedItemRow: View {
    @Binding var draft: ParsedItemsBulkView.Draft
    @StateObject private var suggester = IngredientSuggester()

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                HStack(spacing: Theme.Spacing.sm) {
                    Toggle("", isOn: $draft.checked).labelsHidden().tint(Theme.primary)
                    AppTextField(placeholder: "食材名", text: $draft.name)
                        .fontWeight(.bold)
                }
                IngredientSuggestionsView(suggestions: suggester.suggestions) { draft.name = $0 }
                ConfidenceBar(confidence: draft.confidence)
                LowConfidenceNotice(confidence: draft.confidence)
                if draft.checked {
                    HStack(spacing: Theme.Spacing.sm) {
                        AppTextField(placeholder: "数量", text: $draft.quantity, keyboard: .decimalPad)
                        AppTextField(placeholder: "単位(g/個等)", text: $draft.unit)
                    }
                }
            }
        }
        .opacity(draft.checked ? 1 : 0.55)
        .onAppear { suggester.update(query: draft.name) }
        .onChange(of: draft.name) { suggester.update(query: $0) }
    }
}
