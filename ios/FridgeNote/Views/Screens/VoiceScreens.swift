import AVFoundation
import SwiftUI

private enum VoiceError: LocalizedError {
    case startFailed
    case noRecording

    var errorDescription: String? {
        switch self {
        case .startFailed: return "録音を開始できませんでした"
        case .noRecording: return "録音データを取得できませんでした"
        }
    }
}

@MainActor
final class VoiceRecorder: ObservableObject {
    enum Phase { case idle, recording, uploading }

    @Published var phase: Phase = .idle

    private var recorder: AVAudioRecorder?
    private var fileURL: URL?

    /// 録音を開始する。マイク権限が拒否された場合は false。
    func start() async throws -> Bool {
        let granted = await withCheckedContinuation { continuation in
            AVAudioSession.sharedInstance().requestRecordPermission { continuation.resume(returning: $0) }
        }
        guard granted else { return false }

        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
        try session.setActive(true)

        let url = FileManager.default.temporaryDirectory.appendingPathComponent("voice-\(UUID().uuidString).m4a")
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 44_100,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
        ]
        let newRecorder = try AVAudioRecorder(url: url, settings: settings)
        guard newRecorder.record() else { throw VoiceError.startFailed }

        recorder = newRecorder
        fileURL = url
        phase = .recording
        return true
    }

    /// 録音を止めて音声データを返す。
    func stop() throws -> Data {
        guard let recorder, let url = fileURL else { throw VoiceError.noRecording }
        recorder.stop()
        self.recorder = nil
        fileURL = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        defer { try? FileManager.default.removeItem(at: url) }
        return try Data(contentsOf: url)
    }

    /// 画面を離れたときにマイクを解放し、一時ファイルを消す。
    func cancel() {
        recorder?.stop()
        recorder = nil
        if let url = fileURL { try? FileManager.default.removeItem(at: url) }
        fileURL = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}

struct VoiceRecordView: View {
    private static let audioContentType = "audio/m4a"

    @EnvironmentObject private var router: Router
    @StateObject private var recorder = VoiceRecorder()
    @State private var alert: AlertInfo?

    var body: some View {
        VStack(spacing: Theme.Spacing.sm) {
            Text(recorder.phase == .recording ? "🔴" : "🎤").font(.system(size: 56))
            Text(title)
                .font(.appHeading)
                .foregroundStyle(Theme.text)
                .multilineTextAlignment(.center)
            if recorder.phase == .idle {
                Text("例:「鶏もも肉300グラムと卵6個を追加」")
                    .font(.appBodyMuted)
                    .foregroundStyle(Theme.textMuted)
                    .multilineTextAlignment(.center)
            }

            if recorder.phase == .uploading {
                ProgressView().controlSize(.large).tint(Theme.primary).padding(.top, Theme.Spacing.xl)
            } else {
                Button {
                    Task {
                        if recorder.phase == .recording {
                            await onStop()
                        } else {
                            await onStart()
                        }
                    }
                } label: {
                    Text(recorder.phase == .recording ? "⏹" : "🎤")
                        .font(.system(size: 36))
                        .frame(width: 96, height: 96)
                        .background(recorder.phase == .recording ? Theme.danger : Theme.primary)
                        .clipShape(Circle())
                }
                .accessibilityLabel(recorder.phase == .recording ? "録音を終了する" : "録音を開始する")
                .padding(.top, Theme.Spacing.xl)
            }
        }
        .padding(Theme.Spacing.xl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .screenBackground()
        .onDisappear { recorder.cancel() }
        .alertInfo($alert)
    }

    private var title: String {
        switch recorder.phase {
        case .recording: return "録音中..."
        case .uploading: return "解析を開始しています..."
        case .idle: return "買った物を話してください"
        }
    }

    private func onStart() async {
        do {
            let started = try await recorder.start()
            if !started {
                alert = AlertInfo("マイクの使用を許可してください")
            }
        } catch {
            alert = AlertInfo("録音を開始できませんでした", error: error)
        }
    }

    private func onStop() async {
        recorder.phase = .uploading
        do {
            let audio = try recorder.stop()
            let presigned = try await APIClient.shared.createPresignedUrl(contentType: Self.audioContentType)
            try await APIClient.shared.upload(data: audio, to: presigned.uploadUrl, contentType: Self.audioContentType)
            let created = try await APIClient.shared.createVoiceTranscription(audioKey: presigned.imageKey)
            router.replaceTop(with: .voiceConfirm(created.analysisId))
        } catch {
            alert = AlertInfo("アップロードに失敗しました", error: error)
            recorder.phase = .idle
        }
    }
}

struct VoiceConfirmView: View {
    let analysisId: String

    @StateObject private var poller = AnalysisPoller<VoiceAnalysis>()

    init(analysisId: String) {
        self.analysisId = analysisId
    }

    var body: some View {
        content
            .task(id: analysisId) {
                await poller.run(
                    fetch: { try await APIClient.shared.getVoiceTranscription(analysisId) },
                    isPending: { $0.status.isPending }
                )
            }
    }

    @ViewBuilder
    private var content: some View {
        if poller.timedOut {
            ManualFallbackView(message: "解析に時間がかかっています。手動で登録してください。")
        } else if poller.error != nil, poller.data == nil {
            ManualFallbackView(message: "解析結果を取得できませんでした。手動で登録してください。")
        } else if let analysis = poller.data, !analysis.status.isPending {
            if analysis.status == .failed || analysis.result == nil {
                ManualFallbackView(message: "音声を認識できませんでした。手動で登録してください。")
            } else if let result = analysis.result {
                ParsedItemsBulkView(
                    analysisId: analysisId,
                    source: "voice",
                    items: result.items,
                    title: "🎤 聞き取った内容"
                )
            }
        } else {
            WaitingView(message: "🎤 音声を解析しています")
        }
    }
}
