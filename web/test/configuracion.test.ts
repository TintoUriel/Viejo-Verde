import { describe, expect, it } from 'vitest'
import { D, datosVacios } from '../src/core/datos'
import { datosDeEjemplo } from '../src/core/ejemplo'
import { Bandeja } from '../src/core/sync/bandeja'
import { Configuracion } from '../src/core/sync/configuracion'
import { iguales } from '../src/core/util'
import { hoyTest } from './ayudas'

describe('Hoja Configuración', () => {
  it('el patio, los lugares y las dosis van y vuelven igual', () => {
    const d = datosDeEjemplo(hoyTest)
    d.config.topVegEtiquetaMlPorLitro = 2.5
    const filas = Configuracion.filas(d)

    // Cada fila tiene una clave única y un texto para leer.
    expect(new Set(filas.map((f) => f.clave)).size).toBe(filas.length)
    expect(filas.every((f) => f.dato !== '' && f.seccion !== '')).toBe(true)
    const banana1 = d.plantas.find((p) => p.nombre === 'Banana 1')!
    expect(filas).toContainEqual({ seccion: 'Lugar de cada planta', dato: 'Banana 1: desde la pared izquierda (m)',
      valor: 3.4, clave: `patio.ubicaciones.${banana1.id}.x` })

    // Las mismas plantas, sin patio ni dosis: se rearman desde las filas.
    const x = { ...datosVacios(), plantas: d.plantas }
    Configuracion.aplicar(x, filas)
    expect(iguales(x.patio, d.patio)).toBe(true)
    expect(x.config).toEqual(d.config)
  })

  it('tolera lo escrito a mano: números con coma, lugares de plantas que no existen, claves vacías', () => {
    const d = datosVacios()
    const filas = [
      { clave: 'patio.ancho', valor: '2,25' },
      { clave: 'patio.largo', valor: 4 },
      { clave: 'patio.ubicaciones.no-existe.x', valor: 1 },
      { clave: '', valor: 3 },
      { valor: 'sin clave' },
    ]
    Configuracion.aplicar(d, filas)
    expect(d.patio?.ancho).toBe(2.25)
    expect(d.patio?.largo).toBe(4)
    expect(d.patio?.ubicaciones).toEqual({})
  })

  it('sin plano solo van las dosis; un número roto no rompe nada', () => {
    const d = datosVacios()
    expect(Configuracion.filas(d).map((f) => f.clave)).toEqual(['config.topVegEtiquetaMlPorLitro', 'config.topBloomEtiquetaMlPorLitro'])
    Configuracion.aplicar(d, [{ clave: 'patio.ancho', valor: 'mucho' }])
    expect(d.patio).toBeUndefined()
  })
})

describe('Cola de la hoja Configuración', () => {
  const conPatio = () => {
    const d = datosDeEjemplo(hoyTest)
    return { d, filas: Configuracion.filas(d) }
  }

  it('se manda una vez y no se repite si no cambió', () => {
    const { d, filas } = conPatio()
    const b = new Bandeja()
    expect(b.encolarConfiguracion(filas)).toBe(true)
    expect(b.vacia).toBe(false)
    const lote = b.lote()
    expect(lote.configuracion).toBe(filas)
    b.confirmar(lote, hoyTest)
    expect(b.vacia).toBe(true)
    expect(b.encolarConfiguracion(Configuracion.filas(d))).toBe(false)

    // Mover una planta cambia la hoja.
    D.ubicar(d, d.plantas[0].id, { x: 1, y: 1 })
    expect(b.encolarConfiguracion(Configuracion.filas(d))).toBe(true)
  })

  it('si cambia mientras se manda, queda la nueva', () => {
    const { d, filas } = conPatio()
    const b = new Bandeja()
    b.encolarConfiguracion(filas)
    const lote = b.lote()
    D.ubicar(d, d.plantas[0].id, { x: 1, y: 1 })
    b.encolarConfiguracion(Configuracion.filas(d))
    b.confirmar(lote, hoyTest)
    expect(b.configuracion).toEqual(Configuracion.filas(d))
  })

  it('con el script viejo sale de la cola (no se manda en cada lote) pero vuelve a encolarse al revisar', () => {
    const { filas } = conPatio()
    const b = new Bandeja()
    b.encolarConfiguracion(filas)
    b.confirmar(b.lote(), hoyTest, false)
    expect(b.vacia).toBe(true)
    expect(b.encolarConfiguracion(filas)).toBe(true)
  })

  it('se guarda con la cola', () => {
    const { filas } = conPatio()
    const b = new Bandeja()
    b.encolarConfiguracion(filas)
    const leida = Bandeja.leer(JSON.parse(JSON.stringify(b.aObjeto())))
    expect(leida.configuracion).toEqual(filas)
    b.confirmar(b.lote(), hoyTest)
    expect(Bandeja.leer(JSON.parse(JSON.stringify(b.aObjeto()))).encolarConfiguracion(filas)).toBe(false)
  })
})
