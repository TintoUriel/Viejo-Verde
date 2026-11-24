import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { cambiar, datos, hoy } from '../app/almacen'
import { avisar, confirmar } from '../app/ui'
import { Barra, BotonGrande, Contador, Hoja, Interruptor, Segmentos, Seccion, Tarjeta, Vacio } from '../componentes'
import { Calendario } from '../core/calendario'
import { D } from '../core/datos'
import { Formato } from '../core/formato'
import type { Planta } from '../core/modelos'
import {
  CABA, CELDAS_SOMBRA, DECLINACION_CABA, diasEntre, grilla, horasDelMapa, horasEn, horasPromedio, LADOS, luzDelDia, mapaDeSol,
  mapaDeSombra, mejoresLugares, muestrasDelDia, nivel, nombreNivel, nombreRumbo, normalizar,
  nuevoObstaculo, patioPorDefecto, posicionSol, rumboCorto, rumboLado, daElSol,
  type Lado, type Lugar, type MapaSol, type Nivel, type Obstaculo, type Patio, type Punto, type PosicionSol,
} from '../core/patio'
import { Planificador } from '../core/planificador'
import { maxFecha } from '../core/util'
import { Icono } from '../iconos'
import { grosorPared, imagenDe, puntoEnSVG, useOscuro } from './plano'

// ─── Colores del mapa: de salvia fría (sombra) a ámbar encendido (mucho sol), en los dos modos ───

/** Escalones de 2 horas: 0–2, 2–4, 4–6, 6–8, 8–10 y 10 o más. */
const RAMPA_CLARA = ['#d2dacd', '#e5e3bf', '#f1dc9c', '#f3c766', '#eca63e', '#dd8421']
const RAMPA_OSCURA = ['#1e2822', '#343a26', '#544920', '#7b5d1d', '#a8741e', '#d88b20']
const SOL_SOMBRA = { claro: { sol: '#f2c96e', sombra: '#c9d2c5' }, oscuro: { sol: '#a37a26', sombra: '#1c261e' } }
const escalon = (h: number) => Math.min(5, Math.max(0, Math.floor(h / 2)))

const colorNivel: Record<Nivel, string> = { ideal: 'var(--verde)', bien: 'var(--verde)', justo: 'var(--ambar)', poco: 'var(--alerta)' }

type Modo = 'temporada' | 'dia' | 'hora'

const horas = (h: number) => `${Formato.numero(h)} h`
const metros = (m: number) => `${String(+m.toFixed(2)).replace('.', ',')} m`

function leerNumero(t: string): number | undefined {
  const n = Number(t.trim().replace(',', '.'))
  return t.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : undefined
}

/** Hasta cuándo mirar: la última cosecha estimada de las plantas del patio (o 4 meses). */
function temporada(plantas: Planta[], desde: Date): { hasta: Date; porPlantas: boolean } {
  const fin = maxFecha(plantas.map((p) => Planificador.cosechaEstimadaDe(p)))
  const dias = fin ? Calendario.dias(desde, fin) : 0
  if (dias >= 14) return { hasta: Calendario.sumarDias(Math.min(dias, 240), desde), porPlantas: true }
  return { hasta: Calendario.sumarDias(120, desde), porPlantas: false }
}

/** Hasta 15 días repartidos en el período. */
function diasDe(desde: Date, hasta: Date): Date[] {
  return diasEntre(desde, hasta, Math.max(7, Math.ceil(Calendario.dias(desde, hasta) / 14)))
}

const minutosBA = (f: Date) => Calendario.hora(f) * 60 + Calendario.minuto(f)
const horaTexto = (min: number) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')}`

// ─── Pantalla ───

export function VistaPatio() {
  const patio = datos.value.patio
  if (!patio) {
    return (
      <main class="pantalla">
        <Barra titulo="Patio" atras="plantas" textoAtras="Plantas" />
        <Vacio icono="sol" titulo="Dibujá tu patio"
          texto="Cargá las medidas, la altura de las paredes y hacia dónde da. La app calcula cuántas horas de sol le llegan a cada lugar y te dice dónde conviene poner cada maceta.">
          <div style={{ width: '220px', marginTop: '8px' }}>
            <BotonGrande titulo="Empezar" icono="pincel" onClick={() => cambiar((d) => D.guardarPatio(d, patioPorDefecto()))} />
          </div>
        </Vacio>
      </main>
    )
  }
  return <Plano patio={patio} />
}

