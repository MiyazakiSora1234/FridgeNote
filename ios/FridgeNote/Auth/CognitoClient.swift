import BigInt
import Foundation

struct CognitoError: LocalizedError {
    let code: String
    let serverMessage: String

    var errorDescription: String? {
        switch code {
        case "NotAuthorizedException", "UserNotFoundException":
            return "メールアドレスまたはパスワードが正しくありません"
        case "UserNotConfirmedException":
            return "メールアドレスの確認が完了していません。新規登録画面から確認コードを入力してください"
        case "UsernameExistsException":
            return "このメールアドレスは既に登録されています"
        case "InvalidPasswordException":
            return "パスワードが要件を満たしていません(8文字以上・小文字と数字を含む)"
        case "InvalidParameterException":
            return serverMessage.isEmpty ? "入力内容を確認してください" : serverMessage
        case "CodeMismatchException":
            return "確認コードが正しくありません"
        case "ExpiredCodeException":
            return "確認コードの有効期限が切れています"
        case "LimitExceededException", "TooManyRequestsException", "TooManyFailedAttemptsException":
            return "試行回数が多すぎます。しばらく待ってからお試しください"
        default:
            return serverMessage.isEmpty ? "認証に失敗しました(\(code))" : serverMessage
        }
    }
}

struct AuthTokens: Codable, Equatable {
    var idToken: String
    var accessToken: String
    var refreshToken: String
    var expiresAt: Date
    var email: String
}

/// Cognito User Pools の公開 API(cognito-idp)を直接呼ぶ最小クライアント。
struct CognitoClient {
    private let endpoint = URL(string: "https://cognito-idp.\(AppConfig.cognitoRegion).amazonaws.com/")!
    private let clientId = AppConfig.cognitoUserPoolClientId
    private let poolName = AppConfig.cognitoUserPoolId.split(separator: "_").last.map(String.init) ?? ""

    // MARK: - 公開操作

    func signUp(email: String, password: String) async throws {
        _ = try await call("SignUp", [
            "ClientId": clientId,
            "Username": email,
            "Password": password,
            "UserAttributes": [Any](),
        ])
    }

    func confirmSignUp(email: String, code: String) async throws {
        _ = try await call("ConfirmSignUp", [
            "ClientId": clientId,
            "Username": email,
            "ConfirmationCode": code,
            "ForceAliasCreation": true,
        ])
    }

    func signIn(email: String, password: String) async throws -> AuthTokens {
        let srp = try SRPClient()
        let initiate = try await call("InitiateAuth", [
            "AuthFlow": "USER_SRP_AUTH",
            "ClientId": clientId,
            "AuthParameters": ["USERNAME": email, "SRP_A": srp.largeAHex],
        ])

        guard
            let params = initiate["ChallengeParameters"] as? [String: String],
            let userId = params["USER_ID_FOR_SRP"],
            let srpBHex = params["SRP_B"],
            let saltHex = params["SALT"],
            let secretBlock = params["SECRET_BLOCK"],
            let serverB = BigInt(srpBHex, radix: 16),
            let salt = BigInt(saltHex, radix: 16)
        else {
            throw SRPError.invalidServerValue("challenge parameters")
        }

        let key = try srp.passwordAuthenticationKey(
            poolName: poolName,
            userId: userId,
            password: password,
            serverB: serverB,
            salt: salt
        )
        let timestamp = SRPClient.timestamp()
        let signature = try SRPClient.claimSignature(
            key: key,
            poolName: poolName,
            userId: userId,
            secretBlockBase64: secretBlock,
            timestamp: timestamp
        )

        let response = try await call("RespondToAuthChallenge", [
            "ChallengeName": "PASSWORD_VERIFIER",
            "ClientId": clientId,
            "ChallengeResponses": [
                "USERNAME": userId,
                "PASSWORD_CLAIM_SECRET_BLOCK": secretBlock,
                "TIMESTAMP": timestamp,
                "PASSWORD_CLAIM_SIGNATURE": signature,
            ],
        ])

        guard
            let result = response["AuthenticationResult"] as? [String: Any],
            let idToken = result["IdToken"] as? String,
            let accessToken = result["AccessToken"] as? String,
            let refreshToken = result["RefreshToken"] as? String
        else {
            // MFA や NEW_PASSWORD_REQUIRED 等の追加チャレンジはこのアプリでは未対応。
            throw CognitoError(code: "UnsupportedChallenge", serverMessage: "追加の認証手順が必要なアカウントです")
        }
        let expiresIn = (result["ExpiresIn"] as? Double) ?? 3600
        return AuthTokens(
            idToken: idToken,
            accessToken: accessToken,
            refreshToken: refreshToken,
            expiresAt: Date().addingTimeInterval(expiresIn),
            email: email
        )
    }

    /// Refresh Token から ID/Access Token を更新する(Refresh Token 自体は据え置き)。
    func refresh(_ tokens: AuthTokens) async throws -> AuthTokens {
        let response = try await call("InitiateAuth", [
            "AuthFlow": "REFRESH_TOKEN_AUTH",
            "ClientId": clientId,
            "AuthParameters": ["REFRESH_TOKEN": tokens.refreshToken],
        ])
        guard
            let result = response["AuthenticationResult"] as? [String: Any],
            let idToken = result["IdToken"] as? String,
            let accessToken = result["AccessToken"] as? String
        else {
            throw SRPError.invalidServerValue("refresh result")
        }
        let expiresIn = (result["ExpiresIn"] as? Double) ?? 3600
        var updated = tokens
        updated.idToken = idToken
        updated.accessToken = accessToken
        updated.expiresAt = Date().addingTimeInterval(expiresIn)
        if let newRefresh = result["RefreshToken"] as? String { updated.refreshToken = newRefresh }
        return updated
    }

    func globalSignOut(accessToken: String) async throws {
        _ = try await call("GlobalSignOut", ["AccessToken": accessToken])
    }

    // MARK: - HTTP

    private func call(_ target: String, _ body: [String: Any]) async throws -> [String: Any] {
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/x-amz-json-1.1", forHTTPHeaderField: "Content-Type")
        request.setValue("AWSCognitoIdentityProviderService.\(target)", forHTTPHeaderField: "X-Amz-Target")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]

        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            let rawType = (json["__type"] as? String) ?? (json["code"] as? String) ?? "UnknownError"
            let code = rawType.split(separator: "#").last.map(String.init) ?? rawType
            let message = (json["message"] as? String) ?? (json["Message"] as? String) ?? ""
            throw CognitoError(code: code, serverMessage: message)
        }
        return json
    }
}
