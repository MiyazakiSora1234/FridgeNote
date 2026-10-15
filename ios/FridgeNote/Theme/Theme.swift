import SwiftUI

extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: opacity
        )
    }
}

enum Theme {
    static let primary = Color(hex: 0x2E7D32)
    static let primaryDark = Color(hex: 0x1B5E20)
    static let primaryLight = Color(hex: 0xE8F5E9)
    static let background = Color(hex: 0xF6F7F5)
    static let surface = Color.white
    static let border = Color(hex: 0xE3E4E0)
    static let text = Color(hex: 0x1C1C1E)
    static let textMuted = Color(hex: 0x6B6D70)
    static let textFaint = Color(hex: 0x9B9DA0)
    static let danger = Color(hex: 0xD32F2F)
    static let dangerLight = Color(hex: 0xFDECEC)
    static let warning = Color(hex: 0xB26A00)
    static let warningLight = Color(hex: 0xFFF3E0)
    static let success = Color(hex: 0x2E7D32)
    static let overlay = Color.black.opacity(0.55)

    enum Spacing {
        static let xs: CGFloat = 4
        static let sm: CGFloat = 8
        static let md: CGFloat = 12
        static let lg: CGFloat = 16
        static let xl: CGFloat = 24
        static let xxl: CGFloat = 32
    }

    enum Radius {
        static let sm: CGFloat = 8
        static let md: CGFloat = 12
        static let lg: CGFloat = 18
    }
}

extension Font {
    static let appTitle = Font.system(size: 26, weight: .bold)
    static let appHeading = Font.system(size: 18, weight: .bold)
    static let appBody = Font.system(size: 15)
    static let appBodyMuted = Font.system(size: 14)
    static let appCaption = Font.system(size: 12)
}
