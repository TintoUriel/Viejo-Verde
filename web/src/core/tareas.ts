import { Calendario } from './calendario'
import { AnalisisClima, type Pronostico } from './clima'
import { CalculoDosis, configPorDefecto, textoAgua, textoFertilizante, type ConfigDosis, type Dosis } from './dosis'
import { Etapas, type Etapa } from './etapas'
import { Formato } from './formato'
import { nombreFertilizante, ultimaFecha, type PaqueteSemillas, type Planta, type TipoRegistro } from './modelos'
import { maxFecha } from './util'

/** El orden define cómo se muestran (después de las urgentes). */
export const TIPOS_TAREA = ['machoPatio', 'cosecha', 'hongos', 'sexado', 'machoPolen', 'semillas',
  'fertilizante', 'riego', 'neem', 'secado', 'curado'] as const
export type TipoTarea = (typeof TIPOS_TAREA)[number]

export type AccionTarea =
  | 'regue' | 'fertilice' | 'neem'
  | 'hembra' | 'macho' | 'moverAdentro' | 'juntePolen'
  | 'registrarSemillas' | 'cosechar' | 'aFrascos' | 'abriFrascos' | 'terminar'
  /** Revisé (hongos): queda registrado y no vuelve a aparecer hoy. */
  | 'revise'
  /** Oculta la tarea hasta mañana sin registrar nada. */
  | 'hoyNo'

export const tituloAccion: Record<AccionTarea, string> = {
  regue: 'Regué',
  fertilice: 'Fertilicé',
  neem: 'Neem',
  hembra: 'Hembra',
  macho: 'Macho',
  moverAdentro: 'Lo llevé adentro',
  juntePolen: 'Junté polen',
  registrarSemillas: 'Registrar semillas',
  cosechar: 'Cosechar',
  aFrascos: 'A frascos',
  abriFrascos: 'Abrí los frascos',
  terminar: 'Terminar',
  revise: 'Revisé',
  hoyNo: 'Hoy no',
}

/** Lo que hay que echar (riego y fertilizante). */
export interface DosisTarea {
  aguaML: number
  fertilizante?: Dosis['fertilizante']
  fertilizanteML: number
  mlPorLitro: number
}

export interface Tarea {
  /** Estable por planta y tipo: "riego-<uuid>". */
  id: string
  tipo: TipoTarea
  plantaID: string
  plantaNombre: string
  titulo: string
  detalle: string
  urgente: boolean
  acciones: AccionTarea[]
  dosis?: DosisTarea
}

export const idTarea = (tipo: TipoTarea, plantaID: string): string => `${tipo}-${plantaID}`

const orden = (t: TipoTarea) => TIPOS_TAREA.indexOf(t)

export const Tareas = {
  diasEntreRiegos: 2,
  diasEntreFertilizantes: 6,
  diasEntreNeem: 7,
  diaSexado: 21,
  diasSemillas: 35,
  diaProbarTallitos: 7,
  diasCuradoDiario: 14,
  diasCuradoCompleto: 28,

  /** Genera las tareas de hoy. `pospuestas`: id de tarea → día en que se tocó "Hoy no". */
  generar(o: {
    plantas: Planta[]
    paquetes?: PaqueteSemillas[]
    hoy: Date
    config?: ConfigDosis
    pospuestas?: Record<string, Date>
    clima?: Pronostico
  }): Tarea[] {
    const pospuestas = o.pospuestas ?? {}
    const todas = o.plantas.flatMap((p) => tareasDe(p, o.paquetes ?? [], o.hoy, o.config ?? configPorDefecto(), o.clima))
    return todas
      .filter((t) => !(pospuestas[t.id] && Calendario.mismoDia(pospuestas[t.id], o.hoy)))
      .sort((a, b) => {
        if (a.urgente !== b.urgente) return a.urgente ? -1 : 1
        if (a.tipo !== b.tipo) return orden(a.tipo) - orden(b.tipo)
        return a.plantaNombre.localeCompare(b.plantaNombre, 'es')
      })
  },
}

