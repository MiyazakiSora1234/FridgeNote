import Foundation

// バックエンドのレスポンス形状(docs/api-spec.md)。形が想定と異なる場合はデコードエラーとして扱う。

enum ExpiryStatus: String, Decodable {
    case expired, soon, ok, none

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = ExpiryStatus(rawValue: raw) ?? .none
    }
}

struct FridgeItem: Decodable, Identifiable, Equatable {
    let itemId: String
    let ingredientId: String
    let name: String
    let category: String
    let quantity: Double
    let unit: String
    let expiresAt: String?
    let createdAt: String
    let updatedAt: String
    let expiryStatus: ExpiryStatus

    var id: String { itemId }
}

struct FridgeItemListResponse: Decodable {
    let items: [FridgeItem]
}

enum AnalysisType: String, Hashable, Codable {
    case food, dish, receipt
}

enum AnalysisStatus: String, Decodable {
    case pending, processing, completed, failed

    var isPending: Bool { self == .pending || self == .processing }
}

struct FoodAnalysisResult: Decodable {
    let name: String
    let ingredientId: String
    let category: String
    let quantity: Double
    let unit: String
    let expiresAtEstimate: String?
    let confidence: Double
}

struct DishAnalysisIngredient: Decodable {
    let name: String
    let ingredientId: String
    let confidence: Double
}

struct DishAnalysisResult: Decodable {
    let dish: String
    let ingredients: [DishAnalysisIngredient]
}

struct ParsedIngredientItem: Decodable {
    let name: String
    let ingredientId: String
    let quantity: Double
    let unit: String
    let confidence: Double
    let belowConfidenceThreshold: Bool
}

struct ReceiptAnalysisResult: Decodable {
    let items: [ParsedIngredientItem]
}

/// `kind` で判別するサーバーのユニオン型。
enum AnalysisResult: Decodable {
    case food(FoodAnalysisResult)
    case dish(DishAnalysisResult)
    case receipt(ReceiptAnalysisResult)

    private enum CodingKeys: String, CodingKey { case kind }

    init(from decoder: Decoder) throws {
        let kind = try decoder.container(keyedBy: CodingKeys.self).decode(String.self, forKey: .kind)
        let single = try decoder.singleValueContainer()
        switch kind {
        case "food": self = .food(try single.decode(FoodAnalysisResult.self))
        case "dish": self = .dish(try single.decode(DishAnalysisResult.self))
        case "receipt": self = .receipt(try single.decode(ReceiptAnalysisResult.self))
        default:
            throw DecodingError.dataCorruptedError(
                forKey: .kind,
                in: try decoder.container(keyedBy: CodingKeys.self),
                debugDescription: "unknown analysis kind: \(kind)"
            )
        }
    }
}

struct ImageAnalysis: Decodable {
    let analysisId: String
    let type: AnalysisType
    let status: AnalysisStatus
    let result: AnalysisResult?
    let errorReason: String?
    let createdAt: String
    let updatedAt: String
}

struct VoiceAnalysisResult: Decodable {
    let items: [ParsedIngredientItem]
}

struct VoiceAnalysis: Decodable {
    let analysisId: String
    let audioKey: String
    let status: AnalysisStatus
    let transcript: String?
    let result: VoiceAnalysisResult?
    let errorReason: String?
    let createdAt: String
    let updatedAt: String
}

struct PresignedUrlResponse: Decodable {
    let imageKey: String
    let uploadUrl: String
    let expiresIn: Double
}

struct CreateAnalysisResponse: Decodable {
    let analysisId: String
    let status: String
}

struct CreateVoiceTranscriptionResponse: Decodable {
    let analysisId: String
    let status: AnalysisStatus
}

struct ConsumeResponse: Decodable {
    struct Consumed: Decodable {
        let ingredientId: String
        let newQuantity: Double
    }
    struct Skipped: Decodable {
        let ingredientId: String
        let reason: String
    }
    let consumed: [Consumed]
    let skipped: [Skipped]
}

struct BulkCreateFridgeItemsResponse: Decodable {
    let items: [FridgeItem]
}

struct IngredientCandidate: Decodable, Identifiable {
    let ingredientId: String
    let name: String
    let category: String
    let score: Double

    var id: String { ingredientId }
}

struct IngredientSearchResponse: Decodable {
    let candidates: [IngredientCandidate]
}

// MARK: - 世帯(家族共有)

struct HouseholdMember: Decodable, Identifiable, Equatable {
    let userId: String
    let role: String // "owner" | "member"
    let displayName: String?
    let joinedAt: String?
    let isSelf: Bool

    var id: String { userId }
    var isOwner: Bool { role == "owner" }
}

struct Household: Decodable, Equatable {
    let householdId: String
    let role: String // 自分の役割: "owner" | "member"
    let members: [HouseholdMember]

    var isOwner: Bool { role == "owner" }
}

struct HouseholdInvite: Decodable, Equatable {
    let code: String
    let expiresAt: String
}
