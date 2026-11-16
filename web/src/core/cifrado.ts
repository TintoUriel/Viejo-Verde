// Datos cifrados con una contraseña: AES-256-GCM con la clave derivada por PBKDF2-SHA-256.
// Así lo sensible (la URL y el token de la planilla) puede viajar en el código público sin poder leerse.

export interface Cifrado {
  /** Todo en base64. */
  sal: string
  iv: string
  datos: string
  iteraciones: number
}

const aBase64 = (b: Uint8Array) => btoa(String.fromCharCode(...b))
const deBase64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function clave(contrasenia: string, sal: Uint8Array<ArrayBuffer>, iteraciones: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(contrasenia), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: sal, iterations: iteraciones, hash: 'SHA-256' }, base,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export async function cifrarJSON(valor: unknown, contrasenia: string, iteraciones: number): Promise<Cifrado> {
  const sal = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const k = await clave(contrasenia, sal, iteraciones)
  const datos = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(JSON.stringify(valor))))
  return { sal: aBase64(sal), iv: aBase64(iv), datos: aBase64(datos), iteraciones }
}

/** Undefined si la contraseña no es la correcta (AES-GCM detecta cualquier diferencia). */
export async function descifrarJSON<T>(c: Cifrado, contrasenia: string): Promise<T | undefined> {
  try {
    const k = await clave(contrasenia, deBase64(c.sal), c.iteraciones)
    const plano = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deBase64(c.iv) }, k, deBase64(c.datos))
    return JSON.parse(new TextDecoder().decode(plano)) as T
  } catch {
    return undefined
  }
}
