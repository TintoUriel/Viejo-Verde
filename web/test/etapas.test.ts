import { describe, expect, it } from 'vitest'
import { Calendario } from '../src/core/calendario'
import { consejosEtapa } from '../src/core/consejos'
import { DE_CULTIVO, duracion, ETAPAS, Etapas, semana, type Etapa } from '../src/core/etapas'
import { nuevaPlanta } from '../src/core/modelos'
import { auto, f, hace, hoyTest } from './ayudas'

describe('Etapas', () => {
  it('automáticas por día', () => {
    const germ = f(2026, 11, 1)
    const casos: [number, Etapa][] = [
      [0, 'plantula'], [9, 'plantula'], [10, 'crecimiento'], [20, 'crecimiento'],
      [21, 'prefloracion'], [34, 'prefloracion'], [35, 'floracion'], [69, 'floracion'],
      [70, 'maduracion'], [83, 'maduracion'], [84, 'listaCosecha'], [200, 'listaCosecha'],
    ]
    const p = nuevaPlanta({ nombre: 'A', variedad: '', tipo: 'auto', semilla: 'feminizada', fechaGerminacion: germ })
    for (const [dia, esperada] of casos) {
      const e = Etapas.estado(p, Calendario.sumarDias(dia, germ))
      expect(e.etapa, `día ${dia}`).toBe(esperada)
      expect(e.dia).toBe(dia)
    }
  })

  it('día en etapa y semana', () => {
    const germ = f(2026, 11, 1)
    const p = nuevaPlanta({ nombre: 'A', variedad: '', tipo: 'auto', semilla: 'feminizada', fechaGerminacion: germ })
    const e = Etapas.estado(p, Calendario.sumarDias(23, germ))
    expect(e.diaEnEtapa).toBe(2) // prefloración empieza el 21
    expect(semana(e)).toBe(4)
    expect(semana(Etapas.estado(p, germ))).toBe(1)
    expect(semana(Etapas.estado(p, Calendario.sumarDias(6, germ)))).toBe(1)
    expect(semana(Etapas.estado(p, Calendario.sumarDias(7, germ)))).toBe(2)
  })

  it('antes de germinar es plántula', () => {
    const p = nuevaPlanta({ nombre: 'A', variedad: '', tipo: 'auto', semilla: 'feminizada', fechaGerminacion: f(2026, 11, 10) })
    expect(Etapas.etapa(p, f(2026, 11, 8))).toBe('plantula')
  })

  it('cuenta los días en hora de Buenos Aires', () => {
    const germ = Calendario.fecha(2026, 11, 1, 23, 30)
    const hoy = Calendario.fecha(2026, 11, 2, 0, 30)
    const p = nuevaPlanta({ nombre: 'A', variedad: '', tipo: 'auto', semilla: 'feminizada', fechaGerminacion: germ })
    expect(Etapas.estado(p, hoy).dia).toBe(1)
  })

  it('tramos de automáticas', () => {
    const t = Etapas.tramos('auto', f(2026, 11, 1))
    expect(t.map((x) => x.etapa)).toEqual(DE_CULTIVO)
    expect(t.map((x) => x.desdeDia)).toEqual([0, 10, 21, 35, 70, 84])
    expect(t[t.length - 1].hastaDia).toBe(98)
  })

  it('fotoperiódica: temporada completa', () => {
    const p = nuevaPlanta({ nombre: 'F', variedad: '', tipo: 'foto', semilla: 'feminizada', fechaGerminacion: f(2026, 10, 1) })
    const casos: [Date, Etapa][] = [
      [f(2026, 10, 5), 'plantula'], [f(2026, 10, 11), 'crecimiento'], [f(2026, 12, 15), 'crecimiento'],
      [f(2027, 1, 24), 'crecimiento'], [f(2027, 1, 25), 'prefloracion'], [f(2027, 2, 19), 'prefloracion'],
      [f(2027, 2, 20), 'floracion'], [f(2027, 4, 4), 'floracion'], [f(2027, 4, 5), 'maduracion'],
      [f(2027, 4, 24), 'maduracion'], [f(2027, 4, 25), 'listaCosecha'], [f(2027, 6, 1), 'listaCosecha'],
    ]
    for (const [hoy, esperada] of casos) expect(Etapas.etapa(p, hoy), Calendario.claveDia(hoy)).toBe(esperada)
  })

  it('foto germinada en julio termina el año siguiente', () => {
    const germ = f(2026, 7, 1)
    const p = nuevaPlanta({ nombre: 'F', variedad: '', tipo: 'foto', semilla: 'feminizada', fechaGerminacion: germ })
    expect(Etapas.etapa(p, f(2026, 12, 31))).toBe('crecimiento')
    expect(Etapas.etapa(p, f(2027, 1, 1))).toBe('crecimiento')
    expect(Etapas.de(p)[1].hastaDia).toBe(Calendario.dias(germ, f(2027, 1, 25)))
  })

  it('foto: la plántula respeta los primeros 10 días', () => {
    // Germinó el 20/01: el 25/01 sigue siendo plántula, después ya es prefloración.
    const p = nuevaPlanta({ nombre: 'F', variedad: '', tipo: 'foto', semilla: 'feminizada', fechaGerminacion: f(2027, 1, 20) })
    expect(Etapas.etapa(p, f(2027, 1, 25))).toBe('plantula')
    expect(Etapas.etapa(p, f(2027, 1, 29))).toBe('plantula') // día 9
    expect(Etapas.etapa(p, f(2027, 1, 30))).toBe('prefloracion') // día 10
    expect(duracion(Etapas.de(p)[1])).toBe(0) // sin crecimiento
  })

  it('foto germinada en marzo: misma temporada', () => {
    const p = nuevaPlanta({ nombre: 'F', variedad: '', tipo: 'foto', semilla: 'feminizada', fechaGerminacion: f(2027, 3, 1) })
    expect(Etapas.etapa(p, f(2027, 3, 5))).toBe('plantula')
    expect(Etapas.etapa(p, f(2027, 3, 15))).toBe('floracion')
    expect(Etapas.etapa(p, f(2027, 4, 10))).toBe('maduracion')
  })

  it('estados post cosecha', () => {
    const p = auto({ dia: 100 })
    p.estado = 'secando'
    p.cosecha = { fecha: hace(5), gramosHumedos: 100 }
    let e = Etapas.estado(p, hoyTest)
    expect(e.etapa).toBe('secado')
    expect(e.diaEnEtapa).toBe(5)

    p.estado = 'curando'
    p.cosecha.fechaFrascos = hace(2)
    e = Etapas.estado(p, hoyTest)
    expect(e.etapa).toBe('curado')
    expect(e.diaEnEtapa).toBe(2)

    p.estado = 'terminada'
    expect(Etapas.etapa(p, hoyTest)).toBe('terminada')
    p.estado = 'descartada'
    expect(Etapas.etapa(p, hoyTest)).toBe('descartada')
  })

  it('todas las etapas tienen consejos', () => {
    for (const e of ETAPAS) expect(consejosEtapa(e).length, e).toBeGreaterThan(0)
  })
})
