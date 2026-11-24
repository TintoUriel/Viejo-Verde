import { Calendario } from './calendario'
import { AnalisisClima, type Pronostico } from './clima'
import { Cupo, Temporada } from './consejos'
import type { Datos } from './datos'
import { Etapas, nombreEtapa, semana } from './etapas'
import { Formato } from './formato'
import {
  nombreSexo, nombreTipoPlanta, nombreTipoSemilla, nombreUbicacion, ultimaFecha, type Planta,
} from './modelos'
import { horasEn, LADOS, muestrasDelDia, nombreRumbo, rumboLado } from './patio'
import { Planificador } from './planificador'

export const ContextoAsistente = {
  /** Instrucción de sistema fija. */
  instrucciones:
    'Sos el asistente de "Viejo Verde", una app para llevar un autocultivo de cannabis medicinal en Argentina ' +
    '(el usuario tiene REPROCANN). Respondé en español rioplatense, con voseo, corto y práctico: pasos concretos, ' +
    'sin vueltas. Si algo depende de ver la planta, decí exactamente qué mirar (hojas de abajo o de arriba, ' +
    'puntas, envés, tricomas con lupa, etc.). Para cualquier fertilizante o producto, arrancá siempre con la ' +
    'mitad de la dosis de la etiqueta. Usá los datos de las plantas que vienen en el contexto (etapa, días, ' +
    'últimos riegos y notas) para personalizar la respuesta. Si te mandan una foto, describí lo que ves antes ' +
    'de diagnosticar y, si no estás seguro, decí las dos o tres causas más probables y cómo distinguirlas.',

  /** Contexto de hoy: fecha, lugar, límites legales y resumen de las plantas. */
  contexto(datos: Datos, hoy: Date, clima?: Pronostico): string {
    const l: string[] = []
    l.push(`Fecha de hoy: ${Formato.fechaLarga(hoy)} (${Calendario.claveDia(hoy)}).`)
    l.push('Ubicación: CABA, Buenos Aires, Argentina (hemisferio sur). Cultivo en el patio, exterior pero techado con nylon ' +
      '(la lluvia no moja las macetas: hay que regar igual); machos adentro.')
    l.push(`Límites REPROCANN: hasta ${Cupo.plantasFlorecidas} plantas florecidas y hasta ${Cupo.metrosExterior} m² en exterior.`)
    const temporada = Temporada.consejo(hoy)
    l.push(`Temporada: ${temporada.titulo}. ${temporada.texto}`)
    const c = AnalisisClima.resumen(clima, hoy)
    if (c) l.push(c)
    l.push('Insumos: macetas de tela, sustrato Growmix, Top Veg y Top Bloom (Top Crop), jabón potásico con neem.')

    const cupo = Cupo.resumen(datos.plantas, hoy)
    l.push(`Resumen: ${cupo.activas} activas, ${cupo.enFlor}/${cupo.limite} en flor, ${cupo.secando} secando, ${cupo.curando} curando.`)

    const relevantes = datos.plantas.filter((p) => p.estado === 'activa' || p.estado === 'secando' || p.estado === 'curando')
    if (relevantes.length === 0) {
      l.push('Plantas: todavía no cargó ninguna.')
    } else {
      l.push('Plantas:')
      for (const p of relevantes) l.push(resumen(p, hoy))
    }
    const patio = solDelPatio(datos, hoy)
    if (patio) l.push(patio)

    const semillas = datos.paquetes.filter((k) => k.cantidad > 0)
    if (semillas.length > 0) {
      const t = semillas.map((k) =>
        `${k.nombre} (${nombreTipoPlanta[k.tipo].toLowerCase()}, ${nombreTipoSemilla[k.semilla].toLowerCase()}, ${k.cantidad})`)
      l.push('Semillas guardadas: ' + t.join('; ') + '.')
    }
    const polen = datos.polenes.filter((x) => !x.usado)
    if (polen.length > 0) {
      l.push('Polen guardado: ' + polen.map((x) => `${x.plantaOrigen}, del ${Calendario.claveDia(x.fecha)}`).join('; ') + '.')
    }
    return l.join('\n')
  },

  /** Preguntas rápidas. */
  chips: [
    '¿Qué hago esta semana?',
    'Hojas amarillas, ¿qué puede ser?',
    '¿Cómo sé si está para cosechar?',
    '¿Cómo junto el polen?',
  ],
}

