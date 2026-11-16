import { datosVacios, type Datos } from '../datos'
import { Formato } from '../formato'
import {
  ESTADOS_PLANTA, nuevoPaquete, nuevoPolen, nuevoRegistro,
  type EstadoPlanta, type OpcionesRegistro, type PaqueteSemillas, type Planta, type Polen, type TipoRegistro,
} from '../modelos'
import { leerFecha } from '../util'
import { TE } from './modelos'

/**
 * Reconstruye los datos a partir de las hojas "Registro" y "Plantas" de la planilla. Se usa una sola
 * vez: cuando la planilla todavía no tiene la copia completa (hoja "Estado"), por ejemplo con lo que
 * mandó la app de iPhone. Los registros conservan el ID de su fila, así "Sincronizar todo" no duplica.
 *
 * Lo que no se puede recuperar: las fotos (en la planilla solo está el hecho) y las correcciones
 * de registros (se aplican los borrados, pero no los cambios de valores).
 */

/** Una fila de "Registro" (las claves son las del JSON que manda la app). */
export interface FilaRegistro {
  id: string
  fecha?: string
  tipo: string
  plantaID?: string
  planta?: string
  variedad?: string
  autoFoto?: string
  cantidad?: number
  unidad?: string
  producto?: string
  dosis?: number
  nota?: string
}

/** Una fila de "Plantas". */
export interface FilaPlanta {
  id: string
  nombre: string
  variedad?: string
  autoFoto?: string
  semilla?: string
  sexo?: string
  ubicacion?: string
  litros?: number
  germinacion?: string
  estado?: string
  gramosHumedos?: number
  gramosSecos?: number
}

const UUID = '[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}'
const esUUID = (s: string) => new RegExp(`^${UUID}$`).test(s)

/** Lo que vuelve del Apps Script: celdas vacías como "", números como números. */
export function limpiarFila<T>(o: Record<string, unknown>): T {
  const r: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) {
    if (v === '' || v === null || v === undefined) continue
    r[k] = typeof v === 'number' ? v : String(v)
  }
  return r as T
}

function fecha(s: string | undefined): Date | undefined {
  if (!s) return undefined
  try {
    return leerFecha(s)
  } catch {
    return undefined
  }
}

