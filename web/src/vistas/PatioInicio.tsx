import { useMemo } from 'preact/hooks'
import { datos, estadoDe, tareas } from '../app/almacen'
import { ir } from '../app/router'
import { AnilloEtapa, progresoCiclo, Tarjeta } from '../componentes'
import { Calendario } from '../core/calendario'
import { nombreEtapa, semana } from '../core/etapas'
import type { Planta } from '../core/modelos'
import {
  CELDAS_SOMBRA, daElSol, grilla, luzDelDia, mapaDeSombra, posicionSol, rumboCorto, rumboLado,
  type Lado, type Patio, type PosicionSol,
} from '../core/patio'
import type { Tarea } from '../core/tareas'
import { Icono } from '../iconos'
import { grosorPared, imagenDe, useOscuro, useReloj } from './plano'

// El patio en la pantalla de Hoy: el plano con cada planta donde la dejaste (en Plantas → Patio), con el sol
// y la sombra de este momento. Tocar una planta abre su ficha. Acá no se arrastra nada, para no moverlas sin querer.

/** El dibujo toma la forma del patio: a lo sumo 340 de ancho y 280 de alto (más los márgenes). */
const ANCHO_MAX = 340
const ALTO_MAX = 280
const MARGEN_X = 34
const MARGEN_ARRIBA = 28
const MARGEN_ABAJO = 30

/** Sol y sombra de ahora, en los dos modos. */
const TINTAS = { claro: { sol: '#f3d48c', sombra: '#d8dfd1' }, oscuro: { sol: '#5f4a1d', sombra: '#1c261e' } }

const metros = (m: number) => String(+m.toFixed(2)).replace('.', ',')
const hora = (f: Date) => `${Calendario.hora(f)}:${String(Calendario.minuto(f)).padStart(2, '0')}`

export function PatioInicio() {
  useReloj(5 * 60_000) // El sol se mueve: se redibuja cada 5 minutos.
  const d = datos.value
  const activas = d.plantas.filter((p) => p.estado === 'activa')
  const enPatio = activas.filter((p) => p.ubicacion === 'patio')
  const adentro = activas.filter((p) => p.ubicacion === 'interior')
  const patio = d.patio

  if (!patio) {
    if (enPatio.length === 0) return null
    return (
      <Tarjeta class="patio-inicio">
        <button class="patio-sin-plano" onClick={() => ir('patio')}>
          <span class="icono"><Icono nombre="sol" tam={22} /></span>
          <span style={{ flex: 1 }}>Dibujá tu patio para ver acá dónde está cada planta y por dónde le da el sol.</span>
          <span class="chevron" aria-hidden="true">›</span>
        </button>
      </Tarjeta>
    )
  }

  const ahora = new Date()
  const sol = posicionSol(ahora, patio.latitud, patio.longitud)
  const pendientes = new Map<string, Tarea[]>()
  for (const t of tareas.value) pendientes.set(t.plantaID, [...(pendientes.get(t.plantaID) ?? []), t])
  const ubicadas = enPatio.filter((p) => patio.ubicaciones[p.id])
  const sinLugar = enPatio.filter((p) => !patio.ubicaciones[p.id])
  const alSol = new Set(ubicadas.filter((p) => daElSol(patio, patio.ubicaciones[p.id], sol)).map((p) => p.id))

  return (
    <Tarjeta class="patio-inicio">
      <div class="cabeza-patio">
        <div>
          <h3>Tu patio</h3>
          <p class="meta">
            {metros(patio.ancho)} × {metros(patio.largo)} m · {enPatio.length} {enPatio.length === 1 ? 'planta' : 'plantas'}
          </p>
        </div>
        <button class="mini-boton gris" onClick={() => ir('patio')}><Icono nombre="pincel" tam={15} />Editar</button>
      </div>
      <div class={`patio-cuerpo${patio.largo / patio.ancho >= 1.25 ? ' patio-alto' : ''}`}>
        <Plano patio={patio} plantas={ubicadas} pendientes={pendientes} sol={sol} alSol={alSol} />
        {ubicadas.length > 0 && <ListaPatio plantas={ubicadas} pendientes={pendientes} alSol={alSol} />}
      </div>
      <SolAhora patio={patio} ahora={ahora} ubicadas={ubicadas} alSol={alSol} />
      {enPatio.length === 0 && <p class="nota">No hay plantas en el patio.</p>}
      {sinLugar.length > 0 && (
        <button class="patio-pendiente" onClick={() => ir('patio')}>
          <span style={{ flex: 1 }}>Sin lugar en el plano: {sinLugar.map((p) => p.nombre).join(', ')}</span>
          <span class="ubicar">Ubicar ›</span>
        </button>
      )}
      {adentro.length > 0 && (
        <div class="patio-adentro">
          <span class="nota con-icono"><Icono nombre="casa" tam={16} />Adentro:</span>
          {adentro.map((p) => <button key={p.id} onClick={() => ir(`planta/${p.id}`)}>{p.nombre}</button>)}
        </div>
      )}
    </Tarjeta>
  )
}

