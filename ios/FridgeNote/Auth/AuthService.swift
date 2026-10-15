import Foundation

/// トークンの保持・更新を一手に引き受ける。API クライアントは `validIdToken()` だけを使う。
actor AuthService {
    static let shared = AuthService()

    private let cognito = CognitoClient()
    private var tokens: AuthTokens? = TokenStore.load()

    /// 有効期限まで余裕がなければ更新する。
    private static let refreshMargin: TimeInterval = 60

    var hasSession: Bool { tokens != nil }
    var email: String? { tokens?.email }

    func signUp(email: String, password: String) async throws {
        try await cognito.signUp(email: email, password: password)
    }

    func confirmSignUp(email: String, code: String) async throws {
        try await cognito.confirmSignUp(email: email, code: code)
    }

    func signIn(email: String, password: String) async throws {
        let newTokens = try await cognito.signIn(email: email, password: password)
        tokens = newTokens
        TokenStore.save(newTokens)
    }

    func signOut() async {
        if let current = tokens {
            // サーバー側の Refresh Token も失効させる。ベストエフォートで、失敗してもローカルは必ずサインアウトする。
            try? await cognito.globalSignOut(accessToken: current.accessToken)
        }
        tokens = nil
        TokenStore.clear()
    }

    /// 有効な ID Token を返す。未サインイン、またはセッションが失効している場合は nil。
    func validIdToken() async -> String? {
        guard let current = tokens else { return nil }
        if current.expiresAt.timeIntervalSinceNow > AuthService.refreshMargin {
            return current.idToken
        }
        do {
            let refreshed = try await cognito.refresh(current)
            tokens = refreshed
            TokenStore.save(refreshed)
            return refreshed.idToken
        } catch let error as CognitoError where error.code == "NotAuthorizedException" {
            // Refresh Token が失効・無効化された。再サインインが必要。
            tokens = nil
            TokenStore.clear()
            return nil
        } catch {
            // 圏外などの一時的な失敗ではセッションを残し、次回以降に再試行する。
            return nil
        }
    }
}
