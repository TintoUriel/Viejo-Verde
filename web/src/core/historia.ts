import { Calendario } from './calendario'
import { AnalisisClima, type Pronostico } from './clima'
import type { Datos } from './datos'
import { Etapas, nombreEtapa, semana } from './etapas'
import { Formato } from './formato'
import {
  nombreEstado, nombreSexo, nombreTipoPlanta, nombreTipoRegistro, nombreTipoSemilla, nombreUbicacion, subtipoEfectivo,
  ultimaFecha, type Planta, type Registro,
} from './modelos'
import { diasEntre, horasEn, horasPromedio, muestrasDelDia } from './patio'
import { Planificador } from './planificador'
import { Eventos } from './sync/eventos'

/**
 * La vida entera de una planta en texto, para copiar y pegarle a cualquier IA (ChatGPT, Claude, Gemini…) y pedirle
 * un diagnóstico. Va todo: datos, dónde está, el clima, el sol que le llega y cada registro con su día y su etapa.
 */
export const Historia = {
  texto(p: Planta, datos: Datos, hoy: Date, clima?: Pronostico): string {
    const e = Etapas.estado(p, hoy)
    const l: string[] = []
    l.push('Te paso la historia completa de una planta de cannabis de autocultivo medicinal (Argentina, con REPROCANN). ' +
      'Decime si ves algún problema o algo para corregir, y qué hacer. Si para estar seguro necesitás ver algo, decime ' +
      'exactamente qué foto sacarle.')
    l.push('')

    // ─── La planta ───
    l.push('PLANTA')
    l.push(`- Nombre: ${p.nombre}`)
    l.push(`- Variedad: ${p.variedad === '' ? 'sin dato' : p.variedad} (${nombreTipoPlanta[p.tipo].toLowerCase()}, ` +
      `${nombreTipoSemilla[p.semilla].toLowerCase()}, sexo: ${nombreSexo[p.sexo].toLowerCase()})`)
    l.push(`- Germinó el ${Formato.fechaCorta(p.fechaGerminacion)} (hace ${e.dia} días)`)
    if (p.estado === 'activa') {
      l.push(`- Etapa actual: ${nombreEtapa[e.etapa]}, día ${e.dia} (semana ${semana(e)})`)
      if (p.sexo !== 'macho') l.push(`- Cosecha estimada desde el ${Formato.fechaCorta(Planificador.cosechaEstimadaDe(p))}`)
    } else {
      l.push(`- Estado: ${nombreEstado[p.estado]}`)
    }
    if (p.cosecha) {
      const c = p.cosecha
      let t = `- Cosechada el ${Formato.fechaCorta(c.fecha)}: ${Formato.numero(c.gramosHumedos)} g húmedos`
      if (c.fechaFrascos) t += `; a frascos el ${Formato.fechaCorta(c.fechaFrascos)}`
      if (c.gramosSecos !== undefined) t += `: ${Formato.numero(c.gramosSecos)} g secos`
      l.push(t)
    }
    l.push(`- Maceta de tela de ${Formato.numero(p.litrosMaceta)} L, sustrato Growmix`)
    l.push(`- Fertilizantes: Top Veg y Top Bloom (Top Crop), siempre a la mitad de la dosis de la etiqueta ` +
      `(etiqueta: Top Veg ${Formato.numero(datos.config.topVegEtiquetaMlPorLitro)} ml/L, ` +
      `Top Bloom ${Formato.numero(datos.config.topBloomEtiquetaMlPorLitro)} ml/L). Plaguicida: jabón potásico con neem.`)
    l.push('')

    // ─── Dónde está ───
    l.push('DÓNDE ESTÁ')
    l.push(`- ${nombreUbicacion[p.ubicacion]}. CABA, Buenos Aires (hemisferio sur).` +
      (p.ubicacion === 'patio' ? ' Patio exterior techado con nylon: la lluvia no moja la maceta.' : ''))
    const sol = solDeLaPlanta(p, datos, hoy)
    if (sol) l.push(`- ${sol}`)
    const c = AnalisisClima.resumen(clima, hoy)
    if (c) l.push(`- ${c}`)
    l.push('')

    // ─── Resumen ───
    const de = (tipo: Registro['tipo']) => p.registros.filter((r) => r.tipo === tipo)
    const riegos = p.registros.filter((r) => r.tipo === 'riego' || r.tipo === 'fertilizante')
    l.push('RESUMEN')
    const cuantos = (n: number, ultima: Date | undefined) => (n === 0 ? 'ninguno' : `${n} (el último ${hace(ultima, hoy)})`)
    l.push(`- Riegos: ${cuantos(riegos.length, ultimaFecha(p, ['riego', 'fertilizante']))}. ` +
      `Con fertilizante: ${cuantos(de('fertilizante').length, ultimaFecha(p, ['fertilizante']))}. ` +
      `Neem: ${cuantos(de('neem').length, ultimaFecha(p, ['neem']))}.`)
    const phs = [...p.registros].filter((r) => r.phDrenaje !== undefined).sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
    if (phs.length > 0) {
      l.push(`- pH del drenaje (el agua que sale por abajo): ` +
        phs.map((r) => `${Formato.numero(r.phDrenaje!)} el ${Formato.fechaCorta(r.fecha)}`).join(', ') + '.')
    }
    const problemas = de('problema')
    if (problemas.length > 0) l.push(`- Problemas anotados: ${problemas.length} (están en el historial).`)
    if (p.fotos.length > 0) {
      const ultima = p.fotos.map((f) => p.fechasFotos[f]).filter((f): f is Date => f !== undefined)
        .sort((a, b) => b.getTime() - a.getTime())[0]
      l.push(`- Fotos: ${p.fotos.length}${ultima ? ` (la última del ${Formato.fechaCorta(ultima)})` : ''}. ` +
        'No van en este texto: si puedo, te adjunto la más reciente.')
    }
    l.push('')

    // ─── Historial ───
    l.push('HISTORIAL COMPLETO (del más viejo al más nuevo)')
    const lista = [...p.registros].sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
    if (lista.length === 0) l.push('- Sin registros.')
    for (const r of lista) {
      const m = Eventos.etapaEn(p, r.fecha)
      l.push(`- ${Formato.fechaHora(r.fecha)} · día ${m.dia} · ${nombreEtapa[m.etapa]} · ${lineaRegistro(r)}`)
    }
    return l.join('\n')
  },
}

