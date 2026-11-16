import { signal } from '@preact/signals'

// Diálogos y avisos globales (en vez de window.confirm, que en el iPhone se ve feo y bloquea todo).

export interface OpcionDialogo {
  texto: string
  destructiva?: boolean
  valor: string
}

export interface Dialogo {
  titulo: string
  mensaje?: string
  opciones: OpcionDialogo[]
  resolver: (valor: string | undefined) => void
}

export const dialogo = signal<Dialogo | undefined>(undefined)

/** Hoja de acciones al estilo iOS. Devuelve el `valor` elegido, o undefined si se canceló. */
export function preguntar(titulo: string, opciones: OpcionDialogo[], mensaje?: string): Promise<string | undefined> {
  return new Promise((resolver) => {
    dialogo.value = {
      titulo, mensaje, opciones,
      resolver: (v) => {
        dialogo.value = undefined
        resolver(v)
      },
    }
  })
}

/** Confirmación de una sola acción. */
export async function confirmar(titulo: string, boton: string, o: { mensaje?: string; destructiva?: boolean } = {}): Promise<boolean> {
  return (await preguntar(titulo, [{ texto: boton, destructiva: o.destructiva, valor: 'si' }], o.mensaje)) === 'si'
}

export const aviso = signal<{ texto: string; id: number } | undefined>(undefined)
let temporizador: ReturnType<typeof setTimeout> | undefined

/** Cartelito que se va solo (para confirmar que algo quedó registrado). */
export function avisar(texto: string, ms = 2200): void {
  aviso.value = { texto, id: Date.now() }
  if (temporizador) clearTimeout(temporizador)
  temporizador = setTimeout(() => { aviso.value = undefined }, ms)
}

/** Mensaje que hay que leer (resultado de una acción de Ajustes). */
export async function mostrar(titulo: string, mensaje: string): Promise<void> {
  await preguntar(titulo, [], mensaje)
}
