import { Calendario } from './calendario'
import { uuid } from './util'

// El plano del patio y el sol: cuántas horas de sol directo le llegan a cada lugar, según las paredes,
// lo que hay alrededor, hacia dónde está orientado y la fecha. Todo en metros y grados.
//
// El plano se ve como un dibujo: x crece hacia la derecha (desde la pared izquierda) e y hacia abajo
// (desde la pared de arriba). `orientacion` dice hacia dónde queda la pared de arriba en la realidad.

export const LADOS = ['arriba', 'derecha', 'abajo', 'izquierda'] as const
export type Lado = (typeof LADOS)[number]

/** CABA, la misma ubicación que usa el clima. */
export const CABA = { latitud: -34.6037, longitud: -58.3816 }

/** En CABA el norte de la brújula queda unos 9° al oeste del norte verdadero (declinación magnética, 2026). */
export const DECLINACION_CABA = -9

/** Por debajo de esta altura el sol casi no calienta y en la ciudad siempre lo tapa algo. */
const ALTURA_MINIMA = 2

/** Distancia mínima del centro de una maceta a una pared (la mitad de una maceta de 20 L). */
const MARGEN_MACETA = 0.18

export interface Pared {
  /** Alto de la pared (o medianera). 0 = no hay pared. */
  alto: number
  /** Un edificio más alto detrás de la pared, a lo largo de todo ese lado. */
  detras?: { alto: number; distancia: number }
}

/** Algo que da sombra adentro del patio (un galpón, un tanque, un árbol). */
export interface Obstaculo {
  id: string
  nombre: string
  /** Distancia a la pared izquierda y a la de arriba (de su esquina de arriba a la izquierda). */
  x: number
  y: number
  ancho: number
  largo: number
  alto: number
}

export interface Punto {
  x: number
  y: number
}

export interface Patio {
  /** De la pared izquierda a la derecha. */
  ancho: number
  /** De la pared de arriba a la de abajo. */
  largo: number
  paredes: Record<Lado, Pared>
  /** Hacia dónde queda la pared de arriba: grados desde el norte, en el sentido del reloj (90 = este). */
  orientacion: number
  /** A qué altura se mide el sol: la copa de las plantas, contando la maceta. */
  alturaPlantas: number
  latitud: number
  longitud: number
  obstaculos: Obstaculo[]
  /** Dónde va cada planta (id de planta → lugar en el plano). */
  ubicaciones: Record<string, Punto>
}

export function patioPorDefecto(): Patio {
  return {
    ancho: 4,
    largo: 6,
    paredes: { arriba: { alto: 2.5 }, derecha: { alto: 2.5 }, abajo: { alto: 2.5 }, izquierda: { alto: 2.5 } },
    orientacion: 0,
    alturaPlantas: 0.6,
    latitud: CABA.latitud,
    longitud: CABA.longitud,
    obstaculos: [],
    ubicaciones: {},
  }
}

export function nuevoObstaculo(o: Omit<Obstaculo, 'id'>): Obstaculo {
  return { id: uuid(), ...o }
}

// ─── Rumbos ───

const RUMBOS = ['norte', 'noreste', 'este', 'sudeste', 'sur', 'sudoeste', 'oeste', 'noroeste']
const RUMBOS_CORTOS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO']

export const normalizar = (g: number): number => ((g % 360) + 360) % 360

/** "noreste" para 45°. */
export const nombreRumbo = (g: number): string => RUMBOS[Math.round(normalizar(g) / 45) % 8]
export const rumboCorto = (g: number): string => RUMBOS_CORTOS[Math.round(normalizar(g) / 45) % 8]

/** Hacia dónde queda cada pared (grados desde el norte). */
export function rumboLado(p: Patio, lado: Lado): number {
  return normalizar(p.orientacion + LADOS.indexOf(lado) * 90)
}

/** El lado que queda más hacia ese rumbo (por ejemplo, la pared que está al norte). */
export function ladoHacia(p: Patio, rumbo: number): Lado {
  const i = Math.round(normalizar(rumbo - p.orientacion) / 90) % 4
  return LADOS[i]
}

