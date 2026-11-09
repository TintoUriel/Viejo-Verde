import Foundation

/// Dosis de la etiqueta de cada producto (ml por litro). Se editan en Ajustes; la app usa la MITAD.
public struct ConfigDosis: Codable, Equatable, Sendable {
    public var topVegEtiquetaMlPorLitro: Double
    public var topBloomEtiquetaMlPorLitro: Double

    public init(topVegEtiquetaMlPorLitro: Double = 2, topBloomEtiquetaMlPorLitro: Double = 2) {
        self.topVegEtiquetaMlPorLitro = topVegEtiquetaMlPorLitro
        self.topBloomEtiquetaMlPorLitro = topBloomEtiquetaMlPorLitro
    }

    public func etiqueta(_ f: Fertilizante) -> Double {
        f == .topVeg ? topVegEtiquetaMlPorLitro : topBloomEtiquetaMlPorLitro
    }
}

public struct Dosis: Equatable, Sendable {
    /// Agua para un riego, si la maceta está liviana.
    public let aguaML: Int
    /// Producto que corresponde en esta etapa (nil = solo agua).
    public let fertilizante: Fertilizante?
    /// Mililitros por litro que se usan (mitad de la etiqueta).
    public let mlPorLitro: Double
    /// Mililitros totales de fertilizante para esa agua.
    public let fertilizanteML: Double

    public var textoAgua: String { Formato.volumen(ml: aguaML) }

    /// Ej.: "1,5 ml de Top Veg en 1,5 L de agua".
    public var textoFertilizante: String? {
        guard let f = fertilizante else { return nil }
        return "\(Formato.numero(fertilizanteML)) ml de \(f.nombre) en \(textoAgua) de agua"
    }
}

public enum CalculoDosis {
    /// Qué producto toca en cada etapa.
    public static func fertilizante(para etapa: Etapa) -> Fertilizante? {
        switch etapa {
        case .crecimiento: .topVeg
        case .prefloracion, .floracion: .topBloom
        default: nil
        }
    }

    /// Agua por riego (cuando la maceta está liviana), pensada para tela de 20 L y escalada por litros.
    /// Plántula no escala: la raíz es chica sin importar la maceta.
    public static func aguaML(etapa: Etapa, diaEnEtapa: Int, litrosMaceta: Double) -> Int {
        let escala = max(litrosMaceta, 1) / 20
        let ml: Double
        switch etapa {
        case .plantula: ml = 100 + 15 * Double(min(max(diaEnEtapa, 0), 10))
        case .crecimiento: ml = min(750 + 60 * Double(max(diaEnEtapa, 0)), 2500) * escala
        case .prefloracion: ml = 2500 * escala
        case .floracion, .maduracion: ml = 3000 * escala
        case .listaCosecha: ml = 2500 * escala
        default: ml = 0
        }
        return Int((ml / 50).rounded()) * 50
    }

    public static func dosis(etapa: Etapa, diaEnEtapa: Int, litrosMaceta: Double, config: ConfigDosis) -> Dosis {
        let agua = aguaML(etapa: etapa, diaEnEtapa: diaEnEtapa, litrosMaceta: litrosMaceta)
        guard let f = fertilizante(para: etapa) else {
            return Dosis(aguaML: agua, fertilizante: nil, mlPorLitro: 0, fertilizanteML: 0)
        }
        let porLitro = config.etiqueta(f) / 2
        // Redondeado a medio ml (lo que se puede medir con una jeringa), mínimo 0,5.
        let total = max(((Double(agua) / 1000 * porLitro) * 2).rounded() / 2, 0.5)
        return Dosis(aguaML: agua, fertilizante: f, mlPorLitro: porLitro, fertilizanteML: total)
    }

    public static func dosis(de planta: Planta, hoy: Date, config: ConfigDosis) -> Dosis {
        let e = Etapas.estado(de: planta, hoy: hoy)
        return dosis(etapa: e.etapa, diaEnEtapa: e.diaEnEtapa, litrosMaceta: planta.litrosMaceta, config: config)
    }
}

/// Números a la argentina: coma decimal, sin ",0".
public enum Formato {
    public static func numero(_ x: Double) -> String {
        let redondeado = (x * 10).rounded() / 10
        if redondeado == redondeado.rounded() { return String(Int(redondeado)) }
        return String(format: "%.1f", redondeado).replacingOccurrences(of: ".", with: ",")
    }

    public static func volumen(ml: Int) -> String {
        ml < 1000 ? "\(ml) ml" : "\(numero(Double(ml) / 1000)) L"
    }

    /// "domingo 8 de noviembre".
    /// Armada a mano: no depende del idioma del teléfono (y DateFormatter se cae en Foundation de Windows).
    public static func fechaLarga(_ fecha: Date) -> String {
        let dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]
        let meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
                     "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
        let c = Calendario.cal.dateComponents([.weekday, .day, .month], from: fecha)
        let dia = dias[((c.weekday ?? 1) - 1) % 7]
        let mes = meses[((c.month ?? 1) - 1) % 12]
        return "\(dia) \(c.day ?? 1) de \(mes)"
    }

    /// "8/11/2026".
    public static func fechaCorta(_ fecha: Date) -> String {
        let c = Calendario.cal.dateComponents([.day, .month, .year], from: fecha)
        return "\(c.day ?? 0)/\(c.month ?? 0)/\(c.year ?? 0)"
    }
}
