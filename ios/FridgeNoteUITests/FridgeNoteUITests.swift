import XCTest

/// 実際のバックエンドに対する通し確認。E2E_EMAIL / E2E_PASSWORD(環境変数 TEST_RUNNER_E2E_*)が無ければスキップする。
final class FridgeNoteUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = true
        app = XCUIApplication()
    }

    private func shot(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func button(_ text: String) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch
    }

    private func text(_ text: String) -> XCUIElement {
        app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch
    }

    private func typeInto(_ field: XCUIElement, _ value: String) {
        field.tap()
        if let current = field.value as? String, !current.isEmpty, current != field.placeholderValue {
            field.press(forDuration: 1.0)
            if app.menuItems["Select All"].waitForExistence(timeout: 1) { app.menuItems["Select All"].tap() }
            else { field.doubleTap() }
        }
        field.typeText(value)
    }

    func testMainFlow() throws {
        let env = ProcessInfo.processInfo.environment
        guard let email = env["E2E_EMAIL"], let password = env["E2E_PASSWORD"] else {
            throw XCTSkip("E2E_EMAIL / E2E_PASSWORD not set")
        }
        app.launch()
        shot("01_signin")

        // --- サインイン
        let emailField = app.textFields["メールアドレス"]
        XCTAssertTrue(emailField.waitForExistence(timeout: 10), "email field")
        emailField.tap(); emailField.typeText(email)
        let pwField = app.secureTextFields["パスワード"]
        pwField.tap(); pwField.typeText(password)
        shot("02_signin_filled")
        let t0 = Date()
        button("サインイン").tap()
        sleep(3)
        shot("02b_signin_after_3s")

        XCTAssertTrue(button("追加する").waitForExistence(timeout: 120), "list screen after sign-in")
        print("SIGNIN_SECONDS=\(Date().timeIntervalSince(t0))")
        shot("03_list_empty")

        // --- 手動で追加
        button("追加する").tap()
        XCTAssertTrue(button("手動で入力").waitForExistence(timeout: 5), "add menu")
        shot("04_add_menu")
        button("手動で入力").tap()
        let fields = app.textFields
        XCTAssertTrue(fields.firstMatch.waitForExistence(timeout: 5), "manual form")
        fields.element(boundBy: 0).tap()
        fields.element(boundBy: 0).typeText("トマト")
        shot("05_manual_form_typed")
        app.swipeUp()
        shot("06_manual_form_scrolled")
        button("登録する").tap()
        XCTAssertTrue(text("トマト").waitForExistence(timeout: 20), "item appears in list")
        shot("07_list_with_item")

        // --- 手動で減らす
        button("減らす").tap()
        XCTAssertTrue(button("手動で減らす").waitForExistence(timeout: 5), "consume menu")
        button("手動で減らす").tap()
        XCTAssertTrue(text("在庫: 1個").waitForExistence(timeout: 15), "consume list shows stock")
        shot("08_consume_list")
        let amount = app.textFields["数量"]
        if amount.waitForExistence(timeout: 3) {
            amount.tap(); amount.typeText("1")
            app.swipeUp()
            button("減らす").tap()
            sleep(3)
            shot("09_after_consume")
        }
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.navigationBars.buttons.element(boundBy: 0).tap()

        // --- 家族で共有
        XCTAssertTrue(button("追加する").waitForExistence(timeout: 10), "back on list")
        shot("10_list_again")
        let household = button("家族")
        if household.waitForExistence(timeout: 3) {
            household.tap()
            XCTAssertTrue(text("メンバー").waitForExistence(timeout: 15), "household screen")
            shot("11_household")
            button("招待コードを発行").tap()
            sleep(3)
            shot("12_household_invite")
            app.navigationBars.buttons.element(boundBy: 0).tap()
        } else {
            XCTFail("household entry not found on list")
        }

        // --- 追加メニュー(撮影・音声)の入口と権限まわり
        button("追加する").tap()
        button("食材を撮影").tap()
        sleep(2)
        shot("13_camera_screen")
        app.navigationBars.buttons.element(boundBy: 0).tap()
        button("話して追加").tap()
        sleep(1)
        shot("14_voice_screen")
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.navigationBars.buttons.element(boundBy: 0).tap()

        // --- 後片付け(登録したテスト食材を削除)
        let del = app.buttons["トマトを削除"]
        if del.waitForExistence(timeout: 5) {
            del.tap()
            app.alerts.buttons["削除"].tap()
            sleep(2)
            shot("15_after_delete")
        }

        // --- サインアウト
        app.swipeUp()
        button("サインアウト").tap()
        XCTAssertTrue(app.textFields["メールアドレス"].waitForExistence(timeout: 15), "back to sign-in")
        shot("16_signed_out")
    }
}
