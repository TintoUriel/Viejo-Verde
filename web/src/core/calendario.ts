// Todo se cuenta en días calendario con la hora de Buenos Aires, sin importar la zona del teléfono.
// Argentina está en UTC−3 todo el año (sin horario de verano desde 2009), así que alcanza con un
// desplazamiento fijo: es exacto, rápido y no depende de la base de zonas horarias del navegador.

const DIA = 86_400_000
const DESPLAZAMIENTO = -3 * 3_600_000

/** Número de día en Buenos Aires (días desde 1970-01-01). */
function numeroDeDia(f: Date): number {
  return Math.floor((f.getTime() + DESPLAZAMIENTO) / DIA)
}

/** La fecha "corrida" a Buenos Aires: sus componentes UTC son los de la hora local de BA. */
function enBA(f: Date): Date {
  return new Date(f.getTime() + DESPLAZAMIENTO)
}

export const Calendario = {
  inicioDelDia(f: Date): Date {
    return new Date(numeroDeDia(f) * DIA - DESPLAZAMIENTO)
  },

  /** Días calendario entre dos fechas (puede ser negativo). */
  dias(desde: Date, hasta: Date): number {
    return numeroDeDia(hasta) - numeroDeDia(desde)
  },

  fecha(anio: number, mes: number, dia: number, hora = 12, minuto = 0): Date {
    return new Date(Date.UTC(anio, mes - 1, dia, hora, minuto) - DESPLAZAMIENTO)
  },

  sumarDias(n: number, f: Date): Date {
    return new Date(f.getTime() + n * DIA)
  },

  mismoDia(a: Date, b: Date): boolean {
    return numeroDeDia(a) === numeroDeDia(b)
  },

  mes(f: Date): number {
    return enBA(f).getUTCMonth() + 1
  },

  anio(f: Date): number {
    return enBA(f).getUTCFullYear()
  },

  diaDelMes(f: Date): number {
    return enBA(f).getUTCDate()
  },

  /** 0 = domingo. */
  diaDeLaSemana(f: Date): number {
    return enBA(f).getUTCDay()
  },

  hora(f: Date): number {
    return enBA(f).getUTCHours()
  },

  minuto(f: Date): number {
    return enBA(f).getUTCMinutes()
  },

  /** Clave de día "2026-11-08", para cosas que valen solo por hoy. */
  claveDia(f: Date): string {
    return enBA(f).toISOString().slice(0, 10)
  },

  /** "2026-11-08T14:30" en hora de BA (para `<input type="datetime-local">`). */
  claveMinuto(f: Date): string {
    return enBA(f).toISOString().slice(0, 16)
  },

  /** Lee "2026-11-08" (o "2026-11-08T14:30") como hora de Buenos Aires. Sin hora: mediodía. */
  leerClave(clave: string): Date | undefined {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(clave)
    if (!m) return undefined
    const [, a, me, d, h, mi] = m
    return Calendario.fecha(+a, +me, +d, h === undefined ? 12 : +h, mi === undefined ? 0 : +mi)
  },
}
