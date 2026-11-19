import type { JSX } from 'preact'
import type { TipoAvisoClima } from './core/clima'
import type { TipoRegistro } from './core/modelos'
import type { AccionTarea, TipoTarea } from './core/tareas'

// Íconos de trazo dibujados a mano en una grilla de 24×24. Toman el color del texto (currentColor).

const TRAZOS = {
  gota: <path d="M12 3c3.2 4 6 7.3 6 10.5A6 6 0 0 1 6 13.5C6 10.3 8.8 7 12 3Z" />,
  matraz: (
    <>
      <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3" />
      <path d="M7.5 15h9" />
    </>
  ),
  destellos: (
    <>
      <path d="M11 3.5l1.7 4.8 4.8 1.7-4.8 1.7L11 16.5l-1.7-4.8L4.5 10l4.8-1.7Z" />
      <path d="M18.5 15.5v5M16 18h5" />
    </>
  ),
  nota: (
    <>
      <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
      <path d="M13.5 6.5l4 4" />
    </>
  ),
  alerta: (
    <>
      <path d="M12 3.5 2.5 20h19L12 3.5Z" />
      <path d="M12 10v4.5M12 17.4v.2" />
    </>
  ),
  pregunta: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.4M12 17v.2" />
    </>
  ),
  flor: (
    <>
      <circle cx="12" cy="12" r="2.4" />
      {[0, 60, 120, 180, 240, 300].map((g) => (
        <ellipse key={g} cx="12" cy="6" rx="2.1" ry="2.9" transform={`rotate(${g} 12 12)`} />
      ))}
    </>
  ),
  semilla: (
    <>
      <ellipse cx="7.5" cy="8" rx="2.6" ry="3.4" transform="rotate(-25 7.5 8)" />
      <ellipse cx="16.5" cy="8.5" rx="2.6" ry="3.4" transform="rotate(20 16.5 8.5)" />
      <ellipse cx="12" cy="16.5" rx="2.6" ry="3.4" />
    </>
  ),
  tijera: (
    <>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M8.6 7.6 20 18M8.6 16.4 20 6" />
    </>
  ),
  frasco: (
    <>
      <path d="M8 3h8v3H8Z" />
      <path d="M7 6h10a1 1 0 0 1 1 1v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7a1 1 0 0 1 1-1Z" />
      <path d="M6 11h12" />
    </>
  ),
  brote: (
    <>
      <path d="M12 20v-7" />
      <path d="M12 13C12 9 9.5 7 5 7c0 4 2.5 6 7 6Z" />
      <path d="M12 11c0-3.5 2.5-6 7-6 0 3.5-2.5 6-7 6Z" />
      <path d="M7.5 20.5h9" />
    </>
  ),
  hoja: (
    <>
      <path d="M5 19C5 10 10 5 20 4c-.5 10-5.5 15-15 15Z" />
      <path d="M5 19 13 11" />
    </>
  ),
  candado: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 7.7-1.5" />
    </>
  ),
  ojo: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  hongo: (
    <>
      <path d="M3.5 12a8.5 7.5 0 0 1 17 0Z" />
      <path d="M9.5 12v6.5a2.5 2.5 0 0 0 5 0V12" />
    </>
  ),
  viento: (
    <>
      <path d="M3 8h11a3 3 0 1 0-3-3" />
      <path d="M3 12h16a3 3 0 1 1-3 3" />
      <path d="M3 16h7" />
    </>
  ),
  hembra: (
    <>
      <circle cx="12" cy="9" r="5" />
      <path d="M12 14v7M9 18h6" />
    </>
  ),
  macho: (
    <>
      <circle cx="10" cy="14" r="5" />
      <path d="M13.5 10.5 20 4M15 4h5v5" />
    </>
  ),
  casa: (
    <>
      <path d="M3.5 11 12 4l8.5 7" />
      <path d="M6 9.5V20h12V9.5" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.7 2.7L16.5 9.5" />
    </>
  ),
  luna: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />,
  sol: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
    </>
  ),
  brujula: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.2 8.8-1.9 4.5-4.5 1.9 1.9-4.5Z" />
    </>
  ),
  nube: <path d="M7 18h10.5a4 4 0 0 0 .4-8 6 6 0 0 0-11.6 1.5A3.3 3.3 0 0 0 7 18Z" />,
  solNube: (
    <>
      <path d="M8 2.5V4M3.4 4.4l1.1 1.1M2 9h1.5M12.6 4.4l-1.1 1.1" />
      <path d="M5.2 12A4 4 0 0 1 12 7.4" />
      <path d="M9 20.5h8.5a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6 1.2A2.9 2.9 0 0 0 9 20.5Z" />
    </>
  ),
  lluvia: (
    <>
      <path d="M7 14.5h10.5a3.8 3.8 0 0 0 .4-7.6 5.8 5.8 0 0 0-11.2 1.4A3.1 3.1 0 0 0 7 14.5Z" />
      <path d="M8.5 17.5 7.5 20M12.5 17.5l-1 2.5M16.5 17.5l-1 2.5" />
    </>
  ),
  llovizna: (
    <>
      <path d="M7 14.5h10.5a3.8 3.8 0 0 0 .4-7.6 5.8 5.8 0 0 0-11.2 1.4A3.1 3.1 0 0 0 7 14.5Z" />
      <path d="M10 18v1.5M14 18v1.5" />
    </>
  ),
  termometro: (
    <>
      <path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0Z" />
      <path d="M12 9v7" />
    </>
  ),
  copo: (
    <>
      <path d="M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6" />
      <path d="M9.5 4 12 6l2.5-2M9.5 20l2.5-2 2.5 2" />
    </>
  ),
  lupa: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  reciclar: (
    <>
      <path d="M20 12a8 8 0 0 1-13.7 5.6M4 12a8 8 0 0 1 13.7-5.6" />
      <path d="M18 2.5v4h-4M6 21.5v-4h4" />
    </>
  ),
  imagen: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.6" />
      <path d="m21 16-5-5-9 8.5" />
    </>
  ),
  fotos: (
    <>
      <rect x="7" y="3" width="14" height="14" rx="2" />
      <path d="M3 7v12a2 2 0 0 0 2 2h12" />
      <path d="m21 13-3.5-3.5L11 16" />
    </>
  ),
  basura: (
    <>
      <path d="M4 6.5h16M9.5 6.5V4.5h5v2M6 6.5l1 13.5h10l1-13.5" />
      <path d="M10 10.5v6M14 10.5v6" />
    </>
  ),
  prohibido: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.6 5.6l12.8 12.8" />
    </>
  ),
  calendario: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  grafico: <path d="M4 20h16M7 20v-6M12 20V8M17 20v-9" />,
  libro: (
    <>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5Z" />
      <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5Z" />
    </>
  ),
  llave: (
    <>
      <circle cx="7.5" cy="15.5" r="4" />
      <path d="m10.5 12.5 9-9M16 7l2.5 2.5M13.5 9.5l2 2" />
    </>
  ),
  cruz: <path d="M6 6l12 12M18 6 6 18" />,
  flechaArriba: <path d="M12 19V5M6 11l6-6 6 6" />,
  recargar: (
    <>
      <path d="M20 12a8 8 0 1 1-2.4-5.7" />
      <path d="M20 4v5h-5" />
    </>
  ),
  mas: <path d="M12 5v14M5 12h14" />,
  masCirculo: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  heladera: (
    <>
      <rect x="6" y="2.5" width="12" height="19" rx="2" />
      <path d="M6 9.5h12M9 5.5v2M9 12.5v3" />
    </>
  ),
  celular: (
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M11 18.5h2" />
    </>
  ),
  camara: (
    <>
      <path d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  bombilla: (
    <>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.4.3.5.7.5 1.1v.5h6V15c0-.4.2-.8.5-1.1A6 6 0 0 0 12 3Z" />
    </>
  ),
  pincel: (
    <>
      <path d="M19.5 3.5 11 12" />
      <path d="M11 12c-2.6-.4-4.6 1.2-4.6 3.8 0 1.4-.9 2.4-2.4 2.9 3.6 1.6 8.4.4 8.6-4.4L11 12Z" />
    </>
  ),
  reloj: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  exportar: (
    <>
      <path d="M12 15V3M7.5 7.5 12 3l4.5 4.5" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </>
  ),
  importar: (
    <>
      <path d="M12 3v12M7.5 10.5 12 15l4.5-4.5" />
      <path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
    </>
  ),
  chevron: <path d="m9 5 7 7-7 7" />,
  atras: <path d="m15 5-7 7 7 7" />,
} satisfies Record<string, JSX.Element>

