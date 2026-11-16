import { Calendario } from '../calendario'
import { planta, type Datos } from '../datos'
import { duracion, Etapas, nombreEtapa, type Etapa } from '../etapas'
import { Formato } from '../formato'
import {
  historial, nombreSexo, nombreTipoPlanta, nombreTipoRegistro, nombreTipoSemilla, nombreUbicacion, subtipoEfectivo,
  ultimaFecha, type PaqueteSemillas, type Planta, type Polen, type Registro, type SubtipoRegistro, type TipoPlanta,
} from '../modelos'
import { iguales, maxFecha, uuid } from '../util'
import { TE, type EventoSync, type PlantaSync, type TipoEvento } from './modelos'

/**
 * Convierte lo que pasa en la app en eventos para la hoja "Registro" y en filas para la hoja "Plantas".
 *
 * Los IDs son estables cuando se puede (un registro usa su propio UUID; un cambio de etapa,
 * "etapa-<planta>-<etapa>"), así "Sincronizar todo" genera exactamente los mismos IDs que el envío
 * normal y la planilla los ignora si ya los tiene.
 */
export const Eventos = {
  // ─── Cambios (antes → después) ───

  /** Eventos que salen de un cambio en los datos. No incluye los cambios de etapa (ver `cambiosDeEtapa`). */
  detectar(a: Datos, d: Datos, ahora: Date, app: string, nuevoID: () => string = uuid): EventoSync[] {
    const r: EventoSync[] = []

    // --- Plantas ---
    for (const p of d.plantas) {
      const viejo = planta(a, p.id)
      if (!viejo) {
        // Planta nueva: su historial (germinación y lo que traiga) y sus fotos.
        r.push(...ordenados(p.registros).flatMap((x) => opcional(Eventos.evento(x, p, app))))
        r.push(...p.fotos.map((f) => eventoFoto(f, p, app)))
        continue
      }
      if (iguales(viejo, p)) continue

      const anteriores = new Map<string, Registro>()
      for (const x of viejo.registros) if (!anteriores.has(x.id)) anteriores.set(x.id, x)
      const actuales = new Set(p.registros.map((x) => x.id))
      const nuevos = p.registros.filter((x) => !anteriores.has(x.id))

      r.push(...ordenados(nuevos).flatMap((x) => opcional(Eventos.evento(x, p, app))))

      for (const reg of p.registros) {
        const ant = anteriores.get(reg.id)
        if (ant && !iguales(ant, reg)) {
          r.push(base(nuevoID(), ahora, TE.correccion, p, app, `Corrige ${reg.id}: ${resumen(ant)} → ${resumen(reg)}`))
        }
      }
      for (const ant of viejo.registros) {
        if (!actuales.has(ant.id)) r.push(base(nuevoID(), ahora, TE.borrado, p, app, `Borra ${ant.id}: ${resumen(ant)}`))
      }

      // Fotos (solo el hecho, nunca la imagen).
      const fotosViejas = new Set(viejo.fotos)
      const fotosNuevas = new Set(p.fotos)
      r.push(...p.fotos.filter((f) => !fotosViejas.has(f)).map((f) => eventoFoto(f, p, app)))
      for (const f of viejo.fotos) {
        if (!fotosNuevas.has(f)) r.push(base(nuevoID(), ahora, TE.borrado, p, app, `Borra ${Eventos.idFoto(f)}: foto`))
      }

      // Ubicación cambiada a mano (si fue con "Lo llevé adentro", ya va como registro).
      if (viejo.ubicacion !== p.ubicacion && !nuevos.some((x) => subtipoEfectivo(x) === 'ubicacion')) {
        r.push(base(nuevoID(), ahora, TE.cambioUbicacion, p, app,
          `${nombreUbicacion[viejo.ubicacion]} → ${nombreUbicacion[p.ubicacion]}`))
      }

      // Datos de la planta corregidos en "Editar planta".
      const cambios = cambiosDeDatos(viejo, p, !nuevos.some((x) => x.tipo === 'sexo'))
      if (cambios.length > 0) {
        r.push(base(nuevoID(), ahora, TE.correccion, p, app, 'Datos de la planta: ' + cambios.join('; ')))
      }
    }
    for (const viejo of a.plantas) {
      if (!planta(d, viejo.id)) {
        r.push(base(nuevoID(), ahora, TE.borrado, viejo, app,
          `Borré la planta ${viejo.nombre} (tenía ${viejo.registros.length} registros)`))
      }
    }

    // --- Semillas ---
    for (const pack of d.paquetes) {
      const viejo = a.paquetes.find((k) => k.id === pack.id)
      if (!viejo) {
        r.push(altaPaquete(pack, d, app))
        continue
      }
      const delta = pack.cantidad - viejo.cantidad
      if (delta !== 0) {
        let nota = `${pack.nombre}: ${viejo.cantidad} → ${pack.cantidad}`
        const germinadas = d.plantas.filter((p) => p.paqueteOrigenID === pack.id && !planta(a, p.id))
        if (delta < 0 && germinadas.length > 0) nota += '. Germiné: ' + germinadas.map((p) => p.nombre).join(', ')
        r.push(eventoPaquete(nuevoID(), ahora, delta > 0 ? TE.altaSemillas : TE.bajaSemillas, pack, d, Math.abs(delta), nota, app))
      }
      const cambios: string[] = []
      if (viejo.nombre !== pack.nombre) cambios.push(`nombre: ${viejo.nombre} → ${pack.nombre}`)
      if (viejo.banco !== pack.banco) cambios.push(`banco: ${viejo.banco} → ${pack.banco}`)
      if (viejo.tipo !== pack.tipo) cambios.push(`tipo: ${nombreTipoPlanta[viejo.tipo]} → ${nombreTipoPlanta[pack.tipo]}`)
      if (viejo.semilla !== pack.semilla) {
        cambios.push(`semilla: ${nombreTipoSemilla[viejo.semilla]} → ${nombreTipoSemilla[pack.semilla]}`)
      }
      if (cambios.length > 0) {
        r.push(eventoPaquete(nuevoID(), ahora, TE.correccion, pack, d, undefined,
          `Corrige ${Eventos.idPaquete(pack.id)}: ` + cambios.join('; '), app))
      }
    }
    for (const viejo of a.paquetes) {
      if (!d.paquetes.some((k) => k.id === viejo.id)) {
        r.push(eventoPaquete(nuevoID(), ahora, TE.bajaSemillas, viejo, a, viejo.cantidad, `Borré el pack ${viejo.nombre}`, app))
      }
    }

    // --- Polen ---
    for (const polen of d.polenes) {
      const viejo = a.polenes.find((x) => x.id === polen.id)
      if (!viejo) {
        r.push(eventoPolen(Eventos.idPolen(polen.id), polen.fecha, TE.polenJuntado, polen, d,
          polen.notas === '' ? undefined : polen.notas, app))
        continue
      }
      if (!viejo.usado && polen.usado) {
        r.push(eventoPolen(nuevoID(), ahora, TE.polenUsado, polen, d, undefined, app))
      } else if (viejo.usado && !polen.usado) {
        r.push(eventoPolen(nuevoID(), ahora, TE.correccion, polen, d,
          `Corrige ${Eventos.idPolen(polen.id)}: marcado como no usado`, app))
      }
    }
    for (const viejo of a.polenes) {
      if (!d.polenes.some((x) => x.id === viejo.id)) {
        r.push(eventoPolen(nuevoID(), ahora, TE.borrado, viejo, a,
          `Borra ${Eventos.idPolen(viejo.id)}: polen de ${viejo.plantaOrigen}`, app))
      }
    }

    // --- Tareas salteadas ("Hoy no") ---
    for (const [tareaID, dia] of Object.entries(d.pospuestas).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))) {
      const antes = a.pospuestas[tareaID]
      if (!antes || antes.getTime() !== dia.getTime()) r.push(tareaSalteada(tareaID, d, ahora, nuevoID(), app))
    }

    return r
  },

  // ─── Registro → evento ───

  /** El evento de un registro del historial (undefined si lo cubre otro evento, como el polen o las semillas propias). */
  evento(reg: Registro, p: Planta, app: string): EventoSync | undefined {
    const e = base(reg.id, reg.fecha, TE.nota, p, app, reg.nota)
    asignar(e, 'producto', reg.producto)
    switch (reg.tipo) {
      case 'riego':
        if (reg.producto === 'Lluvia') {
          e.tipo = TE.lluvia
          delete e.producto
          const mm = reg.nota === undefined ? undefined : numeroEn(reg.nota, 'mm')
          if (mm !== undefined) {
            e.cantidad = mm
            e.unidad = 'mm'
            delete e.nota
          }
        } else {
          e.tipo = TE.riego
          if (reg.aguaML !== undefined) {
            e.cantidad = reg.aguaML
            e.unidad = 'ml'
          }
        }
        break
      case 'fertilizante': {
        e.tipo = TE.fertilizante
        const ml = reg.fertilizanteML ?? (reg.nota === undefined ? undefined : numeroEn(reg.nota, 'ml'))
        if (ml !== undefined) {
          e.cantidad = ml
          e.unidad = 'ml'
        }
        if (reg.mlPorLitro !== undefined && reg.mlPorLitro > 0) {
          e.dosis = reg.mlPorLitro
        } else if (ml !== undefined && reg.aguaML !== undefined && reg.aguaML > 0) {
          e.dosis = Math.round((ml * 1000) / reg.aguaML * 100) / 100
        }
        // La nota automática ("1,5 ml en 1,5 L") ya está en las columnas: se cambia por el agua.
        const partes: string[] = []
        if (reg.aguaML !== undefined) partes.push(`Agua: ${reg.aguaML} ml`)
        if (reg.nota !== undefined && !esNotaAutomaticaDeFertilizante(reg.nota)) partes.push(reg.nota)
        asignar(e, 'nota', partes.length === 0 ? undefined : partes.join('. '))
        break
      }
      case 'neem':
        e.tipo = TE.neem
        break
      case 'nota':
        switch (subtipoEfectivo(reg)) {
          case 'ubicacion': e.tipo = TE.cambioUbicacion; break
          case 'terminada': e.tipo = TE.finCurado; break
          case 'descartada': e.tipo = TE.descarte; break
          case 'polen':
          case 'semillasPropias': return undefined
          case undefined: e.tipo = TE.nota; break
        }
        break
      case 'problema':
        e.tipo = TE.problema
        break
      case 'sexo':
        e.tipo = TE.sexado
        break
      case 'polinizacion':
        e.tipo = TE.polinizacion
        break
      case 'cosecha':
        e.tipo = TE.cosecha
        asignar(e, 'cantidad', (reg.nota === undefined ? undefined : numeroEn(reg.nota, 'g')) ?? p.cosecha?.gramosHumedos)
        asignar(e, 'unidad', e.cantidad === undefined ? undefined : 'g')
        e.nota = 'Empieza el secado'
        break
      case 'secado':
        e.tipo = TE.aFrascos
        asignar(e, 'cantidad', (reg.nota === undefined ? undefined : numeroEn(reg.nota, 'g')) ?? p.cosecha?.gramosSecos)
        asignar(e, 'unidad', e.cantidad === undefined ? undefined : 'g')
        e.nota = 'Fin del secado'
        break
      case 'germinacion':
        e.tipo = TE.germinacion
        e.nota = `${nombreTipoSemilla[p.semilla]}, maceta de ${Formato.numero(p.litrosMaceta)} L, ${nombreUbicacion[p.ubicacion].toLowerCase()}`
        break
      case 'curado':
        e.tipo = TE.aperturaFrascos
        break
      case 'revision':
        e.tipo = TE.revision
        break
    }
    return e
  },

  // ─── Etapas ───

  /** Un evento por cada etapa de cultivo que ya empezó (sin contar plántula, que es la germinación).
   *  La fecha es el día en que empezó la etapa, no el día en que se detectó. */
  cambiosDeEtapa(datos: Datos, hoy: Date, app: string): EventoSync[] {
    const r: EventoSync[] = []
    for (const p of datos.plantas) {
      const finCultivo = finDelCultivo(p)
      const fin = finCultivo && finCultivo.getTime() < hoy.getTime() ? finCultivo : hoy
      const diaFin = Calendario.dias(p.fechaGerminacion, fin)
      const inicio = Calendario.inicioDelDia(p.fechaGerminacion)
      for (const t of Etapas.de(p)) {
        if (duracion(t) > 0 && t.desdeDia > 0 && t.desdeDia <= diaFin) {
          const e = base(Eventos.idEtapa(p.id, t.etapa), Calendario.sumarDias(t.desdeDia, inicio), TE.cambioEtapa, p, app,
            `Empieza ${nombreEtapa[t.etapa].toLowerCase()}`)
          e.etapa = nombreEtapa[t.etapa]
          e.dia = t.desdeDia
          r.push(e)
        }
      }
    }
    return r
  },

  /** Etapa y día de cultivo que tenía la planta en ese momento. En el instante exacto de la cosecha
   *  o del pase a frascos cuenta todavía la etapa anterior. */
  etapaEn(p: Planta, fecha: Date): { etapa: Etapa; dia: number } {
    const dia = Calendario.dias(p.fechaGerminacion, fecha)
    const t = fecha.getTime()
    const term = fechaDe(p, 'terminada')
    if (term && t > term.getTime() && p.estado === 'terminada') return { etapa: 'terminada', dia }
    const desc = fechaDe(p, 'descartada')
    if (desc && t > desc.getTime() && p.estado === 'descartada') return { etapa: 'descartada', dia }
    const c = p.cosecha
    if (c) {
      if (c.fechaFrascos && t > c.fechaFrascos.getTime()) return { etapa: 'curado', dia }
      if (t > c.fecha.getTime()) return { etapa: 'secado', dia }
    }
    return { etapa: Etapas.etapaDeCultivo(dia, Etapas.de(p)).etapa, dia }
  },

  // ─── Historial completo ("Sincronizar todo") ───

  /** Todo lo que se puede reconstruir de los datos, con los mismos IDs que el envío normal. */
  historial(datos: Datos, hoy: Date, app: string): EventoSync[] {
    const r: EventoSync[] = []
    for (const p of datos.plantas) {
      r.push(...p.registros.flatMap((x) => opcional(Eventos.evento(x, p, app))))
      r.push(...p.fotos.map((f) => eventoFoto(f, p, app)))
    }
    r.push(...Eventos.cambiosDeEtapa(datos, hoy, app))
    r.push(...datos.paquetes.map((k) => altaPaquete(k, datos, app)))
    for (const polen of datos.polenes) {
      r.push(eventoPolen(Eventos.idPolen(polen.id), polen.fecha, TE.polenJuntado, polen, datos,
        polen.notas === '' ? undefined : polen.notas, app))
    }
    return r.sort((x, y) => x.fecha.getTime() - y.fecha.getTime())
  },

  // ─── Hoja "Plantas" ───

  fila(p: Planta, hoy: Date, borrada = false): PlantaSync {
    const e = Etapas.estado(p, hoy)
    const ultimaNota = historial(p).find((x) => (x.tipo === 'nota' && subtipoEfectivo(x) === undefined) || x.tipo === 'problema')
    const f: PlantaSync = {
      id: p.id, nombre: p.nombre, variedad: p.variedad, autoFoto: autoFoto(p.tipo),
      semilla: nombreTipoSemilla[p.semilla], sexo: nombreSexo[p.sexo], ubicacion: nombreUbicacion[p.ubicacion],
      litros: p.litrosMaceta, germinacion: Calendario.claveDia(p.fechaGerminacion),
      etapa: borrada ? 'Borrada' : nombreEtapa[e.etapa], dia: e.dia,
      estado: borrada ? 'borrada' : p.estado,
      notas: ultimaNota
        ? `${ultimaNota.tipo === 'problema' ? 'Problema' : 'Nota'} ${Formato.fechaCorta(ultimaNota.fecha)}: ${ultimaNota.nota ?? ''}`
        : '',
      actualizado: hoy,
    }
    asignar(f, 'ultimoRiego', ultimaFecha(p, ['riego', 'fertilizante']))
    asignar(f, 'ultimoFertilizante', ultimaFecha(p, ['fertilizante']))
    asignar(f, 'ultimoNeem', ultimaFecha(p, ['neem']))
    asignar(f, 'gramosHumedos', p.cosecha?.gramosHumedos)
    asignar(f, 'gramosSecos', p.cosecha?.gramosSecos)
    return f
  },

  /** Filas de "Plantas" que cambiaron (incluye las borradas, con estado "borrada"). */
  filasCambiadas(a: Datos, d: Datos, hoy: Date): PlantaSync[] {
    return [
      ...d.plantas.filter((p) => !iguales(planta(a, p.id), p)).map((p) => Eventos.fila(p, hoy)),
      ...a.plantas.filter((p) => !planta(d, p.id)).map((p) => Eventos.fila(p, hoy, true)),
    ]
  },

  // ─── IDs ───

  idEtapa: (plantaID: string, etapa: Etapa) => `etapa-${plantaID}-${etapa}`,
  idFoto: (nombre: string) => `foto-${nombre}`,
  idPaquete: (id: string) => `semillas-${id}`,
  idPolen: (id: string) => `polen-${id}`,
}

