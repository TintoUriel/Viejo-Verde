import { useState } from 'preact/hooks'
import { datos, hoy } from '../app/almacen'
import { Barra, Contador, Segmentos, Seccion, Tarjeta } from '../componentes'
import { Calendario } from '../core/calendario'
import { Cupo, Temporada } from '../core/consejos'
import { nombreEtapa } from '../core/etapas'
import { Formato } from '../core/formato'
import { nombreTipoPlanta, TIPOS_PLANTA, type TipoPlanta } from '../core/modelos'
import { Icono } from '../iconos'
import { nuevasEnSemana, Planificador, type SemanaCupo } from '../core/planificador'

/** "Si germino hoy, ¿cuándo cosecho?" y cuántas plantas vas a tener en flor cada semana. */
export function VistaPlanificador() {
  const [tipo, setTipo] = useState<TipoPlanta>('auto')
  const [cantidad, setCantidad] = useState(3)
  const [germinacion, setGerminacion] = useState<Date>(hoy.value)

  const nuevas = Planificador.hipoteticas(tipo, cantidad, germinacion)
  // Semanas a mostrar: hasta que la tanda nueva termine (mínimo 20).
  const fin = Calendario.dias(hoy.value, Planificador.cosechaEstimada(tipo, germinacion))
  const semanas = Math.max(Planificador.semanas, Math.trunc(fin / 7) + 4)
  const proy = Planificador.proyeccion(datos.value.plantas, nuevas, hoy.value, semanas)
  const excedida = Planificador.primeraExcedida(proy)
  const libres = Planificador.lugarLibre(datos.value.plantas, tipo, germinacion, hoy.value)

  return (
    <main class="pantalla">
      <Barra titulo="Planificar" atras="hoy" textoAtras="Atrás" />

      <Seccion titulo="Tanda nueva" pie={Temporada.consejo(germinacion).texto}>
        <div class="fila"><Segmentos opciones={TIPOS_PLANTA.map((t) => [t, nombreTipoPlanta[t]] as const)} valor={tipo} onCambio={setTipo} /></div>
        <div class="fila">
          <span style={{ flex: 1 }}>Cantidad</span>
          <Contador valor={cantidad} min={1} max={Cupo.plantasFlorecidas} onCambio={setCantidad} />
        </div>
        <label class="fila">
          <span>Germinar el</span>
          <input type="date" min={Calendario.claveDia(hoy.value)} value={Calendario.claveDia(germinacion)}
            onChange={(e) => {
              const f = Calendario.leerClave((e.target as HTMLInputElement).value)
              if (f) setGerminacion(f)
            }} />
        </label>
      </Seccion>

      <Seccion titulo="Fechas estimadas"
        pie={tipo === 'foto' ? 'Las fotoperiódicas siguen el calendario: florecen con los días cortos (fines de enero).' : undefined}>
        {Planificador.fechasClave(tipo, germinacion).slice(1).map((f) => (
          <div class="fila" key={f.etapa}>
            <span style={{ flex: 1, color: `var(--e-${f.etapa})`, fontWeight: 600 }}>{nombreEtapa[f.etapa]}</span>
            <span class="valor">{Formato.fechaCorta(f.fecha)}</span>
          </div>
        ))}
      </Seccion>

      <Tarjeta>
        <h3>Plantas en flor por semana</h3>
        <GraficoCupo proy={proy} />
        <div class="leyenda">
          <span style={{ '--c': 'var(--verde)' }}>Las que tenés</span>
          <span style={{ '--c': 'var(--ambar)' }}>Tanda nueva</span>
          <span style={{ '--c': 'var(--alerta)' }}>Cupo: {Cupo.plantasFlorecidas}</span>
        </div>
        {excedida ? (
          <p class="peligro-texto con-icono"><Icono nombre="prohibido" />La semana del {Formato.fechaCorta(excedida.inicio)} tendrías {excedida.total} en flor: te pasás del cupo.</p>
        ) : (
          <p class="con-icono" style={{ color: 'var(--verde)', fontWeight: 620 }}><Icono nombre="check" />Entrás en el cupo: nunca más de {Cupo.plantasFlorecidas} en flor.</p>
        )}
        <p class="nota">
          {libres === 0
            ? 'Con lo que ya tenés, ese día no te queda lugar para germinar más.'
            : `Ese día podrías germinar hasta ${libres} ${tipo === 'auto' ? 'automática' : 'fotoperiódica'}${libres === 1 ? '' : 's'} sin pasarte.`}
        </p>
        <p class="nota-chica">
          Cuenta floración, maduración y lista para cosecha (machos incluidos). Supone que cosechás cuando termina "lista para cosecha".
        </p>
      </Tarjeta>
    </main>
  )
}

function GraficoCupo({ proy }: { proy: SemanaCupo[] }) {
  const ancho = 340
  const alto = 200
  const izq = 18
  const abajo = 22
  const arriba = 8
  const maxY = Math.max(Cupo.plantasFlorecidas + 2, Math.max(...proy.map((s) => s.total), 0) + 1)
  const util = alto - abajo - arriba
  const y = (v: number) => alto - abajo - (v / maxY) * util
  const paso = (ancho - izq) / proy.length
  const barra = Math.max(paso - 2, 1)
  // Una etiqueta por mes, en la primera semana que cae en ese mes.
  const meses = proy.flatMap((s, i) =>
    i === 0 || Calendario.mes(s.inicio) !== Calendario.mes(proy[i - 1].inicio) ? [{ i, texto: Formato.mesCorto(s.inicio) }] : [])
  return (
    <svg class="grafico" viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label="Plantas en flor por semana contra el cupo">
      {[0, 3, 6, 9].filter((v) => v <= maxY).map((v) => (
        <g key={v}>
          <line x1={izq} x2={ancho} y1={y(v)} y2={y(v)} stroke="var(--separador)" />
          <text x={izq - 4} y={y(v) + 4} text-anchor="end">{v}</text>
        </g>
      ))}
      {proy.map((s, i) => {
        const x = izq + i * paso + 1
        const hA = (s.actuales / maxY) * util
        const hN = (nuevasEnSemana(s) / maxY) * util
        return (
          <g key={i}>
            {s.actuales > 0 && <rect x={x} y={y(s.actuales)} width={barra} height={hA} fill="var(--verde)" rx="2" />}
            {nuevasEnSemana(s) > 0 && <rect x={x} y={y(s.total)} width={barra} height={hN} fill="var(--ambar)" rx="2" />}
          </g>
        )
      })}
      <line x1={izq} x2={ancho} y1={y(Cupo.plantasFlorecidas)} y2={y(Cupo.plantasFlorecidas)}
        stroke="var(--alerta)" stroke-width="2" stroke-dasharray="5 4" />
      {meses.map((m) => (
        <text key={m.i} x={izq + m.i * paso + 1} y={alto - 6}>{m.texto}</text>
      ))}
    </svg>
  )
}
