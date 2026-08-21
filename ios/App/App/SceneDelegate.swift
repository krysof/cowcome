import UIKit
import Capacitor

final class GameViewController: CAPBridgeViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        configureTouchDelivery()
        DispatchQueue.main.async { [weak self] in self?.configureTouchDelivery() }
    }

    private func configureTouchDelivery() {
        view.isMultipleTouchEnabled = true
        guard let webView else { return }
        webView.isMultipleTouchEnabled = true
        webView.scrollView.isMultipleTouchEnabled = true
        webView.scrollView.delaysContentTouches = false
        webView.scrollView.canCancelContentTouches = false
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