// ─── Ayudas ───

const opcional = <T>(x: T | undefined): T[] => (x === undefined ? [] : [x])

const ordenados = (r: Registro[]) => [...r].sort((a, b) => a.fecha.getTime() - b.fecha.getTime())

function asignar<T extends object, K extends keyof T>(o: T, k: K, v: T[K] | undefined): void {
  if (v === undefined) delete o[k]
  else o[k] = v
}

function autoFoto(t: TipoPlanta): string {
  return t === 'auto' ? 'Auto' : 'Foto'
}

function base(id: string, fecha: Date, tipo: TipoEvento, p: Planta, app: string, nota?: string): EventoSync {
  const momento = Eventos.etapaEn(p, fecha)
  const e: EventoSync = { id, fecha, tipo, plantaID: p.id, planta: p.nombre, variedad: p.variedad,
    autoFoto: autoFoto(p.tipo), etapa: nombreEtapa[momento.etapa], dia: momento.dia, app }
  if (nota !== undefined) e.nota = nota
  return e
}

function eventoFoto(nombre: string, p: Planta, app: string): EventoSync {
  return base(Eventos.idFoto(nombre), p.fechasFotos[nombre] ?? p.fechaGerminacion, TE.foto, p, app, 'Saqué una foto')
}

function altaPaquete(pack: PaqueteSemillas, datos: Datos, app: string): EventoSync {
  let nota = `${pack.banco} · ${nombreTipoPlanta[pack.tipo]} ${nombreTipoSemilla[pack.semilla].toLowerCase()}`
  if (pack.propias) nota += ' · propias'
  return eventoPaquete(Eventos.idPaquete(pack.id), pack.fechaCompra, TE.altaSemillas, pack, datos, pack.cantidad, nota, app)
}

