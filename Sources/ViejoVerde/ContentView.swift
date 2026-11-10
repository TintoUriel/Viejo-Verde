import SwiftUI
import ViejoVerdeCore

enum Pestania: Hashable {
    case hoy, plantas, semillas, asistente, ajustes
}

struct ContentView: View {
    @Environment(Almacen.self) private var almacen
    @Environment(\.scenePhase) private var fase
    @State private var pestania: Pestania = .hoy

    var body: some View {
        VStack(spacing: 0) {
            if almacen.modoEjemplo { BannerEjemplo() }
            if let error = almacen.ultimoError {
                Text(error)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(8)
                    .background(Tema.alerta)
            }
            TabView(selection: $pestania) {
                VistaHoy()
                    .tabItem { Label("Hoy", systemImage: "sun.max.fill") }
                    .tag(Pestania.hoy)
                    .badge(almacen.tareas.count)
                VistaPlantas()
                    .tabItem { Label("Plantas", systemImage: "leaf.fill") }
                    .tag(Pestania.plantas)
                VistaSemillas()
                    .tabItem { Label("Semillas", systemImage: "circle.grid.3x3.fill") }
                    .tag(Pestania.semillas)
                VistaAsistente()
                    .tabItem { Label("Asistente", systemImage: "bubble.left.and.text.bubble.right.fill") }
                    .tag(Pestania.asistente)
                VistaAjustes()
                    .tabItem { Label("Ajustes", systemImage: "gearshape.fill") }
                    .tag(Pestania.ajustes)
            }
        }
        .onChange(of: fase) { _, nueva in
            if nueva == .active { almacen.alVolver() }
            if nueva == .background { almacen.sync.programarSegundoPlano() }
        }
    }
}

/// Cartel fijo arriba mientras se usan datos de ejemplo.
struct BannerEjemplo: View {
    @Environment(Almacen.self) private var almacen

    var body: some View {
        HStack {
            Label("Modo ejemplo: estos datos no son tuyos", systemImage: "testtube.2")
                .font(.footnote.weight(.semibold))
            Spacer()
            Button("Salir") { almacen.salirModoEjemplo() }
                .font(.footnote.weight(.bold))
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
        .background(Tema.ambarSuave)
        .foregroundStyle(Tema.ambar)
    }
}
