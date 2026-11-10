import Foundation
import ViejoVerdeCore

/// POST al Web App de Apps Script. El armado del cuerpo y la lectura de la respuesta están en
/// ViejoVerdeCore (CuerpoSync / LectorSync), con tests.
///
/// Apps Script responde al POST con un redirect 302 a script.googleusercontent.com; URLSession lo
/// sigue solo (como GET) y lo que se lee es el cuerpo final, que tiene que traer {"ok": true}.
enum ClienteSync {
    private static let sesion: URLSession = {
        let c = URLSessionConfiguration.ephemeral
        c.timeoutIntervalForRequest = 30
        c.timeoutIntervalForResource = 60
        c.requestCachePolicy = .reloadIgnoringLocalCacheData
        // Sin señal en el patio: que falle rápido y quede en la cola, en vez de quedarse esperando.
        c.waitsForConnectivity = false
        return URLSession(configuration: c)
    }()

    static func enviar(_ cuerpo: Data, a url: URL) async -> Result<RespuestaSync, ErrorSync> {
        var pedido = URLRequest(url: url)
        pedido.httpMethod = "POST"
        pedido.setValue("application/json", forHTTPHeaderField: "Content-Type")
        pedido.httpBody = cuerpo
        do {
            let (data, respuesta) = try await sesion.data(for: pedido)
            let status = (respuesta as? HTTPURLResponse)?.statusCode ?? 0
            return LectorSync.leer(data, status: status)
        } catch {
            return .failure(.red(error.localizedDescription))
        }
    }
}
