import { useRef, useState } from 'preact/hooks'
import { desbloquear } from '../app/acceso'
import { Girando } from '../componentes'
import { Icono } from '../iconos'

/** Pantalla de entrada: la contraseña descifra la conexión con la planilla. Se pide una vez por teléfono. */
export function PantallaContrasenia() {
  const [texto, setTexto] = useState('')
  const [error, setError] = useState(false)
  const [probando, setProbando] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  const entrar = async (e: Event) => {
    e.preventDefault()
    if (texto === '' || probando) return
    setProbando(true)
    setError(false)
    const ok = await desbloquear(texto)
    if (!ok) {
      setProbando(false)
      setError(true)
      setTexto('')
      setTimeout(() => ref.current?.focus(), 0)
    }
  }

  return (
    <main class="pantalla entrada">
      <form class="entrada-caja" onSubmit={entrar}>
        <img src="icon-192.png" alt="" class="entrada-icono" width={88} height={88} />
        <h1>Viejo Verde</h1>
        <p class="nota">Ingresá la contraseña para entrar.</p>
        <input ref={ref} type="password" autoFocus autoComplete="current-password" aria-label="Contraseña"
          placeholder="Contraseña" value={texto} disabled={probando}
          onInput={(e) => { setTexto((e.target as HTMLInputElement).value); setError(false) }} />
        {error && <p class="peligro-texto con-icono"><Icono nombre="alerta" tam={18} />Contraseña incorrecta.</p>}
        <button class="boton" type="submit" disabled={texto === '' || probando}>
          {probando ? <><Girando /><span>Verificando…</span></> : <><Icono nombre="candado" /><span>Entrar</span></>}
        </button>
      </form>
    </main>
  )
}
