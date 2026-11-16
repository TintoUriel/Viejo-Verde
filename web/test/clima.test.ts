import { describe, expect, it } from 'vitest'
import { AnalisisClima, diaClima, diaClimaDesde, OpenMeteo, type DiaClima, type Pronostico } from '../src/core/clima'
import { ContextoAsistente } from '../src/core/contexto'
import { D, datosVacios, planta } from '../src/core/datos'
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
  it('si ayer llovió no pide regar en el patio', () => {
    const p = auto({ dia: 15, registros: [reg('riego', 3)] }) // le tocaba Top Veg
    const llovio = pronostico({ ayer: { lluviaMM: 8 } })
    const t = tipos(p, llovio)
    expect(t.has('riego')).toBe(false)
    expect(t.has('fertilizante')).toBe(false)
    // Adentro no le llueve.
    const adentro = auto({ dia: 15, ubicacion: 'interior', registros: [reg('riego', 3)] })
    expect(tipos(adentro, llovio).has('fertilizante')).toBe(true)
  })

  it('una lluvia liviana no cuenta', () => {
    const p = auto({ dia: 5, registros: [reg('riego', 2)] })
    expect(tipos(p, pronostico({ ayer: { lluviaMM: 2 } })).has('riego')).toBe(true)
  })

  it('con calor pide regar al día siguiente', () => {
    const p = auto({ dia: 5, registros: [reg('riego', 1)] })
    expect(tipos(p).has('riego')).toBe(false)
    const calor = pronostico({ hoy: { lluviaMM: 0, maxC: 34 } })
    const t = Tareas.generar({ plantas: [p], hoy: hoyTest, clima: calor })
    expect(t.find((x) => x.tipo === 'riego')?.detalle).toContain('Hace calor')
  })

  it('la lluvia pronosticada agrega una nota', () => {
    const p = auto({ dia: 5, registros: [reg('riego', 2)] })
    const lluvia = pronostico({ hoy: { lluviaMM: 10, probLluvia: 80 } })
    const riego = Tareas.generar({ plantas: [p], hoy: hoyTest, clima: lluvia }).find((x) => x.tipo === 'riego')
    expect(riego?.detalle).toContain('10 mm de lluvia hoy')
    // Con poca probabilidad no se avisa.
    const dudosa = pronostico({ hoy: { lluviaMM: 10, probLluvia: 30 } })
    const r2 = Tareas.generar({ plantas: [p], hoy: hoyTest, clima: dudosa }).find((x) => x.tipo === 'riego')
    expect(r2?.detalle).not.toContain('lluvia')
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
  })
})

describe('Avisos', () => {
  it('calor, frío, hongos, lluvia', () => {
    const plantas = [auto({ dia: 3 }), auto({ dia: 45 })]
    const p = pronostico({ ayer: { lluviaMM: 0, humedad: 85 }, hoy: { lluviaMM: 0, maxC: 35, minC: 4 } })
    expect(AnalisisClima.avisos(p, plantas, hoyTest).map((a) => a.tipo)).toEqual(['calor', 'frio', 'hongos'])

    const lluvia = pronostico({ hoy: { lluviaMM: 15, probLluvia: 90 } })
    expect(AnalisisClima.avisos(lluvia, plantas, hoyTest)[0]?.tipo).toBe('lluvia')
    const llovio = pronostico({ ayer: { lluviaMM: 15 } })
    expect(AnalisisClima.avisos(llovio, plantas, hoyTest)[0]?.tipo).toBe('llovio')

    expect(AnalisisClima.avisos(undefined, plantas, hoyTest)).toEqual([])
  })

  it('resumen para el asistente', () => {
    const p = pronostico({ ayer: { lluviaMM: 3 }, hoy: { lluviaMM: 1.5, probLluvia: 40 } })
    const r = AnalisisClima.resumen(p, hoyTest)
    expect(r).toContain('lluvia hoy 1,5 mm (40 %)')
    expect(r).toContain('lluvia ayer 3 mm')
    const d = datosVacios()
    D.agregarPlanta(d, auto({ dia: 10 }))
    expect(ContextoAsistente.contexto(d, hoyTest, p)).toContain('Clima en CABA')
    expect(ContextoAsistente.contexto(d, hoyTest)).toContain('cosecha estimada desde el')
  })
})

describe('Llovió y acciones en grupo', () => {
  it('"Llovió" riega solo las activas del patio', () => {
    const d = datosVacios()
    const a = auto({ dia: 10, nombre: 'A' })
    const b = auto({ dia: 10, ubicacion: 'interior', nombre: 'B' })
    const c = auto({ dia: 100, nombre: 'C' }); c.estado = 'secando'
    for (const p of [a, b, c]) D.agregarPlanta(d, p)
    expect(D.llovio(d, hoyTest, 12)).toBe(1)
    const riego = planta(d, a.id)?.registros.find((r) => r.tipo === 'riego')
    expect(riego?.producto).toBe('Lluvia')
    expect(riego?.nota).toBe('12 mm')
    expect(planta(d, b.id)?.registros.find((r) => r.tipo === 'riego')).toBeUndefined()
    // Cuenta como riego: ya no aparece la tarea.
    expect(Tareas.generar({ plantas: d.plantas, hoy: hoyTest }).some((t) => t.plantaID === a.id && t.tipo === 'riego')).toBe(false)
  })

  it('registrar en grupo', () => {
    const d = datosVacios()
    const a = auto({ dia: 10 }), b = auto({ dia: 12 })
    D.agregarPlanta(d, a); D.agregarPlanta(d, b)
    D.registrarEnGrupo(d, 'neem', [a.id, b.id], hoyTest)
    expect(d.plantas.filter((p) => ultimaFecha(p, ['neem']) !== undefined).length).toBe(2)
  })
})
