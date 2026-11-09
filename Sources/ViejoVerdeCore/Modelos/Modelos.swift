import Foundation

// MARK: - Enumeraciones

public enum TipoPlanta: String, Codable, CaseIterable, Sendable {
    case auto, foto
    public var nombre: String { self == .auto ? "Automática" : "Fotoperiódica" }
}

public enum TipoSemilla: String, Codable, CaseIterable, Sendable {
    case feminizada, regular
    public var nombre: String { self == .feminizada ? "Feminizada" : "Regular" }
}

public enum Sexo: String, Codable, CaseIterable, Sendable {
    case desconocido, hembra, macho
    public var nombre: String {
        switch self {
        case .desconocido: "Sin saber"
        case .hembra: "Hembra"
        case .macho: "Macho"
        }
    }
}

public enum Ubicacion: String, Codable, CaseIterable, Sendable {
    case patio, interior
    public var nombre: String { self == .patio ? "Patio" : "Adentro" }
}

public enum EstadoPlanta: String, Codable, CaseIterable, Sendable {
    case activa, secando, curando, terminada, descartada
    public var nombre: String {
        switch self {
        case .activa: "Activa"
        case .secando: "Secando"
        case .curando: "Curando"
        case .terminada: "Terminada"
        case .descartada: "Descartada"
        }
    }
}

public enum TipoRegistro: String, Codable, CaseIterable, Sendable {
    case riego, fertilizante, neem, nota, problema, sexo, polinizacion, cosecha, secado, germinacion
    /// Apertura de frascos durante el curado.
    case curado
    /// Revisión (por ejemplo, de hongos después de días húmedos).
    case revision

    public var nombre: String {
        switch self {
        case .riego: "Riego"
        case .fertilizante: "Fertilizante"
        case .neem: "Neem"
        case .nota: "Nota"
        case .problema: "Problema"
        case .sexo: "Sexo"
        case .polinizacion: "Polinización"
        case .cosecha: "Cosecha"
        case .secado: "A frascos"
        case .germinacion: "Germinación"
        case .curado: "Abrí frascos"
        case .revision: "Revisión"
        }
    }
}

public enum Fertilizante: String, Codable, CaseIterable, Sendable {
    case topVeg, topBloom
    public var nombre: String { self == .topVeg ? "Top Veg" : "Top Bloom" }
}

// MARK: - Registro

public struct Registro: Codable, Identifiable, Hashable, Sendable {
    public var id: UUID
    public var fecha: Date
    public var tipo: TipoRegistro
    public var producto: String?
    public var nota: String?
    /// Agua usada en el riego (o en el riego con fertilizante), si se registró.
    public var aguaML: Int?

    public init(id: UUID = UUID(), fecha: Date, tipo: TipoRegistro,
                producto: String? = nil, nota: String? = nil, aguaML: Int? = nil) {
        self.id = id
        self.fecha = fecha
        self.tipo = tipo
        self.producto = producto
        self.nota = nota
        self.aguaML = aguaML
    }
}

// MARK: - Cosecha

public struct Cosecha: Codable, Hashable, Sendable {
    public var fecha: Date
    public var gramosHumedos: Double
    public var fechaFrascos: Date?
    public var gramosSecos: Double?

    public init(fecha: Date, gramosHumedos: Double, fechaFrascos: Date? = nil, gramosSecos: Double? = nil) {
        self.fecha = fecha
        self.gramosHumedos = gramosHumedos
        self.fechaFrascos = fechaFrascos
        self.gramosSecos = gramosSecos
    }
}

// MARK: - Planta

public struct Planta: Codable, Identifiable, Hashable, Sendable {
    public var id: UUID
    public var nombre: String
    public var variedad: String
    public var tipo: TipoPlanta
    public var semilla: TipoSemilla
    public var sexo: Sexo
    public var ubicacion: Ubicacion
    public var fechaGerminacion: Date
    public var estado: EstadoPlanta
    public var fechaPolinizacion: Date?
    public var polenJuntado: Bool
    public var cosecha: Cosecha?
    public var registros: [Registro]
    /// Nombres de archivo de las fotos (se guardan aparte, en Documents/Fotos).
    public var fotos: [String]
    /// Pack del que salió la semilla, si salió de uno.
    public var paqueteOrigenID: UUID?
    /// Litros de la maceta (para calcular el agua y el fertilizante).
    public var litrosMaceta: Double
    /// Cuándo se sacó cada foto (nombre de archivo → fecha).
    public var fechasFotos: [String: Date]

