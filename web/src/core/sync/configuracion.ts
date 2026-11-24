import { leerPatio, planta, type Datos } from '../datos'
import { LADOS, nombreRumbo, rumboLado, type Lado } from '../patio'

/**
 * La hoja "Configuración" de la planilla: lo que no es historial (el plano del patio, dónde va cada planta,
 * las dosis de las etiquetas). Una fila por dato, con un texto para leerla y una clave para que la app la
 * pueda volver a leer. Se reescribe entera cada vez que algo cambia (es chica).
 *
 * La clave es el camino del dato en los datos de la app ("patio.ancho", "patio.paredes.arriba.alto",
 * "patio.ubicaciones.<planta>.x"), así leerla de vuelta no depende de los textos.
 */

/** Una fila de la hoja "Configuración". */
export interface FilaConfig {
  seccion: string
  dato: string
  valor: number | string
  clave: string
}

const NOMBRE_PARED: Record<Lado, string> = {
  arriba: 'Pared de arriba', derecha: 'Pared derecha', abajo: 'Pared de abajo', izquierda: 'Pared izquierda',
}

export const Configuracion = {
  filas(d: Datos): FilaConfig[] {
    const r: FilaConfig[] = []
    const fila = (seccion: string, dato: string, valor: number | string, clave: string) => r.push({ seccion, dato, valor, clave })

    const p = d.patio
    if (p) {
      fila('Patio', 'Ancho, de la pared izquierda a la derecha (m)', p.ancho, 'patio.ancho')
      fila('Patio', 'Largo, de la pared de arriba a la de abajo (m)', p.largo, 'patio.largo')
      fila('Patio', `La pared de arriba da al ${nombreRumbo(p.orientacion)} (grados desde el norte; 90 = este)`, p.orientacion,
        'patio.orientacion')
      fila('Patio', 'Altura de las plantas, con la maceta (m)', p.alturaPlantas, 'patio.alturaPlantas')
      fila('Patio', 'Latitud', p.latitud, 'patio.latitud')
      fila('Patio', 'Longitud', p.longitud, 'patio.longitud')

      for (const lado of LADOS) {
        const pared = p.paredes[lado]
        const nombre = `${NOMBRE_PARED[lado]} (${nombreRumbo(rumboLado(p, lado))})`
        fila('Paredes', `${nombre}: alto (m; 0 = abierto)`, pared.alto, `patio.paredes.${lado}.alto`)
        if (pared.detras) {
          fila('Paredes', `${nombre}: edificio detrás, alto (m)`, pared.detras.alto, `patio.paredes.${lado}.detras.alto`)
          fila('Paredes', `${nombre}: edificio detrás, a cuántos metros`, pared.detras.distancia, `patio.paredes.${lado}.detras.distancia`)
        }
      }

      for (const pl of d.plantas) {
        const u = p.ubicaciones[pl.id]
        if (!u) continue
        fila('Lugar de cada planta', `${pl.nombre}: desde la pared izquierda (m)`, u.x, `patio.ubicaciones.${pl.id}.x`)
        fila('Lugar de cada planta', `${pl.nombre}: desde la pared de arriba (m)`, u.y, `patio.ubicaciones.${pl.id}.y`)
      }

      for (const o of p.obstaculos) {
        const nombre = o.nombre === '' ? 'Sin nombre' : o.nombre
        const base = `patio.obstaculos.${o.id}`
        fila('Cosas que dan sombra', 'Nombre', o.nombre, `${base}.nombre`)
        fila('Cosas que dan sombra', `${nombre}: desde la pared izquierda (m)`, o.x, `${base}.x`)
        fila('Cosas que dan sombra', `${nombre}: desde la pared de arriba (m)`, o.y, `${base}.y`)
        fila('Cosas que dan sombra', `${nombre}: ancho (m)`, o.ancho, `${base}.ancho`)
        fila('Cosas que dan sombra', `${nombre}: largo (m)`, o.largo, `${base}.largo`)
        fila('Cosas que dan sombra', `${nombre}: alto (m)`, o.alto, `${base}.alto`)
      }
    }

    fila('Fertilizante', 'Top Veg: dosis de la etiqueta (ml por litro)', d.config.topVegEtiquetaMlPorLitro, 'config.topVegEtiquetaMlPorLitro')
    fila('Fertilizante', 'Top Bloom: dosis de la etiqueta (ml por litro)', d.config.topBloomEtiquetaMlPorLitro,
      'config.topBloomEtiquetaMlPorLitro')
    return r
  },

  /** Lo inverso: pone en `d` el patio y las dosis que dicen las filas (las de plantas que no existen se ignoran). */
  aplicar(d: Datos, filas: { clave?: unknown; valor?: unknown }[]): void {
    const raiz: Record<string, unknown> = {}
    for (const f of filas) {
      if (typeof f.clave !== 'string' || f.clave === '') continue
      const camino = f.clave.split('.')
      let o = raiz
      for (const k of camino.slice(0, -1)) {
        if (typeof o[k] !== 'object' || o[k] === null) o[k] = {}
        o = o[k] as Record<string, unknown>
      }
      o[camino[camino.length - 1]] = valor(f.valor)
    }

    const config = raiz.config as Record<string, unknown> | undefined
    for (const k of ['topVegEtiquetaMlPorLitro', 'topBloomEtiquetaMlPorLitro'] as const) {
      const v = config?.[k]
      if (typeof v === 'number' && v > 0) d.config[k] = v
    }

    const p = raiz.patio as Record<string, unknown> | undefined
    if (!p) return
    const obstaculos = (p.obstaculos ?? {}) as Record<string, Record<string, unknown>>
    const ubicaciones = (p.ubicaciones ?? {}) as Record<string, Record<string, unknown>>
    try {
      d.patio = leerPatio({
        ...p,
        obstaculos: Object.entries(obstaculos).map(([id, o]) => ({ ...o, id, nombre: o.nombre === undefined ? '' : String(o.nombre) })),
        ubicaciones: Object.fromEntries(Object.entries(ubicaciones).filter(([id]) => planta(d, id) !== undefined)),
      })
    } catch {
      // Un número mal escrito a mano en la hoja: mejor sin patio que con uno roto.
    }
  },
}

/** Números como números aunque vengan como texto ("2,5"); lo demás, como texto. */
function valor(v: unknown): number | string {
  if (typeof v === 'number') return v
  const s = String(v ?? '').trim()
  const n = Number(s.replace(',', '.'))
  return s !== '' && Number.isFinite(n) ? n : s
}
