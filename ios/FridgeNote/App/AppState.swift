import SwiftUI

enum Route: Hashable {
    case addMenu
    case consumeMenu
    case addItemManual
    case consumeManual
    case camera(AnalysisType)
    case analysisResult(String)
    case voiceRecord
    case voiceConfirm(String)
    case household
}

/// 在庫一覧をルートとするナビゲーション状態。
@MainActor
final class Router: ObservableObject {
    @Published var path: [Route] = []

    func push(_ route: Route) { path.append(route) }

    /// 現在の画面を置き換える(戻るボタンで元の画面に戻らせたくない遷移用)。
    func replaceTop(with route: Route) {
        if !path.isEmpty { path.removeLast() }
        path.append(route)
    }

    func popToRoot() { path.removeAll() }

    func pop() { if !path.isEmpty { path.removeLast() } }
}

/// サインイン状態。起動時に Keychain のセッションを復元する。
@MainActor
final class AuthViewModel: ObservableObject {
    @Published private(set) var isLoading = true
    @Published private(set) var isSignedIn = false

    func bootstrap() async {
        _ = await AuthService.shared.validIdToken()
        isSignedIn = await AuthService.shared.hasSession
        isLoading = false
    }

    func signIn(email: String, password: String) async throws {
        try await AuthService.shared.signIn(email: email, password: password)
        isSignedIn = true
    }

    func signOut() async {
        await AuthService.shared.signOut()
        isSignedIn = false
    }
}
