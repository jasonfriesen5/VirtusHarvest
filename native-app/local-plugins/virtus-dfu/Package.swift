// swift-tools-version: 5.9
import PackageDescription

// Wraps Nordic's own IOS-DFU-Library (the "NordicDFU" product), which is the
// library Nordic ships for nRF5-SDK Secure DFU bootloaders — the kind flashed on
// the Virtus scale (SoftDevice S140 + secure bootloader).
//
// This exists instead of capacitor-community-nordic-dfu because that package
// ships only a CocoaPods podspec with no Package.swift, so Capacitor silently
// drops it from the SPM manifest and the plugin is missing at runtime.
let package = Package(
    name: "VirtusDfu",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "VirtusDfu",
            targets: ["VirtusDfu"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0"),
        .package(url: "https://github.com/NordicSemiconductor/IOS-DFU-Library.git", from: "4.15.0")
    ],
    targets: [
        .target(
            name: "VirtusDfu",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "NordicDFU", package: "IOS-DFU-Library")
            ],
            path: "ios/Sources/VirtusDfu")
    ]
)
