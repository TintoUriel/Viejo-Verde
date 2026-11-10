import XCTest
@testable import ViejoVerdeCore

private let app = "1.0 (1)"

/// Aplica un cambio y devuelve los eventos que genera.
private func eventos(_ d: inout Datos, ahora: Date = hoyTest, _ cambio: (inout Datos) -> Void) -> [EventoSync] {
    let antes = d
    cambio(&d)
    return Eventos.detectar(antes: antes, despues: d, ahora: ahora, app: app)
}

private func objetoJSON(_ data: Data) throws -> [String: Any] {
    try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
}

final class MapeoEventosTests: XCTestCase {

    func testRiegoAJSON() throws {
        var d = Datos()
        let p = auto(dia: 23)
        d.agregarPlanta(p)
        let ev = eventos(&d) { $0.registrar(.riego, en: p.id, fecha: hoyTest, aguaML: 1500) }
        XCTAssertEqual(ev.count, 1)
        let riego = try XCTUnwrap(ev.first)
        let registro = try XCTUnwrap(d.planta(p.id)?.registros.last)
        XCTAssertEqual(riego.id, registro.id.uuidString)

        let json = try objetoJSON(CuerpoSync.json(LoteSync(eventos: ev, plantas: []), token: "secreto"))
        XCTAssertEqual(json["token"] as? String, "secreto")
        XCTAssertNil(json["accion"])
        let e = try XCTUnwrap((json["eventos"] as? [[String: Any]])?.first)
        XCTAssertEqual(e["id"] as? String, registro.id.uuidString)
        XCTAssertEqual(e["tipo"] as? String, "riego")
        XCTAssertEqual(e["plantaID"] as? String, p.id.uuidString)
        XCTAssertEqual(e["planta"] as? String, "Banana")
        XCTAssertEqual(e["variedad"] as? String, "Banana Blaze")
        XCTAssertEqual(e["autoFoto"] as? String, "Auto")
        XCTAssertEqual(e["etapa"] as? String, "Prefloración")
        XCTAssertEqual(e["dia"] as? Int, 23)
        XCTAssertEqual(e["cantidad"] as? Double, 1500)
        XCTAssertEqual(e["unidad"] as? String, "ml")
        XCTAssertEqual(e["app"] as? String, app)
        // Fecha ISO 8601 en UTC (el script la pasa a hora de Buenos Aires).
        let fecha = try XCTUnwrap(e["fecha"] as? String)
        XCTAssertTrue(fecha.hasSuffix("Z"), fecha)
        // Lo que no aplica no viaja.
        XCTAssertNil(e["dosis"])
        XCTAssertNil(e["producto"])
    }

    func testPruebaDeConexionNoMandaEventos() throws {
        let json = try objetoJSON(CuerpoSync.prueba(token: "t"))
        XCTAssertEqual(json["accion"] as? String, "probar")
        XCTAssertEqual((json["eventos"] as? [Any])?.count, 0)
    }

    func testFertilizanteConDosis() throws {
        var d = Datos()
        let p = auto(dia: 15)
        d.agregarPlanta(p)
        let ev = eventos(&d) {
            $0.registrar(.fertilizante, en: p.id, fecha: hoyTest, producto: "Top Veg", nota: "1,5 ml en 1,5 L",
                         aguaML: 1500, fertilizanteML: 1.5, mlPorLitro: 1)
        }
        let e = try XCTUnwrap(ev.first)
        XCTAssertEqual(e.tipo, .fertilizante)
        XCTAssertEqual(e.producto, "Top Veg")
        XCTAssertEqual(e.cantidad, 1.5)
        XCTAssertEqual(e.unidad, "ml")
        XCTAssertEqual(e.dosis, 1)
        XCTAssertEqual(e.nota, "Agua: 1500 ml")
    }

    func testFertilizanteViejoSaleDelTexto() throws {
        let p = auto(dia: 15)
        let r = Registro(fecha: hoyTest, tipo: .fertilizante, producto: "Top Bloom", nota: "2,5 ml en 2,5 L",
                         aguaML: 2500)
        let e = try XCTUnwrap(Eventos.evento(de: r, en: p, app: app))
        XCTAssertEqual(e.cantidad, 2.5)
        XCTAssertEqual(e.dosis, 1)
    }

