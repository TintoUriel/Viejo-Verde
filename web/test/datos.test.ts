import { describe, expect, it } from 'vitest'
import { Calendario } from '../src/core/calendario'
import { Cupo, Temporada } from '../src/core/consejos'
import { backupAJSON, D, datosVacios, leerBackup, nuevoBackup, planta, todasLasFotos } from '../src/core/datos'
import { configPorDefecto } from '../src/core/dosis'
import { datosDeEjemplo } from '../src/core/ejemplo'
import { nuevoPaquete, nuevoPolen } from '../src/core/modelos'
import { idTarea, Tareas } from '../src/core/tareas'
import { iguales } from '../src/core/util'
import { auto, f, hace, hoyTest } from './ayudas'

describe('Datos', () => {
  it('sexo inicial según la semilla', () => {
    expect(auto({ dia: 1, semilla: 'feminizada' }).sexo).toBe('hembra')
    expect(auto({ dia: 1, semilla: 'regular' }).sexo).toBe('desconocido')
  })

  it('agregar desde un pack descuenta', () => {
    const d = datosVacios()
    const pack = nuevoPaquete({ nombre: 'Banana Blaze', banco: 'Dutch Passion', tipo: 'auto', semilla: 'feminizada',
      cantidad: 1, fechaCompra: hoyTest })
    d.paquetes = [pack]
    D.agregarPlanta(d, auto({ dia: 0 }), pack.id)
    expect(d.paquetes[0].cantidad).toBe(0)
    expect(d.plantas[0].paqueteOrigenID).toBe(pack.id)
    expect(d.plantas[0].registros.filter((r) => r.tipo === 'germinacion').length).toBe(1)
    D.agregarPlanta(d, auto({ dia: 0 }), pack.id)
    expect(d.paquetes[0].cantidad).toBe(0) // nunca negativo
  })

  it('flujo cosecha → secado → curado', () => {
    const d = datosVacios()
    const p = auto({ dia: 90 })
    D.agregarPlanta(d, p)
    D.cosechar(d, p.id, hoyTest, 210)
    expect(planta(d, p.id)?.estado).toBe('secando')
    expect(planta(d, p.id)?.cosecha?.gramosHumedos).toBe(210)

    const frascos = Calendario.sumarDias(10, hoyTest)
    D.pasarAFrascos(d, p.id, frascos, 52.5)
    expect(planta(d, p.id)?.estado).toBe('curando')
    expect(planta(d, p.id)?.cosecha?.gramosSecos).toBe(52.5)
    expect(planta(d, p.id)?.cosecha?.fechaFrascos).toEqual(frascos)

    D.terminar(d, p.id, Calendario.sumarDias(40, hoyTest))
    expect(planta(d, p.id)?.estado).toBe('terminada')
  })

  it('polen y semillas propias', () => {
    const d = datosVacios()
    const macho = auto({ dia: 30, semilla: 'regular', sexo: 'macho', ubicacion: 'interior', nombre: 'Macho' })
    const hembra = auto({ dia: 30, semilla: 'regular', sexo: 'hembra', nombre: 'Hembra' })
    D.agregarPlanta(d, macho)
    D.agregarPlanta(d, hembra)

    expect(D.juntarPolen(d, macho.id, hoyTest)).toBeDefined()
    expect(d.polenes.length).toBe(1)
    expect(d.polenes[0].plantaOrigenID).toBe(macho.id)
    expect(planta(d, macho.id)?.polenJuntado).toBe(true)

    D.polinizar(d, hembra.id, hoyTest)
    expect(planta(d, hembra.id)?.fechaPolinizacion).toEqual(hoyTest)

    const pack = D.registrarSemillasPropias(d, hembra.id, 30, hoyTest)
    expect(pack?.semilla).toBe('regular')
    expect(pack?.propias).toBe(true)
    expect(pack?.plantaMadreID).toBe(hembra.id)
    expect(d.paquetes.length).toBe(1)
  })

  it('marcar sexo y mover adentro', () => {
    const d = datosVacios()
    const p = auto({ dia: 22, semilla: 'regular' })
    D.agregarPlanta(d, p)
    D.marcarSexo(d, 'macho', p.id, hoyTest)
    expect(planta(d, p.id)?.sexo).toBe('macho')
    D.moverAdentro(d, p.id, hoyTest)
    expect(planta(d, p.id)?.ubicacion).toBe('interior')
  })

  it('ajustar cantidad no baja de cero', () => {
    const d = datosVacios()
    const pack = nuevoPaquete({ nombre: 'x', banco: 'y', tipo: 'auto', semilla: 'regular', cantidad: 2, fechaCompra: hoyTest })
    d.paquetes = [pack]
    D.ajustarCantidad(d, pack.id, -5)
    expect(d.paquetes[0].cantidad).toBe(0)
    D.ajustarCantidad(d, pack.id, 3)
    expect(d.paquetes[0].cantidad).toBe(3)
  })

  it('packs, polen y fotos', () => {
    const d = datosVacios()
    const pack = nuevoPaquete({ nombre: 'A', banco: 'B', tipo: 'auto', semilla: 'regular', cantidad: 3, fechaCompra: hoyTest })
    D.agregarPaquete(d, pack)
    D.actualizarPaquete(d, { ...pack, cantidad: 7 })
    expect(d.paquetes[0]?.cantidad).toBe(7)
    D.borrarPaquete(d, pack.id)
    expect(d.paquetes).toEqual([])

    const polen = nuevoPolen({ fecha: hoyTest, plantaOrigen: 'Macho' })
    D.agregarPolen(d, polen)
    D.alternarPolenUsado(d, polen.id)
    expect(d.polenes[0]?.usado).toBe(true)
    D.borrarPolen(d, polen.id)
    expect(d.polenes).toEqual([])

    const p = auto({ dia: 10 })
    D.agregarPlanta(d, p)
    D.agregarFoto(d, 'a.jpg', p.id)
    D.agregarFoto(d, 'b.jpg', p.id)
    D.quitarFoto(d, 'a.jpg', p.id)
    expect(todasLasFotos(d)).toEqual(['b.jpg'])
  })

  it('editar y borrar registros y la planta', () => {
    const d = datosVacios()
    const p = auto({ dia: 10 })
    D.agregarPlanta(d, p)
    D.registrar(d, 'nota', p.id, hoyTest, { nota: 'hola' })
    const r = { ...planta(d, p.id)!.registros.find((x) => x.tipo === 'nota')! }
    r.nota = 'chau'
    D.editarRegistro(d, r, p.id)
    expect(planta(d, p.id)?.registros.find((x) => x.id === r.id)?.nota).toBe('chau')
    D.borrarRegistro(d, r.id, p.id)
    expect(planta(d, p.id)?.registros.find((x) => x.id === r.id)).toBeUndefined()

    D.posponer(d, idTarea('riego', p.id), hoyTest)
    D.borrarPlanta(d, p.id)
    expect(d.plantas).toEqual([])
    expect(d.pospuestas).toEqual({})
  })

  it('posponer limpia las viejas', () => {
    const d = datosVacios()
    D.posponer(d, 'vieja', hace(5))
    D.posponer(d, 'nueva', hoyTest)
    expect(Object.keys(d.pospuestas)).toEqual(['nueva'])
  })
})

