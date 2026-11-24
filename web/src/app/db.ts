import { createStore, del, get, keys, set } from 'idb-keyval'

// Todo vive en IndexedDB, en este teléfono. Dos bases: una para los datos (JSON chicos) y otra
// para las fotos (archivos JPEG), así un backup o un "borrar todo" no tienen que tocarse entre sí.
const general = createStore('viejo-verde', 'general')
const fotos = createStore('viejo-verde-fotos', 'fotos')

export type Clave = 'datos' | 'ejemplo' | 'bandeja' | 'clima' | 'secretos' | 'preferencias'

export const DB = {
  leer: <T>(clave: Clave | string) => get<T>(clave, general),
  guardar: (clave: Clave | string, valor: unknown) => set(clave, valor, general),
  borrar: (clave: Clave | string) => del(clave, general),

  leerFoto: (nombre: string) => get<Blob>(nombre, fotos),
  guardarFoto: (nombre: string, blob: Blob) => set(nombre, blob, fotos),
  borrarFoto: (nombre: string) => del(nombre, fotos),
  nombresDeFotos: () => keys<string>(fotos),
}

/** Le pide al navegador que no borre los datos si se queda sin espacio. */
export async function pedirPersistencia(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export async function estaPersistido(): Promise<boolean> {
  try {
    return (await navigator.storage?.persisted?.()) ?? false
  } catch {
    return false
  }
}
