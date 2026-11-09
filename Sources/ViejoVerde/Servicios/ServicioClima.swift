import Foundation
import ViejoVerdeCore

/// Baja el pronóstico de Open-Meteo y lo guarda en caché (Library/Caches/clima.json).
enum ServicioClima {
    /// Cada cuánto se vuelve a pedir.
    static let vigencia: TimeInterval = 60 * 60

    private static var archivo: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("clima.json")
    }

    static func cache() -> Pronostico? {
        guard let data = try? Data(contentsOf: archivo) else { return nil }
        return try? Backup.decodificador().decode(Pronostico.self, from: data)
    }

    static func descargar() async -> Pronostico? {
        var pedido = URLRequest(url: OpenMeteo.url)
        pedido.timeoutInterval = 20
        guard let (data, respuesta) = try? await URLSession.shared.data(for: pedido),
              (respuesta as? HTTPURLResponse)?.statusCode == 200,
              let p = try? OpenMeteo.leer(data, ahora: Date()) else { return nil }
        if let json = try? Backup.codificador().encode(p) {
            try? json.write(to: archivo, options: [.atomic])
        }
        return p
    }
}
