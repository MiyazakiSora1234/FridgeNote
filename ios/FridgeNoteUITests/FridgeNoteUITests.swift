import XCTest

/// 実際のバックエンドに対する通しテスト。
/// 環境変数(TEST_RUNNER_ 接頭辞付きで渡す): E2E_EMAIL / E2E_PASSWORD(ユーザー1)、E2E_EMAIL2 / E2E_PASSWORD2(ユーザー2)。
/// 無ければスキップする。各テストは「サインイン済み・在庫なし」の状態から始める。
final class FridgeNoteUITests: XCTestCase {
    private var app: XCUIApplication!
    private var user1: (email: String, password: String)!
    private var user2: (email: String, password: String)?

    override func setUpWithError() throws {
        continueAfterFailure = true
        let env = ProcessInfo.processInfo.environment
        guard let e1 = env["E2E_EMAIL"], let p1 = env["E2E_PASSWORD"] else {
            throw XCTSkip("E2E_EMAIL / E2E_PASSWORD not set")
        }
        user1 = (e1, p1)
        if let e2 = env["E2E_EMAIL2"], let p2 = env["E2E_PASSWORD2"] { user2 = (e2, p2) }

        app = XCUIApplication()
        addUIInterruptionMonitor(withDescription: "system permission") { alert in
            for label in ["Allow", "許可", "OK", "Allow While Using App", "Appの使用中は許可"] {
                if alert.buttons[label].exists { alert.buttons[label].tap(); return true }
            }
            return false
        }
        app.launch()
    }

    // MARK: - ヘルパー

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

    private func tap(_ element: XCUIElement, _ what: String, timeout: TimeInterval = 15) {
        XCTAssertTrue(element.waitForExistence(timeout: timeout), "not found: \(what)")
        element.tap()
    }

    private func dismissKeyboard() {
        // スクロールでキーボードを閉じる(scrollDismissesKeyboard(.interactively))。
        app.swipeUp()
    }

    private func dismissAlert(_ label: String = "OK") {
        let alert = app.alerts.firstMatch
        XCTAssertTrue(alert.waitForExistence(timeout: 10), "alert expected")
        alert.buttons[label].tap()
    }

    private func alertContains(_ fragment: String, timeout: TimeInterval = 10) -> Bool {
        let alert = app.alerts.firstMatch
        guard alert.waitForExistence(timeout: timeout) else { return false }
        let all = alert.staticTexts.allElementsBoundByIndex.map(\.label).joined(separator: " ")
        return all.contains(fragment)
    }

    private func isOnList() -> Bool { button("追加する").exists }

    private func signIn(_ user: (email: String, password: String)) {
        let emailField = app.textFields["メールアドレス"]
        XCTAssertTrue(emailField.waitForExistence(timeout: 15), "sign-in screen")
        emailField.tap(); emailField.typeText(user.email)
        let pw = app.secureTextFields["パスワード"]
        pw.tap(); pw.typeText(user.password)
        button("サインイン").tap()
        XCTAssertTrue(button("追加する").waitForExistence(timeout: 120), "list after sign-in")
    }

    /// リスト画面かサインイン画面のどちらかが出るのを待ち、サインイン画面なら指定ユーザーで入る。
    private func ensureSignedIn(_ user: (email: String, password: String)) {
        let list = button("追加する")
        let emailField = app.textFields["メールアドレス"]
        let deadline = Date().addingTimeInterval(30)
        while Date() < deadline, !list.exists, !emailField.exists { usleep(300_000) }
        if emailField.exists { signIn(user) }
    }

    private func signOut() {
        if !isOnList() { return }
        app.swipeUp()
        tap(button("サインアウト"), "sign out")
        XCTAssertTrue(app.textFields["メールアドレス"].waitForExistence(timeout: 20), "back on sign-in")
    }

    private func goHome() {
        for _ in 0..<5 {
            if isOnList() { return }
            let back = app.navigationBars.buttons.element(boundBy: 0)
            if back.exists { back.tap() } else { return }
        }
    }

    /// 在庫をすべて削除して空にする。
    private func clearAllItems() {
        goHome()
        for _ in 0..<30 {
            let del = app.buttons.matching(NSPredicate(format: "label ENDSWITH %@", "を削除")).firstMatch
            if !del.waitForExistence(timeout: 3) { break }
            del.tap()
            let alert = app.alerts.firstMatch
            if alert.waitForExistence(timeout: 5) { alert.buttons["削除"].tap() }
            sleep(2)
        }
    }