// ─── Posición del sol (algoritmo de la NOAA, alcanza y sobra para esto) ───

export interface PosicionSol {
  /** Grados desde el norte, en el sentido del reloj. */
  azimut: number
  /** Grados sobre el horizonte (negativo = de noche). */
  altura: number
}

const RAD = Math.PI / 180

export function posicionSol(t: Date, latitud: number, longitud: number): PosicionSol {
  const jd = t.getTime() / 86_400_000 + 2440587.5
  const jc = (jd - 2451545) / 36525
  const l0 = normalizar(280.46646 + jc * (36000.76983 + jc * 0.0003032))
  const m = 357.52911 + jc * (35999.05029 - 0.0001537 * jc)
  const e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc)
  const centro = Math.sin(m * RAD) * (1.914602 - jc * (0.004817 + 0.000014 * jc))
    + Math.sin(2 * m * RAD) * (0.019993 - 0.000101 * jc) + Math.sin(3 * m * RAD) * 0.000289
  const omega = 125.04 - 1934.136 * jc
  const lambda = l0 + centro - 0.00569 - 0.00478 * Math.sin(omega * RAD)
  const eps0 = 23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD)
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD))
  const y = Math.tan((eps / 2) * RAD) ** 2
  // Ecuación del tiempo, en minutos.
  const ecuacion = (4 / RAD) * (y * Math.sin(2 * l0 * RAD) - 2 * e * Math.sin(m * RAD)
    + 4 * e * y * Math.sin(m * RAD) * Math.cos(2 * l0 * RAD) - 0.5 * y * y * Math.sin(4 * l0 * RAD)
    - 1.25 * e * e * Math.sin(2 * m * RAD))
  const minutosUTC = (((t.getTime() / 60_000) % 1440) + 1440) % 1440
  const solar = (((minutosUTC + ecuacion + 4 * longitud) % 1440) + 1440) % 1440
  const angulo = (solar / 4 - 180) * RAD
  const fi = latitud * RAD
  const cosZ = Math.sin(fi) * Math.sin(decl) + Math.cos(fi) * Math.cos(decl) * Math.cos(angulo)
  const altura = 90 - Math.acos(Math.min(1, Math.max(-1, cosZ))) / RAD
  const azimut = normalizar(
    Math.atan2(Math.sin(angulo), Math.cos(angulo) * Math.sin(fi) - Math.tan(decl) * Math.cos(fi)) / RAD + 180)
  return { azimut, altura }
}

// ─── Muestras del día ───

/** Un momento con sol, listo para tirar rayos en un patio: dirección en el plano y pendiente. */
interface Rayo {
  dx: number
  dy: number
  pendiente: number
}

export interface Muestra extends PosicionSol {
  hora: Date
}

/** Posición del sol cada `minutos` durante el día (de Buenos Aires) de `fecha`, solo mientras está arriba. */
export function muestrasDelDia(fecha: Date, latitud: number, longitud: number, minutos = 10): Muestra[] {
  const inicio = Calendario.inicioDelDia(fecha).getTime()
  const r: Muestra[] = []
  for (let m = minutos / 2; m < 1440; m += minutos) {
    const hora = new Date(inicio + m * 60_000)
    const s = posicionSol(hora, latitud, longitud)
    if (s.altura > ALTURA_MINIMA) r.push({ hora, ...s })
  }
  return r
}

/** Salida y puesta (aproximadas a la muestra). */
export function luzDelDia(fecha: Date, latitud: number, longitud: number): { sale: Date; sePone: Date; horas: number } | undefined {
  const m = muestrasDelDia(fecha, latitud, longitud, 5)
  if (m.length === 0) return undefined
  return { sale: m[0].hora, sePone: m[m.length - 1].hora, horas: (m.length * 5) / 60 }
}

function rayo(p: Patio, s: PosicionSol): Rayo {
  const a = (s.azimut - p.orientacion) * RAD
  return { dx: Math.sin(a), dy: -Math.cos(a), pendiente: Math.tan(s.altura * RAD) }
}

// ─── Sombra ───

