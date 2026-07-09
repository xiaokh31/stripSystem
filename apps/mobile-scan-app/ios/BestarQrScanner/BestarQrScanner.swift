import AVFoundation
import React
import UIKit

@objc(BestarQrScanner)
final class BestarQrScanner: NSObject {
  private var coordinator: BestarQrScannerCoordinator?

  @objc
  static func requiresMainQueueSetup() -> Bool {
    true
  }

  @objc
  func scanOnce(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      guard let presenter = Self.topViewController() else {
        reject("NO_VIEW_CONTROLLER", "Native camera scanner requires a visible view controller.", nil)
        return
      }

      let coordinator = BestarQrScannerCoordinator(
        resolve: resolve,
        reject: reject,
        onFinish: { [weak self] in self?.coordinator = nil }
      )
      self.coordinator = coordinator
      coordinator.start(from: presenter)
    }
  }

  private static func topViewController() -> UIViewController? {
    let windowScene = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .first { $0.activationState == .foregroundActive }
    let root = windowScene?.windows.first { $0.isKeyWindow }?.rootViewController
    return topViewController(from: root)
  }

  private static func topViewController(from controller: UIViewController?) -> UIViewController? {
    if let navigation = controller as? UINavigationController {
      return topViewController(from: navigation.visibleViewController)
    }
    if let tab = controller as? UITabBarController {
      return topViewController(from: tab.selectedViewController)
    }
    if let presented = controller?.presentedViewController {
      return topViewController(from: presented)
    }
    return controller
  }
}

private final class BestarQrScannerCoordinator: NSObject {
  private let resolve: RCTPromiseResolveBlock
  private let reject: RCTPromiseRejectBlock
  private let onFinish: () -> Void
  private var scannerViewController: BestarQrScannerViewController?

  init(
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock,
    onFinish: @escaping () -> Void
  ) {
    self.resolve = resolve
    self.reject = reject
    self.onFinish = onFinish
  }

  func start(from presenter: UIViewController) {
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized:
      presentScanner(from: presenter)
    case .notDetermined:
      AVCaptureDevice.requestAccess(for: .video) { [weak self, weak presenter] granted in
        DispatchQueue.main.async {
          guard let self, let presenter else { return }
          granted
            ? self.presentScanner(from: presenter)
            : self.finishWithError("CAMERA_PERMISSION_DENIED", "Camera permission denied.")
        }
      }
    case .denied, .restricted:
      finishWithError("CAMERA_PERMISSION_DENIED", "Camera permission denied.")
    @unknown default:
      finishWithError("CAMERA_PERMISSION_UNKNOWN", "Camera permission state is unknown.")
    }
  }

  private func presentScanner(from presenter: UIViewController) {
    let viewController = BestarQrScannerViewController()
    scannerViewController = viewController
    viewController.onPayload = { [weak self] payload in self?.finishWithPayload(payload) }
    viewController.onCancel = { [weak self] in
      self?.finishWithError("SCAN_CANCELLED", "Native camera scanner was cancelled.")
    }
    viewController.onError = { [weak self] code, message in self?.finishWithError(code, message) }
    viewController.modalPresentationStyle = .fullScreen
    presenter.present(viewController, animated: true)
  }

  private func finishWithPayload(_ payload: String) {
    let normalized = payload.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalized.isEmpty else {
      finishWithError("EMPTY_QR_PAYLOAD", "Native camera scanner returned an empty QR payload.")
      return
    }
    scannerViewController?.dismiss(animated: true)
    scannerViewController = nil
    resolve(normalized)
    onFinish()
  }

  private func finishWithError(_ code: String, _ message: String) {
    scannerViewController?.dismiss(animated: true)
    scannerViewController = nil
    reject(code, message, nil)
    onFinish()
  }
}

private final class BestarQrScannerViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
  var onPayload: ((String) -> Void)?
  var onCancel: (() -> Void)?
  var onError: ((String, String) -> Void)?

  private let captureSession = AVCaptureSession()
  private var previewLayer: AVCaptureVideoPreviewLayer?
  private var completed = false

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black
    configureCancelButton()
    configureCaptureSession()
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    previewLayer?.frame = view.bounds
  }

  override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    captureSession.stopRunning()
  }

  private func configureCancelButton() {
    let button = UIButton(type: .system)
    button.setTitle("Cancel", for: .normal)
    button.tintColor = .white
    button.backgroundColor = UIColor.black.withAlphaComponent(0.55)
    button.layer.cornerRadius = 6
    button.contentEdgeInsets = UIEdgeInsets(top: 10, left: 14, bottom: 10, right: 14)
    button.addTarget(self, action: #selector(cancel), for: .touchUpInside)
    button.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(button)
    NSLayoutConstraint.activate([
      button.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -16),
      button.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
    ])
  }

  private func configureCaptureSession() {
    guard let device = AVCaptureDevice.default(for: .video) else {
      onError?("CAMERA_UNAVAILABLE", "No camera device is available.")
      return
    }

    do {
      let input = try AVCaptureDeviceInput(device: device)
      if captureSession.canAddInput(input) {
        captureSession.addInput(input)
      }

      let output = AVCaptureMetadataOutput()
      if captureSession.canAddOutput(output) {
        captureSession.addOutput(output)
        output.setMetadataObjectsDelegate(self, queue: DispatchQueue.main)
        output.metadataObjectTypes = [.qr]
      }

      let preview = AVCaptureVideoPreviewLayer(session: captureSession)
      preview.videoGravity = .resizeAspectFill
      preview.frame = view.bounds
      view.layer.insertSublayer(preview, at: 0)
      previewLayer = preview

      DispatchQueue.global(qos: .userInitiated).async { [weak self] in
        self?.captureSession.startRunning()
      }
    } catch {
      onError?("CAMERA_START_FAILED", error.localizedDescription)
    }
  }

  func metadataOutput(
    _ output: AVCaptureMetadataOutput,
    didOutput metadataObjects: [AVMetadataObject],
    from connection: AVCaptureConnection
  ) {
    guard !completed else { return }
    guard
      let object = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
      object.type == .qr,
      let payload = object.stringValue
    else {
      return
    }

    completed = true
    captureSession.stopRunning()
    onPayload?(payload)
  }

  @objc
  private func cancel() {
    guard !completed else { return }
    completed = true
    captureSession.stopRunning()
    onCancel?()
  }
}
