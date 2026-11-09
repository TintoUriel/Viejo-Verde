import SwiftUI
import UIKit
import ViejoVerdeCore

/// Nota o problema, con foto opcional.
struct NuevaNota: View {
    @Environment(Almacen.self) private var almacen
    @Environment(\.dismiss) private var dismiss
    let plantaID: UUID

    @State private var tipo: TipoRegistro = .nota
    @State private var texto = ""
    @State private var foto: UIImage?
    @State private var eligiendoFoto = false
    @FocusState private var enfocado: Bool

    var body: some View {
        NavigationStack {
            Form {
                Picker("Tipo", selection: $tipo) {
                    Text("Nota").tag(TipoRegistro.nota)
                    Text("Problema").tag(TipoRegistro.problema)
                }
                .pickerStyle(.segmented)

                Section {
                    TextField(tipo == .problema ? "¿Qué ves? (ej. hojas de abajo amarillas)" : "Escribí la nota",
                              text: $texto, axis: .vertical)
                        .lineLimit(3...8)
                        .focused($enfocado)
                }

                Section {
                    if let foto {
                        Image(uiImage: foto)
                            .resizable()
                            .scaledToFit()
                            .frame(maxHeight: 220)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                        Button("Quitar foto", role: .destructive) { self.foto = nil }
                    } else {
                        Button { eligiendoFoto = true } label: { Label("Agregar foto", systemImage: "camera.fill") }
                    }
                } footer: {
                    if tipo == .problema {
                        Text("Después podés preguntarle al asistente y mandarle la foto.")
                    }
                }
            }
            .navigationTitle(tipo == .problema ? "Problema" : "Nota")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") { guardar() }
                        .disabled(texto.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && foto == nil)
                }
            }
            .selectorDeFoto(presentado: $eligiendoFoto) { foto = $0 }
            .onAppear { enfocado = true }
        }
    }

    private func guardar() {
        let limpio = texto.trimmingCharacters(in: .whitespacesAndNewlines)
        let nombreFoto = foto.flatMap { Fotos.guardar($0) }
        let nota = limpio.isEmpty ? "Foto" : limpio
        let tipoFinal = tipo
        almacen.cambiar { d in
            d.registrar(tipoFinal, en: plantaID, fecha: Date(), nota: nota)
            if let nombreFoto { d.agregarFoto(nombreFoto, en: plantaID) }
        }
        dismiss()
    }
}