    func testLluviaEnMM() throws {
        var d = Datos()
        let p = auto(dia: 30)
        d.agregarPlanta(p)
        let ev = eventos(&d) { _ = $0.llovio(fecha: hoyTest, mm: 12) }
        let e = try XCTUnwrap(ev.first)
        XCTAssertEqual(e.tipo, .lluvia)
        XCTAssertEqual(e.cantidad, 12)
        XCTAssertEqual(e.unidad, "mm")
        XCTAssertNil(e.producto)
    }

    func testNotasAutomaticasTienenSuTipo() {
        var d = Datos()
        let macho = auto(dia: 30, semilla: .regular, sexo: .macho, nombre: "Macho")
        d.agregarPlanta(macho)

        let adentro = eventos(&d) { $0.moverAdentro(macho.id, fecha: hoyTest) }
        XCTAssertEqual(adentro.map(\.tipo), [.cambioUbicacion])  // uno solo, no dos

        let polen = eventos(&d) { _ = $0.juntarPolen(de: macho.id, fecha: hoyTest) }
        XCTAssertEqual(polen.map(\.tipo), [.polenJuntado])
        XCTAssertEqual(polen.first?.id, Eventos.idPolen(d.polenes[0].id))

        let descarte = eventos(&d) { $0.descartar(macho.id, fecha: hoyTest) }
        XCTAssertEqual(descarte.map(\.tipo), [.descarte])

        // Un registro viejo (sin subtipo) se reconoce por el texto.
        let viejo = Registro(fecha: hoyTest, tipo: .nota, nota: "Curado completo")
        XCTAssertEqual(Eventos.evento(de: viejo, en: macho, app: app)?.tipo, .finCurado)
    }

    func testSexadoYUbicacionEditadaAMano() {
        var d = Datos()
        let p = auto(dia: 25, semilla: .regular)
        d.agregarPlanta(p)
        XCTAssertEqual(eventos(&d) { $0.marcarSexo(.hembra, en: p.id, fecha: hoyTest) }.map(\.tipo), [.sexado])

        var editada = d.planta(p.id)!
        editada.ubicacion = .interior
        editada.litrosMaceta = 30
        let ev = eventos(&d) { $0.actualizar(editada) }
        XCTAssertEqual(Set(ev.map(\.tipo)), [.cambioUbicacion, .correccion])
        XCTAssertEqual(ev.first { $0.tipo == .cambioUbicacion }?.nota, "Patio → Adentro")
        XCTAssertTrue(ev.first { $0.tipo == .correccion }?.nota?.contains("maceta: 20 → 30 L") ?? false)
    }

    func testCosechaFrascosYCuradoConGramosYEtapaDelMomento() throws {
        var d = Datos()
        let p = auto(dia: 90)
        d.agregarPlanta(p)

        let cosecha = try XCTUnwrap(eventos(&d) { $0.cosechar(p.id, fecha: hoyTest, gramosHumedos: 210) }.first)
        XCTAssertEqual(cosecha.tipo, .cosecha)
        XCTAssertEqual(cosecha.cantidad, 210)
        XCTAssertEqual(cosecha.unidad, "g")
        XCTAssertEqual(cosecha.etapa, Etapa.listaCosecha.nombre)  // la de antes de cortar
        XCTAssertEqual(cosecha.dia, 90)

        let diezDias = Calendario.sumarDias(10, a: hoyTest)
        let frascos = try XCTUnwrap(eventos(&d, ahora: diezDias) {
            $0.pasarAFrascos(p.id, fecha: diezDias, gramosSecos: 52.5)
        }.first)
        XCTAssertEqual(frascos.tipo, .aFrascos)
        XCTAssertEqual(frascos.cantidad, 52.5)
        XCTAssertEqual(frascos.etapa, Etapa.secado.nombre)

        let apertura = Calendario.sumarDias(11, a: hoyTest)
        let abri = try XCTUnwrap(eventos(&d, ahora: apertura) { $0.registrar(.curado, en: p.id, fecha: apertura) }.first)
        XCTAssertEqual(abri.tipo, .aperturaFrascos)
        XCTAssertEqual(abri.etapa, Etapa.curado.nombre)

        let fin = Calendario.sumarDias(40, a: hoyTest)
        XCTAssertEqual(eventos(&d, ahora: fin) { $0.terminar(p.id, fecha: fin) }.map(\.tipo), [.finCurado])
    }