function eventoPaquete(id: string, fecha: Date, tipo: TipoEvento, pack: PaqueteSemillas, datos: Datos,
  cantidad: number | undefined, nota: string, app: string): EventoSync {
  const madre = pack.plantaMadreID ? planta(datos, pack.plantaMadreID) : undefined
  const e: EventoSync = madre ? base(id, fecha, tipo, madre, app, nota) : { id, fecha, tipo, autoFoto: autoFoto(pack.tipo), nota, app }
  e.producto = pack.nombre
  asignar(e, 'cantidad', cantidad)
  asignar(e, 'unidad', cantidad === undefined ? undefined : 'semillas')
  return e
}

function eventoPolen(id: string, fecha: Date, tipo: TipoEvento, polen: Polen, datos: Datos, nota: string | undefined,
  app: string): EventoSync {
  const origen = polen.plantaOrigenID ? planta(datos, polen.plantaOrigenID) : undefined
  let e: EventoSync
  if (origen) {
    e = base(id, fecha, tipo, origen, app, nota)
  } else {
    e = { id, fecha, tipo, planta: polen.plantaOrigen, app }
    if (nota !== undefined) e.nota = nota
  }
  e.producto = `Polen de ${polen.plantaOrigen}`
  return e
}

const NOMBRE_TAREA: Record<string, string> = {
  machoPatio: 'llevar el macho adentro', cosecha: 'revisar tricomas', hongos: 'revisar hongos',
  sexado: 'revisar el sexo', machoPolen: 'juntar polen', semillas: 'revisar semillas',
  fertilizante: 'fertilizar', riego: 'regar', neem: 'neem', secado: 'probar los tallitos',
  curado: 'abrir los frascos',
}

