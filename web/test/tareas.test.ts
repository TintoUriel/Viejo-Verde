import { describe, expect, it } from 'vitest'
import { nuevoPaquete, type PaqueteSemillas, type Planta } from '../src/core/modelos'
import { idTarea, Tareas, type Tarea, type TipoTarea } from '../src/core/tareas'
import { auto, hace, hoyTest, reg } from './ayudas'

const tareas = (plantas: Planta[], paquetes: PaqueteSemillas[] = [], pospuestas: Record<string, Date> = {}): Tarea[] =>
  Tareas.generar({ plantas, paquetes, hoy: hoyTest, pospuestas })

const tipos = (p: Planta, paquetes: PaqueteSemillas[] = []): Set<TipoTarea> => new Set(tareas([p], paquetes).map((t) => t.tipo))

describe('Tareas: riego y fertilizante', () => {
  it('riego a los 2 días', () => {
    const t = tipos(auto({ dia: 15, registros: [reg('riego', 2), reg('fertilizante', 3, 'Top Veg')] }))
    expect(t.has('riego')).toBe(true)
    expect(t.has('fertilizante')).toBe(false)
  })

  it('sin riego si regó ayer', () => {
    const t = tipos(auto({ dia: 15, registros: [reg('riego', 1)] }))
    expect(t.has('riego')).toBe(false)
    expect(t.has('fertilizante')).toBe(false)
  })

  it('fertilizar reemplaza al riego', () => {
    const t = tareas([auto({ dia: 15, registros: [reg('riego', 3)] })])
    const fert = t.find((x) => x.tipo === 'fertilizante')
    expect(fert).toBeDefined()
    expect(fert?.dosis?.fertilizante).toBe('topVeg')
    expect(fert?.detalle).toContain('mitad de la dosis')
    expect(fert?.acciones[0]).toBe('fertilice')
    expect(t.some((x) => x.tipo === 'riego')).toBe(false)
  })

  it('el fertilizante cuenta como riego', () => {
    expect(tipos(auto({ dia: 15, registros: [reg('fertilizante', 1, 'Top Veg')] })).has('riego')).toBe(false)
  })

  it('Top Bloom en floración cada 6 días', () => {
    const a = auto({ dia: 40, registros: [reg('riego', 2), reg('fertilizante', 6)] })
    expect(tareas([a]).find((x) => x.tipo === 'fertilizante')?.dosis?.fertilizante).toBe('topBloom')
    const b = auto({ dia: 40, registros: [reg('riego', 2), reg('fertilizante', 5)] })
    expect(tipos(b).has('fertilizante')).toBe(false)
    expect(tipos(b).has('riego')).toBe(true)
  })

  it('Top Bloom en prefloración', () => {
    const p = auto({ dia: 25, registros: [reg('riego', 2)] })
    expect(tareas([p]).find((x) => x.tipo === 'fertilizante')?.dosis?.fertilizante).toBe('topBloom')
  })

  it('plántula: solo agua', () => {
    const t = tareas([auto({ dia: 5, registros: [reg('riego', 2)] })])
    expect(t.some((x) => x.tipo === 'fertilizante')).toBe(false)
    expect(t.some((x) => x.tipo === 'neem')).toBe(false)
    const riego = t.find((x) => x.tipo === 'riego')
    expect(riego?.detalle).toContain('sin fertilizante')
    expect(riego?.dosis?.aguaML).toBe(200) // 100 + 15×5 = 175 → 200
  })

  it('maduración: solo agua', () => {
    const t = tareas([auto({ dia: 75, registros: [reg('riego', 2), reg('fertilizante', 20)] })])
    expect(t.some((x) => x.tipo === 'fertilizante')).toBe(false)
    expect(t.find((x) => x.tipo === 'riego')?.detalle).toContain('Solo agua')
  })

  it('el primer riego cuenta desde la germinación', () => {
    expect(tipos(auto({ dia: 1 })).has('riego')).toBe(false)
    expect(tipos(auto({ dia: 2 })).has('riego')).toBe(true)
  })
})

describe('Tareas: neem', () => {
  it('semanal en crecimiento', () => {
    expect(tipos(auto({ dia: 15 })).has('neem')).toBe(true)
    expect(tipos(auto({ dia: 15, registros: [reg('neem', 7)] })).has('neem')).toBe(true)
    expect(tipos(auto({ dia: 15, registros: [reg('neem', 3)] })).has('neem')).toBe(false)
    expect(tipos(auto({ dia: 25 })).has('neem')).toBe(true) // prefloración
  })

  it('nunca en floración', () => {
    expect(tipos(auto({ dia: 40 })).has('neem')).toBe(false)
    expect(tipos(auto({ dia: 75 })).has('neem')).toBe(false)
  })
})

