import { aJSON, exito, falla, type Resultado } from '../util'
import type { FilaConfig } from './configuracion'

// Lo que viaja a la planilla de Google (ver apps-script/Code.gs). Los nombres de las propiedades
// son las claves del JSON que lee el Apps Script: si cambiás uno, cambialo también allá.

/** Valor de la columna "Tipo" de la hoja Registro. */
export const TE = {
  germinacion: 'germinación',
  cambioEtapa: 'cambio de etapa',
  cambioUbicacion: 'cambio de ubicación',
  riego: 'riego',
  lluvia: 'lluvia',
  fertilizante: 'fertilizante',
  neem: 'neem',
  revision: 'revisión',
  nota: 'nota',
  problema: 'problema',
  foto: 'foto',
  sexado: 'sexado',
  polinizacion: 'polinización',
  polenJuntado: 'polen juntado',
  polenUsado: 'polen usado',
  cosecha: 'cosecha',
  aFrascos: 'a frascos (fin de secado)',
  aperturaFrascos: 'apertura de frascos',
  finCurado: 'fin de curado',
  descarte: 'descarte',
  tareaSalteada: 'tarea salteada',
  phDrenaje: 'pH del drenaje',
  altaSemillas: 'alta de semillas',
  bajaSemillas: 'baja de semillas',
  correccion: 'corrección',
  borrado: 'borrado',
} as const
export type TipoEvento = (typeof TE)[keyof typeof TE]

/** Una fila de la hoja "Registro". */
export interface EventoSync {
  /** Único y estable: si se manda dos veces, la planilla lo ignora la segunda. */
  id: string
  fecha: Date
  tipo: TipoEvento
  plantaID?: string
  planta?: string
  variedad?: string
  autoFoto?: string
  /** Etapa que tenía la planta en el momento del evento. */
  etapa?: string
  /** Día de cultivo (desde la germinación) en el momento del evento. */
  dia?: number
  cantidad?: number
  unidad?: string
  producto?: string
  /** Dosis en ml por litro (fertilizante). */
  dosis?: number
  nota?: string
  /** Versión de la app que generó el evento. */
  app: string
}

/** Una fila de la hoja "Plantas" (estado actual). */
export interface PlantaSync {
  id: string
  nombre: string
  variedad: string
  autoFoto: string
  semilla: string
  sexo: string
  ubicacion: string
  litros: number
  /** "2026-10-18" (día de Buenos Aires). */
  germinacion: string
  etapa: string
  dia: number
  ultimoRiego?: Date
  ultimoFertilizante?: Date
  ultimoNeem?: Date
  /** activa, secando, curando, terminada, descartada o borrada. */
  estado: string
  gramosHumedos?: number
  gramosSecos?: number
  notas: string
  actualizado: Date
}

/** Lo que se manda en un POST. */
export interface LoteSync {
  eventos: EventoSync[]
  plantas: PlantaSync[]
  /** La hoja "Configuración" entera (solo si cambió). */
  configuracion?: FilaConfig[]
}

/** Cuerpo JSON del POST. */
export const CuerpoSync = {
  json(lote: LoteSync, token: string): string {
    return aJSON({ token, eventos: lote.eventos, plantas: lote.plantas,
      ...(lote.configuracion ? { configuracion: lote.configuracion } : {}) })
  },

  /** "Probar conexión": el script solo valida el token y no escribe nada. */
  prueba(token: string): string {
    return aJSON({ token, accion: 'probar', eventos: [], plantas: [] })
  },

  /** Pide la copia completa (o, si todavía no hay, las filas de Registro y Plantas). */
  leerEstado(token: string): string {
    return aJSON({ token, accion: 'leerEstado' })
  },

  /** Guarda la copia completa de los datos (JSON) con la fecha del último cambio. */
  guardarEstado(token: string, estado: string, actualizado: Date): string {
    return aJSON({ token, accion: 'guardarEstado', estado, actualizado })
  },
}

/** Respuesta del Apps Script. */
export interface RespuestaSync {
  ok: boolean
  error?: string
  agregados?: number
  repetidos?: number
  invalidos?: number
  plantas?: number
  /** Filas escritas en la hoja "Configuración" (o true en "Probar conexión", si el script ya la conoce).
   *  Undefined = script viejo, que no la escribe. */
  configuracion?: number | boolean
  /** Probar conexión: true si el script ya sabe guardar y devolver la copia completa. */
  prueba?: boolean
  /** leerEstado: la copia (JSON) o null si todavía no hay. Undefined = script viejo. */
  estado?: string | null | boolean
  actualizado?: string | null
  filasRegistro?: Record<string, unknown>[]
  filasPlantas?: Record<string, unknown>[]
  filasConfiguracion?: Record<string, unknown>[]
  /** guardarEstado: false si la planilla ya tenía una copia más nueva. */
  guardado?: boolean
}

export type ErrorSync =
  | { tipo: 'red'; mensaje: string }
  | { tipo: 'http'; status: number }
  | { tipo: 'noEsJSON' }
  | { tipo: 'servidor'; mensaje: string }

export function mensajeErrorSync(e: ErrorSync): string {
  switch (e.tipo) {
    case 'red': return e.mensaje === 'sin internet' || e.mensaje === 'tardó demasiado' ? `Sin conexión: ${e.mensaje}.` : `No pude llegar a la planilla (${e.mensaje}). Si tenés internet, revisá que la URL sea la del Web App y que esté publicado con acceso "Cualquier persona".`
    case 'http': return `La planilla respondió con error ${e.status}.`
    case 'noEsJSON': return 'La URL no devolvió JSON. Revisá que sea la del Web App (termina en /exec) y que el acceso sea "Cualquier persona".'
    case 'servidor': return `La planilla dijo: ${e.mensaje}`
  }
}

export const LectorSync = {
  /** Éxito solo si el cuerpo final (después del redirect) trae {"ok": true}. */
  leer(texto: string, status: number): Resultado<RespuestaSync, ErrorSync> {
    if (status < 200 || status >= 300) return falla({ tipo: 'http', status })
    let r: unknown
    try {
      r = JSON.parse(texto)
    } catch {
      return falla({ tipo: 'noEsJSON' })
    }
    if (typeof r !== 'object' || r === null || typeof (r as RespuestaSync).ok !== 'boolean') return falla({ tipo: 'noEsJSON' })
    const resp = r as RespuestaSync
    if (!resp.ok) return falla({ tipo: 'servidor', mensaje: resp.error ?? 'error desconocido' })
    return exito(resp)
  },
}
