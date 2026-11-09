import Foundation

public struct ResumenCosecha: Identifiable, Equatable, Sendable {
    public var id: UUID { plantaID }
    public let plantaID: UUID
    public let nombre: String
    public let variedad: String
    public let tipo: TipoPlanta
    public let fecha: Date
    public let humedos: Double
    public let secos: Double?
    /// Días desde la germinación hasta la cosecha.
    public let diasCiclo: Int

    /// Peso seco / húmedo (normalmente 20–25 %).
    public var rendimiento: Double? {
        guard let secos, humedos > 0 else { return nil }
        return secos / humedos
    }
}

public struct ResumenGrupo: Identifiable, Equatable, Sendable {
    public var id: String { nombre }
    public let nombre: String
    public let cosechas: Int
    public let totalSecos: Double
    public let promedioSecos: Double?
    public let promedioDias: Int?
}

public enum Estadisticas {
    public static func cosechas(_ plantas: [Planta]) -> [ResumenCosecha] {
        plantas.compactMap { p -> ResumenCosecha? in
            guard let c = p.cosecha, p.estado != .activa else { return nil }
            return ResumenCosecha(plantaID: p.id, nombre: p.nombre,
                                  variedad: p.variedad.isEmpty ? "Sin variedad" : p.variedad,
                                  tipo: p.tipo, fecha: c.fecha, humedos: c.gramosHumedos, secos: c.gramosSecos,
                                  diasCiclo: Calendario.dias(desde: p.fechaGerminacion, hasta: c.fecha))
        }
        .sorted { $0.fecha > $1.fecha }
    }

    public static func totalSecos(_ c: [ResumenCosecha]) -> Double { c.compactMap(\.secos).reduce(0, +) }

    public static func promedioSecos(_ c: [ResumenCosecha]) -> Double? {
        let secos = c.compactMap(\.secos)
        return secos.isEmpty ? nil : secos.reduce(0, +) / Double(secos.count)
    }

    /// Temporada del patio: de julio a junio. "2026/27".
    public static func temporada(de fecha: Date) -> String {
        let anio = Calendario.anio(fecha)
        let inicio = Calendario.mes(fecha) >= 7 ? anio : anio - 1
        return String(format: "%d/%02d", inicio, (inicio + 1) % 100)
    }

    public static func porVariedad(_ c: [ResumenCosecha]) -> [ResumenGrupo] {
        agrupar(c, por: \.variedad).sorted { $0.totalSecos > $1.totalSecos }
    }

    public static func porTemporada(_ c: [ResumenCosecha]) -> [ResumenGrupo] {
        agrupar(c) { temporada(de: $0.fecha) }.sorted { $0.nombre > $1.nombre }
    }

    static func agrupar(_ c: [ResumenCosecha], por clave: (ResumenCosecha) -> String) -> [ResumenGrupo] {
        Dictionary(grouping: c, by: clave).map { nombre, lista in
            ResumenGrupo(nombre: nombre, cosechas: lista.count, totalSecos: totalSecos(lista),
                         promedioSecos: promedioSecos(lista),
                         promedioDias: lista.isEmpty ? nil : lista.map(\.diasCiclo).reduce(0, +) / lista.count)
        }
    }
}

// MARK: - Línea de tiempo de fotos

public struct FotoFechada: Identifiable, Equatable, Sendable {
    public var id: String { nombre }
    public let nombre: String
    public let fecha: Date?
}

extension Planta {
    /// Fotos de la más vieja a la más nueva (las que no tienen fecha, al final en el orden en que se agregaron).
    public var lineaDeTiempo: [FotoFechada] {
        let conFecha = fotos.compactMap { n in fechasFotos[n].map { FotoFechada(nombre: n, fecha: $0) } }
            .sorted { ($0.fecha ?? .distantFuture) < ($1.fecha ?? .distantFuture) }
        let sinFecha = fotos.filter { fechasFotos[$0] == nil }.map { FotoFechada(nombre: $0, fecha: nil) }
        return conFecha + sinFecha
    }
}

// MARK: - Historial del chat

public enum HistorialChat {
    public static let maxMensajes = 80
    public static let maxFotos = 10

    /// Recorta el chat guardado: últimos mensajes y solo las fotos más recientes.
    public static func recortar(_ m: [MensajeChat], maxMensajes: Int = maxMensajes, maxFotos: Int = maxFotos) -> [MensajeChat] {
        var lista = Array(m.suffix(maxMensajes))
        let conFoto = lista.indices.filter { lista[$0].imagenJPEG != nil }
        for i in conFoto.dropLast(maxFotos) { lista[i].imagenJPEG = nil }
        return lista
    }
}