    private func addItemManually(name: String, quantity: String? = nil, unit: String? = nil, expiry: String? = nil) {
        tap(button("追加する"), "add tile")
        tap(button("手動で入力"), "manual entry")
        let fields = app.textFields
        XCTAssertTrue(fields.firstMatch.waitForExistence(timeout: 10), "manual form")
        fields.element(boundBy: 0).tap()
        fields.element(boundBy: 0).typeText(name)
        if let quantity {
            fields.element(boundBy: 1).clearAndType(quantity)
        }
        if let unit {
            fields.element(boundBy: 2).clearAndType(unit)
        }
        if let expiry {
            fields.element(boundBy: 3).tap()
            fields.element(boundBy: 3).typeText(expiry)
        }
        dismissKeyboard()
        tap(button("登録する"), "register button")
    }

    private func ymd(daysFromToday days: Int) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "UTC")
        return f.string(from: Date().addingTimeInterval(TimeInterval(days * 86400)))
    }

    // MARK: - テスト

    /// 1. 認証まわり(誤パスワード、新規登録の入力エラー、再サインイン)
    func test1_Auth() throws {
        ensureSignedIn(user1)
        signOut()
        shot("auth_01_signin")

        let emailField = app.textFields["メールアドレス"]
        emailField.tap(); emailField.typeText(user1.email)
        let pw = app.secureTextFields["パスワード"]
        pw.tap(); pw.typeText("WrongPassword123")
        button("サインイン").tap()
        let wrong = text("メールアドレスまたはパスワードが正しくありません")
        XCTAssertTrue(wrong.waitForExistence(timeout: 30), "wrong-password error is shown")
        shot("auth_02_wrong_password")

        // 新規登録: 短すぎるパスワードで入力エラー(ユーザーは作られない)
        tap(button("新規登録はこちら"), "sign-up link")
        XCTAssertTrue(app.textFields["メールアドレス"].waitForExistence(timeout: 10), "sign-up screen")
        shot("auth_03_signup")
        let suEmail = app.textFields["メールアドレス"]
        suEmail.tap(); suEmail.typeText("never-created@example.com")
        let suPw = app.secureTextFields.firstMatch
        suPw.tap(); suPw.typeText("abc")
        button("登録する").tap()
        let err = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'password' OR label CONTAINS 'パスワード'")).firstMatch
        XCTAssertTrue(err.waitForExistence(timeout: 20), "sign-up validation error is shown")
        shot("auth_04_signup_error")
        app.navigationBars.buttons.element(boundBy: 0).tap()

        // 正しいパスワードで再サインイン(入力欄に前回の内容が残っていても上書きする)
        let again = app.textFields["メールアドレス"]
        XCTAssertTrue(again.waitForExistence(timeout: 10))
        again.clearAndType(user1.email)
        let pw2 = app.secureTextFields["パスワード"]
        pw2.clearAndType(user1.password)
        button("サインイン").tap()
        XCTAssertTrue(button("追加する").waitForExistence(timeout: 120), "re-sign-in works")
        shot("auth_05_signed_in_again")
    }

    /// 2. 在庫の登録(単位・賞味期限・バッジ・件数表示)と入力検証、削除
    func test2_ManualAddAndValidation() throws {
        ensureSignedIn(user1)
        clearAllItems()

        // 空の名前 → エラー
        tap(button("追加する"), "add tile")
        tap(button("手動で入力"), "manual entry")
        XCTAssertTrue(app.textFields.firstMatch.waitForExistence(timeout: 10))
        dismissKeyboard()
        tap(button("登録する"), "register (empty)")
        XCTAssertTrue(alertContains("入力内容を確認してください"), "empty name rejected")
        shot("add_01_empty_error")
        dismissAlert()

        // 数量0 → エラー
        app.textFields.element(boundBy: 0).tap()
        app.textFields.element(boundBy: 0).typeText("テスト")
        app.textFields.element(boundBy: 1).clearAndType("0")
        dismissKeyboard()
        tap(button("登録する"), "register (qty 0)")
        XCTAssertTrue(alertContains("入力内容を確認してください"), "zero quantity rejected")
        dismissAlert()
        goHome()

        // 3種類登録: 期限切れ / まもなく / 期限なし
        addItemManually(name: "古い牛乳", quantity: "1", unit: "本", expiry: "2020-01-01")
        XCTAssertTrue(text("古い牛乳").waitForExistence(timeout: 20), "expired item listed")
        addItemManually(name: "ヨーグルト", quantity: "4", unit: "個", expiry: ymd(daysFromToday: 1))
        XCTAssertTrue(text("ヨーグルト").waitForExistence(timeout: 20), "soon item listed")
        addItemManually(name: "米", quantity: "2.5", unit: "kg")
        XCTAssertTrue(text("米").waitForExistence(timeout: 20), "plain item listed")
        sleep(2)
        shot("add_02_list_three_items")

        XCTAssertTrue(text("期限切れ").exists, "expired badge")
        XCTAssertTrue(text("まもなく期限").exists, "soon badge")
        XCTAssertTrue(text("3品").exists, "count summary shows 3")
        XCTAssertTrue(text("2.5kg").exists, "decimal quantity shown")

        // 削除: キャンセル → 残る、削除 → 消える
        tap(app.buttons["米を削除"], "delete 米")
        XCTAssertTrue(app.alerts.firstMatch.waitForExistence(timeout: 5))
        shot("add_03_delete_confirm")
        app.alerts.firstMatch.buttons["キャンセル"].tap()
        XCTAssertTrue(text("米").exists, "cancel keeps item")
        app.buttons["米を削除"].tap()
        app.alerts.firstMatch.buttons["削除"].tap()
        sleep(3)
        XCTAssertFalse(app.buttons["米を削除"].exists, "deleted item gone")
        shot("add_04_after_delete")
        clearAllItems()
    }

    /// 3. 手動で減らす(空入力・超過・成功)
    func test3_Consume() throws {
        ensureSignedIn(user1)
        clearAllItems()
        addItemManually(name: "卵", quantity: "6", unit: "個")
        XCTAssertTrue(text("卵").waitForExistence(timeout: 20))

        tap(button("減らす"), "consume tile")
        tap(button("手動で減らす"), "manual consume")
        XCTAssertTrue(text("在庫: 6個").waitForExistence(timeout: 20), "stock shown")
        shot("consume_01_list")

        let consumeButton = app.buttons["consumeSubmitButton"]

        // 空入力
        tap(consumeButton, "consume button (empty)")
        XCTAssertTrue(alertContains("減らす数量を入力してください"), "empty amount rejected")
        dismissAlert()

        // 在庫超過
        let amount = app.textFields["consumeAmountField"]
        tap(amount, "amount field")
        amount.typeText("10")
        dismissKeyboard()
        consumeButton.tap()
        XCTAssertTrue(alertContains("在庫(6個)を超えています"), "over-stock rejected")
        shot("consume_02_over")
        dismissAlert()

        // 正常
        amount.clearAndType("2")
        dismissKeyboard()
        consumeButton.tap()
        XCTAssertTrue(text("在庫: 4個").waitForExistence(timeout: 20), "stock decremented to 4")
        shot("consume_03_after")

        goHome()
        XCTAssertTrue(text("4個").waitForExistence(timeout: 20), "list shows 4")
        clearAllItems()
    }

    /// 4. 追加メニュー: カメラ画面・音声画面(音声は録音→アップロード→解析→結果/フォールバックまで)
    func test4_CameraAndVoice() throws {
        ensureSignedIn(user1)
        clearAllItems()

        tap(button("追加する"), "add tile")
        tap(button("食材を撮影"), "photo menu")
        sleep(2)
        shot("media_01_camera")
        let cameraText = app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'カメラ'")).firstMatch
        XCTAssertTrue(cameraText.waitForExistence(timeout: 10), "camera screen / permission text")
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label CONTAINS 'アルバム'")).firstMatch.exists, "album button")
        app.navigationBars.buttons.element(boundBy: 0).tap()

        tap(button("レシートを撮影"), "receipt menu")
        sleep(2)
        shot("media_02_receipt_camera")
        app.navigationBars.buttons.element(boundBy: 0).tap()

        tap(button("話して追加"), "voice menu")
        XCTAssertTrue(text("買った物を話してください").waitForExistence(timeout: 10), "voice screen")
        shot("media_03_voice_idle")
        tap(app.buttons["録音を開始する"], "start recording")
        sleep(2)
        app.tap() // 権限ダイアログが出ていれば割り込みモニターが許可する
        sleep(2)
        shot("media_04_voice_recording")
        if app.buttons["録音を終了する"].waitForExistence(timeout: 10) {
            sleep(3)
            app.buttons["録音を終了する"].tap()
            // アップロード → 解析 → 結果(成功なら確認画面、失敗なら手動登録のフォールバック)
            let outcome = app.staticTexts.matching(
                NSPredicate(format: "label CONTAINS '手動で登録してください' OR label CONTAINS '聞き取った内容'")
            ).firstMatch
            XCTAssertTrue(outcome.waitForExistence(timeout: 150), "voice analysis ends (fallback or result)")
            shot("media_05_voice_result")
            if app.buttons["手動で登録する"].exists {
                app.buttons["手動で登録する"].tap()
                XCTAssertTrue(app.textFields.firstMatch.waitForExistence(timeout: 10), "fallback opens manual form")
                shot("media_06_fallback_manual")
            }
        } else {
            XCTFail("recording did not start (permission?)")
        }
        goHome()
    }

    /// 5. 家族共有(2ユーザー): 招待コード発行 → 参加 → 同じ在庫が見える → 退出
    func test5_Household() throws {
        guard let user2 else { throw XCTSkip("E2E_EMAIL2 / E2E_PASSWORD2 not set") }
        ensureSignedIn(user1)
        // 直前のテストのユーザーに関わらず user1 から始める
        signOut()
        signIn(user1)
        clearAllItems()
        addItemManually(name: "共有トマト", quantity: "3", unit: "個")
        XCTAssertTrue(text("共有トマト").waitForExistence(timeout: 20))

        tap(button("家族で共有"), "household entry")
        XCTAssertTrue(text("メンバー").waitForExistence(timeout: 15), "household screen")
        shot("house_01_solo")
        tap(button("招待コードを発行"), "issue invite")
        let codeLabel = app.staticTexts.matching(NSPredicate(format: "label MATCHES %@", "[A-Z0-9]{4}-[A-Z0-9]{4}")).firstMatch
        XCTAssertTrue(codeLabel.waitForExistence(timeout: 15), "invite code shown")
        let code = codeLabel.label
        shot("house_02_invite")
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label CONTAINS 'コードを共有'")).firstMatch.exists, "share button")
        goHome()

        // ユーザー2で参加
        signOut()
        signIn(user2)
        clearAllItems()
        tap(button("家族で共有"), "household entry (user2)")
        XCTAssertTrue(app.textFields["XXXX-XXXX"].waitForExistence(timeout: 15), "join form for solo user")
        app.textFields["XXXX-XXXX"].tap()
        app.textFields["XXXX-XXXX"].typeText(code)
        dismissKeyboard()
        shot("house_03_join_filled")
        tap(button("参加する"), "join button")
        XCTAssertTrue(alertContains("参加しました", timeout: 20), "joined")
        shot("house_04_joined")
        dismissAlert()
        goHome()
        XCTAssertTrue(text("共有トマト").waitForExistence(timeout: 20), "member sees the shared item")
        shot("house_05_member_sees_item")

        // メンバーが追加 → 退出
        addItemManually(name: "共有牛乳", quantity: "1", unit: "本")
        XCTAssertTrue(text("共有牛乳").waitForExistence(timeout: 20))
        tap(button("家族で共有"), "household entry (member)")
        XCTAssertTrue(button("この世帯から退出").waitForExistence(timeout: 15), "leave button")
        shot("house_06_member_view")
        button("この世帯から退出").tap()
        app.alerts.firstMatch.buttons["退出"].tap()
        sleep(3)
        goHome()
        sleep(2)
        XCTAssertFalse(text("共有トマト").exists, "after leaving, shared items are gone from member's list")
        shot("house_07_after_leave")
        signOut()

        // ユーザー1: 共有中に追加された在庫も見える
        signIn(user1)
        XCTAssertTrue(text("共有トマト").waitForExistence(timeout: 20), "owner still sees own item")
        XCTAssertTrue(text("共有牛乳").waitForExistence(timeout: 10), "owner sees item added by member")
        shot("house_08_owner_after")
        clearAllItems()
    }
}

private extension XCUIElement {
    /// 既存の入力を消してから入力する。
    func clearAndType(_ value: String) {
        tap()
        if let current = self.value as? String, !current.isEmpty, current != self.placeholderValue {
            typeText(String(repeating: "\u{8}", count: current.count + 2))
        }
        typeText(value)
    }
}
