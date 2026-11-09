import XCTest
@testable import ViejoVerdeCore

final class ClimaTests: XCTestCase {

    /// Pronóstico alrededor de hoyTest (20/11/2026): ayer, hoy, mañana.
    private func pronostico(ayer: DiaClima? = nil, hoy: DiaClima? = nil, maniana: DiaClima? = nil) -> Pronostico {
        func d(_ base: DiaClima?, _ fecha: String) -> DiaClima {
            DiaClima(fecha: fecha, lluviaMM: base?.lluviaMM ?? 0, probLluvia: base?.probLluvia,
                     maxC: base?.maxC ?? 25, minC: base?.minC ?? 15, humedad: base?.humedad ?? 60)
        }
        return Pronostico(dias: [d(ayer, "2026-11-19"), d(hoy, "2026-11-20"), d(maniana, "2026-11-21")],
                          actualizado: hoyTest)
    }

    private func tipos(_ p: Planta, _ clima: Pronostico?) -> Set<TipoTarea> {
        Set(Tareas.generar(plantas: [p], hoy: hoyTest, clima: clima).map(\.tipo))
    }

    // MARK: Open-Meteo

    func testLeeRespuestaDeOpenMeteo() throws {
        let json = """
        {"latitude":-34.6,"longitude":-58.4,
         "daily":{"time":["2026-11-19","2026-11-20"],"precipitation_sum":[12.4,0.0],
                  "precipitation_probability_max":[90,null],"temperature_2m_max":[24.1,33.5],
                  "temperature_2m_min":[16.0,null]},
         "hourly":{"time":["2026-11-19T00:00","2026-11-19T12:00","2026-11-20T00:00"],
                   "relative_humidity_2m":[90,70,null]}}
        """
        let p = try OpenMeteo.leer(Data(json.utf8), ahora: hoyTest)
        XCTAssertEqual(p.dias.count, 2)
        XCTAssertEqual(p.dias[0], DiaClima(fecha: "2026-11-19", lluviaMM: 12.4, probLluvia: 90, maxC: 24.1, minC: 16, humedad: 80))
        XCTAssertEqual(p.dias[1].probLluvia, nil)
        XCTAssertEqual(p.dias[1].minC, nil)
        XCTAssertEqual(p.dias[1].humedad, nil)
        XCTAssertEqual(p.dia(hoyTest)?.maxC, 33.5)
        XCTAssertEqual(p.dia(-1, de: hoyTest)?.lluviaMM, 12.4)
    }

