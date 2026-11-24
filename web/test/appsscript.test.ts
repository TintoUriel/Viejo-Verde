import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { D, datosVacios, leerDatos } from '../src/core/datos'
import { datosDeEjemplo } from '../src/core/ejemplo'
import { nuevoPaquete } from '../src/core/modelos'
import { Configuracion } from '../src/core/sync/configuracion'
import { Eventos } from '../src/core/sync/eventos'
import { CuerpoSync, LectorSync } from '../src/core/sync/modelos'
import { limpiarFila, reconstruir, type FilaPlanta, type FilaRegistro } from '../src/core/sync/reconstruir'
import { aJSON, iguales } from '../src/core/util'
import { auto, hace, hoyTest } from './ayudas'

// Corre el apps-script/Code.gs de verdad contra una planilla simulada en memoria, con los mismos
// pedidos que arma la app. Así se prueba el script sin publicarlo.

const codigo = readFileSync(fileURLToPath(new URL('../../apps-script/Code.gs', import.meta.url)), 'utf8')
const TOKEN = 'token-de-prueba-0123456789abcdef'

type Celda = string | number | Date

/** Hoja simulada: como Sheets real, convierte "2026-11-10 14:30:00" en fecha salvo que la celda sea texto. */
class Hoja {
  datos: Celda[][] = []
  texto = new Set<string>()
  oculta = false
  constructor(public nombre: string) {}
  getLastRow() { return this.datos.length }
  getRange(fila: number | string, col = 1, filas = 1, cols = 1) {
    if (typeof fila === 'string') return { setNumberFormat: () => undefined }
    const hoja = this
    return {
      setValues(v: Celda[][]) {
        v.forEach((f, i) => f.forEach((x, j) => {
          const r = fila - 1 + i
          const c = col - 1 + j
          while (hoja.datos.length <= r) hoja.datos.push([])
          const comoTexto = hoja.texto.has(`${r},${c}`)
          if (typeof x === 'string' && !comoTexto && /^=/.test(x)) throw new Error(`Fórmula escrita: ${x.slice(0, 20)}`)
          hoja.datos[r][c] = typeof x === 'string' && !comoTexto && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(x)
            ? new Date(x.replace(' ', 'T') + '-03:00') : typeof x === 'string' && x.startsWith("'") ? x.slice(1) : x
        }))
        return this
      },
      getValues() {
        return Array.from({ length: filas }, (_, i) => Array.from({ length: cols }, (_, j) => hoja.datos[fila - 1 + i]?.[col - 1 + j] ?? ''))
      },
      getValue() { return hoja.datos[fila - 1]?.[col - 1] ?? '' },
      setNumberFormat(f: string) {
        if (f === '@') for (let i = 0; i < filas; i++) for (let j = 0; j < cols; j++) hoja.texto.add(`${fila - 1 + i},${col - 1 + j}`)
        return this
      },
      setFontWeight() { return this },
      clearContent() {
        for (let i = 0; i < filas; i++) for (let j = 0; j < cols; j++) {
          const f = hoja.datos[fila - 1 + i]
          if (f) f[col - 1 + j] = ''
        }
        // Como en Sheets: las filas vacías del final no cuentan para getLastRow.
        while (hoja.datos.length > 0 && hoja.datos[hoja.datos.length - 1].every((c) => c === '' || c === undefined)) hoja.datos.pop()
        return this
      },
    }
  }
  setFrozenRows() {}
  clearContents() { this.datos = [] }
  hideSheet() { this.oculta = true }
  deleteRow(n: number) { this.datos.splice(n - 1, 1) }
}

