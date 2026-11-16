import { Calendario } from '../src/core/calendario'
import { nuevaPlanta, nuevoRegistro, type Planta, type Registro, type Sexo, type TipoRegistro, type TipoSemilla, type Ubicacion } from '../src/core/modelos'

export const f = (a: number, m: number, d: number) => Calendario.fecha(a, m, d)

/** Hoy fijo para los tests de tareas. */
export const hoyTest = f(2026, 11, 20)

export const hace = (dias: number, desde: Date = hoyTest) => Calendario.sumarDias(-dias, desde)

export function auto(o: { dia: number; semilla?: TipoSemilla; sexo?: Sexo; ubicacion?: Ubicacion; registros?: Registro[]; nombre?: string }): Planta {
  return nuevaPlanta({
    nombre: o.nombre ?? 'Banana', variedad: 'Banana Blaze', tipo: 'auto', semilla: o.semilla ?? 'feminizada',
    sexo: o.sexo, ubicacion: o.ubicacion ?? 'patio', fechaGerminacion: hace(o.dia), registros: o.registros ?? [],
  })
}

export const reg = (tipo: TipoRegistro, dias: number, producto?: string): Registro =>
  nuevoRegistro(hace(dias), tipo, producto === undefined ? {} : { producto })
