import { Calendario } from './calendario'
import { cuentaComoFlorecida, Etapas, type Etapa } from './etapas'
import type { Planta } from './modelos'

/** Consejos fijos de cada etapa. */
export function consejosEtapa(e: Etapa): string[] {
  switch (e) {
    case 'plantula':
      return ['Riego chiquito alrededor del tallo.', 'Sol directo.', 'Cuidado con el viento.', 'Todavía no fertilizar.']
    case 'crecimiento':
      return ['Regá cuando la maceta pesa poco.', 'Top Veg a mitad de la dosis de la etiqueta.',
        'Neem una vez por semana, al atardecer.']
    case 'prefloracion':
      return ['Aparecen pelitos blancos (hembra) o bolitas (macho).', 'Pasá a Top Bloom, a mitad de dosis.']
    case 'floracion':
      return ['No toques ni rocíes los cogollos.', 'Revisá si hay hongos después de días húmedos.']
    case 'maduracion':
      return ['Solo agua.', 'Pelitos 70–80 % marrones.', 'Tricomas lechosos con algunos ámbar.']
    case 'listaCosecha':
      return ['Mirá los tricomas con lupa: mayoría lechosos con algunos ámbar.', 'Si ya está, cosechá.']
    case 'secado':
      return ['Lugar oscuro y ventilado, entre 18 y 22 °C.', 'Tarda 7–14 días, hasta que los tallitos quiebren.']
    case 'curado':
      return ['Frascos llenos hasta 3/4.', 'Si huele a humedad o hay pelusa blanca, sacá ese cogollo.']
    case 'terminada':
    case 'descartada':
      return ['Reciclá la tierra: sacá las raíces.', 'Mezclá 1 parte de humus cada 3 de tierra.',
        'Dejala reposar 1–2 semanas.']
  }
}

export interface ConsejoTemporada {
  titulo: string
  texto: string
}

export const Temporada = {
  /** Consejo según el mes, pensado para Buenos Aires. */
  consejo(fecha: Date): ConsejoTemporada {
    switch (Calendario.mes(fecha)) {
      case 9: case 10: case 11:
        return { titulo: 'Temporada de siembra', texto: 'Buen momento para germinar fotoperiódicas y automáticas.' }
      case 12: case 1: case 2:
        return { titulo: 'Otra tanda de automáticas',
          texto: 'Todavía da para germinar automáticas. Con calor, regá temprano o al atardecer.' }
      case 3: case 4:
        return { titulo: 'Última tanda de automáticas', texto: 'Abril mejor que mayo. Ojo con los hongos por la humedad.' }
      default:
        return { titulo: 'Descanso del patio', texto: 'Reciclá el sustrato y armá compost para la próxima temporada.' }
    }
  },
}

export interface ResumenCupo {
  activas: number
  enFlor: number
  secando: number
  curando: number
  limite: number
  excedido: boolean
}

export const Cupo = {
  /** REPROCANN: hasta 9 plantas florecidas, hasta 15 m² en exterior. */
  plantasFlorecidas: 9,
  metrosExterior: 15,

  resumen(plantas: Planta[], hoy: Date): ResumenCupo {
    const activas = plantas.filter((p) => p.estado === 'activa')
    const enFlor = activas.filter((p) => cuentaComoFlorecida(Etapas.etapa(p, hoy))).length
    return {
      activas: activas.length,
      enFlor,
      secando: plantas.filter((p) => p.estado === 'secando').length,
      curando: plantas.filter((p) => p.estado === 'curando').length,
      limite: Cupo.plantasFlorecidas,
      excedido: enFlor > Cupo.plantasFlorecidas,
    }
  },
}