function tareaSalteada(tareaID: string, datos: Datos, ahora: Date, id: string, app: string): EventoSync {
  // El ID de tarea es "<tipo>-<uuid de la planta>".
  const guion = tareaID.indexOf('-')
  const tipo = guion >= 0 ? tareaID.slice(0, guion) : tareaID
  const resto = guion >= 0 ? tareaID.slice(guion + 1) : undefined
  const nota = `Hoy no: ${NOMBRE_TAREA[tipo] ?? tipo}`
  const p = resto ? planta(datos, resto) : undefined
  if (p) return base(id, ahora, TE.tareaSalteada, p, app, nota)
  return { id, fecha: ahora, tipo: TE.tareaSalteada, nota, app }
}

/** Cuándo dejó de ser una planta viva (cosecha, fin o descarte), si ya pasó. */
function finDelCultivo(p: Planta): Date | undefined {
  if (p.cosecha) return p.cosecha.fecha
  if (p.estado === 'terminada') return fechaDe(p, 'terminada')
  if (p.estado === 'descartada') return fechaDe(p, 'descartada')
  return undefined
}

function fechaDe(p: Planta, subtipo: SubtipoRegistro): Date | undefined {
  return maxFecha(p.registros.filter((x) => subtipoEfectivo(x) === subtipo).map((x) => x.fecha))
}

