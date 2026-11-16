import { computed, signal } from '@preact/signals'
import { HistorialChat, type MensajeChat } from '../core/claude'
import { AnalisisClima, diaClima, type Pronostico } from '../core/clima'
import { Cupo } from '../core/consejos'
import { D, datosVacios, leerDatos, planta, todasLasFotos, type Datos } from '../core/datos'
import { CalculoDosis, type Dosis } from '../core/dosis'
import { datosDeEjemplo } from '../core/ejemplo'
import { Etapas } from '../core/etapas'
import { Formato } from '../core/formato'
import { nombreFertilizante, type Planta } from '../core/modelos'
import { Tareas, type AccionTarea, type DosisTarea, type Tarea } from '../core/tareas'
import { aJSON, leerFecha } from '../core/util'
import { DB, pedirPersistencia } from './db'
import { Fotos } from './fotos'
import { Clima } from './servicios'
import { Sincronizador } from './sincronizador'

/** Estado de la app. Se guarda en IndexedDB después de cada cambio.
 *  El modo ejemplo usa otra clave ("ejemplo") y nunca toca los datos reales. */
export const datos = signal<Datos>(datosVacios())
export const modoEjemplo = signal(false)
export const ultimoError = signal<string | undefined>(undefined)
/** "Hoy" de la app. Se refresca al volver a abrirla, para que las tareas cambien de día. */
export const hoy = signal(new Date())
/** Pronóstico de CABA (Open-Meteo). Puede no haber si nunca hubo internet. */
export const clima = signal<Pronostico | undefined>(undefined)
/** Chat con el asistente (se guarda aparte). */
export const chat = signal<MensajeChat[]>([])
export const cargado = signal(false)

/** El pronóstico solo sirve si tiene el día de hoy. */
export const climaVigente = computed(() => {
  const c = clima.value
  return c && diaClima(c, hoy.value) ? c : undefined
})

export const tareas = computed<Tarea[]>(() =>
  Tareas.generar({
    plantas: datos.value.plantas, paquetes: datos.value.paquetes, hoy: hoy.value,
    config: datos.value.config, pospuestas: datos.value.pospuestas, clima: climaVigente.value,
  }))

export const avisosClima = computed(() => AnalisisClima.avisos(climaVigente.value, datos.value.plantas, hoy.value))
export const cupo = computed(() => Cupo.resumen(datos.value.plantas, hoy.value))

export const estadoDe = (p: Planta) => Etapas.estado(p, hoy.value)
export const dosisDe = (p: Planta): Dosis => CalculoDosis.dePlanta(p, hoy.value, datos.value.config)

const claveDatos = () => (modoEjemplo.value ? 'ejemplo' : 'datos')
const claveChat = () => (modoEjemplo.value ? 'chat-ejemplo' : 'chat')

// ─── Arranque ───

export async function cargar(): Promise<void> {
  const [d, error] = await leerGuardados('datos')
  datos.value = d
  ultimoError.value = error
  clima.value = await Clima.cache()
  chat.value = await leerChat('chat')
  await Sincronizador.cargar()
  cargado.value = true
  void pedirPersistencia()
  alVolver()
}

/** Al volver a la app (o al abrirla): actualiza el día, el clima y manda lo pendiente a la planilla. */
export function alVolver(): void {
  hoy.value = new Date()
  void actualizarClima()
  Sincronizador.alVolver(modoEjemplo.value ? undefined : datos.value, hoy.value)
}

/** Baja el pronóstico si el que hay es viejo. */
export async function actualizarClima(forzar = false): Promise<boolean> {
  const c = clima.value
  if (!forzar && c && Date.now() - c.actualizado.getTime() < Clima.vigencia) return true
  const nuevo = await Clima.descargar()
  if (nuevo) clima.value = nuevo
  return nuevo !== undefined
}

// ─── Cambios ───

/** Única puerta para modificar datos: aplica el cambio sobre una copia, guarda y lo anota para la planilla. */
export function cambiar(cambio: (d: Datos) => void): void {
  hoy.value = new Date()
  const antes = datos.value
  const despues = structuredClone(antes)
  cambio(despues)
  datos.value = despues
  guardar()
  // Los datos de ejemplo nunca salen del teléfono.
  if (!modoEjemplo.value) Sincronizador.registrar(antes, despues, hoy.value)
}

