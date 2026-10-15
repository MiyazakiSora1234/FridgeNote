import AVFoundation
import PhotosUI
import SwiftUI

// MARK: - カメラ制御

private enum CameraError: LocalizedError {
    case captureFailed

    var errorDescription: String? { "撮影に失敗しました" }
}

/// `AVCapturePhotoOutput` のコールバックを受け取る使い捨てのデリゲート。
private final class PhotoCaptureDelegate: NSObject, AVCapturePhotoCaptureDelegate {
    private let completion: (Result<Data, Error>) -> Void

    init(completion: @escaping (Result<Data, Error>) -> Void) {
        self.completion = completion
    }

    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        if let error {
            completion(.failure(error))
        } else if let data = photo.fileDataRepresentation() {
            completion(.success(data))
        } else {
            completion(.failure(CameraError.captureFailed))
        }
    }
}

@MainActor
final class CameraModel: ObservableObject {
    enum Status {
        case checking
        case notDetermined // 未許可(許可ダイアログを出せる)
        case authorized
        case denied // 設定アプリでの許可が必要
        case unavailable // シミュレータなどカメラ非搭載
    }

    @Published private(set) var status: Status = .checking

    let session = AVCaptureSession()
    private let output = AVCapturePhotoOutput()
    private let sessionQueue = DispatchQueue(label: "com.fridgenote.camera.session")
    private var configured = false
    private var activeDelegate: PhotoCaptureDelegate?

    func prepare() async {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: configureAndStart()
        case .notDetermined: status = .notDetermined
        default: status = .denied
        }
    }

    func requestAccess() async {
        let granted = await AVCaptureDevice.requestAccess(for: .video)
        if granted {
            configureAndStart()
        } else {
            status = .denied
        }
    }

    func startRunning() {
        guard configured else { return }
        let session = session
        sessionQueue.async { if !session.isRunning { session.startRunning() } }
    }

    func stopRunning() {
        let session = session
        sessionQueue.async { if session.isRunning { session.stopRunning() } }
    }

    func capturePhoto() async throws -> Data {
        defer { activeDelegate = nil }
        return try await withCheckedThrowingContinuation { continuation in
            let delegate = PhotoCaptureDelegate { result in continuation.resume(with: result) }
            activeDelegate = delegate
            output.capturePhoto(with: AVCapturePhotoSettings(), delegate: delegate)
        }
    }

    private func configureAndStart() {
        if !configured {
            guard
                let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
                let input = try? AVCaptureDeviceInput(device: device)
            else {
                status = .unavailable
                return
            }
            session.beginConfiguration()
            session.sessionPreset = .photo
            if session.canAddInput(input) { session.addInput(input) }
            if session.canAddOutput(output) { session.addOutput(output) }
            session.commitConfiguration()
            configured = true
        }
        status = .authorized
        startRunning()
    }
}

private struct CameraPreview: UIViewRepresentable {
    let session: AVCaptureSession

    func makeUIView(context: Context) -> PreviewView {
        let view = PreviewView()
        view.previewLayer.session = session
        view.previewLayer.videoGravity = .resizeAspectFill
        return view
    }

    func updateUIView(_ uiView: PreviewView, context: Context) {}

    final class PreviewView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }

        var previewLayer: AVCaptureVideoPreviewLayer {
            // layerClass で保証されている
            layer as! AVCaptureVideoPreviewLayer
        }
    }
}

// MARK: - 画面

struct CameraScreen: View {
    let analysisType: AnalysisType

    @EnvironmentObject private var router: Router
    @StateObject private var camera = CameraModel()
    @State private var uploading = false
    @State private var pickerItem: PhotosPickerItem?
    @State private var alert: AlertInfo?

    init(analysisType: AnalysisType) {
        self.analysisType = analysisType
    }

