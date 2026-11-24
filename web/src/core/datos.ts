import { Calendario } from './calendario'
import { configPorDefecto, type ConfigDosis } from './dosis'
import { Formato } from './formato'
import {
  avisosPorDefecto, ESTADOS_PLANTA, nombreSexo, nuevoPaquete, nuevoPolen, nuevoRegistro, SEXOS, SUBTIPOS_REGISTRO,
  TIPOS_PLANTA, TIPOS_REGISTRO, TIPOS_SEMILLA, UBICACIONES,
  type AjustesAvisos, type Cosecha, type OpcionesRegistro, type PaqueteSemillas, type Planta, type Polen,
  type Registro, type Sexo, type TipoRegistro,
} from './modelos'
import { ajustarPatio, CABA, LADOS, patioPorDefecto, type Lado, type Pared, type Patio, type Punto } from './patio'
import { aJSON, leerFecha } from './util'

/** Todo lo que guarda la app. Las operaciones viven acá (y no en la UI) para poder testearlas. */
export interface Datos {
  plantas: Planta[]
  paquetes: PaqueteSemillas[]
  polenes: Polen[]
  config: ConfigDosis
  /** Tareas a las que se les tocó "Hoy no": id de tarea → día. */
  pospuestas: Record<string, Date>
  avisos: AjustesAvisos
  /** El plano del patio (para ver dónde da el sol). No existe en la app de iOS. */
  patio?: Patio
}

export function datosVacios(): Datos {
  return { plantas: [], paquetes: [], polenes: [], config: configPorDefecto(), pospuestas: {}, avisos: avisosPorDefecto() }
}

export function planta(d: Datos, id: string): Planta | undefined {
  return d.plantas.find((p) => p.id === id)
}

function modificar(d: Datos, id: string, cambio: (p: Planta) => void): void {
  const p = planta(d, id)
  if (p) cambio(p)
}

