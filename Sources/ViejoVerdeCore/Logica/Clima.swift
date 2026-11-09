import Foundation

// MARK: - Pronóstico

public struct DiaClima: Codable, Equatable, Sendable {
    /// "2026-11-08" (hora de Buenos Aires).
    public let fecha: String
    public let lluviaMM: Double
    public let probLluvia: Int?
    public let maxC: Double?
    public let minC: Double?
    /// Humedad relativa promedio del día (%).
    public let humedad: Double?

    public init(fecha: String, lluviaMM: Double, probLluvia: Int? = nil, maxC: Double? = nil,
                minC: Double? = nil, humedad: Double? = nil) {
        self.fecha = fecha
        self.lluviaMM = lluviaMM
        self.probLluvia = probLluvia
        self.maxC = maxC
        self.minC = minC
        self.humedad = humedad
    }
}

public struct Pronostico: Codable, Equatable, Sendable {
    public let dias: [DiaClima]
    public let actualizado: Date

    public init(dias: [DiaClima], actualizado: Date) {
        self.dias = dias
        self.actualizado = actualizado
    }

    public func dia(_ fecha: Date) -> DiaClima? {
        let clave = Calendario.claveDia(fecha)
        return dias.first { $0.fecha == clave }
    }

    public func dia(_ desplazamiento: Int, de fecha: Date) -> DiaClima? {
        dia(Calendario.sumarDias(desplazamiento, a: fecha))
    }
}

/// Open-Meteo: gratis y sin clave. Coordenadas de CABA.
public enum OpenMeteo {
    public static let url = URL(string:
        "https://api.open-meteo.com/v1/forecast?latitude=-34.6037&longitude=-58.3816"
        + "&daily=precipitation_sum,precipitation_probability_max,temperature_2m_max,temperature_2m_min"
        + "&hourly=relative_humidity_2m&past_days=2&forecast_days=5"
        + "&timezone=America%2FArgentina%2FBuenos_Aires")!

    struct Respuesta: Decodable {
        struct Diario: Decodable {
            let time: [String]
            let precipitation_sum: [Double?]?
            let precipitation_probability_max: [Double?]?
            let temperature_2m_max: [Double?]?
            let temperature_2m_min: [Double?]?
        }
        struct Horario: Decodable {
            let time: [String]
            let relative_humidity_2m: [Double?]?
        }
        let daily: Diario
        let hourly: Horario?
    }

    public static func leer(_ data: Data, ahora: Date) throws -> Pronostico {
        let r = try JSONDecoder().decode(Respuesta.self, from: data)
        var humedades: [String: [Double]] = [:]
        if let h = r.hourly, let valores = h.relative_humidity_2m {
            for (i, t) in h.time.enumerated() where i < valores.count {
                if let v = valores[i] { humedades[String(t.prefix(10)), default: []].append(v) }
            }
        }
        let d = r.daily
        let dias = d.time.enumerated().map { i, fecha in
            DiaClima(fecha: fecha,
                     lluviaMM: valor(d.precipitation_sum, i) ?? 0,
                     probLluvia: valor(d.precipitation_probability_max, i).map { Int($0.rounded()) },
                     maxC: valor(d.temperature_2m_max, i),
                     minC: valor(d.temperature_2m_min, i),
                     humedad: humedades[fecha].map { $0.reduce(0, +) / Double($0.count) })
        }
        return Pronostico(dias: dias, actualizado: ahora)
    }

    static func valor(_ a: [Double?]?, _ i: Int) -> Double? {
        guard let a, i < a.count else { return nil }
        return a[i]
    }
}

// MARK: - Análisis para el patio

public enum TipoAvisoClima: String, Sendable {
    case lluvia, llovio, calor, frio, hongos
}

public struct AvisoClima: Identifiable, Equatable, Sendable {
    public var id: String { tipo.rawValue }
    public let tipo: TipoAvisoClima
    public let titulo: String
    public let texto: String
}

public enum AnalisisClima {
    /// Con esta lluvia (mm) las macetas del patio quedan regadas.
    public static let lluviaQueRiega = 5.0
    public static let calorFuerte = 32.0
    public static let nocheFria = 5.0
    public static let humedadHongos = 80.0
    /// Desde esta probabilidad se toma en serio el pronóstico de lluvia.
    public static let probLluviaSeria = 60