describe('Backup', () => {
  it('ida y vuelta', () => {
    const datos = datosDeEjemplo(hoyTest)
    const json = backupAJSON(nuevoBackup(datos, hoyTest, { 'a.jpg': 'AQID' }))
    const leido = leerBackup(json)
    expect(iguales(leido.datos, datos)).toBe(true)
    expect(leido.fotos['a.jpg']).toBe('AQID')
    expect(leido.version).toBe(1)
    // Fechas sin milisegundos, como las escribe la app de iOS.
    expect(json).toMatch(/"exportado": "\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z"/)
  })

  it('backup viejo sin campos nuevos', () => {
    const json = `{"datos":{"plantas":[{"id":"6F9619FF-8B86-D011-B42D-00C04FC964FF","nombre":"Vieja","tipo":"auto",
      "semilla":"feminizada","fechaGerminacion":"2026-10-01T15:00:00Z"}]}}`
    const b = leerBackup(json)
    const p = b.datos.plantas[0]
    expect(p.litrosMaceta).toBe(20)
    expect(p.estado).toBe('activa')
    expect(p.ubicacion).toBe('patio')
    expect(p.registros).toEqual([])
    expect(b.datos.config).toEqual(configPorDefecto())
  })

  it('lee un backup como los que exporta la app de iOS', () => {
    // Con el formato que escribe la app de Swift (JSONEncoder: .iso8601, .prettyPrinted, .sortedKeys).
    const json = `{
      "datos" : {
        "avisos" : { "activos" : true, "hora" : 9, "minuto" : 0, "puntuales" : true, "resumenDiario" : true },
        "config" : { "topBloomEtiquetaMlPorLitro" : 2, "topVegEtiquetaMlPorLitro" : 2.5 },
        "paquetes" : [ { "banco" : "Dutch Passion", "cantidad" : 4, "fechaCompra" : "2026-07-01T15:00:00Z",
          "id" : "11111111-2222-3333-4444-555555555555", "nombre" : "Banana Blaze", "propias" : false,
          "semilla" : "feminizada", "tipo" : "auto" } ],
        "plantas" : [ { "fechaGerminacion" : "2026-10-20T13:12:45Z", "fechasFotos" : { "F.jpg" : "2026-11-01T18:00:00Z" },
          "fotos" : [ "F.jpg" ], "id" : "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE", "litrosMaceta" : 20,
          "nombre" : "Banana 1", "paqueteOrigenID" : "11111111-2222-3333-4444-555555555555", "polenJuntado" : false,
          "registros" : [ { "fecha" : "2026-10-20T13:12:45Z", "id" : "R1", "tipo" : "germinacion" },
                          { "aguaML" : 1000, "fecha" : "2026-11-02T12:00:00Z", "id" : "R2", "tipo" : "riego" } ],
          "semilla" : "feminizada", "sexo" : "hembra", "tipo" : "auto", "ubicacion" : "patio", "variedad" : "Banana Blaze",
          "estado" : "activa" } ],
        "polenes" : [ ],
        "pospuestas" : { "riego-AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE" : "2026-11-15T12:00:00Z" }
      },
      "exportado" : "2026-11-15T20:00:00Z",
      "fotos" : { "F.jpg" : "/9j/4AAQ" },
      "version" : 1
    }`
    const b = leerBackup(json)
    expect(b.datos.plantas[0].registros[1].aguaML).toBe(1000)
    expect(b.datos.plantas[0].fechasFotos['F.jpg']).toEqual(new Date('2026-11-01T18:00:00Z'))
    expect(b.datos.config.topVegEtiquetaMlPorLitro).toBe(2.5)
    expect(b.datos.pospuestas['riego-AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE']).toEqual(new Date('2026-11-15T12:00:00Z'))
    expect(b.fotos['F.jpg']).toBe('/9j/4AAQ')
    expect(b.exportado).toEqual(new Date('2026-11-15T20:00:00Z'))
  })

  it('un archivo que no es backup tira error', () => {
    expect(() => leerBackup('{"hola":1}')).toThrow()
    expect(() => leerBackup('no es json')).toThrow()
  })
})