function Plano({ patio }: { patio: Patio }) {
  const oscuro = useOscuro()
  const [modo, setModo] = useState<Modo>('temporada')
  const [fecha, setFecha] = useState<Date>(hoy.value)
  const [minutos, setMinutos] = useState(13 * 60)
  const [colocando, setColocando] = useState<string>()
  const [sonda, setSonda] = useState<Punto>()
  const [editando, setEditando] = useState<'medidas' | 'orientacion' | Lado | Obstaculo | 'nuevo' | undefined>()

  const plantas = datos.value.plantas.filter((p) => p.estado === 'activa' && p.ubicacion === 'patio')
  const hoyF = hoy.value
  const t = temporada(plantas, hoyF)

  // Lo que cambia el sol (no las ubicaciones de las plantas): para no recalcular de más.
  const claveSol = JSON.stringify({ ...patio, ubicaciones: undefined })
  const claveHoy = Calendario.claveDia(hoyF)

  const mapaTemporada = useMemo(() => mapaDeSol(patio, diasDe(hoyF, t.hasta)), [claveSol, claveHoy, Calendario.claveDia(t.hasta)])
  const mapaDia = useMemo(() => (modo === 'dia' ? mapaDeSol(patio, [fecha]) : undefined), [claveSol, modo, Calendario.claveDia(fecha)])
  const luz = luzDelDia(fecha, patio.latitud, patio.longitud)
  const rango = luz ? { min: Math.ceil(minutosBA(luz.sale) / 15) * 15, max: Math.floor(minutosBA(luz.sePone) / 15) * 15 } : { min: 0, max: 1425 }
  const minutosVistos = Math.min(Math.max(minutos, rango.min), rango.max)
  const momento = new Date(Calendario.inicioDelDia(fecha).getTime() + minutosVistos * 60_000)
  const sol = modo === 'hora' ? posicionSol(momento, patio.latitud, patio.longitud) : undefined
  const mapa: MapaSol | undefined = modo === 'temporada' ? mapaTemporada : modo === 'dia' ? mapaDia : undefined

  const rampa = oscuro ? RAMPA_OSCURA : RAMPA_CLARA
  const imagen = useMemo(() => {
    if (mapa) return imagenDe(mapa.columnas, mapa.filas, (k) => rampa[escalon(mapa.horas[k])])
    if (!sol) return ''
    const { columnas, filas } = grilla(patio, CELDAS_SOMBRA)
    const s = mapaDeSombra(patio, sol)
    const c = oscuro ? SOL_SOMBRA.oscuro : SOL_SOMBRA.claro
    return imagenDe(columnas, filas, (k) => (s[k] ? c.sol : c.sombra))
  }, [mapa, claveSol, sol?.azimut, sol?.altura, oscuro])

  const ubicadas = plantas.filter((p) => patio.ubicaciones[p.id])
  const ocupados = ubicadas.map((p) => patio.ubicaciones[p.id])
  const mapaLugares = mapa ?? mapaTemporada
  const lugares = useMemo(() => mejoresLugares(mapaLugares, 3, 0.7, ocupados), [mapaLugares, JSON.stringify(ocupados)])

  // Sol de cada planta: hoy y en promedio hasta su cosecha.
  const solPlantas = useMemo(() => {
    const muestrasHoy = muestrasDelDia(hoyF, patio.latitud, patio.longitud)
    return new Map(ubicadas.map((p) => {
      const u = patio.ubicaciones[p.id]
      const fin = Planificador.cosechaEstimadaDe(p)
      const dias = Calendario.dias(hoyF, fin) >= 7 ? diasDe(hoyF, fin) : [hoyF]
      return [p.id, { hoy: horasEn(patio, u, muestrasHoy), temporada: horasPromedio(patio, u, dias), fin }]
    }))
  }, [claveSol, claveHoy, JSON.stringify(ocupados), ubicadas.map((p) => p.id).join()])

  const tocar = (punto: Punto) => {
    if (colocando) {
      const id = colocando
      cambiar((d) => D.ubicar(d, id, punto))
      setColocando(undefined)
      setSonda(undefined)
      return
    }
    setSonda(punto)
  }

  const ubicarTodas = async () => {
    if (plantas.length === 0) return
    if (ubicadas.length > 0 && !(await confirmar(`¿Reacomodar las ${plantas.length} plantas?`, 'Reacomodar',
      { mensaje: 'Cada una va a uno de los lugares con más sol hasta la cosecha, separadas al menos 70 cm.' }))) return
    const l = mejoresLugares(mapaTemporada, plantas.length, 0.7)
    cambiar((d) => plantas.forEach((p, i) => D.ubicar(d, p.id, l[i] ? { x: l[i].x, y: l[i].y } : undefined)))
    avisar(l.length < plantas.length ? `Entraron ${l.length} de ${plantas.length}` : 'Plantas ubicadas')
  }

  const plantaColocando = plantas.find((p) => p.id === colocando)
  const numero = new Map(plantas.map((p, i) => [p.id, i + 1]))

  return (
    <main class="pantalla ancha">
      <Barra titulo="Patio" atras="plantas" textoAtras="Plantas" />

      <div class="columnas patio-cols">
      <div class="col col-fija">
      <Tarjeta class="tarjeta-plano">
        <Segmentos opciones={[['temporada', 'Temporada'], ['dia', 'Un día'], ['hora', 'A una hora']] as const} valor={modo}
          onCambio={(m) => { setModo(m); setSonda(undefined) }} />
        {modo === 'temporada' ? (
          <p class="nota">
            Horas de sol por día, en promedio, de hoy al {Formato.fechaCorta(t.hasta)}
            {t.porPlantas ? ' (la última cosecha estimada).' : ' (los próximos 4 meses).'}
          </p>
        ) : (
          <label class="fila-fecha">
            <span>Día</span>
            <input type="date" value={Calendario.claveDia(fecha)} onChange={(e) => {
              const f = Calendario.leerClave((e.target as HTMLInputElement).value)
              if (f) setFecha(f)
            }} />
          </label>
        )}
        {modo === 'hora' && (
          <div class="deslizador">
            <input type="range" min={rango.min} max={rango.max} step={15} value={minutosVistos} aria-label="Hora"
              onInput={(e) => setMinutos(Number((e.target as HTMLInputElement).value))} />
            <div class="nota">
              <strong>{horaTexto(minutosVistos)}</strong>
              {sol && sol.altura > 0 ? ` · sol al ${nombreRumbo(sol.azimut)}, a ${Math.round(sol.altura)}° de altura` : ' · de noche'}
            </div>
          </div>
        )}

        {plantaColocando && (
          <div class="aviso-plano">
            <span style={{ flex: 1 }}>Tocá en el plano dónde va <strong>{plantaColocando.nombre}</strong>.</span>
            {patio.ubicaciones[plantaColocando.id] && (
              <button class="mini-boton gris" onClick={() => {
                cambiar((d) => D.ubicar(d, plantaColocando.id, undefined))
                setColocando(undefined)
              }}>Sacar</button>
            )}
            <button class="mini-boton gris" onClick={() => setColocando(undefined)}>Cancelar</button>
          </div>
        )}

        <DibujoPatio patio={patio} imagen={imagen} sol={sol} lugares={modo === 'hora' ? [] : lugares} sonda={sonda}
          plantas={ubicadas.map((p) => ({ id: p.id, numero: numero.get(p.id) ?? 0, punto: patio.ubicaciones[p.id] }))}
          resaltada={colocando} onTocar={tocar}
          onMover={(id, punto) => cambiar((d) => D.ubicar(d, id, punto))}
          onTocarPlanta={(id) => setSonda(patio.ubicaciones[id])} />

        {modo === 'hora' ? (
          <div class="leyenda">
            <span style={{ '--c': (oscuro ? SOL_SOMBRA.oscuro : SOL_SOMBRA.claro).sol }}>Sol</span>
            <span style={{ '--c': (oscuro ? SOL_SOMBRA.oscuro : SOL_SOMBRA.claro).sombra }}>Sombra</span>
          </div>
        ) : (
          <Escala rampa={rampa} />
        )}

        {sonda && <InfoSonda patio={patio} punto={sonda} mapa={mapa} sol={sol} modo={modo} />}
        {!sonda && !colocando && <p class="nota-chica">Tocá el plano para ver cuánto sol da cada lugar. Las plantas se mueven arrastrándolas.</p>}
        {modo === 'dia' && luz && (
          <p class="nota-chica">Ese día sale el sol a las {horaTexto(minutosBA(luz.sale))} y se pone a las {horaTexto(minutosBA(luz.sePone))}.</p>
        )}
      </Tarjeta>
      </div>

      <div class="col">

      {plantas.length > 0 ? (
        <Seccion titulo="Plantas en el patio" pie="Promedio de horas de sol por día desde hoy hasta la cosecha estimada de cada una. Ideal: 8 h o más.">
          {plantas.map((p) => {
            const s = solPlantas.get(p.id)
            return (
              <div class="fila" key={p.id}>
                <span class="numero-planta" aria-hidden="true">{numero.get(p.id)}</span>
                <div class="principal">
                  <span class="nombre">{p.nombre}</span>
                  {s ? (
                    <span class="secundario">
                      <NivelSol horas={s.temporada} /> · {horas(s.temporada)} hasta la cosecha · hoy {horas(s.hoy)}
                    </span>
                  ) : <span class="secundario">Sin lugar en el plano</span>}
                </div>
                <button class="mini-boton" onClick={() => {
                  setColocando(p.id)
                  setSonda(undefined)
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}>
                  {s ? 'Mover' : 'Ubicar'}
                </button>
              </div>
            )
          })}
          <button class="fila accion" onClick={() => void ubicarTodas()}>
            <Icono nombre="destellos" />Ubicarlas en los mejores lugares
          </button>
        </Seccion>
      ) : (
        <p class="nota" style={{ margin: '0 16px' }}>No hay plantas activas en el patio. Cuando agregues, las vas a poder ubicar en el plano.</p>
      )}

      {lugares.length > 0 && modo !== 'hora' && (
        <Seccion titulo={ubicadas.length > 0 ? 'Mejores lugares libres' : 'Mejores lugares'}
          pie={modo === 'temporada' ? 'Con más sol en promedio en la temporada, separados 70 cm.' : 'Con más sol ese día.'}>
          {lugares.map((l, i) => (
            <button class="fila" key={i} onClick={() => setSonda(l)}>
              <span class="letra-lugar" aria-hidden="true">{String.fromCharCode(65 + i)}</span>
              <div class="principal">
                <span class="nombre">{horas(l.horas)} de sol por día</span>
                <span class="secundario">{distancias(patio, l)}</span>
              </div>
              <NivelSol horas={l.horas} />
            </button>
          ))}
        </Seccion>
      )}

      <Seccion titulo="El patio" pie="Medí desde adentro del patio. Para la altura de un edificio, contá unos 3 m por piso.">
        <button class="fila" onClick={() => setEditando('medidas')}>
          <span style={{ flex: 1 }}>Medidas</span>
          <span class="valor">{metros(patio.ancho)} × {metros(patio.largo)}</span>
          <span class="chevron">›</span>
        </button>
        <button class="fila" onClick={() => setEditando('orientacion')}>
          <span style={{ flex: 1 }}>La pared de arriba da al</span>
          <span class="valor">{Formato.mayusculaInicial(nombreRumbo(patio.orientacion))} ({Math.round(patio.orientacion)}°)</span>
          <span class="chevron">›</span>
        </button>
        {LADOS.map((l) => {
          const p = patio.paredes[l]
          return (
            <button class="fila" key={l} onClick={() => setEditando(l)}>
              <span style={{ flex: 1 }}>Pared {l === 'arriba' || l === 'abajo' ? `de ${l}` : l} <span class="secundario">({nombreRumbo(rumboLado(patio, l))})</span></span>
              <span class="valor">{p.alto === 0 ? 'Abierto' : metros(p.alto)}{p.detras ? ` · edificio ${metros(p.detras.alto)}` : ''}</span>
              <span class="chevron">›</span>
            </button>
          )
        })}
        <div class="fila">
          <span style={{ flex: 1 }}>Altura de las plantas</span>
          <Contador valor={patio.alturaPlantas} min={0} max={3} paso={0.1} texto={metros(patio.alturaPlantas)}
            onCambio={(v) => cambiar((d) => D.guardarPatio(d, { ...patio, alturaPlantas: v }))} />
        </div>
      </Seccion>

      <Seccion titulo="Cosas que dan sombra" pie="Un galpón, un tanque, un árbol: lo que está adentro del patio y tapa el sol.">
        {patio.obstaculos.map((o) => (
          <button class="fila" key={o.id} onClick={() => setEditando(o)}>
            <span style={{ flex: 1 }}>{o.nombre || 'Sin nombre'}</span>
            <span class="valor">{metros(o.ancho)} × {metros(o.largo)} · {metros(o.alto)} de alto</span>
            <span class="chevron">›</span>
          </button>
        ))}
        <button class="fila accion" onClick={() => setEditando('nuevo')}><Icono nombre="mas" />Agregar</button>
      </Seccion>

      <Ubicacion patio={patio} />

      <p class="nota-chica" style={{ margin: '0 16px' }}>
        Cuenta solo el sol directo, sin nubes. Es una estimación: si algo no coincide con lo que ves en el patio, ajustá las alturas.
      </p>
      </div>
      </div>

      {editando === 'medidas' && <HojaMedidas patio={patio} onCerrar={() => setEditando(undefined)} />}
      {editando === 'orientacion' && <HojaOrientacion patio={patio} onCerrar={() => setEditando(undefined)} />}
      {typeof editando === 'string' && (LADOS as readonly string[]).includes(editando) && (
        <HojaPared patio={patio} lado={editando as Lado} onCerrar={() => setEditando(undefined)} />
      )}
      {(editando === 'nuevo' || typeof editando === 'object') && (
        <HojaObstaculo patio={patio} obstaculo={editando === 'nuevo' ? undefined : editando} onCerrar={() => setEditando(undefined)} />
      )}
    </main>
  )
}

function distancias(p: Patio, u: Punto): string {
  return `A ${metros(u.x)} de la pared izquierda y ${metros(u.y)} de la de arriba`
    + ` (${rumboCorto(rumboLado(p, 'izquierda'))} y ${rumboCorto(rumboLado(p, 'arriba'))})`
}

function NivelSol({ horas: h }: { horas: number }) {
  const n = nivel(h)
  return (
    <span class="nivel-sol" style={{ '--c': colorNivel[n] }}>
      <Icono nombre={n === 'ideal' || n === 'bien' ? 'check' : 'alerta'} tam={14} />{nombreNivel[n]}
    </span>
  )
}

function Escala({ rampa }: { rampa: string[] }) {
  return (
    <div class="escala-sol" role="img" aria-label="Escala: de menos de 2 a más de 10 horas de sol por día">
      <div class="tiras">{rampa.map((c) => <span key={c} style={{ background: c }} />)}</div>
      <div class="marcas"><span>0</span><span>2</span><span>4</span><span>6</span><span>8</span><span>10</span><span>h</span></div>
    </div>
  )
}

function InfoSonda(p: { patio: Patio; punto: Punto; mapa?: MapaSol; sol?: PosicionSol; modo: Modo }) {
  const texto = p.modo === 'hora'
    ? (p.sol && daElSol(p.patio, p.punto, p.sol) ? 'Ahí da el sol a esa hora.' : 'Ahí hay sombra a esa hora.')
    : undefined
  const h = p.mapa ? horasDelMapa(p.mapa, p.punto) : undefined
  return (
    <div class="sonda">
      {texto ? <strong>{texto}</strong> : h !== undefined && (
        <span><strong>{horas(h)} de sol por día</strong> · <NivelSol horas={h} /></span>
      )}
      <span class="nota-chica">{distancias(p.patio, p.punto)}</span>
    </div>
  )
}

// ─── El dibujo ───

const ANCHO_VISTA = 340
const MARGEN = 40

interface MarcaPlanta {
  id: string
  numero: number
  punto: Punto
}

function DibujoPatio(p: {
  patio: Patio
  imagen: string
  sol?: PosicionSol
  lugares: Lugar[]
  plantas: MarcaPlanta[]
  sonda?: Punto
  resaltada?: string
  onTocar: (punto: Punto) => void
  onMover: (id: string, punto: Punto) => void
  onTocarPlanta: (id: string) => void
}) {
  const { patio } = p
  const ref = useRef<SVGSVGElement>(null)
  const arrastre = useRef<{ id: string; x0: number; y0: number; movio: boolean } | null>(null)
  const [moviendo, setMoviendo] = useState<{ id: string; punto: Punto }>()

  // En el iPhone, que arrastrar una planta no mueva la página.
  useEffect(() => {
    const svg = ref.current
    if (!svg) return
    const f = (e: TouchEvent) => { if (arrastre.current) e.preventDefault() }
    svg.addEventListener('touchmove', f, { passive: false })
    return () => svg.removeEventListener('touchmove', f)
  }, [])

  const escala = Math.min((ANCHO_VISTA - 2 * MARGEN) / patio.ancho, 420 / patio.largo)
  const w = patio.ancho * escala
  const h = patio.largo * escala
  const ox = (ANCHO_VISTA - w) / 2
  const oy = MARGEN
  const altoVista = oy + h + 30
  const X = (x: number) => ox + x * escala
  const Y = (y: number) => oy + y * escala

  const aPlano = (e: { clientX: number; clientY: number }): Punto => {
    const v = puntoEnSVG(ref.current!, e)
    const lim = (n: number, max: number) => Math.min(Math.max(n, 0), max)
    return { x: lim((v.x - ox) / escala, patio.ancho), y: lim((v.y - oy) / escala, patio.largo) }
  }

  const etiqueta = (l: Lado) => {
    const pared = patio.paredes[l]
    const alto = pared.alto === 0 ? 'abierto' : metros(pared.alto)
    return `${rumboCorto(rumboLado(patio, l))} · ${alto}${pared.detras ? ` + edificio ${metros(pared.detras.alto)}` : ''}`
  }

  const radio = Math.max(0.17 * escala, 10)
  const norte = -patio.orientacion
  const brujula = { x: ANCHO_VISTA - 20, y: 20 }

  return (
    <svg ref={ref} class="plano" viewBox={`0 0 ${ANCHO_VISTA} ${altoVista}`} role="img"
      aria-label={`Plano del patio de ${metros(patio.ancho)} por ${metros(patio.largo)}`}>
      <defs>
        <pattern id="rayado" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--texto-3)" stroke-width="2" />
        </pattern>
        <clipPath id="piso-patio"><rect x={ox} y={oy} width={w} height={h} rx="4" /></clipPath>
        <pattern id="baldosas-patio" width={0.5 * escala} height={0.5 * escala} patternUnits="userSpaceOnUse" x={ox} y={oy}>
          <path d={`M ${0.5 * escala} 0 V ${0.5 * escala} H 0`} class="junta" />
        </pattern>
        <radialGradient id="vineta-patio" cx="50%" cy="50%" r="75%">
          <stop offset="55%" stop-color="var(--muro)" stop-opacity="0" />
          <stop offset="100%" stop-color="var(--muro)" stop-opacity="0.2" />
        </radialGradient>
        <radialGradient id="sombra-marca">
          <stop offset="35%" stop-color="#0b2414" stop-opacity="0.34" />
          <stop offset="100%" stop-color="#0b2414" stop-opacity="0" />
        </radialGradient>
      </defs>

      {/* Fondo que recibe los toques. */}
      <g clip-path="url(#piso-patio)">
        <rect x={ox} y={oy} width={w} height={h} class="suelo" onClick={(e) => p.onTocar(aPlano(e))} />
        {p.imagen && <image href={p.imagen} x={ox} y={oy} width={w} height={h} preserveAspectRatio="none" pointer-events="none" class="mapa-sol" />}
        <rect x={ox} y={oy} width={w} height={h} fill="url(#baldosas-patio)" pointer-events="none" />
        <rect x={ox} y={oy} width={w} height={h} fill="url(#vineta-patio)" pointer-events="none" />
      </g>

      {patio.obstaculos.map((o) => (
        <g key={o.id} pointer-events="none">
          <rect x={X(o.x)} y={Y(o.y)} width={o.ancho * escala} height={o.largo * escala} rx="2" class="obstaculo" />
          <rect x={X(o.x)} y={Y(o.y)} width={o.ancho * escala} height={o.largo * escala} rx="2" fill="url(#rayado)" />
          {o.ancho * escala > 40 && o.largo * escala > 16 && (
            <text x={X(o.x + o.ancho / 2)} y={Y(o.y + o.largo / 2) + 4} text-anchor="middle" class="texto-obstaculo">{o.nombre}</text>
          )}
        </g>
      ))}

      {/* Paredes. */}
      {([['arriba', ox, oy, ox + w, oy], ['derecha', ox + w, oy, ox + w, oy + h], ['abajo', ox, oy + h, ox + w, oy + h],
        ['izquierda', ox, oy, ox, oy + h]] as const).map(([l, x1, y1, x2, y2]) => (
        <line key={l} x1={x1} y1={y1} x2={x2} y2={y2} stroke-width={grosorPared(patio.paredes[l].alto)}
          class={patio.paredes[l].alto === 0 ? 'pared abierta' : 'pared'} />
      ))}
      <text x={ox + w / 2} y={oy - 9} text-anchor="middle">{etiqueta('arriba')}</text>
      <text x={ox + w / 2} y={oy + h + 19} text-anchor="middle">{etiqueta('abajo')}</text>
      <text transform={`translate(${ox - 10} ${oy + h / 2}) rotate(-90)`} text-anchor="middle">{etiqueta('izquierda')}</text>
      <text transform={`translate(${ox + w + 10} ${oy + h / 2}) rotate(90)`} text-anchor="middle">{etiqueta('derecha')}</text>

      {/* Brújula: la flecha apunta al norte; el punto es el sol (a una hora). */}
      <g transform={`translate(${brujula.x} ${brujula.y})`} pointer-events="none">
        <circle r="14" class="brujula" />
        <g transform={`rotate(${norte})`}>
          <path d="M0 -11 L3.5 0 L-3.5 0 Z" fill="var(--alerta)" />
          <path d="M0 11 L3.5 0 L-3.5 0 Z" fill="var(--texto-3)" />
        </g>
        <text transform={`rotate(${norte}) translate(0 -17) rotate(${-norte})`} y="3.5" text-anchor="middle" class="texto-norte">N</text>
        {p.sol && p.sol.altura > 0 && (
          <circle r="3.5" fill="var(--ambar)" transform={`rotate(${p.sol.azimut - patio.orientacion}) translate(0 -14)`} />
        )}
      </g>

      {p.lugares.map((l, i) => (
        <g key={i} pointer-events="none">
          <circle cx={X(l.x)} cy={Y(l.y)} r={radio} class="lugar" />
          <text x={X(l.x)} y={Y(l.y) + 4} text-anchor="middle" class="texto-lugar">{String.fromCharCode(65 + i)}</text>
        </g>
      ))}

      {p.sonda && (
        <g pointer-events="none" class="sonda-marca">
          <circle cx={X(p.sonda.x)} cy={Y(p.sonda.y)} r="6" />
          <line x1={X(p.sonda.x) - 11} x2={X(p.sonda.x) + 11} y1={Y(p.sonda.y)} y2={Y(p.sonda.y)} />
          <line x1={X(p.sonda.x)} x2={X(p.sonda.x)} y1={Y(p.sonda.y) - 11} y2={Y(p.sonda.y) + 11} />
        </g>
      )}

      {p.plantas.map((m) => {
        const punto = moviendo?.id === m.id ? moviendo.punto : m.punto
        return (
          <g key={m.id} class={`marca-planta${p.resaltada === m.id ? ' resaltada' : ''}`}
            onPointerDown={(e) => {
              e.stopPropagation()
              try { (e.currentTarget as Element).setPointerCapture(e.pointerId) } catch { /* sin captura igual anda */ }
              arrastre.current = { id: m.id, x0: e.clientX, y0: e.clientY, movio: false }
            }}
            onPointerMove={(e) => {
              const a = arrastre.current
              if (!a || a.id !== m.id) return
              if (!a.movio && Math.hypot(e.clientX - a.x0, e.clientY - a.y0) < 5) return
              a.movio = true
              setMoviendo({ id: m.id, punto: aPlano(e) })
            }}
            onPointerUp={(e) => {
              const a = arrastre.current
              arrastre.current = null
              if (!a) return
              if (a.movio) p.onMover(m.id, aPlano(e))
              else p.onTocarPlanta(m.id)
              setMoviendo(undefined)
            }}
            onPointerCancel={() => { arrastre.current = null; setMoviendo(undefined) }}>
            <circle cx={X(punto.x)} cy={Y(punto.y)} r={Math.max(radio, 18)} fill="transparent" />
            <circle cx={X(punto.x) + 1.5} cy={Y(punto.y) + 3} r={radio + 6} fill="url(#sombra-marca)" pointer-events="none" />
            <circle cx={X(punto.x)} cy={Y(punto.y)} r={radio} class="cuerpo" />
            <text x={X(punto.x)} y={Y(punto.y) + 4} text-anchor="middle">{m.numero}</text>
          </g>
        )
      })}
    </svg>
  )
}

