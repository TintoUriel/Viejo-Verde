import { signal } from '@preact/signals'
import { descifrarJSON } from '../core/cifrado'
import { alVolver } from './almacen'
import { PLANILLA_CIFRADA } from './config'
import { DB } from './db'
import { guardarSecretos } from './servicios'
import { Sincronizador } from './sincronizador'

/** La app pide una contraseña la primera vez en cada teléfono; con ella se descifra la planilla. */
export const desbloqueada = signal<boolean | undefined>(undefined)

export async function cargarAcceso(): Promise<void> {
  desbloqueada.value = (await DB.leer<boolean>('desbloqueada')) === true
}

/** Devuelve false si la contraseña no es la correcta. */
export async function desbloquear(contrasenia: string): Promise<boolean> {
  const planilla = await descifrarJSON<{ url: string; token: string }>(PLANILLA_CIFRADA, contrasenia)
  if (!planilla) return false
  await guardarSecretos({ planillaURL: planilla.url, planillaToken: planilla.token })
  await DB.guardar('desbloqueada', true)
  desbloqueada.value = true
  // Conectada a la planilla de entrada: baja tus datos.
  await Sincronizador.cambiarActivada(true)
  void alVolver(true)
  return true
}
