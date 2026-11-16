import { signal } from '@preact/signals'
import { LectorRespuesta, PedidoClaude, type ErrorClaude, type MensajeChat, type RespuestaClaude } from '../core/claude'
import { OpenMeteo, type Pronostico } from '../core/clima'
import { ContextoAsistente } from '../core/contexto'
import { LectorSync, type ErrorSync, type RespuestaSync } from '../core/sync/modelos'
import { aJSON, falla, leerFecha, type Resultado } from '../core/util'
import { DB } from './db'

declare const __VERSION__: string
declare const __COMPILADO__: string

/** Versión que va en cada evento de la planilla y en Ajustes. */
export const VERSION_APP = `web ${__VERSION__} (${__COMPILADO__})`

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

function conTiempo(ms: number): AbortSignal | undefined {
  return typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(ms) : undefined
}

function detalleDeError(e: unknown): string {
  if (e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError')) return 'tardó demasiado'
  if (!navigator.onLine) return 'sin internet'
  return e instanceof Error ? e.message : String(e)
}

// ─── Secretos (API key, URL y token de la planilla) ───
// Quedan en IndexedDB de este teléfono. Nunca van en los backups.

export interface Secretos {
  apiKey?: string
  planillaURL?: string
  planillaToken?: string
}

export const secretos = signal<Secretos>({})

export async function cargarSecretos(): Promise<void> {
  secretos.value = (await DB.leer<Secretos>('secretos')) ?? {}
}

export async function guardarSecretos(cambio: Partial<Secretos>): Promise<void> {
  const nuevos = { ...secretos.value, ...cambio }
  for (const k of Object.keys(nuevos) as (keyof Secretos)[]) if (nuevos[k] === undefined) delete nuevos[k]
  secretos.value = nuevos
  await DB.guardar('secretos', nuevos)
}

// ─── Clima (Open-Meteo, con caché) ───

export const Clima = {
  /** Cada cuánto se vuelve a pedir. */
  vigencia: 60 * 60 * 1000,

  async cache(): Promise<Pronostico | undefined> {
    const guardado = await DB.leer<string>('clima')
    if (!guardado) return undefined
    try {
      const o = JSON.parse(guardado) as Pronostico
      return { dias: o.dias, actualizado: leerFecha(o.actualizado) }
    } catch {
      return undefined
    }
  },

  async descargar(): Promise<Pronostico | undefined> {
    try {
      const r = await fetch(OpenMeteo.url, { signal: conTiempo(20_000), cache: 'no-store' })
      if (r.status !== 200) return undefined
      const p = OpenMeteo.leer(await r.text(), new Date())
      await DB.guardar('clima', aJSON(p))
      return p
    } catch {
      return undefined
    }
  },
}

// ─── Claude ───

export const ClienteClaude = {
  async enviar(historial: MensajeChat[], contexto: string, apiKey: string): Promise<Resultado<RespuestaClaude, ErrorClaude>> {
    const cuerpo = PedidoClaude.cuerpo(historial, ContextoAsistente.instrucciones, contexto)
    // Reintenta un par de veces si la API está saturada o hubo un error temporal.
    for (let intento = 1; ; intento++) {
      try {
        const r = await fetch(PedidoClaude.url, {
          method: 'POST', headers: PedidoClaude.encabezados(apiKey), body: cuerpo, signal: conTiempo(180_000),
        })
        const resultado = LectorRespuesta.leer(await r.text(), r.status)
        const reintentable = [429, 500, 502, 503, 504, 529].includes(r.status)
        if (!resultado.ok && reintentable && intento < 3) {
          await esperar(intento * 2000)
          continue
        }
        return resultado
      } catch (e) {
        if (intento < 2) {
          await esperar(1500)
          continue
        }
        return falla({ tipo: 'red', detalle: detalleDeError(e) })
      }
    }
  },
}

// ─── Planilla (POST al Web App de Apps Script) ───

export const ClienteSync = {
  /**
   * Apps Script responde al POST con un redirect 302 a script.googleusercontent.com, que sí permite
   * leer la respuesta desde el navegador. Se manda como text/plain para que sea un pedido "simple"
   * (sin preflight CORS, que Apps Script no contesta); el script lee el cuerpo igual.
   */
  async enviar(cuerpo: string, url: string): Promise<Resultado<RespuestaSync, ErrorSync>> {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: cuerpo,
        redirect: 'follow',
        cache: 'no-store',
        signal: conTiempo(30_000),
      })
      return LectorSync.leer(await r.text(), r.status)
    } catch (e) {
      return falla({ tipo: 'red', mensaje: detalleDeError(e) })
    }
  },
}
