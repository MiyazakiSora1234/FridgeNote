import SwiftUI

@main
struct FridgeNoteApp: App {
    @StateObject private var auth = AuthViewModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(auth)
                .tint(Theme.primary)
                .task { await auth.bootstrap() }
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var auth: AuthViewModel

    var body: some View {
        if auth.isLoading {
            ProgressView()
                .controlSize(.large)
                .tint(Theme.primary)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .screenBackground()
        } else if auth.isSignedIn {
            MainView()
        } else {
            AuthFlowView()
        }
    }
}

/// サインイン後のナビゲーション。
struct MainView: View {
    @StateObject private var router = Router()

    var body: some View {
        NavigationStack(path: $router.path) {
            FridgeListView()
                .navigationDestination(for: Route.self) { route in
                    switch route {
                    case .addMenu:
                        AddMenuView().navigationTitle("追加する")
                    case .consumeMenu:
                        ConsumeMenuView().navigationTitle("減らす")
                    case .addItemManual:
                        AddItemManualView().navigationTitle("食材を登録")
                    case .consumeManual:
                        ConsumeManualView().navigationTitle("手動で減らす")
                    case .camera(let type):
                        CameraScreen(analysisType: type)
                    case .analysisResult(let id):
                        AnalysisResultView(analysisId: id)
                            .navigationTitle("解析結果")
                            .navigationBarBackButtonHidden(true)
                    case .voiceRecord:
                        VoiceRecordView().navigationTitle("音声で追加")
                    case .voiceConfirm(let id):
                        VoiceConfirmView(analysisId: id)
                            .navigationTitle("認識結果の確認")
                            .navigationBarBackButtonHidden(true)
                    case .household:
                        HouseholdView().navigationTitle("家族で共有")
                    }
                }
        }
        .environmentObject(router)
    }
}

/// 未サインイン時のナビゲーション。
struct AuthFlowView: View {
    var body: some View {
        NavigationStack {
            SignInView()
        }
    }
}