// ─── Hojas para editar ───

function CampoNumero(p: { etiqueta: string; valor: number; onCambio: (v: number) => void; unidad?: string }) {
  const [texto, setTexto] = useState(String(+p.valor.toFixed(2)).replace('.', ','))
  return (
    <label class="fila">
      <span style={{ flex: 1 }}>{p.etiqueta}</span>
      <input type="text" inputMode="decimal" class="campo-numero" value={texto}
        onFocus={(e) => (e.target as HTMLInputElement).select()}
        onInput={(e) => {
          const t = (e.target as HTMLInputElement).value
          setTexto(t)
          const n = leerNumero(t)
          if (n !== undefined) p.onCambio(n)
        }} />
      <span class="valor">{p.unidad ?? 'm'}</span>
    </label>
  )
}

function guardar(p: Patio): void {
  cambiar((d) => D.guardarPatio(d, p))
}

function HojaMedidas({ patio, onCerrar }: { patio: Patio; onCerrar: () => void }) {
  const [ancho, setAncho] = useState(patio.ancho)
  const [largo, setLargo] = useState(patio.largo)
  const valido = ancho >= 0.5 && largo >= 0.5
  return (
    <Hoja titulo="Medidas" onCerrar={onCerrar} guardarDeshabilitado={!valido}
      onGuardar={() => { guardar({ ...patio, ancho, largo }); onCerrar() }}>
      <Seccion pie="Como si lo vieras desde arriba: el ancho va de la pared izquierda a la derecha, el largo de la de arriba a la de abajo.">
        <CampoNumero etiqueta="Ancho" valor={ancho} onCambio={setAncho} />
        <CampoNumero etiqueta="Largo" valor={largo} onCambio={setLargo} />
      </Seccion>
    </Hoja>
  )
}

