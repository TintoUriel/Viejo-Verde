import { datos } from '../app/almacen'
import { ir } from '../app/router'
import { Barra, Seccion, Tarjeta, Vacio } from '../componentes'
import { Estadisticas, rendimiento, type ResumenCosecha, type ResumenGrupo } from '../core/estadisticas'
import { Formato } from '../core/formato'

/** Historial de cosechas con totales, gráfico y agrupado por variedad y temporada. */
export function VistaCosechas() {
  const c = Estadisticas.cosechas(datos.value.plantas)
  return (
    <main class="pantalla">
      <Barra titulo="Cosechas" atras="plantas" textoAtras="Plantas" />
      {c.length === 0 ? (
        <Vacio icono="tijera" titulo="Todavía no cosechaste" texto="Cuando cosechés una planta, acá vas a ver cuánto rindió." />
      ) : (
        <>
          <div class="cifras">
            <Cifra valor={`${Formato.numero(Estadisticas.totalSecos(c))} g`} texto="Secos en total" />
            <Cifra valor={(() => { const p = Estadisticas.promedioSecos(c); return p === undefined ? '—' : `${Formato.numero(p)} g` })()} texto="Por planta" />
            <Cifra valor={String(c.length)} texto="Cosechas" />
          </div>
          <Grafico cosechas={c} />
          <Grupos titulo="Por variedad" grupos={Estadisticas.porVariedad(c)} />
          <Grupos titulo="Por temporada" grupos={Estadisticas.porTemporada(c)} />
          <Seccion titulo="Cosechas">
            {c.map((x) => (
              <button class="fila" key={x.plantaID} onClick={() => ir(`planta/${x.plantaID}`)}>
                <div class="principal">
                  <span class="nombre">{x.nombre}</span>
                  <span class="secundario">{detalleCosecha(x)}</span>
                </div>
                <span style={{ fontWeight: 700, color: x.secos === undefined ? 'var(--texto-2)' : 'var(--ambar)', whiteSpace: 'nowrap' }}>
                  {x.secos === undefined ? 'secando' : `${Formato.numero(x.secos)} g`}
                </span>
                <span class="chevron" aria-hidden="true">›</span>
              </button>
            ))}
          </Seccion>
        </>
      )}
    </main>
  )
}

function Cifra({ valor, texto }: { valor: string; texto: string }) {
  return (
    <div class="dato" style={{ '--c': 'var(--ambar)' }}>
      <span class="numero" style={{ fontSize: '19px' }}>{valor}</span>
      <span class="texto">{texto}</span>
    </div>
  )
}

function Grafico({ cosechas }: { cosechas: ResumenCosecha[] }) {
  const conSecos = cosechas.filter((x) => x.secos !== undefined).reverse()
  if (conSecos.length === 0) return null
  const ancho = 340
  const alto = 200
  const abajo = 36
  const arriba = 18
  const max = Math.max(...conSecos.map((x) => x.secos ?? 0), 1)
  const paso = ancho / conSecos.length
  const barra = Math.min(paso * 0.62, 48)
  return (
    <Tarjeta>
      <h3>Gramos secos por cosecha</h3>
      <svg class="grafico" viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label="Gramos secos por cosecha">
        <line x1="0" x2={ancho} y1={alto - abajo} y2={alto - abajo} stroke="var(--separador)" />
        {conSecos.map((x, i) => {
          const h = ((x.secos ?? 0) / max) * (alto - abajo - arriba)
          const cx = paso * i + paso / 2
          return (
            <g key={x.plantaID}>
              <rect x={cx - barra / 2} y={alto - abajo - h} width={barra} height={Math.max(h, 1)} rx="4" fill="var(--ambar)" />
              <text x={cx} y={alto - abajo - h - 5} text-anchor="middle">{Formato.numero(x.secos ?? 0)}</text>
              <text x={cx} y={alto - abajo + 16} text-anchor="middle">{recortar(x.nombre, paso)}</text>
            </g>
          )
        })}
      </svg>
    </Tarjeta>
  )
}

/** Recorta la etiqueta para que entre en el ancho de la barra (aprox. 6 px por letra). */
function recortar(s: string, ancho: number): string {
  const max = Math.max(Math.floor(ancho / 6.2), 3)
  return s.length <= max ? s : s.slice(0, max - 1) + '…'
}

function Grupos({ titulo, grupos }: { titulo: string; grupos: ResumenGrupo[] }) {
  return (
    <Seccion titulo={titulo}>
      {grupos.map((g) => (
        <div class="fila" key={g.nombre}>
          <div class="principal">
            <span class="nombre">{g.nombre}</span>
            <span class="secundario">{detalleGrupo(g)}</span>
          </div>
          <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{Formato.numero(g.totalSecos)} g</span>
        </div>
      ))}
    </Seccion>
  )
}

function detalleGrupo(g: ResumenGrupo): string {
  const partes = [`${g.cosechas} cosecha${g.cosechas === 1 ? '' : 's'}`]
  if (g.promedioSecos !== undefined) partes.push(`${Formato.numero(g.promedioSecos)} g por planta`)
  if (g.promedioDias !== undefined) partes.push(`ciclo de ${g.promedioDias} días`)
  return partes.join(' · ')
}

function detalleCosecha(c: ResumenCosecha): string {
  const partes = [c.variedad, Formato.fechaCorta(c.fecha), `${c.diasCiclo} días`, `${Formato.numero(c.humedos)} g húmedos`]
  const r = rendimiento(c)
  if (r !== undefined) partes.push(`${Formato.numero(r * 100)} % seco`)
  return partes.join(' · ')
}