describe('Tareas: sexado y macho', () => {
  it('sexado de regulares desde el día 21', () => {
    expect(tipos(auto({ dia: 21, semilla: 'regular' })).has('sexado')).toBe(true)
    expect(tipos(auto({ dia: 20, semilla: 'regular' })).has('sexado')).toBe(false)
    expect(tipos(auto({ dia: 25, semilla: 'feminizada' })).has('sexado')).toBe(false)
    expect(tipos(auto({ dia: 25, semilla: 'regular', sexo: 'hembra' })).has('sexado')).toBe(false)
    expect(tareas([auto({ dia: 21, semilla: 'regular' })]).find((x) => x.tipo === 'sexado')?.acciones).toEqual(['hembra', 'macho'])
  })

  it('macho en el patio es urgente y va primero', () => {
    const macho = auto({ dia: 27, semilla: 'regular', sexo: 'macho', ubicacion: 'patio', nombre: 'Zeta' })
    const otra = auto({ dia: 15, nombre: 'Alfa' })
    const t = tareas([otra, macho])
    expect(t[0].tipo).toBe('machoPatio')
    expect(t[0].urgente).toBe(true)
    expect(t[0].acciones).toEqual(['moverAdentro'])
  })

  it('macho adentro pide juntar polen', () => {
    const m = auto({ dia: 30, semilla: 'regular', sexo: 'macho', ubicacion: 'interior' })
    expect(tipos(m).has('machoPolen')).toBe(true)
    expect(tipos(m).has('machoPatio')).toBe(false)
    m.polenJuntado = true
    expect(tipos(m).has('machoPolen')).toBe(false)
  })

  it('el macho no pide cosecha', () => {
    expect(tipos(auto({ dia: 75, semilla: 'regular', sexo: 'macho', ubicacion: 'interior' })).has('cosecha')).toBe(false)
  })
})

describe('Tareas: semillas y cosecha', () => {
  it('semillas 35 días después de polinizar', () => {
    const p = auto({ dia: 70 })
    p.fechaPolinizacion = hace(35)
    expect(tipos(p).has('semillas')).toBe(true)
    p.fechaPolinizacion = hace(34)
    expect(tipos(p).has('semillas')).toBe(false)

    p.fechaPolinizacion = hace(40)
    const pack = nuevoPaquete({ nombre: 'x', banco: 'Propias', tipo: 'auto', semilla: 'regular', cantidad: 10,
      fechaCompra: hoyTest, propias: true, plantaMadreID: p.id })
    expect(tipos(p, [pack]).has('semillas')).toBe(false)
  })

  it('cosecha en maduración y urgente al final', () => {
    const mad = tareas([auto({ dia: 75 })]).find((x) => x.tipo === 'cosecha')
    expect(mad).toBeDefined()
    expect(mad?.urgente).toBe(false)
    expect(tareas([auto({ dia: 90 })]).find((x) => x.tipo === 'cosecha')?.urgente).toBe(true)
    expect(tipos(auto({ dia: 50 })).has('cosecha')).toBe(false)
  })
})

describe('Tareas: secado y curado', () => {
  it('secado desde el día 7', () => {
    const p = auto({ dia: 100 })
    p.estado = 'secando'
    p.cosecha = { fecha: hace(7), gramosHumedos: 150 }
    expect(tareas([p]).map((x) => x.tipo)).toEqual(['secado'])
    p.cosecha = { fecha: hace(6), gramosHumedos: 150 }
    expect(tareas([p])).toEqual([])
  })

  const curando = (frascosHace: number, aperturas: number[] = []): Planta => {
    const p = auto({ dia: 120, registros: aperturas.map((d) => reg('curado', d)) })
    p.estado = 'curando'
    p.cosecha = { fecha: hace(frascosHace + 10), gramosHumedos: 200, fechaFrascos: hace(frascosHace), gramosSecos: 50 }
    return p
  }

  it('primeras dos semanas: todos los días', () => {
    expect(tareas([curando(3)])[0]?.acciones).toEqual(['abriFrascos'])
    expect(tareas([curando(3, [0])])).toEqual([])
    expect(tareas([curando(3, [1])]).length).toBeGreaterThan(0)
  })

  it('semanas 3 y 4: cada dos o tres días', () => {
    expect(tareas([curando(20, [1])])).toEqual([])
    expect(tareas([curando(20, [2])]).length).toBeGreaterThan(0)
    expect(tareas([curando(20)]).length).toBeGreaterThan(0)
  })

  it('curado completo al día 28', () => {
    expect(tareas([curando(28, [0])])[0]?.acciones).toEqual(['terminar'])
  })

  it('las aperturas de antes de los frascos no cuentan', () => {
    // Un registro "curado" viejo (de otra cosecha) no tapa la tarea.
    expect(tareas([curando(3, [10])]).length).toBeGreaterThan(0)
  })
})

describe('Tareas: general', () => {
  it('"Hoy no" oculta solo por hoy', () => {
    const p = auto({ dia: 5, registros: [reg('riego', 3)] })
    const id = idTarea('riego', p.id)
    expect(tareas([p], [], { [id]: hoyTest }).some((x) => x.tipo === 'riego')).toBe(false)
    expect(tareas([p], [], { [id]: hace(1) }).some((x) => x.tipo === 'riego')).toBe(true)
  })

  it('las terminadas no generan tareas', () => {
    const p = auto({ dia: 150 })
    p.estado = 'terminada'
    expect(tareas([p])).toEqual([])
    p.estado = 'descartada'
    expect(tareas([p])).toEqual([])
  })
})
