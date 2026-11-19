import { signal } from '@preact/signals'
import type { ComponentChildren } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { pedidoActual, resolver, textosPedido, datos } from './app/almacen'
import { useFoto } from './app/fotos'
import { volver } from './app/router'
import { aviso, confirmar, dialogo } from './app/ui'
import { planta } from './core/datos'
import { Icono, type NombreIcono } from './iconos'
import { cortoEtapa, DE_CULTIVO, duracion, nombreEtapa, type Etapa, type EstadoEtapa } from './core/etapas'

export type Color = 'verde' | 'azul' | 'ambar' | 'alerta' | 'teal' | 'gris'

const colorEtapa = (e: Etapa) => ({ '--ce': `var(--e-${e})` }) as Record<string, string>

// ─── Estructura ───

export function Encabezado(p: { titulo: string; acciones?: ComponentChildren; izquierda?: ComponentChildren }) {
  return (
    <header class="encabezado">
      <h1>{p.titulo}</h1>
      {p.izquierda}
      {p.acciones && <div class="lado derecha">{p.acciones}</div>}
    </header>
  )
}

/** Barra de una pantalla apilada: "‹ Atrás", título chico y acciones. */
export function Barra(p: { titulo: string; atras: string; textoAtras: string; acciones?: ComponentChildren }) {
  return (
    <header class="encabezado chico">
      <div class="lado">
        <button class="boton-texto" onClick={() => volver(p.atras)}>‹ {p.textoAtras}</button>
      </div>
      <h1>{p.titulo}</h1>
      <div class="lado derecha">{p.acciones}</div>
    </header>
  )
}

export function Tarjeta(p: { fondo?: 'verde' | 'ambar' | 'alerta'; class?: string; children: ComponentChildren; style?: Record<string, string> }) {
  return <section class={['tarjeta', p.fondo, p.class].filter(Boolean).join(' ')} style={p.style}>{p.children}</section>
}

export function Seccion(p: { titulo?: string; pie?: ComponentChildren; children: ComponentChildren }) {
  return (
    <div class="seccion">
      {p.titulo && <h2 class="titulo-seccion">{p.titulo}</h2>}
      <div class="grupo">{p.children}</div>
      {p.pie && <p class="pie">{p.pie}</p>}
    </div>
  )
}

export function Vacio(p: { icono: NombreIcono; titulo: string; texto?: string; children?: ComponentChildren }) {
  return (
    <div class="vacio">
      <div class="icono"><Icono nombre={p.icono} tam={44} /></div>
      <h3>{p.titulo}</h3>
      {p.texto && <p>{p.texto}</p>}
      {p.children}
    </div>
  )
}

// ─── Botones y controles ───

/** Botón grande (cómodo con una mano). */
export function BotonGrande(p: { titulo: string; icono?: NombreIcono; color?: Color; relleno?: boolean; disabled?: boolean; onClick: () => void }) {
  const clases = ['boton', p.color ?? 'verde', p.relleno === false ? 'suave' : ''].join(' ')
  return (
    <button class={clases} disabled={p.disabled} onClick={p.onClick}>
      {p.icono && <Icono nombre={p.icono} />}
      <span>{p.titulo}</span>
    </button>
  )
}

export function Pastilla(p: { icono: NombreIcono; texto: string; color?: 'verde' | 'azul' | 'gris' }) {
  return <span class={`pastilla ${p.color ?? 'verde'}`}><Icono nombre={p.icono} tam={16} />{p.texto}</span>
}

export function Segmentos<T extends string>(p: { opciones: readonly (readonly [T, string])[]; valor: T; onCambio: (v: T) => void }) {
  return (
    <div class="segmentos" role="radiogroup">
      {p.opciones.map(([v, texto]) => (
        <button key={v} type="button" role="radio" aria-checked={v === p.valor} class={v === p.valor ? 'activo' : ''}
          onClick={() => p.onCambio(v)}>{texto}</button>
      ))}
    </div>
  )
}

export function Interruptor(p: { valor: boolean; onCambio: (v: boolean) => void; etiqueta: string }) {
  return (
    <input type="checkbox" class="interruptor" role="switch" aria-label={p.etiqueta} checked={p.valor}
      onChange={(e) => p.onCambio((e.target as HTMLInputElement).checked)} />
  )
}

export function Contador(p: { valor: number; min?: number; max?: number; paso?: number; onCambio: (v: number) => void; texto?: string }) {
  const paso = p.paso ?? 1
  const min = p.min ?? 0
  const max = p.max ?? Infinity
  return (
    <div class="contador">
      <button type="button" aria-label="Restar" disabled={p.valor <= min} onClick={() => p.onCambio(Math.max(min, +(p.valor - paso).toFixed(2)))}>−</button>
      <span class="numero">{p.texto ?? p.valor}</span>
      <button type="button" aria-label="Sumar" disabled={p.valor >= max} onClick={() => p.onCambio(Math.min(max, +(p.valor + paso).toFixed(2)))}>+</button>
    </div>
  )
}