function nuevoScript() {
  const hojas = new Map<string, Hoja>()
  const ss = {
    getSheetByName: (n: string) => hojas.get(n) ?? null,
    insertSheet: (n: string) => { const h = new Hoja(n); hojas.set(n, h); return h },
    getNumSheets: () => hojas.size,
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  const globales = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss, flush: () => undefined },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => TOKEN, setProperty: () => undefined }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => undefined }) },
    ContentService: { createTextOutput: (s: string) => ({ setMimeType: () => ({ getContent: () => s }) }), MimeType: { JSON: 'json' } },
    Utilities: {
      formatDate: (d: Date) => {
        const b = new Date(d.getTime() - 3 * 3600_000)
        return `${b.getUTCFullYear()}-${pad(b.getUTCMonth() + 1)}-${pad(b.getUTCDate())} ${pad(b.getUTCHours())}:${pad(b.getUTCMinutes())}:${pad(b.getUTCSeconds())}`
      },
      parseDate: (s: string) => new Date(s.replace(' ', 'T') + '-03:00'),
      getUuid: () => crypto.randomUUID(),
    },
    Logger: { log: () => undefined },
  }
  const fabrica = new Function(...Object.keys(globales), `${codigo}; return { doPost, leerEstado_ };`)
  const s = fabrica(...Object.values(globales)) as { doPost: (e: unknown) => { getContent(): string } }
  const post = (cuerpo: string) => {
    const r = LectorSync.leer(s.doPost({ postData: { contents: cuerpo } }).getContent(), 200)
    if (!r.ok) throw new Error(JSON.stringify(r.error))
    return r.valor
  }
  return { post, hojas }
}

