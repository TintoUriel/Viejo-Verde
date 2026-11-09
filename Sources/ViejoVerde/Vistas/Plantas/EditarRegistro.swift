import SwiftUI
import ViejoVerdeCore

/// Editar o borrar un registro del historial.
struct EditarRegistro: View {
    @Environment(Almacen.self) private var almacen
    @Environment(\.dismiss) private var dismiss
    let plantaID: UUID

    @State private var registro: Registro
    @State private var producto: String
    @State private var nota: String
    @State private var agua: String
    @State private var confirmarBorrado = false

    init(plantaID: UUID, registro: Registro) {
        self.plantaID = plantaID
        _registro = State(initialValue: registro)
        _producto = State(initialValue: registro.producto ?? "")
        _nota = State(initialValue: registro.nota ?? "")
        _agua = State(initialValue: registro.aguaML.map { String($0) } ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Tipo", selection: $registro.tipo) {
                        ForEach(TipoRegistro.allCases, id: \.self) { t in
                            Label(t.nombre, systemImage: t.icono).tag(t)
                        }
                    }
                    DatePicker("Fecha", selection: $registro.fecha, in: ...Date())
                        .environment(\.timeZone, Calendario.zona)
                }
                Section {
                    TextField("Producto (ej. Top Veg)", text: $producto)
                    TextField("Agua (ml)", text: $agua)
                        .keyboardType(.numberPad)
                    TextField("Nota", text: $nota, axis: .vertical)
                        .lineLimit(2...6)
                }
                Section {
                    Button("Borrar registro", role: .destructive) { confirmarBorrado = true }
                }
            }
            .navigationTitle("Registro")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") { guardar() }
                }
            }
            .confirmationDialog("¿Borrar este registro?", isPresented: $confirmarBorrado, titleVisibility: .visible) {
                Button("Borrar", role: .destructive) {
                    let id = registro.id
                    almacen.cambiar { $0.borrarRegistro(id, en: plantaID) }
                    dismiss()
                }
            }
        }
    }

    private func guardar() {
        var r = registro
        let p = producto.trimmingCharacters(in: .whitespaces)
        let n = nota.trimmingCharacters(in: .whitespacesAndNewlines)
        r.producto = p.isEmpty ? nil : p
        r.nota = n.isEmpty ? nil : n
        r.aguaML = Int(agua.trimmingCharacters(in: .whitespaces))
        almacen.cambiar { $0.editarRegistro(r, en: plantaID) }
        dismiss()
    }
}
