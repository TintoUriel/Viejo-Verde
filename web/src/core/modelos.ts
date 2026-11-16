import { maxFecha, uuid } from './util'

// ─── Enumeraciones (los valores son los mismos que en el JSON de la app de iOS) ───

export const TIPOS_PLANTA = ['auto', 'foto'] as const
export type TipoPlanta = (typeof TIPOS_PLANTA)[number]
export const nombreTipoPlanta: Record<TipoPlanta, string> = { auto: 'Automática', foto: 'Fotoperiódica' }

export const TIPOS_SEMILLA = ['feminizada', 'regular'] as const
export type TipoSemilla = (typeof TIPOS_SEMILLA)[number]
export const nombreTipoSemilla: Record<TipoSemilla, string> = { feminizada: 'Feminizada', regular: 'Regular' }

export const SEXOS = ['desconocido', 'hembra', 'macho'] as const
export type Sexo = (typeof SEXOS)[number]
export const nombreSexo: Record<Sexo, string> = { desconocido: 'Sin saber', hembra: 'Hembra', macho: 'Macho' }

export const UBICACIONES = ['patio', 'interior'] as const
export type Ubicacion = (typeof UBICACIONES)[number]
export const nombreUbicacion: Record<Ubicacion, string> = { patio: 'Patio', interior: 'Adentro' }

export const ESTADOS_PLANTA = ['activa', 'secando', 'curando', 'terminada', 'descartada'] as const
export type EstadoPlanta = (typeof ESTADOS_PLANTA)[number]
export const nombreEstado: Record<EstadoPlanta, string> = {
  activa: 'Activa', secando: 'Secando', curando: 'Curando', terminada: 'Terminada', descartada: 'Descartada',
}

export const TIPOS_REGISTRO = ['riego', 'fertilizante', 'neem', 'nota', 'problema', 'sexo', 'polinizacion',
  'cosecha', 'secado', 'germinacion', 'curado', 'revision'] as const
export type TipoRegistro = (typeof TIPOS_REGISTRO)[number]
export const nombreTipoRegistro: Record<TipoRegistro, string> = {
  riego: 'Riego',
  fertilizante: 'Fertilizante',
  neem: 'Neem',
  nota: 'Nota',
  problema: 'Problema',
  sexo: 'Sexo',
  polinizacion: 'Polinización',
  cosecha: 'Cosecha',
  secado: 'A frascos',
  germinacion: 'Germinación',
  curado: 'Abrí frascos',
  revision: 'Revisión',
}

export const FERTILIZANTES = ['topVeg', 'topBloom'] as const
export type Fertilizante = (typeof FERTILIZANTES)[number]
export const nombreFertilizante: Record<Fertilizante, string> = { topVeg: 'Top Veg', topBloom: 'Top Bloom' }

/** Para las notas que la app escribe sola: qué fue en realidad (para la planilla). */
export const SUBTIPOS_REGISTRO = ['ubicacion', 'polen', 'terminada', 'descartada', 'semillasPropias'] as const
export type SubtipoRegistro = (typeof SUBTIPOS_REGISTRO)[number]

// ─── Registro ───

export interface Registro {
  id: string
  fecha: Date
  tipo: TipoRegistro
  producto?: string
  nota?: string
  /** Agua usada en el riego (o en el riego con fertilizante), si se registró. */
  aguaML?: number
  subtipo?: SubtipoRegistro
  /** Fertilizante: ml totales y ml por litro que se usaron. */
  fertilizanteML?: number
  mlPorLitro?: number
}

export type OpcionesRegistro = Partial<Omit<Registro, 'id' | 'fecha' | 'tipo'>>

export function nuevoRegistro(fecha: Date, tipo: TipoRegistro, o: OpcionesRegistro = {}, id = uuid()): Registro {
  const r: Registro = { id, fecha, tipo }
  if (o.producto !== undefined) r.producto = o.producto
  if (o.nota !== undefined) r.nota = o.nota
  if (o.aguaML !== undefined) r.aguaML = o.aguaML
  if (o.subtipo !== undefined) r.subtipo = o.subtipo
  if (o.fertilizanteML !== undefined) r.fertilizanteML = o.fertilizanteML
  if (o.mlPorLitro !== undefined) r.mlPorLitro = o.mlPorLitro
  return r
}

/** El subtipo, o el que se deduce del texto en los registros viejos (de antes de que existiera). */
export function subtipoEfectivo(r: Registro): SubtipoRegistro | undefined {
  if (r.subtipo) return r.subtipo
  if (r.tipo !== 'nota' || r.nota === undefined) return undefined
  switch (r.nota) {
    case 'Lo llevé adentro': return 'ubicacion'
    case 'Junté polen': return 'polen'
    case 'Curado completo': return 'terminada'
    case 'Descartada': return 'descartada'
    default:
      return r.nota.startsWith('Guardé ') && r.nota.endsWith(' semillas propias') ? 'semillasPropias' : undefined
  }
}

