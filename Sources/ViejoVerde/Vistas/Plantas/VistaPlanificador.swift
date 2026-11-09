import Charts
import SwiftUI
import ViejoVerdeCore

/// "Si germino hoy, ¿cuándo cosecho?" y cuántas plantas vas a tener en flor cada semana.
struct VistaPlanificador: View {
    @Environment(Almacen.self) private var almacen
    @State private var tipo: TipoPlanta = .auto
    @State private var cantidad = 3
    @State private var germinacion = Date()

    private var nuevas: [Planta] {
        Planificador.hipoteticas(tipo: tipo, cantidad: cantidad, germinacion: germinacion)
    }

    /// Semanas a mostrar: hasta que la tanda nueva termine (mínimo 20).
    private var semanas: Int {
        let fin = Calendario.dias(desde: almacen.hoy, hasta: Planificador.cosechaEstimada(tipo: tipo, germinacion: germinacion))
        return max(Planificador.semanas, fin / 7 + 4)
    }

    private var proyeccion: [SemanaCupo] {
        Planificador.proyeccion(plantas: almacen.datos.plantas, nuevas: nuevas, desde: almacen.hoy, semanas: semanas)
    }

    var body: some View {
        let proy = proyeccion
        let excedida = Planificador.primeraExcedida(proy)
        let libres = Planificador.lugarLibre(plantas: almacen.datos.plantas, tipo: tipo,
                                             germinacion: germinacion, hoy: almacen.hoy)
        Form {
            Section {
                Picker("Tipo", selection: $tipo) {
                    ForEach(TipoPlanta.allCases, id: \.self) { Text($0.nombre).tag($0) }
                }
                .pickerStyle(.segmented)
                Stepper("Cantidad: \(cantidad)", value: $cantidad, in: 1...Cupo.plantasFlorecidas)
                DatePicker("Germinar el", selection: $germinacion, in: almacen.hoy..., displayedComponents: .date)
                    .environment(\.timeZone, Calendario.zona)
            } header: {
                Text("Tanda nueva")
            } footer: {
                Text(Temporada.consejo(para: germinacion).texto)
            }

            Section("Fechas estimadas") {
                ForEach(Planificador.fechasClave(tipo: tipo, germinacion: germinacion).dropFirst(), id: \.etapa) { f in
                    LabeledContent(f.etapa.nombre, value: Formato.fechaCorta(f.fecha))
                        .foregroundStyle(Tema.color(f.etapa))
                }
                if tipo == .foto {
                    Text("Las fotoperiódicas siguen el calendario: florecen con los días cortos (fines de enero).")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }

            Section {
                Chart {
                    ForEach(proy) { s in
                        BarMark(x: .value("Semana", s.inicio, unit: .weekOfYear),
                                y: .value("Plantas", s.actuales))
                            .foregroundStyle(by: .value("Origen", "Las que tenés"))
                        BarMark(x: .value("Semana", s.inicio, unit: .weekOfYear),
                                y: .value("Plantas", s.nuevas))
                            .foregroundStyle(by: .value("Origen", "Tanda nueva"))
                    }
                    RuleMark(y: .value("Cupo", Cupo.plantasFlorecidas))
                        .foregroundStyle(Tema.alerta)
                        .lineStyle(StrokeStyle(lineWidth: 2, dash: [5, 4]))
                        .annotation(position: .top, alignment: .leading) {
                            Text("Cupo: \(Cupo.plantasFlorecidas)").font(.caption2).foregroundStyle(Tema.alerta)
                        }
                }
                .chartForegroundStyleScale(["Las que tenés": Tema.verde, "Tanda nueva": Tema.ambar])
                .chartYScale(domain: 0...max(Cupo.plantasFlorecidas + 2, (proy.map(\.total).max() ?? 0) + 1))
                .chartXAxis {
                    AxisMarks(values: .stride(by: .month)) { _ in
                        AxisGridLine()
                        AxisValueLabel(format: .dateTime.month(.abbreviated))
                    }
                }
                .frame(height: 220)
                .padding(.vertical, 8)

                if let e = excedida {
                    Label("La semana del \(Formato.fechaCorta(e.inicio)) tendrías \(e.total) en flor: te pasás del cupo.",
                          systemImage: "exclamationmark.octagon.fill")
                        .foregroundStyle(Tema.alerta)
                        .font(.subheadline.weight(.semibold))
                } else {
                    Label("Entrás en el cupo: nunca más de \(Cupo.plantasFlorecidas) en flor.", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(Tema.verde)
                        .font(.subheadline.weight(.semibold))
                }
                Text(libres == 0
                     ? "Con lo que ya tenés, ese día no te queda lugar para germinar más."
                     : "Ese día podrías germinar hasta \(libres) \(tipo == .auto ? "automática" : "fotoperiódica")\(libres == 1 ? "" : "s") sin pasarte.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            } header: {
                Text("Plantas en flor por semana")
            } footer: {
                Text("Cuenta floración, maduración y lista para cosecha (machos incluidos). Supone que cosechás cuando termina \"lista para cosecha\".")
            }
        }
        .navigationTitle("Planificar")
        .navigationBarTitleDisplayMode(.inline)
    }
}
