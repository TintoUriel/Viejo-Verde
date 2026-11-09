import Charts
import SwiftUI
import ViejoVerdeCore

/// Historial de cosechas con totales, gráficos y agrupado por variedad y temporada.
struct VistaCosechas: View {
    @Environment(Almacen.self) private var almacen

    var body: some View {
        let cosechas = Estadisticas.cosechas(almacen.datos.plantas)
        List {
            if cosechas.isEmpty {
                ContentUnavailableView("Todavía no cosechaste",
                                       systemImage: "scissors",
                                       description: Text("Cuando cosechés una planta, acá vas a ver cuánto rindió."))
                    .listRowBackground(Color.clear)
            } else {
                resumen(cosechas)
                grafico(cosechas)
                grupos("Por variedad", Estadisticas.porVariedad(cosechas))
                grupos("Por temporada", Estadisticas.porTemporada(cosechas))
                Section("Cosechas") {
                    ForEach(cosechas) { c in
                        NavigationLink(value: c.plantaID) { FilaCosecha(cosecha: c) }
                    }
                }
            }
        }
        .navigationTitle("Cosechas")
    }

    private func resumen(_ c: [ResumenCosecha]) -> some View {
        Section {
            HStack(spacing: 8) {
                Cifra(valor: "\(Formato.numero(Estadisticas.totalSecos(c))) g", texto: "Secos en total")
                Cifra(valor: Estadisticas.promedioSecos(c).map { "\(Formato.numero($0)) g" } ?? "—", texto: "Por planta")
                Cifra(valor: "\(c.count)", texto: "Cosechas")
            }
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
        }
    }

    @ViewBuilder
    private func grafico(_ c: [ResumenCosecha]) -> some View {
        let conSecos = c.filter { $0.secos != nil }.reversed()
        if !conSecos.isEmpty {
            Section("Gramos secos por cosecha") {
                Chart(Array(conSecos)) { r in
                    BarMark(x: .value("Planta", r.nombre), y: .value("Gramos", r.secos ?? 0))
                        .foregroundStyle(Tema.ambar)
                        .annotation(position: .top) {
                            Text(Formato.numero(r.secos ?? 0)).font(.caption2).foregroundStyle(.secondary)
                        }
                }
                .frame(height: 200)
                .padding(.vertical, 8)
            }
        }
    }

    private func grupos(_ titulo: String, _ g: [ResumenGrupo]) -> some View {
        Section(titulo) {
            ForEach(g) { grupo in
                VStack(alignment: .leading, spacing: 3) {
                    HStack {
                        Text(grupo.nombre).font(.headline)
                        Spacer()
                        Text("\(Formato.numero(grupo.totalSecos)) g").font(.headline.monospacedDigit())
                    }
                    Text(detalle(grupo)).font(.footnote).foregroundStyle(.secondary)
                }
            }
        }
    }

    private func detalle(_ g: ResumenGrupo) -> String {
        var partes = ["\(g.cosechas) cosecha\(g.cosechas == 1 ? "" : "s")"]
        if let p = g.promedioSecos { partes.append("\(Formato.numero(p)) g por planta") }
        if let d = g.promedioDias { partes.append("ciclo de \(d) días") }
        return partes.joined(separator: " · ")
    }
}

private struct Cifra: View {
    let valor: String
    let texto: String

    var body: some View {
        VStack(spacing: 2) {
            Text(valor)
                .font(.title3.weight(.bold).monospacedDigit())
                .foregroundStyle(Tema.ambar)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Text(texto).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Tema.tarjeta))
    }
}

private struct FilaCosecha: View {
    let cosecha: ResumenCosecha

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(cosecha.nombre).font(.headline)
                Spacer()
                Text(cosecha.secos.map { "\(Formato.numero($0)) g" } ?? "secando")
                    .font(.headline.monospacedDigit())
                    .foregroundStyle(cosecha.secos == nil ? Color.secondary : Tema.ambar)
            }
            Text(detalle).font(.footnote).foregroundStyle(.secondary)
        }
    }

    private var detalle: String {
        var partes = [cosecha.variedad, Formato.fechaCorta(cosecha.fecha), "\(cosecha.diasCiclo) días",
                      "\(Formato.numero(cosecha.humedos)) g húmedos"]
        if let r = cosecha.rendimiento { partes.append("\(Formato.numero(r * 100)) % seco") }
        return partes.joined(separator: " · ")
    }
}
