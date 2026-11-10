import Foundation

/// Cola local de lo que falta mandar a la planilla (outbox). Se guarda en disco (outbox.json) después
/// de cada cambio: un evento existe acá antes de intentar mandarlo, y solo sale cuando la planilla
/// confirmó que lo recibió.
public struct Bandeja: Codable, Equatable, Sendable {
    public private(set) var eventos: [EventoSync]
    /// Última foto pendiente de cada planta (una por planta: la nueva reemplaza a la vieja).
    public private(set) var plantas: [PlantaSync]
    /// IDs de cambios de etapa ya encolados alguna vez, para no generarlos de nuevo cada día.
    public var etapasEncoladas: Set<String>
    /// Día ("2026-11-10") del último refresco de todas las plantas (el Día de cultivo cambia solo).
    public var ultimoRefrescoPlantas: String?
    public private(set) var intentosFallidos: Int
    public private(set) var proximoIntento: Date?
    public private(set) var ultimoOK: Date?
    public private(set) var ultimoError: String?

    public static let maxPorLote = 100
    static let esperaInicial: TimeInterval = 30
    static let esperaMaxima: TimeInterval = 15 * 60

    public init() {
        eventos = []
        plantas = []
        etapasEncoladas = []
        ultimoRefrescoPlantas = nil
        intentosFallidos = 0
        proximoIntento = nil
        ultimoOK = nil
        ultimoError = nil
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        eventos = try c.decodeIfPresent([EventoSync].self, forKey: .eventos) ?? []
        plantas = try c.decodeIfPresent([PlantaSync].self, forKey: .plantas) ?? []
        etapasEncoladas = try c.decodeIfPresent(Set<String>.self, forKey: .etapasEncoladas) ?? []
        ultimoRefrescoPlantas = try c.decodeIfPresent(String.self, forKey: .ultimoRefrescoPlantas)
        intentosFallidos = try c.decodeIfPresent(Int.self, forKey: .intentosFallidos) ?? 0
        proximoIntento = try c.decodeIfPresent(Date.self, forKey: .proximoIntento)
        ultimoOK = try c.decodeIfPresent(Date.self, forKey: .ultimoOK)
        ultimoError = try c.decodeIfPresent(String.self, forKey: .ultimoError)
    }

    public var vacia: Bool { eventos.isEmpty && plantas.isEmpty }
    public var pendientes: Int { eventos.count }

    // MARK: Encolar

    /// Agrega los eventos que no estén ya en la cola (por ID). Devuelve cuántos agregó.
    @discardableResult
    public mutating func encolar(_ nuevos: [EventoSync]) -> Int {
        var ids = Set(eventos.map(\.id))
        var agregados = 0
        for e in nuevos where !ids.contains(e.id) {
            eventos.append(e)
            ids.insert(e.id)
            agregados += 1
        }
        return agregados
    }

    /// Guarda la foto más nueva de cada planta.
    public mutating func encolar(plantas nuevas: [PlantaSync]) {
        for p in nuevas {
            if let i = plantas.firstIndex(where: { $0.id == p.id }) {
                plantas[i] = p
            } else {
                plantas.append(p)
            }
        }
    }

    // MARK: Enviar

    /// Lo próximo a mandar: los eventos más viejos y todas las plantas pendientes.
    public func lote(max: Int = Bandeja.maxPorLote) -> LoteSync {
        LoteSync(eventos: Array(eventos.prefix(max)), plantas: plantas)
    }

    public func puedeEnviar(ahora: Date) -> Bool {
        proximoIntento.map { ahora >= $0 } ?? true
    }

    /// La planilla confirmó el lote: sale de la cola solo lo que se mandó. Lo que se encoló mientras
    /// tanto queda, y si una planta cambió durante el envío se queda su foto nueva.
    public mutating func confirmar(_ lote: LoteSync, ahora: Date) {
        let enviados = Set(lote.eventos.map(\.id))
        eventos.removeAll { enviados.contains($0.id) }
        plantas.removeAll { lote.plantas.contains($0) }
        intentosFallidos = 0
        proximoIntento = nil
        ultimoOK = ahora
        ultimoError = nil
    }

    /// No se pudo mandar: todo queda en la cola y el próximo intento se aleja (backoff exponencial).
    public mutating func fallo(_ mensaje: String, ahora: Date) {
        intentosFallidos += 1
        proximoIntento = ahora.addingTimeInterval(Self.espera(intentos: intentosFallidos))
        ultimoError = mensaje
    }

    /// 30 s, 1 min, 2 min, 4 min, 8 min y después cada 15 min.
    public static func espera(intentos: Int) -> TimeInterval {
        guard intentos > 0 else { return 0 }
        let exponente = Double(min(intentos - 1, 20))
        return min(esperaInicial * pow(2, exponente), esperaMaxima)
    }

    // MARK: Disco

    public func json() throws -> Data { try CuerpoSync.codificador().encode(self) }

    public static func leer(_ data: Data) throws -> Bandeja {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return try d.decode(Bandeja.self, from: data)
    }
}
