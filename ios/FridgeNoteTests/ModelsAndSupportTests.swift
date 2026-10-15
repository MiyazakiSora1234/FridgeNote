import XCTest
@testable import FridgeNote

final class ModelsAndSupportTests: XCTestCase {
    private let decoder = JSONDecoder()

    // MARK: - デコード

    func testDecodesFridgeItem() throws {
        let json = """
        {"items":[{"itemId":"i1","ingredientId":"ingredient_010","name":"鶏もも肉","category":"meat",
        "quantity":300,"unit":"g","expiresAt":"2026-09-08","createdAt":"c","updatedAt":"u","expiryStatus":"soon"}]}
        """
        let response = try decoder.decode(FridgeItemListResponse.self, from: Data(json.utf8))
        XCTAssertEqual(response.items.first?.name, "鶏もも肉")
        XCTAssertEqual(response.items.first?.quantity, 300)
        XCTAssertEqual(response.items.first?.expiryStatus, .soon)
    }

    func testDecodesHousehold() throws {
        let json = """
        {"householdId":"owner-sub","role":"member","members":[
        {"userId":"owner-sub","role":"owner","isSelf":false},
        {"userId":"me","role":"member","displayName":"お母さん","joinedAt":"2026-10-15T05:00:00.000Z","isSelf":true}]}
        """
        let household = try decoder.decode(Household.self, from: Data(json.utf8))
        XCTAssertFalse(household.isOwner)
        XCTAssertEqual(household.members.count, 2)
        XCTAssertNil(household.members[0].displayName)
        XCTAssertTrue(household.members[0].isOwner)
        XCTAssertEqual(household.members[1].displayName, "お母さん")
        XCTAssertTrue(household.members[1].isSelf)
    }

    func testFridgeItemAllowsNullExpiry() throws {
        let json = """
        {"itemId":"i1","ingredientId":"x","name":"卵","category":"dairy","quantity":6,"unit":"個",
        "expiresAt":null,"createdAt":"c","updatedAt":"u","expiryStatus":"none"}
        """
        let item = try decoder.decode(FridgeItem.self, from: Data(json.utf8))
        XCTAssertNil(item.expiresAt)
        XCTAssertEqual(item.expiryStatus, .none)
    }

    func testDecodesFoodAnalysis() throws {
        let json = """
        {"analysisId":"a1","type":"food","status":"completed","createdAt":"c","updatedAt":"u",
        "result":{"kind":"food","name":"トマト","ingredientId":"ingredient_001","category":"vegetable",
        "quantity":2,"unit":"個","expiresAtEstimate":null,"confidence":0.9}}
        """
        let analysis = try decoder.decode(ImageAnalysis.self, from: Data(json.utf8))
        guard case .food(let food)? = analysis.result else { return XCTFail("expected food result") }
        XCTAssertEqual(food.name, "トマト")
        XCTAssertNil(food.expiresAtEstimate)
        XCTAssertFalse(analysis.status.isPending)
    }

    func testDecodesDishAndReceiptAnalysis() throws {
        let dish = """
        {"analysisId":"a2","type":"dish","status":"completed","createdAt":"c","updatedAt":"u",
        "result":{"kind":"dish","dish":"カレー","ingredients":[{"name":"玉ねぎ","ingredientId":"ingredient_005","confidence":0.8}]}}
        """
        guard case .dish(let d)? = try decoder.decode(ImageAnalysis.self, from: Data(dish.utf8)).result
        else { return XCTFail("expected dish result") }
        XCTAssertEqual(d.ingredients.count, 1)

        let receipt = """
        {"analysisId":"a3","type":"receipt","status":"completed","createdAt":"c","updatedAt":"u",
        "result":{"kind":"receipt","items":[{"name":"卵","ingredientId":"ingredient_002","quantity":1,"unit":"pack",
        "confidence":0.3,"belowConfidenceThreshold":true}]}}
        """
        guard case .receipt(let r)? = try decoder.decode(ImageAnalysis.self, from: Data(receipt.utf8)).result
        else { return XCTFail("expected receipt result") }
        XCTAssertTrue(r.items[0].belowConfidenceThreshold)
    }

    func testPendingAnalysisHasNullResult() throws {
        let json = """
        {"analysisId":"a4","type":"food","status":"processing","result":null,"createdAt":"c","updatedAt":"u"}
        """
        let analysis = try decoder.decode(ImageAnalysis.self, from: Data(json.utf8))
        XCTAssertNil(analysis.result)
        XCTAssertTrue(analysis.status.isPending)
    }

    func testUnknownAnalysisKindFails() {
        let json = """
        {"analysisId":"a5","type":"food","status":"completed","createdAt":"c","updatedAt":"u","result":{"kind":"other"}}
        """
        XCTAssertThrowsError(try decoder.decode(ImageAnalysis.self, from: Data(json.utf8)))
    }

    func testDecodesVoiceAnalysis() throws {
        let json = """
        {"analysisId":"v1","audioKey":"k","status":"completed","transcript":"卵6個","createdAt":"c","updatedAt":"u",
        "result":{"items":[{"name":"卵","ingredientId":"ingredient_002","quantity":6,"unit":"個","confidence":0.95,
        "belowConfidenceThreshold":false}]}}
        """
        let voice = try decoder.decode(VoiceAnalysis.self, from: Data(json.utf8))
        XCTAssertEqual(voice.result?.items.first?.quantity, 6)
    }

    // MARK: - リクエスト

    func testCreateBodySendsExplicitNullExpiry() throws {
        let body = CreateFridgeItemBody(ingredientName: "卵", quantity: 6, unit: "個", expiresAt: nil, sourceAnalysisId: nil)
        let object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(body)) as? [String: Any]
        XCTAssertTrue(object?["expiresAt"] is NSNull)
        XCTAssertNil(object?["sourceAnalysisId"])
        XCTAssertEqual(object?["quantity"] as? Double, 6)
    }

    // MARK: - 入力検証・表示

    func testParsePositiveQuantity() {
        XCTAssertEqual(QuantityValidation.parsePositiveQuantity("2.5"), 2.5)
        XCTAssertEqual(QuantityValidation.parsePositiveQuantity(" 3 "), 3)
        XCTAssertNil(QuantityValidation.parsePositiveQuantity("0"))
        XCTAssertNil(QuantityValidation.parsePositiveQuantity("-1"))
        XCTAssertNil(QuantityValidation.parsePositiveQuantity(""))
        XCTAssertNil(QuantityValidation.parsePositiveQuantity("abc"))
        XCTAssertNil(QuantityValidation.parsePositiveQuantity("inf"))
    }

    func testIsNonEmptyUnit() {
        XCTAssertTrue(QuantityValidation.isNonEmptyUnit("g"))
        XCTAssertFalse(QuantityValidation.isNonEmptyUnit("  "))
    }

    func testFormatQuantity() {
        XCTAssertEqual(formatQuantity(300), "300")
        XCTAssertEqual(formatQuantity(2.5), "2.5")
    }

    func testLowConfidenceThresholdMatchesBackend() {
        XCTAssertEqual(LOW_CONFIDENCE_THRESHOLD, 0.6)
    }
}