function HojaPared({ patio, lado, onCerrar }: { patio: Patio; lado: Lado; onCerrar: () => void }) {
  const p = patio.paredes[lado]
  const [alto, setAlto] = useState(p.alto)
  const [hayDetras, setHayDetras] = useState(p.detras !== undefined)
  const [altoDetras, setAltoDetras] = useState(p.detras?.alto ?? 9)
  const [distancia, setDistancia] = useState(p.detras?.distancia ?? 5)
  const nombre = `Pared ${lado === 'arriba' || lado === 'abajo' ? `de ${lado}` : lado}`
  const listo = () => {
    guardar({ ...patio, paredes: { ...patio.paredes, [lado]: hayDetras ? { alto, detras: { alto: altoDetras, distancia } } : { alto } } })
    onCerrar()
  }
  return (
    <Hoja titulo={`${nombre} (${nombreRumbo(rumboLado(patio, lado))})`} onCerrar={onCerrar} onGuardar={listo}>
      <Seccion pie="0 si ese lado está abierto (o tiene una reja que no da sombra). Si una medianera alta es la pared misma, poné su altura acá.">
        <CampoNumero etiqueta="Alto" valor={alto} onCambio={setAlto} />
      </Seccion>
      <Seccion titulo="Más atrás" pie="Un edificio o una casa más alta detrás de esta pared, a lo largo de todo ese lado.">
        <div class="fila">
          <span style={{ flex: 1 }}>Hay algo más alto detrás</span>
          <Interruptor valor={hayDetras} onCambio={setHayDetras} etiqueta="Hay algo más alto detrás" />
        </div>
        {hayDetras && <CampoNumero etiqueta="Alto" valor={altoDetras} onCambio={setAltoDetras} />}
        {hayDetras && <CampoNumero etiqueta="A cuántos metros de la pared" valor={distancia} onCambio={setDistancia} />}
      </Seccion>
    </Hoja>
  )
}

