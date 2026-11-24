import { signal } from '@preact/signals'
import { Calendario } from '../core/calendario'
import { leerDatos, type Datos } from '../core/datos'
import { Bandeja } from '../core/sync/bandeja'
import { Configuracion } from '../core/sync/configuracion'
import { decidir } from '../core/sync/copia'
import { Eventos } from '../core/sync/eventos'
import { CuerpoSync, mensajeErrorSync } from '../core/sync/modelos'
import { limpiarFila, reconstruir, tieneDatos, type FilaPlanta, type FilaRegistro } from '../core/sync/reconstruir'
import { aJSON, iso, leerFecha } from '../core/util'
import { DB } from './db'
import { ClienteSync, secretos, VERSION_APP } from './servicios'

/**
 * Manda a la planilla de Google lo que pasa en la app.
 *
 * Todo evento se guarda primero en la cola local y después se intenta mandar: al registrarlo, al volver
 * a la app y cuando vuelve la conexión. Si falla, queda en la cola y se reintenta con backoff exponencial.
 * Nunca bloquea la pantalla.
 *
 * Lo que no es historial (el patio, dónde va cada planta, las dosis de las etiquetas) va a la hoja
 * "Configuración", que se reescribe entera cuando algo de eso cambia.
 *
 * Además mantiene una copia completa de los datos en la planilla (hoja oculta "Estado"): se sube unos
 * segundos después de cada cambio y se baja al abrir la app si la de la planilla es más nueva.
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
  /** Hay cambios de este teléfono que todavía no están en la copia de la planilla. */
  copiaPendiente: boolean
  ultimaBajada?: Date
  errorCopia?: string
  /** El script de la planilla es viejo y no escribe la hoja "Configuración". */
  avisoConfiguracion?: string
}

/** Fechas de la copia completa (se guardan en IndexedDB). */
interface MetaCopia {
  cambiado?: string
  sincronizado?: string
  bajada?: string
}

export type ResultadoBajada = 'bajado' | 'reconstruido' | 'subido' | 'nada' | 'error' | 'omitido'

let bandeja = new Bandeja()
let activada = false
let enviando = false
let progreso: string | undefined
let reintento: ReturnType<typeof setTimeout> | undefined
let meta: MetaCopia = {}
let errorCopia: string | undefined
let avisoConfiguracion: string | undefined
let subida: ReturnType<typeof setTimeout> | undefined
let subiendo = false
let ultimoIntentoBajada = 0
/** Cómo leer los datos actuales y cómo reemplazarlos (los da el almacén; undefined en modo ejemplo). */
let copia: { obtener: () => Datos | undefined; aplicar: (d: Datos) => void } | undefined

export const estadoSync = signal<EstadoSync>({ activada: false, configurada: false, enviando: false, pendientes: 0, copiaPendiente: false })

function credenciales(): { url: string; token: string } | undefined {
  const s = secretos.value
  return s.planillaURL && s.planillaToken ? { url: s.planillaURL, token: s.planillaToken } : undefined
}

function refrescar(): void {
  estadoSync.value = {
    activada, configurada: credenciales() !== undefined, enviando, pendientes: bandeja.pendientes,
    ultimoOK: bandeja.ultimoOK, ultimoError: bandeja.ultimoError, progreso,
    copiaPendiente: meta.cambiado !== undefined && meta.cambiado !== meta.sincronizado,
    ultimaBajada: meta.bajada ? new Date(meta.bajada) : undefined,
    errorCopia,
    avisoConfiguracion,
  }
}

async function guardarMeta(): Promise<void> {
  refrescar()
  await DB.guardar('sync.copia', meta)
}

