import SwiftUI

@main
struct ViejoVerdeApp: App {
    @UIApplicationDelegateAdaptor(DelegadoApp.self) private var delegado
    @State private var almacen = Almacen()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(almacen)
                .tint(Tema.verde)
        }
    }
}
