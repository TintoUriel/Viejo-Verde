import XCTest
@testable import ViejoVerdeCore

final class TareasTests: XCTestCase {

    private func tareas(_ plantas: [Planta], paquetes: [PaqueteSemillas] = [],
                        pospuestas: [String: Date] = [:]) -> [Tarea] {
        Tareas.generar(plantas: plantas, paquetes: paquetes, hoy: hoyTest, pospuestas: pospuestas)
    }

    private func tipos(_ p: Planta, paquetes: [PaqueteSemillas] = []) -> Set<TipoTarea> {
        Set(tareas([p], paquetes: paquetes).map(\.tipo))
    }

    // MARK: Riego y fertilizante

    func testRiegoA2Dias() {
        let p = auto(dia: 15, registros: [reg(.riego, hace: 2), reg(.fertilizante, hace: 3, producto: "Top Veg")])
        let t = tipos(p)
        XCTAssertTrue(t.contains(.riego))
        XCTAssertFalse(t.contains(.fertilizante))
    }

    func testSinRiegoSiRegoAyer() {
        let p = auto(dia: 15, registros: [reg(.riego, hace: 1)])
        let t = tipos(p)
        XCTAssertFalse(t.contains(.riego))
        XCTAssertFalse(t.contains(.fertilizante))
    }

    func testFertilizarReemplazaAlRiego() {
        let p = auto(dia: 15, registros: [reg(.riego, hace: 3)])
        let t = tareas([p])
        let fert = t.first { $0.tipo == .fertilizante }
        XCTAssertNotNil(fert)
        XCTAssertEqual(fert?.dosis?.fertilizante, .topVeg)
        XCTAssertTrue(fert?.detalle.contains("mitad de la dosis") ?? false)
        XCTAssertEqual(fert?.acciones.first, .fertilice)
        XCTAssertFalse(t.contains { $0.tipo == .riego })
    }

    func testFertilizanteCuentaComoRiego() {
        let p = auto(dia: 15, registros: [reg(.fertilizante, hace: 1, producto: "Top Veg")])
        XCTAssertFalse(tipos(p).contains(.riego))
    }

    func testTopBloomEnFloracionCada6Dias() {
        let a = auto(dia: 40, registros: [reg(.riego, hace: 2), reg(.fertilizante, hace: 6)])
        XCTAssertEqual(tareas([a]).first { $0.tipo == .fertilizante }?.dosis?.fertilizante, .topBloom)

        let b = auto(dia: 40, registros: [reg(.riego, hace: 2), reg(.fertilizante, hace: 5)])
        XCTAssertFalse(tipos(b).contains(.fertilizante))
        XCTAssertTrue(tipos(b).contains(.riego))
    }

    func testTopBloomEnPrefloracion() {
        let p = auto(dia: 25, registros: [reg(.riego, hace: 2)])
        XCTAssertEqual(tareas([p]).first { $0.tipo == .fertilizante }?.dosis?.fertilizante, .topBloom)
    }

    func testPlantulaSoloAgua() {
        let p = auto(dia: 5, registros: [reg(.riego, hace: 2)])
        let t = tareas([p])
        XCTAssertFalse(t.contains { $0.tipo == .fertilizante })
        XCTAssertFalse(t.contains { $0.tipo == .neem })
        let riego = t.first { $0.tipo == .riego }
        XCTAssertTrue(riego?.detalle.contains("sin fertilizante") ?? false)
        XCTAssertEqual(riego?.dosis?.aguaML, 200)  // 100 + 15×5 = 175 → 200
    }

    func testMaduracionSoloAgua() {
        let p = auto(dia: 75, registros: [reg(.riego, hace: 2), reg(.fertilizante, hace: 20)])
        let t = tareas([p])
        XCTAssertFalse(t.contains { $0.tipo == .fertilizante })
        XCTAssertTrue(t.first { $0.tipo == .riego }?.detalle.contains("Solo agua") ?? false)
    }

    func testPrimerRiegoCuentaDesdeLaGerminacion() {
        XCTAssertFalse(tipos(auto(dia: 1)).contains(.riego))
        XCTAssertTrue(tipos(auto(dia: 2)).contains(.riego))
    }

    // MARK: Neem

    func testNeemSemanalEnCrecimiento() {
        XCTAssertTrue(tipos(auto(dia: 15)).contains(.neem))
        XCTAssertTrue(tipos(auto(dia: 15, registros: [reg(.neem, hace: 7)])).contains(.neem))
        XCTAssertFalse(tipos(auto(dia: 15, registros: [reg(.neem, hace: 3)])).contains(.neem))
        XCTAssertTrue(tipos(auto(dia: 25)).contains(.neem))  // prefloración
    }

    func testNuncaNeemEnFloracion() {
        XCTAssertFalse(tipos(auto(dia: 40)).contains(.neem))
        XCTAssertFalse(tipos(auto(dia: 75)).contains(.neem))
    }

    // MARK: Sexado y macho

    func testSexadoDeRegularesDesdeElDia21() {
        XCTAssertTrue(tipos(auto(dia: 21, semilla: .regular)).contains(.sexado))
        XCTAssertFalse(tipos(auto(dia: 20, semilla: .regular)).contains(.sexado))
        XCTAssertFalse(tipos(auto(dia: 25, semilla: .feminizada)).contains(.sexado))
        XCTAssertFalse(tipos(auto(dia: 25, semilla: .regular, sexo: .hembra)).contains(.sexado))
        let acciones = tareas([auto(dia: 21, semilla: .regular)]).first { $0.tipo == .sexado }?.acciones
        XCTAssertEqual(acciones, [.hembra, .macho])
    }