/** Reemplaza todo (importar backup). No genera eventos: para la planilla, después "Sincronizar todo". */
export function reemplazarTodo(nuevos: Datos): void {
  datos.value = nuevos
  guardar()
}

/** Borra todos los datos y las fotos. */
export async function borrarTodo(): Promise<void> {
  datos.value = datosVacios()
  guardar()
  if (!modoEjemplo.value) await Fotos.limpiar([])
}

export function borrarPlanta(id: string): void {
  const p = planta(datos.value, id)
  if (p) for (const f of p.fotos) void Fotos.borrar(f)
  cambiar((d) => D.borrarPlanta(d, id))
}

let cola: Promise<unknown> = Promise.resolve()

function guardar(): void {
  const clave = claveDatos()
  const json = aJSON(datos.value)
  cola = cola
    .then(() => DB.guardar(clave, json))
    .then(() => { ultimoError.value = undefined })
    .catch((e: unknown) => { ultimoError.value = `No pude guardar: ${e instanceof Error ? e.message : String(e)}` })
}

/** Espera a que se terminen de escribir los cambios pendientes. */
export const guardado = () => cola

async function leerGuardados(clave: 'datos' | 'ejemplo'): Promise<[Datos, string | undefined]> {
  const json = await DB.leer<string>(clave)
  if (json === undefined) return [datosVacios(), undefined]
  try {
    return [leerDatos(JSON.parse(json)), undefined]
  } catch {
    // No se pisa lo que no se pudo leer: se guarda una copia para poder recuperarlo.
    const copia = `${clave}-roto-${Date.now()}`
    await DB.guardar(copia, json)
    return [datosVacios(), `No pude leer tus datos (guardé una copia como "${copia}").`]
  }
}

// ─── Modo ejemplo ───

export async function entrarModoEjemplo(): Promise<void> {
  await cola
  modoEjemplo.value = true
  datos.value = datosDeEjemplo(new Date())
  guardar()
  chat.value = await leerChat('chat-ejemplo')
}

export async function salirModoEjemplo(): Promise<void> {
  await cola
  await DB.borrar('ejemplo')
  modoEjemplo.value = false
  const [d, error] = await leerGuardados('datos')
  datos.value = d
  ultimoError.value = error
  chat.value = await leerChat('chat')
  // Las fotos sacadas durante el ejemplo no quedan dando vueltas.
  await Fotos.limpiar(todasLasFotos(d))
}

// ─── Chat ───

export function agregarAlChat(m: MensajeChat): void {
  chat.value = [...chat.value, m]
  guardarChat()
}

export function borrarChat(): void {
  chat.value = []
  guardarChat()
}

function guardarChat(): void {
  const clave = claveChat()
  const json = aJSON(HistorialChat.recortar(chat.value))
  cola = cola.then(() => DB.guardar(clave, json)).catch(() => undefined)
}

async function leerChat(clave: 'chat' | 'chat-ejemplo'): Promise<MensajeChat[]> {
  const json = await DB.leer<string>(clave)
  if (!json) return []
  try {
    return (JSON.parse(json) as MensajeChat[]).map((m) => ({ ...m, fecha: leerFecha(m.fecha) }))
  } catch {
    return []
  }
}

// ─── Acciones rápidas ───

/** Acciones que necesitan un dato antes de guardarse. */
export type PedidoDato = { tipo: 'cosechar' | 'aFrascos' | 'semillas'; plantaID: string }

export const pedidoActual = signal<PedidoDato | undefined>(undefined)

export const textosPedido: Record<PedidoDato['tipo'], { titulo: string; pregunta: string; ayuda: string; entero: boolean }> = {
  cosechar: { titulo: 'Cosechar', pregunta: '¿Cuántos gramos húmedos?',
    ayuda: 'Pesá los cogollos recién cortados. Si no tenés balanza, poné 0.', entero: false },
  aFrascos: { titulo: 'A frascos', pregunta: '¿Cuántos gramos secos?',
    ayuda: 'Pesá los cogollos secos antes de meterlos en los frascos.', entero: false },
  semillas: { titulo: 'Semillas propias', pregunta: '¿Cuántas semillas juntaste?',
    ayuda: 'Se crea un pack de semillas regulares propias.', entero: true },
}