function HojaObstaculo({ patio, obstaculo, onCerrar }: { patio: Patio; obstaculo?: Obstaculo; onCerrar: () => void }) {
  const o = obstaculo
  const [nombre, setNombre] = useState(o?.nombre ?? '')
  const [x, setX] = useState(o?.x ?? 0)
  const [y, setY] = useState(o?.y ?? 0)
  const [ancho, setAncho] = useState(o?.ancho ?? 1)
  const [largo, setLargo] = useState(o?.largo ?? 1)
  const [alto, setAlto] = useState(o?.alto ?? 2)
  const valido = ancho > 0 && largo > 0
  const listo = () => {
    const nuevo = { nombre: nombre.trim(), x, y, ancho, largo, alto }
    const obstaculos = o ? patio.obstaculos.map((b) => (b.id === o.id ? { ...b, ...nuevo } : b)) : [...patio.obstaculos, nuevoObstaculo(nuevo)]
    guardar({ ...patio, obstaculos })
    onCerrar()
  }
  const borrar = async () => {
    if (!o || !(await confirmar(`¿Borrar ${o.nombre || 'esto'}?`, 'Borrar', { destructiva: true }))) return
    guardar({ ...patio, obstaculos: patio.obstaculos.filter((b) => b.id !== o.id) })
    onCerrar()
  }
  return (
    <Hoja titulo={o ? 'Editar' : 'Algo que da sombra'} onCerrar={onCerrar} onGuardar={listo} guardarDeshabilitado={!valido}>
      <Seccion>
        <label class="fila">
          <input type="text" placeholder="Galpón, tanque, árbol…" value={nombre} onInput={(e) => setNombre((e.target as HTMLInputElement).value)} />
        </label>
      </Seccion>
      <Seccion titulo="Dónde está" pie="Desde su esquina de arriba a la izquierda (como en el plano).">
        <CampoNumero etiqueta="Desde la pared izquierda" valor={x} onCambio={setX} />
        <CampoNumero etiqueta="Desde la pared de arriba" valor={y} onCambio={setY} />
      </Seccion>
      <Seccion titulo="Tamaño">
        <CampoNumero etiqueta="Ancho" valor={ancho} onCambio={setAncho} />
        <CampoNumero etiqueta="Largo" valor={largo} onCambio={setLargo} />
        <CampoNumero etiqueta="Alto" valor={alto} onCambio={setAlto} />
      </Seccion>
      {o && <Seccion><button class="fila accion peligro" onClick={() => void borrar()}>Borrar</button></Seccion>}
    </Hoja>
  )
}