    var body: some View {
        ZStack {
            switch camera.status {
            case .checking:
                Color.black.ignoresSafeArea()
            case .authorized:
                cameraLayout
            case .notDetermined, .denied, .unavailable:
                permissionLayout
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbarColorScheme(camera.status == .authorized ? .dark : .light, for: .navigationBar)
        .task { await camera.prepare() }
        .onAppear { camera.startRunning() }
        .onDisappear { camera.stopRunning() }
        .onChange(of: pickerItem) { item in
            guard let item else { return }
            Task { await handlePicked(item) }
        }
        .alertInfo($alert)
    }

    // MARK: レイアウト

    private var cameraLayout: some View {
        ZStack {
            CameraPreview(session: camera.session).ignoresSafeArea()

            VStack {
                Text(hintText)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(.vertical, 8)
                    .padding(.horizontal, 16)
                    .background(Theme.overlay)
                    .clipShape(Capsule())
                    .padding(.top, 56)
                Spacer()

                HStack {
                    if uploading {
                        shutterFrame { ProgressView().controlSize(.large).tint(.white) }
                    } else {
                        Spacer()
                        PhotosPicker(selection: $pickerItem, matching: .images) {
                            Text("🖼️")
                                .font(.system(size: 24))
                                .frame(width: 52, height: 52)
                                .background(Theme.overlay)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                        .accessibilityLabel("アルバムから選ぶ")
                        Spacer()
                        Button {
                            Task { await capture() }
                        } label: {
                            shutterFrame {
                                Circle().fill(.white).frame(width: 62, height: 62)
                            }
                        }
                        .accessibilityLabel("撮影する")
                        Spacer()
                        Color.clear.frame(width: 52, height: 52)
                        Spacer()
                    }
                }
                .padding(.bottom, 40)
            }
        }
    }

    private func shutterFrame<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        ZStack {
            Circle().stroke(Color.white.opacity(0.85), lineWidth: 4)
            content()
        }
        .frame(width: 78, height: 78)
    }

    private var permissionLayout: some View {
        VStack(spacing: 0) {
            Text("📷").font(.system(size: 48)).padding(.bottom, Theme.Spacing.md)
            Text(permissionTitle)
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(Theme.text)
                .multilineTextAlignment(.center)

            switch camera.status {
            case .notDetermined:
                AppButton(title: "許可する") { Task { await camera.requestAccess() } }
                    .padding(.top, Theme.Spacing.lg)
            case .denied:
                Text("設定アプリ → FridgeNote → カメラ を有効にしてから、もう一度お試しください。")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.textMuted)
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
                    .padding(.top, Theme.Spacing.md)
            default:
                Text("この端末ではカメラを使えません。アルバムの写真から登録できます。")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.textMuted)
                    .multilineTextAlignment(.center)
                    .padding(.top, Theme.Spacing.md)
            }

            PhotosPicker(selection: $pickerItem, matching: .images) {
                Text("🖼️ アルバムから選ぶ")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Theme.textMuted)
                    .padding(.vertical, 14)
            }
            .padding(.top, Theme.Spacing.md)

            if uploading {
                ProgressView().tint(Theme.primary).padding(.top, Theme.Spacing.md)
            }
        }
        .padding(.horizontal, Theme.Spacing.xl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .screenBackground()
    }

    private var permissionTitle: String {
        camera.status == .unavailable ? "カメラが見つかりません" : "カメラの使用を許可してください"
    }

    private var hintText: String {
        switch analysisType {
        case .food: return "🥦 食材を撮影してください"
        case .dish: return "🍽️ 料理を撮影してください"
        case .receipt: return "🧾 レシートを撮影してください"
        }
    }

    // MARK: 操作

    private func capture() async {
        guard !uploading else { return }
        uploading = true
        do {
            let data = try await camera.capturePhoto()
            await uploadAndAnalyze(data)
        } catch {
            uploading = false
            alert = AlertInfo("アップロードに失敗しました", error: error)
        }
    }

    private func handlePicked(_ item: PhotosPickerItem) async {
        defer { pickerItem = nil }
        guard !uploading else { return }
        uploading = true
        do {
            guard let data = try await item.loadTransferable(type: Data.self) else {
                throw ImagePrep.PrepError()
            }
            await uploadAndAnalyze(data)
        } catch {
            uploading = false
            alert = AlertInfo("アップロードに失敗しました", error: error)
        }
    }

    /// 呼び出し側で `uploading = true` にしてから呼ぶ。完了時に必ず `uploading` を戻す。
    private func uploadAndAnalyze(_ raw: Data) async {
        defer { uploading = false }
        do {
            let jpeg = try await Task.detached { try ImagePrep.jpegForUpload(from: raw) }.value
            let presigned = try await APIClient.shared.createPresignedUrl(contentType: ImagePrep.contentType)
            try await APIClient.shared.upload(data: jpeg, to: presigned.uploadUrl, contentType: ImagePrep.contentType)
            let created = try await APIClient.shared.createAnalysis(imageKey: presigned.imageKey, type: analysisType)
            router.replaceTop(with: .analysisResult(created.analysisId))
        } catch {
            alert = AlertInfo("アップロードに失敗しました", error: error)
        }
    }
}