    public init(id: UUID = UUID(), nombre: String, variedad: String, tipo: TipoPlanta, semilla: TipoSemilla,
                sexo: Sexo? = nil, ubicacion: Ubicacion = .patio, fechaGerminacion: Date,
                estado: EstadoPlanta = .activa, fechaPolinizacion: Date? = nil, polenJuntado: Bool = false,
                cosecha: Cosecha? = nil, registros: [Registro] = [], fotos: [String] = [],
                paqueteOrigenID: UUID? = nil, litrosMaceta: Double = 20, fechasFotos: [String: Date] = [:]) {
        self.id = id
        self.nombre = nombre
        self.variedad = variedad
        self.tipo = tipo
        self.semilla = semilla
        // Una feminizada es hembra de entrada.
        self.sexo = sexo ?? (semilla == .feminizada ? .hembra : .desconocido)
        self.ubicacion = ubicacion
        self.fechaGerminacion = fechaGerminacion
        self.estado = estado
        self.fechaPolinizacion = fechaPolinizacion
        self.polenJuntado = polenJuntado
        self.cosecha = cosecha
        self.registros = registros
        self.fotos = fotos
        self.paqueteOrigenID = paqueteOrigenID
        self.litrosMaceta = litrosMaceta
        self.fechasFotos = fechasFotos
    }

    // Decodificación tolerante: si un backup viejo no trae algún campo nuevo, se usa el valor por defecto.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(UUID.self, forKey: .id)
        nombre = try c.decode(String.self, forKey: .nombre)
        variedad = try c.decodeIfPresent(String.self, forKey: .variedad) ?? ""
        tipo = try c.decode(TipoPlanta.self, forKey: .tipo)
        semilla = try c.decode(TipoSemilla.self, forKey: .semilla)
        sexo = try c.decodeIfPresent(Sexo.self, forKey: .sexo) ?? .desconocido
        ubicacion = try c.decodeIfPresent(Ubicacion.self, forKey: .ubicacion) ?? .patio
        fechaGerminacion = try c.decode(Date.self, forKey: .fechaGerminacion)
        estado = try c.decodeIfPresent(EstadoPlanta.self, forKey: .estado) ?? .activa
        fechaPolinizacion = try c.decodeIfPresent(Date.self, forKey: .fechaPolinizacion)
        polenJuntado = try c.decodeIfPresent(Bool.self, forKey: .polenJuntado) ?? false
        cosecha = try c.decodeIfPresent(Cosecha.self, forKey: .cosecha)
        registros = try c.decodeIfPresent([Registro].self, forKey: .registros) ?? []
        fotos = try c.decodeIfPresent([String].self, forKey: .fotos) ?? []
        paqueteOrigenID = try c.decodeIfPresent(UUID.self, forKey: .paqueteOrigenID)
        litrosMaceta = try c.decodeIfPresent(Double.self, forKey: .litrosMaceta) ?? 20
        fechasFotos = try c.decodeIfPresent([String: Date].self, forKey: .fechasFotos) ?? [:]
    }

    /// Fecha del último registro de alguno de esos tipos.
    public func ultimaFecha(_ tipos: Set<TipoRegistro>) -> Date? {
        registros.lazy.filter { tipos.contains($0.tipo) }.map(\.fecha).max()
    }

    /// Registros del más nuevo al más viejo.
    public var historial: [Registro] { registros.sorted { $0.fecha > $1.fecha } }
}

// MARK: - Semillas y polen

public struct PaqueteSemillas: Codable, Identifiable, Hashable, Sendable {
    public var id: UUID
    public var nombre: String
    public var banco: String
    public var tipo: TipoPlanta
    public var semilla: TipoSemilla
    public var cantidad: Int
    public var fechaCompra: Date
    public var propias: Bool
    /// Si son semillas propias: la planta madre.
    public var plantaMadreID: UUID?

    public init(id: UUID = UUID(), nombre: String, banco: String, tipo: TipoPlanta, semilla: TipoSemilla,
                cantidad: Int, fechaCompra: Date, propias: Bool = false, plantaMadreID: UUID? = nil) {
        self.id = id
        self.nombre = nombre
        self.banco = banco
        self.tipo = tipo
        self.semilla = semilla
        self.cantidad = cantidad
        self.fechaCompra = fechaCompra
        self.propias = propias
        self.plantaMadreID = plantaMadreID
    }
}

public struct Polen: Codable, Identifiable, Hashable, Sendable {
    public var id: UUID
    public var fecha: Date
    public var plantaOrigenID: UUID?
    /// Se guarda el nombre aparte por si la planta se borra.
    public var plantaOrigen: String
    public var notas: String
    public var usado: Bool

    public init(id: UUID = UUID(), fecha: Date, plantaOrigenID: UUID? = nil, plantaOrigen: String,
                notas: String = "", usado: Bool = false) {
        self.id = id
        self.fecha = fecha
        self.plantaOrigenID = plantaOrigenID
        self.plantaOrigen = plantaOrigen
        self.notas = notas
        self.usado = usado
    }
}
