import { Calendario } from './calendario'
import { Etapas, type Etapa } from './etapas'
import { Formato } from './formato'
import type { Planta } from './modelos'
import { redondear } from './util'

// ─── Pronóstico ───

export interface DiaClima {
  /** "2026-11-08" (hora de Buenos Aires). */
  fecha: string
  lluviaMM: number
  probLluvia?: number
  maxC?: number
  minC?: number
  /** Humedad relativa promedio del día (%). */
  humedad?: number
}

export interface Pronostico {
  dias: DiaClima[]
  actualizado: Date
}

export function diaClima(p: Pronostico, fecha: Date): DiaClima | undefined {
  const clave = Calendario.claveDia(fecha)
  return p.dias.find((d) => d.fecha === clave)
}

export function diaClimaDesde(p: Pronostico, desplazamiento: number, fecha: Date): DiaClima | undefined {
  return diaClima(p, Calendario.sumarDias(desplazamiento, fecha))
}

/** Open-Meteo: gratis y sin clave. Coordenadas de CABA. */
export const OpenMeteo = {
  url:
    'https://api.open-meteo.com/v1/forecast?latitude=-34.6037&longitude=-58.3816' +
    '&daily=precipitation_sum,precipitation_probability_max,temperature_2m_max,temperature_2m_min' +
    '&hourly=relative_humidity_2m&past_days=2&forecast_days=5' +
    '&timezone=America%2FArgentina%2FBuenos_Aires',

  leer(texto: string, ahora: Date): Pronostico {
    const r = JSON.parse(texto) as {
      daily?: {
        time?: string[]
        precipitation_sum?: (number | null)[]
        precipitation_probability_max?: (number | null)[]
        temperature_2m_max?: (number | null)[]
        temperature_2m_min?: (number | null)[]
      }
      hourly?: { time?: string[]; relative_humidity_2m?: (number | null)[] }
    }
    const d = r.daily
    if (!d || !Array.isArray(d.time)) throw new Error('Respuesta de Open-Meteo sin "daily".')

    const humedades = new Map<string, number[]>()
    const h = r.hourly
    if (h?.time && h.relative_humidity_2m) {
      h.time.forEach((t, i) => {
        const v = h.relative_humidity_2m?.[i]
        if (typeof v === 'number') {
          const clave = t.slice(0, 10)
          humedades.set(clave, [...(humedades.get(clave) ?? []), v])
        }
      })
    }
    const valor = (a: (number | null)[] | undefined, i: number): number | undefined => {
      const v = a?.[i]
      return typeof v === 'number' ? v : undefined
    }
    const dias = d.time.map((fecha, i): DiaClima => {
      const dia: DiaClima = { fecha, lluviaMM: valor(d.precipitation_sum, i) ?? 0 }
      const prob = valor(d.precipitation_probability_max, i)
      if (prob !== undefined) dia.probLluvia = redondear(prob)
      const max = valor(d.temperature_2m_max, i)
      if (max !== undefined) dia.maxC = max
      const min = valor(d.temperature_2m_min, i)
      if (min !== undefined) dia.minC = min
      const hs = humedades.get(fecha)
      if (hs) dia.humedad = hs.reduce((a, b) => a + b, 0) / hs.length
      return dia
    })
    return { dias, actualizado: ahora }
  },
}

// ─── Análisis para el patio ───

export type TipoAvisoClima = 'lluvia' | 'llovio' | 'calor' | 'frio' | 'hongos'

export interface AvisoClima {
  tipo: TipoAvisoClima
  titulo: string
  texto: string
}

const EN_FLOR: readonly Etapa[] = ['floracion', 'maduracion', 'listaCosecha']

