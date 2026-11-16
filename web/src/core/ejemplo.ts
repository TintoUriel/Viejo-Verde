import { Calendario } from './calendario'
import { D, datosVacios, type Datos } from './datos'
import { nuevaPlanta, nuevoPaquete, nuevoPolen, nuevoRegistro } from './modelos'

/** Datos de ejemplo para probar la app. Se cargan en un almacén aparte, nunca sobre los datos reales. */
export function datosDeEjemplo(hoy: Date): Datos {
  const hace = (dias: number) => Calendario.sumarDias(-dias, hoy)
  const d = datosVacios()

  const packBanana = nuevoPaquete({ nombre: 'Banana Blaze', banco: 'Dutch Passion', tipo: 'auto', semilla: 'feminizada',
    cantidad: 5, fechaCompra: hace(120) })
  const packReg = nuevoPaquete({ nombre: 'Auto regular', banco: 'Banco ejemplo', tipo: 'auto', semilla: 'regular',
    cantidad: 6, fechaCompra: hace(90) })
  d.paquetes = [packBanana, packReg]

  // Banana 1: en crecimiento, le toca agua y Top Veg.
  D.agregarPlanta(d, nuevaPlanta({ nombre: 'Banana 1', variedad: 'Banana Blaze', tipo: 'auto', semilla: 'feminizada',
    fechaGerminacion: hace(15), registros: [
      nuevoRegistro(hace(3), 'riego', { aguaML: 1000 }),
      nuevoRegistro(hace(8), 'fertilizante', { producto: 'Top Veg' }),
    ] }), packBanana.id)

  // Banana 2: en floración.
  D.agregarPlanta(d, nuevaPlanta({ nombre: 'Banana 2', variedad: 'Banana Blaze', tipo: 'auto', semilla: 'feminizada',
    fechaGerminacion: hace(48), registros: [
      nuevoRegistro(hace(1), 'riego', { aguaML: 3000 }),
      nuevoRegistro(hace(4), 'fertilizante', { producto: 'Top Bloom' }),
      nuevoRegistro(hace(2), 'nota', { nota: 'Muchos pelitos blancos, huele rico' }),
    ] }), packBanana.id)

  // Banana 3: madurando, toca revisar tricomas.
  D.agregarPlanta(d, nuevaPlanta({ nombre: 'Banana 3', variedad: 'Banana Blaze', tipo: 'auto', semilla: 'feminizada',
    fechaGerminacion: hace(76), registros: [nuevoRegistro(hace(2), 'riego', { aguaML: 3000 })] }), packBanana.id)

  // Regular 1: día 23, sin sexar.
  D.agregarPlanta(d, nuevaPlanta({ nombre: 'Regular 1', variedad: 'Auto regular', tipo: 'auto', semilla: 'regular',
    fechaGerminacion: hace(23) }), packReg.id)

  // Regular 2: macho, todavía en el patio (alerta).
  D.agregarPlanta(d, nuevaPlanta({ nombre: 'Regular 2', variedad: 'Auto regular', tipo: 'auto', semilla: 'regular',
    sexo: 'macho', fechaGerminacion: hace(27), registros: [nuevoRegistro(hace(1), 'riego')] }), packReg.id)

  // Una secando y otra curando.
  const s = nuevaPlanta({ nombre: 'Banana vieja', variedad: 'Banana Blaze', tipo: 'auto', semilla: 'feminizada',
    fechaGerminacion: hace(100), estado: 'secando' })
  s.cosecha = { fecha: hace(8), gramosHumedos: 180 }
  D.agregarPlanta(d, s)

  const c = nuevaPlanta({ nombre: 'Banana curada', variedad: 'Banana Blaze', tipo: 'auto', semilla: 'feminizada',
    fechaGerminacion: hace(120), estado: 'curando' })
  c.cosecha = { fecha: hace(25), gramosHumedos: 200, fechaFrascos: hace(10), gramosSecos: 48 }
  D.agregarPlanta(d, c)

  d.polenes = [nuevoPolen({ fecha: hace(200), plantaOrigen: 'Macho viejo (Auto regular)', notas: 'Sobre en frasco con arroz' })]
  return d
}
