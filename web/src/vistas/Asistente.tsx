import { useSignal } from '@preact/signals'
import { useEffect, useRef, useState } from 'preact/hooks'
import { agregarAlChat, borrarChat, chat, climaVigente, datos } from '../app/almacen'
import { elegirFoto, Fotos } from '../app/fotos'
import { irAPestania } from '../app/router'
import { ClienteClaude, secretos } from '../app/servicios'
import { avisar } from '../app/ui'
import { Encabezado, Girando, Hoja, Tarjeta } from '../componentes'
import { mensajeErrorClaude, nuevoMensaje, type MensajeChat } from '../core/claude'
import { ContextoAsistente } from '../core/contexto'
import { Guia } from '../core/guia'
import { markdownEnLinea } from '../core/markdown'
import { Icono, type NombreIcono } from '../iconos'

export function VistaAsistente() {
  const [texto, setTexto] = useState('')
  const [foto, setFoto] = useState<File | undefined>()
  const [vista, setVista] = useState<string | undefined>()
  const enviando = useSignal(false)
  const guia = useSignal(false)
  const final = useRef<HTMLDivElement>(null)
  const entrada = useRef<HTMLDivElement>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const mensajes = chat.value

  useEffect(() => {
    final.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [mensajes.length, enviando.value])

  useEffect(() => {
    if (!foto) {
      setVista(undefined)
      return
    }
    const u = URL.createObjectURL(foto)
    setVista(u)
    return () => URL.revokeObjectURL(u)
  }, [foto])

  // Con el teclado abierto, la barra de entrada se apoya arriba del teclado.
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const ajustar = () => {
      const tapado = window.innerHeight - vv.height - vv.offsetTop
      if (entrada.current) entrada.current.style.bottom = tapado > 80 ? `${tapado}px` : ''
    }
    vv.addEventListener('resize', ajustar)
    vv.addEventListener('scroll', ajustar)
    return () => {
      vv.removeEventListener('resize', ajustar)
      vv.removeEventListener('scroll', ajustar)
    }
  }, [])

  // El cuadro de texto crece con lo que escribís (hasta 5 líneas).
  useEffect(() => {
    const t = area.current
    if (!t) return
    t.style.height = 'auto'
    t.style.height = `${Math.min(t.scrollHeight, 140)}px`
  }, [texto])

  const puedeEnviar = !enviando.value && (texto.trim() !== '' || foto !== undefined)

  const enviar = async (pregunta: string) => {
    const limpia = pregunta.trim()
    if (enviando.value || (limpia === '' && !foto)) return
    const clave = secretos.value.apiKey
    if (!clave) {
      agregarAlChat(nuevoMensaje('usuario', limpia))
      agregarAlChat(nuevoMensaje('asistente', mensajeErrorClaude({ tipo: 'sinClave' }), { esError: true }))
      setTexto('')
      return
    }
    let jpeg: string | undefined
    if (foto) {
      try {
        jpeg = await Fotos.paraClaude(foto)
      } catch {
        avisar('No pude leer la foto')
        return
      }
    }
    agregarAlChat(nuevoMensaje('usuario', limpia, jpeg === undefined ? {} : { imagenJPEG: jpeg }))
    setTexto('')
    setFoto(undefined)
    area.current?.blur()
    enviando.value = true
    const contexto = ContextoAsistente.contexto(datos.value, new Date(), climaVigente.value)
    const r = await ClienteClaude.enviar(chat.value, contexto, clave)
    agregarAlChat(r.ok
      ? nuevoMensaje('asistente', r.valor.texto, { bloques: r.valor.bloques })
      : nuevoMensaje('asistente', mensajeErrorClaude(r.error), { esError: true }))
    enviando.value = false
  }

  return (
    <main class="pantalla con-entrada">
      <Encabezado titulo="Asistente" acciones={
        <>
          <button class="boton-texto" onClick={() => { guia.value = true }}><Icono nombre="libro" />Guía</button>
          <button class="boton-texto" disabled={mensajes.length === 0 || enviando.value}
            onClick={() => { borrarChat(); setTexto(''); setFoto(undefined) }}>Nuevo chat</button>
        </>
      } />

      {mensajes.length === 0 && (
        <>
          <Tarjeta fondo="verde">
            <h3><Icono nombre="hoja" />Preguntame lo que quieras</h3>
            <p class="texto">Ya conozco tus plantas, en qué etapa están y cuándo las regaste. Si algo se ve raro, mandame una foto.</p>
            {!secretos.value.apiKey && (
              <button class="boton-texto" style={{ alignSelf: 'flex-start', padding: 0, color: 'var(--ambar)', fontWeight: 620, whiteSpace: 'normal', textAlign: 'left' }}
                onClick={() => irAPestania('ajustes')}><Icono nombre="llave" />Primero cargá tu API key de Anthropic en Ajustes ›</button>
            )}
          </Tarjeta>
          <h2 class="subtitulo">Sin internet</h2>
          <GuiaRapida abierta={false} />
        </>
      )}

      <div class="chat">
        {mensajes.map((m) => <Burbuja key={m.id} m={m} />)}
        {enviando.value && <div class="pensando"><Girando /> Pensando…</div>}
        <div ref={final} />
      </div>

      <div class="entrada-chat" ref={entrada}>
        <div class="interior">
          <div class="chips">
            {ContextoAsistente.chips.map((c) => (
              <button key={c} disabled={enviando.value} onClick={() => void enviar(c)}>{c}</button>
            ))}
          </div>
          {vista && (
            <div class="adjunto">
              <img src={vista} alt="" />
              <span style={{ flex: 1 }}>Foto lista para mandar</span>
              <button class="boton-texto" aria-label="Quitar foto" onClick={() => setFoto(undefined)}><Icono nombre="cruz" /></button>
            </div>
          )}
          <div class="redactar">
            <button class="boton-icono" aria-label="Adjuntar foto" onClick={async () => setFoto((await elegirFoto()) ?? foto)}
              style={{ width: '40px', height: '40px' }}><Icono nombre="camara" tam={26} /></button>
            <textarea ref={area} rows={1} placeholder="Escribí tu pregunta…" aria-label="Pregunta" value={texto}
              onInput={(e) => setTexto((e.target as HTMLTextAreaElement).value)} />
            <button class="enviar" aria-label="Enviar" disabled={!puedeEnviar} onClick={() => void enviar(texto)}><Icono nombre="flechaArriba" tam={22} /></button>
          </div>
        </div>
      </div>

      {guia.value && (
        <Hoja titulo="Guía rápida" textoCerrar="Listo" onCerrar={() => { guia.value = false }}>
          <GuiaRapida abierta />
        </Hoja>
      )}
    </main>
  )
}

function Burbuja({ m }: { m: MensajeChat }) {
  return (
    <div class={`burbuja-fila ${m.rol}`}>
      <div class={`burbuja${m.esError ? ' error' : ''}`}>
        {m.imagenJPEG && <img src={`data:image/jpeg;base64,${m.imagenJPEG}`} alt="Foto que mandaste" />}
        {m.texto !== '' && <div class="texto" dangerouslySetInnerHTML={{ __html: markdownEnLinea(m.texto) }} />}
      </div>
    </div>
  )
}

export function GuiaRapida({ abierta }: { abierta: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {Guia.secciones.map((s) => (
        <details class="guia" key={s.titulo} open={abierta}>
          <summary><Icono nombre={s.icono as NombreIcono} color="var(--verde)" />{s.titulo}</summary>
          <ol>{s.pasos.map((paso) => <li key={paso}>{paso}</li>)}</ol>
        </details>
      ))}
    </div>
  )
}
