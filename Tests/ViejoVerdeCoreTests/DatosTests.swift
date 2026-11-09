import XCTest
@testable import ViejoVerdeCore

final class DatosTests: XCTestCase {

    func testSexoInicialSegunSemilla() {
        XCTAssertEqual(auto(dia: 1, semilla: .feminizada).sexo, .hembra)
        XCTAssertEqual(auto(dia: 1, semilla: .regular).sexo, .desconocido)
    }

    func testAgregarDesdePaqueteDescuenta() {
        var d = Datos()
        let pack = PaqueteSemillas(nombre: "Banana Blaze", banco: "Dutch Passion", tipo: .auto,
                                   semilla: .feminizada, cantidad: 1, fechaCompra: hoyTest)
        d.paquetes = [pack]
        d.agregarPlanta(auto(dia: 0), desdePaquete: pack.id)
        XCTAssertEqual(d.paquetes[0].cantidad, 0)
        XCTAssertEqual(d.plantas[0].paqueteOrigenID, pack.id)
        XCTAssertEqual(d.plantas[0].registros.filter { $0.tipo == .germinacion }.count, 1)
        d.agregarPlanta(auto(dia: 0), desdePaquete: pack.id)
        XCTAssertEqual(d.paquetes[0].cantidad, 0)  // nunca negativo
    }

    func testFlujoCosechaSecadoCurado() {
        var d = Datos()
        let p = auto(dia: 90)
        d.agregarPlanta(p)
        d.cosechar(p.id, fecha: hoyTest, gramosHumedos: 210)
        XCTAssertEqual(d.planta(p.id)?.estado, .secando)
        XCTAssertEqual(d.planta(p.id)?.cosecha?.gramosHumedos, 210)

        let frascos = Calendario.sumarDias(10, a: hoyTest)
        d.pasarAFrascos(p.id, fecha: frascos, gramosSecos: 52.5)
        XCTAssertEqual(d.planta(p.id)?.estado, .curando)
        XCTAssertEqual(d.planta(p.id)?.cosecha?.gramosSecos, 52.5)
        XCTAssertEqual(d.planta(p.id)?.cosecha?.fechaFrascos, frascos)

        d.terminar(p.id, fecha: Calendario.sumarDias(40, a: hoyTest))
        XCTAssertEqual(d.planta(p.id)?.estado, .terminada)
    }

    func testPolenYSemillasPropias() {
        var d = Datos()
        let macho = auto(dia: 30, semilla: .regular, sexo: .macho, ubicacion: .interior, nombre: "Macho")
        let hembra = auto(dia: 30, semilla: .regular, sexo: .hembra, nombre: "Hembra")
        d.agregarPlanta(macho)
        d.agregarPlanta(hembra)

        let polen = d.juntarPolen(de: macho.id, fecha: hoyTest)
        XCTAssertNotNil(polen)
        XCTAssertEqual(d.polenes.count, 1)
        XCTAssertEqual(d.polenes[0].plantaOrigenID, macho.id)
        XCTAssertTrue(d.planta(macho.id)?.polenJuntado ?? false)

        d.polinizar(hembra.id, fecha: hoyTest)
        XCTAssertEqual(d.planta(hembra.id)?.fechaPolinizacion, hoyTest)

        let pack = d.registrarSemillasPropias(de: hembra.id, cantidad: 30, fecha: hoyTest)
        XCTAssertEqual(pack?.semilla, .regular)
        XCTAssertEqual(pack?.propias, true)
        XCTAssertEqual(pack?.plantaMadreID, hembra.id)
        XCTAssertEqual(d.paquetes.count, 1)
    }

    func testMarcarSexoYMoverAdentro() {
        var d = Datos()
        let p = auto(dia: 22, semilla: .regular)
        d.agregarPlanta(p)
        d.marcarSexo(.macho, en: p.id, fecha: hoyTest)
        XCTAssertEqual(d.planta(p.id)?.sexo, .macho)
        d.moverAdentro(p.id, fecha: hoyTest)
        XCTAssertEqual(d.planta(p.id)?.ubicacion, .interior)
    }

    func testAjustarCantidadNoBajaDeCero() {
        var d = Datos()
        let pack = PaqueteSemillas(nombre: "x", banco: "y", tipo: .auto, semilla: .regular, cantidad: 2,
                                   fechaCompra: hoyTest)
        d.paquetes = [pack]
        d.ajustarCantidad(pack.id, en: -5)
        XCTAssertEqual(d.paquetes[0].cantidad, 0)
        d.ajustarCantidad(pack.id, en: 3)
        XCTAssertEqual(d.paquetes[0].cantidad, 3)
    }

