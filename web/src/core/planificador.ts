import { Calendario } from './calendario'
import { Cupo } from './consejos'
import { cuentaComoFlorecida, duracion, Etapas, type Etapa } from './etapas'
import { nuevaPlanta, type Planta, type TipoPlanta } from './modelos'

export interface FechaClave {
  etapa: Etapa
  fecha: Date
}

export interface SemanaCupo {
  inicio: Date
  /** Máximo de plantas en flor esa semana (de las que ya tenés). */
  actuales: number
  /** Máximo de plantas en flor contando las que planeás germinar. */
  total: number
}

export const nuevasEnSemana = (s: SemanaCupo): number => s.total - s.actuales
export const semanaExcedida = (s: SemanaCupo): boolean => s.total > Cupo.plantasFlorecidas

const SEMANAS = 20

/** "Si germino hoy, ¿cuándo cosecho?" y "¿me paso del cupo?". */
export const Planificador = {
  semanas: SEMANAS,

  /** Día en que empieza cada etapa (solo las que duran algo). */
  fechasClave(tipo: TipoPlanta, germinacion: Date): FechaClave[] {
    return Etapas.tramos(tipo, germinacion)
      .filter((t) => duracion(t) > 0)
      .map((t) => ({ etapa: t.etapa, fecha: Calendario.sumarDias(t.desdeDia, germinacion) }))
  },

  /** Cuando conviene empezar a mirar tricomas (inicio de "lista para revisar cosecha"). */
  cosechaEstimada(tipo: TipoPlanta, germinacion: Date): Date {
    const t = Etapas.tramos(tipo, germinacion)
    return Calendario.sumarDias(t[t.length - 1]?.desdeDia ?? 84, germinacion)
  },

  cosechaEstimadaDe(p: Planta): Date {
    return Planificador.cosechaEstimada(p.tipo, p.fechaGerminacion)
  },

  /** Plantas de mentira para simular una tanda. */
  hipoteticas(tipo: TipoPlanta, cantidad: number, germinacion: Date): Planta[] {
    return Array.from({ length: Math.max(cantidad, 0) }, (_, i) =>
      nuevaPlanta({ nombre: `Nueva ${i + 1}`, variedad: '', tipo, semilla: 'feminizada', fechaGerminacion: germinacion }))
  },

  /** Plantas en flor semana a semana (el máximo de cada semana). */
  proyeccion(plantas: Planta[], nuevas: Planta[], hoy: Date, semanas = SEMANAS): SemanaCupo[] {
    const intervalos = (lista: Planta[]) => lista.flatMap((p) => {
      const i = intervaloEnFlor(p, hoy)
      return i ? [i] : []
    })
    const actuales = intervalos(plantas)
    const extra = intervalos(nuevas)
    return Array.from({ length: semanas }, (_, s) => {
      let maxActuales = 0
      let maxTotal = 0
      for (let d = s * 7; d < s * 7 + 7; d++) {
        const a = actuales.filter(([desde, hasta]) => desde <= d && d < hasta).length
        const e = extra.filter(([desde, hasta]) => desde <= d && d < hasta).length
        maxActuales = Math.max(maxActuales, a)
        maxTotal = Math.max(maxTotal, a + e)
      }
      return { inicio: Calendario.sumarDias(s * 7, hoy), actuales: maxActuales, total: maxTotal }
    })
  },

  primeraExcedida(p: SemanaCupo[]): SemanaCupo | undefined {
    return p.find(semanaExcedida)
  },

  /** Cuántas plantas más podrías germinar ese día sin pasarte del cupo. */
  lugarLibre(plantas: Planta[], tipo: TipoPlanta, germinacion: Date, hoy: Date): number {
    let n = 0
    while (n < Cupo.plantasFlorecidas) {
      const prueba = Planificador.hipoteticas(tipo, n + 1, germinacion)
      const semanasNecesarias = SEMANAS + Math.max(Math.trunc(Calendario.dias(hoy, germinacion) / 7), 0)
      if (Planificador.primeraExcedida(Planificador.proyeccion(plantas, prueba, hoy, semanasNecesarias))) break
      n++
    }
    return n
  },
}

/** Días (contados desde `hoy`) en que la planta está en flor: [desde, hasta).
 *  Floración, maduración y lista para cosecha van seguidas. Se asume que se cosecha al terminar
 *  "lista para cosecha" (o en una semana, si ya está pasada). */
export function intervaloEnFlor(p: Planta, hoy: Date): [number, number] | undefined {
  if (p.estado !== 'activa') return undefined
  const tramos = Etapas.de(p).filter((t) => duracion(t) > 0)
  const primero = tramos.find((t) => cuentaComoFlorecida(t.etapa))
  const ultimo = tramos[tramos.length - 1]
  if (!primero || !ultimo) return undefined
  const offset = Calendario.dias(hoy, p.fechaGerminacion) // germinación relativa a hoy
  const desde = Math.max(offset + primero.desdeDia, offset) // nunca antes de germinar
  const hasta = Math.max(offset + ultimo.hastaDia, 7)
  return desde < hasta ? [desde, hasta] : undefined
}
