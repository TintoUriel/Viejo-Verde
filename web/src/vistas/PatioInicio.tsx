import { datos, estadoDe, tareas } from '../app/almacen'
import { ir } from '../app/router'
import { progresoCiclo, Tarjeta } from '../componentes'
import { nombreEtapa, semana } from '../core/etapas'
import { rumboCorto, rumboLado, type Lado, type Patio } from '../core/patio'
import type { Planta } from '../core/modelos'
import type { Tarea } from '../core/tareas'
import { Icono } from '../iconos'

// El patio en la pantalla de Hoy: el plano con cada planta donde la dejaste (en Plantas → Patio).
// Tocar una planta abre su ficha. Acá no se arrastra nada, para no moverlas sin querer.

const ANCHO = 340
const ALTO_MAX = 280
const MARGEN_X = 30
const MARGEN_ARRIBA = 18

export function PatioInicio() {
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
          <span style={{ flex: 1 }}>Dibujá tu patio para ver acá dónde está cada planta.</span>
          <span class="chevron" aria-hidden="true">›</span>
        </button>
      </Tarjeta>
    )
  }

  const pendientes = new Map<string, Tarea[]>()
  for (const t of tareas.value) pendientes.set(t.plantaID, [...(pendientes.get(t.plantaID) ?? []), t])
  const ubicadas = enPatio.filter((p) => patio.ubicaciones[p.id])
  const sinLugar = enPatio.filter((p) => !patio.ubicaciones[p.id])

  return (
    <Tarjeta class="patio-inicio">
      <div class="cabeza-patio">
        <h3>Tu patio</h3>
        <button class="boton-texto" onClick={() => ir('patio')}>Editar ›</button>
      </div>
      <Plano patio={patio} plantas={ubicadas} pendientes={pendientes} />
      {ubicadas.length > 0 && <p class="nota-chica">Tocá una planta para abrirla. El número rojo es lo que tiene para hoy.</p>}
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

function Plano({ patio, plantas, pendientes }: { patio: Patio; plantas: Planta[]; pendientes: Map<string, Tarea[]> }) {
  const escala = Math.min((ANCHO - 2 * MARGEN_X) / patio.ancho, ALTO_MAX / patio.largo)
  const w = patio.ancho * escala
  const h = patio.largo * escala
  const ox = (ANCHO - w) / 2
  const oy = MARGEN_ARRIBA
  const X = (x: number) => ox + x * escala
  const Y = (y: number) => oy + y * escala
  const radio = Math.max(0.17 * escala, 16)
  const altoVista = oy + h + 20
  const marcas = plantas.map((p) => ({ planta: p, x: X(patio.ubicaciones[p.id].x), y: Y(patio.ubicaciones[p.id].y) }))
  // Las letras de los rumbos también ocupan lugar.
  const rumbos: Caja[] = [
    { x0: ox + w / 2 - 10, y0: oy - 17, x1: ox + w / 2 + 10, y1: oy - 3 },
    { x0: ox + w / 2 - 10, y0: oy + h + 4, x1: ox + w / 2 + 10, y1: oy + h + 18 },
    { x0: ox - 30, y0: oy + h / 2 - 7, x1: ox - 7, y1: oy + h / 2 + 7 },
    { x0: ox + w + 7, y0: oy + h / 2 - 7, x1: ox + w + 30, y1: oy + h / 2 + 7 },
  ]
  const lados = ladosDeEtiquetas(marcas.map((m) => ({ x: m.x, y: m.y, nombre: m.planta.nombre })), radio, altoVista, rumbos)

  const paredes: [Lado, number, number, number, number][] = [
    ['arriba', ox, oy, ox + w, oy], ['derecha', ox + w, oy, ox + w, oy + h],
    ['abajo', ox, oy + h, ox + w, oy + h], ['izquierda', ox, oy, ox, oy + h],
  ]
  const rumbo = (l: Lado) => rumboCorto(rumboLado(patio, l))

  return (
    <svg class="plano plano-inicio" viewBox={`0 0 ${ANCHO} ${altoVista}`} role="group"
      aria-label={`Plano del patio con ${plantas.length} ${plantas.length === 1 ? 'planta' : 'plantas'}`}>
      <defs>
        <pattern id="rayado-inicio" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--texto-3)" stroke-width="2" />
        </pattern>
      </defs>
      <rect x={ox} y={oy} width={w} height={h} rx="3" class="suelo" />

      {patio.obstaculos.map((o) => (
        <g key={o.id}>
          <rect x={X(o.x)} y={Y(o.y)} width={o.ancho * escala} height={o.largo * escala} class="obstaculo" />
          <rect x={X(o.x)} y={Y(o.y)} width={o.ancho * escala} height={o.largo * escala} fill="url(#rayado-inicio)" />
        </g>
      ))}

      {paredes.map(([l, x1, y1, x2, y2]) => (
        <line key={l} x1={x1} y1={y1} x2={x2} y2={y2} class={patio.paredes[l].alto === 0 ? 'pared abierta' : 'pared'} />
      ))}
      <text x={ox + w / 2} y={oy - 6} text-anchor="middle" class="rumbo">{rumbo('arriba')}</text>
      <text x={ox + w / 2} y={oy + h + 15} text-anchor="middle" class="rumbo">{rumbo('abajo')}</text>
      <text x={ox - 9} y={oy + h / 2 + 4} text-anchor="end" class="rumbo">{rumbo('izquierda')}</text>
      <text x={ox + w + 9} y={oy + h / 2 + 4} text-anchor="start" class="rumbo">{rumbo('derecha')}</text>

      {marcas.map((m, i) => (
        <MarcaPlanta key={m.planta.id} planta={m.planta} x={m.x} y={m.y} radio={radio} etiqueta={lados[i]}
          tareas={pendientes.get(m.planta.id) ?? []} />
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
function ladosDeEtiquetas(marcas: { x: number; y: number; nombre: string }[], r: number, alto: number, otros: Caja[]): LadoEtiqueta[] {
  // Cada maceta ocupa su círculo y su insignia (arriba a la derecha).
  const ocupado: Caja[] = [...otros]
  for (const m of marcas) {
    ocupado.push({ x0: m.x - r - 1, y0: m.y - r - 1, x1: m.x + r + 1, y1: m.y + r + 1 })
    ocupado.push({ x0: m.x + 0.75 * r - 9.5, y0: m.y - 0.75 * r - 9.5, x1: m.x + 0.75 * r + 9.5, y1: m.y - 0.75 * r + 9.5 })
  }
  const adentro = (c: Caja) => c.x0 >= 0 && c.y0 >= 0 && c.x1 <= ANCHO && c.y1 <= alto
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

function MarcaPlanta(p: { planta: Planta; x: number; y: number; radio: number; etiqueta: LadoEtiqueta; tareas: Tarea[] }) {
  const e = estadoDe(p.planta)
  const r = p.radio
  const largo = 2 * Math.PI * r
  const n = p.tareas.length
  const abrir = () => ir(`planta/${p.planta.id}`)
  const etiqueta = `${p.planta.nombre}: ${nombreEtapa[e.etapa].toLowerCase()}, semana ${semana(e)}`
    + (n === 0 ? ', nada pendiente' : `, ${n} ${n === 1 ? 'cosa' : 'cosas'} para hoy`)
  return (
    <g class="marca-inicio" transform={`translate(${p.x} ${p.y})`} style={{ '--ce': `var(--e-${e.etapa})` }}
      role="button" tabIndex={0} aria-label={etiqueta} onClick={abrir}
      onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrir() } }}>
      <circle r={r + 10} fill="transparent" />
      <circle r={r} class="pista" />
      <circle r={r} class="avance" stroke-dasharray={`${progresoCiclo(e) * largo} ${largo}`} transform="rotate(-90)" />
      <circle r={r - 3.5} class="centro" />
      <text y="2" text-anchor="middle" class="sem">{semana(e)}</text>
      <text y="9.5" text-anchor="middle" class="sem-chico">SEM</text>
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

function posicionNombre(lado: LadoEtiqueta, r: number): { x: number; y: number; 'text-anchor': string } {
  switch (lado) {
    case 'abajo': return { x: 0, y: r + 12, 'text-anchor': 'middle' }
    case 'arriba': return { x: 0, y: -r - 9, 'text-anchor': 'middle' }
    case 'derecha': return { x: r + 7, y: 4, 'text-anchor': 'start' }
    case 'izquierda': return { x: -r - 4, y: 4, 'text-anchor': 'end' }
  }
}