/** Al lado del plano, si hay lugar (en la computadora, con un patio angosto): cada planta con su etapa, si tiene
 *  sol ahora y cuántas cosas tiene para hoy. */
function ListaPatio(p: { plantas: Planta[]; pendientes: Map<string, Tarea[]>; alSol: Set<string> }) {
  return (
    <ul class="lista-patio">
      {p.plantas.map((pl) => {
        const e = estadoDe(pl)
        const n = p.pendientes.get(pl.id)?.length ?? 0
        return (
          <li key={pl.id}>
            <button onClick={() => ir(`planta/${pl.id}`)}>
              <AnilloEtapa estado={e}><span class="sem"><b>{semana(e)}</b></span></AnilloEtapa>
              <span class="principal">
                <span class="nombre">{pl.nombre}</span>
                <span class="secundario">{nombreEtapa[e.etapa]} · día {e.dia}</span>
              </span>
              {p.alSol.has(pl.id) && <span class="chip-sol" title="Le da el sol ahora"><Icono nombre="sol" tam={14} /></span>}
              {n > 0 && <span class="chip-tareas" title={`${n} ${n === 1 ? 'cosa' : 'cosas'} para hoy`}>{n}</span>}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** Una línea con el sol de ahora: a quién le da y hasta cuándo (o cuándo sale). */
function SolAhora(p: { patio: Patio; ahora: Date; ubicadas: Planta[]; alSol: Set<string> }) {
  const luz = luzDelDia(p.ahora, p.patio.latitud, p.patio.longitud)
  if (!luz) return null
  const deDia = p.ahora >= luz.sale && p.ahora <= luz.sePone
  if (!deDia) {
    const sale = p.ahora < luz.sale ? luz.sale : luzDelDia(Calendario.sumarDias(1, p.ahora), p.patio.latitud, p.patio.longitud)?.sale
    return (
      <p class="sol-ahora noche">
        <Icono nombre="luna" tam={17} />
        <span>De noche.{sale ? ` El sol sale a las ${hora(sale)}.` : ''}</span>
      </p>
    )
  }
  const nombres = p.ubicadas.filter((x) => p.alSol.has(x.id)).map((x) => x.nombre)
  const quien = p.ubicadas.length === 0 ? 'Es de día'
    : nombres.length === 0 ? 'Ahora ninguna tiene sol directo'
    : nombres.length === p.ubicadas.length ? (p.ubicadas.length === 1 ? `Sol ahora en ${nombres[0]}` : 'Ahora les da el sol a todas')
    : `Sol ahora en ${lista(nombres)}`
  return (
    <p class="sol-ahora">
      <Icono nombre="sol" tam={17} />
      <span>{quien}. Se pone a las {hora(luz.sePone)}.</span>
    </p>
  )
}

const lista = (n: string[]) => (n.length === 1 ? n[0] : `${n.slice(0, -1).join(', ')} y ${n[n.length - 1]}`)

function Plano(p: { patio: Patio; plantas: Planta[]; pendientes: Map<string, Tarea[]>; sol: PosicionSol; alSol: Set<string> }) {
  const { patio, sol } = p
  const oscuro = useOscuro()
  const escala = Math.min((ANCHO_MAX - 2 * MARGEN_X) / patio.ancho, ALTO_MAX / patio.largo)
  const w = patio.ancho * escala
  const h = patio.largo * escala
  const ancho = w + 2 * MARGEN_X
  const ox = MARGEN_X
  const oy = MARGEN_ARRIBA
  const X = (x: number) => ox + x * escala
  const Y = (y: number) => oy + y * escala
  const radio = Math.max(0.17 * escala, 16)
  const altoVista = oy + h + MARGEN_ABAJO
  const deDia = sol.altura > 0

  // Sol y sombra de ahora sobre el piso (solo cambia si se mueve el sol o el patio).
  const claveSol = JSON.stringify({ ...patio, ubicaciones: undefined })
  const piso = useMemo(() => {
    if (!deDia) return ''
    const { columnas, filas } = grilla(patio, CELDAS_SOMBRA)
    const s = mapaDeSombra(patio, sol)
    const t = oscuro ? TINTAS.oscuro : TINTAS.claro
    return imagenDe(columnas, filas, (k) => (s[k] ? t.sol : t.sombra))
  }, [claveSol, Math.round(sol.azimut * 2), Math.round(sol.altura * 2), oscuro, deDia])

  // Hacia dónde queda el sol en el dibujo (y hacia dónde caen las sombras de las macetas).
  const a = ((sol.azimut - patio.orientacion) * Math.PI) / 180
  const dir = { x: Math.sin(a), y: -Math.cos(a) }
  const largoSombra = deDia ? Math.min(9, 2 + 7 * Math.cos((sol.altura * Math.PI) / 180)) : 0
  const solEn = (() => {
    const hx = w / 2 + 17
    const hy = h / 2 + 17
    const t = Math.min(Math.abs(dir.x) > 1e-6 ? hx / Math.abs(dir.x) : Infinity, Math.abs(dir.y) > 1e-6 ? hy / Math.abs(dir.y) : Infinity)
    const lim = (v: number, max: number) => Math.min(Math.max(v, 12), max - 12)
    return { x: lim(ox + w / 2 + dir.x * t, ancho), y: lim(oy + h / 2 + dir.y * t, altoVista) }
  })()

  const paredes: [Lado, number, number, number, number][] = [
    ['arriba', ox, oy, ox + w, oy], ['derecha', ox + w, oy, ox + w, oy + h],
    ['abajo', ox, oy + h, ox + w, oy + h], ['izquierda', ox, oy, ox, oy + h],
  ]
  const rumbo = (l: Lado) => rumboCorto(rumboLado(patio, l))
  // Las letras de los rumbos también ocupan lugar.
  const rumbos: Caja[] = [
    { x0: ox + w / 2 - 10, y0: oy - 24, x1: ox + w / 2 + 10, y1: oy - 8 },
    { x0: ox + w / 2 - 10, y0: oy + h + 8, x1: ox + w / 2 + 10, y1: oy + h + 24 },
    { x0: ox - 32, y0: oy + h / 2 - 8, x1: ox - 10, y1: oy + h / 2 + 8 },
    { x0: ox + w + 10, y0: oy + h / 2 - 8, x1: ox + w + 32, y1: oy + h / 2 + 8 },
  ]
  const marcas = p.plantas.map((pl) => ({ planta: pl, x: X(patio.ubicaciones[pl.id].x), y: Y(patio.ubicaciones[pl.id].y) }))
  const lados = ladosDeEtiquetas(marcas.map((m) => ({ x: m.x, y: m.y, nombre: m.planta.nombre })), radio, ancho, altoVista, rumbos)
  const baldosa = 0.5 * escala

  return (
    <svg class={`plano plano-inicio${deDia ? '' : ' de-noche'}`} viewBox={`0 0 ${ancho} ${altoVista}`} role="group"
      aria-label={`Plano del patio con ${p.plantas.length} ${p.plantas.length === 1 ? 'planta' : 'plantas'}`}>
      <defs>
        <clipPath id="piso-inicio"><rect x={ox} y={oy} width={w} height={h} rx="4" /></clipPath>
        <pattern id="baldosas-inicio" width={baldosa} height={baldosa} patternUnits="userSpaceOnUse" x={ox} y={oy}>
          <path d={`M ${baldosa} 0 V ${baldosa} H 0`} class="junta" />
        </pattern>
        <radialGradient id="vineta-inicio" cx="50%" cy="50%" r="75%">
          <stop offset="55%" stop-color="var(--muro)" stop-opacity="0" />
          <stop offset="100%" stop-color="var(--muro)" stop-opacity="0.22" />
        </radialGradient>
        <radialGradient id="sombra-maceta">
          <stop offset="35%" stop-color="#0b2414" stop-opacity="0.32" />
          <stop offset="100%" stop-color="#0b2414" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="brillo-sol">
          <stop offset="0%" stop-color="var(--ambar)" stop-opacity="0.45" />
          <stop offset="100%" stop-color="var(--ambar)" stop-opacity="0" />
        </radialGradient>
        <pattern id="rayado-inicio" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--texto-3)" stroke-width="2" />
        </pattern>
      </defs>

      <g clip-path="url(#piso-inicio)">
        <rect x={ox} y={oy} width={w} height={h} class="suelo" />
        {piso && <image href={piso} x={ox} y={oy} width={w} height={h} preserveAspectRatio="none" class="luz-ahora" />}
        <rect x={ox} y={oy} width={w} height={h} fill="url(#baldosas-inicio)" />
        <rect x={ox} y={oy} width={w} height={h} fill="url(#vineta-inicio)" />
      </g>

      {patio.obstaculos.map((o) => (
        <g key={o.id}>
          <rect x={X(o.x)} y={Y(o.y)} width={o.ancho * escala} height={o.largo * escala} rx="2" class="obstaculo" />
          <rect x={X(o.x)} y={Y(o.y)} width={o.ancho * escala} height={o.largo * escala} rx="2" fill="url(#rayado-inicio)" />
        </g>
      ))}

      {paredes.map(([l, x1, y1, x2, y2]) => {
        const alto = patio.paredes[l].alto
        return <line key={l} x1={x1} y1={y1} x2={x2} y2={y2} stroke-width={grosorPared(alto)} class={alto === 0 ? 'pared abierta' : 'pared'} />
      })}
      {([['arriba', ox + w / 2, oy - 12, 'middle'], ['abajo', ox + w / 2, oy + h + 21, 'middle'],
        ['izquierda', ox - 13, oy + h / 2 + 4, 'end'], ['derecha', ox + w + 13, oy + h / 2 + 4, 'start']] as const)
        // La letra que queda debajo del sol no se dibuja (el sol ya dice de qué lado está).
        .filter(([, x, y]) => !deDia || Math.hypot(x - solEn.x, y - 4 - solEn.y) > 24)
        .map(([l, x, y, anclaje]) => <text key={l} x={x} y={y} text-anchor={anclaje} class="rumbo">{rumbo(l)}</text>)}

      {deDia && (
        <g class="sol-marca" transform={`translate(${solEn.x} ${solEn.y})`} aria-hidden="true">
          <circle r="17" fill="url(#brillo-sol)" />
          {Array.from({ length: 8 }, (_, i) => (
            <line key={i} x1="0" y1="-9.5" x2="0" y2="-12.5" transform={`rotate(${i * 45})`} />
          ))}
          <circle r="6.5" class="disco" />
        </g>
      )}

      {marcas.map((m) => (
        <circle key={`s-${m.planta.id}`} cx={m.x - dir.x * largoSombra} cy={m.y - dir.y * largoSombra + (deDia ? 0 : 2)}
          r={radio + 7} fill="url(#sombra-maceta)" />
      ))}
      {marcas.map((m, i) => (
        <MarcaPlanta key={m.planta.id} planta={m.planta} x={m.x} y={m.y} radio={radio} etiqueta={lados[i]}
          alSol={p.alSol.has(m.planta.id)} tareas={p.pendientes.get(m.planta.id) ?? []} />
      ))}
    </svg>
  )
}

// ─── Nombres sin pisarse ───

type LadoEtiqueta = 'abajo' | 'arriba' | 'derecha' | 'izquierda'
interface Caja { x0: number; y0: number; x1: number; y1: number }

const ALTO_LETRA = 13
const choca = (a: Caja, b: Caja) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
/** Ancho aproximado del nombre (11 px, seminegrita). */
const anchoNombre = (t: string) => t.length * 6.4 + 6

function cajaEtiqueta(x: number, y: number, r: number, ancho: number, lado: LadoEtiqueta): Caja {
  switch (lado) {
    case 'abajo': return { x0: x - ancho / 2, y0: y + r + 1.5, x1: x + ancho / 2, y1: y + r + 1.5 + ALTO_LETRA }
    case 'arriba': return { x0: x - ancho / 2, y0: y - r - 6 - ALTO_LETRA, x1: x + ancho / 2, y1: y - r - 6 }
    case 'derecha': return { x0: x + r + 6, y0: y - ALTO_LETRA / 2, x1: x + r + 6 + ancho, y1: y + ALTO_LETRA / 2 }
    case 'izquierda': return { x0: x - r - 3 - ancho, y0: y - ALTO_LETRA / 2, x1: x - r - 3, y1: y + ALTO_LETRA / 2 }
  }
}

/** Dónde va el nombre de cada planta: abajo si entra; si no, arriba o a un costado, sin tapar otra planta ni otro nombre. */
function ladosDeEtiquetas(marcas: { x: number; y: number; nombre: string }[], r: number, anchoVista: number, alto: number,
  otros: Caja[]): LadoEtiqueta[] {
  // Cada maceta ocupa su círculo y su insignia (arriba a la derecha).
  const ocupado: Caja[] = [...otros]
  for (const m of marcas) {
    ocupado.push({ x0: m.x - r - 1, y0: m.y - r - 1, x1: m.x + r + 1, y1: m.y + r + 1 })
    ocupado.push({ x0: m.x + 0.75 * r - 9.5, y0: m.y - 0.75 * r - 9.5, x1: m.x + 0.75 * r + 9.5, y1: m.y - 0.75 * r + 9.5 })
  }
  const adentro = (c: Caja) => c.x0 >= 0 && c.y0 >= 0 && c.x1 <= anchoVista && c.y1 <= alto
  return marcas.map((m) => {
    const ancho = anchoNombre(m.nombre)
    for (const lado of ['abajo', 'arriba', 'derecha', 'izquierda'] as const) {
      const c = cajaEtiqueta(m.x, m.y, r, ancho, lado)
      if (adentro(c) && !ocupado.some((o) => choca(c, o))) {
        ocupado.push(c)
        return lado
      }
    }
    return 'abajo'
  })
}

function posicionNombre(lado: LadoEtiqueta, r: number): { x: number; y: number; 'text-anchor': string } {
  switch (lado) {
    case 'abajo': return { x: 0, y: r + 12, 'text-anchor': 'middle' }
    case 'arriba': return { x: 0, y: -r - 9, 'text-anchor': 'middle' }
    case 'derecha': return { x: r + 7, y: 4, 'text-anchor': 'start' }
    case 'izquierda': return { x: -r - 4, y: 4, 'text-anchor': 'end' }
  }
}

// ─── Cada maceta ───

function MarcaPlanta(p: { planta: Planta; x: number; y: number; radio: number; etiqueta: LadoEtiqueta; alSol: boolean; tareas: Tarea[] }) {
  const e = estadoDe(p.planta)
  const r = p.radio
  const largo = 2 * Math.PI * r
  const n = p.tareas.length
  const abrir = () => ir(`planta/${p.planta.id}`)
  const etiqueta = `${p.planta.nombre}: ${nombreEtapa[e.etapa].toLowerCase()}, semana ${semana(e)}`
    + (p.alSol ? ', al sol ahora' : '')
    + (n === 0 ? ', nada pendiente' : `, ${n} ${n === 1 ? 'cosa' : 'cosas'} para hoy`)
  return (
    <g class={`marca-inicio${p.alSol ? ' al-sol' : ''}`} transform={`translate(${p.x} ${p.y})`} style={{ '--ce': `var(--e-${e.etapa})` }}
      role="button" tabIndex={0} aria-label={etiqueta} onClick={abrir}
      onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrir() } }}>
      <circle r={r + 10} fill="transparent" />
      <g class="cuerpo-marca">
        {p.alSol && <circle r={r + 3.5} class="halo-sol" />}
        <circle r={r} class="pista" />
        <circle r={r} class="avance" stroke-dasharray={`${progresoCiclo(e) * largo} ${largo}`} transform="rotate(-90)" />
        <circle r={r - 3.5} class="centro" />
        <text y="2" text-anchor="middle" class="sem">{semana(e)}</text>
        <text y="9.5" text-anchor="middle" class="sem-chico">SEM</text>
      </g>
      <text class="nombre" {...posicionNombre(p.etiqueta, r)}>{p.planta.nombre}</text>
      {n > 0 && (
        <g transform={`translate(${r * 0.75} ${-r * 0.75})`} class="insignia-plano">
          <circle r="8.5" />
          <text y="3.6" text-anchor="middle">{n}</text>
        </g>
      )}
    </g>
  )
}
