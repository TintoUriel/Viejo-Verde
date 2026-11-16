import { describe, expect, it } from 'vitest'
import { LectorRespuesta, mensajeErrorClaude, nuevoMensaje, PedidoClaude, type MensajeChat } from '../src/core/claude'
import { ContextoAsistente } from '../src/core/contexto'
import { D, datosVacios } from '../src/core/datos'
import { Guia } from '../src/core/guia'
import { nuevoRegistro } from '../src/core/modelos'
import { auto, hace, hoyTest, reg } from './ayudas'

type J = Record<string, any>

describe('Pedido a Claude', () => {
  it('encabezados', () => {
    const h = PedidoClaude.encabezados('sk-test')
    expect(h['x-api-key']).toBe('sk-test')
    expect(h['anthropic-version']).toBe('2026-10-21')
    expect(h['anthropic-beta']).toBe('server-side-fallback-2026-07-01')
    expect(h['content-type']).toBe('application/json')
    expect(h['anthropic-dangerous-direct-browser-access']).toBe('true')
  })

  it('cuerpo básico', () => {
    const c: J = JSON.parse(PedidoClaude.cuerpo([nuevoMensaje('usuario', 'Hola')], 'INSTR', 'CTX'))
    expect(c.model).toBe('claude-sonnet-5-5')
    expect(c.max_tokens).toBe(16000)
    expect(c.fallbacks).toBe('default')
    expect(c.output_config.effort).toBe('low')
    expect(c.temperature).toBeUndefined()
    expect(c.system.map((b: J) => b.text)).toEqual(['INSTR', 'CTX'])
    expect(c.messages.length).toBe(1)
    expect(c.messages[0].role).toBe('user')
    expect(c.messages[0].content[0].text).toBe('Hola')
  })

  it('la foto va antes del texto y sube el esfuerzo', () => {
    const c: J = JSON.parse(PedidoClaude.cuerpo([nuevoMensaje('usuario', '¿Qué tiene?', { imagenJPEG: '/9j/' })], '', ''))
    expect(c.output_config.effort).toBe('medium')
    const bloques = c.messages[0].content
    expect(bloques[0].type).toBe('image')
    expect(bloques[0].source.media_type).toBe('image/jpeg')
    expect(bloques[0].source.data).toBe('/9j/')
    expect(bloques[1].text).toBe('¿Qué tiene?')
  })

  it('solo foto lleva un texto por defecto', () => {
    const m = PedidoClaude.mensajes([nuevoMensaje('usuario', '  ', { imagenJPEG: 'AQ==' })]) as J[]
    expect(m[0].content[m[0].content.length - 1].text).toBe('Mirá esta foto de mi planta.')
  })

  it('reenvía los bloques crudos del asistente', () => {
    const pensamiento = { type: 'thinking', thinking: '', signature: 'abc' }
    const texto = { type: 'text', text: 'Regá mañana.' }
    const m = PedidoClaude.mensajes([
      nuevoMensaje('usuario', '¿Riego?'),
      nuevoMensaje('asistente', 'Regá mañana.', { bloques: [pensamiento, texto] }),
      nuevoMensaje('usuario', 'Dale'),
    ]) as J[]
    expect(m.map((x) => x.role)).toEqual(['user', 'assistant', 'user'])
    expect(m[1].content).toEqual([pensamiento, texto])
  })

  it('salta los errores y une turnos seguidos', () => {
    const m = PedidoClaude.mensajes([
      nuevoMensaje('asistente', 'Bienvenida'), // no puede arrancar con el asistente
      nuevoMensaje('usuario', 'Uno'),
      nuevoMensaje('asistente', 'Sin conexión', { esError: true }),
      nuevoMensaje('usuario', 'Dos'),
    ]) as J[]
    expect(m.length).toBe(1)
    expect(m[0].role).toBe('user')
    expect(m[0].content.map((b: J) => b.text)).toEqual(['Uno', 'Dos'])
  })

  it('solo las últimas fotos', () => {
    const historial: MensajeChat[] = []
    for (let i = 0; i < 3; i++) {
      historial.push(nuevoMensaje('usuario', `foto ${i}`, { imagenJPEG: `F${i}` }))
      historial.push(nuevoMensaje('asistente', `ok ${i}`))
    }
    const usuarios = (PedidoClaude.mensajes(historial) as J[]).filter((x) => x.role === 'user')
    expect(usuarios.map((x) => x.content[0].type)).toEqual(['text', 'image', 'image'])
    expect(usuarios[0].content[0].text).toBe('[Acá había mandado una foto]')
  })

  it('limita el historial', () => {
    const historial = Array.from({ length: 50 }, (_, i) => nuevoMensaje(i % 2 === 0 ? 'usuario' : 'asistente', String(i)))
    const m = PedidoClaude.mensajes(historial) as J[]
    expect(m.length).toBeLessThanOrEqual(PedidoClaude.maxMensajes)
    expect(m[0].role).toBe('user')
  })
})