    func testMachoEnElPatioEsUrgenteYVaPrimero() {
        let macho = auto(dia: 27, semilla: .regular, sexo: .macho, ubicacion: .patio, nombre: "Zeta")
        let otra = auto(dia: 15, nombre: "Alfa")
        let t = tareas([otra, macho])
        XCTAssertEqual(t.first?.tipo, .machoPatio)
        XCTAssertTrue(t.first?.urgente ?? false)
        XCTAssertEqual(t.first?.acciones, [.moverAdentro])
    }

    func testMachoAdentroPideJuntarPolen() {
        var m = auto(dia: 30, semilla: .regular, sexo: .macho, ubicacion: .interior)
        XCTAssertTrue(tipos(m).contains(.machoPolen))
        XCTAssertFalse(tipos(m).contains(.machoPatio))
        m.polenJuntado = true
        XCTAssertFalse(tipos(m).contains(.machoPolen))
    }

    func testMachoNoPideCosecha() {
        let m = auto(dia: 75, semilla: .regular, sexo: .macho, ubicacion: .interior)
        XCTAssertFalse(tipos(m).contains(.cosecha))
    }

    // MARK: Semillas y cosecha

    func testSemillas35DiasDespuesDePolinizar() {
        var p = auto(dia: 70)
        p.fechaPolinizacion = hace(35)
        XCTAssertTrue(tipos(p).contains(.semillas))
        p.fechaPolinizacion = hace(34)
        XCTAssertFalse(tipos(p).contains(.semillas))

        p.fechaPolinizacion = hace(40)
        let pack = PaqueteSemillas(nombre: "x", banco: "Propias", tipo: .auto, semilla: .regular, cantidad: 10,
                                   fechaCompra: hoyTest, propias: true, plantaMadreID: p.id)
        XCTAssertFalse(tipos(p, paquetes: [pack]).contains(.semillas))
    }

    func testCosechaEnMaduracionYUrgenteAlFinal() {
        let mad = tareas([auto(dia: 75)]).first { $0.tipo == .cosecha }
        XCTAssertNotNil(mad)
        XCTAssertFalse(mad?.urgente ?? true)
        let lista = tareas([auto(dia: 90)]).first { $0.tipo == .cosecha }
        XCTAssertTrue(lista?.urgente ?? false)
        XCTAssertFalse(tipos(auto(dia: 50)).contains(.cosecha))
    }

    // MARK: Secado y curado

    func testSecadoDesdeElDia7() {
        var p = auto(dia: 100)
        p.estado = .secando
        p.cosecha = Cosecha(fecha: hace(7), gramosHumedos: 150)
        XCTAssertEqual(tareas([p]).map(\.tipo), [.secado])
        p.cosecha = Cosecha(fecha: hace(6), gramosHumedos: 150)
        XCTAssertTrue(tareas([p]).isEmpty)
    }

    private func curando(frascosHace dias: Int, aperturas: [Int] = []) -> Planta {
        var p = auto(dia: 120, registros: aperturas.map { reg(.curado, hace: $0) })
        p.estado = .curando
        p.cosecha = Cosecha(fecha: hace(dias + 10), gramosHumedos: 200, fechaFrascos: hace(dias), gramosSecos: 50)
        return p
    }

    func testCuradoPrimerasDosSemanasTodosLosDias() {
        XCTAssertEqual(tareas([curando(frascosHace: 3)]).first?.acciones, [.abriFrascos])
        XCTAssertTrue(tareas([curando(frascosHace: 3, aperturas: [0])]).isEmpty)
        XCTAssertFalse(tareas([curando(frascosHace: 3, aperturas: [1])]).isEmpty)
    }

    func testCuradoSemanas3y4CadaDosOTresDias() {
        XCTAssertTrue(tareas([curando(frascosHace: 20, aperturas: [1])]).isEmpty)
        XCTAssertFalse(tareas([curando(frascosHace: 20, aperturas: [2])]).isEmpty)
        XCTAssertFalse(tareas([curando(frascosHace: 20)]).isEmpty)
    }

    func testCuradoCompletoAlDia28() {
        let t = tareas([curando(frascosHace: 28, aperturas: [0])])
        XCTAssertEqual(t.first?.acciones, [.terminar])
    }

    func testAperturasDeAntesDeLosFrascosNoCuentan() {
        // Un registro "curado" viejo (de otra cosecha) no tapa la tarea.
        XCTAssertFalse(tareas([curando(frascosHace: 3, aperturas: [10])]).isEmpty)
    }

    // MARK: General

    func testHoyNoOcultaSoloPorHoy() {
        let p = auto(dia: 5, registros: [reg(.riego, hace: 3)])
        let id = Tarea.id(.riego, p.id)
        XCTAssertFalse(tareas([p], pospuestas: [id: hoyTest]).contains { $0.tipo == .riego })
        XCTAssertTrue(tareas([p], pospuestas: [id: hace(1)]).contains { $0.tipo == .riego })
    }

    func testTerminadasNoGeneranTareas() {
        var p = auto(dia: 150)
        p.estado = .terminada
        XCTAssertTrue(tareas([p]).isEmpty)
        p.estado = .descartada
        XCTAssertTrue(tareas([p]).isEmpty)
    }
}
