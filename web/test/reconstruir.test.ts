import { describe, expect, it } from 'vitest'
import { D, datosVacios, planta, type Datos } from '../src/core/datos'
import { nuevoPaquete } from '../src/core/modelos'
import { Eventos } from '../src/core/sync/eventos'
import type { EventoSync, PlantaSync } from '../src/core/sync/modelos'
import { limpiarFila, reconstruir, tieneDatos, type FilaPlanta, type FilaRegistro } from '../src/core/sync/reconstruir'
import { iso } from '../src/core/util'
import { auto, hace, hoyTest } from './ayudas'

const app = 'web 1.0'

/** Lo que devuelve el Apps Script al leer las hojas: fechas ISO, celdas vacías como "". */
const comoFila = (e: EventoSync): FilaRegistro =>
  limpiarFila({ ...e, fecha: iso(e.fecha), plantaID: e.plantaID ?? '', cantidad: e.cantidad ?? '' })
const comoFilaPlanta = (p: PlantaSync): FilaPlanta => limpiarFila({ ...p, actualizado: iso(p.actualizado) })

/** Registra todo como lo haría la app y devuelve lo que quedó en la planilla. */
function pasarPorLaPlanilla(cambios: ((d: Datos) => void)[]): { datos: Datos; eventos: EventoSync[]; plantas: Map<string, PlantaSync> } {
  const d = datosVacios()
  const eventos: EventoSync[] = []
  const plantas = new Map<string, PlantaSync>()
  for (const cambio of cambios) {
    const antes = structuredClone(d)
    cambio(d)
    eventos.push(...Eventos.detectar(antes, d, hoyTest, app))
    for (const f of Eventos.filasCambiadas(antes, d, hoyTest)) plantas.set(f.id, f)
  }
  eventos.push(...Eventos.cambiosDeEtapa(d, hoyTest, app))
  return { datos: d, eventos, plantas }
}

