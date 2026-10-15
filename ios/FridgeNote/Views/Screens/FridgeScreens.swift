import SwiftUI

private let categoryLabels: [String: String] = [
    "vegetable": "🥦 野菜",
    "fruit": "🍎 果物",
    "meat": "🥩 肉",
    "fish": "🐟 魚",
    "dairy": "🥛 乳製品",
    "seasoning": "🧂 調味料",
    "grain": "🌾 穀物",
    "other": "📦 その他",
]

private func categoryLabel(_ category: String) -> String {
    categoryLabels[category] ?? category
}

// MARK: - 在庫一覧

struct FridgeListView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @EnvironmentObject private var router: Router

    @State private var items: [FridgeItem] = []
    @State private var loading = false
    @State private var alert: AlertInfo?
    @State private var itemToDelete: FridgeItem?

    private var expiredCount: Int { items.filter { $0.expiryStatus == .expired }.count }
    private var soonCount: Int { items.filter { $0.expiryStatus == .soon }.count }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.lg) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("🧊 冷蔵庫").font(.appTitle).foregroundStyle(Theme.text)
                    Text(summaryText).font(.appBodyMuted).foregroundStyle(Theme.textMuted)
                }

                HStack(spacing: Theme.Spacing.sm) {
                    ActionTile(emoji: "➕", label: "追加する") { router.push(.addMenu) }
                    ActionTile(emoji: "➖", label: "減らす") { router.push(.consumeMenu) }
                }

                if items.isEmpty && !loading {
                    EmptyStateView(emoji: "🥬", message: "まだ何も登録されていません")
                } else {
                    LazyVStack(spacing: Theme.Spacing.sm) {
                        ForEach(items) { item in
                            row(for: item)
                        }
                    }
                }

                Button {
                    router.push(.household)
                } label: {
                    Text("👪 家族で共有")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.primaryDark)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Theme.Spacing.md)
                }

                Button {
                    Task { await auth.signOut() }
                } label: {
                    Text("サインアウト")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.textFaint)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Theme.Spacing.md)
                }
            }
            .padding(.horizontal, Theme.Spacing.lg)
            .padding(.bottom, Theme.Spacing.xl)
        }
        .refreshable { await load() }
        .screenBackground()
        .toolbar(.hidden, for: .navigationBar)
        .onAppear {
            // 初回表示と、追加・減算画面から戻ったときに最新化する。
            Task { await load() }
        }
        .alertInfo($alert)
        .alert(
            "削除しますか?",
            isPresented: Binding(get: { itemToDelete != nil }, set: { if !$0 { itemToDelete = nil } }),
            presenting: itemToDelete
        ) { item in
            Button("キャンセル", role: .cancel) {}
            Button("削除", role: .destructive) { Task { await delete(item) } }
        } message: { item in
            Text("\(item.name) を冷蔵庫から削除します")
        }
    }

    private var summaryText: String {
        var text = "\(items.count)品"
        if expiredCount > 0 { text += " ・ 期限切れ \(expiredCount)件" }
        if soonCount > 0 { text += " ・ まもなく期限 \(soonCount)件" }
        return text
    }

    private func row(for item: FridgeItem) -> some View {
        Card {
            HStack(spacing: Theme.Spacing.sm) {
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: Theme.Spacing.sm) {
                        Text(item.name).font(.system(size: 16, weight: .bold)).foregroundStyle(Theme.text)
                        ExpiryBadge(status: item.expiryStatus)
                    }
                    Text("\(formatQuantity(item.quantity))\(item.unit) ・ \(categoryLabel(item.category))")
                        .font(.appBodyMuted)
                        .foregroundStyle(Theme.textMuted)
                    if let expiresAt = item.expiresAt {
                        Text("賞味期限 \(expiresAt)")
                            .font(.appCaption)
                            .foregroundStyle(Theme.textFaint)
                            .padding(.top, 2)
                    }
                }
                Spacer(minLength: 0)
                IconButton(emoji: "🗑️", accessibilityLabel: "\(item.name)を削除") { itemToDelete = item }
            }
        }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            items = try await APIClient.shared.listFridgeItems()
        } catch {
            if !(error is CancellationError), (error as? URLError)?.code != .cancelled {
                alert = AlertInfo("取得に失敗しました", error: error)
            }
        }
    }

    private func delete(_ item: FridgeItem) async {
        do {
            try await APIClient.shared.deleteFridgeItem(item.itemId)
            await load()
        } catch {
            alert = AlertInfo("削除に失敗しました", error: error)
        }
    }
}

// MARK: - メニュー

struct AddMenuView: View {
    @EnvironmentObject private var router: Router

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                Text("追加したい方法を選んでください。")
                    .font(.appBodyMuted)
                    .foregroundStyle(Theme.textMuted)
                MenuTile(emoji: "📷", label: "食材を撮影", description: "1点をその場で撮影して登録") {
                    router.push(.camera(.food))
                }
                MenuTile(emoji: "🧾", label: "レシートを撮影", description: "買い物のレシートからまとめて登録") {
                    router.push(.camera(.receipt))
                }
                MenuTile(emoji: "🎤", label: "話して追加", description: "買った物を声で伝える") {
                    router.push(.voiceRecord)
                }
                MenuTile(emoji: "✏️", label: "手動で入力", description: "1件ずつ自分で入力する") {
                    router.push(.addItemManual)
                }
            }
            .padding(Theme.Spacing.lg)
        }
        .screenBackground()
    }
}

