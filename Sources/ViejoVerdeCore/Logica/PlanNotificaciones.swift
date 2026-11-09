import Foundation

public struct AjustesAvisos: Codable, Equatable, Sendable {
    public var activos: Bool
    public var resumenDiario: Bool
    public var puntuales: Bool
    public var hora: Int
    public var minuto: Int

    public init(activos: Bool = true, resumenDiario: Bool = true, puntuales: Bool = true, hora: Int = 9, minuto: Int = 0) {
        self.activos = activos
        self.resumenDiario = resumenDiario
        self.puntuales = puntuales
        self.hora = hora
        self.minuto = minuto
    }
}

public struct NotificacionPlaneada: Equatable, Sendable {
    public let id: String
    public let fecha: Date
    public let titulo: String
    public let cuerpo: String
}

/// Calcula qué notificaciones locales programar. Se recalcula cada vez que cambian los datos.
public enum PlanNotificaciones {
    public static let prefijo = "vv-"
    /// iOS guarda hasta 64 pendientes por app; se deja margen.
    public static let maximo = 60
    public static let diasResumen = 7
    public static let diasPuntuales = 60

    public static func planificar(datos: Datos, ahora: Date, clima: Pronostico? = nil) -> [NotificacionPlaneada] {
        let a = datos.avisos
        guard a.activos else { return [] }
        var plan: [NotificacionPlaneada] = []

        func momento(_ dia: Date) -> Date {
            Calendario.cal.date(bySettingHour: a.hora, minute: a.minuto, second: 0, of: dia) ?? dia
        }

        if a.resumenDiario {
            for d in 0..<diasResumen {
                let fecha = momento(Calendario.sumarDias(d, a: ahora))
                guard fecha > ahora else { continue }
                // A futuro se simula sin registros nuevos: sirve como recordatorio de lo pendiente.
                let tareas = Tareas.generar(plantas: datos.plantas, paquetes: datos.paquetes, hoy: fecha,
                                            config: datos.config, pospuestas: d == 0 ? datos.pospuestas : [:],
                                            clima: clima)
                guard !tareas.isEmpty else { continue }
                var lineas = tareas.prefix(3).map(\.titulo)
                if tareas.count > 3 { lineas.append("y \(tareas.count - 3) más") }
                let urgentes = tareas.filter(\.urgente).count
                let titulo = urgentes > 0
                    ? "⚠️ Hoy: \(tareas.count) tareas (\(urgentes) urgente\(urgentes == 1 ? "" : "s"))"
                    : "Hoy en el patio: \(tareas.count) tarea\(tareas.count == 1 ? "" : "s")"
                plan.append(NotificacionPlaneada(id: "\(prefijo)resumen-\(Calendario.claveDia(fecha))",
                                                 fecha: fecha, titulo: titulo, cuerpo: lineas.joined(separator: "\n")))
            }
        }

        if a.puntuales {
            let limite = Calendario.sumarDias(diasPuntuales, a: ahora)
            for p in datos.plantas {
                for (tipo, dia, titulo, cuerpo) in puntuales(de: p) {
                    let fecha = momento(dia)
                    guard fecha > ahora, fecha <= limite else { continue }
                    plan.append(NotificacionPlaneada(
                        id: "\(prefijo)\(tipo)-\(p.id.uuidString)-\(Calendario.claveDia(fecha))",
                        fecha: fecha, titulo: titulo, cuerpo: cuerpo))
                }
            }
        }

        return Array(plan.sorted { $0.fecha < $1.fecha }.prefix(maximo))
    }

    /// Avisos puntuales de una planta: (tipo, día, título, cuerpo).
    static func puntuales(de p: Planta) -> [(String, Date, String, String)] {
        var r: [(String, Date, String, String)] = []
        let n = p.nombre
        let germ = p.fechaGerminacion
        func dia(_ d: Int) -> Date { Calendario.sumarDias(d, a: germ) }

        switch p.estado {
        case .activa:
            if p.semilla == .regular, p.sexo == .desconocido {
                r.append(("sexado", dia(Tareas.diaSexado), "Revisá el sexo de \(n)",
                          "Día \(Tareas.diaSexado): pelitos blancos = hembra, bolitas = macho."))
            }
            let tramos = Etapas.tramos(de: p)
            if let pref = tramos.first(where: { $0.etapa == .prefloracion }), pref.duracion > 0, p.sexo != .macho {
                r.append(("topbloom", dia(pref.desdeDia), "Pasá a Top Bloom: \(n)",
                          "Arrancó la prefloración. Desde ahora Top Bloom, a mitad de dosis."))
            }
            if let mad = tramos.first(where: { $0.etapa == .maduracion }), mad.duracion > 0, p.sexo != .macho {
                r.append(("tricomas", dia(mad.desdeDia), "Revisá los tricomas de \(n)",
                          "Entró en maduración: solo agua. Buscá tricomas lechosos con algunos ámbar."))
            }
            if let fp = p.fechaPolinizacion {
                r.append(("semillas", Calendario.sumarDias(Tareas.diasSemillas, a: fp), "Revisá las semillas de \(n)",
                          "Listas si están marrones o atigradas."))
            }
        case .secando:
            if let c = p.cosecha {
                r.append(("tallitos", Calendario.sumarDias(Tareas.diaProbarTallitos, a: c.fecha), "Probá los tallitos de \(n)",
                          "Si quiebran con un crac, a frascos."))
            }
        case .curando:
            if let f = p.cosecha?.fechaFrascos {
                r.append(("frascos", Calendario.sumarDias(1, a: f), "Abrí los frascos de \(n)",
                          "Las primeras 2 semanas, 10–15 minutos por día."))
                r.append(("frascos2", Calendario.sumarDias(Tareas.diasCuradoDiario, a: f), "Frascos de \(n)",
                          "Desde ahora alcanza con abrirlos cada 2–3 días."))
                r.append(("curado", Calendario.sumarDias(Tareas.diasCuradoCompleto, a: f), "Curado completo: \(n)",
                          "Ya cumplió 4 semanas en frascos."))
            }
        case .terminada, .descartada:
            break
        }
        return r
    }
}
