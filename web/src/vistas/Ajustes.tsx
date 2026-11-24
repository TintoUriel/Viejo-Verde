import { useSignal } from '@preact/signals'
import { useEffect, useState } from 'preact/hooks'
import { alVolver, borrarTodo, cambiar, datos, entrarModoEjemplo, modoEjemplo, salirModoEjemplo } from '../app/almacen'
import { aplicarBackup, elegirBackup, exportarBackup } from '../app/backup'
import { estaPersistido, pedirPersistencia } from '../app/db'
import { guardarSecretos, secretos, VERSION_APP } from '../app/servicios'
import { estadoSync, Sincronizador } from '../app/sincronizador'
import { avisar, confirmar, mostrar } from '../app/ui'
import { Contador, Encabezado, Girando, Interruptor, Seccion } from '../componentes'
import { Formato } from '../core/formato'
import { Icono } from '../iconos'
import { instalada } from './Instalar'

export function VistaAjustes() {
  const s = estadoSync.value
  return (
    <main class="pantalla ancha multicolumna">
      <Encabezado titulo="Ajustes" />
      <SeccionAsistente />
      <SeccionPlanilla />
      <SeccionFertilizantes />
      <SeccionBackup />
      <SeccionEjemplo />
      <SeccionPeligro />
      <SeccionAlmacenamiento />
      <Seccion pie={s.activada
        ? 'Tus datos quedan en este teléfono. Lo único que sale es lo que le mandás al asistente y lo que se anota en tu planilla de Google.'
        : 'Tus datos quedan solo en este teléfono. Lo único que sale es lo que le mandás al asistente.'}>
        <div class="fila"><span style={{ flex: 1 }}>Versión</span><span class="valor">{VERSION_APP}</span></div>
      </Seccion>
    </main>
  )
}

// ─── Asistente ───

function SeccionAsistente() {
  const [clave, setClave] = useState('')
  const guardada = secretos.value.apiKey !== undefined
  const limpia = clave.trim()
  return (
    <Seccion titulo="Asistente (Claude)"
      pie="Queda guardada solo en este teléfono, nunca en los backups. La conseguís en console.anthropic.com → API Keys.">
      {guardada ? (
        <>
          <div class="fila"><span class="con-icono" style={{ color: 'var(--verde)', fontWeight: 600 }}><Icono nombre="check" />API key guardada</span></div>
          <button class="fila accion peligro" onClick={async () => {
            if (await confirmar('¿Borrar la API key?', 'Borrar', { destructiva: true })) await guardarSecretos({ apiKey: undefined })
          }}>Borrar API key</button>
        </>
      ) : (
        <>
          <div class="fila">
            <input type="password" placeholder="sk-ant-…" aria-label="API key de Anthropic" autoComplete="off" autoCapitalize="off"
              spellcheck={false} value={clave} onInput={(e) => setClave((e.target as HTMLInputElement).value)} />
          </div>
          <button class="fila accion" disabled={limpia.length < 20} onClick={async () => {
            await guardarSecretos({ apiKey: limpia })
            setClave('')
            avisar('API key guardada')
          }}>Guardar API key</button>
        </>
      )}
    </Seccion>
  )
}

// ─── Planilla de Google ───