export function reconstruir(filasRegistro: FilaRegistro[], filasPlantas: FilaPlanta[]): Datos {
  const d = datosVacios()
  const eventos = filasRegistro
    .map((e, orden) => ({ e, orden, f: fecha(e.fecha) }))
    .filter((x): x is { e: FilaRegistro; orden: number; f: Date } => x.f !== undefined && typeof x.e.id === 'string')
    .sort((a, b) => a.f.getTime() - b.f.getTime() || a.orden - b.orden)

  // ─── Plantas (estado actual de la hoja "Plantas") ───
  const plantas = new Map<string, Planta>()
  for (const fp of filasPlantas) {
    if (!fp.id || !fp.nombre || fp.estado === 'borrada') continue
    const germ = fecha(fp.germinacion) ?? eventos.find((x) => x.e.plantaID === fp.id && x.e.tipo === TE.germinacion)?.f
    if (!germ) continue
    plantas.set(fp.id, {
      id: fp.id,
      nombre: fp.nombre,
      variedad: fp.variedad ?? '',
      tipo: fp.autoFoto === 'Foto' ? 'foto' : 'auto',
      semilla: fp.semilla === 'Regular' ? 'regular' : 'feminizada',
      sexo: fp.sexo === 'Hembra' ? 'hembra' : fp.sexo === 'Macho' ? 'macho' : 'desconocido',
      ubicacion: fp.ubicacion === 'Adentro' ? 'interior' : 'patio',
      fechaGerminacion: germ,
      estado: (ESTADOS_PLANTA as readonly string[]).includes(fp.estado ?? '') ? (fp.estado as EstadoPlanta) : 'activa',
      polenJuntado: false,
      registros: [],
      fotos: [],
      litrosMaceta: fp.litros ?? 20,
      fechasFotos: {},
    })
  }

  const paquetes = new Map<string, PaqueteSemillas>()
  const polenes = new Map<string, Polen>()
  const packPorNombre = (nombre: string | undefined) =>
    [...paquetes.values()].reverse().find((k) => k.nombre === nombre)
  const polenPorProducto = (producto: string | undefined) =>
    [...polenes.values()].reverse().find((x) => `Polen de ${x.plantaOrigen}` === producto)

  const registrar = (e: FilaRegistro, f: Date, tipo: TipoRegistro, o: OpcionesRegistro = {}) => {
    const p = e.plantaID ? plantas.get(e.plantaID) : undefined
    if (p && !p.registros.some((r) => r.id === e.id)) p.registros.push(nuevoRegistro(f, tipo, o, e.id))
    return p
  }

  for (const { e, f } of eventos) {
    const nota = e.nota
    switch (e.tipo) {
      // ─── Semillas ───
      case TE.altaSemillas:
      case TE.bajaSemillas: {
        if (e.tipo === TE.altaSemillas && e.id.startsWith('semillas-')) {
          const partes = (nota ?? '').split(' · ')
          const tipoTexto = partes[1] ?? ''
          const propias = partes[2] === 'propias'
          const pack = nuevoPaquete({
            id: e.id.slice('semillas-'.length),
            nombre: e.producto ?? '',
            banco: partes[0] ?? '',
            tipo: e.autoFoto === 'Foto' || tipoTexto.startsWith('Fotoperiódica') ? 'foto' : 'auto',
            semilla: /regular/i.test(tipoTexto) ? 'regular' : 'feminizada',
            cantidad: e.cantidad ?? 0,
            fechaCompra: f,
            propias,
            plantaMadreID: propias ? e.plantaID : undefined,
          })
          paquetes.set(pack.id, pack)
          if (propias && e.cantidad !== undefined) {
            registrar(e, f, 'nota', { nota: `Guardé ${e.cantidad} semillas propias`, subtipo: 'semillasPropias' })
          }
          break
        }
        if (nota?.startsWith('Borré el pack ')) {
          const pack = packPorNombre(e.producto)
          if (pack) paquetes.delete(pack.id)
          break
        }
        const m = /^.*: (\d+) → (\d+)/.exec(nota ?? '')
        const pack = packPorNombre(e.producto)
        if (m && pack) pack.cantidad = Number(m[2])
        break
      }

      // ─── Polen ───
      case TE.polenJuntado: {
        if (e.id.startsWith('polen-')) {
          const origen = (e.producto ?? '').replace(/^Polen de /, '') || e.planta || ''
          const polen = nuevoPolen({ id: e.id.slice('polen-'.length), fecha: f, plantaOrigen: origen,
            plantaOrigenID: e.plantaID, notas: nota ?? '' })
          polenes.set(polen.id, polen)
          const p = e.plantaID ? plantas.get(e.plantaID) : undefined
          if (p) {
            p.polenJuntado = true
            p.registros.push(nuevoRegistro(f, 'nota', { nota: 'Junté polen', subtipo: 'polen' }, `polen-registro-${polen.id}`))
          }
        }
        break
      }
      case TE.polenUsado: {
        const polen = polenPorProducto(e.producto)
        if (polen) polen.usado = true
        break
      }

      // ─── Correcciones y borrados ───
      case TE.correccion: {
        const pack = new RegExp(`^Corrige semillas-(${UUID}): (.*)$`).exec(nota ?? '')
        if (pack) {
          const k = paquetes.get(pack[1])
          if (k) {
            for (const cambio of pack[2].split('; ')) {
              const c = /^(\w+): (.*) → (.*)$/.exec(cambio)
              if (!c) continue
              const [, campo, , nuevo] = c
              if (campo === 'nombre') k.nombre = nuevo
              if (campo === 'banco') k.banco = nuevo
              if (campo === 'tipo') k.tipo = nuevo.startsWith('Foto') ? 'foto' : 'auto'
              if (campo === 'semilla') k.semilla = nuevo === 'Regular' ? 'regular' : 'feminizada'
            }
          }
          break
        }
        const polen = new RegExp(`^Corrige polen-(${UUID}): marcado como no usado`).exec(nota ?? '')
        if (polen) {
          const x = polenes.get(polen[1])
          if (x) x.usado = false
        }
        break
      }
      case TE.borrado: {
        const reg = new RegExp(`^Borra (${UUID}):`).exec(nota ?? '')
        if (reg && e.plantaID) {
          const p = plantas.get(e.plantaID)
          if (p) p.registros = p.registros.filter((r) => r.id !== reg[1])
        }
        const polen = new RegExp(`^Borra polen-(${UUID}):`).exec(nota ?? '')
        if (polen) polenes.delete(polen[1])
        break
      }

      // ─── Registros del historial (su ID es el UUID del registro) ───
      default: {
        if (!esUUID(e.id)) break
        switch (e.tipo) {
          case TE.germinacion:
            registrar(e, f, 'germinacion')
            break
          case TE.riego:
            registrar(e, f, 'riego', e.unidad === 'ml' && e.cantidad !== undefined ? { aguaML: e.cantidad, producto: e.producto } : { producto: e.producto })
            break
          case TE.lluvia:
            registrar(e, f, 'riego', { producto: 'Lluvia', nota: e.cantidad !== undefined ? `${Formato.numero(e.cantidad)} mm` : nota })
            break
          case TE.fertilizante: {
            const agua = /Agua: (\d+) ml/.exec(nota ?? '')
            const resto = (nota ?? '').replace(/^Agua: \d+ ml(\. )?/, '').trim()
            const ml = e.cantidad
            const aguaML = agua ? Number(agua[1]) : undefined
            registrar(e, f, 'fertilizante', {
              producto: e.producto,
              fertilizanteML: ml,
              mlPorLitro: e.dosis,
              aguaML,
              nota: resto !== '' ? resto : ml !== undefined && aguaML !== undefined
                ? `${Formato.numero(ml)} ml en ${Formato.volumen(aguaML)}` : undefined,
            })
            break
          }
          case TE.neem:
            registrar(e, f, 'neem', { producto: e.producto, nota })
            break
          case TE.nota:
            registrar(e, f, 'nota', { nota, producto: e.producto })
            break
          case TE.problema:
            registrar(e, f, 'problema', { nota })
            break
          case TE.sexado:
            registrar(e, f, 'sexo', { nota })
            break
          case TE.polinizacion: {
            const p = registrar(e, f, 'polinizacion', { nota })
            if (p) p.fechaPolinizacion = f
            break
          }
          case TE.cosecha: {
            const p = registrar(e, f, 'cosecha', { nota: e.cantidad !== undefined ? `${Formato.numero(e.cantidad)} g húmedos` : undefined })
            if (p) p.cosecha = { ...p.cosecha, fecha: f, gramosHumedos: e.cantidad ?? p.cosecha?.gramosHumedos ?? 0 }
            break
          }
          case TE.aFrascos: {
            const p = registrar(e, f, 'secado', { nota: e.cantidad !== undefined ? `${Formato.numero(e.cantidad)} g secos` : undefined })
            if (p) {
              p.cosecha = { fecha: p.cosecha?.fecha ?? f, gramosHumedos: p.cosecha?.gramosHumedos ?? 0, fechaFrascos: f }
              if (e.cantidad !== undefined) p.cosecha.gramosSecos = e.cantidad
            }
            break
          }
          case TE.aperturaFrascos:
            registrar(e, f, 'curado')
            break
          case TE.revision:
            registrar(e, f, 'revision', { nota })
            break
          case TE.cambioUbicacion:
            // Los cambios hechos a mano ("Patio → Adentro") no son registros: solo "Lo llevé adentro".
            if (nota === 'Lo llevé adentro') registrar(e, f, 'nota', { nota, subtipo: 'ubicacion' })
            break
          case TE.finCurado:
            registrar(e, f, 'nota', { nota: 'Curado completo', subtipo: 'terminada' })
            break
          case TE.descarte:
            registrar(e, f, 'nota', { nota: nota ?? 'Descartada', subtipo: 'descartada' })
            break
        }
      }
    }
  }

  // Los gramos finales salen de la hoja "Plantas" (ya tienen aplicadas las correcciones).
  for (const fp of filasPlantas) {
    const p = plantas.get(fp.id)
    if (!p) continue
    if (fp.gramosHumedos !== undefined || fp.gramosSecos !== undefined) {
      const c = p.cosecha ?? { fecha: p.fechaGerminacion, gramosHumedos: 0 }
      if (fp.gramosHumedos !== undefined) c.gramosHumedos = fp.gramosHumedos
      if (fp.gramosSecos !== undefined) c.gramosSecos = fp.gramosSecos
      p.cosecha = c
    }
    if (!p.registros.some((r) => r.tipo === 'germinacion')) {
      p.registros.unshift(nuevoRegistro(p.fechaGerminacion, 'germinacion'))
    }
  }

  d.plantas = [...plantas.values()]
  d.paquetes = [...paquetes.values()]
  d.polenes = [...polenes.values()]
  return d
}

/** ¿Hay algo cargado? (para no pisar con una copia vacía ni subir datos vacíos sin querer). */
export const tieneDatos = (d: Datos) => d.plantas.length > 0 || d.paquetes.length > 0 || d.polenes.length > 0
