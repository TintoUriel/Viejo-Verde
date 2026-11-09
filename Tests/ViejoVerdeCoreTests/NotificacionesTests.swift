import XCTest
@testable import ViejoVerdeCore

final class NotificacionesTests: XCTestCase {

    /// 20/11/2026 a las 8:00 (antes del resumen de las 9).
    let ahora = Calendario.fecha(2026, 11, 20, hora: 8)

    private func datos(_ plantas: [Planta], avisos: AjustesAvisos = AjustesAvisos()) -> Datos {
        Datos(plantas: plantas, avisos: avisos)
    }

    func testResumenDiarioALaHoraElegida() {
        let p = auto(dia: 15, registros: [reg(.riego, hace: 3)])
        let plan = PlanNotificaciones.planificar(datos: datos([p]), ahora: ahora)
        let resumenes = plan.filter { $0.id.contains("resumen") }
        XCTAssertEqual(resumenes.count, PlanNotificaciones.diasResumen)
        let primero = resumenes[0]
        XCTAssertEqual(Calendario.cal.component(.hour, from: primero.fecha), 9)
        XCTAssertTrue(Calendario.mismoDia(primero.fecha, ahora))
        XCTAssertTrue(primero.cuerpo.contains("Top Veg"))
        XCTAssertTrue(plan.allSatisfy { $0.id.hasPrefix("vv-") })
    }

    func testSiYaPasoLaHoraArrancaManiana() {
        let tarde = Calendario.fecha(2026, 11, 20, hora: 10)
        let p = auto(dia: 15, registros: [reg(.riego, hace: 3)])
        let resumenes = PlanNotificaciones.planificar(datos: datos([p]), ahora: tarde).filter { $0.id.contains("resumen") }
        XCTAssertFalse(resumenes.contains { Calendario.mismoDia($0.fecha, tarde) })
        XCTAssertEqual(resumenes.count, PlanNotificaciones.diasResumen - 1)
    }

    func testHoraPersonalizada() {
        let p = auto(dia: 15, registros: [reg(.riego, hace: 3)])
        let a = AjustesAvisos(hora: 19, minuto: 30)
        let primero = PlanNotificaciones.planificar(datos: datos([p], avisos: a), ahora: ahora).first { $0.id.contains("resumen") }
        XCTAssertEqual(Calendario.cal.component(.hour, from: primero!.fecha), 19)
        XCTAssertEqual(Calendario.cal.component(.minute, from: primero!.fecha), 30)
    }

    func testSinTareasNoHayResumen() {
        XCTAssertTrue(PlanNotificaciones.planificar(datos: datos([]), ahora: ahora).isEmpty)
    }

    func testApagadas() {
        let p = auto(dia: 15)
        XCTAssertTrue(PlanNotificaciones.planificar(datos: datos([p], avisos: AjustesAvisos(activos: false)), ahora: ahora).isEmpty)
        let soloPuntuales = PlanNotificaciones.planificar(datos: datos([p], avisos: AjustesAvisos(resumenDiario: false)), ahora: ahora)
        XCTAssertFalse(soloPuntuales.contains { $0.id.contains("resumen") })
        XCTAssertFalse(soloPuntuales.isEmpty)
    }

    func testPuntualesDeUnaRegular() {
        // Día 15 hoy: sexado el día 21 (en 6 días), Top Bloom el 21, tricomas el 70.
        let p = auto(dia: 15, semilla: .regular)
        let plan = PlanNotificaciones.planificar(datos: datos([p], avisos: AjustesAvisos(resumenDiario: false)), ahora: ahora)
        let sexado = plan.first { $0.id.contains("sexado") }
        XCTAssertNotNil(sexado)
        XCTAssertEqual(Calendario.dias(desde: ahora, hasta: sexado!.fecha), 6)
        XCTAssertNotNil(plan.first { $0.id.contains("topbloom") })
        XCTAssertNotNil(plan.first { $0.id.contains("tricomas") })
    }

    func testPuntualesPasadasNoSeProgramanYMachoNoPideTricomas() {
        let macho = auto(dia: 40, semilla: .regular, sexo: .macho, ubicacion: .interior)
        let plan = PlanNotificaciones.planificar(datos: datos([macho], avisos: AjustesAvisos(resumenDiario: false)), ahora: ahora)
        XCTAssertFalse(plan.contains { $0.id.contains("sexado") })
        XCTAssertFalse(plan.contains { $0.id.contains("tricomas") })
        XCTAssertFalse(plan.contains { $0.id.contains("topbloom") })
    }

    func testPuntualesDeSecadoYCurado() {
        var s = auto(dia: 100, nombre: "Seca")
        s.estado = .secando
        s.cosecha = Cosecha(fecha: hace(2), gramosHumedos: 100)
        var c = auto(dia: 120, nombre: "Cura")
        c.estado = .curando
        c.cosecha = Cosecha(fecha: hace(20), gramosHumedos: 100, fechaFrascos: hace(0), gramosSecos: 25)
        let plan = PlanNotificaciones.planificar(datos: datos([s, c], avisos: AjustesAvisos(resumenDiario: false)), ahora: ahora)
        let tallitos = plan.first { $0.id.contains("tallitos") }
        XCTAssertEqual(Calendario.dias(desde: ahora, hasta: tallitos!.fecha), 5)
        XCTAssertNotNil(plan.first { $0.id.contains("-frascos-") })
        XCTAssertNotNil(plan.first { $0.id.contains("curado") })
    }

    func testOrdenadasYConTope() {
        let plantas = (0..<40).map { auto(dia: 5, semilla: .regular, nombre: "P\($0)") }
        let plan = PlanNotificaciones.planificar(datos: datos(plantas), ahora: ahora)
        XCTAssertLessThanOrEqual(plan.count, PlanNotificaciones.maximo)
        XCTAssertEqual(plan.map(\.fecha), plan.map(\.fecha).sorted())
        XCTAssertEqual(Set(plan.map(\.id)).count, plan.count)
    }
}
