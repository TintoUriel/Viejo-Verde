import { signal } from '@preact/signals'
import { Calendario } from '../core/calendario'
import type { Datos } from '../core/datos'
import { Bandeja } from '../core/sync/bandeja'
import { Eventos } from '../core/sync/eventos'
import { CuerpoSync, mensajeErrorSync } from '../core/sync/modelos'
import { aJSON } from '../core/util'
import { DB } from './db'
import { ClienteSync, guardarSecretos, secretos, VERSION_APP } from './servicios'

/**
 * Manda a la planilla de Google lo que pasa en la app.
 *
 * Todo evento se guarda primero en la cola local y después se intenta mandar: al registrarlo, al volver
 * a la app y cuando vuelve la conexión. Si falla, queda en la cola y se reintenta con backoff exponencial.
 * Nunca bloquea la pantalla.
 */

export interface EstadoSync {
  activada: boolean
  configurada: boolean
  enviando: boolean
  pendientes: number
  ultimoOK?: Date
  ultimoError?: string
  /** Texto de progreso de "Sincronizar todo". */
  progreso?: string
}

let bandeja = new Bandeja()
let activada = false
let enviando = false
let progreso: string | undefined
let reintento: ReturnType<typeof setTimeout> | undefined

export const estadoSync = signal<EstadoSync>({ activada: false, configurada: false, enviando: false, pendientes: 0 })

function credenciales(): { url: string; token: string } | undefined {
  const s = secretos.value
  return s.planillaURL && s.planillaToken ? { url: s.planillaURL, token: s.planillaToken } : undefined
}

function refrescar(): void {
  estadoSync.value = {
    activada, configurada: credenciales() !== undefined, enviando, pendientes: bandeja.pendientes,
    ultimoOK: bandeja.ultimoOK, ultimoError: bandeja.ultimoError, progreso,
  }
}

async function guardarBandeja(): Promise<void> {
  refrescar()
  await DB.guardar('bandeja', aJSON(bandeja.aObjeto()))
}

