import { iguales, leerFecha } from '../util'
import type { EventoSync, LoteSync, PlantaSync, TipoEvento } from './modelos'

/**
 * Cola local de lo que falta mandar a la planilla (outbox). Se guarda después de cada cambio: un evento
 * existe acá antes de intentar mandarlo, y solo sale cuando la planilla confirmó que lo recibió.
 */
export class Bandeja {
  eventos: EventoSync[] = []
  /** Última foto pendiente de cada planta (una por planta: la nueva reemplaza a la vieja). */
  plantas: PlantaSync[] = []
  /** IDs de cambios de etapa ya encolados alguna vez, para no generarlos de nuevo cada día. */
  etapasEncoladas = new Set<string>()
  /** Día ("2026-11-10") del último refresco de todas las plantas (el Día de cultivo cambia solo). */
  ultimoRefrescoPlantas?: string
  intentosFallidos = 0
  proximoIntento?: Date
  ultimoOK?: Date
  ultimoError?: string

  static maxPorLote = 100
  static esperaInicial = 30_000
  static esperaMaxima = 15 * 60_000

  get vacia(): boolean {
    return this.eventos.length === 0 && this.plantas.length === 0
  }

  get pendientes(): number {
    return this.eventos.length
  }

  // ─── Encolar ───

  /** Agrega los eventos que no estén ya en la cola (por ID). Devuelve cuántos agregó. */
  encolar(nuevos: EventoSync[]): number {
    const ids = new Set(this.eventos.map((e) => e.id))
    let agregados = 0
    for (const e of nuevos) {
      if (ids.has(e.id)) continue
      this.eventos.push(e)
      ids.add(e.id)
      agregados++
    }
    return agregados
  }

  /** Guarda la foto más nueva de cada planta. */
  encolarPlantas(nuevas: PlantaSync[]): void {
    for (const p of nuevas) {
      const i = this.plantas.findIndex((x) => x.id === p.id)
      if (i >= 0) this.plantas[i] = p
      else this.plantas.push(p)
    }
  }

  // ─── Enviar ───

  /** Lo próximo a mandar: los eventos más viejos y todas las plantas pendientes. */
  lote(max = Bandeja.maxPorLote): LoteSync {
    return { eventos: this.eventos.slice(0, max), plantas: [...this.plantas] }
  }

  puedeEnviar(ahora: Date): boolean {
    return !this.proximoIntento || ahora.getTime() >= this.proximoIntento.getTime()
  }

  /** La planilla confirmó el lote: sale de la cola solo lo que se mandó. Lo que se encoló mientras
   *  tanto queda, y si una planta cambió durante el envío se queda su foto nueva. */
  confirmar(lote: LoteSync, ahora: Date): void {
    const enviados = new Set(lote.eventos.map((e) => e.id))
    this.eventos = this.eventos.filter((e) => !enviados.has(e.id))
    this.plantas = this.plantas.filter((p) => !lote.plantas.some((x) => iguales(x, p)))
    this.intentosFallidos = 0
    this.proximoIntento = undefined
    this.ultimoOK = ahora
    this.ultimoError = undefined
  }

  /** No se pudo mandar: todo queda en la cola y el próximo intento se aleja (backoff exponencial). */
  fallo(mensaje: string, ahora: Date): void {
    this.intentosFallidos++
    this.proximoIntento = new Date(ahora.getTime() + Bandeja.espera(this.intentosFallidos))
    this.ultimoError = mensaje
  }

  /** 30 s, 1 min, 2 min, 4 min, 8 min y después cada 15 min (en milisegundos). */
  static espera(intentos: number): number {
    if (intentos <= 0) return 0
    const exponente = Math.min(intentos - 1, 20)
    return Math.min(Bandeja.esperaInicial * 2 ** exponente, Bandeja.esperaMaxima)
  }

  // ─── Guardar y leer ───

  aObjeto(): Record<string, unknown> {
    return {
      eventos: this.eventos,
      plantas: this.plantas,
      etapasEncoladas: [...this.etapasEncoladas],
      ultimoRefrescoPlantas: this.ultimoRefrescoPlantas,
      intentosFallidos: this.intentosFallidos,
      proximoIntento: this.proximoIntento,
      ultimoOK: this.ultimoOK,
      ultimoError: this.ultimoError,
    }
  }

  /** Un objeto vacío o de una versión vieja no rompe nada. */
  static leer(o: unknown): Bandeja {
    const b = new Bandeja()
    if (typeof o !== 'object' || o === null) return b
    const x = o as Record<string, unknown>
    if (Array.isArray(x.eventos)) b.eventos = x.eventos.map(leerEvento)
    if (Array.isArray(x.plantas)) b.plantas = x.plantas.map(leerPlantaSync)
    if (Array.isArray(x.etapasEncoladas)) b.etapasEncoladas = new Set(x.etapasEncoladas.map(String))
    if (typeof x.ultimoRefrescoPlantas === 'string') b.ultimoRefrescoPlantas = x.ultimoRefrescoPlantas
    if (typeof x.intentosFallidos === 'number') b.intentosFallidos = x.intentosFallidos
    if (x.proximoIntento) b.proximoIntento = leerFecha(x.proximoIntento)
    if (x.ultimoOK) b.ultimoOK = leerFecha(x.ultimoOK)
    if (typeof x.ultimoError === 'string') b.ultimoError = x.ultimoError
    return b
  }
}

function leerEvento(v: unknown): EventoSync {
  const o = { ...(v as Record<string, unknown>) }
  o.fecha = leerFecha(o.fecha)
  return o as unknown as EventoSync & { tipo: TipoEvento }
}

function leerPlantaSync(v: unknown): PlantaSync {
  const o = { ...(v as Record<string, unknown>) }
  for (const k of ['ultimoRiego', 'ultimoFertilizante', 'ultimoNeem', 'actualizado']) {
    if (o[k] !== undefined && o[k] !== null) o[k] = leerFecha(o[k])
    else delete o[k]
  }
  return o as unknown as PlantaSync
}
