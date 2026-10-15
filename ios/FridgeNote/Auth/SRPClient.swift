import BigInt
import CryptoKit
import Foundation

enum SRPError: LocalizedError {
    case invalidServerValue(String)
    case invalidEncoding

    var errorDescription: String? {
        switch self {
        case .invalidServerValue(let detail): return "認証サーバーの応答が不正です(\(detail))"
        case .invalidEncoding: return "認証サーバーの応答を解釈できません"
        }
    }
}

/// Cognito の USER_SRP_AUTH 用クライアント実装。
/// amazon-cognito-identity-js の AuthenticationHelper と同じ計算を行う(パディング規則まで含めて互換)。
struct SRPClient {
    private static let nHex =
        "FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD1" +
        "29024E088A67CC74020BBEA63B139B22514A08798E3404DD" +
        "EF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245" +
        "E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7ED" +
        "EE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3D" +
        "C2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F" +
        "83655D23DCA3AD961C62F356208552BB9ED529077096966D" +
        "670C354E4ABC9804F1746C08CA18217C32905E462E36CE3B" +
        "E39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9" +
        "DE2BCBF6955817183995497CEA956AE515D2261898FA0510" +
        "15728E5A8AAAC42DAD33170D04507A33A85521ABDF1CBA64" +
        "ECFB850458DBEF0A8AEA71575D060C7DB3970F85A6E1E4C7" +
        "ABF5AE8CDB0933D71E8C94E04A25619DCEE3D2261AD2EE6B" +
        "F12FFA06D98A0864D87602733EC86A64521F2B18177B200C" +
        "BBE117577A615D6C770988C0BAD946E208E24FA074E5AB31" +
        "43DB5BFCE0FD108E4B82D120A93AD2CAFFFFFFFFFFFFFFFF"

    static let N = BigInt(nHex, radix: 16)!
    static let g = BigInt(2)
    static let k = BigInt(hexHash(padHex(N) + padHex(g)), radix: 16)!

    private static let infoBits: Data = {
        var d = Data("Caldera Derived Key".utf8)
        d.append(1)
        return d
    }()

    let smallA: BigInt
    let largeA: BigInt

    /// `smallA` はテスト用に固定値を渡せる。通常は nil(1024bit の乱数を生成)。
    init(smallA: BigInt? = nil) throws {
        let a = smallA ?? SRPClient.randomSmallA()
        let A = SRPClient.g.power(a, modulus: SRPClient.N)
        if A % SRPClient.N == 0 { throw SRPError.invalidServerValue("A mod N is zero") }
        self.smallA = a
        self.largeA = A
    }

    /// InitiateAuth の SRP_A に渡す値(パディング無しの16進)。
    var largeAHex: String { String(largeA, radix: 16) }

    /// サーバーの B/SALT とパスワードから、署名用の HKDF 鍵(16 byte)を導出する。
    func passwordAuthenticationKey(
        poolName: String,
        userId: String,
        password: String,
        serverB: BigInt,
        salt: BigInt
    ) throws -> Data {
        let N = SRPClient.N
        if serverB % N == 0 { throw SRPError.invalidServerValue("B mod N is zero") }

        let u = BigInt(SRPClient.hexHash(SRPClient.padHex(largeA) + SRPClient.padHex(serverB)), radix: 16)!
        if u == 0 { throw SRPError.invalidServerValue("U is zero") }

        let userPasswordHash = SRPClient.sha256Hex(Data("\(poolName)\(userId):\(password)".utf8))
        let x = BigInt(SRPClient.hexHash(SRPClient.padHex(salt) + userPasswordHash), radix: 16)!

        let gx = SRPClient.g.power(x, modulus: N)
        var base = (serverB - SRPClient.k * gx) % N
        if base < 0 { base += N }
        let s = base.power(smallA + u * x, modulus: N)

        return SRPClient.hkdf(
            ikm: SRPClient.hexToData(SRPClient.padHex(s)),
            salt: SRPClient.hexToData(SRPClient.padHex(u))
        )
    }

    /// PASSWORD_CLAIM_SIGNATURE(base64)。
    static func claimSignature(
        key: Data,
        poolName: String,
        userId: String,
        secretBlockBase64: String,
        timestamp: String
    ) throws -> String {
        guard let secretBlock = Data(base64Encoded: secretBlockBase64) else { throw SRPError.invalidEncoding }
        var message = Data()
        message.append(Data(poolName.utf8))
        message.append(Data(userId.utf8))
        message.append(secretBlock)
        message.append(Data(timestamp.utf8))
        let mac = HMAC<SHA256>.authenticationCode(for: message, using: SymmetricKey(data: key))
        return Data(mac).base64EncodedString()
    }

    /// Cognito が要求する "Tue Oct 14 03:12:45 UTC 2026" 形式(日は0埋めしない、ロケール非依存)。
    static func timestamp(for date: Date = Date()) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let c = calendar.dateComponents([.year, .month, .day, .hour, .minute, .second, .weekday], from: date)
        let weekNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
        let monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        let two = { (v: Int) in v < 10 ? "0\(v)" : "\(v)" }
        return "\(weekNames[c.weekday! - 1]) \(monthNames[c.month! - 1]) \(c.day!) "
            + "\(two(c.hour!)):\(two(c.minute!)):\(two(c.second!)) UTC \(c.year!)"
    }

    // MARK: - プリミティブ

    /// 符号ビットが立つ場合に "00" を前置した偶数長の16進(Java BigInteger.toByteArray 互換、非負値のみ)。
    static func padHex(_ value: BigInt) -> String {
        var hex = String(value, radix: 16)
        if hex.count % 2 != 0 { hex = "0" + hex }
        if let first = hex.first, "89abcdefABCDEF".contains(first) { hex = "00" + hex }
        return hex
    }

    static func hexToData(_ hex: String) -> Data {
        var data = Data(capacity: hex.count / 2)
        var index = hex.startIndex
        while index < hex.endIndex {
            let next = hex.index(index, offsetBy: 2)
            data.append(UInt8(hex[index..<next], radix: 16)!)
            index = next
        }
        return data
    }

    static func sha256Hex(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    static func hexHash(_ hex: String) -> String {
        sha256Hex(hexToData(hex))
    }

    private static func hkdf(ikm: Data, salt: Data) -> Data {
        let prk = HMAC<SHA256>.authenticationCode(for: ikm, using: SymmetricKey(data: salt))
        let okm = HMAC<SHA256>.authenticationCode(for: infoBits, using: SymmetricKey(data: Data(prk)))
        return Data(Data(okm).prefix(16))
    }

    private static func randomSmallA() -> BigInt {
        var bytes = [UInt8](repeating: 0, count: 128)
        let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        precondition(status == errSecSuccess, "SecRandomCopyBytes failed")
        let hex = bytes.map { String(format: "%02x", $0) }.joined()
        return BigInt(hex, radix: 16)!
    }
}
