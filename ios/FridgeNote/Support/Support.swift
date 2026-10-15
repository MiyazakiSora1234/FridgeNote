import SwiftUI
import UIKit

// MARK: - 入力検証

enum QuantityValidation {
    static func parsePositiveQuantity(_ input: String) -> Double? {
        guard let value = Double(input.trimmingCharacters(in: .whitespaces)),
              value.isFinite, value > 0
        else { return nil }
        return value
    }

    static func isNonEmptyUnit(_ unit: String) -> Bool {
        !unit.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

/// 数量表示用。整数値は小数点なしで表示する(300.0 → "300")。
func formatQuantity(_ value: Double) -> String {
    value.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(value)) : String(value)
}

extension Error {
    var displayMessage: String {
        (self as? LocalizedError)?.errorDescription ?? localizedDescription
    }
}

// MARK: - アラート

struct AlertInfo: Identifiable {
    let id = UUID()
    let title: String
    let message: String?

    init(_ title: String, message: String? = nil) {
        self.title = title
        self.message = message
    }

    init(_ title: String, error: Error) {
        self.title = title
        self.message = error.displayMessage
    }
}

extension View {
    func alertInfo(_ info: Binding<AlertInfo?>) -> some View {
        alert(
            info.wrappedValue?.title ?? "",
            isPresented: Binding(
                get: { info.wrappedValue != nil },
                set: { if !$0 { info.wrappedValue = nil } }
            ),
            presenting: info.wrappedValue
        ) { _ in
            Button("OK", role: .cancel) {}
        } message: { alertInfo in
            if let message = alertInfo.message { Text(message) }
        }
    }
}

// MARK: - 画像の事前圧縮

/// S3アップロード容量とBedrock送信量を抑えるための圧縮(コスト要件: 月1,000円以下)。
enum ImagePrep {
    static let maxDimension: CGFloat = 1280
    static let jpegQuality: CGFloat = 0.7
    static let contentType = "image/jpeg"

    struct PrepError: LocalizedError {
        var errorDescription: String? { "画像を読み込めませんでした" }
    }

    static func jpegForUpload(from data: Data) throws -> Data {
        guard let image = UIImage(data: data) else { throw PrepError() }
        let longest = max(image.size.width, image.size.height)
        let ratio = longest > maxDimension ? maxDimension / longest : 1
        let target = CGSize(width: (image.size.width * ratio).rounded(), height: (image.size.height * ratio).rounded())

        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        let renderer = UIGraphicsImageRenderer(size: target, format: format)
        let resized = renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: target)) // 向き(EXIF)もここで焼き込まれる
        }
        guard let jpeg = resized.jpegData(compressionQuality: jpegQuality) else { throw PrepError() }
        return jpeg
    }
}

// MARK: - 食材名サジェスト

/// タップで入力値を正式名称に置き換え、表記ゆれによる食材マスターの意図しない増殖を防ぐ。
@MainActor
final class IngredientSuggester: ObservableObject {
    @Published private(set) var suggestions: [IngredientCandidate] = []
    private var task: Task<Void, Never>?
    private static let debounce: UInt64 = 300_000_000

    func update(query: String) {
        task?.cancel()
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            suggestions = []
            return
        }
        task = Task {
            try? await Task.sleep(nanoseconds: IngredientSuggester.debounce)
            if Task.isCancelled { return }
            let result = (try? await APIClient.shared.searchIngredients(query: trimmed, limit: 5)) ?? []
            if Task.isCancelled { return }
            suggestions = result
        }
    }
}

// MARK: - 解析結果のポーリング

@MainActor
final class AnalysisPoller<T>: ObservableObject {
    @Published private(set) var data: T?
    @Published private(set) var timedOut = false
    @Published private(set) var error: Error?

    private let intervalNanos: UInt64 = 3_000_000_000
    private let maxPolls = 30

    /// `.task` から呼ぶ。ビューが消えるとキャンセルされる。
    func run(fetch: () async throws -> T, isPending: (T) -> Bool) async {
        data = nil
        timedOut = false
        error = nil
        var polls = 0
        while !Task.isCancelled {
            // バックグラウンド中は無駄なAPIコールを避け、フォアグラウンド復帰時に再開する。
            while UIApplication.shared.applicationState != .active {
                if Task.isCancelled { return }
                try? await Task.sleep(nanoseconds: 1_000_000_000)
            }
            do {
                let result = try await fetch()
                if Task.isCancelled { return }
                data = result
                guard isPending(result) else { return }
                polls += 1
                if polls >= maxPolls {
                    timedOut = true
                    return
                }
            } catch {
                if !Task.isCancelled { self.error = error }
                return
            }
            try? await Task.sleep(nanoseconds: intervalNanos)
        }
    }
}
