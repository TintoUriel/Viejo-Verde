import { describe, expect, it } from 'vitest'
import { Calendario } from '../src/core/calendario'
import { D, datosVacios, leerDatos } from '../src/core/datos'
import {
  CABA, daElSol, diasEntre, horasEn, horasPromedio, ladoHacia, luzDelDia, mapaDeSol, mejoresLugares, muestrasDelDia,
  nivel, nombreRumbo, nuevoObstaculo, patioPorDefecto, posicionSol, rumboLado, type Patio,
} from '../src/core/patio'
import { datosDeEjemplo } from '../src/core/ejemplo'
import { Historia } from '../src/core/historia'
import { aJSON } from '../src/core/util'

const { latitud, longitud } = CABA
/** Hora de Buenos Aires. */
const ba = (a: number, m: number, d: number, h: number, min = 0) => Calendario.fecha(a, m, d, h, min)

/** Mediodía solar: el momento de más altura. */
function mediodia(a: number, m: number, d: number) {
  return muestrasDelDia(ba(a, m, d, 12), latitud, longitud, 1).reduce((x, y) => (y.altura > x.altura ? y : x))
}

function abierto(): Patio {
  const p = patioPorDefecto()
  p.paredes = { arriba: { alto: 0 }, derecha: { alto: 0 }, abajo: { alto: 0 }, izquierda: { alto: 0 } }
  return p
}

describe('Posición del sol en CABA', () => {
  it('al mediodía de diciembre está casi arriba, hacia el norte', () => {
    const s = mediodia(2026, 12, 21)
    expect(s.altura).toBeCloseTo(90 - 34.6 + 23.44, 0)
    expect(Math.min(s.azimut, 360 - s.azimut)).toBeLessThan(3)
    // El mediodía solar en CABA cae cerca de las 12:50 (la hora oficial va adelantada).
    expect(Calendario.hora(s.hora)).toBe(12)
    expect(Calendario.minuto(s.hora)).toBeGreaterThan(40)
  })

  it('al mediodía de junio está bajo, hacia el norte', () => {
    const s = mediodia(2026, 6, 21)
    expect(s.altura).toBeCloseTo(90 - 34.6 - 23.44, 0)
    expect(Math.min(s.azimut, 360 - s.azimut)).toBeLessThan(3)
  })

  it('en diciembre sale por el sudeste y se pone por el sudoeste', () => {
    const m = muestrasDelDia(ba(2026, 12, 21, 12), latitud, longitud, 1)
    expect(m[0].azimut).toBeGreaterThan(110)
    expect(m[0].azimut).toBeLessThan(125)
    expect(m[m.length - 1].azimut).toBeGreaterThan(235)
    expect(m[m.length - 1].azimut).toBeLessThan(250)
  })

  it('a la mañana está al este y a la tarde al oeste', () => {
    expect(posicionSol(ba(2026, 3, 20, 9), latitud, longitud).azimut).toBeGreaterThan(60)
    expect(posicionSol(ba(2026, 3, 20, 9), latitud, longitud).azimut).toBeLessThan(110)
    expect(posicionSol(ba(2026, 3, 20, 17), latitud, longitud).azimut).toBeGreaterThan(260)
    expect(posicionSol(ba(2026, 3, 20, 23), latitud, longitud).altura).toBeLessThan(0)
  })

  it('los días son largos en verano y cortos en invierno', () => {
    const verano = luzDelDia(ba(2026, 12, 21, 12), latitud, longitud)!
    const invierno = luzDelDia(ba(2026, 6, 21, 12), latitud, longitud)!
    expect(verano.horas).toBeGreaterThan(13.5)
    expect(verano.horas).toBeLessThan(14.6)
    expect(invierno.horas).toBeGreaterThan(9)
    expect(invierno.horas).toBeLessThan(10.2)
  })
})

describe('Rumbos', () => {
  it('cada pared sabe hacia dónde queda', () => {
    const p = patioPorDefecto()
    p.orientacion = 90
    expect(nombreRumbo(rumboLado(p, 'arriba'))).toBe('este')
    expect(nombreRumbo(rumboLado(p, 'derecha'))).toBe('sur')
    expect(ladoHacia(p, 0)).toBe('izquierda')
    expect(nombreRumbo(225)).toBe('sudoeste')
  })
})

