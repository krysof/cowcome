import UIKit
import Capacitor
import AVFAudio

final class GameViewController: CAPBridgeViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        configureGameAudio()
        configureTouchDelivery()
        DispatchQueue.main.async { [weak self] in self?.configureTouchDelivery() }
    }

    private func configureGameAudio() {
        // Game audio follows the iPhone mute switch: silent mode stays silent,
        // while music and effects play normally after the player enters.
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.ambient, mode: .default, options: [])
            try session.setActive(true)
        } catch {
            NSLog("Unable to activate game audio session: %@", error.localizedDescription)
        }
    }

    private func configureTouchDelivery() {
        view.isMultipleTouchEnabled = true
        guard let webView else { return }
        webView.frame = view.bounds
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.isMultipleTouchEnabled = true
        webView.scrollView.isMultipleTouchEnabled = true
        webView.scrollView.delaysContentTouches = false
        webView.scrollView.canCancelContentTouches = false
        // The game handles safe areas in CSS.  Keep UIKit from shifting the
        // scroll view's interactive region away from what is drawn onscreen.
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.contentInset = .zero
        webView.scrollView.scrollIndicatorInsets = .zero
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = GameViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