function cambiosDeDatos(a: Planta, b: Planta, conSexo: boolean): string[] {
  const c: string[] = []
  if (a.nombre !== b.nombre) c.push(`nombre: ${a.nombre} → ${b.nombre}`)
  if (a.variedad !== b.variedad) c.push(`variedad: ${a.variedad} → ${b.variedad}`)
  if (a.tipo !== b.tipo) c.push(`tipo: ${nombreTipoPlanta[a.tipo]} → ${nombreTipoPlanta[b.tipo]}`)
  if (a.semilla !== b.semilla) c.push(`semilla: ${nombreTipoSemilla[a.semilla]} → ${nombreTipoSemilla[b.semilla]}`)
  if (conSexo && a.sexo !== b.sexo) c.push(`sexo: ${nombreSexo[a.sexo]} → ${nombreSexo[b.sexo]}`)
  if (a.litrosMaceta !== b.litrosMaceta) {
    c.push(`maceta: ${Formato.numero(a.litrosMaceta)} → ${Formato.numero(b.litrosMaceta)} L`)
  }
  if (!Calendario.mismoDia(a.fechaGerminacion, b.fechaGerminacion)) {
    c.push(`germinación: ${Formato.fechaCorta(a.fechaGerminacion)} → ${Formato.fechaCorta(b.fechaGerminacion)}`)
  }
  return c
}

/** "Riego 8/11/2026, 1500 ml, «nota»". */
function resumen(r: Registro): string {
  const partes = [`${nombreTipoRegistro[r.tipo]} ${Formato.fechaCorta(r.fecha)}`]
  if (r.producto) partes.push(r.producto)
  if (r.aguaML !== undefined) partes.push(`${r.aguaML} ml`)
  if (r.nota) partes.push(`«${r.nota}»`)
  return partes.join(', ')
}

/** El número del principio si el texto es "<número> <unidad>…" (ej. "12,5 g húmedos", "8 mm"). */
export function numeroEn(texto: string, unidad: string): number | undefined {
  const palabras = texto.split(' ').filter((x) => x !== '')
  if (palabras.length < 2 || palabras[1] !== unidad) return undefined
  const s = palabras[0].replace(',', '.')
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return undefined
  return Number(s)
}

function esNotaAutomaticaDeFertilizante(n: string): boolean {
  return numeroEn(n, 'ml') !== undefined && n.includes(' ml en ')
}