function tareasDe(p: Planta, paquetes: PaqueteSemillas[], hoy: Date, config: ConfigDosis, clima?: Pronostico): Tarea[] {
  const r: Tarea[] = []
  const n = p.nombre
  const t = (tipo: TipoTarea, titulo: string, detalle: string, acciones: AccionTarea[],
    extra: { urgente?: boolean; dosis?: Dosis } = {}) => {
    const tarea: Tarea = { id: idTarea(tipo, p.id), tipo, plantaID: p.id, plantaNombre: n, titulo, detalle,
      urgente: extra.urgente ?? false, acciones }
    if (extra.dosis) {
      const d = extra.dosis
      tarea.dosis = { aguaML: d.aguaML, fertilizante: d.fertilizante, fertilizanteML: d.fertilizanteML, mlPorLitro: d.mlPorLitro }
    }
    r.push(tarea)
  }
  const diasDesde = (tipos: TipoRegistro[], siNunca?: Date): number | undefined => {
    const f = ultimaFecha(p, tipos) ?? siNunca
    return f ? Calendario.dias(f, hoy) : undefined
  }
  const INF = Number.MAX_SAFE_INTEGER

  const e = Etapas.estado(p, hoy)

  switch (p.estado) {
    case 'activa': {
      // --- Riego y fertilizante (fertilizar también es regar) ---
      const dosis = CalculoDosis.dosis(e.etapa, e.diaEnEtapa, p.litrosMaceta, config)
      const sinRiego = diasDesde(['riego', 'fertilizante'], p.fechaGerminacion) ?? 0
      // Clima (solo para las del patio): si ayer llovió fuerte no hace falta regar;
      // con calor fuerte, las macetas de tela se secan en un día.
      const enPatio = p.ubicacion === 'patio'
      const llovio = enPatio && AnalisisClima.lluviaAyer(clima, hoy) >= AnalisisClima.lluviaQueRiega
      const calor = enPatio && AnalisisClima.hayCalor(clima, hoy)
      const lluviaHoy = enPatio ? AnalisisClima.lluviaHoyProbable(clima, hoy) : undefined
      const tocaRegar = !llovio && sinRiego >= (calor ? 1 : Tareas.diasEntreRiegos)
      let notaClima = ''
      if (lluviaHoy !== undefined) {
        notaClima = ` Pronóstico: ${Formato.numero(lluviaHoy)} mm de lluvia hoy; si podés, esperá.`
      } else if (calor) {
        notaClima = ' Hace calor: regá temprano o al atardecer.'
      }
      const sinFertilizar = diasDesde(['fertilizante']) ?? INF
      if (tocaRegar && dosis.fertilizante && sinFertilizar >= Tareas.diasEntreFertilizantes) {
        t('fertilizante', `Toca ${nombreFertilizante[dosis.fertilizante]} para ${n}`,
          `Si la maceta está liviana: ${textoFertilizante(dosis) ?? ''}. Siempre a mitad de la dosis de la etiqueta.` + notaClima,
          ['fertilice', 'regue', 'hoyNo'], { dosis })
      } else if (tocaRegar) {
        let detalle = `Si está liviana, echale ${textoAgua(dosis)}. Si sale agua por abajo antes, pará.`
        if (e.etapa === 'maduracion' || e.etapa === 'listaCosecha') {
          detalle += ' Solo agua, sin fertilizante.'
        } else if (e.etapa === 'plantula') {
          detalle += ' Chorrito alrededor del tallo, todavía sin fertilizante.'
        }
        detalle += notaClima
        t('riego', `Fijate si ${n} necesita agua (levantá la maceta)`, detalle, ['regue', 'hoyNo'], { dosis })
      }

      // --- Neem: crecimiento y prefloración, nunca en floración ---
      if ((e.etapa === 'crecimiento' || e.etapa === 'prefloracion') && (diasDesde(['neem']) ?? INF) >= Tareas.diasEntreNeem) {
        t('neem', `Neem a ${n}`, 'Jabón potásico con neem al atardecer, solo hojas (arriba y abajo).', ['neem', 'hoyNo'])
      }

      // --- Sexado de regulares ---
      if (p.semilla === 'regular' && p.sexo === 'desconocido' && e.dia >= Tareas.diaSexado) {
        t('sexado', `Revisá el sexo de ${n}`, 'Pelitos blancos en los nudos = hembra. Bolitas colgando = macho.',
          ['hembra', 'macho'])
      }

      // --- Macho ---
      if (p.sexo === 'macho') {
        if (p.ubicacion === 'patio') {
          t('machoPatio', `¡${n} es macho y está en el patio!`,
            'Alejalo de las hembras ya: llevalo adentro (ventanal o placard con LED).', ['moverAdentro'], { urgente: true })
        } else if (!p.polenJuntado) {
          t('machoPolen', `Polen de ${n}`, 'Cuando las bolitas empiecen a abrirse, cortá 2–3 ramas y juntá el polen.',
            ['juntePolen'])
        }
      }

      // --- Semillas de una rama polinizada ---
      if (p.fechaPolinizacion && Calendario.dias(p.fechaPolinizacion, hoy) >= Tareas.diasSemillas &&
          !paquetes.some((k) => k.plantaMadreID === p.id)) {
        t('semillas', `Revisá las semillas de ${n}`, 'Están listas si están marrones o atigradas.',
          ['registrarSemillas', 'hoyNo'])
      }

      // --- Hongos después de días húmedos (cogollos en el patio) ---
      const enFlor: Etapa[] = ['floracion', 'maduracion', 'listaCosecha']
      const revisadaHoy = (() => {
        const f = ultimaFecha(p, ['revision'])
        return f ? Calendario.mismoDia(f, hoy) : false
      })()
      if (enPatio && p.sexo !== 'macho' && enFlor.includes(e.etapa) && AnalisisClima.riesgoHongos(clima, hoy) && !revisadaHoy) {
        t('hongos', `Revisá hongos en ${n}`,
          'Hubo humedad o lluvia: abrí un poco los cogollos más gordos. Si ves partes marrones o pelusa gris, cortalas y tiralas lejos.',
          ['revise', 'hoyNo'])
      }

      // --- Punto de cosecha ---
      if (p.sexo !== 'macho' && (e.etapa === 'maduracion' || e.etapa === 'listaCosecha')) {
        t('cosecha', `Revisá los tricomas de ${n}`, 'Mayoría lechosos con algunos ámbar → a cosechar.',
          ['cosechar', 'hoyNo'], { urgente: e.etapa === 'listaCosecha' })
      }
      break
    }

    case 'secando':
      if (e.diaEnEtapa >= Tareas.diaProbarTallitos) {
        t('secado', `Probá los tallitos de ${n}`, 'Si quiebran con un crac, a frascos. Si se doblan, esperá unos días más.',
          ['aFrascos', 'hoyNo'])
      }
      break

    case 'curando': {
      const d = e.diaEnEtapa
      // Solo cuentan las aperturas desde que está en frascos.
      const inicio = Calendario.inicioDelDia(p.cosecha?.fechaFrascos ?? hoy).getTime()
      const ultimaApertura = maxFecha(p.registros.filter((x) => x.tipo === 'curado' && x.fecha.getTime() >= inicio).map((x) => x.fecha))
      const sinAbrir = ultimaApertura ? Calendario.dias(ultimaApertura, hoy) : INF
      if (d >= Tareas.diasCuradoCompleto) {
        t('curado', `Curado completo: ${n}`, 'Ya podés cerrar los frascos y disfrutarla.', ['terminar'])
      } else if (d < Tareas.diasCuradoDiario) {
        if (sinAbrir >= 1) t('curado', `Abrí los frascos de ${n}`, '10–15 minutos hoy, para que salga la humedad.', ['abriFrascos'])
      } else if (sinAbrir >= 2) {
        t('curado', `Abrí los frascos de ${n}`, 'Ahora alcanza con cada 2–3 días, unos minutos.', ['abriFrascos', 'hoyNo'])
      }
      break
    }

    case 'terminada':
    case 'descartada':
      break
  }
  return r
}

