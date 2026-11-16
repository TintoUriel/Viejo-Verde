import { useSignal } from '@preact/signals'
import { datos, estadoDe } from '../app/almacen'
import { ir } from '../app/router'
import { BarraEtapas, BotonGrande, Encabezado, EtiquetaEtapa, Seccion, Vacio } from '../componentes'
import { semana, type EstadoEtapa } from '../core/etapas'
import { Formato } from '../core/formato'
import { nombreTipoPlanta, type Planta } from '../core/modelos'
import { Icono } from '../iconos'
import { FormPlanta } from './FormPlanta'

export function VistaPlantas() {
  const nueva = useSignal(false)
  const plantas = datos.value.plantas
  const activas = plantas.filter((p) => p.estado === 'activa')
  const postCosecha = plantas.filter((p) => p.estado === 'secando' || p.estado === 'curando')
  const historial = plantas.filter((p) => p.estado === 'terminada' || p.estado === 'descartada')

  return (
    <main class="pantalla">
      <Encabezado titulo="Plantas" acciones={
        <button class="boton-icono" aria-label="Agregar planta" onClick={() => { nueva.value = true }}><Icono nombre="masCirculo" tam={28} /></button>
      } />
      <div class="fila-botones">
        <button class="mini-boton" onClick={() => ir('planificar')}><Icono nombre="calendario" tam={16} />Planificar</button>
        <button class="mini-boton" onClick={() => ir('cosechas')}><Icono nombre="grafico" tam={16} />Cosechas</button>
      </div>

      {plantas.length === 0 && (
        <Vacio icono="brote" titulo="Sin plantas" texto="Tocá + para agregar la primera.">
          <div style={{ width: '220px', marginTop: '8px' }}>
            <BotonGrande titulo="Agregar planta" onClick={() => { nueva.value = true }} />
          </div>
        </Vacio>
      )}
      {activas.length > 0 && <Grupo titulo={`Activas (${activas.length})`} plantas={activas} />}
      {postCosecha.length > 0 && <Grupo titulo="Secando y curando" plantas={postCosecha} />}
      {historial.length > 0 && <Grupo titulo="Historial" plantas={historial} />}

      {nueva.value && <FormPlanta onCerrar={() => { nueva.value = false }} />}
    </main>
  )
}

function Grupo({ titulo, plantas }: { titulo: string; plantas: Planta[] }) {
  return (
    <Seccion titulo={titulo}>
      {plantas.map((p) => <FilaPlanta key={p.id} planta={p} />)}
    </Seccion>
  )
}

function FilaPlanta({ planta }: { planta: Planta }) {
  const e = estadoDe(planta)
  return (
    <button class="fila planta-fila" onClick={() => ir(`planta/${planta.id}`)}>
      <div class="principal">
        <div class="cabeza">
          <span class="nombre">{planta.nombre}</span>
          {planta.sexo === 'macho' && <span title="Macho" class="marca"><Icono nombre="macho" tam={16} color="var(--azul)" /></span>}
          {planta.ubicacion === 'interior' && <span title="Adentro" class="marca"><Icono nombre="casa" tam={15} color="var(--texto-2)" /></span>}
          <span style={{ marginLeft: 'auto' }}><EtiquetaEtapa etapa={e.etapa} /></span>
        </div>
        <span class="secundario">{subtitulo(planta, e)}</span>
        {planta.estado === 'activa' && <BarraEtapas estado={e} compacta />}
      </div>
      <span class="chevron" aria-hidden="true">›</span>
    </button>
  )
}

function subtitulo(p: Planta, e: EstadoEtapa): string {
  const variedad = p.variedad === '' ? nombreTipoPlanta[p.tipo] : p.variedad
  switch (p.estado) {
    case 'activa': return `${variedad} · día ${e.dia} · semana ${semana(e)}`
    case 'secando': return `${variedad} · secando hace ${e.diaEnEtapa} días`
    case 'curando': return `${variedad} · en frascos hace ${e.diaEnEtapa} días`
    case 'terminada':
      return p.cosecha?.gramosSecos !== undefined ? `${variedad} · ${Formato.numero(p.cosecha.gramosSecos)} g secos` : variedad
    case 'descartada': return `${variedad} · descartada`
  }
}
