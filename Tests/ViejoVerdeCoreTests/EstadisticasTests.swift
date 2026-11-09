import XCTest
@testable import ViejoVerdeCore

final class EstadisticasTests: XCTestCase {

    private func cosechada(_ nombre: String, variedad: String, germ: Date, cosecha: Date,
                           humedos: Double, secos: Double?) -> Planta {
        var p = Planta(nombre: nombre, variedad: variedad, tipo: .auto, semilla: .feminizada, fechaGerminacion: germ)
        p.estado = secos == nil ? .secando : .terminada
        p.cosecha = Cosecha(fecha: cosecha, gramosHumedos: humedos, fechaFrascos: secos == nil ? nil : cosecha,
                            gramosSecos: secos)
        return p
    }

    private var plantas: [Planta] {
        [
            cosechada("A", variedad: "Banana Blaze", germ: f(2026, 9, 1), cosecha: f(2026, 11, 25), humedos: 200, secos: 50),
            cosechada("B", variedad: "Banana Blaze", germ: f(2026, 9, 1), cosecha: f(2026, 12, 1), humedos: 100, secos: 30),
            cosechada("C", variedad: "Otra", germ: f(2026, 1, 1), cosecha: f(2026, 4, 1), humedos: 150, secos: 35),
            cosechada("D", variedad: "", germ: f(2026, 9, 1), cosecha: f(2026, 12, 10), humedos: 80, secos: nil),
            auto(dia: 30),  // activa: no cuenta
        ]
    }

    func testCosechasOrdenadasYCiclo() {
        let c = Estadisticas.cosechas(plantas)
        XCTAssertEqual(c.map(\.nombre), ["D", "B", "A", "C"])
        XCTAssertEqual(c.first { $0.nombre == "A" }?.diasCiclo, 85)
        XCTAssertEqual(c.first { $0.nombre == "A" }?.rendimiento, 0.25)
        XCTAssertNil(c.first { $0.nombre == "D" }?.rendimiento)
        XCTAssertEqual(c.first { $0.nombre == "D" }?.variedad, "Sin variedad")
    }

    func testTotalesYPromedios() {
        let c = Estadisticas.cosechas(plantas)
        XCTAssertEqual(Estadisticas.totalSecos(c), 115)
        XCTAssertEqual(Estadisticas.promedioSecos(c)!, 115.0 / 3, accuracy: 0.001)
        XCTAssertNil(Estadisticas.promedioSecos([]))
    }

    func testPorVariedad() {
        let g = Estadisticas.porVariedad(Estadisticas.cosechas(plantas))
        XCTAssertEqual(g.first?.nombre, "Banana Blaze")
        XCTAssertEqual(g.first?.cosechas, 2)
        XCTAssertEqual(g.first?.totalSecos, 80)
        XCTAssertEqual(g.first?.promedioSecos, 40)
    }

    func testTemporadas() {
        XCTAssertEqual(Estadisticas.temporada(de: f(2026, 11, 25)), "2026/27")
        XCTAssertEqual(Estadisticas.temporada(de: f(2026, 4, 1)), "2025/26")
        XCTAssertEqual(Estadisticas.temporada(de: f(2026, 7, 1)), "2026/27")
        let g = Estadisticas.porTemporada(Estadisticas.cosechas(plantas))
        XCTAssertEqual(g.map(\.nombre), ["2026/27", "2025/26"])
        XCTAssertEqual(g[0].totalSecos, 80)
    }

    func testLineaDeTiempoDeFotos() {
        var d = Datos()
        var p = auto(dia: 20)
        p.fotos = ["vieja.jpg"]  // de antes, sin fecha
        d.agregarPlanta(p)
        d.agregarFoto("b.jpg", en: p.id, fecha: hace(2))
        d.agregarFoto("a.jpg", en: p.id, fecha: hace(10))
        let t = d.planta(p.id)!.lineaDeTiempo
        XCTAssertEqual(t.map(\.nombre), ["a.jpg", "b.jpg", "vieja.jpg"])
        XCTAssertNil(t.last?.fecha)
        d.quitarFoto("a.jpg", en: p.id)
        XCTAssertNil(d.planta(p.id)!.fechasFotos["a.jpg"])
    }

    func testRecortarChat() {
        let m = (0..<100).map { i in
            MensajeChat(rol: i % 2 == 0 ? .usuario : .asistente, texto: "\(i)", imagenJPEG: i % 2 == 0 ? Data([1]) : nil)
        }
        let r = HistorialChat.recortar(m)
        XCTAssertEqual(r.count, HistorialChat.maxMensajes)
        XCTAssertEqual(r.last?.texto, "99")
        XCTAssertEqual(r.filter { $0.imagenJPEG != nil }.count, HistorialChat.maxFotos)
        XCTAssertNotNil(r.last(where: { $0.rol == .usuario })?.imagenJPEG)
    }
}
