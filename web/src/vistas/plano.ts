import { useEffect, useState } from 'preact/hooks'

// Lo que comparten los dos dibujos del patio (el de Hoy y el de Plantas → Patio).

/** Una imagen (data URL) de una grilla de colores: cada celda es un píxel, el SVG la estira. */
export function imagenDe(columnas: number, filas: number, color: (k: number) => string): string {
  const c = document.createElement('canvas')
  c.width = columnas
  c.height = filas
  const ctx = c.getContext('2d')
  if (!ctx) return ''
  const img = ctx.createImageData(columnas, filas)
  const cache = new Map<string, number[]>()
  for (let k = 0; k < columnas * filas; k++) {
    const hex = color(k)
    let rgb = cache.get(hex)
    if (!rgb) {
      rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
      cache.set(hex, rgb)
    }
    img.data.set([rgb[0], rgb[1], rgb[2], 255], k * 4)
  }
  ctx.putImageData(img, 0, 0)
  return c.toDataURL()
}

export function useOscuro(): boolean {
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : undefined
  const [oscuro, setOscuro] = useState(mq?.matches ?? false)
  useEffect(() => {
    if (!mq) return
    const f = () => setOscuro(mq.matches)
    mq.addEventListener('change', f)
    return () => mq.removeEventListener('change', f)
  }, [])
  return oscuro
}

/** Grosor de una pared en el dibujo: más alta, más gruesa (entre 3 y 10 px). */
export function grosorPared(alto: number): number {
  return alto === 0 ? 1.5 : Math.min(10, Math.max(3, 2 + alto * 1.4))
}

/** Un punto del SVG a partir de un toque, aunque el dibujo esté achicado o centrado adentro de su caja. */
export function puntoEnSVG(svg: SVGSVGElement, e: { clientX: number; clientY: number }): { x: number; y: number } {
  const m = svg.getScreenCTM()
  if (!m) return { x: 0, y: 0 }
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
  return { x: p.x, y: p.y }
}

/** Cambia de valor cada `ms` (para redibujar lo que depende de la hora, como el sol de ahora). */
export function useReloj(ms: number): number {
  const [t, setT] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setT(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return t
}