function SeccionPlanilla() {
  const s = estadoSync.value
  const ocupado = useSignal(false)

  const conCarga = async (tarea: () => Promise<string>, titulo = 'Planilla de Google') => {
    ocupado.value = true
    try {
      await mostrar(titulo, await tarea())
    } finally {
      ocupado.value = false
    }
  }

  return (
    <Seccion titulo="Planilla de Google"
      pie={'Sube y baja: cada cosa que registrás se anota en las hojas Registro y Plantas; el patio, dónde va cada planta y las dosis de las etiquetas van a la hoja Configuración. La planilla guarda además una copia completa de tus datos. Al abrir la app, si la copia de la planilla es más nueva, se baja sola. Las fotos quedan en cada teléfono; nunca se mandan fotos, la API key ni el chat. "Sincronizar todo" manda el historial completo: repetirlo no duplica nada.'}>
      {s.configurada ? (
        <>
          <div class="fila">
            <span style={{ flex: 1 }}>Sincronizar</span>
            <Interruptor etiqueta="Sincronizar" valor={s.activada} onCambio={async (v) => {
              await Sincronizador.cambiarActivada(v)
              if (v) await alVolver(true)
            }} />
          </div>
          <div class="fila"><span style={{ flex: 1 }}>Web App</span><span class="valor" style={{ fontSize: '14px' }}>{acortar(secretos.value.planillaURL ?? '')}</span></div>
          <div class="fila"><span style={{ flex: 1 }}>Última sincronización OK</span><span class="valor">{s.ultimoOK ? Formato.fechaHora(s.ultimoOK) : 'Nunca'}</span></div>
          <div class="fila">
            <span style={{ flex: 1 }}>Eventos pendientes</span>
            {s.enviando && <Girando />}
            <span class="valor">{s.pendientes}</span>
          </div>
          {s.ultimoError && <div class="fila"><span class="peligro-texto con-icono" style={{ fontSize: '14px' }}><Icono nombre="alerta" tam={18} />{s.ultimoError}</span></div>}
          <div class="fila">
            <span style={{ flex: 1 }}>Copia completa</span>
            <span class="valor">{s.copiaPendiente ? 'Cambios por subir' : 'Al día'}</span>
          </div>
          <div class="fila"><span style={{ flex: 1 }}>Última bajada</span><span class="valor">{s.ultimaBajada ? Formato.fechaHora(s.ultimaBajada) : 'Nunca'}</span></div>
          {s.avisoConfiguracion && <div class="fila"><span class="peligro-texto con-icono" style={{ fontSize: '14px' }}><Icono nombre="alerta" tam={18} />{s.avisoConfiguracion}</span></div>}
          {s.errorCopia && <div class="fila"><span class="peligro-texto con-icono" style={{ fontSize: '14px' }}><Icono nombre="alerta" tam={18} />{s.errorCopia}</span></div>}
          {s.progreso && <div class="fila"><Girando /><span style={{ fontSize: '14px' }}>{s.progreso}</span></div>}
          <button class="fila accion" disabled={s.enviando || ocupado.value} onClick={() => conCarga(() => Sincronizador.probarConexion())}>
            Probar conexión
          </button>
          <button class="fila accion" disabled={!s.activada || ocupado.value || modoEjemplo.value}
            onClick={() => conCarga(async () => {
              const r = await Sincronizador.bajarCopia(true)
              return {
                bajado: 'Listo: bajé la copia de la planilla.',
                reconstruido: 'Listo: rearmé tus datos con lo que había en la planilla.',
                subido: 'Lo de este teléfono era más nuevo: lo subí a la planilla.',
                nada: 'Ya estaba todo al día.',
                error: estadoSync.value.errorCopia ?? 'No pude bajar la copia.',
                omitido: 'Activá la sincronización primero.',
              }[r]
            })}>
            <Icono nombre="importar" />Bajar de la planilla ahora
          </button>
          <button class="fila accion" disabled={!s.activada || s.enviando || ocupado.value || modoEjemplo.value}
            onClick={() => conCarga(() => Sincronizador.sincronizarTodo(datos.value, new Date()))}>
            Sincronizar todo
          </button>
        </>
      ) : (
        <div class="fila"><span class="secundario">Se conecta sola cuando entrás con la contraseña.</span></div>
      )}
    </Seccion>
  )
}

/** "script.google.com/…AbC123/exec". */
function acortar(url: string): string {
  try {
    return `${new URL(url).host}/…${url.slice(-16)}`
  } catch {
    return url
  }
}

// ─── Fertilizantes ───

function SeccionFertilizantes() {
  const c = datos.value.config
  return (
    <Seccion titulo="Fertilizantes" pie="Copiá la dosis que dice cada botella. La app siempre calcula la mitad.">
      <div class="fila">
        <div class="principal">
          <span>Top Veg: {Formato.numero(c.topVegEtiquetaMlPorLitro)} ml/L en la etiqueta</span>
          <span class="secundario">La app usa {Formato.numero(c.topVegEtiquetaMlPorLitro / 2)} ml/L</span>
        </div>
        <Contador valor={c.topVegEtiquetaMlPorLitro} min={0.5} max={20} paso={0.5} texto=" "
          onCambio={(v) => cambiar((d) => { d.config.topVegEtiquetaMlPorLitro = v })} />
      </div>
      <div class="fila">
        <div class="principal">
          <span>Top Bloom: {Formato.numero(c.topBloomEtiquetaMlPorLitro)} ml/L en la etiqueta</span>
          <span class="secundario">La app usa {Formato.numero(c.topBloomEtiquetaMlPorLitro / 2)} ml/L</span>
        </div>
        <Contador valor={c.topBloomEtiquetaMlPorLitro} min={0.5} max={20} paso={0.5} texto=" "
          onCambio={(v) => cambiar((d) => { d.config.topBloomEtiquetaMlPorLitro = v })} />
      </div>
    </Seccion>
  )
}

// ─── Backup ───

