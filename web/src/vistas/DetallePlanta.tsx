import { useSignal } from '@preact/signals'
import { borrarPlanta, cambiar, climaVigente, datos, dosisDe, ejecutar, estadoDe, hoy, pedidoActual } from '../app/almacen'
import { elegirFoto, Fotos } from '../app/fotos'
import { copiar } from '../app/portapapeles'
import { ir, reemplazar } from '../app/router'
import { avisar, confirmar } from '../app/ui'
import { Barra, BarraEtapas, BotonGrande, fotoAbierta, Miniatura, Pastilla, Segmentos, Tarjeta, Vacio } from '../componentes'
import { Calendario } from '../core/calendario'
import { consejosEtapa } from '../core/consejos'
import { D, planta as buscar } from '../core/datos'
import { textoAgua, type Dosis } from '../core/dosis'
import { lineaDeTiempo } from '../core/estadisticas'
import { Historia } from '../core/historia'
import { nombreEtapa, semana, type Etapa, type EstadoEtapa } from '../core/etapas'
import { Formato } from '../core/formato'
import {
  historial, nombreFertilizante, nombreSexo, nombreTipoPlanta, nombreTipoRegistro, nombreTipoSemilla, nombreUbicacion,
  SEXOS, type Planta, type Registro, type Sexo,
} from '../core/modelos'
import { Planificador } from '../core/planificador'
import { Tareas, type AccionTarea } from '../core/tareas'
import { colorRegistro, Icono, iconoRegistro } from '../iconos'
import { FormPlanta } from './FormPlanta'
import { EditarRegistro, NuevaNota, PHDrenaje, riegosRecientes } from './Registros'

const estiloEtapa = (e: Etapa) => ({ '--ce': `var(--e-${e})` })

export function DetallePlanta({ id }: { id: string }) {
  const editando = useSignal(false)
  const nota = useSignal(false)
  const ph = useSignal(false)
  const registro = useSignal<Registro | undefined>(undefined)
  const p = buscar(datos.value, id)

  if (!p) {
    return (
      <main class="pantalla">
        <Barra titulo="" atras="plantas" textoAtras="Plantas" />
        <Vacio icono="hoja" titulo="La planta ya no existe" />
      </main>
    )
  }
  const e = estadoDe(p)

  return (
    <main class="pantalla ancha">
      <Barra titulo={p.nombre} atras="plantas" textoAtras="Atrás"
        acciones={<button class="boton-texto" onClick={() => { editando.value = true }}>Editar</button>} />
      <Cabecera p={p} e={e} />
      <div class="columnas planta-cols">
        <div class="col">
          {p.estado === 'activa' && (
            <>
              <DosisDeHoy p={p} />
              <AccionesRapidas p={p} e={e} onNota={() => { nota.value = true }} onPH={() => { ph.value = true }} />
            </>
          )}
          <Tarjeta fondo="verde">
            <h3><Icono nombre="bombilla" />Consejos de {nombreEtapa[e.etapa].toLowerCase()}</h3>
            <ul class="lista-puntos">{consejosEtapa(e.etapa).map((c) => <li key={c}>{c}</li>)}</ul>
          </Tarjeta>
          {p.estado === 'activa' && p.semilla === 'regular' && <SexoPlanta p={p} />}
          <PolenYSemillas p={p} e={e} />
        </div>
        <div class="col">
          <FlujoCosecha p={p} />
          <FotosPlanta p={p} />
          <Historial p={p} onEditar={(r) => { registro.value = r }} />
          <ZonaPeligrosa p={p} />
        </div>
      </div>

      {editando.value && <FormPlanta editando={p} onCerrar={() => { editando.value = false }} />}
      {nota.value && <NuevaNota plantaID={p.id} onCerrar={() => { nota.value = false }} />}
      {ph.value && <PHDrenaje planta={p} onCerrar={() => { ph.value = false }} />}
      {registro.value && <EditarRegistro plantaID={p.id} registro={registro.value} onCerrar={() => { registro.value = undefined }} />}
    </main>
  )
}