// ─── Orientación y brújula ───

function useBrujula() {
  const [rumbo, setRumbo] = useState<number>()
  const [error, setError] = useState<string>()
  const [activa, setActiva] = useState(false)
  const parar = useRef<(() => void) | undefined>(undefined)
  useEffect(() => () => parar.current?.(), [])

  const iniciar = async () => {
    setError(undefined)
    const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent
    if (!DOE) {
      setError('Este navegador no deja usar la brújula.')
      return
    }
    if (typeof DOE.requestPermission === 'function') {
      try {
        if ((await DOE.requestPermission()) !== 'granted') {
          setError('No hay permiso para usar la brújula. Cerrá y volvé a abrir la app, y cuando lo pida tocá "Permitir".')
          return
        }
      } catch {
        setError('No pude pedir permiso para la brújula.')
        return
      }
    }
    let sx = 0
    let sy = 0
    let hay = false
    let ultimo = -1
    const leer = (e: Event) => {
      const o = e as DeviceOrientationEvent & { webkitCompassHeading?: number }
      let magnetico: number | undefined
      if (typeof o.webkitCompassHeading === 'number' && o.webkitCompassHeading >= 0) magnetico = o.webkitCompassHeading
      else if (o.absolute && o.alpha !== null) magnetico = 360 - o.alpha
      if (magnetico === undefined || Number.isNaN(magnetico)) return
      // Se suaviza (promediando la dirección) para que no tiemble.
      const a = ((magnetico + DECLINACION_CABA) * Math.PI) / 180
      sx = hay ? sx * 0.85 + Math.sin(a) * 0.15 : Math.sin(a)
      sy = hay ? sy * 0.85 + Math.cos(a) * 0.15 : Math.cos(a)
      hay = true
      const r = Math.round(normalizar((Math.atan2(sx, sy) * 180) / Math.PI))
      if (r !== ultimo) {
        ultimo = r
        setRumbo(r)
      }
    }
    const evento = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation'
    window.addEventListener(evento, leer)
    parar.current?.()
    parar.current = () => window.removeEventListener(evento, leer)
    setActiva(true)
    setTimeout(() => {
      if (!hay) setError('No llega nada de la brújula. Probá en el teléfono (en la compu no hay).')
    }, 3000)
  }
  return { rumbo, error, activa, iniciar }
}

