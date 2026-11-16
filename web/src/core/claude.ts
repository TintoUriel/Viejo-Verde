import { exito, falla, uuid, type Resultado } from './util'

// ─── Mensajes del chat ───

export type RolChat = 'usuario' | 'asistente'

export interface MensajeChat {
  id: string
  rol: RolChat
  texto: string
  /** Foto adjunta (JPEG ya achicado), en base64. */
  imagenJPEG?: string
  /** Bloques tal como los devolvió la API (incluye los de razonamiento), para reenviarlos sin tocar. */
  bloques?: unknown[]
  fecha: Date
  /** Mensaje de error local: se muestra pero no se manda a la API. */
  esError: boolean
}

export function nuevoMensaje(rol: RolChat, texto: string, o: { imagenJPEG?: string; bloques?: unknown[]; esError?: boolean } = {}): MensajeChat {
  const m: MensajeChat = { id: uuid(), rol, texto, fecha: new Date(), esError: o.esError ?? false }
  if (o.imagenJPEG !== undefined) m.imagenJPEG = o.imagenJPEG
  if (o.bloques !== undefined) m.bloques = o.bloques
  return m
}

// ─── Pedido ───

type Bloque = Record<string, unknown>
export interface Turno {
  role: 'user' | 'assistant'
  content: unknown[]
}

const textoBloque = (s: string): Bloque => ({ type: 'text', text: s })

export const PedidoClaude = {
  url: 'https://api.anthropic.com/v1/messages',
  modelo: 'claude-sonnet-5-5',
  versionAPI: '2026-10-21',
  /** Si un clasificador rechaza el pedido, la API lo reintenta sola con el modelo recomendado. */
  betaFallback: 'server-side-fallback-2026-07-01',
  maxTokens: 16000,
  /** Cuántos mensajes del historial se mandan. */
  maxMensajes: 20,
  /** Solo se reenvían las fotos de los últimos mensajes (las viejas se reemplazan por una nota). */
  maxFotos: 2,

  encabezados(apiKey: string): Record<string, string> {
    return {
      'x-api-key': apiKey,
      'anthropic-version': PedidoClaude.versionAPI,
      'anthropic-beta': PedidoClaude.betaFallback,
      'content-type': 'application/json',
      // Desde el navegador la API exige este permiso explícito (la clave es tuya y queda en tu teléfono).
      'anthropic-dangerous-direct-browser-access': 'true',
    }
  },

  /** Cuerpo JSON del pedido. `contexto` (fecha, plantas…) va como segundo bloque del system. */
  cuerpo(historial: MensajeChat[], instrucciones: string, contexto: string): string {
    const usuarios = historial.filter((m) => !m.esError && m.rol === 'usuario')
    const ultimoConFoto = usuarios.length > 0 && usuarios[usuarios.length - 1].imagenJPEG !== undefined
    return JSON.stringify({
      model: PedidoClaude.modelo,
      max_tokens: PedidoClaude.maxTokens,
      system: [textoBloque(instrucciones), textoBloque(contexto)],
      messages: PedidoClaude.mensajes(historial),
      fallbacks: 'default',
      // Chat: esfuerzo bajo. Con foto (diagnóstico) conviene que piense un poco más.
      output_config: { effort: ultimoConFoto ? 'medium' : 'low' },
    })
  },

  /** Arma los turnos: empieza con el usuario, alterna roles y limita fotos e historial. */
  mensajes(historial: MensajeChat[]): Turno[] {
    const lista = historial.filter((m) => !m.esError).slice(-PedidoClaude.maxMensajes)
    while (lista.length > 0 && lista[0].rol !== 'usuario') lista.shift()

    const conFoto = lista.flatMap((m, i) => (m.rol === 'usuario' && m.imagenJPEG !== undefined ? [i] : []))
    const fotosQueVan = new Set(conFoto.slice(-PedidoClaude.maxFotos))

    const turnos: { rol: RolChat; bloques: unknown[] }[] = []
    lista.forEach((m, i) => {
      let bloques: unknown[] = []
      if (m.rol === 'usuario') {
        if (m.imagenJPEG !== undefined) {
          bloques.push(fotosQueVan.has(i)
            ? { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: m.imagenJPEG } }
            : textoBloque('[Acá había mandado una foto]'))
        }
        const t = m.texto.trim()
        bloques.push(textoBloque(t === '' ? 'Mirá esta foto de mi planta.' : t))
      } else {
        bloques = m.bloques ?? [textoBloque(m.texto)]
      }
      const ultimo = turnos[turnos.length - 1]
      if (ultimo && ultimo.rol === m.rol) ultimo.bloques.push(...bloques)
      else turnos.push({ rol: m.rol, bloques })
    })
    return turnos.map((t) => ({ role: t.rol === 'usuario' ? 'user' : 'assistant', content: t.bloques }))
  },
}