export const AnalisisClima = {
  /** Con esta lluvia (mm) las macetas del patio quedan regadas. */
  lluviaQueRiega: 5,
  calorFuerte: 32,
  nocheFria: 5,
  humedadHongos: 80,
  /** Desde esta probabilidad se toma en serio el pronóstico de lluvia. */
  probLluviaSeria: 60,

  lluviaAyer(p: Pronostico | undefined, hoy: Date): number {
    return (p && diaClimaDesde(p, -1, hoy)?.lluviaMM) ?? 0
  },

  /** Lluvia pronosticada para hoy, si es probable. */
  lluviaHoyProbable(p: Pronostico | undefined, hoy: Date): number | undefined {
    const d = p && diaClima(p, hoy)
    if (!d || d.lluviaMM < AnalisisClima.lluviaQueRiega || (d.probLluvia ?? 100) < AnalisisClima.probLluviaSeria) return undefined
    return d.lluviaMM
  },

  hayCalor(p: Pronostico | undefined, hoy: Date): boolean {
    return ((p && diaClima(p, hoy)?.maxC) ?? 0) >= AnalisisClima.calorFuerte
  },

  /** Humedad alta o lluvia ayer u hoy: condiciones para hongos en cogollos. */
  riesgoHongos(p: Pronostico | undefined, hoy: Date): boolean {
    if (!p) return false
    return [diaClimaDesde(p, -1, hoy), diaClima(p, hoy)].some(
      (d) => d !== undefined && ((d.humedad ?? 0) >= AnalisisClima.humedadHongos || d.lluviaMM >= AnalisisClima.lluviaQueRiega),
    )
  },

  avisos(p: Pronostico | undefined, plantas: Planta[], hoy: Date): AvisoClima[] {
    const h = p && diaClima(p, hoy)
    if (!p || !h) return []
    const patio = plantas.filter((x) => x.estado === 'activa' && x.ubicacion === 'patio')
    const r: AvisoClima[] = []

    const mm = AnalisisClima.lluviaHoyProbable(p, hoy)
    if (mm !== undefined) {
      r.push({ tipo: 'lluvia', titulo: `Lluvia hoy: ${Formato.numero(mm)} mm`,
        texto: 'Las del patio no necesitan riego. Si viene fuerte, protegé las plántulas.' })
    } else if (AnalisisClima.lluviaAyer(p, hoy) >= AnalisisClima.lluviaQueRiega) {
      r.push({ tipo: 'llovio', titulo: `Ayer llovieron ${Formato.numero(AnalisisClima.lluviaAyer(p, hoy))} mm`,
        texto: 'Las macetas del patio deberían estar húmedas: levantalas antes de regar.' })
    }
    if (h.maxC !== undefined && h.maxC >= AnalisisClima.calorFuerte) {
      r.push({ tipo: 'calor', titulo: `Calor fuerte: ${Formato.numero(h.maxC)} °C`,
        texto: 'Regá temprano o al atardecer. Las macetas de tela se secan rápido: fijate todos los días.' })
    }
    if (h.minC !== undefined && h.minC <= AnalisisClima.nocheFria &&
        patio.some((x) => Etapas.etapa(x, hoy) === 'plantula')) {
      r.push({ tipo: 'frio', titulo: `Noche fría: ${Formato.numero(h.minC)} °C`, texto: 'Entrá las plántulas a la noche.' })
    }
    if (AnalisisClima.riesgoHongos(p, hoy) &&
        patio.some((x) => x.sexo !== 'macho' && EN_FLOR.includes(Etapas.etapa(x, hoy)))) {
      r.push({ tipo: 'hongos', titulo: 'Riesgo de hongos',
        texto: 'Humedad alta: abrí un poco los cogollos más gordos y buscá partes marrones o pelusa gris.' })
    }
    return r
  },

  /** Una línea para el contexto del asistente. */
  resumen(p: Pronostico | undefined, hoy: Date): string | undefined {
    const h = p && diaClima(p, hoy)
    if (!p || !h) return undefined
    const partes: string[] = []
    if (h.maxC !== undefined && h.minC !== undefined) partes.push(`hoy ${Formato.numero(h.minC)}–${Formato.numero(h.maxC)} °C`)
    partes.push(`lluvia hoy ${Formato.numero(h.lluviaMM)} mm` + (h.probLluvia !== undefined ? ` (${h.probLluvia} %)` : ''))
    if (h.humedad !== undefined) partes.push(`humedad ${redondear(h.humedad)} %`)
    partes.push(`lluvia ayer ${Formato.numero(AnalisisClima.lluviaAyer(p, hoy))} mm`)
    const m = diaClimaDesde(p, 1, hoy)
    if (m) partes.push(`mañana ${Formato.numero(m.lluviaMM)} mm` + (m.maxC !== undefined ? `, máx ${Formato.numero(m.maxC)} °C` : ''))
    return 'Clima en CABA: ' + partes.join('; ') + '.'
  },
}
