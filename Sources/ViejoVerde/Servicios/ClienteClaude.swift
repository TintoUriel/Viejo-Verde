import Foundation
import ViejoVerdeCore

/// Llama a la Messages API de Anthropic. El armado del pedido y la lectura de la respuesta están en
/// ViejoVerdeCore (PedidoClaude / LectorRespuesta), con tests.
enum ClienteClaude {
    static func enviar(historial: [MensajeChat], contexto: String, apiKey: String) async -> Result<RespuestaClaude, ErrorClaude> {
        var pedido = URLRequest(url: PedidoClaude.url)
        pedido.httpMethod = "POST"
        pedido.timeoutInterval = 180
        for (clave, valor) in PedidoClaude.encabezados(apiKey: apiKey) {
            pedido.setValue(valor, forHTTPHeaderField: clave)
        }
        do {
            pedido.httpBody = try PedidoClaude.cuerpo(historial: historial,
                                                      instrucciones: ContextoAsistente.instrucciones,
                                                      contexto: contexto)
        } catch {
            return .failure(.red("no pude armar el pedido"))
        }

        // Reintenta un par de veces si la API está saturada o hubo un error temporal.
        var intento = 0
        while true {
            intento += 1
            do {
                let (data, respuesta) = try await URLSession.shared.data(for: pedido)
                let status = (respuesta as? HTTPURLResponse)?.statusCode ?? 0
                let resultado = LectorRespuesta.leer(data, status: status)
                let reintentable = [429, 500, 502, 503, 504, 529].contains(status)
                if case .failure = resultado, reintentable, intento < 3 {
                    try? await Task.sleep(nanoseconds: UInt64(intento) * 2_000_000_000)
                    continue
                }
                return resultado
            } catch {
                if intento < 2 {
                    try? await Task.sleep(nanoseconds: 1_500_000_000)
                    continue
                }
                return .failure(.red(error.localizedDescription))
            }
        }
    }
}