    func testPaquetesPolenYFotos() {
        var d = Datos()
        var pack = PaqueteSemillas(nombre: "A", banco: "B", tipo: .auto, semilla: .regular, cantidad: 3, fechaCompra: hoyTest)
        d.agregarPaquete(pack)
        pack.cantidad = 7
        d.actualizarPaquete(pack)
        XCTAssertEqual(d.paquetes.first?.cantidad, 7)
        d.borrarPaquete(pack.id)
        XCTAssertTrue(d.paquetes.isEmpty)

        let polen = Polen(fecha: hoyTest, plantaOrigen: "Macho")
        d.agregarPolen(polen)
        d.alternarPolenUsado(polen.id)
        XCTAssertEqual(d.polenes.first?.usado, true)
        d.borrarPolen(polen.id)
        XCTAssertTrue(d.polenes.isEmpty)

        let p = auto(dia: 10)
        d.agregarPlanta(p)
        d.agregarFoto("a.jpg", en: p.id)
        d.agregarFoto("b.jpg", en: p.id)
        d.quitarFoto("a.jpg", en: p.id)
        XCTAssertEqual(d.todasLasFotos, ["b.jpg"])
    }

    func testEditarYBorrarRegistrosYPlanta() {
        var d = Datos()
        let p = auto(dia: 10)
        d.agregarPlanta(p)
        d.registrar(.nota, en: p.id, fecha: hoyTest, nota: "hola")
        var r = d.planta(p.id)!.registros.first { $0.tipo == .nota }!
        r.nota = "chau"
        d.editarRegistro(r, en: p.id)
        XCTAssertEqual(d.planta(p.id)?.registros.first { $0.id == r.id }?.nota, "chau")
        d.borrarRegistro(r.id, en: p.id)
        XCTAssertNil(d.planta(p.id)?.registros.first { $0.id == r.id })

        d.posponer(Tarea.id(.riego, p.id), hoy: hoyTest)
        d.borrarPlanta(p.id)
        XCTAssertTrue(d.plantas.isEmpty)
        XCTAssertTrue(d.pospuestas.isEmpty)
    }

    func testPosponerLimpiaLasViejas() {
        var d = Datos()
        d.posponer("vieja", hoy: hace(5))
        d.posponer("nueva", hoy: hoyTest)
        XCTAssertEqual(Set(d.pospuestas.keys), ["nueva"])
    }

    // MARK: Backup

    func testBackupIdaYVuelta() throws {
        let datos = Ejemplo.datos(hoy: hoyTest)
        let json = try Backup(datos: datos, exportado: hoyTest, fotos: ["a.jpg": Data([1, 2, 3])]).json()
        let leido = try Backup.leer(json)
        XCTAssertEqual(leido.datos, datos)
        XCTAssertEqual(leido.fotos["a.jpg"], Data([1, 2, 3]))
        XCTAssertEqual(leido.version, Backup.versionActual)
    }

    func testBackupViejoSinCamposNuevos() throws {
        let json = """
        {"datos":{"plantas":[{"id":"6F9619FF-8B86-D011-B42D-00C04FC964FF","nombre":"Vieja","tipo":"auto",
        "semilla":"feminizada","fechaGerminacion":"2026-10-01T15:00:00Z"}]}}
        """
        let b = try Backup.leer(Data(json.utf8))
        let p = try XCTUnwrap(b.datos.plantas.first)
        XCTAssertEqual(p.litrosMaceta, 20)
        XCTAssertEqual(p.estado, .activa)
        XCTAssertEqual(p.ubicacion, .patio)
        XCTAssertTrue(p.registros.isEmpty)
        XCTAssertEqual(b.datos.config, ConfigDosis())
    }

    // MARK: Cupo y temporada

    func testCupoREPROCANN() {
        var plantas = (0..<10).map { _ in auto(dia: 40) }  // 10 en floración
        plantas.append(auto(dia: 25))  // prefloración: no cuenta
        var s = auto(dia: 100); s.estado = .secando; plantas.append(s)
        var c = auto(dia: 110); c.estado = .curando; plantas.append(c)
        let r = Cupo.resumen(plantas, hoy: hoyTest)
        XCTAssertEqual(r.activas, 11)
        XCTAssertEqual(r.enFlor, 10)
        XCTAssertEqual(r.secando, 1)
        XCTAssertEqual(r.curando, 1)
        XCTAssertTrue(r.excedido)
        XCTAssertFalse(Cupo.resumen(Array(plantas.prefix(9)), hoy: hoyTest).excedido)
    }

    func testConsejoDeTemporada() {
        XCTAssertEqual(Temporada.consejo(para: f(2026, 11, 8)).titulo, "Temporada de siembra")
        XCTAssertEqual(Temporada.consejo(para: f(2027, 1, 8)).titulo, "Otra tanda de automáticas")
        XCTAssertEqual(Temporada.consejo(para: f(2027, 4, 8)).titulo, "Última tanda de automáticas")
        XCTAssertEqual(Temporada.consejo(para: f(2027, 6, 8)).titulo, "Descanso del patio")
    }

    func testEjemploGeneraTareasVariadas() {
        let d = Ejemplo.datos(hoy: hoyTest)
        let t = Set(Tareas.generar(plantas: d.plantas, paquetes: d.paquetes, hoy: hoyTest).map(\.tipo))
        XCTAssertTrue(t.isSuperset(of: [.machoPatio, .sexado, .cosecha, .secado, .curado, .fertilizante]))
    }
}
