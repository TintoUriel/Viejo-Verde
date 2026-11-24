import { agenda, datos } from '../app/almacen'
import { ir } from '../app/router'
import { Tarjeta } from '../componentes'
import type { DiaAgenda, Hito } from '../core/agenda'
import { Calendario } from '../core/calendario'
import type { Etapa } from '../core/etapas'
import { nombreFertilizante } from '../core/modelos'
import type { Tarea, TipoTarea } from '../core/tareas'
import { Icono, iconoTarea, type NombreIcono } from '../iconos'

// Los próximos 7 días en Hoy: qué va a tocar cada día (agrupado: "Riego: Candy 1, Candy 3 y Candy 5") y qué
// etapas empiezan. Sale de simular la semana con las mismas reglas de Hoy (ver core/agenda.ts).

const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

interface Item {
  clave: string
  icono: NombreIcono
  color: string
  titulo: string
  quienes: string
  /** Si es de una sola planta, se abre su ficha al tocarlo. */
  plantaID?: string
}

const TITULO: Record<TipoTarea, string> = {
  riego: 'Riego', fertilizante: 'Fertilizante', neem: 'Neem', hongos: 'Revisar hongos', cosecha: 'Empezar a mirar tricomas',
  sexado: 'Revisar el sexo', machoPatio: 'Llevar el macho adentro', machoPolen: 'Juntar polen', semillas: 'Revisar semillas',
  secado: 'Probar los tallitos', curado: 'Abrir los frascos',
}
const COLOR: Partial<Record<TipoTarea, string>> = {
  riego: 'var(--azul)', fertilizante: 'var(--verde)', neem: 'var(--teal)', hongos: 'var(--alerta)', cosecha: 'var(--ambar)',
  secado: 'var(--ambar)', curado: 'var(--ambar)', machoPatio: 'var(--alerta)',
}

/** Qué cambia al entrar en cada etapa. */
const AL_EMPEZAR: Partial<Record<Etapa, string>> = {
  crecimiento: 'empieza el Top Veg',
  prefloracion: 'pasa a Top Bloom',
  floracion: 'se termina el neem',
  maduracion: 'solo agua desde ahora',
  listaCosecha: 'ventana de cosecha',
}
const NOMBRE_ETAPA: Partial<Record<Etapa, string>> = {
  crecimiento: 'crecimiento', prefloracion: 'prefloración', floracion: 'floración', maduracion: 'maduración', listaCosecha: 'cosecha',
}

const lista = (n: string[]) => (n.length === 1 ? n[0] : `${n.slice(0, -1).join(', ')} y ${n[n.length - 1]}`)

/** `activas`: cuántas plantas están creciendo (si una tarea es para todas, se dice "todas" en vez de nombrarlas). */
function items(d: DiaAgenda, activas: number): Item[] {
  const r: Item[] = []

  // Las etapas que empiezan (juntas si son varias plantas con la misma).
  const porEtapa = new Map<Etapa, Hito[]>()
  for (const h of d.hitos) porEtapa.set(h.etapa, [...(porEtapa.get(h.etapa) ?? []), h])
  for (const [etapa, hs] of porEtapa) {
    const nombres = hs.map((h) => h.plantaNombre)
    r.push({
      clave: `etapa-${etapa}`, icono: etapa === 'listaCosecha' ? 'tijera' : etapa === 'crecimiento' ? 'brote' : 'flor',
      color: `color-mix(in srgb, var(--e-${etapa}) 75%, var(--texto))`,
      titulo: `${hs.length === 1 ? 'Empieza' : 'Empiezan'} ${NOMBRE_ETAPA[etapa] ?? etapa}`,
      quienes: `${lista(nombres)}${AL_EMPEZAR[etapa] ? `: ${AL_EMPEZAR[etapa]}` : ''}`,
      plantaID: hs.length === 1 ? hs[0].plantaID : undefined,
    })
  }

  // Las tareas, agrupadas por tipo (y por producto, en el fertilizante).
  const grupos = new Map<string, Tarea[]>()
  for (const t of d.tareas) {
    const clave = t.tipo === 'fertilizante' ? `fertilizante-${t.dosis?.fertilizante ?? ''}`
      : t.tipo === 'curado' && t.acciones.includes('terminar') ? 'curado-fin' : t.tipo
    grupos.set(clave, [...(grupos.get(clave) ?? []), t])
  }
  for (const [clave, ts] of grupos) {
    const t = ts[0]
    let titulo = TITULO[t.tipo]
    if (t.tipo === 'fertilizante' && t.dosis?.fertilizante) titulo = nombreFertilizante[t.dosis.fertilizante]
    if (clave === 'curado-fin') titulo = 'Terminar el curado'
    r.push({
      clave, icono: iconoTarea[t.tipo], color: COLOR[t.tipo] ?? 'var(--verde)', titulo,
      quienes: ts.length >= 3 && ts.length === activas ? `todas (${activas})` : lista(ts.map((x) => x.plantaNombre)),
      plantaID: ts.length === 1 ? t.plantaID : undefined,
    })
  }
  return r
}

function etiquetaDia(f: Date, i: number): { corto: string; numero: number } {
  return { corto: i === 0 ? 'Mañana' : DIAS_CORTOS[Calendario.diaDeLaSemana(f)], numero: Calendario.diaDelMes(f) }
}

export function ProximosDias() {
  const hayPlantas = datos.value.plantas.some((p) => p.estado === 'activa' || p.estado === 'secando' || p.estado === 'curando')
  const activas = datos.value.plantas.filter((p) => p.estado === 'activa').length
  if (!hayPlantas) return null
  const dias = agenda.value
  return (
    <section class="proximos" aria-labelledby="titulo-proximos">
      <h2 class="subtitulo" id="titulo-proximos">Próximos 7 días</h2>
      <Tarjeta class="agenda">
        {dias.map((d, i) => {
          const lista = items(d, activas)
          const e = etiquetaDia(d.fecha, i)
          const finde = Calendario.diaDeLaSemana(d.fecha) % 6 === 0
          return (
            <div class={`dia-agenda${finde ? ' finde' : ''}`} key={Calendario.claveDia(d.fecha)}>
              <div class="fecha-agenda">
                <span class="corto">{e.corto}</span>
                <span class="numero">{e.numero}</span>
              </div>
              <div class="items-agenda">
                {lista.length === 0 && <span class="libre">Nada para hacer</span>}
                {lista.map((it) => {
                  const contenido = (
                    <>
                      <span class="icono" style={{ color: it.color }}><Icono nombre={it.icono} tam={17} /></span>
                      <span class="texto"><b>{it.titulo}</b> <span>{it.quienes}</span></span>
                    </>
                  )
                  return it.plantaID
                    ? <button key={it.clave} class="item-agenda" onClick={() => ir(`planta/${it.plantaID}`)}>{contenido}</button>
                    : <div key={it.clave} class="item-agenda">{contenido}</div>
                })}
              </div>
            </div>
          )
        })}
      </Tarjeta>
      <p class="nota-chica" style={{ margin: '0 6px' }}>
        Suponiendo que cada día hacés lo que toca. El riego depende de cuánto pese la maceta: es para tenerlo en cuenta, no una obligación.
      </p>
    </section>
  )
}
