import UIKit

/// Las fotos se guardan como JPEG en Documents/Fotos; en los datos solo va el nombre del archivo.
enum Fotos {
    static var carpeta: URL {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let url = docs.appendingPathComponent("Fotos", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    static func url(_ nombre: String) -> URL { carpeta.appendingPathComponent(nombre) }

    /// Guarda la foto (achicada a 2048 px) y devuelve el nombre del archivo.
    static func guardar(_ imagen: UIImage) -> String? {
        let nombre = UUID().uuidString + ".jpg"
        guard let data = achicar(imagen, lado: 2048).jpegData(compressionQuality: 0.8) else { return nil }
        do {
            try data.write(to: url(nombre), options: [.atomic])
            return nombre
        } catch {
            return nil
        }
    }

    static func cargar(_ nombre: String) -> UIImage? {
        UIImage(contentsOfFile: url(nombre).path)
    }

    static func datos(_ nombre: String) -> Data? {
        try? Data(contentsOf: url(nombre))
    }

    static func escribir(_ data: Data, nombre: String) {
        try? data.write(to: url(nombre), options: [.atomic])
    }

    static func borrar(_ nombre: String) {
        try? FileManager.default.removeItem(at: url(nombre))
    }

    static func borrarTodas() {
        try? FileManager.default.removeItem(at: carpeta)
    }

    /// JPEG para mandarle a Claude: lado mayor de 1568 px (lo que la API aprovecha).
    static func jpegParaClaude(_ imagen: UIImage) -> Data? {
        achicar(imagen, lado: 1568).jpegData(compressionQuality: 0.75)
    }

    static func achicar(_ imagen: UIImage, lado: CGFloat) -> UIImage {
        let tam = imagen.size
        let mayor = max(tam.width, tam.height)
        guard mayor > lado, mayor > 0 else { return imagen }
        let factor = lado / mayor
        let nuevo = CGSize(width: (tam.width * factor).rounded(), height: (tam.height * factor).rounded())
        let formato = UIGraphicsImageRendererFormat.default()
        formato.scale = 1
        return UIGraphicsImageRenderer(size: nuevo, format: formato).image { _ in
            imagen.draw(in: CGRect(origin: .zero, size: nuevo))
        }
    }
}
