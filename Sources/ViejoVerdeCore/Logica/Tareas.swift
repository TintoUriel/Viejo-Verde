import Foundation

public enum TipoTarea: Int, Codable, CaseIterable, Sendable, Comparable {
    // El orden define cómo se muestran (después de las urgentes).
    case machoPatio, cosecha, hongos, sexado, machoPolen, semillas, fertilizante, riego, neem, secado, curado

    public static func < (a: TipoTarea, b: TipoTarea) -> Bool { a.rawValue < b.rawValue }
}

public enum AccionTarea: String, Codable, Sendable {
    case regue, fertilice, neem
    case hembra, macho, moverAdentro, juntePolen
    case registrarSemillas, cosechar, aFrascos, abriFrascos, terminar
    /// Revisé (hongos): queda registrado y no vuelve a aparecer hoy.
    case revise
    /// Oculta la tarea hasta mañana sin registrar nada.
    case hoyNo

    public var titulo: String {
        switch self {
        case .regue: "Regué"
        case .fertilice: "Fertilicé"
        case .neem: "Neem"
        case .hembra: "Hembra"
        case .macho: "Macho"
        case .moverAdentro: "Lo llevé adentro"
        case .juntePolen: "Junté polen"
        case .registrarSemillas: "Registrar semillas"
        case .cosechar: "Cosechar"
        case .aFrascos: "A frascos"
        case .abriFrascos: "Abrí los frascos"
        case .terminar: "Terminar"
        case .revise: "Revisé"
        case .hoyNo: "Hoy no"
        }
    }
}

public struct Tarea: Identifiable, Hashable, Sendable {
    /// Estable por planta y tipo: "riego-<uuid>".
    public let id: String
    public let tipo: TipoTarea
    public let plantaID: UUID
    public let plantaNombre: String
    public let titulo: String
    public let detalle: String
    public let urgente: Bool
    public let acciones: [AccionTarea]
    /// Para riego y fertilizante: lo que hay que echar.
    public let dosis: DosisTarea?

    public static func id(_ tipo: TipoTarea, _ plantaID: UUID) -> String { "\(tipo)-\(plantaID.uuidString)" }
}

/// Versión `Hashable` de la dosis, para adjuntar a la tarea.
public struct DosisTarea: Hashable, Sendable {
    public let aguaML: Int
    public let fertilizante: Fertilizante?
    public let fertilizanteML: Double

    public init(aguaML: Int, fertilizante: Fertilizante?, fertilizanteML: Double) {
        self.aguaML = aguaML
        self.fertilizante = fertilizante
        self.fertilizanteML = fertilizanteML
    }

    public init(_ d: Dosis) {
        self.init(aguaML: d.aguaML, fertilizante: d.fertilizante, fertilizanteML: d.fertilizanteML)
    }
}

public enum Tareas {
    public static let diasEntreRiegos = 2
    public static let diasEntreFertilizantes = 6
    public static let diasEntreNeem = 7
    public static let diaSexado = 21
    public static let diasSemillas = 35
    public static let diaProbarTallitos = 7
    public static let diasCuradoDiario = 14
    public static let diasCuradoCompleto = 28

    /// Genera las tareas de hoy. `pospuestas`: id de tarea → día en que se tocó "Hoy no".
    public static func generar(plantas: [Planta], paquetes: [PaqueteSemillas] = [], hoy: Date,
                               config: ConfigDosis = ConfigDosis(),
                               pospuestas: [String: Date] = [:],
                               clima: Pronostico? = nil) -> [Tarea] {
        var todas: [Tarea] = []
        for p in plantas {
            todas += tareas(de: p, paquetes: paquetes, hoy: hoy, config: config, clima: clima)
        }
        return todas
            .filter { t in !(pospuestas[t.id].map { Calendario.mismoDia($0, hoy) } ?? false) }
            .sorted { a, b in
                if a.urgente != b.urgente { return a.urgente }
                if a.tipo != b.tipo { return a.tipo < b.tipo }
                return a.plantaNombre.localizedCompare(b.plantaNombre) == .orderedAscending
            }
    }