    func testCorreccionYBorradoReferencianElOriginal() throws {
        var d = Datos()
        let p = auto(dia: 20)
        d.agregarPlanta(p)
        _ = eventos(&d) { $0.registrar(.riego, en: p.id, fecha: hoyTest, aguaML: 1000) }
        var r = try XCTUnwrap(d.planta(p.id)?.registros.last)

        r.aguaML = 2000
        let correccion = try XCTUnwrap(eventos(&d) { $0.editarRegistro(r, en: p.id) }.first)
        XCTAssertEqual(correccion.tipo, .correccion)
        XCTAssertNotEqual(correccion.id, r.id.uuidString)  // es un evento nuevo, no pisa el viejo
        XCTAssertTrue(correccion.nota?.contains(r.id.uuidString) ?? false)
        XCTAssertTrue(correccion.nota?.contains("1000 ml") ?? false)
        XCTAssertTrue(correccion.nota?.contains("2000 ml") ?? false)

        let borrado = try XCTUnwrap(eventos(&d) { $0.borrarRegistro(r.id, en: p.id) }.first)
        XCTAssertEqual(borrado.tipo, .borrado)
        XCTAssertTrue(borrado.nota?.contains(r.id.uuidString) ?? false)

        let plantaBorrada = try XCTUnwrap(eventos(&d) { $0.borrarPlanta(p.id) }.first)
        XCTAssertEqual(plantaBorrada.tipo, .borrado)
        XCTAssertEqual(plantaBorrada.plantaID, p.id.uuidString)
    }

    func testSemillas() throws {
        var d = Datos()
        let pack = PaqueteSemillas(nombre: "Banana Blaze", banco: "Dutch Passion", tipo: .auto,
                                   semilla: .feminizada, cantidad: 5, fechaCompra: hoyTest)
        let alta = try XCTUnwrap(eventos(&d) { $0.agregarPaquete(pack) }.first)
        XCTAssertEqual(alta.tipo, .altaSemillas)
        XCTAssertEqual(alta.id, Eventos.idPaquete(pack.id))
        XCTAssertEqual(alta.cantidad, 5)
        XCTAssertEqual(alta.unidad, "semillas")

        let ev = eventos(&d) { $0.agregarPlanta(auto(dia: 0, nombre: "Nueva"), desdePaquete: pack.id) }
        XCTAssertEqual(Set(ev.map(\.tipo)), [.germinacion, .bajaSemillas])
        let baja = try XCTUnwrap(ev.first { $0.tipo == .bajaSemillas })
        XCTAssertEqual(baja.cantidad, 1)
        XCTAssertTrue(baja.nota?.contains("Germiné: Nueva") ?? false)

        XCTAssertEqual(eventos(&d) { $0.ajustarCantidad(pack.id, en: 3) }.map(\.tipo), [.altaSemillas])
        XCTAssertEqual(eventos(&d) { $0.borrarPaquete(pack.id) }.map(\.tipo), [.bajaSemillas])
    }

    func testSemillasPropiasVanUnaSolaVez() {
        var d = Datos()
        let p = auto(dia: 80)
        d.agregarPlanta(p)
        let ev = eventos(&d) { _ = $0.registrarSemillasPropias(de: p.id, cantidad: 30, fecha: hoyTest) }
        XCTAssertEqual(ev.map(\.tipo), [.altaSemillas])
        XCTAssertEqual(ev.first?.plantaID, p.id.uuidString)
        XCTAssertEqual(ev.first?.cantidad, 30)
    }

