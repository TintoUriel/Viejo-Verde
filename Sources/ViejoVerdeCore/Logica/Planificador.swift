import Foundation

public struct FechaClave: Equatable, Sendable {
    public let etapa: Etapa
    public let fecha: Date
}

public struct SemanaCupo: Identifiable, Equatable, Sendable {
    public var id: Date { inicio }
    public let inicio: Date
    /// Máximo de plantas en flor esa semana (de las que ya tenés).
    public let actuales: Int
    /// Máximo de plantas en flor contando las que planeás germinar.
    public let total: Int
    public var nuevas: Int { total - actuales }
    public var excedida: Bool { total > Cupo.plantasFlorecidas }
}

/// "Si germino hoy, ¿cuándo cosecho?" y "¿me paso del cupo?".
public enum Planificador {
    public static let semanas = 20

    /// Día en que empieza cada etapa (solo las que duran algo).
    public static func fechasClave(tipo: TipoPlanta, germinacion: Date) -> [FechaClave] {
        Etapas.tramos(tipo: tipo, germinacion: germinacion)
            .filter { $0.duracion > 0 }
            .map { FechaClave(etapa: $0.etapa, fecha: Calendario.sumarDias($0.desdeDia, a: germinacion)) }
    }

    /// Cuando conviene empezar a mirar tricomas (inicio de "lista para revisar cosecha").
    public static func cosechaEstimada(tipo: TipoPlanta, germinacion: Date) -> Date {
        let t = Etapas.tramos(tipo: tipo, germinacion: germinacion)
        return Calendario.sumarDias(t.last?.desdeDia ?? 84, a: germinacion)
    }

    public static func cosechaEstimada(de p: Planta) -> Date {
        cosechaEstimada(tipo: p.tipo, germinacion: p.fechaGerminacion)
    }

    /// Plantas de mentira para simular una tanda.
    public static func hipoteticas(tipo: TipoPlanta, cantidad: Int, germinacion: Date) -> [Planta] {
        (0..<max(cantidad, 0)).map { i in
            Planta(nombre: "Nueva \(i + 1)", variedad: "", tipo: tipo, semilla: .feminizada, fechaGerminacion: germinacion)
        }
    }

    /// Días (contados desde `hoy`) en que la planta está en flor: [desde, hasta).
    /// Floración, maduración y lista para cosecha van seguidas. Se asume que se cosecha al terminar
    /// "lista para cosecha" (o en una semana, si ya está pasada).
    static func intervaloEnFlor(_ p: Planta, hoy: Date) -> Range<Int>? {
        guard p.estado == .activa else { return nil }
        let tramos = Etapas.tramos(de: p).filter { $0.duracion > 0 }
        guard let primero = tramos.first(where: { $0.etapa.cuentaComoFlorecida }),
              let ultimo = tramos.last else { return nil }
        let offset = Calendario.dias(desde: hoy, hasta: p.fechaGerminacion)  // germinación relativa a hoy
        let desde = max(offset + primero.desdeDia, offset)  // nunca antes de germinar
        let hasta = max(offset + ultimo.hastaDia, 7)
        return desde < hasta ? desde..<hasta : nil
    }

    /// Plantas en flor semana a semana (el máximo de cada semana).
    public static func proyeccion(plantas: [Planta], nuevas: [Planta] = [], desde hoy: Date,
                                  semanas: Int = semanas) -> [SemanaCupo] {
        let actuales = plantas.compactMap { intervaloEnFlor($0, hoy: hoy) }
        let extra = nuevas.compactMap { intervaloEnFlor($0, hoy: hoy) }
        return (0..<semanas).map { s in
            var maxActuales = 0
            var maxTotal = 0
            for d in (s * 7)..<(s * 7 + 7) {
                let a = actuales.filter { $0.contains(d) }.count
                let e = extra.filter { $0.contains(d) }.count
                maxActuales = max(maxActuales, a)
                maxTotal = max(maxTotal, a + e)
            }
            return SemanaCupo(inicio: Calendario.sumarDias(s * 7, a: hoy), actuales: maxActuales, total: maxTotal)
        }
    }

    public static func primeraExcedida(_ p: [SemanaCupo]) -> SemanaCupo? { p.first(where: \.excedida) }

    /// Cuántas plantas más podrías germinar ese día sin pasarte del cupo.
    public static func lugarLibre(plantas: [Planta], tipo: TipoPlanta, germinacion: Date, hoy: Date) -> Int {
        var n = 0
        while n < Cupo.plantasFlorecidas {
            let prueba = hipoteticas(tipo: tipo, cantidad: n + 1, germinacion: germinacion)
            let semanasNecesarias = semanas + max(Calendario.dias(desde: hoy, hasta: germinacion) / 7, 0)
            if primeraExcedida(proyeccion(plantas: plantas, nuevas: prueba, desde: hoy, semanas: semanasNecesarias)) != nil {
                break
            }
            n += 1
        }
        return n
    }
}