export function Girando() {
  return <span class="girando" aria-label="Cargando" />
}

// ─── Etapas ───

export function EtiquetaEtapa({ etapa }: { etapa: Etapa }) {
  return <span class="etiqueta-etapa" style={colorEtapa(etapa)}>{nombreEtapa[etapa]}</span>
}

/** Cuánto del ciclo (de 0 a 1) ya pasó: 1 si la planta ya no está creciendo. */
export function progresoCiclo(estado: EstadoEtapa): number {
  const tramos = estado.tramos.filter((t) => duracion(t) > 0)
  const inicio = tramos[0]?.desdeDia ?? 0
  const total = Math.max((tramos[tramos.length - 1]?.hastaDia ?? 1) - inicio, 1)
  if (!DE_CULTIVO.includes(estado.etapa)) return 1
  return Math.min(Math.max(estado.dia - inicio + 0.5, 0), total) / total
}

/** Anillo con el avance del ciclo, del color de la etapa. Adentro: la semana, o un ícono si ya se cosechó. */
export function AnilloEtapa({ estado, children }: { estado: EstadoEtapa; children: ComponentChildren }) {
  return (
    <span class="anillo-etapa" style={{ ...colorEtapa(estado.etapa), '--p': progresoCiclo(estado).toFixed(3) }} aria-hidden="true">
      {children}
    </span>
  )
}

