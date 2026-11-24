import { Calendario } from './calendario'
import type { Pronostico } from './clima'
import type { ConfigDosis } from './dosis'
import { duracion, Etapas, type Etapa } from './etapas'
import { nuevoRegistro, type PaqueteSemillas, type Planta, type TipoRegistro } from './modelos'
import { Tareas, type Tarea, type TipoTarea } from './tareas'

/**
 * Los próximos días: qué va a tocar hacer y qué etapas empiezan.
 *
 * Se simula la semana: lo que toca cada día se da por hecho ese mismo día (un riego más en el historial, por
 * ejemplo), y con eso se calculan las tareas del día siguiente, con las mismas reglas que Hoy (y el pronóstico,
 * para el calor). Lo de hoy también se da por hecho, para que no se repita mañana.
 */

export interface Hito {
  plantaID: string
  plantaNombre: string
  etapa: Etapa
}

export interface DiaAgenda {
  fecha: Date
  tareas: Tarea[]
  /** Plantas que empiezan una etapa ese día. */
  hitos: Hito[]
}

/** Lo que se registra al hacer cada tarea (las demás no se "hacen" en la simulación). */
const AL_HACER: Partial<Record<TipoTarea, TipoRegistro>> = {
  riego: 'riego', fertilizante: 'fertilizante', neem: 'neem', hongos: 'revision', curado: 'curado',
}

/** Tareas que siguen apareciendo todos los días hasta que pasa algo (cosechar, sexar…): se muestran una sola vez,
 *  el primer día. Si ya están hoy, no se repiten. */
const persistente = (t: Tarea) =>
  t.tipo === 'cosecha' || t.tipo === 'sexado' || t.tipo === 'machoPatio' || t.tipo === 'machoPolen' ||
  t.tipo === 'semillas' || t.tipo === 'secado' || t.acciones.includes('terminar')

export const Agenda = {
  proximos(o: {
    plantas: Planta[]
    paquetes?: PaqueteSemillas[]
    hoy: Date
    config?: ConfigDosis
    clima?: Pronostico
    dias?: number
  }): DiaAgenda[] {
    const plantas = structuredClone(o.plantas)
    const porID = new Map(plantas.map((p) => [p.id, p]))
    const generar = (fecha: Date) => Tareas.generar({ plantas, paquetes: o.paquetes, hoy: fecha, config: o.config, clima: o.clima })
    const yaVistas = new Set<string>()
    const hacer = (tareas: Tarea[], fecha: Date) => {
      for (const t of tareas) {
        if (persistente(t)) {
          yaVistas.add(t.id)
          continue
        }
        const tipo = AL_HACER[t.tipo]
        if (tipo) porID.get(t.plantaID)?.registros.push(nuevoRegistro(fecha, tipo, { aguaML: t.dosis?.aguaML }))
      }
    }

    hacer(generar(o.hoy), o.hoy)
    const r: DiaAgenda[] = []
    for (let d = 1; d <= (o.dias ?? 7); d++) {
      const fecha = Calendario.sumarDias(d, o.hoy)
      const tareas = generar(fecha).filter((t) => !(persistente(t) && yaVistas.has(t.id)))
      hacer(tareas, fecha)
      r.push({ fecha, tareas, hitos: hitosDel(o.plantas, fecha) })
    }
    return r
  },
}

/** Etapas que empiezan ese día (de las plantas que siguen creciendo). */
function hitosDel(plantas: Planta[], fecha: Date): Hito[] {
  const r: Hito[] = []
  for (const p of plantas) {
    if (p.estado !== 'activa') continue
    const dia = Calendario.dias(p.fechaGerminacion, fecha)
    for (const t of Etapas.de(p)) {
      if (duracion(t) > 0 && t.desdeDia > 0 && t.desdeDia === dia) r.push({ plantaID: p.id, plantaNombre: p.nombre, etapa: t.etapa })
    }
  }
  return r
}
