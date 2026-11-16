import { describe, expect, it } from 'vitest'
import { CalculoDosis, configPorDefecto, textoFertilizante } from '../src/core/dosis'
import { Formato } from '../src/core/formato'
import { auto, f, hoyTest } from './ayudas'

describe('Dosis', () => {
  it('producto por etapa', () => {
    expect(CalculoDosis.fertilizante('plantula')).toBeUndefined()
    expect(CalculoDosis.fertilizante('crecimiento')).toBe('topVeg')
    expect(CalculoDosis.fertilizante('prefloracion')).toBe('topBloom')
    expect(CalculoDosis.fertilizante('floracion')).toBe('topBloom')
    expect(CalculoDosis.fertilizante('maduracion')).toBeUndefined()
    expect(CalculoDosis.fertilizante('listaCosecha')).toBeUndefined()
  })

  it('agua por etapa', () => {
    expect(CalculoDosis.aguaML('plantula', 0, 20)).toBe(100)
    expect(CalculoDosis.aguaML('plantula', 9, 20)).toBe(250)
    // La plántula no escala con la maceta.
    expect(CalculoDosis.aguaML('plantula', 0, 40)).toBe(100)
    expect(CalculoDosis.aguaML('crecimiento', 0, 20)).toBe(750)
    expect(CalculoDosis.aguaML('crecimiento', 5, 20)).toBe(1050)
    expect(CalculoDosis.aguaML('crecimiento', 100, 20)).toBe(2500)
    expect(CalculoDosis.aguaML('floracion', 3, 20)).toBe(3000)
    expect(CalculoDosis.aguaML('floracion', 3, 10)).toBe(1500)
    expect(CalculoDosis.aguaML('secado', 3, 20)).toBe(0)
  })

  it('fertilizante a mitad de la etiqueta', () => {
    const cfg = { topVegEtiquetaMlPorLitro: 2, topBloomEtiquetaMlPorLitro: 4 }
    const veg = CalculoDosis.dosis('crecimiento', 0, 20, cfg)
    expect(veg.fertilizante).toBe('topVeg')
    expect(veg.mlPorLitro).toBe(1)
    expect(veg.fertilizanteML).toBe(1) // 0,75 L × 1 ml/L = 0,75 → redondea a 1

    const bloom = CalculoDosis.dosis('floracion', 0, 20, cfg)
    expect(bloom.fertilizante).toBe('topBloom')
    expect(bloom.mlPorLitro).toBe(2)
    expect(bloom.fertilizanteML).toBe(6) // 3 L × 2 ml/L
    expect(textoFertilizante(bloom)).toBe('6 ml de Top Bloom en 3 L de agua')

    const mad = CalculoDosis.dosis('maduracion', 0, 20, cfg)
    expect(mad.fertilizante).toBeUndefined()
    expect(textoFertilizante(mad)).toBeUndefined()
    expect(mad.fertilizanteML).toBe(0)
  })

  it('dosis de una planta', () => {
    const d = CalculoDosis.dePlanta(auto({ dia: 40 }), hoyTest, configPorDefecto()) // floración
    expect(d.fertilizante).toBe('topBloom')
    expect(d.aguaML).toBe(3000)
    expect(d.fertilizanteML).toBe(3)
  })

  it('formato', () => {
    expect(Formato.numero(1.5)).toBe('1,5')
    expect(Formato.numero(3)).toBe('3')
    expect(Formato.volumen(750)).toBe('750 ml')
    expect(Formato.volumen(1500)).toBe('1,5 L')
    expect(Formato.volumen(2000)).toBe('2 L')
    expect(Formato.fechaLarga(f(2026, 11, 8))).toBe('domingo 8 de noviembre')
    expect(Formato.fechaLarga(f(2027, 1, 1))).toBe('viernes 1 de enero')
    expect(Formato.fechaCorta(f(2026, 11, 8))).toBe('8/11/2026')
  })
})