/** "Riego: 2,5 L de agua · pH del drenaje 6,4" (lo que haya de cada registro). */
function lineaRegistro(r: Registro): string {
  const sub = subtipoEfectivo(r)
  if (r.tipo === 'nota' && sub !== undefined) return r.nota ?? nombreTipoRegistro[r.tipo]
  const partes: string[] = []
  if (r.producto) partes.push(r.producto)
  if (r.fertilizanteML !== undefined) {
    partes.push(`${Formato.numero(r.fertilizanteML)} ml` + (r.mlPorLitro !== undefined ? ` (${Formato.numero(r.mlPorLitro)} ml/L)` : ''))
  }
  if (r.aguaML !== undefined) partes.push(`${Formato.volumen(r.aguaML)} de agua`)
  if (r.phDrenaje !== undefined) partes.push(`pH del drenaje ${Formato.numero(r.phDrenaje)}`)
  // La nota automática del fertilizante ("1,5 ml en 1,5 L") ya está en los números.
  if (r.nota && !(r.tipo === 'fertilizante' && r.fertilizanteML !== undefined && / ml en /.test(r.nota))) partes.push(`«${r.nota}»`)
  const tipo = r.tipo === 'problema' ? 'PROBLEMA' : nombreTipoRegistro[r.tipo]
  return partes.length === 0 ? tipo : `${tipo}: ${partes.join(' · ')}`
}

/** Las horas de sol directo donde está la planta (si está ubicada en el plano del patio). */
function solDeLaPlanta(p: Planta, d: Datos, hoy: Date): string | undefined {
  const patio = d.patio
  const u = patio?.ubicaciones[p.id]
  if (!patio || !u || p.ubicacion !== 'patio') return undefined
  const hoyH = horasEn(patio, u, muestrasDelDia(hoy, patio.latitud, patio.longitud))
  let t = `Sol directo estimado donde está: ${Formato.numero(hoyH)} h hoy`
  const fin = Planificador.cosechaEstimadaDe(p)
  if (p.estado === 'activa' && Calendario.dias(hoy, fin) >= 7) {
    t += `; ${Formato.numero(horasPromedio(patio, u, diasEntre(hoy, fin, 14)))} h por día en promedio hasta la cosecha`
  }
  return t + ' (las automáticas rinden bien con 8 h o más).'
}

function hace(fecha: Date | undefined, hoy: Date): string {
  if (!fecha) return 'nunca'
  const d = Calendario.dias(fecha, hoy)
  return d < 1 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`
}
