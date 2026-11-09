import Foundation

/// Todo lo que guarda la app. Las operaciones viven acá (y no en la UI) para poder testearlas.
public struct Datos: Codable, Equatable, Sendable {
    public var plantas: [Planta]
    public var paquetes: [PaqueteSemillas]
    public var polenes: [Polen]
    public var config: ConfigDosis
    /// Tareas a las que se les tocó "Hoy no": id de tarea → día.
    public var pospuestas: [String: Date]
    public var avisos: AjustesAvisos

    public init(plantas: [Planta] = [], paquetes: [PaqueteSemillas] = [], polenes: [Polen] = [],
                config: ConfigDosis = ConfigDosis(), pospuestas: [String: Date] = [:],
                avisos: AjustesAvisos = AjustesAvisos()) {
        self.plantas = plantas
        self.paquetes = paquetes
        self.polenes = polenes
        self.config = config
        self.pospuestas = pospuestas
        self.avisos = avisos
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        plantas = try c.decodeIfPresent([Planta].self, forKey: .plantas) ?? []
        paquetes = try c.decodeIfPresent([PaqueteSemillas].self, forKey: .paquetes) ?? []
        polenes = try c.decodeIfPresent([Polen].self, forKey: .polenes) ?? []
        config = try c.decodeIfPresent(ConfigDosis.self, forKey: .config) ?? ConfigDosis()
        pospuestas = try c.decodeIfPresent([String: Date].self, forKey: .pospuestas) ?? [:]
        avisos = try c.decodeIfPresent(AjustesAvisos.self, forKey: .avisos) ?? AjustesAvisos()
    }

    public func planta(_ id: UUID) -> Planta? { plantas.first { $0.id == id } }

    private mutating func modificar(_ id: UUID, _ cambio: (inout Planta) -> Void) {
        guard let i = plantas.firstIndex(where: { $0.id == id }) else { return }
        cambio(&plantas[i])
    }

    // MARK: Plantas

    /// Agrega la planta (con su registro de germinación). Si sale de un pack, le descuenta una semilla.
    public mutating func agregarPlanta(_ planta: Planta, desdePaquete paqueteID: UUID? = nil) {
        var p = planta
        if let paqueteID, let i = paquetes.firstIndex(where: { $0.id == paqueteID }) {
            paquetes[i].cantidad = max(paquetes[i].cantidad - 1, 0)
            p.paqueteOrigenID = paqueteID
        }
        if !p.registros.contains(where: { $0.tipo == .germinacion }) {
            p.registros.append(Registro(fecha: p.fechaGerminacion, tipo: .germinacion))
        }
        plantas.append(p)
    }

    public mutating func actualizar(_ planta: Planta) {
        modificar(planta.id) { $0 = planta }
    }

    public mutating func borrarPlanta(_ id: UUID) {
        plantas.removeAll { $0.id == id }
        pospuestas = pospuestas.filter { !$0.key.hasSuffix(id.uuidString) }
    }

    public mutating func registrar(_ tipo: TipoRegistro, en id: UUID, fecha: Date,
                                   producto: String? = nil, nota: String? = nil, aguaML: Int? = nil) {
        modificar(id) {
            $0.registros.append(Registro(fecha: fecha, tipo: tipo, producto: producto, nota: nota, aguaML: aguaML))
        }
    }

    public mutating func editarRegistro(_ registro: Registro, en id: UUID) {
        modificar(id) { p in
            if let i = p.registros.firstIndex(where: { $0.id == registro.id }) { p.registros[i] = registro }
        }
    }

    public mutating func borrarRegistro(_ registroID: UUID, en id: UUID) {
        modificar(id) { $0.registros.removeAll { $0.id == registroID } }
    }

    public mutating func marcarSexo(_ sexo: Sexo, en id: UUID, fecha: Date) {
        modificar(id) {
            $0.sexo = sexo
            $0.registros.append(Registro(fecha: fecha, tipo: .sexo, nota: sexo.nombre))
        }
    }

    public mutating func moverAdentro(_ id: UUID, fecha: Date) {
        modificar(id) {
            $0.ubicacion = .interior
            $0.registros.append(Registro(fecha: fecha, tipo: .nota, nota: "Lo llevé adentro"))
        }
    }

    public mutating func polinizar(_ id: UUID, fecha: Date, nota: String? = nil) {
        modificar(id) {
            $0.fechaPolinizacion = fecha
            $0.registros.append(Registro(fecha: fecha, tipo: .polinizacion, nota: nota ?? "Polinicé una rama"))
        }
    }

    /// Junta polen de un macho: crea el Polen y marca la planta.
    @discardableResult
    public mutating func juntarPolen(de id: UUID, fecha: Date, notas: String = "") -> Polen? {
        guard let p = planta(id) else { return nil }
        let polen = Polen(fecha: fecha, plantaOrigenID: id, plantaOrigen: "\(p.nombre) (\(p.variedad))", notas: notas)
        polenes.append(polen)
        modificar(id) {
            $0.polenJuntado = true
            $0.registros.append(Registro(fecha: fecha, tipo: .nota, nota: "Junté polen"))
        }
        return polen
    }

