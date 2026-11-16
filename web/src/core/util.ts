// Ayudas chicas que en Swift venían gratis (UUID, Equatable, redondeo, ISO 8601).

/** UUID en mayúsculas, como `UUID().uuidString` de Swift (así los IDs viejos y nuevos se ven iguales). */
export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID().toUpperCase()
  // randomUUID solo existe en HTTPS o localhost (por ejemplo, probando desde la IP de la PC no está).
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`.toUpperCase()
}

/** Redondeo "de escuela" (0,5 se aleja del cero), como `.rounded()` de Swift. */
export function redondear(x: number): number {
  return Math.sign(x) * Math.round(Math.abs(x))
}

/** ISO 8601 sin milisegundos ("2026-11-20T15:00:00Z"), como el JSONEncoder de Swift. */
export function iso(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function leerFecha(v: unknown): Date {
  if (v instanceof Date) return v
  if (typeof v !== 'string' && typeof v !== 'number') throw new Error('Fecha inválida')
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) throw new Error(`Fecha inválida: ${String(v)}`)
  return d
}

/** JSON con las fechas en ISO sin milisegundos (compatible con los backups de la app de iOS). */
export function aJSON(valor: unknown, espacios?: number): string {
  return JSON.stringify(
    valor,
    function (this: Record<string, unknown>, clave, v) {
      const original = this[clave]
      return original instanceof Date ? iso(original) : v
    },
    espacios,
  )
}

/** Igualdad profunda. Una propiedad `undefined` cuenta igual que una que no está (como los opcionales nil). */
export function iguales(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime()
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => iguales(x, b[i]))
  }
  const oa = a as Record<string, unknown>
  const ob = b as Record<string, unknown>
  const claves = new Set([...Object.keys(oa), ...Object.keys(ob)])
  for (const k of claves) {
    if (!iguales(oa[k], ob[k])) return false
  }
  return true
}

/** El último elemento que cumple la condición. */
export function ultimo<T>(lista: readonly T[], cond: (x: T) => boolean): T | undefined {
  for (let i = lista.length - 1; i >= 0; i--) if (cond(lista[i])) return lista[i]
  return undefined
}

export function maxFecha(fechas: Iterable<Date>): Date | undefined {
  let m: Date | undefined
  for (const f of fechas) if (!m || f.getTime() > m.getTime()) m = f
  return m
}

export type Resultado<T, E> = { ok: true; valor: T } | { ok: false; error: E }

export const exito = <T>(valor: T): { ok: true; valor: T } => ({ ok: true, valor })
export const falla = <E>(error: E): { ok: false; error: E } => ({ ok: false, error })
