import { Calendario } from './calendario'
import { D, datosVacios, type Datos } from './datos'
import { nuevaPlanta, nuevoPaquete, nuevoPolen, nuevoRegistro } from './modelos'
import { nuevoObstaculo, patioPorDefecto } from './patio'

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

  // El patio: 4 × 7 m, el fondo da al norte (un poco al este), medianera alta a la izquierda y un edificio al fondo.
  const patio = patioPorDefecto()
  patio.ancho = 4
  patio.largo = 7
  patio.orientacion = 20
  patio.paredes = {
    arriba: { alto: 2.2, detras: { alto: 10, distancia: 6 } },
    derecha: { alto: 2.5 },
    abajo: { alto: 3 },
    izquierda: { alto: 5 },
  }
  patio.obstaculos = [nuevoObstaculo({ nombre: 'Parrilla', x: 2.9, y: 0, ancho: 1.1, largo: 0.6, alto: 2 })]
  const lugares: Record<string, { x: number; y: number }> = {
    'Banana 1': { x: 3.4, y: 6.4 }, 'Banana 2': { x: 2.5, y: 6.4 }, 'Banana 3': { x: 1.6, y: 6.4 }, 'Regular 1': { x: 2, y: 3 },
  }
  for (const pl of d.plantas) if (lugares[pl.nombre]) patio.ubicaciones[pl.id] = lugares[pl.nombre]
  D.guardarPatio(d, patio)
  return d
}
