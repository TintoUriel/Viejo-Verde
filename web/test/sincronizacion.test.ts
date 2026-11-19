import { describe, expect, it } from 'vitest'
import { Calendario } from '../src/core/calendario'
import { D, datosVacios, planta, type Datos } from '../src/core/datos'
import { nombreEtapa } from '../src/core/etapas'
import { nuevoPaquete, nuevoRegistro } from '../src/core/modelos'
import { Bandeja } from '../src/core/sync/bandeja'
import { Eventos } from '../src/core/sync/eventos'
import { CuerpoSync, LectorSync, TE, type EventoSync, type PlantaSync } from '../src/core/sync/modelos'
import { idTarea } from '../src/core/tareas'
import { aJSON } from '../src/core/util'
import { auto, hace, hoyTest } from './ayudas'

const app = 'web 1.0'

/** Aplica un cambio y devuelve los eventos que genera. */
function eventos(d: Datos, cambio: (d: Datos) => void, ahora: Date = hoyTest): EventoSync[] {
  const antes = structuredClone(d)
  cambio(d)
  return Eventos.detectar(antes, d, ahora, app)
}

type J = Record<string, any>

describe('Mapeo de eventos', () => {
  it('riego a JSON', () => {
    const d = datosVacios()
    const p = auto({ dia: 23 })
    D.agregarPlanta(d, p)
    const ev = eventos(d, (x) => D.registrar(x, 'riego', p.id, hoyTest, { aguaML: 1500 }))
    expect(ev.length).toBe(1)
    const registro = planta(d, p.id)!.registros.at(-1)!
    expect(ev[0].id).toBe(registro.id)

    const json: J = JSON.parse(CuerpoSync.json({ eventos: ev, plantas: [] }, 'secreto'))
    expect(json.token).toBe('secreto')
    expect(json.accion).toBeUndefined()
    const e = json.eventos[0]
    expect(e.id).toBe(registro.id)
    expect(e.tipo).toBe('riego')
    expect(e.plantaID).toBe(p.id)
    expect(e.planta).toBe('Banana')
    expect(e.variedad).toBe('Banana Blaze')
    expect(e.autoFoto).toBe('Auto')
    expect(e.etapa).toBe('Prefloración')
    expect(e.dia).toBe(23)
    expect(e.cantidad).toBe(1500)
    expect(e.unidad).toBe('ml')
    expect(e.app).toBe(app)
    // Fecha ISO 8601 en UTC, sin milisegundos (el script la pasa a hora de Buenos Aires).
    expect(e.fecha).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
    // Lo que no aplica no viaja.
    expect('dosis' in e).toBe(false)
    expect('producto' in e).toBe(false)
  })

  it('la prueba de conexión no manda eventos', () => {
    const json: J = JSON.parse(CuerpoSync.prueba('t'))
    expect(json.accion).toBe('probar')
    expect(json.eventos.length).toBe(0)
  })

  it('fertilizante con dosis', () => {
    const d = datosVacios()
    const p = auto({ dia: 15 })
    D.agregarPlanta(d, p)
    const [e] = eventos(d, (x) => D.registrar(x, 'fertilizante', p.id, hoyTest,
      { producto: 'Top Veg', nota: '1,5 ml en 1,5 L', aguaML: 1500, fertilizanteML: 1.5, mlPorLitro: 1 }))
    expect(e.tipo).toBe(TE.fertilizante)
    expect(e.producto).toBe('Top Veg')
    expect(e.cantidad).toBe(1.5)
    expect(e.unidad).toBe('ml')
    expect(e.dosis).toBe(1)
    expect(e.nota).toBe('Agua: 1500 ml')
  })

  it('un fertilizante viejo sale del texto', () => {
    const r = nuevoRegistro(hoyTest, 'fertilizante', { producto: 'Top Bloom', nota: '2,5 ml en 2,5 L', aguaML: 2500 })
    const e = Eventos.evento(r, auto({ dia: 15 }), app)!
    expect(e.cantidad).toBe(2.5)
    expect(e.dosis).toBe(1)
  })

  it('lluvia en mm (riegos "Lluvia" que ya estaban en el historial)', () => {
    const d = datosVacios()
    const p = auto({ dia: 30 })
    D.agregarPlanta(d, p)
    const [e] = eventos(d, (x) => { D.registrar(x, 'riego', p.id, hoyTest, { producto: 'Lluvia', nota: '12 mm' }) })
    expect(e.tipo).toBe(TE.lluvia)
    expect(e.cantidad).toBe(12)
    expect(e.unidad).toBe('mm')
    expect(e.producto).toBeUndefined()
  })

  it('las notas automáticas tienen su tipo', () => {
    const d = datosVacios()
    const macho = auto({ dia: 30, semilla: 'regular', sexo: 'macho', nombre: 'Macho' })
    D.agregarPlanta(d, macho)

    expect(eventos(d, (x) => D.moverAdentro(x, macho.id, hoyTest)).map((e) => e.tipo)).toEqual([TE.cambioUbicacion]) // uno solo

    const polen = eventos(d, (x) => { D.juntarPolen(x, macho.id, hoyTest) })
    expect(polen.map((e) => e.tipo)).toEqual([TE.polenJuntado])
    expect(polen[0].id).toBe(Eventos.idPolen(d.polenes[0].id))

    expect(eventos(d, (x) => D.descartar(x, macho.id, hoyTest)).map((e) => e.tipo)).toEqual([TE.descarte])

    // Un registro viejo (sin subtipo) se reconoce por el texto.
    const viejo = nuevoRegistro(hoyTest, 'nota', { nota: 'Curado completo' })
    expect(Eventos.evento(viejo, macho, app)?.tipo).toBe(TE.finCurado)
  })

  it('sexado y ubicación editada a mano', () => {
    const d = datosVacios()
    const p = auto({ dia: 25, semilla: 'regular' })
    D.agregarPlanta(d, p)
    expect(eventos(d, (x) => D.marcarSexo(x, 'hembra', p.id, hoyTest)).map((e) => e.tipo)).toEqual([TE.sexado])

    const editada = structuredClone(planta(d, p.id)!)
    editada.ubicacion = 'interior'
    editada.litrosMaceta = 30
    const ev = eventos(d, (x) => D.actualizar(x, editada))
    expect(new Set(ev.map((e) => e.tipo))).toEqual(new Set([TE.cambioUbicacion, TE.correccion]))
    expect(ev.find((e) => e.tipo === TE.cambioUbicacion)?.nota).toBe('Patio → Adentro')
    expect(ev.find((e) => e.tipo === TE.correccion)?.nota).toContain('maceta: 20 → 30 L')
  })

  it('cosecha, frascos y curado con gramos y la etapa del momento', () => {
    const d = datosVacios()
    const p = auto({ dia: 90 })
    D.agregarPlanta(d, p)

    const [cosecha] = eventos(d, (x) => D.cosechar(x, p.id, hoyTest, 210))
    expect(cosecha.tipo).toBe(TE.cosecha)
    expect(cosecha.cantidad).toBe(210)
    expect(cosecha.unidad).toBe('g')
    expect(cosecha.etapa).toBe(nombreEtapa.listaCosecha) // la de antes de cortar
    expect(cosecha.dia).toBe(90)

    const diezDias = Calendario.sumarDias(10, hoyTest)
    const [frascos] = eventos(d, (x) => D.pasarAFrascos(x, p.id, diezDias, 52.5), diezDias)
    expect(frascos.tipo).toBe(TE.aFrascos)
    expect(frascos.cantidad).toBe(52.5)
    expect(frascos.etapa).toBe(nombreEtapa.secado)

    const apertura = Calendario.sumarDias(11, hoyTest)
    const [abri] = eventos(d, (x) => D.registrar(x, 'curado', p.id, apertura), apertura)
    expect(abri.tipo).toBe(TE.aperturaFrascos)
    expect(abri.etapa).toBe(nombreEtapa.curado)

    const fin = Calendario.sumarDias(40, hoyTest)
    expect(eventos(d, (x) => D.terminar(x, p.id, fin), fin).map((e) => e.tipo)).toEqual([TE.finCurado])
  })

  it('la corrección y el borrado referencian el original', () => {
    const d = datosVacios()
    const p = auto({ dia: 20 })
    D.agregarPlanta(d, p)
    eventos(d, (x) => D.registrar(x, 'riego', p.id, hoyTest, { aguaML: 1000 }))
    const r = { ...planta(d, p.id)!.registros.at(-1)! }

    r.aguaML = 2000
    const [correccion] = eventos(d, (x) => D.editarRegistro(x, r, p.id))
    expect(correccion.tipo).toBe(TE.correccion)
    expect(correccion.id).not.toBe(r.id) // es un evento nuevo, no pisa el viejo
    expect(correccion.nota).toContain(r.id)
    expect(correccion.nota).toContain('1000 ml')
    expect(correccion.nota).toContain('2000 ml')

    const [borrado] = eventos(d, (x) => D.borrarRegistro(x, r.id, p.id))
    expect(borrado.tipo).toBe(TE.borrado)
    expect(borrado.nota).toContain(r.id)

    const [plantaBorrada] = eventos(d, (x) => D.borrarPlanta(x, p.id))
    expect(plantaBorrada.tipo).toBe(TE.borrado)
    expect(plantaBorrada.plantaID).toBe(p.id)
  })

  it('semillas', () => {
    const d = datosVacios()
    const pack = nuevoPaquete({ nombre: 'Banana Blaze', banco: 'Dutch Passion', tipo: 'auto', semilla: 'feminizada',
      cantidad: 5, fechaCompra: hoyTest })
    const [alta] = eventos(d, (x) => D.agregarPaquete(x, pack))
    expect(alta.tipo).toBe(TE.altaSemillas)
    expect(alta.id).toBe(Eventos.idPaquete(pack.id))
    expect(alta.cantidad).toBe(5)
    expect(alta.unidad).toBe('semillas')

    const ev = eventos(d, (x) => D.agregarPlanta(x, auto({ dia: 0, nombre: 'Nueva' }), pack.id))
    expect(new Set(ev.map((e) => e.tipo))).toEqual(new Set([TE.germinacion, TE.bajaSemillas]))
    const baja = ev.find((e) => e.tipo === TE.bajaSemillas)!
    expect(baja.cantidad).toBe(1)
    expect(baja.nota).toContain('Germiné: Nueva')

    expect(eventos(d, (x) => D.ajustarCantidad(x, pack.id, 3)).map((e) => e.tipo)).toEqual([TE.altaSemillas])
    expect(eventos(d, (x) => D.borrarPaquete(x, pack.id)).map((e) => e.tipo)).toEqual([TE.bajaSemillas])
  })

  it('las semillas propias van una sola vez', () => {
    const d = datosVacios()
    const p = auto({ dia: 80 })
    D.agregarPlanta(d, p)
    const ev = eventos(d, (x) => { D.registrarSemillasPropias(x, p.id, 30, hoyTest) })
    expect(ev.map((e) => e.tipo)).toEqual([TE.altaSemillas])
    expect(ev[0].plantaID).toBe(p.id)
    expect(ev[0].cantidad).toBe(30)
  })

  it('de la foto va solo el hecho', () => {
    const d = datosVacios()
    const p = auto({ dia: 10 })
    D.agregarPlanta(d, p)
    const ev = eventos(d, (x) => D.agregarFoto(x, 'abc.jpg', p.id, hoyTest))
    expect(ev.map((e) => e.tipo)).toEqual([TE.foto])
    expect(ev[0].id).toBe('foto-abc.jpg')
    expect(ev[0].nota).toBe('Saqué una foto')
  })

  it('"Hoy no" es una tarea salteada', () => {
    const d = datosVacios()
    const p = auto({ dia: 20 })
    D.agregarPlanta(d, p)
    const tarea = idTarea('riego', p.id)
    const [e] = eventos(d, (x) => D.posponer(x, tarea, hoyTest))
    expect(e.tipo).toBe(TE.tareaSalteada)
    expect(e.plantaID).toBe(p.id)
    expect(e.nota).toBe('Hoy no: regar')
    // Volver a tocar "Hoy no" el mismo día no cambia nada.
    expect(eventos(d, (x) => D.posponer(x, tarea, hoyTest))).toEqual([])
  })

  it('los cambios que no son del cultivo no generan eventos', () => {
    const d = datosVacios()
    D.agregarPlanta(d, auto({ dia: 20 }))
    expect(eventos(d, () => {})).toEqual([])
    expect(eventos(d, (x) => { x.avisos.hora = 7 })).toEqual([])
    expect(eventos(d, (x) => { x.config.topVegEtiquetaMlPorLitro = 3 })).toEqual([])
  })

  it('cambios de etapa con la fecha real y un ID estable', () => {
    const d = datosVacios()
    const p = auto({ dia: 40 })
    D.agregarPlanta(d, p)
    const ev = Eventos.cambiosDeEtapa(d, hoyTest, app)
    expect(ev.map((e) => e.etapa)).toEqual([nombreEtapa.crecimiento, nombreEtapa.prefloracion, nombreEtapa.floracion])
    expect(ev.map((e) => e.dia)).toEqual([10, 21, 35])
    expect(ev[0].id).toBe(Eventos.idEtapa(p.id, 'crecimiento'))
    expect(Calendario.mismoDia(ev[0].fecha, Calendario.sumarDias(10, p.fechaGerminacion))).toBe(true)
    // Mañana genera los mismos IDs (la cola y la planilla los ignoran).
    const manana = Eventos.cambiosDeEtapa(d, Calendario.sumarDias(1, hoyTest), app)
    expect(manana.map((e) => e.id)).toEqual(ev.map((e) => e.id))
  })

  it('las etapas se cortan en la cosecha', () => {
    const d = datosVacios()
    const p = auto({ dia: 95 })
    D.agregarPlanta(d, p)
    D.cosechar(d, p.id, hace(15), 100) // día 80
    const etapas = Eventos.cambiosDeEtapa(d, hoyTest, app).map((e) => e.etapa)
    expect(etapas.at(-1)).toBe(nombreEtapa.maduracion)
    expect(etapas).not.toContain(nombreEtapa.listaCosecha)
  })

  /** Lo que hace idempotente a "Sincronizar todo": el historial reconstruido usa los mismos IDs
   *  que los eventos que se mandaron en el momento. */
  it('el historial usa los mismos IDs que el envío normal', () => {
    const d = datosVacios()
    const enviados: EventoSync[] = []
    const pack = nuevoPaquete({ nombre: 'Regular', banco: 'Propias', tipo: 'auto', semilla: 'regular', cantidad: 10, fechaCompra: hace(30) })
    enviados.push(...eventos(d, (x) => D.agregarPaquete(x, pack)))
    const p = auto({ dia: 30, semilla: 'regular' })
    enviados.push(...eventos(d, (x) => D.agregarPlanta(x, p, pack.id)))
    enviados.push(...eventos(d, (x) => D.registrar(x, 'riego', p.id, hace(2), { aguaML: 1500 })))
    enviados.push(...eventos(d, (x) => D.registrar(x, 'neem', p.id, hace(1), { producto: 'Neem' })))
    enviados.push(...eventos(d, (x) => D.marcarSexo(x, 'macho', p.id, hoyTest)))
    enviados.push(...eventos(d, (x) => D.moverAdentro(x, p.id, hoyTest)))
    enviados.push(...eventos(d, (x) => { D.juntarPolen(x, p.id, hoyTest) }))
    enviados.push(...eventos(d, (x) => D.agregarFoto(x, 'f1.jpg', p.id, hoyTest)))
    enviados.push(...eventos(d, (x) => D.registrar(x, 'problema', p.id, hoyTest, { nota: 'Hojas amarillas' })))

    const historial = Eventos.historial(d, hoyTest, app).filter((e) => e.tipo !== TE.cambioEtapa)
    expect(historial.length).toBeGreaterThan(0)
    const idsEnviados = new Set(enviados.map((e) => e.id))
    for (const e of historial) expect(idsEnviados.has(e.id), `${e.tipo} ${e.id} no coincide con lo enviado`).toBe(true)
    expect(new Set(historial.map((e) => e.id)).size).toBe(historial.length) // sin repetidos
  })

  it('fila de la planta', () => {
    const d = datosVacios()
    const p = auto({ dia: 20 })
    D.agregarPlanta(d, p)
    D.registrar(d, 'riego', p.id, hace(1), { aguaML: 1000 })
    D.registrar(d, 'problema', p.id, hoyTest, { nota: 'Hojas amarillas' })
    const f = Eventos.fila(planta(d, p.id)!, hoyTest)
    expect(f.id).toBe(p.id)
    expect(f.autoFoto).toBe('Auto')
    expect(f.semilla).toBe('Feminizada')
    expect(f.ubicacion).toBe('Patio')
    expect(f.estado).toBe('activa')
    expect(f.dia).toBe(20)
    expect(f.etapa).toBe(nombreEtapa.crecimiento)
    expect(f.germinacion).toBe(Calendario.claveDia(p.fechaGerminacion))
    expect(f.ultimoRiego).toEqual(hace(1))
    expect(f.notas).toContain('Hojas amarillas')

    const antes = structuredClone(d)
    D.borrarPlanta(d, p.id)
    expect(Eventos.filasCambiadas(antes, d, hoyTest).map((x) => x.estado)).toEqual(['borrada'])
  })
})