/** Operaciones sobre los datos. Todas modifican `d` en el lugar (como los `mutating` de Swift). */
export const D = {
  // ─── Plantas ───

  /** Agrega la planta (con su registro de germinación). Si sale de un pack, le descuenta una semilla. */
  agregarPlanta(d: Datos, p: Planta, paqueteID?: string): void {
    if (paqueteID) {
      const pack = d.paquetes.find((k) => k.id === paqueteID)
      if (pack) {
        pack.cantidad = Math.max(pack.cantidad - 1, 0)
        p.paqueteOrigenID = paqueteID
      }
    }
    if (!p.registros.some((r) => r.tipo === 'germinacion')) {
      p.registros.push(nuevoRegistro(p.fechaGerminacion, 'germinacion'))
    }
    d.plantas.push(p)
  },

  actualizar(d: Datos, p: Planta): void {
    const i = d.plantas.findIndex((x) => x.id === p.id)
    if (i >= 0) d.plantas[i] = p
  },

  borrarPlanta(d: Datos, id: string): void {
    d.plantas = d.plantas.filter((p) => p.id !== id)
    if (d.patio) delete d.patio.ubicaciones[id]
    d.pospuestas = Object.fromEntries(Object.entries(d.pospuestas).filter(([k]) => !k.endsWith(id)))
  },

  registrar(d: Datos, tipo: TipoRegistro, id: string, fecha: Date, o: OpcionesRegistro = {}): void {
    modificar(d, id, (p) => p.registros.push(nuevoRegistro(fecha, tipo, o)))
  },

  editarRegistro(d: Datos, r: Registro, id: string): void {
    modificar(d, id, (p) => {
      const i = p.registros.findIndex((x) => x.id === r.id)
      if (i >= 0) p.registros[i] = r
    })
  },

  borrarRegistro(d: Datos, registroID: string, id: string): void {
    modificar(d, id, (p) => { p.registros = p.registros.filter((r) => r.id !== registroID) })
  },

  marcarSexo(d: Datos, sexo: Sexo, id: string, fecha: Date): void {
    modificar(d, id, (p) => {
      p.sexo = sexo
      p.registros.push(nuevoRegistro(fecha, 'sexo', { nota: nombreSexo[sexo] }))
    })
  },

  moverAdentro(d: Datos, id: string, fecha: Date): void {
    modificar(d, id, (p) => {
      p.ubicacion = 'interior'
      p.registros.push(nuevoRegistro(fecha, 'nota', { nota: 'Lo llevé adentro', subtipo: 'ubicacion' }))
    })
  },

  polinizar(d: Datos, id: string, fecha: Date, nota?: string): void {
    modificar(d, id, (p) => {
      p.fechaPolinizacion = fecha
      p.registros.push(nuevoRegistro(fecha, 'polinizacion', { nota: nota ?? 'Polinicé una rama' }))
    })
  },

  /** Junta polen de un macho: crea el Polen y marca la planta. */
  juntarPolen(d: Datos, id: string, fecha: Date, notas = ''): Polen | undefined {
    const p = planta(d, id)
    if (!p) return undefined
    const polen = nuevoPolen({ fecha, plantaOrigenID: id, plantaOrigen: `${p.nombre} (${p.variedad})`, notas })
    d.polenes.push(polen)
    p.polenJuntado = true
    p.registros.push(nuevoRegistro(fecha, 'nota', { nota: 'Junté polen', subtipo: 'polen' }))
    return polen
  },

  cosechar(d: Datos, id: string, fecha: Date, gramosHumedos: number): void {
    modificar(d, id, (p) => {
      p.estado = 'secando'
      p.cosecha = { fecha, gramosHumedos }
      p.registros.push(nuevoRegistro(fecha, 'cosecha', { nota: `${Formato.numero(gramosHumedos)} g húmedos` }))
    })
  },

  pasarAFrascos(d: Datos, id: string, fecha: Date, gramosSecos: number): void {
    modificar(d, id, (p) => {
      p.estado = 'curando'
      const c: Cosecha = p.cosecha ?? { fecha, gramosHumedos: 0 }
      c.fechaFrascos = fecha
      c.gramosSecos = gramosSecos
      p.cosecha = c
      p.registros.push(nuevoRegistro(fecha, 'secado', { nota: `${Formato.numero(gramosSecos)} g secos` }))
    })
  },

  terminar(d: Datos, id: string, fecha: Date): void {
    modificar(d, id, (p) => {
      p.estado = 'terminada'
      p.registros.push(nuevoRegistro(fecha, 'nota', { nota: 'Curado completo', subtipo: 'terminada' }))
    })
  },

  descartar(d: Datos, id: string, fecha: Date, nota?: string): void {
    modificar(d, id, (p) => {
      p.estado = 'descartada'
      p.registros.push(nuevoRegistro(fecha, 'nota', { nota: nota ?? 'Descartada', subtipo: 'descartada' }))
    })
  },

  // ─── Semillas y polen ───

  /** Crea un pack de semillas propias (regulares) de esa planta. */
  registrarSemillasPropias(d: Datos, id: string, cantidad: number, fecha: Date): PaqueteSemillas | undefined {
    const p = planta(d, id)
    if (!p) return undefined
    const pack = nuevoPaquete({ nombre: `${p.variedad} propias`, banco: `Propias (${p.nombre})`, tipo: p.tipo,
      semilla: 'regular', cantidad: Math.max(cantidad, 0), fechaCompra: fecha, propias: true, plantaMadreID: id })
    d.paquetes.push(pack)
    D.registrar(d, 'nota', id, fecha, { nota: `Guardé ${cantidad} semillas propias`, subtipo: 'semillasPropias' })
    return pack
  },

  agregarPaquete(d: Datos, pack: PaqueteSemillas): void {
    d.paquetes.push(pack)
  },

  actualizarPaquete(d: Datos, pack: PaqueteSemillas): void {
    const i = d.paquetes.findIndex((k) => k.id === pack.id)
    if (i >= 0) d.paquetes[i] = pack
  },

  borrarPaquete(d: Datos, id: string): void {
    d.paquetes = d.paquetes.filter((k) => k.id !== id)
  },

  agregarPolen(d: Datos, polen: Polen): void {
    d.polenes.push(polen)
  },

  alternarPolenUsado(d: Datos, id: string): void {
    const p = d.polenes.find((x) => x.id === id)
    if (p) p.usado = !p.usado
  },

  borrarPolen(d: Datos, id: string): void {
    d.polenes = d.polenes.filter((x) => x.id !== id)
  },

  // ─── Fotos ───

  agregarFoto(d: Datos, nombre: string, id: string, fecha: Date = new Date()): void {
    modificar(d, id, (p) => {
      p.fotos.push(nombre)
      p.fechasFotos[nombre] = fecha
    })
  },

  quitarFoto(d: Datos, nombre: string, id: string): void {
    modificar(d, id, (p) => {
      p.fotos = p.fotos.filter((f) => f !== nombre)
      delete p.fechasFotos[nombre]
    })
  },

  // ─── Acciones en grupo ───

  /** Registra el mismo tipo en varias plantas. */
  registrarEnGrupo(d: Datos, tipo: TipoRegistro, ids: string[], fecha: Date, o: OpcionesRegistro = {}): void {
    for (const id of ids) D.registrar(d, tipo, id, fecha, o)
  },

  ajustarCantidad(d: Datos, paqueteID: string, delta: number): void {
    const p = d.paquetes.find((k) => k.id === paqueteID)
    if (p) p.cantidad = Math.max(p.cantidad + delta, 0)
  },

  // ─── Patio ───

  guardarPatio(d: Datos, p: Patio): void {
    d.patio = ajustarPatio(p)
  },

  /** Pone la planta en ese lugar del plano (o la saca, sin lugar). */
  ubicar(d: Datos, id: string, lugar: Punto | undefined): void {
    if (!d.patio) return
    if (lugar) d.patio.ubicaciones[id] = lugar
    else delete d.patio.ubicaciones[id]
    d.patio = ajustarPatio(d.patio)
  },

  // ─── Tareas ───

  posponer(d: Datos, tareaID: string, hoy: Date): void {
    d.pospuestas[tareaID] = hoy
    // Se limpian las viejas para que no crezca.
    d.pospuestas = Object.fromEntries(Object.entries(d.pospuestas).filter(([, f]) => Calendario.dias(f, hoy) <= 1))
  },
}

