import SwiftUI
import ViejoVerdeCore

/// Alta o edición de una planta.
struct FormPlanta: View {
    @Environment(Almacen.self) private var almacen
    @Environment(\.dismiss) private var dismiss

    /// Planta a editar (nil = nueva).
    let original: Planta?

    @State private var nombre: String
    @State private var variedad: String
    @State private var tipo: TipoPlanta
    @State private var semilla: TipoSemilla
    @State private var sexo: Sexo
    @State private var ubicacion: Ubicacion
    @State private var germinacion: Date
    @State private var litros: Double
    @State private var paqueteID: UUID?

    init(editando planta: Planta? = nil, desdePaquete paquete: PaqueteSemillas? = nil) {
        original = planta
        _nombre = State(initialValue: planta?.nombre ?? "")
        _variedad = State(initialValue: planta?.variedad ?? paquete?.nombre ?? "")
        _tipo = State(initialValue: planta?.tipo ?? paquete?.tipo ?? .auto)
        _semilla = State(initialValue: planta?.semilla ?? paquete?.semilla ?? .feminizada)
        _sexo = State(initialValue: planta?.sexo ?? .desconocido)
        _ubicacion = State(initialValue: planta?.ubicacion ?? .patio)
        _germinacion = State(initialValue: planta?.fechaGerminacion ?? Date())
        _litros = State(initialValue: planta?.litrosMaceta ?? 20)
        _paqueteID = State(initialValue: paquete?.id)
    }

    private var esNueva: Bool { original == nil }
    private var packsDisponibles: [PaqueteSemillas] {
        almacen.datos.paquetes.filter { $0.cantidad > 0 || $0.id == paqueteID }
    }
    private var nombreFinal: String {
        let n = nombre.trimmingCharacters(in: .whitespaces)
        if !n.isEmpty { return n }
        let base = variedad.trimmingCharacters(in: .whitespaces).isEmpty ? "Planta" : variedad
        let cuantas = almacen.datos.plantas.filter { $0.variedad == variedad }.count
        return "\(base) \(cuantas + 1)"
    }

    var body: some View {
        NavigationStack {
            Form {
                if esNueva && !packsDisponibles.isEmpty {
                    Section {
                        Picker("Sale del pack", selection: $paqueteID) {
                            Text("Ninguno").tag(UUID?.none)
                            ForEach(packsDisponibles) { p in
                                Text("\(p.nombre) (\(p.cantidad))").tag(UUID?.some(p.id))
                            }
                        }
                    } footer: {
                        Text("Se descuenta una semilla del pack.")
                    }
                }

                Section("Planta") {
                    TextField("Nombre (ej. \(nombreFinal))", text: $nombre)
                    TextField("Variedad (ej. Banana Blaze)", text: $variedad)
                }

                Section("Tipo") {
                    Picker("Tipo", selection: $tipo) {
                        ForEach(TipoPlanta.allCases, id: \.self) { Text($0.nombre).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    Picker("Semilla", selection: $semilla) {
                        ForEach(TipoSemilla.allCases, id: \.self) { Text($0.nombre).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    if semilla == .regular {
                        Picker("Sexo", selection: $sexo) {
                            ForEach(Sexo.allCases, id: \.self) { Text($0.nombre).tag($0) }
                        }
                    }
                }

                Section {
                    Picker("Dónde está", selection: $ubicacion) {
                        ForEach(Ubicacion.allCases, id: \.self) { Text($0.nombre).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    DatePicker("Germinó", selection: $germinacion, in: ...Date(), displayedComponents: .date)
                        .environment(\.timeZone, Calendario.zona)
                    Stepper("Maceta: \(Formato.numero(litros)) L", value: $litros, in: 1...200, step: litros < 10 ? 1 : 5)
                } footer: {
                    if tipo == .foto {
                        Text("Las fotoperiódicas siguen el calendario del patio (hemisferio sur).")
                    }
                }
            }
            .navigationTitle(esNueva ? "Nueva planta" : "Editar planta")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") { guardar() }
                }
            }
            .onChange(of: paqueteID) { _, nuevo in
                guard let nuevo, let p = almacen.datos.paquetes.first(where: { $0.id == nuevo }) else { return }
                variedad = p.nombre
                tipo = p.tipo
                semilla = p.semilla
            }
        }
    }

    private func guardar() {
        let sexoFinal: Sexo = semilla == .feminizada ? .hembra : sexo
        if var p = original {
            p.nombre = nombreFinal
            p.variedad = variedad.trimmingCharacters(in: .whitespaces)
            p.tipo = tipo
            p.semilla = semilla
            p.sexo = sexoFinal
            p.ubicacion = ubicacion
            p.fechaGerminacion = germinacion
            p.litrosMaceta = litros
            // Si se corrigió la germinación, se corrige también su registro.
            if let i = p.registros.firstIndex(where: { $0.tipo == .germinacion }) {
                p.registros[i].fecha = germinacion
            }
            almacen.cambiar { $0.actualizar(p) }
        } else {
            let p = Planta(nombre: nombreFinal, variedad: variedad.trimmingCharacters(in: .whitespaces),
                           tipo: tipo, semilla: semilla, sexo: sexoFinal, ubicacion: ubicacion,
                           fechaGerminacion: germinacion, litrosMaceta: litros)
            almacen.cambiar { $0.agregarPlanta(p, desdePaquete: paqueteID) }
        }
        dismiss()
    }
}