/** Ejecuta una acción rápida. Si hace falta preguntar algo antes, abre el pedido y devuelve false. */
export function ejecutar(accion: AccionTarea, plantaID: string, o: { tareaID?: string; dosis?: DosisTarea } = {}): boolean {
  const ahora = new Date()
  const id = plantaID
  const dosis = o.dosis
  switch (accion) {
    case 'regue':
      cambiar((d) => D.registrar(d, 'riego', id, ahora, { aguaML: dosis?.aguaML }))
      break
    case 'fertilice': {
      const f = dosis?.fertilizante
      cambiar((d) => D.registrar(d, 'fertilizante', id, ahora, {
        producto: f ? nombreFertilizante[f] : undefined,
        nota: dosis && f ? `${Formato.numero(dosis.fertilizanteML)} ml en ${Formato.volumen(dosis.aguaML)}` : undefined,
        aguaML: dosis?.aguaML,
        fertilizanteML: f ? dosis?.fertilizanteML : undefined,
        mlPorLitro: f ? dosis?.mlPorLitro : undefined,
      }))
      break
    }
    case 'neem':
      cambiar((d) => D.registrar(d, 'neem', id, ahora, { producto: 'Jabón potásico con neem' }))
      break
    case 'hembra':
      cambiar((d) => D.marcarSexo(d, 'hembra', id, ahora))
      break
    case 'macho':
      cambiar((d) => D.marcarSexo(d, 'macho', id, ahora))
      break
    case 'moverAdentro':
      cambiar((d) => D.moverAdentro(d, id, ahora))
      break
    case 'juntePolen':
      cambiar((d) => { D.juntarPolen(d, id, ahora) })
      break
    case 'registrarSemillas':
      pedidoActual.value = { tipo: 'semillas', plantaID: id }
      return false
    case 'cosechar':
      pedidoActual.value = { tipo: 'cosechar', plantaID: id }
      return false
    case 'aFrascos':
      pedidoActual.value = { tipo: 'aFrascos', plantaID: id }
      return false
    case 'abriFrascos':
      cambiar((d) => D.registrar(d, 'curado', id, ahora))
      break
    case 'terminar':
      cambiar((d) => D.terminar(d, id, ahora))
      break
    case 'revise':
      cambiar((d) => D.registrar(d, 'revision', id, ahora, { nota: 'Revisé hongos' }))
      break
    case 'hoyNo':
      if (o.tareaID) {
        const t = o.tareaID
        cambiar((d) => D.posponer(d, t, ahora))
      }
      break
  }
  return true
}

export const ejecutarTarea = (accion: AccionTarea, t: Tarea) => ejecutar(accion, t.plantaID, { tareaID: t.id, dosis: t.dosis })

/** Guarda el dato pedido. */
export function resolver(p: PedidoDato, valor: number): void {
  const ahora = new Date()
  switch (p.tipo) {
    case 'cosechar':
      cambiar((d) => D.cosechar(d, p.plantaID, ahora, valor))
      break
    case 'aFrascos':
      cambiar((d) => D.pasarAFrascos(d, p.plantaID, ahora, valor))
      break
    case 'semillas':
      cambiar((d) => { D.registrarSemillasPropias(d, p.plantaID, Math.trunc(valor), ahora) })
      break
  }
}

/** "Regué las N": registra el riego de cada tarea de riego pendiente, con su cantidad de agua. */
export function regarTodas(lista: Tarea[]): void {
  const ahora = new Date()
  const riegos = lista.filter((t) => t.tipo === 'riego')
  cambiar((d) => {
    for (const t of riegos) D.registrar(d, 'riego', t.plantaID, ahora, { aguaML: t.dosis?.aguaML })
  })
}

/** "Llovió": cuenta como riego para todas las del patio. Usa los mm de hoy si los hay. */
export function llovio(): number {
  const c = climaVigente.value
  const mm = c ? diaClima(c, hoy.value)?.lluviaMM : undefined
  let cuantas = 0
  cambiar((d) => { cuantas = D.llovio(d, new Date(), mm !== undefined && mm > 0 ? mm : undefined) })
  return cuantas
}
