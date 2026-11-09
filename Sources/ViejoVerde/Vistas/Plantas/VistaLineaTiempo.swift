import SwiftUI
import ViejoVerdeCore

/// Las fotos de una planta en orden, con el día de cultivo y la etapa de cada una.
struct VistaLineaTiempo: View {
    @Environment(Almacen.self) private var almacen
    let plantaID: UUID
    @State private var fotoAbierta: FotoElegida?

    var body: some View {
        Group {
            if let p = almacen.datos.planta(plantaID) {
                if p.fotos.isEmpty {
                    ContentUnavailableView("Sin fotos", systemImage: "photo",
                                           description: Text("Sacale fotos desde el detalle de la planta."))
                } else {
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 18) {
                            ForEach(p.lineaDeTiempo) { f in
                                fila(p, f)
                            }
                        }
                        .padding()
                    }
                }
            }
        }
        .background(Tema.fondo)
        .navigationTitle("Línea de tiempo")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $fotoAbierta) { f in
            VisorFoto(nombre: f.nombre) {
                Fotos.borrar(f.nombre)
                almacen.cambiar { $0.quitarFoto(f.nombre, en: plantaID) }
            }
        }
    }

    private func fila(_ p: Planta, _ f: FotoFechada) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            if let fecha = f.fecha {
                let dia = Calendario.dias(desde: p.fechaGerminacion, hasta: fecha)
                let etapa = Etapas.etapaDeCultivo(enDia: dia, tramos: Etapas.tramos(de: p)).etapa
                HStack {
                    Text("Día \(dia)").font(.headline.monospacedDigit())
                    Text(Formato.fechaCorta(fecha)).font(.subheadline).foregroundStyle(.secondary)
                    Spacer()
                    EtiquetaEtapa(etapa: etapa)
                }
            } else {
                Text("Sin fecha").font(.subheadline).foregroundStyle(.secondary)
            }
            Button { fotoAbierta = FotoElegida(nombre: f.nombre) } label: {
                if let imagen = Fotos.cargar(f.nombre) {
                    Image(uiImage: imagen)
                        .resizable()
                        .scaledToFit()
                        .frame(maxWidth: .infinity)
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                } else {
                    Label("No encuentro la foto", systemImage: "photo").foregroundStyle(.secondary)
                }
            }
            .buttonStyle(.plain)
        }
    }
}