function SeccionBackup() {
  const [conFotos, setConFotos] = useState(true)
  const ocupado = useSignal(false)

  const exportar = async () => {
    ocupado.value = true
    try {
      const r = await exportarBackup(conFotos)
      if (r !== 'cancelado') avisar(r === 'compartido' ? 'Backup listo' : 'Backup descargado')
    } catch (e) {
      await mostrar('Backup', `No pude armar el backup: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      ocupado.value = false
    }
  }

  const importar = async () => {
    let b
    try {
      b = await elegirBackup()
    } catch {
      await mostrar('Backup', 'No pude leer ese archivo: no parece un backup de Viejo Verde.')
      return
    }
    if (!b) return
    const ok = await confirmar('¿Reemplazar tus datos con este backup?', 'Reemplazar todo', {
      destructiva: true,
      mensaje: `El backup del ${Formato.fechaCorta(b.exportado)} tiene ${b.datos.plantas.length} plantas, ${b.datos.paquetes.length} packs y ${Object.keys(b.fotos).length} fotos. Lo que tenés ahora se pierde.`,
    })
    if (!ok) return
    ocupado.value = true
    try {
      await aplicarBackup(b)
      await mostrar('Backup importado', `${b.datos.plantas.length} plantas.` +
        (estadoSync.value.activada ? ' Para que la planilla quede igual, tocá "Sincronizar todo".' : ''))
    } catch (e) {
      await mostrar('Backup', `No pude importarlo: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      ocupado.value = false
    }
  }

  return (
    <Seccion titulo="Backup"
      pie="Es un archivo JSON, el mismo formato que la app de iPhone: sirve para pasar tus datos de una a la otra. Guardalo en Archivos, iCloud Drive o mandátelo por mensaje.">
      <div class="fila">
        <span style={{ flex: 1 }}>Incluir fotos</span>
        <Interruptor etiqueta="Incluir fotos" valor={conFotos} onCambio={setConFotos} />
      </div>
      <button class="fila accion" disabled={ocupado.value} onClick={exportar}><Icono nombre="exportar" />Exportar backup</button>
      <button class="fila accion" disabled={ocupado.value} onClick={importar}><Icono nombre="importar" />Importar backup</button>
      {ocupado.value && <div class="fila"><Girando /><span class="secundario">Trabajando…</span></div>}
    </Seccion>
  )
}

// ─── Ejemplo y borrar todo ───

function SeccionEjemplo() {
  return (
    <Seccion titulo="Probar la app" pie="El ejemplo usa un espacio aparte: tus datos reales no se tocan y nada va a la planilla.">
      {modoEjemplo.value
        ? <button class="fila accion" onClick={() => void salirModoEjemplo()}>Salir del ejemplo</button>
        : <button class="fila accion" onClick={() => void entrarModoEjemplo()}>Cargar datos de ejemplo</button>}
    </Seccion>
  )
}

function SeccionPeligro() {
  return (
    <Seccion pie="La API key y la planilla no se borran con esto.">
      <button class="fila accion peligro" onClick={async () => {
        if (await confirmar('¿Borrar todo?', 'Borrar plantas, semillas, polen y fotos',
          { destructiva: true, mensaje: 'No se puede deshacer. Si querés, primero exportá un backup.' })) {
          await borrarTodo()
          avisar('Datos borrados')
        }
      }}>Borrar todos los datos</button>
    </Seccion>
  )
}

function SeccionAlmacenamiento() {
  const persistido = useSignal<boolean | undefined>(undefined)
  useEffect(() => { estaPersistido().then((v) => { persistido.value = v }) }, [])
  const app = instalada()
  return (
    <Seccion titulo="Este teléfono"
      pie={app ? 'Si borrás el ícono de la pantalla de inicio, se borran también los datos: antes exportá un backup.'
        : 'Abrila desde el ícono de la pantalla de inicio: en Safari, el iPhone puede borrar los datos de las páginas que no visitás seguido.'}>
      <div class="fila"><span style={{ flex: 1 }}>Instalada en la pantalla de inicio</span><span class="valor">{app ? 'Sí' : 'No'}</span></div>
      <div class="fila">
        <span style={{ flex: 1 }}>Datos protegidos contra borrado</span>
        <span class="valor">{persistido.value === undefined ? '…' : persistido.value ? 'Sí' : 'No'}</span>
      </div>
      {persistido.value === false && (
        <button class="fila accion" onClick={async () => {
          persistido.value = await pedirPersistencia()
          if (!persistido.value) avisar('El navegador no lo permitió (instalala primero)')
        }}>Pedir protección</button>
      )}
    </Seccion>
  )
}
