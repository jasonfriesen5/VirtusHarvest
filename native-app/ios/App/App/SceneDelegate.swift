import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    // This is the ONLY place a window is created.
    //
    // Info.plist previously declared three separate ways to get one:
    // UIMainStoryboardFile, UISceneStoryboardFile, and AppDelegate.window. With
    // more than one path, which window ended up key and visible varied by launch
    // — on device the app's window often never became visible at all, so the
    // WebView loaded and ran JavaScript (its console output reached the log)
    // behind a plain black UIWindow. Both storyboard keys are now gone and the
    // window is built explicitly here, so there is exactly one and it is always
    // shown.
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else {
            print("[VirtusScene] willConnectTo called with a non-window scene")
            return
        }

        if window == nil {
            window = UIWindow(windowScene: windowScene)
        }
        if window?.rootViewController == nil {
            window?.rootViewController = CAPBridgeViewController()
        }
        window?.makeKeyAndVisible()

        // Proof of life in the device log: if this line is missing from a launch,
        // the scene delegate never ran and the problem is upstream of here.
        print("[VirtusScene] window visible, root = \(String(describing: window?.rootViewController))")

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
