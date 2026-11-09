import XCTest
@testable import ViejoVerdeCore

final class EtapasTests: XCTestCase {

    // MARK: Automáticas

    func testAutomaticasPorDia() {
        let germ = f(2026, 11, 1)
        let casos: [(Int, Etapa)] = [
            (0, .plantula), (9, .plantula),
            (10, .crecimiento), (20, .crecimiento),
            (21, .prefloracion), (34, .prefloracion),
            (35, .floracion), (69, .floracion),
            (70, .maduracion), (83, .maduracion),
            (84, .listaCosecha), (200, .listaCosecha),
        ]
        let p = Planta(nombre: "A", variedad: "", tipo: .auto, semilla: .feminizada, fechaGerminacion: germ)
        for (dia, esperada) in casos {
            let e = Etapas.estado(de: p, hoy: Calendario.sumarDias(dia, a: germ))
            XCTAssertEqual(e.etapa, esperada, "día \(dia)")
            XCTAssertEqual(e.dia, dia)
        }
    }

    func testDiaEnEtapaYSemana() {
        let germ = f(2026, 11, 1)
        let p = Planta(nombre: "A", variedad: "", tipo: .auto, semilla: .feminizada, fechaGerminacion: germ)
        let e = Etapas.estado(de: p, hoy: Calendario.sumarDias(23, a: germ))
        XCTAssertEqual(e.diaEnEtapa, 2)  // prefloración empieza el 21
        XCTAssertEqual(e.semana, 4)
        XCTAssertEqual(Etapas.estado(de: p, hoy: germ).semana, 1)
        XCTAssertEqual(Etapas.estado(de: p, hoy: Calendario.sumarDias(6, a: germ)).semana, 1)
        XCTAssertEqual(Etapas.estado(de: p, hoy: Calendario.sumarDias(7, a: germ)).semana, 2)
    }

    func testAntesDeGerminarEsPlantula() {
        let p = Planta(nombre: "A", variedad: "", tipo: .auto, semilla: .feminizada, fechaGerminacion: f(2026, 11, 10))
        XCTAssertEqual(Etapas.etapa(de: p, hoy: f(2026, 11, 8)), .plantula)
    }

    func testCuentaDiasEnHoraDeBuenosAires() {
        let germ = Calendario.fecha(2026, 11, 1, hora: 23, minuto: 30)
        let hoy = Calendario.fecha(2026, 11, 2, hora: 0, minuto: 30)
        let p = Planta(nombre: "A", variedad: "", tipo: .auto, semilla: .feminizada, fechaGerminacion: germ)
        XCTAssertEqual(Etapas.estado(de: p, hoy: hoy).dia, 1)
    }

    func testTramosAutomaticas() {
        let t = Etapas.tramos(tipo: .auto, germinacion: f(2026, 11, 1))
        XCTAssertEqual(t.map(\.etapa), Etapa.deCultivo)
        XCTAssertEqual(t.map(\.desdeDia), [0, 10, 21, 35, 70, 84])
        XCTAssertEqual(t.last?.hastaDia, 98)
    }

    // MARK: Fotoperiódicas

    func testFotoperiodicaTemporadaCompleta() {
        let p = Planta(nombre: "F", variedad: "", tipo: .foto, semilla: .feminizada, fechaGerminacion: f(2026, 10, 1))
        let casos: [(Date, Etapa)] = [
            (f(2026, 10, 5), .plantula),
            (f(2026, 10, 11), .crecimiento),
            (f(2026, 12, 15), .crecimiento),
            (f(2027, 1, 24), .crecimiento),
            (f(2027, 1, 25), .prefloracion),
            (f(2027, 2, 19), .prefloracion),
            (f(2027, 2, 20), .floracion),
            (f(2027, 4, 4), .floracion),
            (f(2027, 4, 5), .maduracion),
            (f(2027, 4, 24), .maduracion),
            (f(2027, 4, 25), .listaCosecha),
            (f(2027, 6, 1), .listaCosecha),
        ]
        for (hoy, esperada) in casos {
            XCTAssertEqual(Etapas.etapa(de: p, hoy: hoy), esperada, "\(Calendario.claveDia(hoy))")
        }
    }

    func testFotoGerminadaEnJulioTerminaElAnioSiguiente() {
        let germ = f(2026, 7, 1)
        let p = Planta(nombre: "F", variedad: "", tipo: .foto, semilla: .feminizada, fechaGerminacion: germ)
        XCTAssertEqual(Etapas.etapa(de: p, hoy: f(2026, 12, 31)), .crecimiento)
        XCTAssertEqual(Etapas.etapa(de: p, hoy: f(2027, 1, 1)), .crecimiento)
        let t = Etapas.tramos(de: p)
        XCTAssertEqual(t[1].hastaDia, Calendario.dias(desde: germ, hasta: f(2027, 1, 25)))
    }

    func testFotoPlantulaRespetaLosPrimeros10Dias() {
        // Germinó el 20/01: el 25/01 sigue siendo plántula, después ya es prefloración.
        let p = Planta(nombre: "F", variedad: "", tipo: .foto, semilla: .feminizada, fechaGerminacion: f(2027, 1, 20))
        XCTAssertEqual(Etapas.etapa(de: p, hoy: f(2027, 1, 25)), .plantula)
        XCTAssertEqual(Etapas.etapa(de: p, hoy: f(2027, 1, 29)), .plantula)  // día 9
        XCTAssertEqual(Etapas.etapa(de: p, hoy: f(2027, 1, 30)), .prefloracion)  // día 10
        XCTAssertEqual(Etapas.tramos(de: p)[1].duracion, 0)  // sin crecimiento
    }

    func testFotoGerminadaEnMarzoMismaTemporada() {
        let p = Planta(nombre: "F", variedad: "", tipo: .foto, semilla: .feminizada, fechaGerminacion: f(2027, 3, 1))
        XCTAssertEqual(Etapas.etapa(de: p, hoy: f(2027, 3, 5)), .plantula)
        XCTAssertEqual(Etapas.etapa(de: p, hoy: f(2027, 3, 15)), .floracion)
        XCTAssertEqual(Etapas.etapa(de: p, hoy: f(2027, 4, 10)), .maduracion)
    }

    // MARK: Estados no activos

    func testEstadosPostCosecha() {
        var p = auto(dia: 100)
        p.estado = .secando
        p.cosecha = Cosecha(fecha: hace(5), gramosHumedos: 100)
        var e = Etapas.estado(de: p, hoy: hoyTest)
        XCTAssertEqual(e.etapa, .secado)
        XCTAssertEqual(e.diaEnEtapa, 5)

        p.estado = .curando
        p.cosecha?.fechaFrascos = hace(2)
        e = Etapas.estado(de: p, hoy: hoyTest)
        XCTAssertEqual(e.etapa, .curado)
        XCTAssertEqual(e.diaEnEtapa, 2)

        p.estado = .terminada
        XCTAssertEqual(Etapas.etapa(de: p, hoy: hoyTest), .terminada)
        p.estado = .descartada
        XCTAssertEqual(Etapas.etapa(de: p, hoy: hoyTest), .descartada)
    }

    func testTodasLasEtapasTienenConsejos() {
        for e in Etapa.allCases { XCTAssertFalse(e.consejos.isEmpty, e.nombre) }
    }
}