    func testErrorDeOpenMeteoTira() {
        XCTAssertThrowsError(try OpenMeteo.leer(Data(#"{"error":true,"reason":"x"}"#.utf8), ahora: hoyTest))
    }

    func testURLApuntaACABA() {
        let u = OpenMeteo.url.absoluteString
        XCTAssertTrue(u.contains("latitude=-34.6037"))
        XCTAssertTrue(u.contains("past_days=2"))
    }

    // MARK: Riego según el clima

    func testSiAyerLlovioNoPideRegarEnElPatio() {
        let p = auto(dia: 15, registros: [reg(.riego, hace: 3)])  // le tocaba Top Veg
        let llovio = pronostico(ayer: DiaClima(fecha: "", lluviaMM: 8))
        let t = tipos(p, llovio)
        XCTAssertFalse(t.contains(.riego))
        XCTAssertFalse(t.contains(.fertilizante))
        // Adentro no le llueve.
        let adentro = auto(dia: 15, ubicacion: .interior, registros: [reg(.riego, hace: 3)])
        XCTAssertTrue(tipos(adentro, llovio).contains(.fertilizante))
    }

    func testLluviaLiviana_NoCuenta() {
        let p = auto(dia: 5, registros: [reg(.riego, hace: 2)])
        XCTAssertTrue(tipos(p, pronostico(ayer: DiaClima(fecha: "", lluviaMM: 2))).contains(.riego))
    }

    func testConCalorPideRegarAlDiaSiguiente() {
        let p = auto(dia: 5, registros: [reg(.riego, hace: 1)])
        XCTAssertFalse(tipos(p, nil).contains(.riego))
        let calor = pronostico(hoy: DiaClima(fecha: "", lluviaMM: 0, maxC: 34))
        let t = Tareas.generar(plantas: [p], hoy: hoyTest, clima: calor)
        XCTAssertTrue(t.first { $0.tipo == .riego }?.detalle.contains("Hace calor") ?? false)
    }

    func testLluviaPronosticadaAgregaNota() {
        let p = auto(dia: 5, registros: [reg(.riego, hace: 2)])
        let lluvia = pronostico(hoy: DiaClima(fecha: "", lluviaMM: 10, probLluvia: 80))
        let riego = Tareas.generar(plantas: [p], hoy: hoyTest, clima: lluvia).first { $0.tipo == .riego }
        XCTAssertTrue(riego?.detalle.contains("10 mm de lluvia hoy") ?? false)
        // Con poca probabilidad no se avisa.
        let dudosa = pronostico(hoy: DiaClima(fecha: "", lluviaMM: 10, probLluvia: 30))
        let r2 = Tareas.generar(plantas: [p], hoy: hoyTest, clima: dudosa).first { $0.tipo == .riego }
        XCTAssertFalse(r2?.detalle.contains("lluvia") ?? true)
    }

    // MARK: Hongos

    func testHongosEnFloracionConHumedad() {
        let humedo = pronostico(hoy: DiaClima(fecha: "", lluviaMM: 0, humedad: 88))
        XCTAssertTrue(tipos(auto(dia: 40), humedo).contains(.hongos))
        XCTAssertFalse(tipos(auto(dia: 40), pronostico()).contains(.hongos))       // seco
        XCTAssertFalse(tipos(auto(dia: 15), humedo).contains(.hongos))             // sin cogollos
        XCTAssertFalse(tipos(auto(dia: 40, ubicacion: .interior), humedo).contains(.hongos))
        let revisada = auto(dia: 40, registros: [reg(.revision, hace: 0)])
        XCTAssertFalse(tipos(revisada, humedo).contains(.hongos))
        let ayer = auto(dia: 40, registros: [reg(.revision, hace: 1)])
        XCTAssertTrue(tipos(ayer, humedo).contains(.hongos))
    }

    // MARK: Avisos

    func testAvisos() {
        let plantas = [auto(dia: 3), auto(dia: 45)]
        let p = pronostico(ayer: DiaClima(fecha: "", lluviaMM: 0, humedad: 85),
                           hoy: DiaClima(fecha: "", lluviaMM: 0, maxC: 35, minC: 4))
        let a = AnalisisClima.avisos(p, plantas: plantas, hoy: hoyTest).map(\.tipo)
        XCTAssertEqual(a, [.calor, .frio, .hongos])

        let lluvia = pronostico(hoy: DiaClima(fecha: "", lluviaMM: 15, probLluvia: 90))
        XCTAssertEqual(AnalisisClima.avisos(lluvia, plantas: plantas, hoy: hoyTest).first?.tipo, .lluvia)
        let llovio = pronostico(ayer: DiaClima(fecha: "", lluviaMM: 15))
        XCTAssertEqual(AnalisisClima.avisos(llovio, plantas: plantas, hoy: hoyTest).first?.tipo, .llovio)

        XCTAssertTrue(AnalisisClima.avisos(nil, plantas: plantas, hoy: hoyTest).isEmpty)
    }

    func testResumenParaElAsistente() {
        let p = pronostico(ayer: DiaClima(fecha: "", lluviaMM: 3), hoy: DiaClima(fecha: "", lluviaMM: 1.5, probLluvia: 40))
        let r = AnalisisClima.resumen(p, hoy: hoyTest)
        XCTAssertTrue(r?.contains("lluvia hoy 1,5 mm (40 %)") ?? false)
        XCTAssertTrue(r?.contains("lluvia ayer 3 mm") ?? false)
        var d = Datos()
        d.agregarPlanta(auto(dia: 10))
        XCTAssertTrue(ContextoAsistente.contexto(datos: d, hoy: hoyTest, clima: p).contains("Clima en CABA"))
        XCTAssertTrue(ContextoAsistente.contexto(datos: d, hoy: hoyTest).contains("cosecha estimada desde el"))
    }

    // MARK: Llovió / acciones en grupo

    func testLlovioRiegaSoloLasActivasDelPatio() {
        var d = Datos()
        let a = auto(dia: 10, nombre: "A")
        let b = auto(dia: 10, ubicacion: .interior, nombre: "B")
        var c = auto(dia: 100, nombre: "C"); c.estado = .secando
        [a, b, c].forEach { d.agregarPlanta($0) }
        XCTAssertEqual(d.llovio(fecha: hoyTest, mm: 12), 1)
        let riego = d.planta(a.id)?.registros.first { $0.tipo == .riego }
        XCTAssertEqual(riego?.producto, "Lluvia")
        XCTAssertEqual(riego?.nota, "12 mm")
        XCTAssertNil(d.planta(b.id)?.registros.first { $0.tipo == .riego })
        // Cuenta como riego: ya no aparece la tarea.
        XCTAssertFalse(Tareas.generar(plantas: d.plantas, hoy: hoyTest).contains { $0.plantaID == a.id && $0.tipo == .riego })
    }

    func testRegistrarEnGrupo() {
        var d = Datos()
        let a = auto(dia: 10), b = auto(dia: 12)
        d.agregarPlanta(a); d.agregarPlanta(b)
        d.registrarEnGrupo(.neem, en: [a.id, b.id], fecha: hoyTest)
        XCTAssertEqual(d.plantas.filter { $0.ultimaFecha([.neem]) != nil }.count, 2)
    }
}