describe('Reconstruir desde la planilla', () => {
  it('packs con alta, germinación, corrección y borrado', () => {
    const pack = nuevoPaquete({ nombre: 'Kush', banco: 'Banco Uno', tipo: 'auto', semilla: 'feminizada', cantidad: 3, fechaCompra: hace(10) })
    const otro = nuevoPaquete({ nombre: 'Haze', banco: 'Banco Dos', tipo: 'foto', semilla: 'regular', cantidad: 5, fechaCompra: hace(9) })
    const viejo = nuevoPaquete({ nombre: 'Viejo', banco: 'X', tipo: 'auto', semilla: 'feminizada', cantidad: 1, fechaCompra: hace(9) })
    const p = auto({ dia: 5, nombre: 'Nueva' })
    const r = pasarPorLaPlanilla([
      (d) => D.agregarPaquete(d, pack),
      (d) => D.agregarPaquete(d, otro),
      (d) => D.agregarPaquete(d, viejo),
      (d) => D.agregarPlanta(d, p, pack.id),
      (d) => D.actualizarPaquete(d, { ...d.paquetes[0], banco: 'Banco Uno Bien' }),
      (d) => D.ajustarCantidad(d, otro.id, -2),
      (d) => D.borrarPaquete(d, viejo.id),
    ])
    const x = reconstruir(r.eventos.map(comoFila), [...r.plantas.values()].map(comoFilaPlanta))
    expect(x.paquetes.map((k) => [k.id, k.nombre, k.banco, k.tipo, k.semilla, k.cantidad])).toEqual([
      [pack.id, 'Kush', 'Banco Uno Bien', 'auto', 'feminizada', 2],
      [otro.id, 'Haze', 'Banco Dos', 'foto', 'regular', 3],
    ])
  })

  it('ida y vuelta: plantas, historial, cosecha, polen y semillas propias', () => {
    const p = auto({ dia: 95, nombre: 'Banana' })
    const macho = auto({ dia: 40, semilla: 'regular', nombre: 'Macho' })
    const r = pasarPorLaPlanilla([
      (d) => D.agregarPlanta(d, p),
      (d) => D.agregarPlanta(d, macho),
      (d) => D.registrar(d, 'riego', p.id, hace(30), { aguaML: 1500 }),
      (d) => D.registrar(d, 'fertilizante', p.id, hace(28), { producto: 'Top Bloom', nota: '3 ml en 3 L', aguaML: 3000, fertilizanteML: 3, mlPorLitro: 1 }),
      (d) => D.registrar(d, 'neem', p.id, hace(27), { producto: 'Jabón potásico con neem' }),
      (d) => D.registrar(d, 'problema', p.id, hace(26), { nota: 'Hojas amarillas' }),
      (d) => D.registrar(d, 'nota', p.id, hace(25), { nota: 'Esta se borra' }),
      (d) => { const r2 = planta(d, p.id)!.registros.find((x) => x.nota === 'Esta se borra')!; D.borrarRegistro(d, r2.id, p.id) },
      (d) => D.llovio(d, hace(24), 8),
      (d) => D.marcarSexo(d, 'macho', macho.id, hace(20)),
      (d) => D.moverAdentro(d, macho.id, hace(20)),
      (d) => { D.juntarPolen(d, macho.id, hace(15)) },
      (d) => D.polinizar(d, p.id, hace(14)),
      (d) => D.cosechar(d, p.id, hace(10), 200),
      (d) => D.pasarAFrascos(d, p.id, hace(3), 48),
      (d) => D.registrar(d, 'curado', p.id, hace(2)),
      (d) => { D.registrarSemillasPropias(d, p.id, 20, hace(1)) },
    ])
    const x = reconstruir(r.eventos.map(comoFila), [...r.plantas.values()].map(comoFilaPlanta))
    const original = r.datos

    expect(x.plantas.map((q) => q.nombre)).toEqual(['Banana', 'Macho'])
    const b = planta(x, p.id)!
    const bo = planta(original, p.id)!
    expect(b.estado).toBe('curando')
    expect(b.tipo).toBe('auto')
    expect(b.cosecha?.gramosHumedos).toBe(200)
    expect(b.cosecha?.gramosSecos).toBe(48)
    expect(b.cosecha?.fechaFrascos).toEqual(hace(3))
    expect(b.fechaPolinizacion).toEqual(hace(14))
    // Mismos registros, con los mismos IDs (así "Sincronizar todo" no duplica nada). Las notas automáticas
    // de polen y semillas propias no viajan como registro (las cubre su propio evento): vuelven con otro ID.
    const automatica = (g: (typeof b.registros)[number]) => g.subtipo === 'semillasPropias' || g.subtipo === 'polen'
    const resumen = (q: typeof b) => q.registros.filter((g) => !automatica(g))
      .map((g) => `${g.id}|${g.tipo}|${g.aguaML ?? ''}|${g.producto ?? ''}|${g.subtipo ?? ''}`).sort()
    expect(resumen(b)).toEqual(resumen(bo))
    expect(b.registros.filter(automatica).map((g) => g.nota)).toEqual(bo.registros.filter(automatica).map((g) => g.nota))
    const fert = b.registros.find((g) => g.tipo === 'fertilizante')!
    expect([fert.fertilizanteML, fert.mlPorLitro, fert.aguaML, fert.nota]).toEqual([3, 1, 3000, '3 ml en 3 L'])
    expect(b.registros.find((g) => g.producto === 'Lluvia')?.nota).toBe('8 mm')
    expect(b.registros.some((g) => g.nota === 'Esta se borra')).toBe(false)

    const m = planta(x, macho.id)!
    expect([m.sexo, m.ubicacion, m.polenJuntado]).toEqual(['macho', 'interior', true])
    expect(x.polenes.map((q) => [q.id, q.plantaOrigenID, q.plantaOrigen])).toEqual([[original.polenes[0].id, macho.id, 'Macho (Banana Blaze)']])
    expect(x.paquetes.map((k) => [k.nombre, k.propias, k.plantaMadreID, k.cantidad])).toEqual([['Banana Blaze propias', true, p.id, 20]])
  })

  it('las plantas borradas no vuelven', () => {
    const p = auto({ dia: 3, nombre: 'Borrada' })
    const r = pasarPorLaPlanilla([(d) => D.agregarPlanta(d, p), (d) => D.borrarPlanta(d, p.id)])
    const x = reconstruir(r.eventos.map(comoFila), [...r.plantas.values()].map(comoFilaPlanta))
    expect(x.plantas).toEqual([])
    expect(tieneDatos(x)).toBe(false)
  })

  it('tolera filas raras (sin fecha, celdas vacías, tipos desconocidos)', () => {
    const x = reconstruir(
      [limpiarFila({ id: 'a', fecha: '', tipo: 'riego' }), limpiarFila({ id: 'b', fecha: '2026-11-01T12:00:00Z', tipo: 'cualquiera', nota: '' })],
      [limpiarFila({ id: 'p', nombre: '', estado: 'activa' })],
    )
    expect(tieneDatos(x)).toBe(false)
  })
})