describe('Sombras', () => {
  // Pared de 3 m al norte, mediodía de junio (sol a 32°): la sombra llega a unos 4,8 m.
  const junio = mediodia(2026, 6, 21)
  const conParedNorte = () => {
    const p = abierto()
    p.largo = 10
    p.alturaPlantas = 0
    p.paredes.arriba = { alto: 3 }
    return p
  }

  it('la pared del norte da sombra cerca y no lejos', () => {
    const p = conParedNorte()
    expect(daElSol(p, { x: 2, y: 4 }, junio)).toBe(false)
    expect(daElSol(p, { x: 2, y: 5.5 }, junio)).toBe(true)
  })

  it('la misma pared, girando el patio, deja de tapar', () => {
    const p = conParedNorte()
    p.orientacion = 180 // ahora la pared de arriba está al sur
    expect(daElSol(p, { x: 2, y: 1 }, junio)).toBe(true)
  })

  it('las plantas altas asoman por encima de la sombra', () => {
    const p = conParedNorte()
    p.alturaPlantas = 1.5
    expect(daElSol(p, { x: 2, y: 3 }, junio)).toBe(true)
  })

  it('un edificio detrás de la pared tapa más lejos', () => {
    const p = conParedNorte()
    p.paredes.arriba = { alto: 3, detras: { alto: 12, distancia: 5 } }
    // 12 m a 5 m de la pared: tapa hasta unos 14 m de la pared.
    expect(daElSol(p, { x: 2, y: 8 }, junio)).toBe(false)
  })

  it('un obstáculo tapa lo que tiene del lado opuesto al sol', () => {
    const p = abierto()
    p.largo = 10
    p.alturaPlantas = 0
    p.obstaculos = [nuevoObstaculo({ nombre: 'Galpón', x: 1, y: 2, ancho: 2, largo: 1, alto: 2 })]
    expect(daElSol(p, { x: 2, y: 4 }, junio)).toBe(false)
    expect(daElSol(p, { x: 2, y: 1 }, junio)).toBe(true)
  })

  it('sin paredes, el sol da todo el día', () => {
    const p = abierto()
    const m = muestrasDelDia(ba(2026, 12, 21, 12), latitud, longitud)
    expect(horasEn(p, { x: 2, y: 3 }, m)).toBeCloseTo((m.length * 10) / 60, 5)
  })

  it('al lado de la pared sur hay más sol que al lado de la del norte', () => {
    const p = patioPorDefecto() // paredes de 2,5 m, arriba al norte
    const dias = diasEntre(ba(2026, 11, 20, 12), ba(2027, 3, 20, 12))
    expect(horasPromedio(p, { x: 2, y: 5.7 }, dias)).toBeGreaterThan(horasPromedio(p, { x: 2, y: 0.3 }, dias) + 2)
  })

  it('en otoño el mismo lugar tiene menos sol que en verano', () => {
    const p = patioPorDefecto()
    const punto = { x: 2, y: 3 }
    expect(horasPromedio(p, punto, [ba(2027, 4, 20, 12)])).toBeLessThan(horasPromedio(p, punto, [ba(2026, 12, 21, 12)]))
  })
})

