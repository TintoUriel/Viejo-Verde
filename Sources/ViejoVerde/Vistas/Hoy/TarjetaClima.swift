import SwiftUI
import ViejoVerdeCore

/// Clima de hoy en CABA, con los avisos para el patio y el botón "Llovió".
struct TarjetaClima: View {
    @Environment(Almacen.self) private var almacen
    @State private var confirmarLluvia = false
    @State private var cargando = false

    var body: some View {
        Group {
            if let p = almacen.climaVigente, let hoy = p.dia(almacen.hoy) {
                Tarjeta {
                    HStack(alignment: .center, spacing: 12) {
                        Image(systemName: icono(hoy))
                            .symbolRenderingMode(.multicolor)
                            .font(.system(size: 34))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(temperaturas(hoy))
                                .font(.title3.weight(.semibold).monospacedDigit())
                            Text(detalle(hoy))
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                    }
                    if let m = p.dia(1, de: almacen.hoy) {
                        Text("Mañana: \(temperaturas(m)) · \(Formato.numero(m.lluviaMM)) mm")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    ForEach(almacen.avisosClima) { aviso in
                        VStack(alignment: .leading, spacing: 2) {
                            Label(aviso.titulo, systemImage: iconoAviso(aviso.tipo))
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(colorAviso(aviso.tipo))
                            Text(aviso.texto)
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.top, 2)
                    }
                    BotonGrande(titulo: "Llovió", icono: "cloud.rain.fill", color: .blue, relleno: false) {
                        confirmarLluvia = true
                    }
                }
            } else {
                Tarjeta {
                    HStack {
                        Label("Sin pronóstico", systemImage: "cloud.slash")
                            .font(.subheadline.weight(.semibold))
                        Spacer()
                        if cargando {
                            ProgressView()
                        } else {
                            Button("Reintentar") {
                                cargando = true
                                Task {
                                    await almacen.actualizarClima(forzar: true)
                                    cargando = false
                                }
                            }
                        }
                    }
                    Text("Con internet, la app ajusta el riego si llueve o hace calor.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    BotonGrande(titulo: "Llovió", icono: "cloud.rain.fill", color: .blue, relleno: false) {
                        confirmarLluvia = true
                    }
                }
            }
        }
        .confirmationDialog("¿Llovió bien en el patio?", isPresented: $confirmarLluvia, titleVisibility: .visible) {
            Button("Sí, contalo como riego") { almacen.llovio() }
        } message: {
            Text("Se registra un riego (lluvia) en todas las plantas activas del patio.")
        }
    }

    private func temperaturas(_ d: DiaClima) -> String {
        switch (d.minC, d.maxC) {
        case let (min?, max?): return "\(Formato.numero(min.rounded()))° / \(Formato.numero(max.rounded()))°"
        case let (nil, max?): return "máx \(Formato.numero(max.rounded()))°"
        default: return "—"
        }
    }

    private func detalle(_ d: DiaClima) -> String {
        var partes = ["Lluvia \(Formato.numero(d.lluviaMM)) mm" + (d.probLluvia.map { " (\($0) %)" } ?? "")]
        if let h = d.humedad { partes.append("humedad \(Int(h.rounded())) %") }
        return partes.joined(separator: " · ")
    }

    private func icono(_ d: DiaClima) -> String {
        if d.lluviaMM >= 5 { return "cloud.heavyrain.fill" }
        if d.lluviaMM >= 0.5 { return "cloud.drizzle.fill" }
        if (d.maxC ?? 0) >= AnalisisClima.calorFuerte { return "sun.max.fill" }
        if (d.humedad ?? 0) >= 85 { return "cloud.fill" }
        return "cloud.sun.fill"
    }

    private func iconoAviso(_ t: TipoAvisoClima) -> String {
        switch t {
        case .lluvia: "cloud.rain.fill"
        case .llovio: "drop.triangle.fill"
        case .calor: "thermometer.sun.fill"
        case .frio: "thermometer.snowflake"
        case .hongos: "allergens"
        }
    }

    private func colorAviso(_ t: TipoAvisoClima) -> Color {
        switch t {
        case .lluvia, .llovio: .blue
        case .calor: .orange
        case .frio: .cyan
        case .hongos: Tema.alerta
        }
    }
}
