import { describe, expect, it } from 'vitest'
import { AnalisisClima, diaClima, diaClimaDesde, OpenMeteo, type DiaClima, type Pronostico } from '../src/core/clima'
import { D, datosVacios } from '../src/core/datos'
import { Historia } from '../src/core/historia'
import { ultimaFecha, type Planta } from '../src/core/modelos'
import { Tareas, type TipoTarea } from '../src/core/tareas'
import { auto, hoyTest, reg } from './ayudas'

type Base = Partial<DiaClima>

/** Pronóstico alrededor de hoyTest (20/11/2026): ayer, hoy, mañana. */
function pronostico(o: { ayer?: Base; hoy?: Base; maniana?: Base } = {}): Pronostico {
  const d = (b: Base | undefined, fecha: string): DiaClima => {
    const x: DiaClima = { fecha, lluviaMM: b?.lluviaMM ?? 0, maxC: b?.maxC ?? 25, minC: b?.minC ?? 15, humedad: b?.humedad ?? 60 }
    if (b?.probLluvia !== undefined) x.probLluvia = b.probLluvia
    return x
  }
  return { dias: [d(o.ayer, '2026-11-19'), d(o.hoy, '2026-11-20'), d(o.maniana, '2026-11-21')], actualizado: hoyTest }
}

const tipos = (p: Planta, clima?: Pronostico): Set<TipoTarea> =>
  new Set(Tareas.generar({ plantas: [p], hoy: hoyTest, clima }).map((t) => t.tipo))

describe('Open-Meteo', () => {
  it('lee la respuesta', () => {
    const json = `{"latitude":-34.6,"longitude":-58.4,
      "daily":{"time":["2026-11-19","2026-11-20"],"precipitation_sum":[12.4,0.0],
               "precipitation_probability_max":[90,null],"temperature_2m_max":[24.1,33.5],
               "temperature_2m_min":[16.0,null]},
      "hourly":{"time":["2026-11-19T00:00","2026-11-19T12:00","2026-11-20T00:00"],
                "relative_humidity_2m":[90,70,null]}}`
    const p = OpenMeteo.leer(json, hoyTest)
    expect(p.dias.length).toBe(2)
    expect(p.dias[0]).toEqual({ fecha: '2026-11-19', lluviaMM: 12.4, probLluvia: 90, maxC: 24.1, minC: 16, humedad: 80 })
    expect(p.dias[1].probLluvia).toBeUndefined()
    expect(p.dias[1].minC).toBeUndefined()
    expect(p.dias[1].humedad).toBeUndefined()
    expect(diaClima(p, hoyTest)?.maxC).toBe(33.5)
    expect(diaClimaDesde(p, -1, hoyTest)?.lluviaMM).toBe(12.4)
  })

  it('un error de Open-Meteo tira', () => {
    expect(() => OpenMeteo.leer('{"error":true,"reason":"x"}', hoyTest)).toThrow()
  })

  it('la URL apunta a CABA', () => {
    expect(OpenMeteo.url).toContain('latitude=-34.6037')
    expect(OpenMeteo.url).toContain('past_days=2')
  })
})

describe('Riego según el clima', () => {
  it('la lluvia no cuenta como riego: el patio está techado', () => {
    const p = auto({ dia: 15, registros: [reg('riego', 3)] }) // le toca Top Veg
    const llovio = pronostico({ ayer: { lluviaMM: 25 }, hoy: { lluviaMM: 30, probLluvia: 95 } })
    expect(tipos(p, llovio).has('fertilizante')).toBe(true)
    const riego = Tareas.generar({ plantas: [auto({ dia: 5, registros: [reg('riego', 2)] })], hoy: hoyTest, clima: llovio })
      .find((x) => x.tipo === 'riego')
    expect(riego).toBeDefined()
    expect(riego?.detalle).not.toContain('lluvia')
  })

  it('con calor pide regar al día siguiente', () => {
    const p = auto({ dia: 5, registros: [reg('riego', 1)] })
    expect(tipos(p).has('riego')).toBe(false)
    const calor = pronostico({ hoy: { lluviaMM: 0, maxC: 34 } })
    const t = Tareas.generar({ plantas: [p], hoy: hoyTest, clima: calor })
    expect(t.find((x) => x.tipo === 'riego')?.detalle).toContain('Hace calor')
  })

})

