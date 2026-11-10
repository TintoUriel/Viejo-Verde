import Foundation

// Lo que viaja a la planilla de Google (ver apps-script/Code.gs). Los nombres de las propiedades
// son las claves del JSON que lee el Apps Script: si cambiás uno, cambialo también allá.

/// Valor de la columna "Tipo" de la hoja Registro.
public enum TipoEvento: String, Codable, CaseIterable, Sendable {
    case germinacion = "germinación"
    case cambioEtapa = "cambio de etapa"
    case cambioUbicacion = "cambio de ubicación"
    case riego
    case lluvia
    case fertilizante
    case neem
    case revision = "revisión"
    case nota
    case problema
    case foto
    case sexado
    case polinizacion = "polinización"
    case polenJuntado = "polen juntado"
    case polenUsado = "polen usado"
    case cosecha
    case aFrascos = "a frascos (fin de secado)"
    case aperturaFrascos = "apertura de frascos"
    case finCurado = "fin de curado"
    case descarte
    case tareaSalteada = "tarea salteada"
    case altaSemillas = "alta de semillas"
    case bajaSemillas = "baja de semillas"
    case correccion = "corrección"
    case borrado
}

/// Una fila de la hoja "Registro".
public struct EventoSync: Codable, Hashable, Sendable {
    /// Único y estable: si se manda dos veces, la planilla lo ignora la segunda.
    public var id: String
    public var fecha: Date
    public var tipo: TipoEvento
    public var plantaID: String?
    public var planta: String?
    public var variedad: String?
    public var autoFoto: String?
    /// Etapa que tenía la planta en el momento del evento.
    public var etapa: String?
    /// Día de cultivo (desde la germinación) en el momento del evento.
    public var dia: Int?
    public var cantidad: Double?
    public var unidad: String?
    public var producto: String?
    /// Dosis en ml por litro (fertilizante).
    public var dosis: Double?
    public var nota: String?
    /// Versión de la app que generó el evento.
    public var app: String

    public init(id: String, fecha: Date, tipo: TipoEvento, plantaID: String? = nil, planta: String? = nil,
                variedad: String? = nil, autoFoto: String? = nil, etapa: String? = nil, dia: Int? = nil,
                cantidad: Double? = nil, unidad: String? = nil, producto: String? = nil, dosis: Double? = nil,
                nota: String? = nil, app: String) {
        self.id = id
        self.fecha = fecha
        self.tipo = tipo
        self.plantaID = plantaID
        self.planta = planta
        self.variedad = variedad
        self.autoFoto = autoFoto
        self.etapa = etapa
        self.dia = dia
        self.cantidad = cantidad
        self.unidad = unidad
        self.producto = producto
        self.dosis = dosis
        self.nota = nota
        self.app = app
    }
}

/// Una fila de la hoja "Plantas" (estado actual).
public struct PlantaSync: Codable, Hashable, Sendable {
    public var id: String
    public var nombre: String
    public var variedad: String
    public var autoFoto: String
    public var semilla: String
    public var sexo: String
    public var ubicacion: String
    public var litros: Double
    /// "2026-10-18" (día de Buenos Aires).
    public var germinacion: String
    public var etapa: String
    public var dia: Int
    public var ultimoRiego: Date?
    public var ultimoFertilizante: Date?
    public var ultimoNeem: Date?
    /// activa, secando, curando, terminada, descartada o borrada.
    public var estado: String
    public var gramosHumedos: Double?
    public var gramosSecos: Double?
    public var notas: String
    public var actualizado: Date

    public init(id: String, nombre: String, variedad: String, autoFoto: String, semilla: String, sexo: String,
                ubicacion: String, litros: Double, germinacion: String, etapa: String, dia: Int,
                ultimoRiego: Date?, ultimoFertilizante: Date?, ultimoNeem: Date?, estado: String,
                gramosHumedos: Double?, gramosSecos: Double?, notas: String, actualizado: Date) {
        self.id = id
        self.nombre = nombre
        self.variedad = variedad
        self.autoFoto = autoFoto
        self.semilla = semilla
        self.sexo = sexo
        self.ubicacion = ubicacion
        self.litros = litros
        self.germinacion = germinacion
        self.etapa = etapa
        self.dia = dia
        self.ultimoRiego = ultimoRiego
        self.ultimoFertilizante = ultimoFertilizante
        self.ultimoNeem = ultimoNeem
        self.estado = estado
        self.gramosHumedos = gramosHumedos
        self.gramosSecos = gramosSecos
        self.notas = notas
        self.actualizado = actualizado
    }
}

/// Lo que se manda en un POST.
public struct LoteSync: Equatable, Sendable {
    public var eventos: [EventoSync]
    public var plantas: [PlantaSync]

    public init(eventos: [EventoSync], plantas: [PlantaSync]) {
        self.eventos = eventos
        self.plantas = plantas
    }

    public var vacio: Bool { eventos.isEmpty && plantas.isEmpty }
}

/// Cuerpo JSON del POST.
public enum CuerpoSync {
    struct Cuerpo: Encodable {
        let token: String
        let accion: String?
        let eventos: [EventoSync]
        let plantas: [PlantaSync]
    }

    public static func codificador() -> JSONEncoder {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        e.outputFormatting = [.sortedKeys]
        return e
    }

    public static func json(_ lote: LoteSync, token: String) throws -> Data {
        try codificador().encode(Cuerpo(token: token, accion: nil, eventos: lote.eventos, plantas: lote.plantas))
    }

    /// "Probar conexión": el script solo valida el token y no escribe nada.
    public static func prueba(token: String) throws -> Data {
        try codificador().encode(Cuerpo(token: token, accion: "probar", eventos: [], plantas: []))
    }
}

/// Respuesta del Apps Script.
public struct RespuestaSync: Decodable, Equatable, Sendable {
    public var ok: Bool
    public var error: String?
    public var agregados: Int?
    public var repetidos: Int?
    public var invalidos: Int?
    public var plantas: Int?
}

public enum ErrorSync: Error, Equatable, Sendable {
    case red(String)
    case http(Int)
    case noEsJSON
    case servidor(String)

    public var mensaje: String {
        switch self {
        case .red(let m): "Sin conexión: \(m)"
        case .http(let s): "La planilla respondió con error \(s)."
        case .noEsJSON: "La URL no devolvió JSON. Revisá que sea la del Web App (termina en /exec) y que el acceso sea \"Cualquier persona\"."
        case .servidor(let m): "La planilla dijo: \(m)"
        }
    }
}

public enum LectorSync {
    /// Éxito solo si el cuerpo final (después del redirect) trae {"ok": true}.
    public static func leer(_ data: Data, status: Int) -> Result<RespuestaSync, ErrorSync> {
        guard (200..<300).contains(status) else { return .failure(.http(status)) }
        guard let r = try? JSONDecoder().decode(RespuestaSync.self, from: data) else { return .failure(.noEsJSON) }
        guard r.ok else { return .failure(.servidor(r.error ?? "error desconocido")) }
        return .success(r)
    }
}
