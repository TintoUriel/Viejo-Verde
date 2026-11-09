import PhotosUI
import SwiftUI
import UIKit

/// Cámara del iPhone (si no hay cámara, abre la galería).
struct SelectorCamara: UIViewControllerRepresentable {
    var alElegir: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = UIImagePickerController.isSourceTypeAvailable(.camera) ? .camera : .photoLibrary
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinador { Coordinador(self) }

    final class Coordinador: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let padre: SelectorCamara
        init(_ padre: SelectorCamara) { self.padre = padre }

        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let imagen = info[.originalImage] as? UIImage { padre.alElegir(imagen) }
            padre.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            padre.dismiss()
        }
    }
}

/// Pregunta "Cámara o galería" y devuelve la imagen elegida.
private struct ModificadorSelectorFoto: ViewModifier {
    @Binding var presentado: Bool
    let alElegir: (UIImage) -> Void

    @State private var camara = false
    @State private var galeria = false
    @State private var item: PhotosPickerItem?

    func body(content: Content) -> some View {
        content
            .confirmationDialog("Agregar foto", isPresented: $presentado, titleVisibility: .visible) {
                Button("Sacar foto") { camara = true }
                Button("Elegir de la galería") { galeria = true }
                Button("Cancelar", role: .cancel) {}
            }
            .fullScreenCover(isPresented: $camara) {
                SelectorCamara(alElegir: alElegir).ignoresSafeArea()
            }
            .photosPicker(isPresented: $galeria, selection: $item, matching: .images)
            .onChange(of: item) { _, nuevo in
                guard let nuevo else { return }
                Task {
                    if let data = try? await nuevo.loadTransferable(type: Data.self),
                       let imagen = UIImage(data: data) {
                        alElegir(imagen)
                    }
                    item = nil
                }
            }
    }
}

extension View {
    func selectorDeFoto(presentado: Binding<Bool>, alElegir: @escaping (UIImage) -> Void) -> some View {
        modifier(ModificadorSelectorFoto(presentado: presentado, alElegir: alElegir))
    }
}