const RUMBOS_BOTONES = [0, 45, 90, 135, 180, 225, 270, 315]

function HojaOrientacion({ patio, onCerrar }: { patio: Patio; onCerrar: () => void }) {
  const [o, setO] = useState(Math.round(patio.orientacion))
  const b = useBrujula()
  return (
    <Hoja titulo="Orientación" onCerrar={onCerrar} onGuardar={() => { guardar({ ...patio, orientacion: o }); onCerrar() }}>
      <Seccion titulo="¿Hacia dónde queda la pared de arriba?">
        <div class="grilla-rumbos">
          {RUMBOS_BOTONES.map((r) => (
            <button key={r} type="button" class={o === r ? 'activo' : ''} onClick={() => setO(r)}>{rumboCorto(r)}</button>
          ))}
        </div>
        <div class="fila">
          <span style={{ flex: 1 }}>Ajuste fino</span>
          <Contador valor={o} paso={5} min={-360} max={720} texto={`${normalizar(o)}°`} onCambio={(v) => setO(normalizar(v))} />
        </div>
      </Seccion>

      <Seccion titulo="Con la brújula del teléfono"
        pie="Parate en el patio con el teléfono acostado (la pantalla mirando al cielo) y la parte de arriba del teléfono apuntando hacia la pared de arriba del plano. Alejate de rejas y cosas de metal.">
        {!b.activa ? (
          <button class="fila accion" onClick={() => void b.iniciar()}><Icono nombre="brujula" />Medir con la brújula</button>
        ) : (
          <>
            <div class="fila">
              <span style={{ flex: 1 }}>El teléfono apunta al</span>
              <span class="valor">{b.rumbo === undefined ? '…' : `${Formato.mayusculaInicial(nombreRumbo(b.rumbo))} (${b.rumbo}°)`}</span>
            </div>
            <button class="fila accion" disabled={b.rumbo === undefined} onClick={() => { if (b.rumbo !== undefined) setO(b.rumbo) }}>
              <Icono nombre="check" />Usar este rumbo
            </button>
          </>
        )}
        {b.error && <p class="peligro-texto" style={{ padding: '0 16px 12px', margin: 0, fontSize: '14px' }}>{b.error}</p>}
      </Seccion>

      <Seccion titulo="Así queda, con el norte arriba" pie="Comparalo con la vista de satélite de un mapa para confirmar.">
        <div class="fila" style={{ justifyContent: 'center' }}>
          <VistaNorte patio={patio} orientacion={o} />
        </div>
      </Seccion>
    </Hoja>
  )
}

