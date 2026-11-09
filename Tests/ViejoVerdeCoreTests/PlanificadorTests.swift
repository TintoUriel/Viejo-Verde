import XCTest
@testable import ViejoVerdeCore

final class PlanificadorTests: XCTestCase {

    func testFechasClaveDeUnaAuto() {
        let germ = f(2026, 11, 20)
        let f2 = Planificador.fechasClave(tipo: .auto, germinacion: germ)
        XCTAssertEqual(f2.map(\.etapa), Etapa.deCultivo)
        XCTAssertEqual(f2[3].fecha, Calendario.sumarDias(35, a: germ))  // floración
        XCTAssertEqual(Planificador.cosechaEstimada(tipo: .auto, germinacion: germ), Calendario.sumarDias(84, a: germ))
    }

    func testCosechaEstimadaDeFotoEsEl25DeAbril() {
        let c = Planificador.cosechaEstimada(tipo: .foto, germinacion: f(2026, 10, 1))
        XCTAssertTrue(Calendario.mismoDia(c, f(2027, 4, 25)))
    }

    func testProyeccionCuentaFloracionYSuponeCosecha() {
        // Auto en día 30: entra en flor el día 35 (en 5 días) y se asume cosechada al día 98.
        let p = auto(dia: 30)
        let proy = Planificador.proyeccion(plantas: [p], desde: hoyTest, semanas: 12)
        XCTAssertEqual(proy[0].actuales, 1)   // los días 35+ caen en la primera semana
        XCTAssertEqual(proy[8].actuales, 1)   // día 86–92: lista para cosecha
        XCTAssertEqual(proy[10].actuales, 0)  // día 100+: cosechada
        XCTAssertTrue(proy.allSatisfy { !$0.excedida })
    }

    func testPlantaPasadaSeAsumeCosechadaEnUnaSemana() {
        let p = auto(dia: 150)  // ya debería estar cosechada
        let proy = Planificador.proyeccion(plantas: [p], desde: hoyTest, semanas: 3)
        XCTAssertEqual(proy.map(\.actuales), [1, 0, 0])
    }

    func testDetectaQueTePasasDelCupo() {
        let actuales = (0..<7).map { _ in auto(dia: 20) }   // 7 que florecen pronto
        let nuevas = Planificador.hipoteticas(tipo: .auto, cantidad: 4, germinacion: hoyTest)
        let proy = Planificador.proyeccion(plantas: actuales, nuevas: nuevas, desde: hoyTest)
        let excedida = Planificador.primeraExcedida(proy)
        XCTAssertNotNil(excedida)
        XCTAssertEqual(excedida?.total, 11)
        XCTAssertEqual(excedida?.nuevas, 4)
    }

    func testLugarLibre() {
        let actuales = (0..<7).map { _ in auto(dia: 20) }
        XCTAssertEqual(Planificador.lugarLibre(plantas: actuales, tipo: .auto, germinacion: hoyTest, hoy: hoyTest), 2)
        XCTAssertEqual(Planificador.lugarLibre(plantas: [], tipo: .auto, germinacion: hoyTest, hoy: hoyTest), 9)
        // Si las actuales ya están cosechadas cuando florecen las nuevas, hay lugar para 9.
        let viejas = (0..<9).map { _ in auto(dia: 80) }
        let dentroDeUnMes = Calendario.sumarDias(30, a: hoyTest)
        XCTAssertEqual(Planificador.lugarLibre(plantas: viejas, tipo: .auto, germinacion: dentroDeUnMes, hoy: hoyTest), 9)
    }

    func testNoCuentaLasQueNoEstanActivas() {
        var p = auto(dia: 40)
        p.estado = .secando
        XCTAssertEqual(Planificador.proyeccion(plantas: [p], desde: hoyTest, semanas: 1)[0].actuales, 0)
    }
}