/** Barra de etapas con el marcador de hoy. */
export function BarraEtapas({ estado, compacta = false }: { estado: EstadoEtapa; compacta?: boolean }) {
  const tramos = estado.tramos.filter((t) => duracion(t) > 0)
  const vivo = DE_CULTIVO.includes(estado.etapa)
  const posicion = progresoCiclo(estado)
  return (
    <div class={`barra-etapas${compacta ? ' compacta' : ''}`} role="img" aria-label={`Etapa: ${nombreEtapa[estado.etapa]}, día ${estado.dia}`}>
      <div class="pista">
        <div class="tramos">
          {tramos.map((t) => (
            <div key={t.etapa} class={`tramo${t.etapa === estado.etapa || !vivo ? '' : ' apagado'}`}
              style={{ ...colorEtapa(t.etapa), flex: `${duracion(t)} 1 0` }} />
          ))}
        </div>
        <div class="marcador" style={{ left: `calc(${(posicion * 100).toFixed(2)}%)` }} />
      </div>
      {!compacta && (
        <div class="nombres">
          {tramos.map((t) => (
            <span key={t.etapa} class={t.etapa === estado.etapa ? 'actual' : ''} style={{ flex: `${duracion(t)} 1 0` }}>
              {cortoEtapa(t.etapa)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Fotos ───

export function Miniatura({ nombre, onClick }: { nombre: string; onClick?: () => void }) {
  const url = useFoto(nombre)
  return (
    <button class="miniatura" onClick={onClick} aria-label="Ver foto">
      {url ? <img src={url} alt="" loading="lazy" /> : url === null ? <Icono nombre="imagen" tam={28} /> : ''}
    </button>
  )
}

export function Imagen({ nombre, class: clase }: { nombre: string; class?: string }) {
  const url = useFoto(nombre)
  if (url === null) return <p class="nota">No encuentro la foto.</p>
  return url ? <img src={url} alt="" class={clase} loading="lazy" /> : <div style={{ aspectRatio: '4 / 3' }} />
}

export const fotoAbierta = signal<{ nombre: string; alBorrar?: () => void } | undefined>(undefined)

function VisorFoto() {
  const f = fotoAbierta.value
  const url = useFoto(f?.nombre)
  if (!f) return null
  const borrar = async () => {
    if (await confirmar('¿Borrar la foto?', 'Borrar', { destructiva: true })) {
      f.alBorrar?.()
      fotoAbierta.value = undefined
    }
  }
  return (
    <div class="visor" role="dialog" aria-modal="true">
      <div class="barra-visor">
        <button class="boton-texto" onClick={() => { fotoAbierta.value = undefined }}>Cerrar</button>
        {f.alBorrar && <button class="boton-texto" onClick={borrar} aria-label="Borrar foto"><Icono nombre="basura" tam={22} /></button>}
      </div>
      <div class="imagen" onClick={() => { fotoAbierta.value = undefined }}>
        {url ? <img src={url} alt="" /> : url === null ? <p style={{ color: '#fff' }}>No encuentro la foto.</p> : null}
      </div>
    </div>
  )
}

// ─── Hojas ───

/** Bloquea el scroll de la página mientras hay una hoja abierta. */
function useBloquearScroll() {
  useEffect(() => {
    const y = window.scrollY
    const b = document.body.style
    const antes = { position: b.position, top: b.top, width: b.width }
    b.position = 'fixed'
    b.top = `-${y}px`
    b.width = '100%'
    return () => {
      b.position = antes.position
      b.top = antes.top
      b.width = antes.width
      window.scrollTo(0, y)
    }
  }, [])
}

/** Modal que sube desde abajo, con Cancelar y Guardar arriba (como las hojas de iOS). */
export function Hoja(p: {
  titulo: string
  onCerrar: () => void
  onGuardar?: () => void
  guardarDeshabilitado?: boolean
  textoGuardar?: string
  textoCerrar?: string
  children: ComponentChildren
}) {
  useBloquearScroll()
  return (
    <div class="velo" onClick={(e) => { if (e.target === e.currentTarget) p.onCerrar() }}>
      <div class="hoja" role="dialog" aria-modal="true" aria-label={p.titulo}>
        <div class="barra-hoja">
          <button class="boton-texto" onClick={p.onCerrar}>{p.textoCerrar ?? 'Cancelar'}</button>
          <h2>{p.titulo}</h2>
          {p.onGuardar
            ? <button class="boton-texto fuerte" disabled={p.guardarDeshabilitado} onClick={p.onGuardar}>{p.textoGuardar ?? 'Guardar'}</button>
            : <span style={{ minWidth: '80px' }} />}
        </div>
        <div class="contenido">{p.children}</div>
      </div>
    </div>
  )
}

function DialogoGlobal() {
  const d = dialogo.value
  if (!d) return null
  return <Acciones d={d} />
}

function Acciones({ d }: { d: NonNullable<typeof dialogo.value> }) {
  useBloquearScroll()
  const soloMensaje = d.opciones.length === 0
  return (
    <div class="velo" onClick={(e) => { if (e.target === e.currentTarget) d.resolver(undefined) }}>
      <div class="acciones" role="alertdialog" aria-modal="true" aria-label={d.titulo}>
        <div class="grupo">
          <div class="cabeza-acciones">
            <strong>{d.titulo}</strong>
            {d.mensaje && <p>{d.mensaje}</p>}
          </div>
          {d.opciones.map((o) => (
            <button key={o.valor} class={o.destructiva ? 'destructiva' : ''} onClick={() => d.resolver(o.valor)}>{o.texto}</button>
          ))}
        </div>
        <button class="cancelar" onClick={() => d.resolver(undefined)}>{soloMensaje ? 'OK' : 'Cancelar'}</button>
      </div>
    </div>
  )
}

function AvisoGlobal() {
  const a = aviso.value
  return a ? <div class="aviso-flotante" role="status" key={a.id}>{a.texto}</div> : null
}

/** Pedir un número (gramos, cantidad de semillas). */
function PedidoGlobal() {
  const p = pedidoActual.value
  return p ? <HojaNumero key={`${p.tipo}-${p.plantaID}`} /> : null
}

function HojaNumero() {
  const p = pedidoActual.value!
  const t = textosPedido[p.tipo]
  const [texto, setTexto] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { setTimeout(() => ref.current?.focus(), 250) }, [])
  const n = Number(texto.replace(',', '.'))
  const valor = texto.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : undefined
  const cerrar = () => { pedidoActual.value = undefined }
  const guardar = () => {
    if (valor === undefined) return
    resolver(p, valor)
    cerrar()
  }
  return (
    <Hoja titulo={`${t.titulo}: ${planta(datos.value, p.plantaID)?.nombre ?? ''}`} onCerrar={cerrar} onGuardar={guardar}
      guardarDeshabilitado={valor === undefined}>
      <Seccion titulo={t.pregunta} pie={t.ayuda}>
        <div class="fila">
          <input ref={ref} type="text" inputMode={t.entero ? 'numeric' : 'decimal'} placeholder={t.entero ? 'Cantidad' : 'Gramos'}
            value={texto} onInput={(e) => setTexto((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => { if (e.key === 'Enter') guardar() }} style={{ fontSize: '24px' }} />
        </div>
      </Seccion>
    </Hoja>
  )
}

/** Lo que flota sobre todas las pantallas. */
export function Superpuestos() {
  return (
    <>
      <PedidoGlobal />
      <VisorFoto />
      <DialogoGlobal />
      <AvisoGlobal />
    </>
  )
}