const CONFIRMACION: Partial<Record<AccionTarea, string>> = {
  regue: 'Riego registrado', fertilice: 'Fertilizante registrado', neem: 'Neem registrado', moverAdentro: 'Ahora está adentro',
  juntePolen: 'Polen guardado', abriFrascos: 'Apertura registrada', terminar: 'Curado terminado',
}

function accion(a: AccionTarea, id: string, dosis?: Dosis) {
  const d = dosis && { aguaML: dosis.aguaML, fertilizante: dosis.fertilizante, fertilizanteML: dosis.fertilizanteML, mlPorLitro: dosis.mlPorLitro }
  if (ejecutar(a, id, { dosis: d }) && CONFIRMACION[a]) avisar(CONFIRMACION[a]!)
}

// ─── Cabecera ───

function Cabecera({ p, e }: { p: Planta; e: EstadoEtapa }) {
  const partes = [p.variedad === '' ? undefined : p.variedad, nombreTipoPlanta[p.tipo], nombreTipoSemilla[p.semilla]]
  if (p.semilla === 'regular') partes.push(nombreSexo[p.sexo])
  partes.push(nombreUbicacion[p.ubicacion], `${Formato.numero(p.litrosMaceta)} L`, `germinó el ${Formato.fechaCorta(p.fechaGerminacion)}`)
  return (
    <Tarjeta class="cabecera-planta" style={estiloEtapa(e.etapa)}>
      <div class="linea">
        <div class="izq">
          <span class="etapa">{nombreEtapa[e.etapa]}</span>
          <p class="nota">{partes.filter(Boolean).join(' · ')}</p>
        </div>
        {p.estado === 'activa' && (
          <div class="dia-grande" aria-label={`Día ${e.dia}, semana ${semana(e)}`}>
            <span class="n">{e.dia}</span>
            <span class="u">días · sem {semana(e)}</span>
          </div>
        )}
      </div>
      <BarraEtapas estado={e} />
      {p.estado === 'activa' && p.sexo !== 'macho' && (
        <p class="nota con-icono" style={{ color: 'var(--ambar)' }}><Icono nombre="calendario" tam={16} />Cosecha estimada desde el {Formato.fechaCorta(Planificador.cosechaEstimadaDe(p))}</p>
      )}
      {p.estado === 'secando' && <p style={{ fontWeight: 620 }}>Secando hace {e.diaEnEtapa} días</p>}
      {p.estado === 'curando' && <p style={{ fontWeight: 620 }}>En frascos hace {e.diaEnEtapa} días</p>}
      <button class="copiar-historia" onClick={() => void copiarHistoria(p)}>
        <Icono nombre="copiar" tam={18} />
        <span><b>Copiar su historia para una IA</b><small>Todo lo que le pasó, listo para pegar y pedir un diagnóstico</small></span>
      </button>
    </Tarjeta>
  )
}

async function copiarHistoria(p: Planta) {
  const texto = Historia.texto(p, datos.value, new Date(), climaVigente.value)
  avisar(await copiar(texto) ? 'Copiada: pegala en el chat de la IA' : 'No pude copiar: probá de nuevo', 2600)
}

// ─── Dosis de hoy ───

function DosisDeHoy({ p }: { p: Planta }) {
  const d = dosisDe(p)
  return (
    <Tarjeta>
      <h3 style={{ color: 'var(--azul)' }}><Icono nombre="gota" />Si toca regar hoy</h3>
      <div class="pastillas">
        <Pastilla icono="gota" texto={textoAgua(d)} color="azul" />
        {d.fertilizante
          ? <Pastilla icono="matraz" texto={`${Formato.numero(d.fertilizanteML)} ml ${nombreFertilizante[d.fertilizante]}`} />
          : <Pastilla icono="gota" texto="Solo agua" color="gris" />}
      </div>
      {d.fertilizante && (
        <p class="nota">
          {Formato.numero(d.mlPorLitro)} ml de {nombreFertilizante[d.fertilizante]} por litro (mitad de la etiqueta), cada {Tareas.diasEntreFertilizantes}+ días.
        </p>
      )}
      <p class="nota">Antes, levantá la maceta: si pesa, no hace falta.</p>
    </Tarjeta>
  )
}