export type NombreIcono = keyof typeof TRAZOS

const trazo = { fill: 'none', stroke: 'currentColor', 'stroke-width': 1.9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } as const

export function Icono({ nombre, tam = 20, color, class: clase }: { nombre: NombreIcono; tam?: number; color?: string; class?: string }) {
  return (
    <svg class={clase ? `icono-svg ${clase}` : 'icono-svg'} viewBox="0 0 24 24" width={tam} height={tam} aria-hidden="true"
      style={color ? { color } : undefined} {...trazo}>
      {TRAZOS[nombre]}
    </svg>
  )
}

export const iconoTarea: Record<TipoTarea, NombreIcono> = {
  machoPatio: 'alerta', cosecha: 'tijera', hongos: 'hongo', sexado: 'pregunta', machoPolen: 'flor', semillas: 'semilla',
  fertilizante: 'matraz', riego: 'gota', neem: 'destellos', secado: 'viento', curado: 'frasco',
}

export const iconoAccion: Record<AccionTarea, NombreIcono> = {
  regue: 'gota', fertilice: 'matraz', neem: 'destellos', hembra: 'hembra', macho: 'macho', moverAdentro: 'casa',
  juntePolen: 'flor', registrarSemillas: 'semilla', cosechar: 'tijera', aFrascos: 'frasco', abriFrascos: 'candado',
  terminar: 'check', revise: 'ojo', hoyNo: 'luna',
}