    func testFotoSoloElHecho() {
        var d = Datos()
        let p = auto(dia: 10)
        d.agregarPlanta(p)
        let ev = eventos(&d) { $0.agregarFoto("abc.jpg", en: p.id, fecha: hoyTest) }
        XCTAssertEqual(ev.map(\.tipo), [.foto])
        XCTAssertEqual(ev.first?.id, "foto-abc.jpg")
        XCTAssertEqual(ev.first?.nota, "Saqué una foto")
    }

    func testHoyNoEsTareaSalteada() throws {
        var d = Datos()
        let p = auto(dia: 20)
        d.agregarPlanta(p)
        let tarea = Tarea.id(.riego, p.id)
        let e = try XCTUnwrap(eventos(&d) { $0.posponer(tarea, hoy: hoyTest) }.first)
        XCTAssertEqual(e.tipo, .tareaSalteada)
        XCTAssertEqual(e.plantaID, p.id.uuidString)
        XCTAssertEqual(e.nota, "Hoy no: regar")
        // Volver a tocar "Hoy no" el mismo día no cambia nada.
        XCTAssertTrue(eventos(&d) { $0.posponer(tarea, hoy: hoyTest) }.isEmpty)
    }

    func testCambiosQueNoSonDelCultivoNoGeneranEventos() {
        var d = Datos()
        d.agregarPlanta(auto(dia: 20))
        XCTAssertTrue(eventos(&d) { _ in }.isEmpty)
        XCTAssertTrue(eventos(&d) { $0.avisos.hora = 7 }.isEmpty)
        XCTAssertTrue(eventos(&d) { $0.config.topVegEtiquetaMlPorLitro = 3 }.isEmpty)
    }

    func testCambiosDeEtapaConFechaRealEIDEstable() {
        var d = Datos()
        let p = auto(dia: 40)
        d.agregarPlanta(p)
        let ev = Eventos.cambiosDeEtapa(d, hoy: hoyTest, app: app)
        XCTAssertEqual(ev.map(\.etapa), [Etapa.crecimiento, .prefloracion, .floracion].map(\.nombre))
        XCTAssertEqual(ev.map(\.dia), [10, 21, 35])
        XCTAssertEqual(ev.first?.id, Eventos.idEtapa(p.id, .crecimiento))
        XCTAssertTrue(Calendario.mismoDia(ev[0].fecha, Calendario.sumarDias(10, a: p.fechaGerminacion)))
        // Mañana genera los mismos IDs (la cola y la planilla los ignoran).
        let manana = Eventos.cambiosDeEtapa(d, hoy: Calendario.sumarDias(1, a: hoyTest), app: app)
        XCTAssertEqual(manana.map(\.id), ev.map(\.id))
    }

    func testEtapasSeCortanEnLaCosecha() {
        var d = Datos()
        let p = auto(dia: 95)
        d.agregarPlanta(p)
        d.cosechar(p.id, fecha: hace(15), gramosHumedos: 100)  // día 80
        let etapas = Eventos.cambiosDeEtapa(d, hoy: hoyTest, app: app).compactMap(\.etapa)
        XCTAssertEqual(etapas.last, Etapa.maduracion.nombre)
        XCTAssertFalse(etapas.contains(Etapa.listaCosecha.nombre))
    }

