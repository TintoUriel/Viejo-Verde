import { describe, expect, it } from 'vitest'
import { HistorialChat, nuevoMensaje } from '../src/core/claude'
import { D, datosVacios, planta } from '../src/core/datos'
import { Estadisticas, lineaDeTiempo, rendimiento } from '../src/core/estadisticas'
import { nuevaPlanta, type Planta } from '../src/core/modelos'
import { auto, f, hace } from './ayudas'

function cosechada(nombre: string, variedad: string, germ: Date, cosecha: Date, humedos: number, secos?: number): Planta {
  const p = nuevaPlanta({ nombre, variedad, tipo: 'auto', semilla: 'feminizada', fechaGerminacion: germ })
  p.estado = secos === undefined ? 'secando' : 'terminada'
  p.cosecha = secos === undefined ? { fecha: cosecha, gramosHumedos: humedos }
    : { fecha: cosecha, gramosHumedos: humedos, fechaFrascos: cosecha, gramosSecos: secos }
  return p
}

const plantas = (): Planta[] => [
  cosechada('A', 'Banana Blaze', f(2026, 9, 1), f(2026, 11, 25), 200, 50),
  cosechada('B', 'Banana Blaze', f(2026, 9, 1), f(2026, 12, 1), 100, 30),
  cosechada('C', 'Otra', f(2026, 1, 1), f(2026, 4, 1), 150, 35),
  cosechada('D', '', f(2026, 9, 1), f(2026, 12, 10), 80),
  auto({ dia: 30 }), // activa: no cuenta
]

describe('Estadísticas', () => {
  it('cosechas ordenadas y ciclo', () => {
    const c = Estadisticas.cosechas(plantas())
    expect(c.map((x) => x.nombre)).toEqual(['D', 'B', 'A', 'C'])
    const a = c.find((x) => x.nombre === 'A')!
    expect(a.diasCiclo).toBe(85)
    expect(rendimiento(a)).toBe(0.25)
    const d = c.find((x) => x.nombre === 'D')!
    expect(rendimiento(d)).toBeUndefined()
    expect(d.variedad).toBe('Sin variedad')
  })

  it('totales y promedios', () => {
    const c = Estadisticas.cosechas(plantas())
    expect(Estadisticas.totalSecos(c)).toBe(115)
    expect(Estadisticas.promedioSecos(c)).toBeCloseTo(115 / 3, 3)
    expect(Estadisticas.promedioSecos([])).toBeUndefined()
  })

  it('por variedad', () => {
    const g = Estadisticas.porVariedad(Estadisticas.cosechas(plantas()))
    expect(g[0].nombre).toBe('Banana Blaze')
    expect(g[0].cosechas).toBe(2)
    expect(g[0].totalSecos).toBe(80)
    expect(g[0].promedioSecos).toBe(40)
  })

  it('temporadas', () => {
    expect(Estadisticas.temporada(f(2026, 11, 25))).toBe('2026/27')
    expect(Estadisticas.temporada(f(2026, 4, 1))).toBe('2025/26')
    expect(Estadisticas.temporada(f(2026, 7, 1))).toBe('2026/27')
    const g = Estadisticas.porTemporada(Estadisticas.cosechas(plantas()))
    expect(g.map((x) => x.nombre)).toEqual(['2026/27', '2025/26'])
    expect(g[0].totalSecos).toBe(80)
  })

  it('línea de tiempo de fotos', () => {
    const d = datosVacios()
    const p = auto({ dia: 20 })
    p.fotos = ['vieja.jpg'] // de antes, sin fecha
    D.agregarPlanta(d, p)
    D.agregarFoto(d, 'b.jpg', p.id, hace(2))
    D.agregarFoto(d, 'a.jpg', p.id, hace(10))
    const t = lineaDeTiempo(planta(d, p.id)!)
    expect(t.map((x) => x.nombre)).toEqual(['a.jpg', 'b.jpg', 'vieja.jpg'])
    expect(t[t.length - 1].fecha).toBeUndefined()
    D.quitarFoto(d, 'a.jpg', p.id)
    expect(planta(d, p.id)!.fechasFotos['a.jpg']).toBeUndefined()
  })

  it('recortar el chat', () => {
    const m = Array.from({ length: 100 }, (_, i) =>
      nuevoMensaje(i % 2 === 0 ? 'usuario' : 'asistente', String(i), i % 2 === 0 ? { imagenJPEG: 'AQ==' } : {}))
    const r = HistorialChat.recortar(m)
    expect(r.length).toBe(HistorialChat.maxMensajes)
    expect(r[r.length - 1].texto).toBe('99')
    expect(r.filter((x) => x.imagenJPEG !== undefined).length).toBe(HistorialChat.maxFotos)
    expect([...r].reverse().find((x) => x.rol === 'usuario')?.imagenJPEG).toBeDefined()
    // No toca el original.
    expect(m.filter((x) => x.imagenJPEG !== undefined).length).toBe(50)
  })
})