const fechaMeta = (s: string | undefined) => (s ? new Date(s) : undefined)

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
    meta = (await DB.leer<MetaCopia>('sync.copia')) ?? {}
    refrescar()
  },

  configurarCopia(c: { obtener: () => Datos | undefined; aplicar: (d: Datos) => void }): void {
    copia = c
  },

  // ─── Copia completa ───

  /** Anota que los datos cambiaron en este teléfono y programa la subida de la copia. */
  marcarCambio(): void {
    meta.cambiado = iso(new Date())
    void guardarMeta()
    programarSubida()
  },

  /** Sube la copia completa. Si la planilla tiene una más nueva, no la pisa: la baja. */
  async subirCopia(): Promise<boolean> {
    const c = credenciales()
    const d = copia?.obtener()
    if (!activada || !c || !d || subiendo) return false
    subiendo = true
    const cambiado = meta.cambiado ?? iso(new Date())
    try {
      const r = await ClienteSync.enviar(CuerpoSync.guardarEstado(c.token, aJSON(d), new Date(cambiado)), c.url)
      if (!r.ok) {
        errorCopia = mensajeErrorSync(r.error)
        refrescar()
        return false
      }
      if (r.valor.guardado === undefined) {
        errorCopia = 'Actualizá el script de la planilla (ver Ajustes) para guardar la copia completa.'
        refrescar()
        return false
      }
      errorCopia = undefined
      if (!r.valor.guardado) {
        // Otro dispositivo guardó algo más nuevo: gana ese.
        subiendo = false
        await Sincronizador.bajarCopia(true)
        return false
      }
      meta.cambiado = meta.cambiado ?? cambiado
      meta.sincronizado = cambiado
      await guardarMeta()
      // Si hubo cambios mientras subía, queda otra subida en camino.
      if (meta.cambiado !== meta.sincronizado) programarSubida()
      return true
    } finally {
      subiendo = false
    }
  },

  /** Al abrir la app: baja la copia si la de la planilla es más nueva (o la rearma la primera vez). */
  async bajarCopia(forzar = false): Promise<ResultadoBajada> {
    const c = credenciales()
    const actual = copia?.obtener()
    if (!activada || !c || !actual) return 'omitido'
    // Volver a la app y recuperar la señal pueden llegar juntos: una sola bajada.
    if (!forzar && Date.now() - ultimoIntentoBajada < 20_000) return 'omitido'
    ultimoIntentoBajada = Date.now()

    const r = await ClienteSync.enviar(CuerpoSync.leerEstado(c.token), c.url)
    if (!r.ok) {
      errorCopia = mensajeErrorSync(r.error)
      refrescar()
      return 'error'
    }
    const v = r.valor
    if (v.estado === undefined || typeof v.estado === 'boolean') {
      errorCopia = 'Actualizá el script de la planilla (ver Ajustes) para que la app pueda bajar los datos.'
      refrescar()
      return 'error'
    }
    errorCopia = undefined
    meta.bajada = iso(new Date())
    const remoto = typeof v.actualizado === 'string' ? fechaSegura(v.actualizado) : undefined
    const decision = decidir(
      { tieneDatos: tieneDatos(actual), cambiado: fechaMeta(meta.cambiado), sincronizado: fechaMeta(meta.sincronizado) },
      { hayCopia: typeof v.estado === 'string', actualizado: remoto },
    )
    try {
      switch (decision) {
        case 'bajar': {
          const d = leerDatos(JSON.parse(v.estado as string))
          copia?.aplicar(d)
          meta.cambiado = iso(remoto!)
          meta.sincronizado = meta.cambiado
          await guardarMeta()
          return 'bajado'
        }
        case 'reconstruir': {
          const d = reconstruir(
            (v.filasRegistro ?? []).map((f) => limpiarFila<FilaRegistro>(f)),
            (v.filasPlantas ?? []).map((f) => limpiarFila<FilaPlanta>(f)),
            v.filasConfiguracion ?? [],
          )
          await guardarMeta()
          if (!tieneDatos(d)) return 'nada'
          copia?.aplicar(d)
          // Desde ahora la planilla tiene la copia completa.
          Sincronizador.marcarCambio()
          return 'reconstruido'
        }
        case 'subir':
          await guardarMeta()
          return (await Sincronizador.subirCopia()) ? 'subido' : 'error'
        case 'nada':
          await guardarMeta()
          return 'nada'
      }
    } catch (e) {
      errorCopia = `No pude leer la copia de la planilla: ${e instanceof Error ? e.message : String(e)}`
      refrescar()
      return 'error'
    }
  },

  // ─── Configuración ───

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
    bandeja.encolarConfiguracion(Configuracion.filas(despues))
    encolarEtapas(despues, hoy)
    void guardarBandeja().then(() => Sincronizador.enviar())
  },

  /** Cambios de etapa nuevos, la hoja "Configuración" si no está al día y, una vez por día, la fila de
   *  cada planta (el Día de cultivo avanza solo). */
  revisar(datos: Datos, hoy: Date): void {
    if (!activada) return
    encolarEtapas(datos, hoy)
    bandeja.encolarConfiguracion(Configuracion.filas(datos))
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
          const configuracionGuardada = lote.configuracion === undefined || typeof r.valor.configuracion === 'number'
          if (lote.configuracion) {
            avisoConfiguracion = configuracionGuardada ? undefined
              : 'Actualizá el script de la planilla (ver Ajustes) para que se llene la hoja Configuración con el patio.'
          }
          bandeja.confirmar(lote, new Date(), configuracionGuardada)
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
    if (!r.ok) return mensajeErrorSync(r.error)
    if (r.valor.estado !== true) {
      return 'La planilla responde y el token es correcto, pero el script es el viejo: actualizalo para que la app pueda bajar los datos (Ajustes → Planilla).'
    }
    if (r.valor.configuracion !== true) {
      return 'La planilla responde y el token es correcto, pero falta actualizar el script para que escriba la hoja Configuración (el patio y dónde va cada planta).'
    }
    return 'Conexión OK: la planilla responde, el token es correcto y el script ya sube y baja la copia completa y escribe la hoja Configuración.'
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
    bandeja.configuracionEnviada = undefined
    bandeja.encolarConfiguracion(Configuracion.filas(datos))
    progreso = `Enviando… quedan ${bandeja.pendientes} eventos`
    await guardarBandeja()
    try {
      // Si justo había un envío en curso, se espera a que termine.
      while (enviando) await new Promise((r) => setTimeout(r, 300))
      const r = await Sincronizador.enviar(true)
      if (r.error) return `Se cortó: ${r.error} Lo que faltó queda en la cola y se reintenta solo.`
      const extra = avisoConfiguracion ? ` ${avisoConfiguracion}` : ' La hoja Configuración quedó al día.'
      return `Listo: ${r.agregados} filas nuevas en Registro, ${r.repetidos} ya estaban.${extra}`
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

/** Sube la copia unos segundos después del último cambio (varios cambios seguidos, una sola subida). */
function programarSubida(): void {
  if (subida) clearTimeout(subida)
  subida = setTimeout(() => void Sincronizador.subirCopia(), 2500)
}

function fechaSegura(s: string): Date | undefined {
  try {
    return leerFecha(s)
  } catch {
    return undefined
  }
}

/** Reintento automático mientras la app está abierta (el backoff dice cuándo). */
function programarReintento(): void {
  if (reintento) clearTimeout(reintento)
  const cuando = bandeja.proximoIntento
  if (!cuando) return
  reintento = setTimeout(() => void Sincronizador.enviar(), Math.max(cuando.getTime() - Date.now(), 1000))
}