    /// Lo que hace idempotente a "Sincronizar todo": el historial reconstruido usa los mismos IDs
    /// que los eventos que se mandaron en el momento.
    func testHistorialUsaLosMismosIDsQueElEnvioNormal() {
        var d = Datos()
        var enviados: [EventoSync] = []
        let pack = PaqueteSemillas(nombre: "Regular", banco: "Propias", tipo: .auto, semilla: .regular,
                                   cantidad: 10, fechaCompra: hace(30))
        enviados += eventos(&d) { $0.agregarPaquete(pack) }
        let p = auto(dia: 30, semilla: .regular)
        enviados += eventos(&d) { $0.agregarPlanta(p, desdePaquete: pack.id) }
        enviados += eventos(&d) { $0.registrar(.riego, en: p.id, fecha: hace(2), aguaML: 1500) }
        enviados += eventos(&d) { $0.registrar(.neem, en: p.id, fecha: hace(1), producto: "Neem") }
        enviados += eventos(&d) { $0.marcarSexo(.macho, en: p.id, fecha: hoyTest) }
        enviados += eventos(&d) { $0.moverAdentro(p.id, fecha: hoyTest) }
        enviados += eventos(&d) { _ = $0.juntarPolen(de: p.id, fecha: hoyTest) }
        enviados += eventos(&d) { $0.agregarFoto("f1.jpg", en: p.id, fecha: hoyTest) }
        enviados += eventos(&d) { $0.registrar(.problema, en: p.id, fecha: hoyTest, nota: "Hojas amarillas") }

        let historial = Eventos.historial(d, hoy: hoyTest, app: app).filter { $0.tipo != .cambioEtapa }
        XCTAssertFalse(historial.isEmpty)
        let idsEnviados = Set(enviados.map(\.id))
        for e in historial {
            XCTAssertTrue(idsEnviados.contains(e.id), "\(e.tipo.rawValue) \(e.id) no coincide con lo enviado")
        }
        XCTAssertEqual(Set(historial.map(\.id)).count, historial.count)  // sin repetidos
    }

    func testFilaDePlanta() {
        var d = Datos()
        let p = auto(dia: 20)
        d.agregarPlanta(p)
        d.registrar(.riego, en: p.id, fecha: hace(1), aguaML: 1000)
        d.registrar(.problema, en: p.id, fecha: hoyTest, nota: "Hojas amarillas")
        let f = Eventos.fila(d.planta(p.id)!, hoy: hoyTest)
        XCTAssertEqual(f.id, p.id.uuidString)
        XCTAssertEqual(f.autoFoto, "Auto")
        XCTAssertEqual(f.semilla, "Feminizada")
        XCTAssertEqual(f.ubicacion, "Patio")
        XCTAssertEqual(f.estado, "activa")
        XCTAssertEqual(f.dia, 20)
        XCTAssertEqual(f.etapa, Etapa.crecimiento.nombre)
        XCTAssertEqual(f.germinacion, Calendario.claveDia(p.fechaGerminacion))
        XCTAssertEqual(f.ultimoRiego, hace(1))
        XCTAssertTrue(f.notas.contains("Hojas amarillas"))

        let antes = d
        d.borrarPlanta(p.id)
        let filas = Eventos.filasCambiadas(antes: antes, despues: d, hoy: hoyTest)
        XCTAssertEqual(filas.map(\.estado), ["borrada"])
    }
}

final class BandejaTests: XCTestCase {

    private func evento(_ id: String) -> EventoSync {
        EventoSync(id: id, fecha: hoyTest, tipo: .nota, nota: id, app: app)
    }

    private func planta(_ id: String, notas: String = "") -> PlantaSync {
        PlantaSync(id: id, nombre: id, variedad: "", autoFoto: "Auto", semilla: "Feminizada", sexo: "Hembra",
                   ubicacion: "Patio", litros: 20, germinacion: "2026-10-01", etapa: "Crecimiento", dia: 20,
                   ultimoRiego: nil, ultimoFertilizante: nil, ultimoNeem: nil, estado: "activa",
                   gramosHumedos: nil, gramosSecos: nil, notas: notas, actualizado: hoyTest)
    }

    func testEncolarNoDuplica() {
        var b = Bandeja()
        XCTAssertEqual(b.encolar([evento("a"), evento("b")]), 2)
        XCTAssertEqual(b.encolar([evento("b"), evento("c"), evento("c")]), 1)
        XCTAssertEqual(b.eventos.map(\.id), ["a", "b", "c"])
    }

    func testConfirmarSacaSoloLoEnviado() {
        var b = Bandeja()
        b.encolar([evento("a"), evento("b")])
        let lote = b.lote()
        // Mientras el lote viaja se registra algo más.
        b.encolar([evento("c")])
        b.confirmar(lote, ahora: hoyTest)
        XCTAssertEqual(b.eventos.map(\.id), ["c"])
        XCTAssertEqual(b.ultimoOK, hoyTest)
    }

