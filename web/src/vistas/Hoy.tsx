import { useSignal } from '@preact/signals'
import {
  actualizarClima, avisosClima, climaVigente, cupo, datos, ejecutarTarea, hoy, regarTodas, tareas,
} from '../app/almacen'
import { ir } from '../app/router'
import { avisar } from '../app/ui'
import { BotonGrande, Girando, Pastilla, Tarjeta } from '../componentes'
import { AnalisisClima, diaClima, diaClimaDesde, type DiaClima } from '../core/clima'
import { Temporada } from '../core/consejos'
import { Formato } from '../core/formato'
import { nombreFertilizante } from '../core/modelos'
import { tituloAccion, type AccionTarea, type Tarea } from '../core/tareas'
import { redondear } from '../core/util'
import { colorAviso, Icono, iconoAccion, iconoAviso, iconoTarea, type NombreIcono } from '../iconos'
import { AvisoInstalar } from './Instalar'
import { PatioInicio } from './PatioInicio'

export function VistaHoy() {
  const consejo = Temporada.consejo(hoy.value)
  return (
    <main class="pantalla ancha hoy">
      <Tablero />
      <div class="columnas hoy-cols">
        <div class="col col-fija"><PatioInicio /></div>
        <div class="col">
          <AvisoInstalar />
          <TarjetaClima />
          <Tarjeta fondo="ambar" class="consejo">
            <span class="icono-consejo"><Icono nombre="calendario" tam={20} /></span>
            <div class="cuerpo">
              <h3>{consejo.titulo}</h3>
              <p class="texto">{consejo.texto}</p>
            </div>
          </Tarjeta>
          <ListaTareas />
          <button class="boton-ancho" onClick={() => ir('planificar')}><Icono nombre="calendario" />Planificar la próxima tanda</button>
        </div>
      </div>
    </main>
  )
}

// ─── Tablero: el día, lo pendiente y el cupo REPROCANN ───

function Tablero() {
  const c = cupo.value
  const n = tareas.value.length
  const sinPlantas = datos.value.plantas.length === 0
  return (
    <header class="tablero">
      <Icono nombre="hoja" tam={190} class="fondo-hoja" />
      <p class="fecha">{Formato.mayusculaInicial(Formato.fechaLarga(hoy.value))}</p>
      <h1>
        {sinPlantas ? 'Arrancá tu cultivo'
          : n === 0 ? 'Todo al día'
          : <><span class="cifra">{n}</span> {n === 1 ? 'cosa para hacer hoy' : 'cosas para hacer hoy'}</>}
      </h1>
      <div class="cifras-hoy">
        <CifraHoy numero={String(c.activas)} texto="Activas" />
        <CifraHoy numero={`${c.enFlor}/${c.limite}`} texto="En flor" color={c.excedido ? '#ff9c8c' : undefined} />
        <CifraHoy numero={String(c.secando)} texto="Secando" color="#f3c26b" />
        <CifraHoy numero={String(c.curando)} texto="Curando" color="#f3c26b" />
      </div>
      {c.excedido && (
        <p class="exceso"><Icono nombre="prohibido" tam={18} />Te pasaste del cupo REPROCANN: {c.enFlor} plantas en flor (máximo {c.limite}).</p>
      )}
    </header>
  )
}

function CifraHoy(p: { numero: string; texto: string; color?: string }) {
  return (
    <div class="cifra-hoy" style={p.color ? { '--c': p.color } : undefined}>
      <span class="numero">{p.numero}</span>
      <span class="texto">{p.texto}</span>
    </div>
  )
}

// ─── Tareas ───

function ListaTareas() {
  const lista = tareas.value
  const riegos = lista.filter((t) => t.tipo === 'riego')
  return (
    <>
      <h2 class="subtitulo">Para hacer</h2>
      {datos.value.plantas.length === 0 ? (
        <Tarjeta>
          <h3><Icono nombre="brote" />Todavía no cargaste plantas</h3>
          <p class="nota">Andá a la pestaña Plantas y tocá + para agregar la primera.</p>
        </Tarjeta>
      ) : lista.length === 0 ? (
        <Tarjeta>
          <h3 style={{ color: 'var(--verde)' }}><Icono nombre="check" />Nada pendiente por hoy</h3>
          <p class="nota">Igual date una vuelta por el patio y mirá las hojas.</p>
        </Tarjeta>
      ) : (
        <>
          {riegos.length >= 2 && (
            <BotonGrande titulo={`Regué las ${riegos.length}`} icono="gota" color="azul" onClick={() => {
              regarTodas(riegos)
              avisar(`Riego registrado en ${riegos.length} plantas`)
            }} />
          )}
          {lista.map((t) => <TarjetaTarea key={t.id} tarea={t} />)}
        </>
      )}
    </>
  )
}

const CONFIRMACION: Partial<Record<AccionTarea, string>> = {
  regue: 'Riego registrado', fertilice: 'Fertilizante registrado', neem: 'Neem registrado', hembra: 'Marcada como hembra',
  macho: 'Marcado como macho', moverAdentro: 'Ahora está adentro', juntePolen: 'Polen guardado', abriFrascos: 'Apertura registrada',
  terminar: 'Curado terminado', revise: 'Revisión registrada',
}

