import SwiftUI

struct SignInView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @State private var email = ""
    @State private var password = ""
    @State private var error: String?
    @State private var submitting = false

    var body: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.lg) {
                VStack(spacing: 2) {
                    Text("🧊").font(.system(size: 48)).padding(.bottom, Theme.Spacing.sm)
                    Text("FridgeNote").font(.appTitle).foregroundStyle(Theme.text)
                    Text("写真で冷蔵庫を管理しよう").font(.appBodyMuted).foregroundStyle(Theme.textMuted)
                }
                .padding(.bottom, Theme.Spacing.sm)

                Card {
                    VStack(spacing: Theme.Spacing.md) {
                        AppTextField(
                            placeholder: "メールアドレス",
                            text: $email,
                            keyboard: .emailAddress,
                            autocapitalize: false
                        )
                        AppTextField(placeholder: "パスワード", text: $password, secure: true, autocapitalize: false)
                        if let error {
                            Text(error)
                                .font(.system(size: 13))
                                .foregroundStyle(Theme.danger)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        AppButton(title: submitting ? "サインイン中..." : "サインイン", loading: submitting) {
                            Task { await submit() }
                        }
                    }
                }

                NavigationLink {
                    SignUpView()
                } label: {
                    Text("新規登録はこちら")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Theme.textMuted)
                        .padding(.vertical, 14)
                }
            }
            .padding(Theme.Spacing.lg)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .screenBackground()
        .toolbar(.hidden, for: .navigationBar)
    }

    private func submit() async {
        error = nil
        submitting = true
        defer { submitting = false }
        do {
            try await auth.signIn(email: email.trimmingCharacters(in: .whitespaces), password: password)
        } catch {
            self.error = error.displayMessage
        }
    }
}

struct SignUpView: View {
    @Environment(\.dismiss) private var dismiss

    private enum Step { case register, confirm }

    @State private var step: Step = .register
    @State private var email = ""
    @State private var password = ""
    @State private var code = ""
    @State private var error: String?
    @State private var submitting = false

    var body: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.lg) {
                switch step {
                case .register: registerForm
                case .confirm: confirmForm
                }
            }
            .padding(Theme.Spacing.lg)
        }
        .scrollDismissesKeyboard(.interactively)
        .screenBackground()
        .navigationTitle("新規登録")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var registerForm: some View {
        Card {
            VStack(spacing: Theme.Spacing.md) {
                AppTextField(placeholder: "メールアドレス", text: $email, keyboard: .emailAddress, autocapitalize: false)
                AppTextField(placeholder: "パスワード(8文字以上)", text: $password, secure: true, autocapitalize: false)
                errorText
                AppButton(title: submitting ? "登録中..." : "登録する", loading: submitting) {
                    Task { await register() }
                }
            }
        }
    }

    private var confirmForm: some View {
        VStack(spacing: Theme.Spacing.lg) {
            VStack(spacing: Theme.Spacing.sm) {
                Text("確認コードを入力").font(.appHeading).foregroundStyle(Theme.text)
                Text("\(email) に届いた確認コードを入力してください")
                    .font(.appBodyMuted)
                    .foregroundStyle(Theme.textMuted)
                    .multilineTextAlignment(.center)
            }
            Card {
                VStack(spacing: Theme.Spacing.md) {
                    AppTextField(placeholder: "確認コード", text: $code, keyboard: .numberPad, autocapitalize: false)
                    errorText
                    AppButton(title: submitting ? "確認中..." : "確認する", loading: submitting) {
                        Task { await confirm() }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var errorText: some View {
        if let error {
            Text(error)
                .font(.system(size: 13))
                .foregroundStyle(Theme.danger)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func register() async {
        error = nil
        submitting = true
        defer { submitting = false }
        do {
            try await AuthService.shared.signUp(email: email.trimmingCharacters(in: .whitespaces), password: password)
            step = .confirm
        } catch {
            self.error = error.displayMessage
        }
    }

    private func confirm() async {
        error = nil
        submitting = true
        defer { submitting = false }
        do {
            try await AuthService.shared.confirmSignUp(
                email: email.trimmingCharacters(in: .whitespaces),
                code: code.trimmingCharacters(in: .whitespaces)
            )
            dismiss() // サインイン画面へ戻る
        } catch {
            self.error = error.displayMessage
        }
    }
}
