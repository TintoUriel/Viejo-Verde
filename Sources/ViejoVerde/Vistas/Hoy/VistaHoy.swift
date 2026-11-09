import SwiftUI
import ViejoVerdeCore

struct VistaHoy: View {
    @Environment(Almacen.self) private var almacen
    @State private var pedido: PedidoDato?
    @State private var hechas = 0

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    encabezado
                    resumen
                    tareas
                }
                .padding()
            }
            .background(Tema.fondo)
            .navigationTitle("Hoy")
            .navigationDestination(for: UUID.self) { id in DetallePlanta(plantaID: id) }
            .sheet(item: $pedido) { p in SheetNumero(pedido: p) }
            .sensoryFeedback(.success, trigger: hechas)
        }
    }

    // MARK: Encabezado: fecha y consejo de temporada

    private var encabezado: some View {
        let consejo = Temporada.consejo(para: almacen.hoy)
        return VStack(alignment: .leading, spacing: 10) {
            Text(Formato.fechaLarga(almacen.hoy).capitalizedPrimera)
                .font(.title3.weight(.semibold))
                .foregroundStyle(.secondary)
            Tarjeta(fondo: Tema.ambarSuave) {
                Label(consejo.titulo, systemImage: "calendar")
                    .font(.headline)
                    .foregroundStyle(Tema.ambar)
                Text(consejo.texto)
                    .font(.subheadline)
            }
        }
    }

    // MARK: Resumen y cupo REPROCANN

    private var resumen: some View {
        let c = almacen.cupo
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Dato(numero: "\(c.activas)", texto: "Activas", color: Tema.verde)
                Dato(numero: "\(c.enFlor)/\(c.limite)", texto: "En flor", color: c.excedido ? Tema.alerta : Tema.verde)
                Dato(numero: "\(c.secando)", texto: "Secando", color: Tema.ambar)
                Dato(numero: "\(c.curando)", texto: "Curando", color: Tema.ambar)
            }
            if c.excedido {
                Label("Te pasaste del cupo REPROCANN: \(c.enFlor) plantas en flor (máximo \(c.limite)).",
                      systemImage: "exclamationmark.octagon.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Tema.alerta)
            }
        }
    }

    // MARK: Tareas

    @ViewBuilder
    private var tareas: some View {
        let lista = almacen.tareas
        Text("Para hacer")
            .font(.title2.weight(.bold))
            .padding(.top, 4)
        if almacen.datos.plantas.isEmpty {
            Tarjeta {
                Label("Todavía no cargaste plantas", systemImage: "leaf")
                    .font(.headline)
                Text("Andá a la pestaña Plantas y tocá + para agregar la primera.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        } else if lista.isEmpty {
            Tarjeta {
                Label("Nada pendiente por hoy", systemImage: "checkmark.circle.fill")
                    .font(.headline)
                    .foregroundStyle(Tema.verde)
                Text("Igual date una vuelta por el patio y mirá las hojas.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        } else {
            ForEach(lista) { t in
                TarjetaTarea(tarea: t) { accion in
                    if let p = almacen.ejecutar(accion, en: t) {
                        pedido = p
                    } else if accion != .hoyNo {
                        hechas += 1
                    }
                }
            }
        }
    }
}

private struct Dato: View {
    let numero: String
    let texto: String
    let color: Color

    var body: some View {
        VStack(spacing: 2) {
            Text(numero)
                .font(.title2.weight(.bold).monospacedDigit())
                .foregroundStyle(color)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(texto)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Tema.tarjeta))
    }
}

struct TarjetaTarea: View {
    let tarea: Tarea
    let alTocar: (AccionTarea) -> Void

    private var principales: [AccionTarea] { tarea.acciones.filter { $0 != .hoyNo } }
    private var color: Color { tarea.urgente ? Tema.alerta : Tema.verde }

    var body: some View {
        Tarjeta(fondo: tarea.urgente ? Tema.alerta.opacity(0.12) : Tema.tarjeta) {
            NavigationLink(value: tarea.plantaID) {
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: tarea.tipo.icono)
                        .font(.title3)
                        .foregroundStyle(color)
                        .frame(width: 28)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(tarea.titulo)
                            .font(.headline)
                            .foregroundStyle(tarea.urgente ? Tema.alerta : Color.primary)
                            .multilineTextAlignment(.leading)
                        Text(tarea.detalle)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.leading)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                        .font(.footnote)
                        .foregroundStyle(.tertiary)
                }
            }
            .buttonStyle(.plain)

            if let d = tarea.dosis {
                HStack(spacing: 8) {
                    Pastilla(icono: "drop.fill", texto: Formato.volumen(ml: d.aguaML), color: .blue)
                    if let f = d.fertilizante {
                        Pastilla(icono: "flask.fill", texto: "\(Formato.numero(d.fertilizanteML)) ml \(f.nombre)", color: Tema.verde)
                    }
                }
            }

            HStack(spacing: 8) {
                ForEach(Array(principales.enumerated()), id: \.offset) { i, accion in
                    BotonGrande(titulo: accion.titulo, icono: accion.icono, color: color, relleno: i == 0) {
                        alTocar(accion)
                    }
                }
            }
            if tarea.acciones.contains(.hoyNo) {
                Button {
                    alTocar(.hoyNo)
                } label: {
                    Label("Hoy no", systemImage: AccionTarea.hoyNo.icono)
                        .font(.footnote.weight(.medium))
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 2)
                }
                .buttonStyle(.plain)
            }
        }
    }
}

struct Pastilla: View {
    let icono: String
    let texto: String
    let color: Color

    var body: some View {
        Label(texto, systemImage: icono)
            .font(.subheadline.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Capsule().fill(color.opacity(0.14)))
            .foregroundStyle(color)
    }
}

extension String {
    /// "domingo 8 de noviembre" → "Domingo 8 de noviembre".
    var capitalizedPrimera: String { prefix(1).uppercased() + dropFirst() }
}
