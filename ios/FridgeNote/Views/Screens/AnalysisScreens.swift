import SwiftUI

struct AnalysisResultView: View {
    let analysisId: String

    @StateObject private var poller = AnalysisPoller<ImageAnalysis>()

    init(analysisId: String) {
        self.analysisId = analysisId
    }

    var body: some View {
        content
            .task(id: analysisId) {
                await poller.run(
                    fetch: { try await APIClient.shared.getAnalysis(analysisId) },
                    isPending: { $0.status.isPending }
                )
            }
    }

    @ViewBuilder
    private var content: some View {
        if poller.timedOut {
            ManualFallbackView(message: "解析に時間がかかっています。手動で登録してください。")
        } else if poller.error != nil, poller.data == nil {
            ManualFallbackView(message: "解析結果を取得できませんでした。手動で登録してください。")
        } else if let analysis = poller.data, !analysis.status.isPending {
            if analysis.status == .failed {
                ManualFallbackView(message: "画像を解析できませんでした。手動で登録してください。")
            } else if let result = analysis.result {
                switch result {
                case .food(let food):
                    FoodConfirmView(analysisId: analysisId, result: food)
                case .receipt(let receipt):
                    ParsedItemsBulkView(
                        analysisId: analysisId,
                        source: "receipt",
                        items: receipt.items,
                        title: "🧾 レシートの読み取り結果"
                    )
                case .dish(let dish):
                    DishConfirmView(analysisId: analysisId, dish: dish.dish, ingredients: dish.ingredients)
                }
            } else {
                ManualFallbackView(message: "解析結果を取得できませんでした。手動で登録してください。")
            }
        } else {
            WaitingView(message: "🔍 画像を解析しています")
        }
    }
}
