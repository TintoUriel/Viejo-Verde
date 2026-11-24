import { describe, expect, it } from 'vitest'
import { Agenda } from '../src/core/agenda'
import { Calendario } from '../src/core/calendario'
import { D, datosVacios, leerDatos } from '../src/core/datos'
import { Historia } from '../src/core/historia'
import { nuevoRegistro } from '../src/core/modelos'
import { Eventos } from '../src/core/sync/eventos'
import { TE } from '../src/core/sync/modelos'
import { reconstruir, type FilaRegistro } from '../src/core/sync/reconstruir'
import { aJSON } from '../src/core/util'
import { auto, hace, hoyTest, reg } from './ayudas'

const tipos = (dias: ReturnType<typeof Agenda.proximos>) => dias.map((d) => d.tareas.map((t) => t.tipo).sort().join(','))

describe('Próximos 7 días', () => {
  it('el riego vuelve cada 2 días (lo de hoy se da por hecho hoy)', () => {
    // Día 12 (crecimiento), regada hoy, fertilizada hace 3 días, neem hace 2.
    const p = auto({ dia: 12, registros: [reg('riego', 0), reg('fertilizante', 3), reg('neem', 2)] })
    const dias = Agenda.proximos({ plantas: [p], hoy: hoyTest })
    expect(dias).toHaveLength(7)
    expect(dias.map((d) => Calendario.dias(hoyTest, d.fecha))).toEqual([1, 2, 3, 4, 5, 6, 7])
    const t = tipos(dias)
    // Día +2: riego; día +4: toca fertilizante (6 días desde el último); día +5: neem (7 días); día +6: riego.
    expect(t[0]).toBe('')
    expect(t[1]).toBe('riego')
    expect(t[3]).toBe('fertilizante')
    expect(t[4]).toBe('neem')
    expect(t[5]).toBe('riego')
  })

  it('lo pendiente de hoy no se repite mañana', () => {
    const p = auto({ dia: 12, registros: [reg('riego', 5), reg('neem', 1)] })
    const dias = Agenda.proximos({ plantas: [p], hoy: hoyTest })
    // Hoy toca regar (con fertilizante, nunca se fertilizó): se da por hecho hoy, mañana no aparece.
    expect(dias[0].tareas.some((t) => t.tipo === 'riego' || t.tipo === 'fertilizante')).toBe(false)
    expect(dias[1].tareas.some((t) => t.tipo === 'riego')).toBe(true)
  })

  it('marca cuándo empieza cada etapa y la revisión de tricomas aparece una sola vez', () => {
    // Automática en el día 68: la maduración empieza el día 70 (pasado mañana).
    const p = auto({ dia: 68, registros: [reg('riego', 0), reg('fertilizante', 0)] })
    const dias = Agenda.proximos({ plantas: [p], hoy: hoyTest })
    expect(dias[1].hitos.map((h) => h.etapa)).toEqual(['maduracion'])
    expect(dias.flatMap((d) => d.hitos)).toHaveLength(1)
    const conTricomas = dias.filter((d) => d.tareas.some((t) => t.tipo === 'cosecha'))
    expect(conTricomas.map((d) => Calendario.dias(hoyTest, d.fecha))).toEqual([2])
  })

  it('no toca las plantas de verdad', () => {
    const p = auto({ dia: 12 })
    const antes = aJSON(p)
    Agenda.proximos({ plantas: [p], hoy: hoyTest })
    expect(aJSON(p)).toBe(antes)
  })
})

