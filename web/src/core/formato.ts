import { Calendario } from './calendario'
import { redondear } from './util'

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** Números a la argentina: coma decimal, sin ",0". */
export const Formato = {
  numero(x: number): string {
    const r = redondear(x * 10) / 10
    if (r === redondear(r)) return String(r === 0 ? 0 : r)
    return r.toFixed(1).replace('.', ',')
  },

  volumen(ml: number): string {
    return ml < 1000 ? `${ml} ml` : `${Formato.numero(ml / 1000)} L`
  },

  /** "domingo 8 de noviembre". */
  fechaLarga(f: Date): string {
    return `${DIAS[Calendario.diaDeLaSemana(f)]} ${Calendario.diaDelMes(f)} de ${MESES[Calendario.mes(f) - 1]}`
  },

  /** "8/11/2026". */
  fechaCorta(f: Date): string {
    return `${Calendario.diaDelMes(f)}/${Calendario.mes(f)}/${Calendario.anio(f)}`
  },

  /** "8/11/2026 14:30". */
  fechaHora(f: Date): string {
    const h = String(Calendario.hora(f)).padStart(2, '0')
    const m = String(Calendario.minuto(f)).padStart(2, '0')
    return `${Formato.fechaCorta(f)} ${h}:${m}`
  },

  mesCorto(f: Date): string {
    return MESES_CORTOS[Calendario.mes(f) - 1]
  },

  /** "domingo 8 de noviembre" → "Domingo 8 de noviembre". */
  mayusculaInicial(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1)
  },
}