// ─── Acciones rápidas ───

function AccionesRapidas({ p, e, onNota, onPH }: { p: Planta; e: EstadoEtapa; onNota: () => void; onPH: () => void }) {
  const d = dosisDe(p)
  const hayRiegos = riegosRecientes(p).length > 0
  const neemPermitido = e.etapa === 'plantula' || e.etapa === 'crecimiento' || e.etapa === 'prefloracion'
  return (
    <div class="seccion" style={{ gap: '8px' }}>
      <h2 class="subtitulo" style={{ margin: '0 0 2px' }}>Registrar</h2>
      <div class="grilla-botones">
        <BotonGrande titulo="Regué" icono="gota" color="azul" onClick={() => accion('regue', p.id, d)} />
        <BotonGrande titulo={d.fertilizante ? `Fertilicé (${nombreFertilizante[d.fertilizante]})` : 'Fertilicé'} icono="matraz"
          disabled={!d.fertilizante} onClick={() => accion('fertilice', p.id, d)} />
        <BotonGrande titulo="Neem" icono="destellos" color="teal" disabled={!neemPermitido} onClick={() => accion('neem', p.id)} />
        <BotonGrande titulo="Nota o problema" icono="nota" color="ambar" relleno={false} onClick={onNota} />
        <BotonGrande titulo="Foto" icono="camara" color="ambar" relleno={false} onClick={() => void agregarFoto(p.id)} />
        <BotonGrande titulo="pH del drenaje" icono="tiraPH" color="azul" relleno={false} disabled={!hayRiegos} onClick={onPH} />
      </div>
      {!neemPermitido
        ? <p class="nota">Nada de neem desde la floración: no se rocían los cogollos.</p>
        : !d.fertilizante && <p class="nota">Hoy toca solo agua, sin fertilizante.</p>}
    </div>
  )
}

async function agregarFoto(id: string) {
  const archivo = await elegirFoto()
  if (!archivo) return
  try {
    const nombre = await Fotos.guardar(archivo)
    cambiar((d) => D.agregarFoto(d, nombre, id))
    avisar('Foto guardada')
  } catch (e) {
    avisar(e instanceof Error ? e.message : 'No pude guardar la foto')
  }
}

// ─── Sexo ───

function SexoPlanta({ p }: { p: Planta }) {
  const cambio = (nuevo: Sexo) => {
    if (nuevo !== p.sexo) cambiar((d) => D.marcarSexo(d, nuevo, p.id, new Date()))
  }
  return (
    <Tarjeta>
      <h3><Icono nombre="pregunta" />Sexo</h3>
      <Segmentos opciones={SEXOS.map((s) => [s, nombreSexo[s]] as const)} valor={p.sexo} onCambio={cambio} />
      {p.sexo === 'macho' && p.ubicacion === 'patio' ? (
        <>
          <p class="peligro-texto con-icono"><Icono nombre="alerta" />Es macho y está en el patio: alejalo de las hembras.</p>
          <BotonGrande titulo="Lo llevé adentro" icono="casa" color="alerta" onClick={() => accion('moverAdentro', p.id)} />
        </>
      ) : p.sexo === 'desconocido' && (
        <p class="nota">Desde el día 21: pelitos blancos = hembra; bolitas colgando = macho.</p>
      )}
    </Tarjeta>
  )
}

// ─── Polen y semillas ───