/** El rectángulo del patio girado como queda en la realidad (norte arriba). */
function VistaNorte({ patio, orientacion }: { patio: Patio; orientacion: number }) {
  const lado = 150
  const k = 90 / Math.max(patio.ancho, patio.largo)
  const w = patio.ancho * k
  const h = patio.largo * k
  return (
    <svg viewBox={`0 0 ${lado} ${lado}`} width={lado} height={lado} class="plano" style={{ width: `${lado}px` }} aria-hidden="true">
      <text x={lado / 2} y="12" text-anchor="middle" class="texto-norte">N</text>
      <path d={`M${lado / 2} 16 l4 8 h-8 Z`} fill="var(--alerta)" />
      <g transform={`translate(${lado / 2} ${lado / 2 + 6}) rotate(${orientacion})`}>
        <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="var(--relleno)" stroke="var(--texto-2)" stroke-width="1.5" />
        <line x1={-w / 2} y1={-h / 2} x2={w / 2} y2={-h / 2} class="pared" />
        <text x="0" y={-h / 2 + 13} text-anchor="middle" style={{ fontSize: '10px' }}>arriba</text>
      </g>
    </svg>
  )
}

// ─── Ubicación ───

function Ubicacion({ patio }: { patio: Patio }) {
  const [buscando, setBuscando] = useState(false)
  const enCABA = Math.abs(patio.latitud - CABA.latitud) < 0.3 && Math.abs(patio.longitud - CABA.longitud) < 0.3
  const usarTelefono = () => {
    if (!navigator.geolocation) {
      avisar('Este navegador no da la ubicación')
      return
    }
    setBuscando(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBuscando(false)
        guardar({ ...patio, latitud: +pos.coords.latitude.toFixed(4), longitud: +pos.coords.longitude.toFixed(4) })
        avisar('Ubicación actualizada')
      },
      () => {
        setBuscando(false)
        avisar('No pude saber dónde estás')
      },
      { enableHighAccuracy: false, timeout: 15_000 },
    )
  }
  return (
    <Seccion titulo="Dónde queda" pie="Con la ubicación se calcula por dónde pasa el sol cada día.">
      <div class="fila">
        <span style={{ flex: 1 }}>{enCABA ? 'Buenos Aires (CABA)' : `${Formato.numero(patio.latitud)}, ${Formato.numero(patio.longitud)}`}</span>
        {!enCABA && <button class="mini-boton gris" onClick={() => guardar({ ...patio, ...CABA })}>Volver a CABA</button>}
      </div>
      <button class="fila accion" disabled={buscando} onClick={usarTelefono}>
        <Icono nombre="brujula" />{buscando ? 'Buscando…' : 'Usar la ubicación del teléfono'}
      </button>
    </Seccion>
  )
}