describe('Hongos', () => {
  it('en floración con humedad', () => {
    const humedo = pronostico({ hoy: { lluviaMM: 0, humedad: 88 } })
    expect(tipos(auto({ dia: 40 }), humedo).has('hongos')).toBe(true)
    expect(tipos(auto({ dia: 40 }), pronostico()).has('hongos')).toBe(false) // seco
    expect(tipos(auto({ dia: 15 }), humedo).has('hongos')).toBe(false) // sin cogollos
    expect(tipos(auto({ dia: 40, ubicacion: 'interior' }), humedo).has('hongos')).toBe(false)
    expect(tipos(auto({ dia: 40, registros: [reg('revision', 0)] }), humedo).has('hongos')).toBe(false)
    expect(tipos(auto({ dia: 40, registros: [reg('revision', 1)] }), humedo).has('hongos')).toBe(true)
    // La lluvia sola (sin humedad alta) no moja los cogollos bajo el nylon.
    expect(tipos(auto({ dia: 40 }), pronostico({ ayer: { lluviaMM: 20 }, hoy: { lluviaMM: 20 } })).has('hongos')).toBe(false)
  })
})

describe('Avisos', () => {
  it('calor, frío y hongos; nada de lluvia', () => {
    const plantas = [auto({ dia: 3 }), auto({ dia: 45 })]
    const p = pronostico({ ayer: { lluviaMM: 0, humedad: 85 }, hoy: { lluviaMM: 0, maxC: 35, minC: 4 } })
    expect(AnalisisClima.avisos(p, plantas, hoyTest).map((a) => a.tipo)).toEqual(['calor', 'frio', 'hongos'])

    const lluvia = pronostico({ ayer: { lluviaMM: 15 }, hoy: { lluviaMM: 15, probLluvia: 90 } })
    expect(AnalisisClima.avisos(lluvia, plantas, hoyTest)).toEqual([])

    expect(AnalisisClima.avisos(undefined, plantas, hoyTest)).toEqual([])
  })

  it('resumen para la historia que se copia para una IA', () => {
    const p = pronostico({ ayer: { lluviaMM: 3 }, hoy: { lluviaMM: 1.5, probLluvia: 40, humedad: 72 }, maniana: { maxC: 28 } })
    const r = AnalisisClima.resumen(p, hoyTest)
    expect(r).toContain('humedad 72 %')
    expect(r).toContain('mañana máx 28 °C')
    expect(r).not.toContain('lluvia')
    const d = datosVacios()
    D.agregarPlanta(d, auto({ dia: 10 }))
    expect(Historia.texto(d.plantas[0], d, hoyTest, p)).toContain('Clima en CABA')
    expect(Historia.texto(d.plantas[0], d, hoyTest)).not.toContain('Clima en CABA')
    expect(Historia.texto(d.plantas[0], d, hoyTest)).toContain('techado con nylon')
    expect(Historia.texto(d.plantas[0], d, hoyTest)).toContain('Cosecha estimada desde el')
  })
})

describe('Acciones en grupo', () => {
  it('registrar en grupo', () => {
    const d = datosVacios()
    const a = auto({ dia: 10 }), b = auto({ dia: 12 })
    D.agregarPlanta(d, a); D.agregarPlanta(d, b)
    D.registrarEnGrupo(d, 'neem', [a.id, b.id], hoyTest)
    expect(d.plantas.filter((p) => ultimaFecha(p, ['neem']) !== undefined).length).toBe(2)
  })
})
