import XCTest
@testable import ViejoVerdeCore

final class AsistenteTests: XCTestCase {

    private func json(_ data: Data) throws -> JSONValor { try JSONDecoder().decode(JSONValor.self, from: data) }

    // MARK: Pedido

    func testEncabezados() {
        let h = PedidoClaude.encabezados(apiKey: "sk-test")
        XCTAssertEqual(h["x-api-key"], "sk-test")
        XCTAssertEqual(h["anthropic-version"], "2026-10-21")
        XCTAssertEqual(h["anthropic-beta"], "server-side-fallback-2026-07-01")
        XCTAssertEqual(h["content-type"], "application/json")
    }

    func testCuerpoBasico() throws {
        let historial = [MensajeChat(rol: .usuario, texto: "Hola")]
        let c = try json(PedidoClaude.cuerpo(historial: historial, instrucciones: "INSTR", contexto: "CTX"))
        XCTAssertEqual(c["model"]?.cadena, "claude-sonnet-5-5")
        XCTAssertEqual(c["max_tokens"], .numero(16000))
        XCTAssertEqual(c["fallbacks"]?.cadena, "default")
        XCTAssertEqual(c["output_config"]?["effort"]?.cadena, "low")
        XCTAssertNil(c["temperature"])
        XCTAssertEqual(c["system"]?.elementos?.compactMap { $0["text"]?.cadena }, ["INSTR", "CTX"])
        let msgs = try XCTUnwrap(c["messages"]?.elementos)
        XCTAssertEqual(msgs.count, 1)
        XCTAssertEqual(msgs[0]["role"]?.cadena, "user")
        XCTAssertEqual(msgs[0]["content"]?.elementos?.first?["text"]?.cadena, "Hola")
    }

    func testFotoVaAntesDelTextoYSubeElEsfuerzo() throws {
        let foto = Data([0xFF, 0xD8, 0xFF])
        let historial = [MensajeChat(rol: .usuario, texto: "¿Qué tiene?", imagenJPEG: foto)]
        let c = try json(PedidoClaude.cuerpo(historial: historial, instrucciones: "", contexto: ""))
        XCTAssertEqual(c["output_config"]?["effort"]?.cadena, "medium")
        let bloques = try XCTUnwrap(c["messages"]?.elementos?.first?["content"]?.elementos)
        XCTAssertEqual(bloques[0]["type"]?.cadena, "image")
        XCTAssertEqual(bloques[0]["source"]?["media_type"]?.cadena, "image/jpeg")
        XCTAssertEqual(bloques[0]["source"]?["data"]?.cadena, foto.base64EncodedString())
        XCTAssertEqual(bloques[1]["text"]?.cadena, "¿Qué tiene?")
    }

    func testSoloFotoLlevaTextoPorDefecto() {
        let m = PedidoClaude.mensajes([MensajeChat(rol: .usuario, texto: "  ", imagenJPEG: Data([1]))])
        XCTAssertEqual(m[0]["content"]?.elementos?.last?["text"]?.cadena, "Mirá esta foto de mi planta.")
    }

    func testReenviaLosBloquesCrudosDelAsistente() {
        let pensamiento: JSONValor = .objeto(["type": .texto("thinking"), "thinking": .texto(""), "signature": .texto("abc")])
        let texto: JSONValor = .objeto(["type": .texto("text"), "text": .texto("Regá mañana.")])
        let historial = [
            MensajeChat(rol: .usuario, texto: "¿Riego?"),
            MensajeChat(rol: .asistente, texto: "Regá mañana.", bloques: [pensamiento, texto]),
            MensajeChat(rol: .usuario, texto: "Dale"),
        ]
        let m = PedidoClaude.mensajes(historial)
        XCTAssertEqual(m.map { $0["role"]?.cadena }, ["user", "assistant", "user"])
        XCTAssertEqual(m[1]["content"]?.elementos, [pensamiento, texto])
    }

    func testSaltaErroresYUneTurnosSeguidos() {
        let historial = [
            MensajeChat(rol: .asistente, texto: "Bienvenida"),  // no puede arrancar con el asistente
            MensajeChat(rol: .usuario, texto: "Uno"),
            MensajeChat(rol: .asistente, texto: "Sin conexión", esError: true),
            MensajeChat(rol: .usuario, texto: "Dos"),
        ]
        let m = PedidoClaude.mensajes(historial)
        XCTAssertEqual(m.count, 1)
        XCTAssertEqual(m[0]["role"]?.cadena, "user")
        XCTAssertEqual(m[0]["content"]?.elementos?.compactMap { $0["text"]?.cadena }, ["Uno", "Dos"])
    }

    func testSoloLasUltimasFotos() {
        var historial: [MensajeChat] = []
        for i in 0..<3 {
            historial.append(MensajeChat(rol: .usuario, texto: "foto \(i)", imagenJPEG: Data([UInt8(i)])))
            historial.append(MensajeChat(rol: .asistente, texto: "ok \(i)"))
        }
        let m = PedidoClaude.mensajes(historial)
        let tipos = m.filter { $0["role"]?.cadena == "user" }.map { $0["content"]?.elementos?.first?["type"]?.cadena }
        let textos = m.filter { $0["role"]?.cadena == "user" }.map { $0["content"]?.elementos?.first?["text"]?.cadena }
        XCTAssertEqual(tipos, ["text", "image", "image"])
        XCTAssertEqual(textos.first, "[Acá había mandado una foto]")
    }

