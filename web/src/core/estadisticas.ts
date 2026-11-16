import { Calendario } from './calendario'
import type { Planta, TipoPlanta } from './modelos'

export interface ResumenCosecha {
  plantaID: string
  nombre: string
  variedad: string
  tipo: TipoPlanta
  fecha: Date
  humedos: number
  secos?: number
  /** Días desde la germinación hasta la cosecha. */
  diasCiclo: number
}

/** Peso seco / húmedo (normalmente 20–25 %). */
export function rendimiento(c: ResumenCosecha): number | undefined {
  if (c.secos === undefined || c.humedos <= 0) return undefined
  return c.secos / c.humedos
}

export interface ResumenGrupo {
  nombre: string
  cosechas: number
  totalSecos: number
  promedioSecos?: number
  promedioDias?: number
}

export const Estadisticas = {
  cosechas(plantas: Planta[]): ResumenCosecha[] {
    return plantas
      .flatMap((p): ResumenCosecha[] => {
        const c = p.cosecha
        if (!c || p.estado === 'activa') return []
        const r: ResumenCosecha = {
          plantaID: p.id, nombre: p.nombre, variedad: p.variedad === '' ? 'Sin variedad' : p.variedad,
          tipo: p.tipo, fecha: c.fecha, humedos: c.gramosHumedos,
          diasCiclo: Calendario.dias(p.fechaGerminacion, c.fecha),
        }
        if (c.gramosSecos !== undefined) r.secos = c.gramosSecos
        return [r]
      })
      .sort((a, b) => b.fecha.getTime() - a.fecha.getTime())
  },

  totalSecos(c: ResumenCosecha[]): number {
    return c.reduce((s, x) => s + (x.secos ?? 0), 0)
  },

  promedioSecos(c: ResumenCosecha[]): number | undefined {
    const secos = c.flatMap((x) => (x.secos === undefined ? [] : [x.secos]))
    return secos.length === 0 ? undefined : secos.reduce((a, b) => a + b, 0) / secos.length
  },

  /** Temporada del patio: de julio a junio. "2026/27". */
  temporada(fecha: Date): string {
    const anio = Calendario.anio(fecha)
    const inicio = Calendario.mes(fecha) >= 7 ? anio : anio - 1
    return `${inicio}/${String((inicio + 1) % 100).padStart(2, '0')}`
  },

  porVariedad(c: ResumenCosecha[]): ResumenGrupo[] {
    return agrupar(c, (x) => x.variedad).sort((a, b) => b.totalSecos - a.totalSecos)
  },

  porTemporada(c: ResumenCosecha[]): ResumenGrupo[] {
    return agrupar(c, (x) => Estadisticas.temporada(x.fecha)).sort((a, b) => (a.nombre < b.nombre ? 1 : a.nombre > b.nombre ? -1 : 0))
  },
}

function agrupar(c: ResumenCosecha[], clave: (x: ResumenCosecha) => string): ResumenGrupo[] {
  const grupos = new Map<string, ResumenCosecha[]>()
  for (const x of c) grupos.set(clave(x), [...(grupos.get(clave(x)) ?? []), x])
  return [...grupos].map(([nombre, lista]) => {
    const g: ResumenGrupo = { nombre, cosechas: lista.length, totalSecos: Estadisticas.totalSecos(lista) }
    const prom = Estadisticas.promedioSecos(lista)
    if (prom !== undefined) g.promedioSecos = prom
    if (lista.length > 0) g.promedioDias = Math.trunc(lista.reduce((s, x) => s + x.diasCiclo, 0) / lista.length)
    return g
  })
}

// ─── Línea de tiempo de fotos ───

export interface FotoFechada {
  nombre: string
  fecha?: Date
}

/** Fotos de la más vieja a la más nueva (las que no tienen fecha, al final en el orden en que se agregaron). */
export function lineaDeTiempo(p: Planta): FotoFechada[] {
  const conFecha = p.fotos
    .filter((n) => p.fechasFotos[n] !== undefined)
    .map((n) => ({ nombre: n, fecha: p.fechasFotos[n] }))
    .sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
  const sinFecha = p.fotos.filter((n) => p.fechasFotos[n] === undefined).map((n): FotoFechada => ({ nombre: n }))
  return [...conFecha, ...sinFecha]
}
