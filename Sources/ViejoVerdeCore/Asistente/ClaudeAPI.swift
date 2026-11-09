import Foundation

// MARK: - JSON genérico (para reenviar tal cual los bloques que devuelve Claude)

public enum JSONValor: Codable, Equatable, Sendable {
    case nulo
    case booleano(Bool)
    case numero(Double)
    case texto(String)
    case lista([JSONValor])
    case objeto([String: JSONValor])

    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() {
            self = .nulo
        } else if let b = try? c.decode(Bool.self) {
            self = .booleano(b)
        } else if let n = try? c.decode(Double.self) {
            self = .numero(n)
        } else if let s = try? c.decode(String.self) {
            self = .texto(s)
        } else if let a = try? c.decode([JSONValor].self) {
            self = .lista(a)
        } else {
            self = .objeto(try c.decode([String: JSONValor].self))
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .nulo: try c.encodeNil()
        case .booleano(let b): try c.encode(b)
        case .numero(let n):
            if n == n.rounded(), abs(n) < 1e15 { try c.encode(Int(n)) } else { try c.encode(n) }
        case .texto(let s): try c.encode(s)
        case .lista(let a): try c.encode(a)
        case .objeto(let o): try c.encode(o)
        }
    }

    public subscript(clave: String) -> JSONValor? {
        if case .objeto(let o) = self { return o[clave] }
        return nil
    }

    public var cadena: String? {
        if case .texto(let s) = self { return s }
        return nil
    }

    public var elementos: [JSONValor]? {
        if case .lista(let a) = self { return a }
        return nil
    }
}

// MARK: - Mensajes del chat

public enum RolChat: String, Codable, Sendable {
    case usuario, asistente
}

public struct MensajeChat: Codable, Identifiable, Equatable, Sendable {
    public var id: UUID
    public var rol: RolChat
    public var texto: String
    /// Foto adjunta (JPEG ya achicado).
    public var imagenJPEG: Data?
    /// Bloques tal como los devolvió la API (incluye los de razonamiento), para reenviarlos sin tocar.
    public var bloques: [JSONValor]?
    public var fecha: Date
    /// Mensaje de error local: se muestra pero no se manda a la API.
    public var esError: Bool

    public init(id: UUID = UUID(), rol: RolChat, texto: String, imagenJPEG: Data? = nil,
                bloques: [JSONValor]? = nil, fecha: Date = Date(), esError: Bool = false) {
        self.id = id
        self.rol = rol
        self.texto = texto
        self.imagenJPEG = imagenJPEG
        self.bloques = bloques
        self.fecha = fecha
        self.esError = esError
    }
}

// MARK: - Pedido

public enum PedidoClaude {
    public static let url = URL(string: "https://api.anthropic.com/v1/messages")!
    public static let modelo = "claude-sonnet-5-5"
    public static let versionAPI = "2026-10-21"
    /// Si un clasificador rechaza el pedido, la API lo reintenta sola con el modelo recomendado.
    public static let betaFallback = "server-side-fallback-2026-07-01"
    public static let maxTokens = 16000
    /// Cuántos mensajes del historial se mandan.
    public static let maxMensajes = 20
    /// Solo se reenvían las fotos de los últimos mensajes (las viejas se reemplazan por una nota).
    public static let maxFotos = 2

    public static func encabezados(apiKey: String) -> [String: String] {
        [
            "x-api-key": apiKey,
            "anthropic-version": versionAPI,
            "anthropic-beta": betaFallback,
            "content-type": "application/json",
        ]
    }

    /// Cuerpo JSON del pedido. `contexto` (fecha, plantas…) va como segundo bloque del system.
    public static func cuerpo(historial: [MensajeChat], instrucciones: String, contexto: String) throws -> Data {
        let msgs = mensajes(historial)
        let ultimoConFoto = historial.last(where: { !$0.esError && $0.rol == .usuario })?.imagenJPEG != nil
        let cuerpo: JSONValor = .objeto([
            "model": .texto(modelo),
            "max_tokens": .numero(Double(maxTokens)),
            "system": .lista([
                .objeto(["type": .texto("text"), "text": .texto(instrucciones)]),
                .objeto(["type": .texto("text"), "text": .texto(contexto)]),
            ]),
            "messages": .lista(msgs),
            "fallbacks": .texto("default"),
            // Chat: esfuerzo bajo. Con foto (diagnóstico) conviene que piense un poco más.
            "output_config": .objeto(["effort": .texto(ultimoConFoto ? "medium" : "low")]),
        ])
        let e = JSONEncoder()
        e.outputFormatting = [.sortedKeys]
        return try e.encode(cuerpo)
    }