    func testPlantaQueCambiaDuranteElEnvioSeQueda() {
        var b = Bandeja()
        b.encolar(plantas: [planta("p1", notas: "vieja")])
        let lote = b.lote()
        b.encolar(plantas: [planta("p1", notas: "nueva")])
        XCTAssertEqual(b.plantas.count, 1)  // una sola por planta
        b.confirmar(lote, ahora: hoyTest)
        XCTAssertEqual(b.plantas.map(\.notas), ["nueva"])
        b.confirmar(b.lote(), ahora: hoyTest)
        XCTAssertTrue(b.vacia)
    }

    func testFalloNoPierdeNadaYEsperaCadaVezMas() {
        var b = Bandeja()
        b.encolar([evento("a")])
        b.fallo("sin señal", ahora: hoyTest)
        XCTAssertEqual(b.pendientes, 1)
        XCTAssertEqual(b.ultimoError, "sin señal")
        XCTAssertFalse(b.puedeEnviar(ahora: hoyTest.addingTimeInterval(29)))
        XCTAssertTrue(b.puedeEnviar(ahora: hoyTest.addingTimeInterval(30)))

        b.fallo("sin señal", ahora: hoyTest)
        XCTAssertEqual(b.proximoIntento, hoyTest.addingTimeInterval(60))
        XCTAssertEqual(Bandeja.espera(intentos: 3), 120)
        XCTAssertEqual(Bandeja.espera(intentos: 50), 15 * 60)

        b.confirmar(b.lote(), ahora: hoyTest)
        XCTAssertEqual(b.intentosFallidos, 0)
        XCTAssertNil(b.proximoIntento)
        XCTAssertNil(b.ultimoError)
    }

    func testLoteDeAMuchos() {
        var b = Bandeja()
        b.encolar((0..<250).map { evento("e\($0)") })
        XCTAssertEqual(b.lote().eventos.count, Bandeja.maxPorLote)
        XCTAssertEqual(b.lote().eventos.first?.id, "e0")  // primero los más viejos
        var vueltas = 0
        while !b.vacia {
            b.confirmar(b.lote(), ahora: hoyTest)
            vueltas += 1
        }
        XCTAssertEqual(vueltas, 3)
    }

    func testSobreviveAGuardarYLeer() throws {
        var b = Bandeja()
        b.encolar([evento("a"), evento("b")])
        b.encolar(plantas: [planta("p1")])
        b.etapasEncoladas = ["etapa-x-crecimiento"]
        b.fallo("sin señal", ahora: hoyTest)
        let leida = try Bandeja.leer(b.json())
        XCTAssertEqual(leida.eventos.map(\.id), ["a", "b"])
        XCTAssertEqual(leida.eventos.first?.tipo, .nota)
        XCTAssertEqual(leida.plantas.map(\.id), ["p1"])
        XCTAssertEqual(leida.etapasEncoladas, ["etapa-x-crecimiento"])
        XCTAssertEqual(leida.intentosFallidos, 1)
        // Un archivo vacío o de una versión vieja no rompe nada.
        XCTAssertTrue(try Bandeja.leer(Data("{}".utf8)).vacia)
    }
}

final class RespuestaSyncTests: XCTestCase {

    func testSoloEsExitoConOkTrue() {
        let ok = LectorSync.leer(Data(#"{"ok":true,"agregados":2,"repetidos":1}"#.utf8), status: 200)
        XCTAssertEqual(try ok.get().agregados, 2)

        let token = LectorSync.leer(Data(#"{"ok":false,"error":"Token inválido."}"#.utf8), status: 200)
        XCTAssertEqual(token.failureValue, .servidor("Token inválido."))

        // Página de login de Google en vez de JSON (Web App sin acceso público).
        let html = LectorSync.leer(Data("<!DOCTYPE html><html>".utf8), status: 200)
        XCTAssertEqual(html.failureValue, .noEsJSON)

        XCTAssertEqual(LectorSync.leer(Data(), status: 500).failureValue, .http(500))
    }
}

private extension Result {
    var failureValue: Failure? {
        if case .failure(let e) = self { return e }
        return nil
    }
}