describe('Cupo y temporada', () => {
  it('cupo REPROCANN', () => {
    const plantas = Array.from({ length: 10 }, () => auto({ dia: 40 })) // 10 en floración
    plantas.push(auto({ dia: 25 })) // prefloración: no cuenta
    const s = auto({ dia: 100 }); s.estado = 'secando'; plantas.push(s)
    const c = auto({ dia: 110 }); c.estado = 'curando'; plantas.push(c)
    const r = Cupo.resumen(plantas, hoyTest)
    expect(r.activas).toBe(11)
    expect(r.enFlor).toBe(10)
    expect(r.secando).toBe(1)
    expect(r.curando).toBe(1)
    expect(r.excedido).toBe(true)
    expect(Cupo.resumen(plantas.slice(0, 9), hoyTest).excedido).toBe(false)
  })

  it('consejo de temporada', () => {
    expect(Temporada.consejo(f(2026, 11, 8)).titulo).toBe('Temporada de siembra')
    expect(Temporada.consejo(f(2027, 1, 8)).titulo).toBe('Otra tanda de automáticas')
    expect(Temporada.consejo(f(2027, 4, 8)).titulo).toBe('Última tanda de automáticas')
    expect(Temporada.consejo(f(2027, 6, 8)).titulo).toBe('Descanso del patio')
  })

  it('el ejemplo genera tareas variadas', () => {
    const d = datosDeEjemplo(hoyTest)
    const t = new Set(Tareas.generar({ plantas: d.plantas, paquetes: d.paquetes, hoy: hoyTest }).map((x) => x.tipo))
    for (const tipo of ['machoPatio', 'sexado', 'cosecha', 'secado', 'curado', 'fertilizante'] as const) {
      expect(t.has(tipo), tipo).toBe(true)
    }
  })
})

describe('IDs', () => {
  it('uuid en mayúsculas, también sin crypto.randomUUID', async () => {
    const { uuid } = await import('../src/core/util')
    expect(uuid()).toMatch(/^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/)
    const original = crypto.randomUUID
    try {
      Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true })
      expect(uuid()).toMatch(/^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/)
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true })
    }
  })
})
