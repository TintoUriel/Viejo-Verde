import Foundation

extension Etapa {
    /// Consejos fijos de cada etapa.
    public var consejos: [String] {
        switch self {
        case .plantula:
            ["Riego chiquito alrededor del tallo.",
             "Sol directo.",
             "Cuidado con el viento.",
             "Todavía no fertilizar."]
        case .crecimiento:
            ["Regá cuando la maceta pesa poco.",
             "Top Veg a mitad de la dosis de la etiqueta.",
             "Neem una vez por semana, al atardecer."]
        case .prefloracion:
            ["Aparecen pelitos blancos (hembra) o bolitas (macho).",
             "Pasá a Top Bloom, a mitad de dosis."]
        case .floracion:
            ["No toques ni rocíes los cogollos.",
             "Revisá si hay hongos después de días húmedos."]
        case .maduracion:
            ["Solo agua.",
             "Pelitos 70–80 % marrones.",
             "Tricomas lechosos con algunos ámbar."]
        case .listaCosecha:
            ["Mirá los tricomas con lupa: mayoría lechosos con algunos ámbar.",
             "Si ya está, cosechá."]
        case .secado:
            ["Lugar oscuro y ventilado, entre 18 y 22 °C.",
             "Tarda 7–14 días, hasta que los tallitos quiebren."]
        case .curado:
            ["Frascos llenos hasta 3/4.",
             "Si huele a humedad o hay pelusa blanca, sacá ese cogollo."]
        case .terminada, .descartada:
            ["Reciclá la tierra: sacá las raíces.",
             "Mezclá 1 parte de humus cada 3 de tierra.",
             "Dejala reposar 1–2 semanas."]
        }
    }
}

public struct ConsejoTemporada: Equatable, Sendable {
    public let titulo: String
    public let texto: String
}

public enum Temporada {
    /// Consejo según el mes, pensado para Buenos Aires.
    public static func consejo(para fecha: Date) -> ConsejoTemporada {
        switch Calendario.mes(fecha) {
        case 9, 10, 11:
            ConsejoTemporada(titulo: "Temporada de siembra",
                             texto: "Buen momento para germinar fotoperiódicas y automáticas.")
        case 12, 1, 2:
            ConsejoTemporada(titulo: "Otra tanda de automáticas",
                             texto: "Todavía da para germinar automáticas. Con calor, regá temprano o al atardecer.")
        case 3, 4:
            ConsejoTemporada(titulo: "Última tanda de automáticas",
                             texto: "Abril mejor que mayo. Ojo con los hongos por la humedad.")
        default:
            ConsejoTemporada(titulo: "Descanso del patio",
                             texto: "Reciclá el sustrato y armá compost para la próxima temporada.")
        }
    }
}

public struct ResumenCupo: Equatable, Sendable {
    public let activas: Int
    public let enFlor: Int
    public let secando: Int
    public let curando: Int
    public var limite: Int { Cupo.plantasFlorecidas }
    public var excedido: Bool { enFlor > limite }
}

public enum Cupo {
    /// REPROCANN: hasta 9 plantas florecidas, hasta 15 m² en exterior.
    public static let plantasFlorecidas = 9
    public static let metrosExterior = 15

    public static func resumen(_ plantas: [Planta], hoy: Date) -> ResumenCupo {
        let activas = plantas.filter { $0.estado == .activa }
        return ResumenCupo(
            activas: activas.count,
            enFlor: activas.filter { Etapas.etapa(de: $0, hoy: hoy).cuentaComoFlorecida }.count,
            secando: plantas.filter { $0.estado == .secando }.count,
            curando: plantas.filter { $0.estado == .curando }.count)
    }
}
