import Foundation

/// デプロイ先の接続情報。`make sync-ios-config`(scripts/sync-ios-config.mjs)が terraform output から書き換える。
/// いずれも公開クライアント向けの値でシークレットではない。
enum AppConfig {
    static let apiBaseUrl = "https://p0qpnc4td8.execute-api.us-east-1.amazonaws.com"
    static let cognitoRegion = "us-east-1"
    static let cognitoUserPoolId = "us-east-1_5wExP4tp0"
    static let cognitoUserPoolClientId = "1kd69p4nb36smmpjgeidh3g1tb"
}