// ─── Respuesta ───

export interface RespuestaClaude {
  texto: string
  bloques: unknown[]
  stopReason?: string
}

export type ErrorClaude =
  | { tipo: 'sinClave' }
  | { tipo: 'http'; status: number; error: string; mensaje: string }
  | { tipo: 'rechazo' }
  | { tipo: 'vacia' }
  | { tipo: 'red'; detalle: string }

export function mensajeErrorClaude(e: ErrorClaude): string {
  switch (e.tipo) {
    case 'sinClave':
      return 'Falta tu API key de Anthropic. Cargala en Ajustes.'
    case 'http':
      if (e.status === 401 || e.error === 'authentication_error') return 'La API key no es válida. Revisala en Ajustes.'
      if (e.status === 402 || e.error === 'billing_error') return 'Hay un problema de facturación en tu cuenta de Anthropic.'
      if (e.status === 429 || e.error === 'rate_limit_error') return 'Demasiados pedidos seguidos. Probá en un minuto.'
      if (e.status === 529 || e.error === 'overloaded_error') return 'Claude está saturado. Probá en un rato.'
      if (e.status === 413) return 'El mensaje es muy grande (¿la foto?). Probá con otra.'
      return `Error ${e.status}: ${e.mensaje}`
    case 'rechazo':
      return 'Claude no quiso responder eso. Probá preguntarlo de otra forma.'
    case 'vacia':
      return 'Claude no devolvió texto. Probá de nuevo.'
    case 'red':
      return `No hay conexión con Claude (${e.detalle}).`
  }
}

type JSONObj = Record<string, unknown>
const comoObj = (v: unknown): JSONObj | undefined =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as JSONObj) : undefined

export const LectorRespuesta = {
  leer(texto: string, status: number): Resultado<RespuestaClaude, ErrorClaude> {
    let json: JSONObj | undefined
    try {
      json = comoObj(JSON.parse(texto))
    } catch {
      json = undefined
    }
    if (status !== 200) {
      const err = comoObj(json?.error)
      const tipo = typeof err?.type === 'string' ? err.type : 'desconocido'
      const mensaje = typeof err?.message === 'string' ? err.message : texto.slice(0, 200)
      return falla({ tipo: 'http', status, error: tipo, mensaje })
    }
    const stop = typeof json?.stop_reason === 'string' ? json.stop_reason : undefined
    if (stop === 'refusal') return falla({ tipo: 'rechazo' })
    const bloques = Array.isArray(json?.content) ? (json.content as unknown[]) : []
    let t = bloques
      .map(comoObj)
      .filter((b) => b?.type === 'text' && typeof b.text === 'string')
      .map((b) => b!.text as string)
      .join('\n\n')
      .trim()
    if (t === '') return falla({ tipo: 'vacia' })
    if (stop === 'max_tokens') t += '\n\n(La respuesta quedó cortada.)'
    return exito({ texto: t, bloques, stopReason: stop })
  },
}

// ─── Historial del chat ───

const MAX_MENSAJES_GUARDADOS = 80
const MAX_FOTOS_GUARDADAS = 10

export const HistorialChat = {
  maxMensajes: MAX_MENSAJES_GUARDADOS,
  maxFotos: MAX_FOTOS_GUARDADAS,

  /** Recorta el chat guardado: últimos mensajes y solo las fotos más recientes. */
  recortar(m: MensajeChat[], maxMensajes = MAX_MENSAJES_GUARDADOS, maxFotos = MAX_FOTOS_GUARDADAS): MensajeChat[] {
    const lista = m.slice(-maxMensajes).map((x) => ({ ...x }))
    const conFoto = lista.flatMap((x, i) => (x.imagenJPEG !== undefined ? [i] : []))
    for (const i of conFoto.slice(0, Math.max(conFoto.length - maxFotos, 0))) delete lista[i].imagenJPEG
    return lista
  },
}
