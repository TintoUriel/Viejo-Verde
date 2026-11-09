import Foundation

public enum Etapa: String, Codable, CaseIterable, Sendable {
    case plantula, crecimiento, prefloracion, floracion, maduracion, listaCosecha
    case secado, curado, terminada, descartada

    public var nombre: String {
        switch self {
        case .plantula: "Plántula"
        case .crecimiento: "Crecimiento"
        case .prefloracion: "Prefloración"
        case .floracion: "Floración"
        case .maduracion: "Maduración"
        case .listaCosecha: "Lista para revisar cosecha"
        case .secado: "Secando"
        case .curado: "Curando"
        case .terminada: "Terminada"
        case .descartada: "Descartada"
        }
    }

    /// Nombre corto para la barra de etapas.
    public var corto: String {
        switch self {
        case .plantula: "Plántula"
        case .crecimiento: "Crec."
        case .prefloracion: "Pref."
        case .floracion: "Flor"
        case .maduracion: "Mad."
        case .listaCosecha: "Cosecha"
        default: nombre
        }
    }

    /// Las etapas de la planta viva, en orden.
    public static let deCultivo: [Etapa] = [.plantula, .crecimiento, .prefloracion, .floracion, .maduracion, .listaCosecha]

    /// Cuenta para el cupo de plantas florecidas del REPROCANN.
    public var cuentaComoFlorecida: Bool { self == .floracion || self == .maduracion || self == .listaCosecha }
}

/// Un tramo de la barra de etapas, en días desde la germinación (`hastaDia` no incluido).
public struct Tramo: Equatable, Sendable {
    public let etapa: Etapa
    public let desdeDia: Int
    public let hastaDia: Int
    public var duracion: Int { hastaDia - desdeDia }
}

public struct EstadoEtapa: Equatable, Sendable {
    public let etapa: Etapa
    /// Días desde la germinación (día 0 = el día que germinó).
    public let dia: Int
    /// Días dentro de la etapa actual (para secado y curado, desde la cosecha o los frascos).
    public let diaEnEtapa: Int
    public let tramos: [Tramo]
    public var semana: Int { max(dia, 0) / 7 + 1 }
}

public enum Etapas {
    /// Automáticas: día en que empieza cada etapa de cultivo.
    static let inicioAuto = [0, 10, 21, 35, 70, 84]
    /// Largo con el que se dibuja la última etapa (que no tiene fin).
    static let largoUltimoTramo = 14
    static let diasPlantulaFoto = 10

    /// Tramos de cultivo según el tipo y la fecha de germinación.
    public static func tramos(tipo: TipoPlanta, germinacion: Date) -> [Tramo] {
        let inicios: [Int]
        switch tipo {
        case .auto:
            inicios = inicioAuto
        case .foto:
            // Hemisferio sur: si germinó entre julio y diciembre, la temporada termina el año siguiente.
            let mes = Calendario.mes(germinacion)
            let anioFin = Calendario.anio(germinacion) + (mes >= 7 ? 1 : 0)
            func dia(_ d: Int, _ m: Int) -> Int {
                Calendario.dias(desde: germinacion, hasta: Calendario.fecha(anioFin, m, d))
            }
            var b = [0, diasPlantulaFoto, dia(25, 1), dia(20, 2), dia(5, 4), dia(25, 4)]
            // Los primeros 10 días siempre son plántula; si una fecha ya pasó, esa etapa queda vacía.
            for i in 1..<b.count { b[i] = max(b[i], b[i - 1]) }
            inicios = b
        }
        return Etapa.deCultivo.indices.map { i in
            let desde = inicios[i]
            let hasta = i + 1 < inicios.count ? inicios[i + 1] : desde + largoUltimoTramo
            return Tramo(etapa: Etapa.deCultivo[i], desdeDia: desde, hastaDia: hasta)
        }
    }

    public static func tramos(de planta: Planta) -> [Tramo] {
        tramos(tipo: planta.tipo, germinacion: planta.fechaGerminacion)
    }

    /// Etapa de cultivo (por calendario) para un día dado, sin mirar el estado.
    public static func etapaDeCultivo(enDia dia: Int, tramos: [Tramo]) -> Tramo {
        let d = max(dia, 0)
        let conLargo = tramos.filter { $0.duracion > 0 }
        return conLargo.last { $0.desdeDia <= d } ?? conLargo.first ?? tramos[0]
    }

    public static func estado(de planta: Planta, hoy: Date) -> EstadoEtapa {
        let ts = Self.tramos(de: planta)
        let dia = Calendario.dias(desde: planta.fechaGerminacion, hasta: hoy)
        switch planta.estado {
        case .activa:
            let t = etapaDeCultivo(enDia: dia, tramos: ts)
            return EstadoEtapa(etapa: t.etapa, dia: dia, diaEnEtapa: max(dia, 0) - t.desdeDia, tramos: ts)
        case .secando:
            let desde = planta.cosecha?.fecha ?? hoy
            return EstadoEtapa(etapa: .secado, dia: dia,
                               diaEnEtapa: Calendario.dias(desde: desde, hasta: hoy), tramos: ts)
        case .curando:
            let desde = planta.cosecha?.fechaFrascos ?? hoy
            return EstadoEtapa(etapa: .curado, dia: dia,
                               diaEnEtapa: Calendario.dias(desde: desde, hasta: hoy), tramos: ts)
        case .terminada:
            return EstadoEtapa(etapa: .terminada, dia: dia, diaEnEtapa: 0, tramos: ts)
        case .descartada:
            return EstadoEtapa(etapa: .descartada, dia: dia, diaEnEtapa: 0, tramos: ts)
        }
    }

    public static func etapa(de planta: Planta, hoy: Date) -> Etapa { estado(de: planta, hoy: hoy).etapa }
}