// ─── Cosecha ───

export interface Cosecha {
  fecha: Date
  gramosHumedos: number
  fechaFrascos?: Date
  gramosSecos?: number
}

// ─── Planta ───

export interface Planta {
  id: string
  nombre: string
  variedad: string
  tipo: TipoPlanta
  semilla: TipoSemilla
  sexo: Sexo
  ubicacion: Ubicacion
  fechaGerminacion: Date
  estado: EstadoPlanta
  fechaPolinizacion?: Date
  polenJuntado: boolean
  cosecha?: Cosecha
  registros: Registro[]
  /** Nombres de archivo de las fotos (se guardan aparte). */
  fotos: string[]
  /** Pack del que salió la semilla, si salió de uno. */
  paqueteOrigenID?: string
  /** Litros de la maceta (para calcular el agua y el fertilizante). */
  litrosMaceta: number
  /** Cuándo se sacó cada foto (nombre de archivo → fecha). */
  fechasFotos: Record<string, Date>
}

export interface NuevaPlanta {
  id?: string
  nombre: string
  variedad: string
  tipo: TipoPlanta
  semilla: TipoSemilla
  sexo?: Sexo
  ubicacion?: Ubicacion
  fechaGerminacion: Date
  estado?: EstadoPlanta
  registros?: Registro[]
  litrosMaceta?: number
}

export function nuevaPlanta(o: NuevaPlanta): Planta {
  return {
    id: o.id ?? uuid(),
    nombre: o.nombre,
    variedad: o.variedad,
    tipo: o.tipo,
    semilla: o.semilla,
    // Una feminizada es hembra de entrada.
    sexo: o.sexo ?? (o.semilla === 'feminizada' ? 'hembra' : 'desconocido'),
    ubicacion: o.ubicacion ?? 'patio',
    fechaGerminacion: o.fechaGerminacion,
    estado: o.estado ?? 'activa',
    polenJuntado: false,
    registros: o.registros ?? [],
    fotos: [],
    litrosMaceta: o.litrosMaceta ?? 20,
    fechasFotos: {},
  }
}

/** Fecha del último registro de alguno de esos tipos. */
export function ultimaFecha(p: Planta, tipos: readonly TipoRegistro[]): Date | undefined {
  return maxFecha(p.registros.filter((r) => tipos.includes(r.tipo)).map((r) => r.fecha))
}

/** Registros del más nuevo al más viejo. */
export function historial(p: Planta): Registro[] {
  return [...p.registros].sort((a, b) => b.fecha.getTime() - a.fecha.getTime())
}

// ─── Semillas y polen ───

export interface PaqueteSemillas {
  id: string
  nombre: string
  banco: string
  tipo: TipoPlanta
  semilla: TipoSemilla
  cantidad: number
  fechaCompra: Date
  propias: boolean
  /** Si son semillas propias: la planta madre. */
  plantaMadreID?: string
}

export function nuevoPaquete(o: Omit<PaqueteSemillas, 'id' | 'propias'> & { id?: string; propias?: boolean }): PaqueteSemillas {
  const p: PaqueteSemillas = {
    id: o.id ?? uuid(),
    nombre: o.nombre,
    banco: o.banco,
    tipo: o.tipo,
    semilla: o.semilla,
    cantidad: o.cantidad,
    fechaCompra: o.fechaCompra,
    propias: o.propias ?? false,
  }
  if (o.plantaMadreID !== undefined) p.plantaMadreID = o.plantaMadreID
  return p
}

export interface Polen {
  id: string
  fecha: Date
  plantaOrigenID?: string
  /** Se guarda el nombre aparte por si la planta se borra. */
  plantaOrigen: string
  notas: string
  usado: boolean
}

export function nuevoPolen(o: { fecha: Date; plantaOrigen: string; plantaOrigenID?: string; notas?: string; id?: string }): Polen {
  const p: Polen = { id: o.id ?? uuid(), fecha: o.fecha, plantaOrigen: o.plantaOrigen, notas: o.notas ?? '', usado: false }
  if (o.plantaOrigenID !== undefined) p.plantaOrigenID = o.plantaOrigenID
  return p
}

/** De la app de iOS (notificaciones). En la web no se usan, pero se conservan para que el backup vaya y vuelva igual. */
export interface AjustesAvisos {
  activos: boolean
  resumenDiario: boolean
  puntuales: boolean
  hora: number
  minuto: number
}

export function avisosPorDefecto(): AjustesAvisos {
  return { activos: true, resumenDiario: true, puntuales: true, hora: 9, minuto: 0 }
}