    public mutating func cosechar(_ id: UUID, fecha: Date, gramosHumedos: Double) {
        modificar(id) {
            $0.estado = .secando
            $0.cosecha = Cosecha(fecha: fecha, gramosHumedos: gramosHumedos)
            $0.registros.append(Registro(fecha: fecha, tipo: .cosecha, nota: "\(Formato.numero(gramosHumedos)) g húmedos"))
        }
    }

    public mutating func pasarAFrascos(_ id: UUID, fecha: Date, gramosSecos: Double) {
        modificar(id) {
            $0.estado = .curando
            if $0.cosecha == nil { $0.cosecha = Cosecha(fecha: fecha, gramosHumedos: 0) }
            $0.cosecha?.fechaFrascos = fecha
            $0.cosecha?.gramosSecos = gramosSecos
            $0.registros.append(Registro(fecha: fecha, tipo: .secado, nota: "\(Formato.numero(gramosSecos)) g secos"))
        }
    }

    public mutating func terminar(_ id: UUID, fecha: Date) {
        modificar(id) {
            $0.estado = .terminada
            $0.registros.append(Registro(fecha: fecha, tipo: .nota, nota: "Curado completo"))
        }
    }

    public mutating func descartar(_ id: UUID, fecha: Date, nota: String? = nil) {
        modificar(id) {
            $0.estado = .descartada
            $0.registros.append(Registro(fecha: fecha, tipo: .nota, nota: nota ?? "Descartada"))
        }
    }

    // MARK: Semillas y polen

    /// Crea un pack de semillas propias (regulares) de esa planta.
    @discardableResult
    public mutating func registrarSemillasPropias(de id: UUID, cantidad: Int, fecha: Date) -> PaqueteSemillas? {
        guard let p = planta(id) else { return nil }
        let pack = PaqueteSemillas(nombre: "\(p.variedad) propias", banco: "Propias (\(p.nombre))",
                                   tipo: p.tipo, semilla: .regular, cantidad: max(cantidad, 0),
                                   fechaCompra: fecha, propias: true, plantaMadreID: id)
        paquetes.append(pack)
        registrar(.nota, en: id, fecha: fecha, nota: "Guardé \(cantidad) semillas propias")
        return pack
    }

    public mutating func agregarPaquete(_ pack: PaqueteSemillas) { paquetes.append(pack) }

    public mutating func actualizarPaquete(_ pack: PaqueteSemillas) {
        if let i = paquetes.firstIndex(where: { $0.id == pack.id }) { paquetes[i] = pack }
    }

    public mutating func borrarPaquete(_ id: UUID) { paquetes.removeAll { $0.id == id } }

    public mutating func agregarPolen(_ polen: Polen) { polenes.append(polen) }

    public mutating func alternarPolenUsado(_ id: UUID) {
        if let i = polenes.firstIndex(where: { $0.id == id }) { polenes[i].usado.toggle() }
    }

    public mutating func borrarPolen(_ id: UUID) { polenes.removeAll { $0.id == id } }

    // MARK: Fotos

    public mutating func agregarFoto(_ nombre: String, en id: UUID) {
        modificar(id) { $0.fotos.append(nombre) }
    }

    public mutating func quitarFoto(_ nombre: String, en id: UUID) {
        modificar(id) { $0.fotos.removeAll { $0 == nombre } }
    }

    /// Todas las fotos referenciadas (para el backup y para limpiar archivos huérfanos).
    public var todasLasFotos: [String] { plantas.flatMap(\.fotos) }

    public mutating func ajustarCantidad(_ paqueteID: UUID, en delta: Int) {
        guard let i = paquetes.firstIndex(where: { $0.id == paqueteID }) else { return }
        paquetes[i].cantidad = max(paquetes[i].cantidad + delta, 0)
    }

    // MARK: Tareas

    public mutating func posponer(_ tareaID: String, hoy: Date) {
        pospuestas[tareaID] = hoy
        // Se limpian las viejas para que no crezca.
        pospuestas = pospuestas.filter { Calendario.dias(desde: $0.value, hasta: hoy) <= 1 }
    }
}

// MARK: - Backup

public struct Backup: Codable, Sendable {
    public static let versionActual = 1
    public var version: Int
    public var exportado: Date
    public var datos: Datos
    /// Fotos en base64, por nombre de archivo (opcional).
    public var fotos: [String: Data]

    public init(datos: Datos, exportado: Date = Date(), fotos: [String: Data] = [:]) {
        self.version = Backup.versionActual
        self.exportado = exportado
        self.datos = datos
        self.fotos = fotos
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        version = try c.decodeIfPresent(Int.self, forKey: .version) ?? 1
        exportado = try c.decodeIfPresent(Date.self, forKey: .exportado) ?? Date()
        datos = try c.decode(Datos.self, forKey: .datos)
        fotos = try c.decodeIfPresent([String: Data].self, forKey: .fotos) ?? [:]
    }

    public static func codificador() -> JSONEncoder {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        e.outputFormatting = [.prettyPrinted, .sortedKeys]
        return e
    }

    public static func decodificador() -> JSONDecoder {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }

    public func json() throws -> Data { try Backup.codificador().encode(self) }

    public static func leer(_ data: Data) throws -> Backup { try decodificador().decode(Backup.self, from: data) }
}
