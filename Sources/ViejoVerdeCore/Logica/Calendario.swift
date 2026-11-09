import Foundation

/// Todo se cuenta en días calendario con la hora de Buenos Aires, sin importar la zona del teléfono.
public enum Calendario {
    public static let zona: TimeZone =
        TimeZone(identifier: "America/Argentina/Buenos_Aires") ?? TimeZone(secondsFromGMT: -3 * 3600)!

    public static let cal: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = zona
        c.locale = Locale(identifier: "es_AR")
        return c
    }()

    public static func inicioDelDia(_ fecha: Date) -> Date { cal.startOfDay(for: fecha) }

    /// Días calendario entre dos fechas (puede ser negativo).
    public static func dias(desde: Date, hasta: Date) -> Int {
        cal.dateComponents([.day], from: inicioDelDia(desde), to: inicioDelDia(hasta)).day ?? 0
    }

    public static func fecha(_ anio: Int, _ mes: Int, _ dia: Int, hora: Int = 12, minuto: Int = 0) -> Date {
        cal.date(from: DateComponents(year: anio, month: mes, day: dia, hour: hora, minute: minuto))!
    }

    public static func sumarDias(_ n: Int, a fecha: Date) -> Date {
        cal.date(byAdding: .day, value: n, to: fecha)!
    }

    public static func mismoDia(_ a: Date, _ b: Date) -> Bool { cal.isDate(a, inSameDayAs: b) }

    public static func mes(_ fecha: Date) -> Int { cal.component(.month, from: fecha) }
    public static func anio(_ fecha: Date) -> Int { cal.component(.year, from: fecha) }

    /// Clave de día "2026-11-08", para cosas que valen solo por hoy.
    public static func claveDia(_ fecha: Date) -> String {
        let c = cal.dateComponents([.year, .month, .day], from: fecha)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }
}