    public static func lluviaAyer(_ p: Pronostico?, hoy: Date) -> Double {
        p?.dia(-1, de: hoy)?.lluviaMM ?? 0
    }

    /// Lluvia pronosticada para hoy, si es probable.
    public static func lluviaHoyProbable(_ p: Pronostico?, hoy: Date) -> Double? {
        guard let d = p?.dia(hoy), d.lluviaMM >= lluviaQueRiega, (d.probLluvia ?? 100) >= probLluviaSeria else { return nil }
        return d.lluviaMM
    }

    public static func hayCalor(_ p: Pronostico?, hoy: Date) -> Bool {
        (p?.dia(hoy)?.maxC ?? 0) >= calorFuerte
    }

    /// Humedad alta o lluvia ayer u hoy: condiciones para hongos en cogollos.
    public static func riesgoHongos(_ p: Pronostico?, hoy: Date) -> Bool {
        guard let p else { return false }
        return [p.dia(-1, de: hoy), p.dia(hoy)].contains { d in
            guard let d else { return false }
            return (d.humedad ?? 0) >= humedadHongos || d.lluviaMM >= lluviaQueRiega
        }
    }

    public static func avisos(_ p: Pronostico?, plantas: [Planta], hoy: Date) -> [AvisoClima] {
        guard let p, let h = p.dia(hoy) else { return [] }
        let patio = plantas.filter { $0.estado == .activa && $0.ubicacion == .patio }
        var r: [AvisoClima] = []

        if let mm = lluviaHoyProbable(p, hoy: hoy) {
            r.append(AvisoClima(tipo: .lluvia, titulo: "Lluvia hoy: \(Formato.numero(mm)) mm",
                                texto: "Las del patio no necesitan riego. Si viene fuerte, protegé las plántulas."))
        } else if lluviaAyer(p, hoy: hoy) >= lluviaQueRiega {
            r.append(AvisoClima(tipo: .llovio, titulo: "Ayer llovieron \(Formato.numero(lluviaAyer(p, hoy: hoy))) mm",
                                texto: "Las macetas del patio deberían estar húmedas: levantalas antes de regar."))
        }
        if let max = h.maxC, max >= calorFuerte {
            r.append(AvisoClima(tipo: .calor, titulo: "Calor fuerte: \(Formato.numero(max)) °C",
                                texto: "Regá temprano o al atardecer. Las macetas de tela se secan rápido: fijate todos los días."))
        }
        if let min = h.minC, min <= nocheFria,
           patio.contains(where: { Etapas.etapa(de: $0, hoy: hoy) == .plantula }) {
            r.append(AvisoClima(tipo: .frio, titulo: "Noche fría: \(Formato.numero(min)) °C",
                                texto: "Entrá las plántulas a la noche."))
        }
        let enFlor: Set<Etapa> = [.floracion, .maduracion, .listaCosecha]
        if riesgoHongos(p, hoy: hoy),
           patio.contains(where: { $0.sexo != .macho && enFlor.contains(Etapas.etapa(de: $0, hoy: hoy)) }) {
            r.append(AvisoClima(tipo: .hongos, titulo: "Riesgo de hongos",
                                texto: "Humedad alta: abrí un poco los cogollos más gordos y buscá partes marrones o pelusa gris."))
        }
        return r
    }

    /// Una línea para el contexto del asistente.
    public static func resumen(_ p: Pronostico?, hoy: Date) -> String? {
        guard let p, let h = p.dia(hoy) else { return nil }
        var partes: [String] = []
        if let max = h.maxC, let min = h.minC { partes.append("hoy \(Formato.numero(min))–\(Formato.numero(max)) °C") }
        partes.append("lluvia hoy \(Formato.numero(h.lluviaMM)) mm" + (h.probLluvia.map { " (\($0) %)" } ?? ""))
        if let hum = h.humedad { partes.append("humedad \(Int(hum.rounded())) %") }
        partes.append("lluvia ayer \(Formato.numero(lluviaAyer(p, hoy: hoy))) mm")
        if let m = p.dia(1, de: hoy) {
            partes.append("mañana \(Formato.numero(m.lluviaMM)) mm" + (m.maxC.map { ", máx \(Formato.numero($0)) °C" } ?? ""))
        }
        return "Clima en CABA: " + partes.joined(separator: "; ") + "."
    }
}