/** Distancia hasta salir del rectángulo por cada eje (Infinity si el rayo va paralelo). */
function salida(p: Patio, x: number, y: number, r: Rayo): { t: number; lado: Lado } {
  const tx = r.dx > 1e-9 ? (p.ancho - x) / r.dx : r.dx < -1e-9 ? x / -r.dx : Infinity
  const ty = r.dy > 1e-9 ? (p.largo - y) / r.dy : r.dy < -1e-9 ? y / -r.dy : Infinity
  return tx < ty ? { t: tx, lado: r.dx > 0 ? 'derecha' : 'izquierda' } : { t: ty, lado: r.dy > 0 ? 'abajo' : 'arriba' }
}

/** Cuánto avanza el rayo hacia afuera de cada lado por metro recorrido, y cuánto falta para llegar a ese lado. */
function haciaLado(p: Patio, lado: Lado, x: number, y: number, r: Rayo): { avance: number; falta: number } {
  switch (lado) {
    case 'arriba': return { avance: -r.dy, falta: y }
    case 'abajo': return { avance: r.dy, falta: p.largo - y }
    case 'izquierda': return { avance: -r.dx, falta: x }
    case 'derecha': return { avance: r.dx, falta: p.ancho - x }
  }
}

/** ¿Algo tapa el sol en (x, y) a la altura `h`? */
function tapado(p: Patio, x: number, y: number, h: number, r: Rayo): boolean {
  // La pared por la que sale el rayo (el patio es un rectángulo: las otras quedan atrás).
  const s = salida(p, x, y, r)
  if (p.paredes[s.lado].alto > h + s.t * r.pendiente) return true

  // Edificios detrás de las paredes: se toman como una pared larga, paralela a ese lado.
  for (const lado of LADOS) {
    const d = p.paredes[lado].detras
    if (!d) continue
    const { avance, falta } = haciaLado(p, lado, x, y, r)
    if (avance <= 1e-9) continue
    const t = (falta + d.distancia) / avance
    if (d.alto > h + t * r.pendiente) return true
  }

  // Lo que hay adentro del patio.
  for (const o of p.obstaculos) {
    let entra = -Infinity
    let sale = Infinity
    for (const [pos, dir, min, max] of [[x, r.dx, o.x, o.x + o.ancho], [y, r.dy, o.y, o.y + o.largo]] as const) {
      if (Math.abs(dir) < 1e-9) {
        if (pos < min || pos > max) { entra = Infinity; break }
        continue
      }
      const t1 = (min - pos) / dir
      const t2 = (max - pos) / dir
      entra = Math.max(entra, Math.min(t1, t2))
      sale = Math.min(sale, Math.max(t1, t2))
    }
    if (entra <= sale && sale > 0 && o.alto > h + Math.max(entra, 0) * r.pendiente) return true
  }
  return false
}

/** ¿Le da el sol a ese lugar en ese momento? */
export function daElSol(p: Patio, punto: Punto, s: PosicionSol, altura = p.alturaPlantas): boolean {
  if (s.altura <= ALTURA_MINIMA) return false
  return !tapado(p, punto.x, punto.y, altura, rayo(p, s))
}

/** Horas de sol directo en ese lugar, para esas muestras (de un día). */
export function horasEn(p: Patio, punto: Punto, muestras: Muestra[], minutos = 10): number {
  let n = 0
  for (const m of muestras) if (!tapado(p, punto.x, punto.y, p.alturaPlantas, rayo(p, m))) n++
  return (n * minutos) / 60
}

// ─── Fechas ───

/** Días para promediar entre dos fechas: uno por semana (o solo `desde`, si están cerca). */
export function diasEntre(desde: Date, hasta: Date, cadaDias = 7): Date[] {
  const total = Calendario.dias(desde, hasta)
  if (total < cadaDias) return [desde]
  const n = Math.floor(total / cadaDias)
  return Array.from({ length: n + 1 }, (_, i) => Calendario.sumarDias(Math.round((i * total) / n), desde))
}

/** Promedio de horas de sol por día en ese lugar, entre esas fechas. */
export function horasPromedio(p: Patio, punto: Punto, dias: Date[]): number {
  if (dias.length === 0) return 0
  const minutos = dias.length > 1 ? 15 : 10
  let total = 0
  for (const d of dias) total += horasEn(p, punto, muestrasDelDia(d, p.latitud, p.longitud, minutos), minutos)
  return total / dias.length
}