function PolenYSemillas({ p, e }: { p: Planta; e: EstadoEtapa }) {
  const hembraEnFlor = p.estado === 'activa' && p.sexo === 'hembra' &&
    (['prefloracion', 'floracion', 'maduracion', 'listaCosecha'] as Etapa[]).includes(e.etapa)
  const machoAdentro = p.estado === 'activa' && p.sexo === 'macho' && p.ubicacion === 'interior'
  if (!hembraEnFlor && !machoAdentro && !p.fechaPolinizacion) return null
  const polinizar = async () => {
    if (await confirmar(`¿Polinizaste una rama de ${p.nombre}?`, 'Sí, polinicé una rama',
      { mensaje: 'En 35 días te recuerdo revisar las semillas (en Hoy).' })) {
      cambiar((d) => D.polinizar(d, p.id, new Date()))
      avisar('Polinización registrada')
    }
  }
  const dias = p.fechaPolinizacion ? Calendario.dias(p.fechaPolinizacion, hoy.value) : 0
  return (
    <Tarjeta>
      <h3><Icono nombre="flor" />Polen y semillas</h3>
      {machoAdentro && (
        <>
          <p class="texto">{p.polenJuntado ? 'Ya juntaste polen de este macho.'
            : 'Cuando las bolitas empiecen a abrirse, cortá 2–3 ramas y juntá el polen.'}</p>
          <BotonGrande titulo="Junté polen" icono="flor" relleno={!p.polenJuntado} onClick={() => accion('juntePolen', p.id)} />
        </>
      )}
      {p.fechaPolinizacion && (
        <>
          <p class="texto">
            Polinizada el {Formato.fechaCorta(p.fechaPolinizacion)} (hace {dias} días). Semillas listas a partir del
            día {Tareas.diasSemillas}, cuando están marrones o atigradas.
          </p>
          <BotonGrande titulo="Registrar semillas propias" icono="semilla" relleno={dias >= Tareas.diasSemillas}
            onClick={() => { pedidoActual.value = { tipo: 'semillas', plantaID: p.id } }} />
        </>
      )}
      {hembraEnFlor && <BotonGrande titulo="Polinicé una rama" icono="pincel" color="ambar" relleno={false} onClick={polinizar} />}
    </Tarjeta>
  )
}

// ─── Cosecha → secado → curado → terminada ───

function FlujoCosecha({ p }: { p: Planta }) {
  switch (p.estado) {
    case 'activa':
      if (p.sexo === 'macho') return null
      return (
        <Tarjeta>
          <h3><Icono nombre="tijera" />Cosecha</h3>
          <p class="nota">Cuando los tricomas estén mayoría lechosos con algunos ámbar.</p>
          <BotonGrande titulo="Cosechar" icono="tijera" color="ambar" onClick={() => { pedidoActual.value = { tipo: 'cosechar', plantaID: p.id } }} />
        </Tarjeta>
      )
    case 'secando':
      return (
        <Tarjeta>
          <DatosCosecha p={p} />
          <BotonGrande titulo="Pasar a frascos" icono="frasco" color="ambar" onClick={() => { pedidoActual.value = { tipo: 'aFrascos', plantaID: p.id } }} />
        </Tarjeta>
      )
    case 'curando':
      return (
        <Tarjeta>
          <DatosCosecha p={p} />
          <div class="fila-botones">
            <BotonGrande titulo="Abrí los frascos" icono="candado" color="ambar" onClick={() => accion('abriFrascos', p.id)} />
            <BotonGrande titulo="Terminar" icono="check" relleno={false} onClick={() => accion('terminar', p.id)} />
          </div>
        </Tarjeta>
      )
    case 'terminada':
      return <Tarjeta><DatosCosecha p={p} /></Tarjeta>
    default:
      return null
  }
}

function DatosCosecha({ p }: { p: Planta }) {
  const c = p.cosecha
  return (
    <>
      <h3><Icono nombre="tijera" />Cosecha</h3>
      {c && (
        <>
          <p class="texto">Cosechada el {Formato.fechaCorta(c.fecha)}: {Formato.numero(c.gramosHumedos)} g húmedos.</p>
          {c.fechaFrascos && (
            <p class="texto">A frascos el {Formato.fechaCorta(c.fechaFrascos)}{c.gramosSecos !== undefined ? `: ${Formato.numero(c.gramosSecos)} g secos.` : '.'}</p>
          )}
          {c.gramosSecos !== undefined && c.gramosHumedos > 0 && (
            <p class="nota">Quedó el {Formato.numero((c.gramosSecos / c.gramosHumedos) * 100)} % del peso húmedo.</p>
          )}
        </>
      )}
    </>
  )
}

