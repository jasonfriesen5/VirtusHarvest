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
        let webCanvasColor = UIColor(red: 36.0 / 255.0, green: 36.0 / 255.0, blue: 38.0 / 255.0, alpha: 1.0)
        window?.backgroundColor = webCanvasColor
        if window?.rootViewController == nil {
            window?.rootViewController = CAPBridgeViewController()
        }
        // Keep the native surface behind WKWebView dark while iOS replaces its
        // backing store during rotation. Otherwise UIKit's default white view
        // is visible for a frame (or several seconds on a busy field screen).
        window?.rootViewController?.view.backgroundColor = webCanvasColor
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
