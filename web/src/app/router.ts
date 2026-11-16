import { signal } from '@preact/signals'

// Navegación con "#" en la dirección (#/plantas, #/planta/<id>): GitHub Pages no sabe nada de las
// pantallas de la app, y así recargar en cualquier pantalla funciona igual.

export type Pestania = 'hoy' | 'plantas' | 'semillas' | 'asistente' | 'ajustes'
export const PESTANIAS: Pestania[] = ['hoy', 'plantas', 'semillas', 'asistente', 'ajustes']

function leer(): string {
  const r = decodeURIComponent(location.hash.replace(/^#\/?/, ''))
  return r === '' ? 'hoy' : r
}

export const ruta = signal(leer())
/** La última pestaña visitada (queda marcada mientras se navega dentro de ella). */
export const pestania = signal<Pestania>(pestaniaDe(leer()) ?? (/^(planta|cosechas)/.test(leer()) ? 'plantas' : 'hoy'))

function pestaniaDe(r: string): Pestania | undefined {
  return (PESTANIAS as string[]).includes(r) ? (r as Pestania) : undefined
}

// Posición del scroll de cada pantalla, para volver a donde estabas.
const scrolls = new Map<string, number>()
export const scrollGuardado = (r: string) => scrolls.get(r) ?? 0

/** Cuántas pantallas se apilaron con `ir` (para saber si "atrás" puede usar el historial). */
let apiladas = 0

function aplicar(): void {
  scrolls.set(ruta.value, window.scrollY)
  const nueva = leer()
  const p = pestaniaDe(nueva)
  if (p) pestania.value = p
  ruta.value = nueva
}

window.addEventListener('hashchange', aplicar)

/** Abre una pantalla encima de la actual. */
export function ir(r: string): void {
  apiladas++
  location.hash = '/' + r
}

/** Cambia de pestaña (sin apilar historial). */
export function irAPestania(p: Pestania): void {
  apiladas = 0
  if (ruta.value === p) {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }
  scrolls.set(p, 0)
  history.replaceState(null, '', '#/' + p)
  aplicar()
}

/** "Atrás": vuelve a la pantalla anterior, o a `siNoHay` si se entró directo (por ejemplo, recargando). */
export function volver(siNoHay: string): void {
  if (apiladas > 0) {
    apiladas--
    history.back()
  } else {
    history.replaceState(null, '', '#/' + siNoHay)
    aplicar()
  }
}

/** Reemplaza la pantalla actual (por ejemplo, después de borrar la planta que se estaba viendo). */
export function reemplazar(r: string): void {
  if (apiladas > 0) {
    apiladas--
    history.back()
    return
  }
  history.replaceState(null, '', '#/' + r)
  aplicar()
}