export const iconoRegistro: Record<TipoRegistro, NombreIcono> = {
  riego: 'gota', fertilizante: 'matraz', neem: 'destellos', nota: 'nota', problema: 'alerta', sexo: 'pregunta',
  polinizacion: 'flor', cosecha: 'tijera', secado: 'frasco', germinacion: 'brote', curado: 'candado', revision: 'ojo',
}

/** Color de cada tipo de registro en el historial (como en la app de iPhone). */
export const colorRegistro: Record<TipoRegistro, string> = {
  riego: 'var(--azul)', fertilizante: 'var(--verde)', neem: 'var(--teal)', nota: 'var(--texto-2)', problema: 'var(--alerta)',
  sexo: 'var(--texto-2)', polinizacion: 'var(--texto-2)', cosecha: 'var(--ambar)', secado: 'var(--ambar)',
  germinacion: 'var(--texto-2)', curado: 'var(--ambar)', revision: 'var(--texto-2)',
}

export const iconoAviso: Record<TipoAvisoClima, NombreIcono> = {
  lluvia: 'lluvia', llovio: 'gota', calor: 'termometro', frio: 'copo', hongos: 'hongo',
}

export const colorAviso: Record<TipoAvisoClima, string> = {
  lluvia: 'var(--azul)', llovio: 'var(--azul)', calor: 'var(--ambar)', frio: 'var(--teal)', hongos: 'var(--alerta)',
}

// Íconos de la barra de pestañas.
export function IconoPestania({ nombre }: { nombre: 'hoy' | 'plantas' | 'semillas' | 'asistente' | 'ajustes' }) {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" {...trazo}>
      {nombre === 'hoy' && TRAZOS.sol}
      {nombre === 'plantas' && (
        <>
          <path d="M12 21v-9" />
          <path d="M12 12C12 7.6 9 5 4.5 5c0 4.4 3 7 7.5 7Z" />
          <path d="M12 14.5c0-4.4 3-7 7.5-7 0 4.4-3 7-7.5 7Z" />
        </>
      )}
      {nombre === 'semillas' && TRAZOS.semilla}
      {nombre === 'asistente' && (
        <path d="M5 4.5h14a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-8.5L6 20.5v-3.5H5a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2Z" />
      )}
      {nombre === 'ajustes' && (
        <>
          <path d="M4 6.5h9M17 6.5h3M4 12h3M11 12h9M4 17.5h11M19 17.5h1" />
          <circle cx="15" cy="6.5" r="2" />
          <circle cx="9" cy="12" r="2" />
          <circle cx="17" cy="17.5" r="2" />
        </>
      )}
    </svg>
  )
}