/** El plano del patio y cuánto sol directo le llega hoy a cada planta (si cargó el plano). */
function solDelPatio(d: Datos, hoy: Date): string | undefined {
  const p = d.patio
  if (!p) return undefined
  const paredes = LADOS.map((l) => `${nombreRumbo(rumboLado(p, l))} ${Formato.numero(p.paredes[l].alto)} m`).join(', ')
  let t = `Patio: ${Formato.numero(p.ancho)} × ${Formato.numero(p.largo)} m, paredes (alto): ${paredes}.`
  const plantas = d.plantas.filter((x) => x.estado === 'activa' && x.ubicacion === 'patio' && p.ubicaciones[x.id])
  if (plantas.length > 0) {
    const m = muestrasDelDia(hoy, p.latitud, p.longitud)
    t += ' Sol directo estimado hoy donde está cada planta: '
      + plantas.map((x) => `${x.nombre} ${Formato.numero(horasEn(p, p.ubicaciones[x.id], m))} h`).join(', ') + '.'
  }
  return t
}

function resumen(p: Planta, hoy: Date): string {
  const e = Etapas.estado(p, hoy)
  const partes = [
    `- ${p.nombre} (${p.variedad === '' ? 'sin variedad' : p.variedad}, ${nombreTipoPlanta[p.tipo].toLowerCase()} ` +
    `${nombreTipoSemilla[p.semilla].toLowerCase()}, sexo: ${nombreSexo[p.sexo].toLowerCase()}, ` +
    `${nombreUbicacion[p.ubicacion].toLowerCase()}, maceta ${Formato.numero(p.litrosMaceta)} L)`,
  ]
  switch (p.estado) {
    case 'activa': {
      partes.push(`${nombreEtapa[e.etapa]}, día ${e.dia} (semana ${semana(e)})`)
      partes.push(`último riego: ${hace(ultimaFecha(p, ['riego', 'fertilizante']), hoy)}`)
      let fert = `fertilizante: ${hace(ultimaFecha(p, ['fertilizante']), hoy)}`
      const ferts = p.registros.filter((r) => r.tipo === 'fertilizante')
      const ultimoFert = ferts.reduce<(typeof ferts)[number] | undefined>(
        (m, r) => (!m || r.fecha.getTime() > m.fecha.getTime() ? r : m), undefined)
      if (ultimoFert?.producto !== undefined) fert +=` (${ultimoFert.producto})`
      partes.push(fert)
      partes.push(`neem: ${hace(ultimaFecha(p, ['neem']), hoy)}`)
      const conPH = p.registros.filter((r) => r.phDrenaje !== undefined).sort((a, b) => b.fecha.getTime() - a.fecha.getTime())
      if (conPH.length > 0) {
        partes.push('pH del drenaje: ' + conPH.slice(0, 3).map((r) => `${Formato.numero(r.phDrenaje!)} (${hace(r.fecha, hoy)})`).join(', '))
      }
      if (p.sexo !== 'macho') partes.push(`cosecha estimada desde el ${Formato.fechaCorta(Planificador.cosechaEstimadaDe(p))}`)
      if (p.fechaPolinizacion) partes.push(`polinizada ${hace(p.fechaPolinizacion, hoy)}`)
      break
    }
    case 'secando':
      partes.push(`secando hace ${e.diaEnEtapa} días`)
      if (p.cosecha) partes.push(`${Formato.numero(p.cosecha.gramosHumedos)} g húmedos`)
      break
    case 'curando':
      partes.push(`curando en frascos hace ${e.diaEnEtapa} días`)
      if (p.cosecha?.gramosSecos !== undefined) partes.push(`${Formato.numero(p.cosecha.gramosSecos)} g secos`)
      break
    default:
      break
  }
  let linea = partes.join('; ') + '.'
  const notas = p.registros
    .filter((r) => r.tipo === 'nota' || r.tipo === 'problema')
    .sort((a, b) => b.fecha.getTime() - a.fecha.getTime())
    .slice(0, 3)
    .flatMap((r) => (r.nota ? [`${r.tipo === 'problema' ? 'Problema' : 'Nota'} (${hace(r.fecha, hoy)}): ${r.nota}`] : []))
  if (notas.length > 0) linea += ' Últimas notas: ' + notas.join(' | ')
  return linea
}

function hace(fecha: Date | undefined, hoy: Date): string {
  if (!fecha) return 'nunca'
  const d = Calendario.dias(fecha, hoy)
  if (d < 1) return 'hoy'
  if (d === 1) return 'ayer'
  return `hace ${d} días`
}
