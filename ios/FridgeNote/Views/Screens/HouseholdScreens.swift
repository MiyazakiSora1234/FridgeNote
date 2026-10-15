import SwiftUI

// MARK: - 家族で共有(世帯)

struct HouseholdView: View {
    @EnvironmentObject private var router: Router

    @State private var household: Household?
    @State private var loading = false
    @State private var invite: HouseholdInvite?
    @State private var inviting = false
    @State private var joinCode = ""
    @State private var displayName = ""
    @State private var joining = false
    @State private var alert: AlertInfo?
    @State private var confirmLeave = false
    @State private var memberToRemove: HouseholdMember?

    private var members: [HouseholdMember] { household?.members ?? [] }
    /// 自分が世帯オーナーで、他のメンバーがまだいない状態(=個人利用)。この場合のみ他の世帯へ参加できる。
    private var isSolo: Bool { (household?.isOwner ?? true) && members.count <= 1 }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.lg) {
                Text("同じ冷蔵庫を家族と共有します。参加すると、参加先の冷蔵庫の在庫が表示・編集されます。")
                    .font(.appBodyMuted)
                    .foregroundStyle(Theme.textMuted)

                membersSection
                inviteSection
                if isSolo { joinSection }
                if let household, !household.isOwner { leaveSection }
            }
            .padding(.horizontal, Theme.Spacing.lg)
            .padding(.bottom, Theme.Spacing.xl)
        }
        .refreshable { await load() }
        .screenBackground()
        .onAppear { Task { await load() } }
        .alertInfo($alert)
        .alert("この世帯から退出しますか?", isPresented: $confirmLeave) {
            Button("キャンセル", role: .cancel) {}
            Button("退出", role: .destructive) { Task { await leave() } }
        } message: {
            Text("退出すると、参加前にあなたが登録していた冷蔵庫に戻ります。")
        }
        .alert(
            "メンバーを削除しますか?",
            isPresented: Binding(get: { memberToRemove != nil }, set: { if !$0 { memberToRemove = nil } }),
            presenting: memberToRemove
        ) { member in
            Button("キャンセル", role: .cancel) {}
            Button("削除", role: .destructive) { Task { await remove(member) } }
        } message: { member in
            Text("\(label(for: member)) をこの世帯から外します。")
        }
    }

    // MARK: セクション

    private var membersSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            Text("メンバー(\(members.count)人)").font(.appHeading).foregroundStyle(Theme.text)
            if loading && household == nil {
                ProgressView().frame(maxWidth: .infinity)
            }
            ForEach(members) { member in
                Card {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(label(for: member))
                                .font(.system(size: 16, weight: .bold))
                                .foregroundStyle(Theme.text)
                            Text(member.isOwner ? "オーナー" : "メンバー")
                                .font(.appCaption)
                                .foregroundStyle(Theme.textFaint)
                        }
                        Spacer()
                        if (household?.isOwner ?? false) && !member.isSelf {
                            Button("削除") { memberToRemove = member }
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(Theme.danger)
                        }
                    }
                }
            }
        }
    }

    private var inviteSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            Text("家族を招待").font(.appHeading).foregroundStyle(Theme.text)
            Card {
                VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                    if let invite {
                        Text(formatCode(invite.code))
                            .font(.system(size: 32, weight: .bold, design: .monospaced))
                            .foregroundStyle(Theme.primaryDark)
                            .textSelection(.enabled)
                        Text("1回だけ使えます。有効期限: \(expiryText(invite.expiresAt))")
                            .font(.appCaption)
                            .foregroundStyle(Theme.textMuted)
                        ShareLink(item: "FridgeNoteで冷蔵庫を共有しよう。招待コード: \(formatCode(invite.code))") {
                            Text("コードを共有")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundStyle(Theme.primaryDark)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(Theme.primaryLight)
                                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
                        }
                    }
                    AppButton(
                        title: invite == nil ? "招待コードを発行" : "新しいコードを発行",
                        variant: invite == nil ? .primary : .secondary,
                        loading: inviting
                    ) { Task { await createInvite() } }
                }
            }
        }
    }

    private var joinSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            Text("コードで参加").font(.appHeading).foregroundStyle(Theme.text)
            Card {
                VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                    LabeledField(label: "招待コード", placeholder: "XXXX-XXXX", text: $joinCode)
                    LabeledField(label: "表示名(任意)", placeholder: "例: お母さん", text: $displayName)
                    AppButton(title: "参加する", loading: joining) { Task { await join() } }
                        .disabled(normalizedJoinCode.count < 8)
                    Text("参加中は、いま登録している自分の冷蔵庫は表示されません(退出すると元に戻ります)。")
                        .font(.appCaption)
                        .foregroundStyle(Theme.textFaint)
                }
            }
        }
    }

    private var leaveSection: some View {
        AppButton(title: "この世帯から退出", variant: .danger) { confirmLeave = true }
    }

    // MARK: 表示整形

    private func label(for member: HouseholdMember) -> String {
        var name = member.displayName ?? (member.isOwner ? "オーナー" : "メンバー")
        if member.isSelf { name += "(あなた)" }
        return name
    }

    private var normalizedJoinCode: String {
        joinCode.filter { $0.isLetter || $0.isNumber }.uppercased()
    }

    private func formatCode(_ code: String) -> String {
        guard code.count == 8 else { return code }
        return "\(code.prefix(4))-\(code.suffix(4))"
    }

    private func expiryText(_ iso: String) -> String {
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = parser.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
        guard let date else { return iso }
        return date.formatted(date: .abbreviated, time: .shortened)
    }

    // MARK: 操作

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            household = try await APIClient.shared.getHousehold()
        } catch {
            alert = AlertInfo("読み込みに失敗しました", error: error)
        }
    }

    private func createInvite() async {
        inviting = true
        defer { inviting = false }
        do {
            invite = try await APIClient.shared.createHouseholdInvite()
        } catch {
            alert = AlertInfo("招待コードを発行できませんでした", error: error)
        }
    }

    private func join() async {
        joining = true
        defer { joining = false }
        let name = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            household = try await APIClient.shared.joinHousehold(
                code: normalizedJoinCode,
                displayName: name.isEmpty ? nil : name
            )
            joinCode = ""
            displayName = ""
            invite = nil
            alert = AlertInfo("参加しました", message: "家族の冷蔵庫が表示されます。")
        } catch {
            alert = AlertInfo("参加できませんでした", error: error)
        }
    }

    private func leave() async {
        do {
            try await APIClient.shared.leaveHousehold()
            invite = nil
            await load()
        } catch {
            alert = AlertInfo("退出できませんでした", error: error)
        }
    }

    private func remove(_ member: HouseholdMember) async {
        do {
            try await APIClient.shared.removeHouseholdMember(member.userId)
            await load()
        } catch {
            alert = AlertInfo("削除できませんでした", error: error)
        }
    }
}