export const Sincronizador = {
  async cargar(): Promise<void> {
    const guardada = await DB.leer<string>('bandeja')
    if (guardada) {
      try {
        bandeja = Bandeja.leer(JSON.parse(guardada))
      } catch {
        // No se pisa una cola rota: se guarda una copia por si hay que recuperarla.
        await DB.guardar(`bandeja-rota-${Date.now()}`, guardada)
        bandeja = new Bandeja()
      }
    }
    activada = (await DB.leer<boolean>('sync.activada')) ?? false
    refrescar()
  },

  // ─── Configuración ───

  /** Valida y guarda la URL del Web App y el token. Devuelve un error, o undefined si salió bien. */
  async guardarConfiguracion(url: string, token: string): Promise<string | undefined> {
    const u = url.trim()
    const t = token.trim()
    let host = ''
    let protocolo = ''
    try {
      const p = new URL(u)
      host = p.host
      protocolo = p.protocol
    } catch {
      // sigue abajo
    }
    if (protocolo !== 'https:' || host !== 'script.google.com' || !u.endsWith('/exec')) {
      return 'La URL tiene que ser la del Web App: https://script.google.com/macros/s/…/exec'
    }
    if (t.length < 16) return 'El token parece muy corto.'
    await guardarSecretos({ planillaURL: u, planillaToken: t })
    refrescar()
    return undefined
  },

  async borrarConfiguracion(): Promise<void> {
    await guardarSecretos({ planillaURL: undefined, planillaToken: undefined })
    refrescar()
  },

  async cambiarActivada(valor: boolean): Promise<void> {
    activada = valor
    await DB.guardar('sync.activada', valor)
    refrescar()
    if (valor) void Sincronizador.enviar(true)
  },

  // ─── Registrar ───

  /** Llamado por `cambiar` después de guardar. Encola y manda sin esperar. */
  registrar(antes: Datos, despues: Datos, hoy: Date): void {
    if (!activada) return
    bandeja.encolar(Eventos.detectar(antes, despues, hoy, VERSION_APP))
    bandeja.encolarPlantas(Eventos.filasCambiadas(antes, despues, hoy))
    encolarEtapas(despues, hoy)
    void guardarBandeja().then(() => Sincronizador.enviar())
  },

  /** Cambios de etapa nuevos y, una vez por día, la fila de cada planta (el Día de cultivo avanza solo). */
  revisar(datos: Datos, hoy: Date): void {
    if (!activada) return
    encolarEtapas(datos, hoy)
    const dia = Calendario.claveDia(hoy)
    if (bandeja.ultimoRefrescoPlantas !== dia) {
      bandeja.encolarPlantas(datos.plantas.map((p) => Eventos.fila(p, hoy)))
      bandeja.ultimoRefrescoPlantas = dia
    }
    void guardarBandeja()
  },

  /** Al volver a la app o cuando vuelve la señal: revisa etapas y manda lo pendiente sin esperar el backoff.
   *  `datos` es undefined en modo ejemplo (no se mira nada, pero lo real pendiente se manda igual). */
  alVolver(datos: Datos | undefined, hoy: Date): void {
    if (datos) Sincronizador.revisar(datos, hoy)
    void Sincronizador.enviar(true)
  },

  // ─── Enviar ───

  /** Manda la cola por lotes hasta vaciarla o hasta el primer error.
   *  `forzar` ignora el backoff (volver a la app, botones de Ajustes, señal recuperada). */
  async enviar(forzar = false): Promise<{ agregados: number; repetidos: number; error?: string }> {
    const resumen: { agregados: number; repetidos: number; error?: string } = { agregados: 0, repetidos: 0 }
    if (!activada || enviando || bandeja.vacia) return resumen
    const c = credenciales()
    if (!c) {
      resumen.error = 'Falta la URL o el token.'
      return resumen
    }
    if (!forzar && !bandeja.puedeEnviar(new Date())) return resumen

    enviando = true
    refrescar()
    try {
      while (!bandeja.vacia) {
        const lote = bandeja.lote()
        const r = await ClienteSync.enviar(CuerpoSync.json(lote, c.token), c.url)
        if (r.ok) {
          bandeja.confirmar(lote, new Date())
          resumen.agregados += r.valor.agregados ?? 0
          resumen.repetidos += r.valor.repetidos ?? 0
          if (progreso !== undefined) progreso = `Enviando… quedan ${bandeja.pendientes} eventos`
          await guardarBandeja()
        } else {
          const mensaje = mensajeErrorSync(r.error)
          bandeja.fallo(mensaje, new Date())
          await guardarBandeja()
          resumen.error = mensaje
          programarReintento()
          return resumen
        }
      }
    } finally {
      enviando = false
      refrescar()
    }
    return resumen
  },

  // ─── Botones de Ajustes ───

  async probarConexion(): Promise<string> {
    const c = credenciales()
    if (!c) return 'Primero guardá la URL y el token.'
    const r = await ClienteSync.enviar(CuerpoSync.prueba(c.token), c.url)
    return r.ok ? 'Conexión OK: la planilla responde y el token es correcto.' : mensajeErrorSync(r.error)
  },

  /** Manda todo el historial y la fila de cada planta. Como los IDs son estables, repetirlo no duplica nada. */
  async sincronizarTodo(datos: Datos, hoy: Date): Promise<string> {
    if (!credenciales()) return 'Primero guardá la URL y el token.'
    if (!activada) return 'Activá la sincronización primero.'
    const historial = Eventos.historial(datos, hoy, VERSION_APP)
    bandeja.encolar(historial)
    for (const e of historial) if (e.tipo === 'cambio de etapa') bandeja.etapasEncoladas.add(e.id)
    bandeja.encolarPlantas(datos.plantas.map((p) => Eventos.fila(p, hoy)))
    bandeja.ultimoRefrescoPlantas = Calendario.claveDia(hoy)
    progreso = `Enviando… quedan ${bandeja.pendientes} eventos`
    await guardarBandeja()
    try {
      // Si justo había un envío en curso, se espera a que termine.
      while (enviando) await new Promise((r) => setTimeout(r, 300))
      const r = await Sincronizador.enviar(true)
      if (r.error) return `Se cortó: ${r.error} Lo que faltó queda en la cola y se reintenta solo.`
      return `Listo: ${r.agregados} filas nuevas en Registro, ${r.repetidos} ya estaban.`
    } finally {
      progreso = undefined
      refrescar()
    }
  },

  refrescar,
}

function encolarEtapas(datos: Datos, hoy: Date): void {
  const nuevas = Eventos.cambiosDeEtapa(datos, hoy, VERSION_APP).filter((e) => !bandeja.etapasEncoladas.has(e.id))
  if (nuevas.length === 0) return
  bandeja.encolar(nuevas)
  for (const e of nuevas) bandeja.etapasEncoladas.add(e.id)
  // La fila de la planta también cambia de etapa.
  const ids = new Set(nuevas.map((e) => e.plantaID))
  bandeja.encolarPlantas(datos.plantas.filter((p) => ids.has(p.id)).map((p) => Eventos.fila(p, hoy)))
}

/** Reintento automático mientras la app está abierta (el backoff dice cuándo). */
function programarReintento(): void {
  if (reintento) clearTimeout(reintento)
  const cuando = bandeja.proximoIntento
  if (!cuando) return
  reintento = setTimeout(() => void Sincronizador.enviar(), Math.max(cuando.getTime() - Date.now(), 1000))
}