describe('Mapa y mejores lugares', () => {
  it('el mapa marca dónde no entra una maceta', () => {
    const p = patioPorDefecto()
    p.obstaculos = [nuevoObstaculo({ nombre: 'Tanque', x: 0, y: 0, ancho: 2, largo: 2, alto: 1 })]
    const m = mapaDeSol(p, [ba(2026, 12, 21, 12)])
    expect(m.columnas * m.filas).toBeLessThanOrEqual(2600)
    expect(m.libre[0]).toBe(0) // adentro del tanque
    const centro = Math.floor(m.filas / 2) * m.columnas + Math.floor(m.columnas / 2)
    expect(m.libre[centro]).toBe(1)
  })

  // En otoño el sol queda al norte todo el día (en verano sale y se pone por el sur).
  it('elige lugares separados, los más soleados primero, lejos de la sombra en otoño', () => {
    const p = patioPorDefecto()
    const m = mapaDeSol(p, diasEntre(ba(2027, 3, 1, 12), ba(2027, 4, 30, 12)))
    const l = mejoresLugares(m, 3, 0.7)
    expect(l).toHaveLength(3)
    expect(l[0].horas).toBeGreaterThanOrEqual(l[1].horas)
    expect(l[1].horas).toBeGreaterThanOrEqual(l[2].horas)
    for (const a of l) for (const b of l) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(0.7)
    const max = Math.max(...m.horas.filter((_, k) => m.libre[k] === 1))
    expect(l[0].horas).toBeCloseTo(max, 5)
    // La sombra de la pared norte llega a unos 2,4 m al mediodía: elige algo que no quede al borde.
    for (const a of l) expect(a.y).toBeGreaterThan(2.8)
  })

  it('no repite lugares ocupados', () => {
    const p = patioPorDefecto()
    const m = mapaDeSol(p, [ba(2026, 12, 21, 12)])
    const [primero] = mejoresLugares(m, 1)
    const [otro] = mejoresLugares(m, 1, 0.7, [primero])
    expect(Math.hypot(otro.x - primero.x, otro.y - primero.y)).toBeGreaterThanOrEqual(0.7)
  })

  it('niveles', () => {
    expect(nivel(9)).toBe('ideal')
    expect(nivel(6.5)).toBe('bien')
    expect(nivel(4)).toBe('justo')
    expect(nivel(2)).toBe('poco')
  })

  it('diasEntre toma uno por semana, incluyendo las puntas', () => {
    const desde = ba(2026, 11, 20, 12)
    const dias = diasEntre(desde, Calendario.sumarDias(28, desde))
    expect(dias).toHaveLength(5)
    expect(Calendario.dias(desde, dias[4])).toBe(28)
    expect(diasEntre(desde, Calendario.sumarDias(3, desde))).toHaveLength(1)
  })
})

describe('Patio en los datos', () => {
  it('ida y vuelta por JSON, y se limpia al borrar la planta', () => {
    const d = datosVacios()
    const p = patioPorDefecto()
    p.paredes.arriba = { alto: 3, detras: { alto: 10, distancia: 4 } }
    p.obstaculos = [nuevoObstaculo({ nombre: 'Galpón', x: 1, y: 1, ancho: 1, largo: 1, alto: 2 })]
    D.guardarPatio(d, p)
    D.ubicar(d, 'A', { x: 1, y: 2 })
    D.ubicar(d, 'B', { x: 50, y: 2 }) // afuera: queda contra la pared
    const leido = leerDatos(JSON.parse(aJSON(d)))
    expect(leido.patio).toEqual(d.patio)
    expect(leido.patio!.ubicaciones.B.x).toBe(4)
    D.borrarPlanta(leido, 'A')
    expect(leido.patio!.ubicaciones.A).toBeUndefined()
  })

  it('datos viejos sin patio', () => {
    expect(leerDatos({ plantas: [] }).patio).toBeUndefined()
  })

  it('un patio a medias toma los valores por defecto', () => {
    const p = leerDatos({ patio: { ancho: 3 } }).patio!
    expect(p.ancho).toBe(3)
    expect(p.largo).toBe(6)
    expect(p.paredes.izquierda.alto).toBe(2.5)
    expect(p.latitud).toBe(CABA.latitud)
  })
})

describe('Patio en la historia que se copia para una IA', () => {
  it('dice cuánto sol le llega a la planta donde está ubicada', () => {
    const hoy = ba(2026, 11, 20, 10)
    const d = datosDeEjemplo(hoy)
    const banana = d.plantas.find((x) => x.nombre === 'Banana 1')!
    expect(Historia.texto(banana, d, hoy)).toMatch(/Sol directo estimado donde está: [\d,]+ h hoy/)
    const sinLugar = d.plantas.find((x) => x.nombre === 'Regular 2')! // sin lugar en el plano
    expect(Historia.texto(sinLugar, d, hoy)).not.toContain('Sol directo')
  })

  it('sin plano no dice nada del sol', () => {
    const hoy = ba(2026, 11, 20, 10)
    const d = datosDeEjemplo(hoy)
    delete d.patio
    expect(Historia.texto(d.plantas[0], d, hoy)).not.toContain('Sol directo')
  })
})
