import { useEffect, useState } from 'preact/hooks'
import { uuid } from '../core/util'
import { DB } from './db'

/** Las fotos se guardan como JPEG en IndexedDB; en los datos solo va el nombre del archivo. */
export const Fotos = {
  /** Guarda la foto (achicada a 2048 px) y devuelve el nombre del archivo. */
  async guardar(archivo: Blob): Promise<string> {
    const nombre = uuid() + '.jpg'
    await DB.guardarFoto(nombre, await achicar(archivo, 2048, 0.8))
    return nombre
  },

  async borrar(nombre: string): Promise<void> {
    await DB.borrarFoto(nombre)
    const url = urls.get(nombre)
    if (url) {
      URL.revokeObjectURL(url)
      urls.delete(nombre)
    }
  },

  /** Borra los archivos que ya no usa ninguna planta. */
  async limpiar(enUso: Iterable<string>): Promise<void> {
    const usadas = new Set(enUso)
    for (const n of await DB.nombresDeFotos()) if (!usadas.has(n)) await Fotos.borrar(n)
  },

  /** JPEG para mandarle a Claude: lado mayor de 1568 px (lo que la API aprovecha), en base64. */
  async paraClaude(archivo: Blob): Promise<string> {
    return blobABase64(await achicar(archivo, 1568, 0.75))
  },

  async base64(nombre: string): Promise<string | undefined> {
    const b = await DB.leerFoto(nombre)
    return b ? blobABase64(b) : undefined
  },

  async escribirBase64(nombre: string, base64: string): Promise<void> {
    await DB.guardarFoto(nombre, base64ABlob(base64, 'image/jpeg'))
  },

  async url(nombre: string): Promise<string | undefined> {
    const hecha = urls.get(nombre)
    if (hecha) return hecha
    const b = await DB.leerFoto(nombre)
    if (!b) return undefined
    const u = URL.createObjectURL(b)
    urls.set(nombre, u)
    return u
  },
}

const urls = new Map<string, string>()

/** URL para mostrar una foto guardada (undefined mientras carga; null si no está). */
export function useFoto(nombre: string | undefined): string | null | undefined {
  const [url, setUrl] = useState<string | null | undefined>(nombre ? urls.get(nombre) : undefined)
  useEffect(() => {
    if (!nombre) return
    let vivo = true
    Fotos.url(nombre).then((u) => vivo && setUrl(u ?? null), () => vivo && setUrl(null))
    return () => { vivo = false }
  }, [nombre])
  return url
}

// ─── Imágenes ───

function cargarImagen(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolver, rechazar) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolver(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      rechazar(new Error('No pude abrir la imagen.'))
    }
    img.src = url
  })
}

/** Achica (sin agrandar) y pasa a JPEG. El navegador ya aplica la rotación de la cámara. */
export async function achicar(blob: Blob, lado: number, calidad: number): Promise<Blob> {
  const img = await cargarImagen(blob)
  const ancho = img.naturalWidth
  const alto = img.naturalHeight
  const mayor = Math.max(ancho, alto)
  const factor = mayor > lado ? lado / mayor : 1
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(Math.round(ancho * factor), 1)
  canvas.height = Math.max(Math.round(alto * factor), 1)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No pude procesar la imagen.')
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return new Promise((resolver, rechazar) =>
    canvas.toBlob((b) => (b ? resolver(b) : rechazar(new Error('No pude guardar la imagen.'))), 'image/jpeg', calidad))
}

export function blobABase64(blob: Blob): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const r = new FileReader()
    r.onload = () => resolver(String(r.result).replace(/^data:[^,]*,/, ''))
    r.onerror = () => rechazar(r.error)
    r.readAsDataURL(blob)
  })
}

export function base64ABlob(base64: string, tipo: string): Blob {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: tipo })
}

/** Abre la cámara o la galería y devuelve el archivo elegido. */
export function elegirFoto(): Promise<File | undefined> {
  return elegirArchivo('image/*')
}

export function elegirArchivo(aceptar: string): Promise<File | undefined> {
  return new Promise((resolver) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = aceptar
    input.style.display = 'none'
    document.body.appendChild(input)
    input.addEventListener('change', () => {
      resolver(input.files?.[0])
      input.remove()
    })
    input.addEventListener('cancel', () => {
      resolver(undefined)
      input.remove()
    })
    input.click()
  })
}
