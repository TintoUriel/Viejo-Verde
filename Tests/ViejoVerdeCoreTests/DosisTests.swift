import XCTest
@testable import ViejoVerdeCore

final class DosisTests: XCTestCase {

    func testProductoPorEtapa() {
        XCTAssertNil(CalculoDosis.fertilizante(para: .plantula))
        XCTAssertEqual(CalculoDosis.fertilizante(para: .crecimiento), .topVeg)
        XCTAssertEqual(CalculoDosis.fertilizante(para: .prefloracion), .topBloom)
        XCTAssertEqual(CalculoDosis.fertilizante(para: .floracion), .topBloom)
        XCTAssertNil(CalculoDosis.fertilizante(para: .maduracion))
        XCTAssertNil(CalculoDosis.fertilizante(para: .listaCosecha))
    }

    func testAguaPorEtapa() {
        XCTAssertEqual(CalculoDosis.aguaML(etapa: .plantula, diaEnEtapa: 0, litrosMaceta: 20), 100)
        XCTAssertEqual(CalculoDosis.aguaML(etapa: .plantula, diaEnEtapa: 9, litrosMaceta: 20), 250)
        // La plántula no escala con la maceta.
        XCTAssertEqual(CalculoDosis.aguaML(etapa: .plantula, diaEnEtapa: 0, litrosMaceta: 40), 100)
        XCTAssertEqual(CalculoDosis.aguaML(etapa: .crecimiento, diaEnEtapa: 0, litrosMaceta: 20), 750)
        XCTAssertEqual(CalculoDosis.aguaML(etapa: .crecimiento, diaEnEtapa: 5, litrosMaceta: 20), 1050)
        XCTAssertEqual(CalculoDosis.aguaML(etapa: .crecimiento, diaEnEtapa: 100, litrosMaceta: 20), 2500)
        XCTAssertEqual(CalculoDosis.aguaML(etapa: .floracion, diaEnEtapa: 3, litrosMaceta: 20), 3000)
        XCTAssertEqual(CalculoDosis.aguaML(etapa: .floracion, diaEnEtapa: 3, litrosMaceta: 10), 1500)
        XCTAssertEqual(CalculoDosis.aguaML(etapa: .secado, diaEnEtapa: 3, litrosMaceta: 20), 0)
    }

    func testFertilizanteAMitadDeEtiqueta() {
        let cfg = ConfigDosis(topVegEtiquetaMlPorLitro: 2, topBloomEtiquetaMlPorLitro: 4)
        let veg = CalculoDosis.dosis(etapa: .crecimiento, diaEnEtapa: 0, litrosMaceta: 20, config: cfg)
        XCTAssertEqual(veg.fertilizante, .topVeg)
        XCTAssertEqual(veg.mlPorLitro, 1)
        XCTAssertEqual(veg.fertilizanteML, 1)  // 0,75 L × 1 ml/L = 0,75 → redondea a 1

        let bloom = CalculoDosis.dosis(etapa: .floracion, diaEnEtapa: 0, litrosMaceta: 20, config: cfg)
        XCTAssertEqual(bloom.fertilizante, .topBloom)
        XCTAssertEqual(bloom.mlPorLitro, 2)
        XCTAssertEqual(bloom.fertilizanteML, 6)  // 3 L × 2 ml/L
        XCTAssertEqual(bloom.textoFertilizante, "6 ml de Top Bloom en 3 L de agua")

        let mad = CalculoDosis.dosis(etapa: .maduracion, diaEnEtapa: 0, litrosMaceta: 20, config: cfg)
        XCTAssertNil(mad.fertilizante)
        XCTAssertNil(mad.textoFertilizante)
        XCTAssertEqual(mad.fertilizanteML, 0)
    }

    func testDosisDePlanta() {
        let p = auto(dia: 40)  // floración
        let d = CalculoDosis.dosis(de: p, hoy: hoyTest, config: ConfigDosis())
        XCTAssertEqual(d.fertilizante, .topBloom)
        XCTAssertEqual(d.aguaML, 3000)
        XCTAssertEqual(d.fertilizanteML, 3)
    }

    func testFormato() {
        XCTAssertEqual(Formato.numero(1.5), "1,5")
        XCTAssertEqual(Formato.numero(3), "3")
        XCTAssertEqual(Formato.volumen(ml: 750), "750 ml")
        XCTAssertEqual(Formato.volumen(ml: 1500), "1,5 L")
        XCTAssertEqual(Formato.volumen(ml: 2000), "2 L")
        XCTAssertEqual(Formato.fechaLarga(f(2026, 11, 8)), "domingo 8 de noviembre")
        XCTAssertEqual(Formato.fechaLarga(f(2027, 1, 1)), "viernes 1 de enero")
        XCTAssertEqual(Formato.fechaCorta(f(2026, 11, 8)), "8/11/2026")
    }
}
