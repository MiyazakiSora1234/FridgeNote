import Foundation

struct APIError: LocalizedError {
    let status: Int
    let code: String
    let message: String

    var errorDescription: String? { message }
}

private struct ErrorEnvelope: Decodable {
    struct Body: Decodable {
        let code: String?
        let message: String?
    }
    let error: Body?
}

// MARK: - リクエストボディ

struct CreateFridgeItemBody: Encodable {
    let ingredientName: String
    let quantity: Double
    let unit: String
    let expiresAt: String?
    let sourceAnalysisId: String?

    enum CodingKeys: String, CodingKey { case ingredientName, quantity, unit, expiresAt, sourceAnalysisId }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(ingredientName, forKey: .ingredientName)
        try c.encode(quantity, forKey: .quantity)
        try c.encode(unit, forKey: .unit)
        try c.encode(expiresAt, forKey: .expiresAt) // 未指定は null として明示的に送る
        try c.encodeIfPresent(sourceAnalysisId, forKey: .sourceAnalysisId)
    }
}

struct BulkItemBody: Encodable {
    let ingredientName: String
    let quantity: Double
    let unit: String
}

struct BulkCreateBody: Encodable {
    let source: String
    let sourceAnalysisId: String?
    let items: [BulkItemBody]
}

struct ConsumedIngredientBody: Encodable {
    let ingredientId: String
    let quantity: Double
    let unit: String
}

struct ConsumeBody: Encodable {
    let sourceAnalysisId: String
    let consumedIngredients: [ConsumedIngredientBody]
}

struct UpdateFridgeItemBody: Encodable {
    var quantity: Double?
    var decrementBy: Double?
    var unit: String?
}

private struct PresignBody: Encodable { let contentType: String }
private struct CreateAnalysisBody: Encodable { let imageKey: String; let type: String }
private struct CreateVoiceBody: Encodable { let audioKey: String }
private struct SearchBody: Encodable { let query: String; let limit: Int? }
private struct JoinHouseholdBody: Encodable { let code: String; let displayName: String? }

// MARK: - クライアント

final class APIClient {
    static let shared = APIClient()

    private let baseURL = AppConfig.apiBaseUrl
    private let session = URLSession.shared
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    private func send(_ path: String, method: String = "GET", body: Data? = nil) async throws -> Data {
        guard let idToken = await AuthService.shared.validIdToken() else {
            throw APIError(status: 401, code: "UNAUTHENTICATED", message: "サインインが必要です")
        }
        guard let url = URL(string: baseURL + path) else {
            throw APIError(status: 0, code: "INVALID_URL", message: "URLが不正です: \(path)")
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("Bearer \(idToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = body

        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let envelope = try? decoder.decode(ErrorEnvelope.self, from: data)
            throw APIError(
                status: status,
                code: envelope?.error?.code ?? "UNKNOWN_ERROR",
                message: envelope?.error?.message ?? "request failed with status \(status)"
            )
        }
        return data
    }

    private func request<T: Decodable>(
        _ path: String,
        method: String = "GET",
        body: (any Encodable)? = nil
    ) async throws -> T {
        let bodyData = try body.map { try encoder.encode(AnyEncodable($0)) }
        let data = try await send(path, method: method, body: bodyData)
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError(
                status: 502,
                code: "UNEXPECTED_RESPONSE_SHAPE",
                message: "\(path) のレスポンスが想定と異なります: \(error.localizedDescription)"
            )
        }
    }

    // MARK: 画像・音声アップロード

    func createPresignedUrl(contentType: String) async throws -> PresignedUrlResponse {
        try await request("/v1/images/presigned-url", method: "POST", body: PresignBody(contentType: contentType))
    }

    /// presigned URL へ直接 PUT する(API Gateway/Lambda は経由しない)。
    func upload(data: Data, to uploadUrl: String, contentType: String) async throws {
        guard let url = URL(string: uploadUrl) else {
            throw APIError(status: 0, code: "INVALID_URL", message: "アップロードURLが不正です")
        }
        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        let (_, response) = try await session.upload(for: request, from: data)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            throw APIError(status: status, code: "S3_UPLOAD_FAILED", message: "S3 upload failed with status \(status)")
        }
    }

    // MARK: 解析

    func createAnalysis(imageKey: String, type: AnalysisType) async throws -> CreateAnalysisResponse {
        try await request("/v1/analyses", method: "POST", body: CreateAnalysisBody(imageKey: imageKey, type: type.rawValue))
    }

    func getAnalysis(_ analysisId: String) async throws -> ImageAnalysis {
        try await request("/v1/analyses/\(analysisId)")
    }

    func createVoiceTranscription(audioKey: String) async throws -> CreateVoiceTranscriptionResponse {
        try await request("/v1/voice/transcriptions", method: "POST", body: CreateVoiceBody(audioKey: audioKey))
    }

    func getVoiceTranscription(_ analysisId: String) async throws -> VoiceAnalysis {
        try await request("/v1/voice/transcriptions/\(analysisId)")
    }

    // MARK: 在庫

    func listFridgeItems() async throws -> [FridgeItem] {
        let response: FridgeItemListResponse = try await request("/v1/fridge/items")
        return response.items
    }

    @discardableResult
    func createFridgeItem(_ body: CreateFridgeItemBody) async throws -> FridgeItem {
        try await request("/v1/fridge/items", method: "POST", body: body)
    }

    @discardableResult
    func createFridgeItemsBulk(_ body: BulkCreateBody) async throws -> [FridgeItem] {
        let response: BulkCreateFridgeItemsResponse = try await request("/v1/fridge/items/bulk", method: "POST", body: body)
        return response.items
    }

    @discardableResult
    func updateFridgeItem(_ itemId: String, patch: UpdateFridgeItemBody) async throws -> FridgeItem {
        try await request("/v1/fridge/items/\(itemId)", method: "PATCH", body: patch)
    }

    func deleteFridgeItem(_ itemId: String) async throws {
        _ = try await send("/v1/fridge/items/\(itemId)", method: "DELETE")
    }

    @discardableResult
    func consume(_ body: ConsumeBody) async throws -> ConsumeResponse {
        try await request("/v1/fridge/consume", method: "POST", body: body)
    }

    // MARK: 世帯(家族共有)

    func getHousehold() async throws -> Household {
        try await request("/v1/household")
    }

    func createHouseholdInvite() async throws -> HouseholdInvite {
        try await request("/v1/household/invites", method: "POST")
    }

    func joinHousehold(code: String, displayName: String?) async throws -> Household {
        try await request("/v1/household/join", method: "POST", body: JoinHouseholdBody(code: code, displayName: displayName))
    }

    func leaveHousehold() async throws {
        _ = try await send("/v1/household/leave", method: "POST")
    }

    func removeHouseholdMember(_ userId: String) async throws {
        _ = try await send("/v1/household/members/\(userId)", method: "DELETE")
    }

    // MARK: 食材マスター

    func searchIngredients(query: String, limit: Int? = nil) async throws -> [IngredientCandidate] {
        let response: IngredientSearchResponse = try await request(
            "/v1/ingredients/search",
            method: "POST",
            body: SearchBody(query: query, limit: limit)
        )
        return response.candidates
    }
}

/// `any Encodable` を JSONEncoder に渡すための型消去。
private struct AnyEncodable: Encodable {
    private let encodeFunc: (Encoder) throws -> Void

    init(_ wrapped: any Encodable) {
        encodeFunc = { try wrapped.encode(to: $0) }
    }

    func encode(to encoder: Encoder) throws {
        try encodeFunc(encoder)
    }
}