// ─── Fotos ───

function FotosPlanta({ p }: { p: Planta }) {
  const quitar = (nombre: string) => () => {
    void Fotos.borrar(nombre)
    cambiar((d) => D.quitarFoto(d, nombre, p.id))
  }
  return (
    <Tarjeta>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <h3 style={{ flex: 1 }}><Icono nombre="imagen" />Fotos</h3>
        <button class="boton-icono" aria-label="Agregar foto" onClick={() => void agregarFoto(p.id)} style={{ margin: '-10px -8px' }}><Icono nombre="masCirculo" tam={26} /></button>
      </div>
      {p.fotos.length === 0 ? (
        <p class="nota">Sacale fotos seguido: sirve para comparar y para el asistente.</p>
      ) : (
        <>
          <div class="miniaturas">
            {[...lineaDeTiempo(p)].reverse().map((f) => (
              <Miniatura key={f.nombre} nombre={f.nombre} onClick={() => { fotoAbierta.value = { nombre: f.nombre, alBorrar: quitar(f.nombre) } }} />
            ))}
          </div>
          {p.fotos.length >= 2 && (
            <button class="boton-texto" style={{ alignSelf: 'flex-start', padding: '4px 0', fontWeight: 620 }}
              onClick={() => ir(`planta/${p.id}/fotos`)}><Icono nombre="fotos" tam={18} />Ver línea de tiempo ›</button>
          )}
        </>
      )}
    </Tarjeta>
  )
}

// ─── Historial editable ───

function Historial({ p, onEditar }: { p: Planta; onEditar: (r: Registro) => void }) {
  const lista = historial(p)
  return (
    <Tarjeta>
      <h3><Icono nombre="reloj" />Historial</h3>
      {lista.length === 0 && <p class="nota">Sin registros todavía.</p>}
      <div>
        {lista.map((r) => (
          <button key={r.id} class="registro" onClick={() => onEditar(r)}>
            <span class="icono"><Icono nombre={iconoRegistro[r.tipo]} tam={20} color={colorRegistro[r.tipo]} /></span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'flex', gap: '8px' }}>
                <span class="tipo">{nombreTipoRegistro[r.tipo]}</span>
                <span class="cuando">{Formato.fechaCorta(r.fecha)}</span>
              </span>
              {detalleRegistro(r) && <span class="detalle" style={{ display: 'block' }}>{detalleRegistro(r)}</span>}
            </span>
          </button>
        ))}
      </div>
      <p class="nota-chica">Tocá un registro para editarlo o borrarlo.</p>
    </Tarjeta>
  )
}

function detalleRegistro(r: Registro): string | undefined {
  const partes: string[] = []
  if (r.producto) partes.push(r.producto)
  if (r.aguaML !== undefined) partes.push(Formato.volumen(r.aguaML) + ' de agua')
  if (r.phDrenaje !== undefined) partes.push(`pH del drenaje ${Formato.numero(r.phDrenaje)}`)
  if (r.nota) partes.push(r.nota)
  return partes.length === 0 ? undefined : partes.join(' · ')
}

// ─── Descartar / borrar ───

function ZonaPeligrosa({ p }: { p: Planta }) {
  const descartar = async () => {
    if (await confirmar(`¿Descartar ${p.nombre}?`, 'Descartar',
      { mensaje: 'Queda en el historial, pero deja de generar tareas.', destructiva: true })) {
      cambiar((d) => D.descartar(d, p.id, new Date()))
    }
  }
  const borrar = async () => {
    if (await confirmar(`¿Borrar ${p.nombre} para siempre?`, 'Borrar planta',
      { mensaje: 'Se borran también su historial y sus fotos. No se puede deshacer.', destructiva: true })) {
      borrarPlanta(p.id)
      reemplazar('plantas')
    }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
      {p.estado === 'activa' && <BotonGrande titulo="Descartar planta" icono="basura" color="gris" relleno={false} onClick={descartar} />}
      <BotonGrande titulo="Borrar planta" icono="prohibido" color="alerta" relleno={false} onClick={borrar} />
    </div>
  )
}