export function TarjetaTarea({ tarea }: { tarea: Tarea }) {
  const principales = tarea.acciones.filter((a) => a !== 'hoyNo')
  const color = tarea.urgente ? 'alerta' : 'verde'
  const tocar = (a: AccionTarea) => {
    if (ejecutarTarea(a, tarea) && CONFIRMACION[a]) avisar(`${CONFIRMACION[a]}: ${tarea.plantaNombre}`)
  }
  return (
    <Tarjeta fondo={tarea.urgente ? 'alerta' : undefined} class={`tarea${tarea.urgente ? ' urgente' : ''}`}>
      <button class="cabeza" onClick={() => ir(`planta/${tarea.plantaID}`)}>
        <span class="icono"><Icono nombre={iconoTarea[tarea.tipo]} tam={24} /></span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <div class="titulo">{tarea.titulo}</div>
          <div class="detalle">{tarea.detalle}</div>
        </span>
        <span class="chevron" aria-hidden="true">›</span>
      </button>
      {tarea.dosis && (
        <div class="pastillas">
          <Pastilla icono="gota" texto={Formato.volumen(tarea.dosis.aguaML)} color="azul" />
          {tarea.dosis.fertilizante && (
            <Pastilla icono="matraz" texto={`${Formato.numero(tarea.dosis.fertilizanteML)} ml ${nombreFertilizante[tarea.dosis.fertilizante]}`} />
          )}
        </div>
      )}
      <div class="fila-botones">
        {principales.map((a, i) => (
          <BotonGrande key={a} titulo={tituloAccion[a]} icono={iconoAccion[a]} color={color} relleno={i === 0} onClick={() => tocar(a)} />
        ))}
      </div>
      {tarea.acciones.includes('hoyNo') && (
        <button class="hoy-no" onClick={() => tocar('hoyNo')}><Icono nombre="luna" tam={16} />Hoy no</button>
      )}
    </Tarjeta>
  )
}

// ─── Clima ───

function TarjetaClima() {
  const cargando = useSignal(false)
  const p = climaVigente.value
  const h = p ? diaClima(p, hoy.value) : undefined
  const m = p ? diaClimaDesde(p, 1, hoy.value) : undefined

  const actualizar = async () => {
    cargando.value = true
    const ok = await actualizarClima(true)
    cargando.value = false
    if (!ok) avisar('No pude bajar el pronóstico')
  }

  return (
    <Tarjeta>
      {h ? (
        <>
          <div class="clima-hoy">
            <span class="icono" style={{ color: colorClima(h) }}><Icono nombre={iconoClima(h)} tam={38} /></span>
            <div style={{ flex: 1 }}>
              <div class="temp">{temperaturas(h)}</div>
              {h.humedad !== undefined && <div class="nota">Humedad {redondear(h.humedad)} %</div>}
            </div>
            <button class="boton-icono" aria-label="Actualizar el pronóstico" onClick={actualizar} disabled={cargando.value}
              >{cargando.value ? <Girando /> : <Icono nombre="recargar" tam={22} />}</button>
          </div>
          {m && <p class="nota">Mañana: {temperaturas(m)}</p>}
          {avisosClima.value.map((a) => (
            <div class="aviso-clima" key={a.tipo} style={{ '--c': colorAviso[a.tipo] }}>
              <div class="titulo con-icono" style={{ color: colorAviso[a.tipo] }}><Icono nombre={iconoAviso[a.tipo]} tam={18} />{a.titulo}</div>
              <div class="texto">{a.texto}</div>
            </div>
          ))}
        </>
      ) : (
        <>
          <div class="clima-hoy">
            <span class="icono" style={{ color: 'var(--texto-2)' }}><Icono nombre="nube" tam={38} /></span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 650 }}>Sin pronóstico</div>
              <div class="nota">Con internet, la app ajusta el riego si llueve o hace calor.</div>
            </div>
            <button class="boton-texto" onClick={actualizar} disabled={cargando.value}>{cargando.value ? <Girando /> : 'Reintentar'}</button>
          </div>
        </>
      )}
    </Tarjeta>
  )
}

function temperaturas(d: DiaClima): string {
  if (d.minC !== undefined && d.maxC !== undefined) return `${Formato.numero(redondear(d.minC))}° / ${Formato.numero(redondear(d.maxC))}°`
  if (d.maxC !== undefined) return `máx ${Formato.numero(redondear(d.maxC))}°`
  return '—'
}

function iconoClima(d: DiaClima): NombreIcono {
  if (d.lluviaMM >= 5) return 'lluvia'
  if (d.lluviaMM >= 0.5) return 'llovizna'
  if ((d.maxC ?? 0) >= AnalisisClima.calorFuerte) return 'sol'
  if ((d.humedad ?? 0) >= 85) return 'nube'
  return 'solNube'
}

function colorClima(d: DiaClima): string {
  if (d.lluviaMM >= 0.5) return 'var(--azul)'
  if ((d.humedad ?? 0) >= 85 && (d.maxC ?? 0) < AnalisisClima.calorFuerte) return 'var(--texto-2)'
  return 'var(--ambar)'
}
