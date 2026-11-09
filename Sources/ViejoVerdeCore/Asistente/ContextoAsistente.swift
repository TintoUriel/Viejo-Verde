import Foundation

public enum ContextoAsistente {
    /// Instrucción de sistema fija.
    public static let instrucciones = """
    Sos el asistente de "Viejo Verde", una app para llevar un autocultivo de cannabis medicinal en Argentina \
    (el usuario tiene REPROCANN). Respondé en español rioplatense, con voseo, corto y práctico: pasos concretos, \
    sin vueltas. Si algo depende de ver la planta, decí exactamente qué mirar (hojas de abajo o de arriba, \
    puntas, envés, tricomas con lupa, etc.). Para cualquier fertilizante o producto, arrancá siempre con la \
    mitad de la dosis de la etiqueta. Usá los datos de las plantas que vienen en el contexto (etapa, días, \
    últimos riegos y notas) para personalizar la respuesta. Si te mandan una foto, describí lo que ves antes \
    de diagnosticar y, si no estás seguro, decí las dos o tres causas más probables y cómo distinguirlas.
    """

    /// Contexto de hoy: fecha, lugar, límites legales y resumen de las plantas.
    public static func contexto(datos: Datos, hoy: Date) -> String {
        var l: [String] = []
        l.append("Fecha de hoy: \(Formato.fechaLarga(hoy)) (\(Calendario.claveDia(hoy))).")
        l.append("Ubicación: CABA, Buenos Aires, Argentina (hemisferio sur). Cultivo en el patio, exterior; machos adentro.")
        l.append("Límites REPROCANN: hasta \(Cupo.plantasFlorecidas) plantas florecidas y hasta \(Cupo.metrosExterior) m² en exterior.")
        let temporada = Temporada.consejo(para: hoy)
        l.append("Temporada: \(temporada.titulo). \(temporada.texto)")
        l.append("Insumos: macetas de tela, sustrato Growmix, Top Veg y Top Bloom (Top Crop), jabón potásico con neem.")

        let cupo = Cupo.resumen(datos.plantas, hoy: hoy)
        l.append("Resumen: \(cupo.activas) activas, \(cupo.enFlor)/\(cupo.limite) en flor, \(cupo.secando) secando, \(cupo.curando) curando.")

        let relevantes = datos.plantas.filter { $0.estado == .activa || $0.estado == .secando || $0.estado == .curando }
        if relevantes.isEmpty {
            l.append("Plantas: todavía no cargó ninguna.")
        } else {
            l.append("Plantas:")
            for p in relevantes { l.append(resumen(de: p, hoy: hoy)) }
        }

        let semillas = datos.paquetes.filter { $0.cantidad > 0 }
        if !semillas.isEmpty {
            let t = semillas.map { "\($0.nombre) (\($0.tipo.nombre.lowercased()), \($0.semilla.nombre.lowercased()), \($0.cantidad))" }
            l.append("Semillas guardadas: " + t.joined(separator: "; ") + ".")
        }
        let polen = datos.polenes.filter { !$0.usado }
        if !polen.isEmpty {
            l.append("Polen guardado: " + polen.map { "\($0.plantaOrigen), del \(Calendario.claveDia($0.fecha))" }.joined(separator: "; ") + ".")
        }
        return l.joined(separator: "\n")
    }

    static func resumen(de p: Planta, hoy: Date) -> String {
        let e = Etapas.estado(de: p, hoy: hoy)
        var partes = ["- \(p.nombre) (\(p.variedad.isEmpty ? "sin variedad" : p.variedad), \(p.tipo.nombre.lowercased()) \(p.semilla.nombre.lowercased()), sexo: \(p.sexo.nombre.lowercased()), \(p.ubicacion.nombre.lowercased()), maceta \(Formato.numero(p.litrosMaceta)) L)"]
        switch p.estado {
        case .activa:
            partes.append("\(e.etapa.nombre), día \(e.dia) (semana \(e.semana))")
            partes.append("último riego: \(hace(p.ultimaFecha([.riego, .fertilizante]), hoy))")
            var fert = "fertilizante: \(hace(p.ultimaFecha([.fertilizante]), hoy))"
            if let prod = p.registros.filter({ $0.tipo == .fertilizante }).max(by: { $0.fecha < $1.fecha })?.producto {
                fert += " (\(prod))"
            }
            partes.append(fert)
            partes.append("neem: \(hace(p.ultimaFecha([.neem]), hoy))")
            if let fp = p.fechaPolinizacion { partes.append("polinizada \(hace(fp, hoy))") }
        case .secando:
            partes.append("secando hace \(e.diaEnEtapa) días")
            if let g = p.cosecha?.gramosHumedos { partes.append("\(Formato.numero(g)) g húmedos") }
        case .curando:
            partes.append("curando en frascos hace \(e.diaEnEtapa) días")
            if let g = p.cosecha?.gramosSecos { partes.append("\(Formato.numero(g)) g secos") }
        default:
            break
        }
        var linea = partes.joined(separator: "; ") + "."
        let notas = p.registros
            .filter { $0.tipo == .nota || $0.tipo == .problema }
            .sorted { $0.fecha > $1.fecha }
            .prefix(3)
            .compactMap { r -> String? in
                guard let n = r.nota, !n.isEmpty else { return nil }
                return "\(r.tipo == .problema ? "Problema" : "Nota") (\(hace(r.fecha, hoy))): \(n)"
            }
        if !notas.isEmpty { linea += " Últimas notas: " + notas.joined(separator: " | ") }
        return linea
    }

    static func hace(_ fecha: Date?, _ hoy: Date) -> String {
        guard let fecha else { return "nunca" }
        let d = Calendario.dias(desde: fecha, hasta: hoy)
        switch d {
        case ..<1: return "hoy"
        case 1: return "ayer"
        default: return "hace \(d) días"
        }
    }

    /// Preguntas rápidas.
    public static let chips = [
        "¿Qué hago esta semana?",
        "Hojas amarillas, ¿qué puede ser?",
        "¿Cómo sé si está para cosechar?",
        "¿Cómo junto el polen?",
    ]
}