/** Todas las fotos referenciadas (para el backup y para limpiar archivos huérfanos). */
export function todasLasFotos(d: Datos): string[] {
  return d.plantas.flatMap((p) => p.fotos)
}

// ─── Lectura tolerante (como los init(from:) de Swift: si falta un campo nuevo, va el valor por defecto) ───

type Obj = Record<string, unknown>

function obj(v: unknown, que: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`Falta ${que}`)
  return v as Obj
}

function texto(o: Obj, k: string, porDefecto?: string): string {
  const v = o[k]
  if (typeof v === 'string') return v
  if (v === undefined || v === null) {
    if (porDefecto !== undefined) return porDefecto
    throw new Error(`Falta "${k}"`)
  }
  throw new Error(`"${k}" no es texto`)
}

function textoOpcional(o: Obj, k: string): string | undefined {
  const v = o[k]
  return typeof v === 'string' ? v : undefined
}

function numero(o: Obj, k: string, porDefecto?: number): number {
  const v = o[k]
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if ((v === undefined || v === null) && porDefecto !== undefined) return porDefecto
  throw new Error(`"${k}" no es un número`)
}

function numeroOpcional(o: Obj, k: string): number | undefined {
  const v = o[k]
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function booleano(o: Obj, k: string, porDefecto: boolean): boolean {
  const v = o[k]
  return typeof v === 'boolean' ? v : porDefecto
}

function fechaOpcional(o: Obj, k: string): Date | undefined {
  const v = o[k]
  return v === undefined || v === null ? undefined : leerFecha(v)
}

function uno<T extends string>(o: Obj, k: string, valores: readonly T[], porDefecto?: T): T {
  const v = o[k]
  if (v === undefined || v === null) {
    if (porDefecto !== undefined) return porDefecto
    throw new Error(`Falta "${k}"`)
  }
  if (typeof v === 'string' && (valores as readonly string[]).includes(v)) return v as T
  throw new Error(`"${k}" tiene un valor desconocido: ${String(v)}`)
}

function lista<T>(o: Obj, k: string, leer: (v: unknown) => T): T[] {
  const v = o[k]
  if (v === undefined || v === null) return []
  if (!Array.isArray(v)) throw new Error(`"${k}" no es una lista`)
  return v.map(leer)
}

function fechas(o: Obj, k: string): Record<string, Date> {
  const v = o[k]
  if (v === undefined || v === null) return {}
  return Object.fromEntries(Object.entries(obj(v, k)).map(([n, f]) => [n, leerFecha(f)]))
}

function sinVacios<T extends object>(x: T): T {
  for (const k of Object.keys(x) as (keyof T)[]) if (x[k] === undefined) delete x[k]
  return x
}

export function leerRegistro(v: unknown): Registro {
  const o = obj(v, 'registro')
  const sub = o.subtipo
  return sinVacios({
    id: texto(o, 'id'),
    fecha: leerFecha(o.fecha),
    tipo: uno(o, 'tipo', TIPOS_REGISTRO),
    producto: textoOpcional(o, 'producto'),
    nota: textoOpcional(o, 'nota'),
    aguaML: numeroOpcional(o, 'aguaML'),
    subtipo: typeof sub === 'string' && (SUBTIPOS_REGISTRO as readonly string[]).includes(sub)
      ? (sub as Registro['subtipo']) : undefined,
    fertilizanteML: numeroOpcional(o, 'fertilizanteML'),
    mlPorLitro: numeroOpcional(o, 'mlPorLitro'),
    phDrenaje: numeroOpcional(o, 'phDrenaje'),
  })
}

function leerCosecha(v: unknown): Cosecha {
  const o = obj(v, 'cosecha')
  return sinVacios({
    fecha: leerFecha(o.fecha),
    gramosHumedos: numero(o, 'gramosHumedos', 0),
    fechaFrascos: fechaOpcional(o, 'fechaFrascos'),
    gramosSecos: numeroOpcional(o, 'gramosSecos'),
  })
}

export function leerPlanta(v: unknown): Planta {
  const o = obj(v, 'planta')
  return sinVacios({
    id: texto(o, 'id'),
    nombre: texto(o, 'nombre'),
    variedad: texto(o, 'variedad', ''),
    tipo: uno(o, 'tipo', TIPOS_PLANTA),
    semilla: uno(o, 'semilla', TIPOS_SEMILLA),
    sexo: uno(o, 'sexo', SEXOS, 'desconocido'),
    ubicacion: uno(o, 'ubicacion', UBICACIONES, 'patio'),
    fechaGerminacion: leerFecha(o.fechaGerminacion),
    estado: uno(o, 'estado', ESTADOS_PLANTA, 'activa'),
    fechaPolinizacion: fechaOpcional(o, 'fechaPolinizacion'),
    polenJuntado: booleano(o, 'polenJuntado', false),
    cosecha: o.cosecha === undefined || o.cosecha === null ? undefined : leerCosecha(o.cosecha),
    registros: lista(o, 'registros', leerRegistro),
    fotos: lista(o, 'fotos', (x) => String(x)),
    paqueteOrigenID: textoOpcional(o, 'paqueteOrigenID'),
    litrosMaceta: numero(o, 'litrosMaceta', 20),
    fechasFotos: fechas(o, 'fechasFotos'),
  })
}

function leerPaquete(v: unknown): PaqueteSemillas {
  const o = obj(v, 'pack')
  return sinVacios({
    id: texto(o, 'id'),
    nombre: texto(o, 'nombre'),
    banco: texto(o, 'banco', ''),
    tipo: uno(o, 'tipo', TIPOS_PLANTA),
    semilla: uno(o, 'semilla', TIPOS_SEMILLA),
    cantidad: numero(o, 'cantidad', 0),
    fechaCompra: leerFecha(o.fechaCompra),
    propias: booleano(o, 'propias', false),
    plantaMadreID: textoOpcional(o, 'plantaMadreID'),
  })
}

function leerPolen(v: unknown): Polen {
  const o = obj(v, 'polen')
  return sinVacios({
    id: texto(o, 'id'),
    fecha: leerFecha(o.fecha),
    plantaOrigenID: textoOpcional(o, 'plantaOrigenID'),
    plantaOrigen: texto(o, 'plantaOrigen', ''),
    notas: texto(o, 'notas', ''),
    usado: booleano(o, 'usado', false),
  })
}

export function leerDatos(v: unknown): Datos {
  const o = obj(v, 'datos')
  const c = o.config === undefined || o.config === null ? {} : obj(o.config, 'config')
  const def = configPorDefecto()
  const a = o.avisos === undefined || o.avisos === null ? {} : obj(o.avisos, 'avisos')
  const defA = avisosPorDefecto()
  return {
    plantas: lista(o, 'plantas', leerPlanta),
    paquetes: lista(o, 'paquetes', leerPaquete),
    polenes: lista(o, 'polenes', leerPolen),
    config: {
      topVegEtiquetaMlPorLitro: numero(c, 'topVegEtiquetaMlPorLitro', def.topVegEtiquetaMlPorLitro),
      topBloomEtiquetaMlPorLitro: numero(c, 'topBloomEtiquetaMlPorLitro', def.topBloomEtiquetaMlPorLitro),
    },
    pospuestas: fechas(o, 'pospuestas'),
    avisos: {
      activos: booleano(a, 'activos', defA.activos),
      resumenDiario: booleano(a, 'resumenDiario', defA.resumenDiario),
      puntuales: booleano(a, 'puntuales', defA.puntuales),
      hora: numero(a, 'hora', defA.hora),
      minuto: numero(a, 'minuto', defA.minuto),
    },
    ...(o.patio === undefined || o.patio === null ? {} : { patio: leerPatio(o.patio) }),
  }
}

function leerPared(v: unknown, def: Pared): Pared {
  if (typeof v !== 'object' || v === null) return def
  const o = v as Obj
  const t = o.detras
  const detras = typeof t === 'object' && t !== null
    ? { alto: numero(t as Obj, 'alto', 0), distancia: numero(t as Obj, 'distancia', 0) }
    : undefined
  return sinVacios({ alto: numero(o, 'alto', def.alto), detras })
}

export function leerPatio(v: unknown): Patio {
  const o = obj(v, 'patio')
  const def = patioPorDefecto()
  const paredes = o.paredes === undefined || o.paredes === null ? {} : obj(o.paredes, 'paredes')
  const ubic = o.ubicaciones === undefined || o.ubicaciones === null ? {} : obj(o.ubicaciones, 'ubicaciones')
  return ajustarPatio({
    ancho: numero(o, 'ancho', def.ancho),
    largo: numero(o, 'largo', def.largo),
    paredes: Object.fromEntries(LADOS.map((l) => [l, leerPared(paredes[l], def.paredes[l])])) as Record<Lado, Pared>,
    orientacion: numero(o, 'orientacion', 0),
    alturaPlantas: numero(o, 'alturaPlantas', def.alturaPlantas),
    latitud: numero(o, 'latitud', CABA.latitud),
    longitud: numero(o, 'longitud', CABA.longitud),
    obstaculos: lista(o, 'obstaculos', (x) => {
      const b = obj(x, 'obstáculo')
      return { id: texto(b, 'id'), nombre: texto(b, 'nombre', ''), x: numero(b, 'x', 0), y: numero(b, 'y', 0),
        ancho: numero(b, 'ancho', 1), largo: numero(b, 'largo', 1), alto: numero(b, 'alto', 1) }
    }),
    ubicaciones: Object.fromEntries(Object.entries(ubic).map(([id, u]) => {
      const b = obj(u, 'ubicación')
      return [id, { x: numero(b, 'x', 0), y: numero(b, 'y', 0) }]
    })),
  })
}

// ─── Backup ───

export interface Backup {
  version: number
  exportado: Date
  datos: Datos
  /** Fotos en base64, por nombre de archivo (opcional). */
  fotos: Record<string, string>
}

export const BACKUP_VERSION = 1

export function nuevoBackup(datos: Datos, exportado = new Date(), fotos: Record<string, string> = {}): Backup {
  return { version: BACKUP_VERSION, exportado, datos, fotos }
}

/** El mismo formato que exporta la app de iOS: se pueden pasar backups de una a la otra. */
export function backupAJSON(b: Backup): string {
  return aJSON(b, 2)
}

export function leerBackup(textoJSON: string): Backup {
  const o = obj(JSON.parse(textoJSON), 'backup')
  const f = o.fotos === undefined || o.fotos === null ? {} : obj(o.fotos, 'fotos')
  return {
    version: numero(o, 'version', 1),
    exportado: o.exportado === undefined ? new Date() : leerFecha(o.exportado),
    datos: leerDatos(o.datos),
    fotos: Object.fromEntries(Object.entries(f).filter(([, v]) => typeof v === 'string')) as Record<string, string>,
  }
}
