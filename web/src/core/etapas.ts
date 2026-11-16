import { Calendario } from './calendario'
import type { Planta, TipoPlanta } from './modelos'
import { ultimo } from './util'

export const ETAPAS = ['plantula', 'crecimiento', 'prefloracion', 'floracion', 'maduracion', 'listaCosecha',
  'secado', 'curado', 'terminada', 'descartada'] as const
export type Etapa = (typeof ETAPAS)[number]

export const nombreEtapa: Record<Etapa, string> = {
  plantula: 'Plántula',
  crecimiento: 'Crecimiento',
  prefloracion: 'Prefloración',
  floracion: 'Floración',
  maduracion: 'Maduración',
  listaCosecha: 'Lista para revisar cosecha',
  secado: 'Secando',
  curado: 'Curando',
  terminada: 'Terminada',
  descartada: 'Descartada',
}

/** Nombre corto para la barra de etapas. */
export function cortoEtapa(e: Etapa): string {
  switch (e) {
    case 'plantula': return 'Plántula'
    case 'crecimiento': return 'Crec.'
    case 'prefloracion': return 'Pref.'
    case 'floracion': return 'Flor'
    case 'maduracion': return 'Mad.'
    case 'listaCosecha': return 'Cosecha'
    default: return nombreEtapa[e]
  }
}

/** Las etapas de la planta viva, en orden. */
export const DE_CULTIVO: readonly Etapa[] = ['plantula', 'crecimiento', 'prefloracion', 'floracion', 'maduracion', 'listaCosecha']

/** Cuenta para el cupo de plantas florecidas del REPROCANN. */
export function cuentaComoFlorecida(e: Etapa): boolean {
  return e === 'floracion' || e === 'maduracion' || e === 'listaCosecha'
}

/** Un tramo de la barra de etapas, en días desde la germinación (`hastaDia` no incluido). */
export interface Tramo {
  etapa: Etapa
  desdeDia: number
  hastaDia: number
}

export const duracion = (t: Tramo): number => t.hastaDia - t.desdeDia

export interface EstadoEtapa {
  etapa: Etapa
  /** Días desde la germinación (día 0 = el día que germinó). */
  dia: number
  /** Días dentro de la etapa actual (para secado y curado, desde la cosecha o los frascos). */
  diaEnEtapa: number
  tramos: Tramo[]
}

export const semana = (e: EstadoEtapa): number => Math.floor(Math.max(e.dia, 0) / 7) + 1

/** Automáticas: día en que empieza cada etapa de cultivo. */
const INICIO_AUTO = [0, 10, 21, 35, 70, 84]
/** Largo con el que se dibuja la última etapa (que no tiene fin). */
const LARGO_ULTIMO_TRAMO = 14
const DIAS_PLANTULA_FOTO = 10

export const Etapas = {
  /** Tramos de cultivo según el tipo y la fecha de germinación. */
  tramos(tipo: TipoPlanta, germinacion: Date): Tramo[] {
    let inicios: number[]
    if (tipo === 'auto') {
      inicios = INICIO_AUTO
    } else {
      // Hemisferio sur: si germinó entre julio y diciembre, la temporada termina el año siguiente.
      const mes = Calendario.mes(germinacion)
      const anioFin = Calendario.anio(germinacion) + (mes >= 7 ? 1 : 0)
      const dia = (d: number, m: number) => Calendario.dias(germinacion, Calendario.fecha(anioFin, m, d))
      const b = [0, DIAS_PLANTULA_FOTO, dia(25, 1), dia(20, 2), dia(5, 4), dia(25, 4)]
      // Los primeros 10 días siempre son plántula; si una fecha ya pasó, esa etapa queda vacía.
      for (let i = 1; i < b.length; i++) b[i] = Math.max(b[i], b[i - 1])
      inicios = b
    }
    return DE_CULTIVO.map((etapa, i) => {
      const desde = inicios[i]
      const hasta = i + 1 < inicios.length ? inicios[i + 1] : desde + LARGO_ULTIMO_TRAMO
      return { etapa, desdeDia: desde, hastaDia: hasta }
    })
  },

  de(p: Planta): Tramo[] {
    return Etapas.tramos(p.tipo, p.fechaGerminacion)
  },

  /** Etapa de cultivo (por calendario) para un día dado, sin mirar el estado. */
  etapaDeCultivo(dia: number, tramos: Tramo[]): Tramo {
    const d = Math.max(dia, 0)
    const conLargo = tramos.filter((t) => duracion(t) > 0)
    return ultimo(conLargo, (t) => t.desdeDia <= d) ?? conLargo[0] ?? tramos[0]
  },

  estado(p: Planta, hoy: Date): EstadoEtapa {
    const ts = Etapas.de(p)
    const dia = Calendario.dias(p.fechaGerminacion, hoy)
    switch (p.estado) {
      case 'activa': {
        const t = Etapas.etapaDeCultivo(dia, ts)
        return { etapa: t.etapa, dia, diaEnEtapa: Math.max(dia, 0) - t.desdeDia, tramos: ts }
      }
      case 'secando':
        return { etapa: 'secado', dia, diaEnEtapa: Calendario.dias(p.cosecha?.fecha ?? hoy, hoy), tramos: ts }
      case 'curando':
        return { etapa: 'curado', dia, diaEnEtapa: Calendario.dias(p.cosecha?.fechaFrascos ?? hoy, hoy), tramos: ts }
      case 'terminada':
        return { etapa: 'terminada', dia, diaEnEtapa: 0, tramos: ts }
      case 'descartada':
        return { etapa: 'descartada', dia, diaEnEtapa: 0, tramos: ts }
    }
  },

  etapa(p: Planta, hoy: Date): Etapa {
    return Etapas.estado(p, hoy).etapa
  },
}