    func testLimitaElHistorial() {
        let historial = (0..<50).map { i in MensajeChat(rol: i % 2 == 0 ? .usuario : .asistente, texto: "\(i)") }
        let m = PedidoClaude.mensajes(historial)
        XCTAssertLessThanOrEqual(m.count, PedidoClaude.maxMensajes)
        XCTAssertEqual(m.first?["role"]?.cadena, "user")
    }

    // MARK: Respuesta

    func testLeeTextoYGuardaBloques() {
        let data = Data("""
        {"id":"msg_1","type":"message","role":"assistant","stop_reason":"end_turn",
         "content":[{"type":"thinking","thinking":"","signature":"x"},{"type":"text","text":"Hola"},{"type":"text","text":"che"}]}
        """.utf8)
        guard case .success(let r) = LectorRespuesta.leer(data, status: 200) else { return XCTFail() }
        XCTAssertEqual(r.texto, "Hola\n\nche")
        XCTAssertEqual(r.bloques.count, 3)
        XCTAssertEqual(r.stopReason, "end_turn")
    }

    func testRechazo() {
        let data = Data(#"{"stop_reason":"refusal","content":[],"stop_details":{"type":"refusal","category":"general_harms"}}"#.utf8)
        XCTAssertEqual(LectorRespuesta.leer(data, status: 200), .failure(.rechazo))
    }

    func testCortadaPorMaxTokens() {
        let data = Data(#"{"stop_reason":"max_tokens","content":[{"type":"text","text":"Mucho"}]}"#.utf8)
        guard case .success(let r) = LectorRespuesta.leer(data, status: 200) else { return XCTFail() }
        XCTAssertTrue(r.texto.hasSuffix("(La respuesta quedó cortada.)"))
    }

    func testErroresHTTP() {
        let data = Data(#"{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}"#.utf8)
        let r = LectorRespuesta.leer(data, status: 401)
        XCTAssertEqual(r, .failure(.http(status: 401, tipo: "authentication_error", mensaje: "invalid x-api-key")))
        XCTAssertEqual(ErrorClaude.http(status: 401, tipo: "authentication_error", mensaje: "").mensaje,
                       "La API key no es válida. Revisala en Ajustes.")
        XCTAssertTrue(ErrorClaude.http(status: 529, tipo: "overloaded_error", mensaje: "").mensaje.contains("saturado"))
        XCTAssertTrue(ErrorClaude.http(status: 500, tipo: "api_error", mensaje: "boom").mensaje.contains("boom"))
    }

    func testJSONValorIdaYVuelta() throws {
        let original = Data(#"{"a":[1,2.5,true,null,"x"],"b":{"c":"d"}}"#.utf8)
        let v = try json(original)
        let e = JSONEncoder(); e.outputFormatting = [.sortedKeys]
        XCTAssertEqual(String(decoding: try e.encode(v), as: UTF8.self), #"{"a":[1,2.5,true,null,"x"],"b":{"c":"d"}}"#)
    }

    // MARK: Contexto

    func testContextoIncluyePlantasYDatosClave() {
        var d = Datos()
        let p = auto(dia: 15, registros: [reg(.riego, hace: 3), reg(.fertilizante, hace: 8, producto: "Top Veg"),
                                          Registro(fecha: hace(1), tipo: .problema, nota: "Puntas quemadas")],
                     nombre: "Banana 1")
        d.agregarPlanta(p)
        var vieja = auto(dia: 200, nombre: "Terminada")
        vieja.estado = .terminada
        d.agregarPlanta(vieja)

        let c = ContextoAsistente.contexto(datos: d, hoy: hoyTest)
        XCTAssertTrue(c.contains("CABA"))
        XCTAssertTrue(c.contains("hasta 9 plantas florecidas"))
        XCTAssertTrue(c.contains("Banana 1"))
        XCTAssertTrue(c.contains("Crecimiento, día 15 (semana 3)"))
        XCTAssertTrue(c.contains("último riego: hace 3 días"))
        XCTAssertTrue(c.contains("fertilizante: hace 8 días (Top Veg)"))
        XCTAssertTrue(c.contains("neem: nunca"))
        XCTAssertTrue(c.contains("Problema (ayer): Puntas quemadas"))
        XCTAssertFalse(c.contains("Terminada ("))
        XCTAssertTrue(c.contains("noviembre"))
    }

    func testContextoSinPlantas() {
        XCTAssertTrue(ContextoAsistente.contexto(datos: Datos(), hoy: hoyTest).contains("todavía no cargó ninguna"))
    }

    func testGuiaTieneTodasLasSecciones() {
        XCTAssertEqual(Guia.secciones.map(\.titulo),
                       ["Riego", "Sexado", "Polen", "Cosecha", "Secado", "Curado", "Reciclar tierra"])
    }
}