describe('Bandeja', () => {
  const evento = (id: string): EventoSync => ({ id, fecha: hoyTest, tipo: TE.nota, nota: id, app })
  const plantaSync = (id: string, notas = ''): PlantaSync => ({
    id, nombre: id, variedad: '', autoFoto: 'Auto', semilla: 'Feminizada', sexo: 'Hembra', ubicacion: 'Patio', litros: 20,
    germinacion: '2026-10-01', etapa: 'Crecimiento', dia: 20, estado: 'activa', notas, actualizado: hoyTest,
  })

  it('encolar no duplica', () => {
    const b = new Bandeja()
    expect(b.encolar([evento('a'), evento('b')])).toBe(2)
    expect(b.encolar([evento('b'), evento('c'), evento('c')])).toBe(1)
    expect(b.eventos.map((e) => e.id)).toEqual(['a', 'b', 'c'])
  })

  it('confirmar saca solo lo enviado', () => {
    const b = new Bandeja()
    b.encolar([evento('a'), evento('b')])
    const lote = b.lote()
    // Mientras el lote viaja se registra algo más.
    b.encolar([evento('c')])
    b.confirmar(lote, hoyTest)
    expect(b.eventos.map((e) => e.id)).toEqual(['c'])
    expect(b.ultimoOK).toEqual(hoyTest)
  })

  it('una planta que cambia durante el envío se queda', () => {
    const b = new Bandeja()
    b.encolarPlantas([plantaSync('p1', 'vieja')])
    const lote = b.lote()
    b.encolarPlantas([plantaSync('p1', 'nueva')])
    expect(b.plantas.length).toBe(1) // una sola por planta
    b.confirmar(lote, hoyTest)
    expect(b.plantas.map((p) => p.notas)).toEqual(['nueva'])
    b.confirmar(b.lote(), hoyTest)
    expect(b.vacia).toBe(true)
  })

  it('un fallo no pierde nada y espera cada vez más', () => {
    const b = new Bandeja()
    b.encolar([evento('a')])
    b.fallo('sin señal', hoyTest)
    expect(b.pendientes).toBe(1)
    expect(b.ultimoError).toBe('sin señal')
    expect(b.puedeEnviar(new Date(hoyTest.getTime() + 29_000))).toBe(false)
    expect(b.puedeEnviar(new Date(hoyTest.getTime() + 30_000))).toBe(true)

    b.fallo('sin señal', hoyTest)
    expect(b.proximoIntento).toEqual(new Date(hoyTest.getTime() + 60_000))
    expect(Bandeja.espera(3)).toBe(120_000)
    expect(Bandeja.espera(50)).toBe(15 * 60_000)

    b.confirmar(b.lote(), hoyTest)
    expect(b.intentosFallidos).toBe(0)
    expect(b.proximoIntento).toBeUndefined()
    expect(b.ultimoError).toBeUndefined()
  })

  it('lotes de a muchos', () => {
    const b = new Bandeja()
    b.encolar(Array.from({ length: 250 }, (_, i) => evento(`e${i}`)))
    expect(b.lote().eventos.length).toBe(Bandeja.maxPorLote)
    expect(b.lote().eventos[0].id).toBe('e0') // primero los más viejos
    let vueltas = 0
    while (!b.vacia) {
      b.confirmar(b.lote(), hoyTest)
      vueltas++
    }
    expect(vueltas).toBe(3)
  })

  it('sobrevive a guardar y leer', () => {
    const b = new Bandeja()
    b.encolar([evento('a'), evento('b')])
    b.encolarPlantas([plantaSync('p1')])
    b.etapasEncoladas = new Set(['etapa-x-crecimiento'])
    b.fallo('sin señal', hoyTest)
    const leida = Bandeja.leer(JSON.parse(aJSON(b.aObjeto())))
    expect(leida.eventos.map((e) => e.id)).toEqual(['a', 'b'])
    expect(leida.eventos[0].tipo).toBe(TE.nota)
    expect(leida.eventos[0].fecha).toEqual(hoyTest)
    expect(leida.plantas.map((p) => p.id)).toEqual(['p1'])
    expect([...leida.etapasEncoladas]).toEqual(['etapa-x-crecimiento'])
    expect(leida.intentosFallidos).toBe(1)
    // Un objeto vacío o de una versión vieja no rompe nada.
    expect(Bandeja.leer({}).vacia).toBe(true)
    expect(Bandeja.leer(undefined).vacia).toBe(true)
  })
})

describe('Respuesta de la planilla', () => {
  it('solo es éxito con ok: true', () => {
    const ok = LectorSync.leer('{"ok":true,"agregados":2,"repetidos":1}', 200)
    expect(ok.ok && ok.valor.agregados).toBe(2)
    expect(LectorSync.leer('{"ok":false,"error":"Token inválido."}', 200))
      .toEqual({ ok: false, error: { tipo: 'servidor', mensaje: 'Token inválido.' } })
    // Página de login de Google en vez de JSON (Web App sin acceso público).
    expect(LectorSync.leer('<!DOCTYPE html><html>', 200)).toEqual({ ok: false, error: { tipo: 'noEsJSON' } })
    expect(LectorSync.leer('', 500)).toEqual({ ok: false, error: { tipo: 'http', status: 500 } })
  })
})
