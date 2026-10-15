import BigInt
import XCTest
@testable import FridgeNote

/// 期待値は amazon-cognito-identity-js 6.3.12 の AuthenticationHelper に同じ入力(固定の a)を与えて得たもの。
/// この実装がその計算と一致している限り、Cognito の USER_SRP_AUTH を通る。
final class SRPClientTests: XCTestCase {
    private let aHex = String(repeating: "1234567890abcdef", count: 16)
    private let bHex = String(repeating: "abcdef0123456789", count: 48)
    private let saltHex = "00ff12ab34cd56ef7890abcdef123456"
    private let userId = "0b0c5d2e-1111-4222-8333-444455556666"
    private let password = "Passw0rd-test"
    private let poolName = "lBpaT4lPX"
    private let secretBlock = "c2VjcmV0LWJsb2NrLWJ5dGVzLWZvci10ZXN0"
    private let timestamp = "Thu Oct 15 03:12:45 UTC 2026"

    func testMultiplierK() {
        XCTAssertEqual(
            String(SRPClient.k, radix: 16),
            "538282c4354742d7cbbde2359fcf67f9f5b3a6b08791e5011b43b8a5b66d9ee6"
        )
    }

    func testLargeA() throws {
        let srp = try SRPClient(smallA: BigInt(aHex, radix: 16)!)
        XCTAssertEqual(srp.largeAHex.prefix(64), "87ef46e6f23037298b68c9527f88af1cf90151a2246908b3a011df7c24e0a982")
        XCTAssertEqual(srp.largeAHex.suffix(32), "41e54e0551cf7d2d8f9b973ef4cc29df")
    }

    func testPasswordAuthenticationKeyAndSignature() throws {
        let srp = try SRPClient(smallA: BigInt(aHex, radix: 16)!)
        let key = try srp.passwordAuthenticationKey(
            poolName: poolName,
            userId: userId,
            password: password,
            serverB: BigInt(bHex, radix: 16)!,
            salt: BigInt(saltHex, radix: 16)!
        )
        XCTAssertEqual(key.map { String(format: "%02x", $0) }.joined(), "7f226f08fd8b1d7b10b339d646a80090")

        let signature = try SRPClient.claimSignature(
            key: key,
            poolName: poolName,
            userId: userId,
            secretBlockBase64: secretBlock,
            timestamp: timestamp
        )
        XCTAssertEqual(signature, "MNt/fRCrTW5ECEudDPyxUselxAdubV/NcMvUg8jw0/c=")
    }

    func testPadHex() {
        XCTAssertEqual(SRPClient.padHex(BigInt(20)), "14")
        XCTAssertEqual(SRPClient.padHex(BigInt(236)), "00ec")
        XCTAssertEqual(SRPClient.padHex(BigInt(0x123)), "0123")
        XCTAssertEqual(SRPClient.padHex(BigInt(56)), "38")
    }

    func testTimestampFormat() {
        // 2026-10-15 03:12:45 UTC は木曜日。日は0埋めしない。
        let date = Date(timeIntervalSince1970: 1_792_033_965)
        XCTAssertEqual(SRPClient.timestamp(for: date), "Thu Oct 15 03:12:45 UTC 2026")
        let early = Date(timeIntervalSince1970: 1_789_992_000) // 2026-09-21
        XCTAssertTrue(SRPClient.timestamp(for: early).hasPrefix("Mon Sep 21 "))
    }
}
