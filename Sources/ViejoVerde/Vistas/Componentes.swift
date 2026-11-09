import SwiftUI
import ViejoVerdeCore

// MARK: - Tarjeta

struct Tarjeta<Contenido: View>: View {
    var fondo: Color = Tema.tarjeta
    @ViewBuilder var contenido: Contenido

    var body: some View {
        VStack(alignment: .leading, spacing: 10) { contenido }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(fondo))
    }
}

// MARK: - Botón grande (cómodo con una mano)

struct BotonGrande: View {
    let titulo: String
    let icono: String
    var color: Color = Tema.verde
    var relleno = true
    let accion: () -> Void

    var body: some View {
        Button(action: accion) {
            Label(titulo, systemImage: icono)
                .font(.body.weight(.semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity, minHeight: 50)
                .padding(.horizontal, 8)
                .foregroundStyle(relleno ? Color.white : color)
                .background(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(relleno ? color : color.opacity(0.14))
                )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Etiqueta de etapa

struct EtiquetaEtapa: View {
    let etapa: Etapa

    var body: some View {
        Text(etapa.nombre)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Capsule().fill(Tema.color(etapa).opacity(0.2)))
            .foregroundStyle(Tema.color(etapa))
    }
}

// MARK: - Barra de etapas con el marcador de hoy

struct BarraEtapas: View {
    let estado: EstadoEtapa
    var compacta = false

    private var tramos: [Tramo] { estado.tramos.filter { $0.duracion > 0 } }
    private var inicio: Int { tramos.first?.desdeDia ?? 0 }
    private var total: Int { max((tramos.last?.hastaDia ?? 1) - inicio, 1) }
    private var vivo: Bool { Etapa.deCultivo.contains(estado.etapa) }

    /// Posición del marcador (0…1).
    private var posicion: CGFloat {
        guard vivo else { return 1 }
        let d = min(max(Double(estado.dia - inicio) + 0.5, 0), Double(total))
        return CGFloat(d / Double(total))
    }

    private var altoBarra: CGFloat { compacta ? 8 : 14 }
    private var altoMarcador: CGFloat { compacta ? 16 : 26 }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            GeometryReader { geo in
                let ancho = geo.size.width
                ZStack(alignment: .leading) {
                    HStack(spacing: 2) {
                        ForEach(tramos, id: \.etapa) { t in
                            RoundedRectangle(cornerRadius: 4, style: .continuous)
                                .fill(Tema.color(t.etapa).opacity(t.etapa == estado.etapa || !vivo ? 1 : 0.4))
                                .frame(width: max(CGFloat(t.duracion) / CGFloat(total) * ancho - 2, 2), height: altoBarra)
                        }
                    }
                    Capsule()
                        .fill(Color.primary)
                        .frame(width: 3, height: altoMarcador)
                        .offset(x: min(max(posicion * ancho - 1.5, 0), ancho - 3))
                }
                .frame(height: altoMarcador)
            }
            .frame(height: altoMarcador)

            if !compacta {
                GeometryReader { geo in
                    HStack(spacing: 2) {
                        ForEach(tramos, id: \.etapa) { t in
                            Text(t.etapa.corto)
                                .font(.caption2)
                                .fontWeight(t.etapa == estado.etapa ? .bold : .regular)
                                .foregroundStyle(t.etapa == estado.etapa ? Color.primary : Color.secondary)
                                .lineLimit(1)
                                .minimumScaleFactor(0.6)
                                .frame(width: max(CGFloat(t.duracion) / CGFloat(total) * geo.size.width - 2, 2))
                        }
                    }
                }
                .frame(height: 14)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Etapa: \(estado.etapa.nombre), día \(estado.dia)")
    }
}

// MARK: - Pedir un número (gramos, cantidad de semillas)

struct SheetNumero: View {
    let pedido: PedidoDato
    @Environment(Almacen.self) private var almacen
    @Environment(\.dismiss) private var dismiss
    @State private var texto = ""
    @FocusState private var enfocado: Bool

    private var valor: Double? {
        guard let v = Double(texto.replacingOccurrences(of: ",", with: ".")), v >= 0 else { return nil }
        return v
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(pedido.entero ? "Cantidad" : "Gramos", text: $texto)
                        .keyboardType(pedido.entero ? .numberPad : .decimalPad)
                        .font(.title2)
                        .focused($enfocado)
                } header: {
                    Text(pedido.pregunta)
                } footer: {
                    Text(pedido.ayuda)
                }
            }
            .navigationTitle("\(pedido.titulo): \(almacen.datos.planta(pedido.plantaID)?.nombre ?? "")")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") {
                        if let valor {
                            almacen.resolver(pedido, valor: valor)
                            dismiss()
                        }
                    }
                    .disabled(valor == nil)
                }
            }
            .onAppear { enfocado = true }
        }
        .presentationDetents([.medium])
    }
}

// MARK: - Foto a pantalla completa

struct VisorFoto: View {
    let nombre: String
    var alBorrar: (() -> Void)?
    @Environment(\.dismiss) private var dismiss
    @State private var confirmar = false

    var body: some View {
        NavigationStack {
            Group {
                if let imagen = Fotos.cargar(nombre) {
                    Image(uiImage: imagen)
                        .resizable()
                        .scaledToFit()
                } else {
                    ContentUnavailableView("No encuentro la foto", systemImage: "photo")
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.black)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cerrar") { dismiss() }
                }
                if alBorrar != nil {
                    ToolbarItem(placement: .destructiveAction) {
                        Button(role: .destructive) { confirmar = true } label: {
                            Image(systemName: "trash")
                        }
                    }
                }
            }
            .confirmationDialog("¿Borrar la foto?", isPresented: $confirmar, titleVisibility: .visible) {
                Button("Borrar", role: .destructive) {
                    alBorrar?()
                    dismiss()
                }
            }
        }
    }
}

/// Miniatura cuadrada de una foto guardada.
struct Miniatura: View {
    let nombre: String
    var lado: CGFloat = 84

    var body: some View {
        Group {
            if let imagen = Fotos.cargar(nombre) {
                Image(uiImage: imagen).resizable().scaledToFill()
            } else {
                Image(systemName: "photo").foregroundStyle(.secondary)
            }
        }
        .frame(width: lado, height: lado)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

/// Nombre de foto elegida, para abrirla con `.sheet(item:)`.
struct FotoElegida: Identifiable, Equatable {
    let nombre: String
    var id: String { nombre }
}
