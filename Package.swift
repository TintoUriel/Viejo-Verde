// swift-tools-version: 6.0
import Foundation
import PackageDescription

// Para correr los tests de la lógica fuera de iOS (Linux, WSL o Windows), sin compilar la app SwiftUI:
//     SOLO_CORE=1 swift test
let soloCore = ProcessInfo.processInfo.environment["SOLO_CORE"] != nil

var targets: [Target] = [
    // Lógica pura (solo Foundation): modelo, etapas, tareas, dosis, backup. Se testea en cualquier plataforma.
    .target(name: "ViejoVerdeCore"),
    .testTarget(name: "ViejoVerdeCoreTests", dependencies: ["ViejoVerdeCore"]),
]
var products: [Product] = [
    .library(name: "ViejoVerdeCore", targets: ["ViejoVerdeCore"])
]

if !soloCore {
    // La app SwiftUI. Un proyecto xtool necesita exactamente un producto library para la app.
    // Modo Swift 5 en la app: evita que los chequeos estrictos de concurrencia de Swift 6 frenen la
    // compilación de la UI (que no se puede compilar en Windows para probarla antes).
    targets.append(.target(name: "ViejoVerde", dependencies: ["ViejoVerdeCore"],
                           swiftSettings: [.swiftLanguageMode(.v5)]))
    products = [.library(name: "ViejoVerde", targets: ["ViejoVerde"])]
}

let package = Package(
    name: "ViejoVerde",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
    ],
    products: products,
    targets: targets
)