struct ConsumeMenuView: View {
    @EnvironmentObject private var router: Router

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                Text("減らしたい方法を選んでください。")
                    .font(.appBodyMuted)
                    .foregroundStyle(Theme.textMuted)
                MenuTile(emoji: "🍽️", label: "料理から減らす", description: "食べた料理を撮影して使った分を確認") {
                    router.push(.camera(.dish))
                }
                MenuTile(emoji: "✏️", label: "手動で減らす", description: "数量を自分で入力して減らす") {
                    router.push(.consumeManual)
                }
            }
            .padding(Theme.Spacing.lg)
        }
        .screenBackground()
    }
}

// MARK: - 手動登録

struct AddItemManualView: View {
    @EnvironmentObject private var router: Router

    @State private var name = ""
    @State private var quantity = "1"
    @State private var unit = "個"
    @State private var expiresAt = ""
    @State private var submitting = false
    @State private var alert: AlertInfo?
    @StateObject private var suggester = IngredientSuggester()

    var body: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.lg) {
                Card {
                    LabeledField(label: "食材名", placeholder: "例: トマト", text: $name)
                    IngredientSuggestionsView(suggestions: suggester.suggestions) { name = $0 }
                    LabeledField(label: "数量", text: $quantity, keyboard: .decimalPad)
                    LabeledField(label: "単位", placeholder: "例: 個 / g / ml", text: $unit)
                    LabeledField(label: "賞味期限(任意)", placeholder: "YYYY-MM-DD", text: $expiresAt)
                }
                AppButton(title: submitting ? "登録中..." : "登録する", loading: submitting) {
                    Task { await submit() }
                }
            }
            .padding(Theme.Spacing.lg)
        }
        .scrollDismissesKeyboard(.interactively)
        .screenBackground()
        .onChange(of: name) { suggester.update(query: $0) }
        .alertInfo($alert)
    }

    private func submit() async {
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
                    sourceAnalysisId: nil
                )
            )
            router.popToRoot()
        } catch {
            alert = AlertInfo("登録に失敗しました", error: error)
        }
    }
}

// MARK: - 手動で減らす

struct ConsumeManualView: View {
    @State private var items: [FridgeItem] = []
    @State private var loading = false
    @State private var amounts: [String: String] = [:]
    @State private var submittingItemId: String?
    @State private var alert: AlertInfo?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                Text("減らす数量を入力して確定してください。")
                    .font(.appBodyMuted)
                    .foregroundStyle(Theme.textMuted)
                    .padding(.bottom, Theme.Spacing.sm)

                if items.isEmpty && !loading {
                    EmptyStateView(emoji: "🥬", message: "在庫がありません")
                } else {
                    ForEach(items) { item in
                        row(for: item)
                    }
                }
            }
            .padding(Theme.Spacing.lg)
        }
        .scrollDismissesKeyboard(.interactively)
        .refreshable { await load() }
        .screenBackground()
        .task { await load() }
        .alertInfo($alert)
    }

    private func row(for item: FridgeItem) -> some View {
        Card {
            HStack(spacing: Theme.Spacing.sm) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.name).font(.system(size: 16, weight: .bold)).foregroundStyle(Theme.text)
                    Text("在庫: \(formatQuantity(item.quantity))\(item.unit)")
                        .font(.appBodyMuted)
                        .foregroundStyle(Theme.textMuted)
                }
                Spacer(minLength: 0)
                AppTextField(
                    placeholder: "数量",
                    text: Binding(
                        get: { amounts[item.itemId] ?? "" },
                        set: { amounts[item.itemId] = $0 }
                    ),
                    keyboard: .decimalPad
                )
                .multilineTextAlignment(.center)
                .frame(width: 80)
                .accessibilityIdentifier("consumeAmountField")
                AppButton(
                    title: "減らす",
                    loading: submittingItemId == item.itemId,
                    fullWidth: false
                ) {
                    Task { await consume(item) }
                }
                .disabled(submittingItemId != nil)
                .accessibilityIdentifier("consumeSubmitButton")
            }
        }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            items = try await APIClient.shared.listFridgeItems()
        } catch {
            if (error as? URLError)?.code != .cancelled {
                alert = AlertInfo("取得に失敗しました", error: error)
            }
        }
    }

    private func consume(_ item: FridgeItem) async {
        guard submittingItemId == nil else { return }
        guard let amount = QuantityValidation.parsePositiveQuantity(amounts[item.itemId] ?? "") else {
            alert = AlertInfo("減らす数量を入力してください")
            return
        }
        if amount > item.quantity {
            alert = AlertInfo("在庫(\(formatQuantity(item.quantity))\(item.unit))を超えています")
            return
        }
        submittingItemId = item.itemId
        defer { submittingItemId = nil }
        do {
            // decrementByはサーバー側で原子的に減算されるため、他端末との同時実行でも減算が失われない。
            try await APIClient.shared.updateFridgeItem(item.itemId, patch: UpdateFridgeItemBody(decrementBy: amount))
            amounts[item.itemId] = ""
            await load()
        } catch let error as APIError where error.status == 409 {
            alert = AlertInfo("在庫が変わっていたため減らせませんでした", message: "最新の在庫を確認してください")
            await load()
        } catch {
            alert = AlertInfo("更新に失敗しました", error: error)
        }
    }
}