describe('Respuesta de Claude', () => {
  it('lee el texto y guarda los bloques', () => {
    const r = LectorRespuesta.leer(`{"id":"msg_1","type":"message","role":"assistant","stop_reason":"end_turn",
      "content":[{"type":"thinking","thinking":"","signature":"x"},{"type":"text","text":"Hola"},{"type":"text","text":"che"}]}`, 200)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.valor.texto).toBe('Hola\n\nche')
    expect(r.valor.bloques.length).toBe(3)
    expect(r.valor.stopReason).toBe('end_turn')
  })

  it('rechazo', () => {
    const r = LectorRespuesta.leer('{"stop_reason":"refusal","content":[],"stop_details":{"type":"refusal","category":"general_harms"}}', 200)
    expect(r).toEqual({ ok: false, error: { tipo: 'rechazo' } })
  })

  it('cortada por max_tokens', () => {
    const r = LectorRespuesta.leer('{"stop_reason":"max_tokens","content":[{"type":"text","text":"Mucho"}]}', 200)
    expect(r.ok && r.valor.texto.endsWith('(La respuesta quedó cortada.)')).toBe(true)
  })

  it('errores HTTP', () => {
    const r = LectorRespuesta.leer('{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}', 401)
    expect(r).toEqual({ ok: false, error: { tipo: 'http', status: 401, error: 'authentication_error', mensaje: 'invalid x-api-key' } })
    expect(mensajeErrorClaude({ tipo: 'http', status: 401, error: 'authentication_error', mensaje: '' }))
      .toBe('La API key no es válida. Revisala en Ajustes.')
    expect(mensajeErrorClaude({ tipo: 'http', status: 529, error: 'overloaded_error', mensaje: '' })).toContain('saturado')
    expect(mensajeErrorClaude({ tipo: 'http', status: 500, error: 'api_error', mensaje: 'boom' })).toContain('boom')
  })
})

describe('Contexto del asistente', () => {
  it('incluye las plantas y los datos clave', () => {
    const d = datosVacios()
    D.agregarPlanta(d, auto({ dia: 15, nombre: 'Banana 1', registros: [
      reg('riego', 3), reg('fertilizante', 8, 'Top Veg'), nuevoRegistro(hace(1), 'problema', { nota: 'Puntas quemadas' }),
    ] }))
    const vieja = auto({ dia: 200, nombre: 'Terminada' })
    vieja.estado = 'terminada'
    D.agregarPlanta(d, vieja)

    const c = ContextoAsistente.contexto(d, hoyTest)
    expect(c).toContain('CABA')
    expect(c).toContain('hasta 9 plantas florecidas')
    expect(c).toContain('Banana 1')
    expect(c).toContain('Crecimiento, día 15 (semana 3)')
    expect(c).toContain('último riego: hace 3 días')
    expect(c).toContain('fertilizante: hace 8 días (Top Veg)')
    expect(c).toContain('neem: nunca')
    expect(c).toContain('Problema (ayer): Puntas quemadas')
    expect(c).not.toContain('Terminada (')
    expect(c).toContain('noviembre')
  })

  it('sin plantas', () => {
    expect(ContextoAsistente.contexto(datosVacios(), hoyTest)).toContain('todavía no cargó ninguna')
  })

  it('la guía tiene todas las secciones', () => {
    expect(Guia.secciones.map((s) => s.titulo)).toEqual(['Riego', 'Sexado', 'Polen', 'Cosecha', 'Secado', 'Curado', 'Reciclar tierra'])
  })
})