// ─── Mapa de sol ───

export interface MapaSol {
  columnas: number
  filas: number
  /** Tamaño de cada celda en metros (en x y en y). */
  celdaX: number
  celdaY: number
  /** Horas de sol por día (promedio), por celda, fila por fila. */
  horas: Float32Array
  /** 1 si ahí entra una maceta (no está pegada a una pared ni adentro de algo). */
  libre: Uint8Array
}

/** Celdas de 5 cm o más, para que no pasen de `maximo` (se calcula en el teléfono). */
export function grilla(p: Patio, maximo = 2500): { columnas: number; filas: number } {
  const celda = Math.max(0.05, Math.sqrt((p.ancho * p.largo) / maximo))
  return { columnas: Math.max(1, Math.round(p.ancho / celda)), filas: Math.max(1, Math.round(p.largo / celda)) }
}

function dentroDe(o: Obstaculo, x: number, y: number, margen: number): boolean {
  return x > o.x - margen && x < o.x + o.ancho + margen && y > o.y - margen && y < o.y + o.largo + margen
}

/** ¿Entra una maceta en ese lugar? */
export function lugarLibre(p: Patio, x: number, y: number): boolean {
  const m = Math.min(MARGEN_MACETA, p.ancho / 2, p.largo / 2)
  if (x < m || y < m || x > p.ancho - m || y > p.largo - m) return false
  return !p.obstaculos.some((o) => dentroDe(o, x, y, MARGEN_MACETA))
}

/** Horas de sol por día en cada lugar del patio, promediando esos días. */
export function mapaDeSol(p: Patio, dias: Date[]): MapaSol {
  const { columnas, filas } = grilla(p)
  const celdaX = p.ancho / columnas
  const celdaY = p.largo / filas
  const horas = new Float32Array(columnas * filas)
  const libre = new Uint8Array(columnas * filas)
  const minutos = dias.length > 1 ? 20 : 10
  const rayos = dias.map((d) => muestrasDelDia(d, p.latitud, p.longitud, minutos).map((m) => rayo(p, m)))
  const porMuestra = minutos / 60 / Math.max(dias.length, 1)
  for (let j = 0; j < filas; j++) {
    const y = (j + 0.5) * celdaY
    for (let i = 0; i < columnas; i++) {
      const x = (i + 0.5) * celdaX
      const k = j * columnas + i
      libre[k] = lugarLibre(p, x, y) ? 1 : 0
      let n = 0
      for (const lista of rayos) for (const r of lista) if (!tapado(p, x, y, p.alturaPlantas, r)) n++
      horas[k] = n * porMuestra
    }
  }
  return { columnas, filas, celdaX, celdaY, horas, libre }
}

/** Celdas del mapa de un momento: como es un solo cálculo, puede ser más fino. */
export const CELDAS_SOMBRA = 12000

/** Qué celdas tienen sol en un momento (1 = sol), con la grilla de `grilla(p, CELDAS_SOMBRA)`. */
export function mapaDeSombra(p: Patio, s: PosicionSol): Uint8Array {
  const { columnas, filas } = grilla(p, CELDAS_SOMBRA)
  const celdaX = p.ancho / columnas
  const celdaY = p.largo / filas
  const r = rayo(p, s)
  const sol = new Uint8Array(columnas * filas)
  if (s.altura <= ALTURA_MINIMA) return sol
  for (let j = 0; j < filas; j++) {
    for (let i = 0; i < columnas; i++) {
      sol[j * columnas + i] = tapado(p, (i + 0.5) * celdaX, (j + 0.5) * celdaY, p.alturaPlantas, r) ? 0 : 1
    }
  }
  return sol
}

export interface Lugar extends Punto {
  horas: number
}

/** Los mejores lugares para macetas: los de más sol, separados entre sí al menos `separacion` metros,
 *  y lejos de los que ya están ocupados. */