describe('Apps Script (Code.gs) con la planilla simulada', () => {
  it('reconstruye lo que mandó la app de iPhone, guarda la copia y la devuelve igual', () => {
    const { post, hojas } = nuevoScript()

    // 1. Lo que ya había en la planilla: eventos y filas mandados por la app vieja.
    const d = datosVacios()
    const pack = nuevoPaquete({ nombre: 'Kush', banco: 'Banco Uno', tipo: 'auto', semilla: 'feminizada', cantidad: 3, fechaCompra: hace(10) })
    const otro = nuevoPaquete({ nombre: 'Haze', banco: 'Banco Dos', tipo: 'foto', semilla: 'feminizada', cantidad: 3, fechaCompra: hace(10) })
    const p = auto({ dia: 5, nombre: 'Juana' })
    const pasos = [
      (x: typeof d) => D.agregarPaquete(x, pack),
      (x: typeof d) => D.agregarPaquete(x, otro),
      (x: typeof d) => D.agregarPlanta(x, p),
      (x: typeof d) => D.registrar(x, 'riego', p.id, hace(1), { aguaML: 100 }),
      (x: typeof d) => D.actualizarPaquete(x, { ...x.paquetes[0], banco: 'Banco Uno Bien' }),
    ]
    for (const paso of pasos) {
      const antes = structuredClone(d)
      paso(d)
      post(CuerpoSync.json({ eventos: Eventos.detectar(antes, d, hoyTest, '1.0 (1)'), plantas: Eventos.filasCambiadas(antes, d, hoyTest) }, TOKEN))
    }
    expect(hojas.get('Registro')!.getLastRow()).toBe(6) // encabezado + 2 altas + germinación + riego + corrección

    // 2. Probar conexión avisa que el script ya sabe de la copia.
    expect(post(CuerpoSync.prueba(TOKEN)).estado).toBe(true)

    // 3. Sin copia todavía: vienen las filas y la app rearma los datos.
    const r = post(CuerpoSync.leerEstado(TOKEN))
    expect(r.estado).toBeNull()
    const x = reconstruir(
      (r.filasRegistro ?? []).map((f) => limpiarFila<FilaRegistro>(f)),
      (r.filasPlantas ?? []).map((f) => limpiarFila<FilaPlanta>(f)),
    )
    expect(x.paquetes.map((k) => [k.nombre, k.banco, k.tipo, k.cantidad])).toEqual([['Kush', 'Banco Uno Bien', 'auto', 3], ['Haze', 'Banco Dos', 'foto', 3]])
    expect(x.plantas.map((q) => q.nombre)).toEqual(['Juana'])
    expect(x.plantas[0].registros.find((g) => g.tipo === 'riego')?.aguaML).toBe(100)
    expect(x.plantas[0].fechaGerminacion.getTime()).toBeGreaterThan(0)

    // 4. La copia completa va y vuelve igual, aunque sea grande y tenga textos que parecen fórmulas.
    for (let i = 0; i < 400; i++) D.registrar(x, 'nota', x.plantas[0].id, hace(1), { nota: `=nota ${i} ${'x'.repeat(100)}` })
    const json = aJSON(x)
    expect(json.length).toBeGreaterThan(40000)
    const t1 = new Date('2026-11-20T15:00:00Z')
    expect(post(CuerpoSync.guardarEstado(TOKEN, json, t1)).guardado).toBe(true)
    expect(hojas.get('Estado')!.oculta).toBe(true)
    const vuelta = post(CuerpoSync.leerEstado(TOKEN))
    expect(vuelta.actualizado).toBe(t1.toISOString())
    expect(iguales(leerDatos(JSON.parse(vuelta.estado as string)), x)).toBe(true)
    expect(vuelta.filasRegistro).toBeUndefined()

    // 5. Una copia más vieja no pisa a la nueva (otro dispositivo atrasado).
    expect(post(CuerpoSync.guardarEstado(TOKEN, '{"plantas":[]}', new Date('2026-11-20T14:00:00Z'))).guardado).toBe(false)
    expect(post(CuerpoSync.leerEstado(TOKEN)).estado).toBe(json)
  })

  it('escribe la hoja Configuración entera y la devuelve para rearmar el patio', () => {
    const { post, hojas } = nuevoScript()
    const d = datosDeEjemplo(hoyTest)
    const filas = Configuracion.filas(d)
    const filasPlantas = d.plantas.map((p) => Eventos.fila(p, hoyTest))

    // Probar conexión avisa que el script ya la conoce.
    expect(post(CuerpoSync.prueba(TOKEN)).configuracion).toBe(true)

    const historial = Eventos.historial(d, hoyTest, 'web')
    const r = post(CuerpoSync.json({ eventos: historial, plantas: filasPlantas, configuracion: filas }, TOKEN))
    expect(r.configuracion).toBe(filas.length)
    const hoja = hojas.get('Configuración')!
    expect(hoja.datos[0]).toEqual(['Sección', 'Dato', 'Valor', 'Clave'])
    expect(hoja.getLastRow()).toBe(filas.length + 1)
    // Lo que no es historial no suma filas a Registro.
    expect(hojas.get('Registro')!.getLastRow()).toBe(historial.length + 1)

    // Sin "configuracion" en el pedido, la hoja no se toca (y la respuesta no la nombra).
    expect(post(CuerpoSync.json({ eventos: [], plantas: [] }, TOKEN)).configuracion).toBeUndefined()
    expect(hoja.getLastRow()).toBe(filas.length + 1)

    // Sin copia completa todavía: con Registro, Plantas y Configuración se rearma todo, patio incluido.
    const v = post(CuerpoSync.leerEstado(TOKEN))
    const x = reconstruir(
      (v.filasRegistro ?? []).map((f) => limpiarFila<FilaRegistro>(f)),
      (v.filasPlantas ?? []).map((f) => limpiarFila<FilaPlanta>(f)),
      v.filasConfiguracion ?? [],
    )
    expect(Object.keys(x.patio!.ubicaciones).length).toBe(4)
    expect(iguales(x.patio, d.patio)).toBe(true)

    // Se reescribe entera: si ahora hay menos filas, no quedan restos.
    const menos = Configuracion.filas(datosVacios())
    expect(post(CuerpoSync.json({ eventos: [], plantas: [], configuracion: menos }, TOKEN)).configuracion).toBe(2)
    expect(hoja.getLastRow()).toBe(3)
  })

  it('rechaza un token equivocado', () => {
    const { post } = nuevoScript()
    expect(() => post(CuerpoSync.leerEstado('otro-token-que-no-es-0000000000'))).toThrow(/Token inválido/)
  })
})