    /// Arma los turnos: empieza con el usuario, alterna roles y limita fotos e historial.
    public static func mensajes(_ historial: [MensajeChat]) -> [JSONValor] {
        var lista = Array(historial.filter { !$0.esError }.suffix(maxMensajes))
        while let primero = lista.first, primero.rol != .usuario { lista.removeFirst() }

        let conFoto = lista.indices.filter { lista[$0].rol == .usuario && lista[$0].imagenJPEG != nil }
        let fotosQueVan = Set(conFoto.suffix(maxFotos))

        var turnos: [(RolChat, [JSONValor])] = []
        for (i, m) in lista.enumerated() {
            var bloques: [JSONValor] = []
            switch m.rol {
            case .usuario:
                if let foto = m.imagenJPEG {
                    if fotosQueVan.contains(i) {
                        bloques.append(.objeto([
                            "type": .texto("image"),
                            "source": .objeto([
                                "type": .texto("base64"),
                                "media_type": .texto("image/jpeg"),
                                "data": .texto(foto.base64EncodedString()),
                            ]),
                        ]))
                    } else {
                        bloques.append(textoBloque("[Acá había mandado una foto]"))
                    }
                }
                let t = m.texto.trimmingCharacters(in: .whitespacesAndNewlines)
                bloques.append(textoBloque(t.isEmpty ? "Mirá esta foto de mi planta." : t))
            case .asistente:
                bloques = m.bloques ?? [textoBloque(m.texto)]
            }
            if let ultimo = turnos.last, ultimo.0 == m.rol {
                turnos[turnos.count - 1].1 += bloques
            } else {
                turnos.append((m.rol, bloques))
            }
        }
        return turnos.map { rol, bloques in
            .objeto(["role": .texto(rol == .usuario ? "user" : "assistant"), "content": .lista(bloques)])
        }
    }

    static func textoBloque(_ s: String) -> JSONValor {
        .objeto(["type": .texto("text"), "text": .texto(s)])
    }
}

// MARK: - Respuesta

public struct RespuestaClaude: Equatable, Sendable {
    public let texto: String
    public let bloques: [JSONValor]
    public let stopReason: String?
}

public enum ErrorClaude: Error, Equatable, Sendable {
    case sinClave
    case http(status: Int, tipo: String, mensaje: String)
    case rechazo
    case vacia
    case red(String)

    public var mensaje: String {
        switch self {
        case .sinClave:
            return "Falta tu API key de Anthropic. Cargala en Ajustes."
        case .http(let status, let tipo, let mensaje):
            switch (status, tipo) {
            case (401, _), (_, "authentication_error"):
                return "La API key no es válida. Revisala en Ajustes."
            case (402, _), (_, "billing_error"):
                return "Hay un problema de facturación en tu cuenta de Anthropic."
            case (429, _), (_, "rate_limit_error"):
                return "Demasiados pedidos seguidos. Probá en un minuto."
            case (529, _), (_, "overloaded_error"):
                return "Claude está saturado. Probá en un rato."
            case (413, _):
                return "El mensaje es muy grande (¿la foto?). Probá con otra."
            default:
                return "Error \(status): \(mensaje)"
            }
        case .rechazo:
            return "Claude no quiso responder eso. Probá preguntarlo de otra forma."
        case .vacia:
            return "Claude no devolvió texto. Probá de nuevo."
        case .red(let detalle):
            return "No hay conexión con Claude (\(detalle))."
        }
    }
}

public enum LectorRespuesta {
    public static func leer(_ data: Data, status: Int) -> Result<RespuestaClaude, ErrorClaude> {
        let json = try? JSONDecoder().decode(JSONValor.self, from: data)
        guard status == 200 else {
            let tipo = json?["error"]?["type"]?.cadena ?? "desconocido"
            let mensaje = json?["error"]?["message"]?.cadena ?? String(decoding: data.prefix(200), as: UTF8.self)
            return .failure(.http(status: status, tipo: tipo, mensaje: mensaje))
        }
        let stop = json?["stop_reason"]?.cadena
        if stop == "refusal" { return .failure(.rechazo) }
        let bloques = json?["content"]?.elementos ?? []
        var texto = bloques
            .filter { $0["type"]?.cadena == "text" }
            .compactMap { $0["text"]?.cadena }
            .joined(separator: "\n\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !texto.isEmpty else { return .failure(.vacia) }
        if stop == "max_tokens" { texto += "\n\n(La respuesta quedó cortada.)" }
        return .success(RespuestaClaude(texto: texto, bloques: bloques, stopReason: stop))
    }
}
