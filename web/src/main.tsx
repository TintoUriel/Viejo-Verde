import { signal } from '@preact/signals'
import { render } from 'preact'
import { useLayoutEffect } from 'preact/hooks'
import { registerSW } from 'virtual:pwa-register'
import { alVolver, cargado, cargar, modoEjemplo, salirModoEjemplo, tareas, ultimoError } from './app/almacen'
import { cargarAcceso, desbloqueada } from './app/acceso'
import { irAPestania, pestania, PESTANIAS, ruta, scrollGuardado, type Pestania } from './app/router'
import { Superpuestos } from './componentes'
import { Icono, IconoPestania } from './iconos'
import './estilos.css'
import { VistaAjustes } from './vistas/Ajustes'
import { VistaAsistente } from './vistas/Asistente'
import { PantallaContrasenia } from './vistas/Contrasenia'
import { VistaCosechas } from './vistas/Cosechas'
import { DetallePlanta } from './vistas/DetallePlanta'
import { VistaHoy } from './vistas/Hoy'
import { VistaLineaTiempo } from './vistas/LineaTiempo'
import { VistaPatio } from './vistas/Patio'
import { VistaPlanificador } from './vistas/Planificador'
import { VistaPlantas } from './vistas/Plantas'
import { VistaSemillas } from './vistas/Semillas'

// ─── Versión nueva ───
// Con internet, el teléfono baja la versión nueva en segundo plano; se aplica cuando tocás "Actualizar"
// (así no se recarga sola en el medio de un formulario).

const hayVersionNueva = signal(false)
const actualizar = registerSW({
  onNeedRefresh: () => { hayVersionNueva.value = true },
  onRegisteredSW: (_url, registro) => {
    if (!registro) return
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void registro.update().catch(() => undefined)
    })
  },
})

// ─── Volver a la app ───

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && cargado.value) alVolver()
})
window.addEventListener('online', () => { if (cargado.value) alVolver() })

// ─── Pantallas ───

const NOMBRES: Record<Pestania, string> = { hoy: 'Hoy', plantas: 'Plantas', semillas: 'Semillas', asistente: 'Asistente', ajustes: 'Ajustes' }

function Pantalla({ r }: { r: string }) {
  const partes = r.split('/')
  switch (partes[0]) {
    case 'hoy': return <VistaHoy />
    case 'plantas': return <VistaPlantas />
    case 'semillas': return <VistaSemillas />
    case 'asistente': return <VistaAsistente />
    case 'ajustes': return <VistaAjustes />
    case 'planificar': return <VistaPlanificador />
    case 'cosechas': return <VistaCosechas />
    case 'patio': return <VistaPatio />
    case 'planta':
      if (partes[1] && partes[2] === 'fotos') return <VistaLineaTiempo id={partes[1]} />
      if (partes[1]) return <DetallePlanta key={partes[1]} id={partes[1]} />
      return <VistaPlantas />
    default: return <VistaHoy />
  }
}

function App() {
  const r = ruta.value
  // Al cambiar de pantalla: vuelve a donde estabas (o arriba de todo si es nueva).
  useLayoutEffect(() => { window.scrollTo(0, scrollGuardado(r)) }, [r])

  if (!cargado.value || desbloqueada.value === undefined) return <div class="cargando">Cargando…</div>
  if (!desbloqueada.value) return <><PantallaContrasenia /><Superpuestos /></>
  const n = tareas.value.length
  return (
    <>
      {hayVersionNueva.value && (
        <div class="banner ejemplo">
          <span>Hay una versión nueva de la app.</span>
          <button onClick={() => void actualizar(true)}>Actualizar</button>
        </div>
      )}
      {modoEjemplo.value && (
        <div class="banner ejemplo">
          <Icono nombre="matraz" tam={18} /><span>Modo ejemplo: estos datos no son tuyos</span>
          <button onClick={() => void salirModoEjemplo()}>Salir</button>
        </div>
      )}
      {ultimoError.value && <div class="banner error"><span>{ultimoError.value}</span></div>}
      <Pantalla r={r} />
      <nav class="tabbar" aria-label="Secciones">
        {PESTANIAS.map((p) => (
          <button key={p} class={pestania.value === p ? 'activa' : ''} aria-current={pestania.value === p ? 'page' : undefined}
            onClick={() => irAPestania(p)}>
            <IconoPestania nombre={p} />
            {NOMBRES[p]}
            {p === 'hoy' && n > 0 && <span class="insignia" aria-label={`${n} tareas`}>{n}</span>}
          </button>
        ))}
      </nav>
      <Superpuestos />
    </>
  )
}

render(<App />, document.getElementById('app')!)
void cargarAcceso()
void cargar()
