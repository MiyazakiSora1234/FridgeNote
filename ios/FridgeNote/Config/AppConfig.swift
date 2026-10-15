import Foundation

/// デプロイ先の接続情報。`make sync-ios-config`(scripts/sync-ios-config.mjs)が terraform output から書き換える。
/// いずれも公開クライアント向けの値でシークレットではない。
enum AppConfig {
    static let apiBaseUrl = "https://ig9bl6uwje.execute-api.us-east-1.amazonaws.com"
    static let cognitoRegion = "us-east-1"
    static let cognitoUserPoolId = "us-east-1_lBpaT4lPX"
    static let cognitoUserPoolClientId = "5hoi2gkns8ot36smnilmu5o3sk"
}
