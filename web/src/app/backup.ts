import { Calendario } from '../core/calendario'
import { backupAJSON, leerBackup, nuevoBackup, todasLasFotos, type Backup } from '../core/datos'
import { datos, reemplazarTodo } from './almacen'
import { elegirArchivo, Fotos } from './fotos'

/** Arma el backup (el mismo formato que la app de iOS) y lo ofrece para guardar o compartir. */
export async function exportarBackup(incluirFotos: boolean): Promise<'compartido' | 'descargado' | 'cancelado'> {
  const fotos: Record<string, string> = {}
  if (incluirFotos) {
    for (const nombre of todasLasFotos(datos.value)) {
      const b = await Fotos.base64(nombre)
      if (b) fotos[nombre] = b
    }
  }
  const json = backupAJSON(nuevoBackup(datos.value, new Date(), fotos))
  return guardarArchivo(`viejo-verde-${Calendario.claveDia(new Date())}.json`, json)
}

/** En el iPhone abre el menú de compartir (Guardar en Archivos, AirDrop, mensaje…); si no se puede, descarga. */
async function guardarArchivo(nombre: string, contenido: string): Promise<'compartido' | 'descargado' | 'cancelado'> {
  const archivo = new File([contenido], nombre, { type: 'application/json' })
  if (navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: nombre })
      return 'compartido'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelado'
      // Si compartir falla por otra cosa, se intenta la descarga.
    }
  }
  const url = URL.createObjectURL(archivo)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return 'descargado'
}

/** Elige un archivo y lo lee como backup. Undefined si se canceló; tira error si no es un backup. */
export async function elegirBackup(): Promise<Backup | undefined> {
  const archivo = await elegirArchivo('application/json,.json,text/plain')
  if (!archivo) return undefined
  return leerBackup(await archivo.text())
}

export async function aplicarBackup(b: Backup): Promise<void> {
  for (const [nombre, base64] of Object.entries(b.fotos)) await Fotos.escribirBase64(nombre, base64)
  reemplazarTodo(b.datos)
}