    static func tareas(de p: Planta, paquetes: [PaqueteSemillas], hoy: Date, config: ConfigDosis,
                       clima: Pronostico? = nil) -> [Tarea] {
        var r: [Tarea] = []
        let n = p.nombre
        func t(_ tipo: TipoTarea, _ titulo: String, _ detalle: String, urgente: Bool = false,
               _ acciones: [AccionTarea], dosis: Dosis? = nil) {
            r.append(Tarea(id: Tarea.id(tipo, p.id), tipo: tipo, plantaID: p.id, plantaNombre: n,
                           titulo: titulo, detalle: detalle, urgente: urgente, acciones: acciones,
                           dosis: dosis.map { DosisTarea(aguaML: $0.aguaML, fertilizante: $0.fertilizante,
                                                         fertilizanteML: $0.fertilizanteML) }))
        }
        func diasDesde(_ tipos: Set<TipoRegistro>, siNunca: Date?) -> Int? {
            guard let f = p.ultimaFecha(tipos) ?? siNunca else { return nil }
            return Calendario.dias(desde: f, hasta: hoy)
        }

        let e = Etapas.estado(de: p, hoy: hoy)

        switch p.estado {
        case .activa:
            // --- Riego y fertilizante (fertilizar también es regar) ---
            let dosis = CalculoDosis.dosis(etapa: e.etapa, diaEnEtapa: e.diaEnEtapa,
                                           litrosMaceta: p.litrosMaceta, config: config)
            let sinRiego = diasDesde([.riego, .fertilizante], siNunca: p.fechaGerminacion) ?? 0
            // Clima (solo para las del patio): si ayer llovió fuerte no hace falta regar;
            // con calor fuerte, las macetas de tela se secan en un día.
            let enPatio = p.ubicacion == .patio
            let llovio = enPatio && AnalisisClima.lluviaAyer(clima, hoy: hoy) >= AnalisisClima.lluviaQueRiega
            let calor = enPatio && AnalisisClima.hayCalor(clima, hoy: hoy)
            let lluviaHoy = enPatio ? AnalisisClima.lluviaHoyProbable(clima, hoy: hoy) : nil
            let tocaRegar = !llovio && sinRiego >= (calor ? 1 : diasEntreRiegos)
            var notaClima = ""
            if let mm = lluviaHoy {
                notaClima = " Pronóstico: \(Formato.numero(mm)) mm de lluvia hoy; si podés, esperá."
            } else if calor {
                notaClima = " Hace calor: regá temprano o al atardecer."
            }
            let sinFertilizar = diasDesde([.fertilizante], siNunca: nil) ?? Int.max
            if tocaRegar, let f = dosis.fertilizante, sinFertilizar >= diasEntreFertilizantes {
                t(.fertilizante, "Toca \(f.nombre) para \(n)",
                  "Si la maceta está liviana: \(dosis.textoFertilizante ?? ""). Siempre a mitad de la dosis de la etiqueta." + notaClima,
                  [.fertilice, .regue, .hoyNo], dosis: dosis)
            } else if tocaRegar {
                var detalle = "Si está liviana, echale \(dosis.textoAgua). Si sale agua por abajo antes, pará."
                if e.etapa == .maduracion || e.etapa == .listaCosecha {
                    detalle += " Solo agua, sin fertilizante."
                } else if e.etapa == .plantula {
                    detalle += " Chorrito alrededor del tallo, todavía sin fertilizante."
                }
                detalle += notaClima
                t(.riego, "Fijate si \(n) necesita agua (levantá la maceta)", detalle, [.regue, .hoyNo], dosis: dosis)
            }

            // --- Neem: crecimiento y prefloración, nunca en floración ---
            if e.etapa == .crecimiento || e.etapa == .prefloracion,
               (diasDesde([.neem], siNunca: nil) ?? Int.max) >= diasEntreNeem {
                t(.neem, "Neem a \(n)", "Jabón potásico con neem al atardecer, solo hojas (arriba y abajo).",
                  [.neem, .hoyNo])
            }

            // --- Sexado de regulares ---
            if p.semilla == .regular, p.sexo == .desconocido, e.dia >= diaSexado {
                t(.sexado, "Revisá el sexo de \(n)",
                  "Pelitos blancos en los nudos = hembra. Bolitas colgando = macho.", [.hembra, .macho])
            }

            // --- Macho ---
            if p.sexo == .macho {
                if p.ubicacion == .patio {
                    t(.machoPatio, "¡\(n) es macho y está en el patio!",
                      "Alejalo de las hembras ya: llevalo adentro (ventanal o placard con LED).",
                      urgente: true, [.moverAdentro])
                } else if !p.polenJuntado {
                    t(.machoPolen, "Polen de \(n)",
                      "Cuando las bolitas empiecen a abrirse, cortá 2–3 ramas y juntá el polen.", [.juntePolen])
                }
            }

            // --- Semillas de una rama polinizada ---
            if let fp = p.fechaPolinizacion,
               Calendario.dias(desde: fp, hasta: hoy) >= diasSemillas,
               !paquetes.contains(where: { $0.plantaMadreID == p.id }) {
                t(.semillas, "Revisá las semillas de \(n)",
                  "Están listas si están marrones o atigradas.", [.registrarSemillas, .hoyNo])
            }

            // --- Hongos después de días húmedos (cogollos en el patio) ---
            if enPatio, p.sexo != .macho,
               [Etapa.floracion, .maduracion, .listaCosecha].contains(e.etapa),
               AnalisisClima.riesgoHongos(clima, hoy: hoy),
               !(p.ultimaFecha([.revision]).map { Calendario.mismoDia($0, hoy) } ?? false) {
                t(.hongos, "Revisá hongos en \(n)",
                  "Hubo humedad o lluvia: abrí un poco los cogollos más gordos. Si ves partes marrones o pelusa gris, cortalas y tiralas lejos.",
                  [.revise, .hoyNo])
            }

            // --- Punto de cosecha ---
            if p.sexo != .macho, e.etapa == .maduracion || e.etapa == .listaCosecha {
                t(.cosecha, "Revisá los tricomas de \(n)",
                  "Mayoría lechosos con algunos ámbar → a cosechar.",
                  urgente: e.etapa == .listaCosecha, [.cosechar, .hoyNo])
            }

        case .secando:
            if e.diaEnEtapa >= diaProbarTallitos {
                t(.secado, "Probá los tallitos de \(n)",
                  "Si quiebran con un crac, a frascos. Si se doblan, esperá unos días más.", [.aFrascos, .hoyNo])
            }

        case .curando:
            let d = e.diaEnEtapa
            // Solo cuentan las aperturas desde que está en frascos.
            let inicio = Calendario.inicioDelDia(p.cosecha?.fechaFrascos ?? hoy)
            let ultimaApertura = p.registros.filter { $0.tipo == .curado && $0.fecha >= inicio }.map(\.fecha).max()
            let sinAbrir = ultimaApertura.map { Calendario.dias(desde: $0, hasta: hoy) } ?? Int.max
            if d >= diasCuradoCompleto {
                t(.curado, "Curado completo: \(n)", "Ya podés cerrar los frascos y disfrutarla.", [.terminar])
            } else if d < diasCuradoDiario {
                if sinAbrir >= 1 {
                    t(.curado, "Abrí los frascos de \(n)", "10–15 minutos hoy, para que salga la humedad.",
                      [.abriFrascos])
                }
            } else if sinAbrir >= 2 {
                t(.curado, "Abrí los frascos de \(n)", "Ahora alcanza con cada 2–3 días, unos minutos.",
                  [.abriFrascos, .hoyNo])
            }

        case .terminada, .descartada:
            break
        }
        return r
    }
}
