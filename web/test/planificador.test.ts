import { describe, expect, it } from 'vitest'
import { Calendario } from '../src/core/calendario'
import { DE_CULTIVO } from '../src/core/etapas'
import { nuevasEnSemana, Planificador, semanaExcedida } from '../src/core/planificador'
import { auto, f, hoyTest } from './ayudas'

describe('Planificador', () => {
  it('fechas clave de una auto', () => {
    const germ = f(2026, 11, 20)
    const f2 = Planificador.fechasClave('auto', germ)
    expect(f2.map((x) => x.etapa)).toEqual(DE_CULTIVO)
    expect(f2[3].fecha).toEqual(Calendario.sumarDias(35, germ)) // floración
    expect(Planificador.cosechaEstimada('auto', germ)).toEqual(Calendario.sumarDias(84, germ))
  })

  it('la cosecha estimada de una foto es el 25 de abril', () => {
    const c = Planificador.cosechaEstimada('foto', f(2026, 10, 1))
    expect(Calendario.mismoDia(c, f(2027, 4, 25))).toBe(true)
  })

  it('la proyección cuenta la floración y supone la cosecha', () => {
    // Auto en día 30: entra en flor el día 35 (en 5 días) y se asume cosechada al día 98.
    const proy = Planificador.proyeccion([auto({ dia: 30 })], [], hoyTest, 12)
    expect(proy[0].actuales).toBe(1) // los días 35+ caen en la primera semana
    expect(proy[8].actuales).toBe(1) // día 86–92: lista para cosecha
    expect(proy[10].actuales).toBe(0) // día 100+: cosechada
    expect(proy.every((s) => !semanaExcedida(s))).toBe(true)
  })

  it('una planta pasada se asume cosechada en una semana', () => {
    const proy = Planificador.proyeccion([auto({ dia: 150 })], [], hoyTest, 3)
    expect(proy.map((s) => s.actuales)).toEqual([1, 0, 0])
  })

  it('detecta que te pasás del cupo', () => {
    const actuales = Array.from({ length: 7 }, () => auto({ dia: 20 })) // 7 que florecen pronto
    const nuevas = Planificador.hipoteticas('auto', 4, hoyTest)
    const excedida = Planificador.primeraExcedida(Planificador.proyeccion(actuales, nuevas, hoyTest))
    expect(excedida).toBeDefined()
    expect(excedida?.total).toBe(11)
    expect(excedida && nuevasEnSemana(excedida)).toBe(4)
  })

  it('lugar libre', () => {
    const actuales = Array.from({ length: 7 }, () => auto({ dia: 20 }))
    expect(Planificador.lugarLibre(actuales, 'auto', hoyTest, hoyTest)).toBe(2)
    expect(Planificador.lugarLibre([], 'auto', hoyTest, hoyTest)).toBe(9)
    // Si las actuales ya están cosechadas cuando florecen las nuevas, hay lugar para 9.
    const viejas = Array.from({ length: 9 }, () => auto({ dia: 80 }))
    expect(Planificador.lugarLibre(viejas, 'auto', Calendario.sumarDias(30, hoyTest), hoyTest)).toBe(9)
  })

  it('no cuenta las que no están activas', () => {
    const p = auto({ dia: 40 })
    p.estado = 'secando'
    expect(Planificador.proyeccion([p], [], hoyTest, 1)[0].actuales).toBe(0)
  })
})