export function mejoresLugares(m: MapaSol, cantidad: number, separacion = 0.7, ocupados: Punto[] = []): Lugar[] {
  const candidatos: number[] = []
  for (let k = 0; k < m.horas.length; k++) if (m.libre[k]) candidatos.push(k)
  // A igual sol, mejor lejos del borde de la sombra (si el plano tiene un error chico, no cambia mucho).
  const alrededor = promedioCercano(m, 0.4)
  const puntaje = (k: number) => m.horas[k] + 0.25 * alrededor[k]
  candidatos.sort((a, b) => puntaje(b) - puntaje(a))
  const elegidos: Lugar[] = []
  const lejos = (x: number, y: number, otros: Punto[]) => otros.every((o) => Math.hypot(o.x - x, o.y - y) >= separacion)
  for (const k of candidatos) {
    if (elegidos.length >= cantidad) break
    const x = ((k % m.columnas) + 0.5) * m.celdaX
    const y = (Math.floor(k / m.columnas) + 0.5) * m.celdaY
    if (lejos(x, y, elegidos) && lejos(x, y, ocupados)) elegidos.push({ x, y, horas: m.horas[k] })
  }
  return elegidos
}

/** Promedio de horas en un radio (en metros) alrededor de cada celda. */
function promedioCercano(m: MapaSol, radio: number): Float32Array {
  const ri = Math.max(1, Math.round(radio / m.celdaX))
  const rj = Math.max(1, Math.round(radio / m.celdaY))
  const r = new Float32Array(m.horas.length)
  for (let j = 0; j < m.filas; j++) {
    for (let i = 0; i < m.columnas; i++) {
      let total = 0
      let n = 0
      for (let b = Math.max(0, j - rj); b <= Math.min(m.filas - 1, j + rj); b++) {
        for (let a = Math.max(0, i - ri); a <= Math.min(m.columnas - 1, i + ri); a++) {
          total += m.horas[b * m.columnas + a]
          n++
        }
      }
      r[j * m.columnas + i] = total / n
    }
  }
  return r
}

/** Horas en un punto leyendo el mapa (la celda que lo contiene). */
export function horasDelMapa(m: MapaSol, punto: Punto): number {
  const i = Math.min(m.columnas - 1, Math.max(0, Math.floor(punto.x / m.celdaX)))
  const j = Math.min(m.filas - 1, Math.max(0, Math.floor(punto.y / m.celdaY)))
  return m.horas[j * m.columnas + i]
}

// ─── Qué tan bueno es ───

export type Nivel = 'ideal' | 'bien' | 'justo' | 'poco'
export const nombreNivel: Record<Nivel, string> = { ideal: 'Ideal', bien: 'Bien', justo: 'Justo', poco: 'Poco sol' }

/** El cannabis en exterior quiere 8 horas o más de sol directo; con menos de 4 rinde muy poco. */
export function nivel(horas: number): Nivel {
  if (horas >= 8) return 'ideal'
  if (horas >= 6) return 'bien'
  if (horas >= 4) return 'justo'
  return 'poco'
}

// ─── Cambios ───

const limitar = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)

/** Deja todo adentro del patio (por ejemplo, después de achicarlo). */
export function ajustarPatio(p: Patio): Patio {
  const ancho = limitar(p.ancho, 0.5, 100)
  const largo = limitar(p.largo, 0.5, 100)
  const obstaculos = p.obstaculos.map((o) => {
    const x = limitar(o.x, 0, ancho - 0.1)
    const y = limitar(o.y, 0, largo - 0.1)
    return { ...o, x, y, ancho: limitar(o.ancho, 0.1, ancho - x), largo: limitar(o.largo, 0.1, largo - y), alto: limitar(o.alto, 0, 200) }
  })
  const cm = (v: number) => Math.round(v * 100) / 100
  const ubicaciones = Object.fromEntries(Object.entries(p.ubicaciones).map(([id, u]) =>
    [id, { x: cm(limitar(u.x, 0, ancho)), y: cm(limitar(u.y, 0, largo)) }]))
  return { ...p, ancho, largo, obstaculos, ubicaciones, orientacion: normalizar(p.orientacion), alturaPlantas: limitar(p.alturaPlantas, 0, 5) }
}
