import SwiftUI
import ViejoVerdeCore

struct VistaPlantas: View {
    @Environment(Almacen.self) private var almacen
    @State private var nueva = false

    private var activas: [Planta] { almacen.datos.plantas.filter { $0.estado == .activa } }
    private var postCosecha: [Planta] { almacen.datos.plantas.filter { $0.estado == .secando || $0.estado == .curando } }
    private var historial: [Planta] {
        almacen.datos.plantas.filter { $0.estado == .terminada || $0.estado == .descartada }
    }

    var body: some View {
        NavigationStack {
            List {
                if almacen.datos.plantas.isEmpty {
                    ContentUnavailableView {
                        Label("Sin plantas", systemImage: "leaf")
                    } description: {
                        Text("Tocá + para agregar la primera.")
                    } actions: {
                        Button("Agregar planta") { nueva = true }
                            .buttonStyle(.borderedProminent)
                    }
                    .listRowBackground(Color.clear)
                }
                if !activas.isEmpty {
                    Section("Activas (\(activas.count))") {
                        ForEach(activas) { p in
                            NavigationLink(value: p.id) { FilaPlanta(planta: p) }
                        }
                    }
                }
                if !postCosecha.isEmpty {
                    Section("Secando y curando") {
                        ForEach(postCosecha) { p in
                            NavigationLink(value: p.id) { FilaPlanta(planta: p) }
                        }
                    }
                }
                if !historial.isEmpty {
                    Section("Historial") {
                        ForEach(historial) { p in
                            NavigationLink(value: p.id) { FilaPlanta(planta: p) }
                        }
                    }
                }
            }
            .navigationTitle("Plantas")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Menu {
                        NavigationLink {
                            VistaPlanificador()
                        } label: {
                            Label("Planificar", systemImage: "calendar.badge.plus")
                        }
                        NavigationLink {
                            VistaCosechas()
                        } label: {
                            Label("Cosechas", systemImage: "chart.bar.fill")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle").font(.title3)
                    }
                    .accessibilityLabel("Más")
                }
                ToolbarItem(placement: .primaryAction) {
                    Button { nueva = true } label: {
                        Image(systemName: "plus.circle.fill").font(.title2)
                    }
                    .accessibilityLabel("Agregar planta")
                }
            }
            .navigationDestination(for: UUID.self) { id in DetallePlanta(plantaID: id) }
            .sheet(isPresented: $nueva) { FormPlanta() }
        }
    }
}

struct FilaPlanta: View {
    @Environment(Almacen.self) private var almacen
    let planta: Planta

    var body: some View {
        let e = almacen.estado(de: planta)
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(planta.nombre).font(.headline)
                if planta.sexo == .macho {
                    Image(systemName: "m.circle.fill").foregroundStyle(.blue)
                }
                if planta.ubicacion == .interior {
                    Image(systemName: "house.fill").font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                EtiquetaEtapa(etapa: e.etapa)
            }
            Text(subtitulo(e))
                .font(.subheadline)
                .foregroundStyle(.secondary)
            if planta.estado == .activa {
                BarraEtapas(estado: e, compacta: true)
            }
        }
        .padding(.vertical, 4)
    }

    private func subtitulo(_ e: EstadoEtapa) -> String {
        let variedad = planta.variedad.isEmpty ? planta.tipo.nombre : planta.variedad
        switch planta.estado {
        case .activa: return "\(variedad) · día \(e.dia) · semana \(e.semana)"
        case .secando: return "\(variedad) · secando hace \(e.diaEnEtapa) días"
        case .curando: return "\(variedad) · en frascos hace \(e.diaEnEtapa) días"
        case .terminada:
            if let g = planta.cosecha?.gramosSecos { return "\(variedad) · \(Formato.numero(g)) g secos" }
            return variedad
        case .descartada: return "\(variedad) · descartada"
        }
    }
}