describe('pH del drenaje', () => {
  it('se guarda en el riego y vuelve igual del JSON', () => {
    const d = datosVacios()
    const p = auto({ dia: 20 })
    D.agregarPlanta(d, p)
    D.registrar(d, 'riego', p.id, hace(0), { aguaML: 1500, phDrenaje: 6.4 })
    const vuelta = leerDatos(JSON.parse(aJSON(d)))
    expect(vuelta.plantas[0].registros.find((r) => r.tipo === 'riego')?.phDrenaje).toBe(6.4)
  })

  it('anotarlo después es una fila "pH del drenaje" (no una corrección), y cambiarlo sí es corrección', () => {
    const d = datosVacios()
    const p = auto({ dia: 20 })
    D.agregarPlanta(d, p)
    D.registrar(d, 'riego', p.id, hace(0), { aguaML: 1500 })
    const riego = d.plantas[0].registros.find((r) => r.tipo === 'riego')!

    const antes = structuredClone(d)
    D.editarRegistro(d, { ...riego, phDrenaje: 6.8 }, p.id)
    const ev = Eventos.detectar(antes, d, hoyTest, 'web')
    expect(ev.map((e) => e.tipo)).toEqual([TE.phDrenaje])
    expect(ev[0].id).toBe(`ph-${riego.id}`)
    expect([ev[0].cantidad, ev[0].unidad]).toEqual([6.8, 'pH'])

    const antes2 = structuredClone(d)
    D.editarRegistro(d, { ...riego, phDrenaje: 6.2 }, p.id)
    expect(Eventos.detectar(antes2, d, hoyTest, 'web').map((e) => e.tipo)).toEqual([TE.correccion])

    // "Sincronizar todo" manda el mismo ID (no se duplica en la planilla).
    expect(Eventos.historial(d, hoyTest, 'web').filter((e) => e.tipo === TE.phDrenaje).map((e) => e.id)).toEqual([`ph-${riego.id}`])
  })

  it('se rearma desde la planilla', () => {
    const p = auto({ dia: 20, registros: [nuevoRegistro(hace(1), 'riego', { aguaML: 1000, phDrenaje: 6.6 })] })
    const filas = [...p.registros.flatMap((r) => [Eventos.evento(r, p, 'web'), Eventos.ph(r, p, 'web')])]
      .filter((e) => e !== undefined)
      .map((e) => ({ ...e, fecha: e!.fecha.toISOString() }) as unknown as FilaRegistro)
    const filaPlanta = { ...Eventos.fila(p, hoyTest), germinacion: Calendario.claveDia(p.fechaGerminacion) }
    const x = reconstruir(filas, [filaPlanta as never])
    expect(x.plantas[0].registros.find((r) => r.tipo === 'riego')?.phDrenaje).toBe(6.6)
  })
})

describe('Historia para una IA', () => {
  it('trae los datos, el historial en orden con día y etapa, el pH y los problemas', () => {
    const d = datosVacios()
    const p = auto({ dia: 30, nombre: 'Candy 1', registros: [
      nuevoRegistro(hace(5), 'fertilizante', { producto: 'Top Bloom', aguaML: 2000, fertilizanteML: 2, mlPorLitro: 1, nota: '2 ml en 2 L' }),
      nuevoRegistro(hace(2), 'riego', { aguaML: 1500, phDrenaje: 6.4 }),
      nuevoRegistro(hace(1), 'problema', { nota: 'Hojas de abajo amarillas' }),
    ] })
    D.agregarPlanta(d, p)
    const t = Historia.texto(d.plantas[0], d, hoyTest)
    expect(t).toContain('Nombre: Candy 1')
    expect(t).toContain('Etapa actual: Prefloración, día 30 (semana 5)')
    expect(t).toContain('pH del drenaje (el agua que sale por abajo): 6,4')
    expect(t).toMatch(/día 0 · Plántula · Germinación/)
    expect(t).toMatch(/día 25 · Prefloración · Fertilizante: Top Bloom · 2 ml \(1 ml\/L\) · 2 L de agua\n/)
    expect(t).toMatch(/día 28 · Prefloración · Riego: 1,5 L de agua · pH del drenaje 6,4/)
    expect(t).toMatch(/PROBLEMA: «Hojas de abajo amarillas»/)
    // Del más viejo al más nuevo.
    expect(t.indexOf('Germinación')).toBeLessThan(t.indexOf('PROBLEMA'))
  })
})
