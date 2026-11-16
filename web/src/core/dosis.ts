import { Etapas, type Etapa } from './etapas'
import { Formato } from './formato'
import { nombreFertilizante, type Fertilizante, type Planta } from './modelos'
import { redondear } from './util'

/** Dosis de la etiqueta de cada producto (ml por litro). Se editan en Ajustes; la app usa la MITAD. */
export interface ConfigDosis {
  topVegEtiquetaMlPorLitro: number
  topBloomEtiquetaMlPorLitro: number
}

export function configPorDefecto(): ConfigDosis {
  return { topVegEtiquetaMlPorLitro: 2, topBloomEtiquetaMlPorLitro: 2 }
}

export function etiqueta(c: ConfigDosis, f: Fertilizante): number {
  return f === 'topVeg' ? c.topVegEtiquetaMlPorLitro : c.topBloomEtiquetaMlPorLitro
}

export interface Dosis {
  /** Agua para un riego, si la maceta está liviana. */
  aguaML: number
  /** Producto que corresponde en esta etapa (undefined = solo agua). */
  fertilizante?: Fertilizante
  /** Mililitros por litro que se usan (mitad de la etiqueta). */
  mlPorLitro: number
  /** Mililitros totales de fertilizante para esa agua. */
  fertilizanteML: number
}

export const textoAgua = (d: Dosis): string => Formato.volumen(d.aguaML)

/** Ej.: "1,5 ml de Top Veg en 1,5 L de agua". */
export function textoFertilizante(d: Dosis): string | undefined {
  if (!d.fertilizante) return undefined
  return `${Formato.numero(d.fertilizanteML)} ml de ${nombreFertilizante[d.fertilizante]} en ${textoAgua(d)} de agua`
}

export const CalculoDosis = {
  /** Qué producto toca en cada etapa. */
  fertilizante(etapa: Etapa): Fertilizante | undefined {
    switch (etapa) {
      case 'crecimiento': return 'topVeg'
      case 'prefloracion':
      case 'floracion': return 'topBloom'
      default: return undefined
    }
  },

  /** Agua por riego (cuando la maceta está liviana), pensada para tela de 20 L y escalada por litros.
   *  Plántula no escala: la raíz es chica sin importar la maceta. */
  aguaML(etapa: Etapa, diaEnEtapa: number, litrosMaceta: number): number {
    const escala = Math.max(litrosMaceta, 1) / 20
    let ml: number
    switch (etapa) {
      case 'plantula': ml = 100 + 15 * Math.min(Math.max(diaEnEtapa, 0), 10); break
      case 'crecimiento': ml = Math.min(750 + 60 * Math.max(diaEnEtapa, 0), 2500) * escala; break
      case 'prefloracion': ml = 2500 * escala; break
      case 'floracion':
      case 'maduracion': ml = 3000 * escala; break
      case 'listaCosecha': ml = 2500 * escala; break
      default: ml = 0
    }
    return redondear(ml / 50) * 50
  },

  dosis(etapa: Etapa, diaEnEtapa: number, litrosMaceta: number, config: ConfigDosis): Dosis {
    const agua = CalculoDosis.aguaML(etapa, diaEnEtapa, litrosMaceta)
    const f = CalculoDosis.fertilizante(etapa)
    if (!f) return { aguaML: agua, mlPorLitro: 0, fertilizanteML: 0 }
    const porLitro = etiqueta(config, f) / 2
    // Redondeado a medio ml (lo que se puede medir con una jeringa), mínimo 0,5.
    const total = Math.max(redondear((agua / 1000) * porLitro * 2) / 2, 0.5)
    return { aguaML: agua, fertilizante: f, mlPorLitro: porLitro, fertilizanteML: total }
  },

  dePlanta(p: Planta, hoy: Date, config: ConfigDosis): Dosis {
    const e = Etapas.estado(p, hoy)
    return CalculoDosis.dosis(e.etapa, e.diaEnEtapa, p.litrosMaceta, config)
  },
}
