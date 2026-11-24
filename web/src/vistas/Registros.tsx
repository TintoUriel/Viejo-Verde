import { useEffect, useRef, useState } from 'preact/hooks'
import { cambiar } from '../app/almacen'
import { elegirFoto, Fotos } from '../app/fotos'
import { avisar, confirmar } from '../app/ui'
import { Hoja, Segmentos, Seccion } from '../componentes'
import { Calendario } from '../core/calendario'
import { D } from '../core/datos'
import { Formato } from '../core/formato'
import { historial, nombreTipoRegistro, TIPOS_REGISTRO, type Planta, type Registro, type TipoRegistro } from '../core/modelos'
import { Icono } from '../iconos'

/** Editar o borrar un registro del historial. */
export function EditarRegistro(p: { plantaID: string; registro: Registro; onCerrar: () => void }) {
  const r = p.registro
  const [tipo, setTipo] = useState<TipoRegistro>(r.tipo)
  const [fecha, setFecha] = useState<Date>(r.fecha)
  const [producto, setProducto] = useState(r.producto ?? '')
  const [nota, setNota] = useState(r.nota ?? '')
  const [agua, setAgua] = useState(r.aguaML === undefined ? '' : String(r.aguaML))
  const [ph, setPH] = useState(r.phDrenaje === undefined ? '' : Formato.numero(r.phDrenaje))
  const esRiego = tipo === 'riego' || tipo === 'fertilizante'

  const guardar = () => {
    const editado: Registro = { ...r, tipo, fecha }
    const pr = producto.trim()
    const n = nota.trim()
    const a = Number.parseInt(agua.trim(), 10)
    if (pr === '') delete editado.producto
    else editado.producto = pr
    if (n === '') delete editado.nota
    else editado.nota = n
    if (Number.isFinite(a) && /^\d+$/.test(agua.trim())) editado.aguaML = a
    else delete editado.aguaML
    const v = leerPH(ph)
    if (esRiego && v !== undefined) editado.phDrenaje = v
    else delete editado.phDrenaje
    cambiar((d) => D.editarRegistro(d, editado, p.plantaID))
    p.onCerrar()
  }

  const borrar = async () => {
    if (await confirmar('¿Borrar este registro?', 'Borrar', { destructiva: true })) {
      cambiar((d) => D.borrarRegistro(d, r.id, p.plantaID))
      p.onCerrar()
    }
  }

  return (
    <Hoja titulo="Registro" onCerrar={p.onCerrar} onGuardar={guardar}>
      <Seccion>
        <label class="fila">
          <span style={{ flex: 1 }}>Tipo</span>
          <select value={tipo} onChange={(e) => setTipo((e.target as HTMLSelectElement).value as TipoRegistro)}>
            {TIPOS_REGISTRO.map((t) => <option key={t} value={t}>{nombreTipoRegistro[t]}</option>)}
          </select>
        </label>
        <label class="fila">
          <span>Fecha</span>
          <input type="datetime-local" max={Calendario.claveMinuto(new Date())} value={Calendario.claveMinuto(fecha)}
            onChange={(e) => {
              const f = Calendario.leerClave((e.target as HTMLInputElement).value)
              if (f && Calendario.claveMinuto(f) !== Calendario.claveMinuto(fecha)) setFecha(f)
            }} />
        </label>
      </Seccion>
      <Seccion>
        <label class="fila">
          <span>Producto</span>
          <input type="text" placeholder="ej. Top Veg" value={producto} style={{ textAlign: 'right' }}
            onInput={(e) => setProducto((e.target as HTMLInputElement).value)} />
        </label>
        <label class="fila">
          <span>Agua (ml)</span>
          <input type="text" inputMode="numeric" placeholder="—" value={agua} style={{ textAlign: 'right' }}
            onInput={(e) => setAgua((e.target as HTMLInputElement).value)} />
        </label>
        {esRiego && (
          <label class="fila">
            <span>pH del drenaje</span>
            <input type="text" inputMode="decimal" placeholder="—" value={ph} style={{ textAlign: 'right' }}
              onInput={(e) => setPH((e.target as HTMLInputElement).value)} />
          </label>
        )}
        <div class="fila">
          <textarea placeholder="Nota" aria-label="Nota" rows={3} value={nota}
            onInput={(e) => setNota((e.target as HTMLTextAreaElement).value)} />
        </div>
      </Seccion>
      <Seccion>
        <button class="fila accion peligro" onClick={borrar}>Borrar registro</button>
      </Seccion>
    </Hoja>
  )
}

/** Nota o problema, con foto opcional. */
export function NuevaNota(p: { plantaID: string; onCerrar: () => void }) {
  const [tipo, setTipo] = useState<'nota' | 'problema'>('nota')
  const [texto, setTexto] = useState('')
  const [foto, setFoto] = useState<File | undefined>()
  const [vista, setVista] = useState<string | undefined>()
  const [guardando, setGuardando] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { setTimeout(() => ref.current?.focus(), 300) }, [])
  useEffect(() => {
    if (!foto) {
      setVista(undefined)
      return
    }
    const u = URL.createObjectURL(foto)
    setVista(u)
    return () => URL.revokeObjectURL(u)
  }, [foto])

  const vacia = texto.trim() === '' && !foto
  const guardar = async () => {
    if (vacia || guardando) return
    setGuardando(true)
    try {
      const nombreFoto = foto ? await Fotos.guardar(foto) : undefined
      const limpio = texto.trim()
      const ahora = new Date()
      cambiar((d) => {
        D.registrar(d, tipo, p.plantaID, ahora, { nota: limpio === '' ? 'Foto' : limpio })
        if (nombreFoto) D.agregarFoto(d, nombreFoto, p.plantaID, ahora)
      })
      avisar(tipo === 'problema' ? 'Problema anotado' : 'Nota guardada')
      p.onCerrar()
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No pude guardar la foto')
      setGuardando(false)
    }
  }

  return (
    <Hoja titulo={tipo === 'problema' ? 'Problema' : 'Nota'} onCerrar={p.onCerrar} onGuardar={guardar}
      guardarDeshabilitado={vacia || guardando}>
      <Segmentos opciones={[['nota', 'Nota'], ['problema', 'Problema']] as const} valor={tipo} onCambio={setTipo} />
      <Seccion>
        <div class="fila">
          <textarea ref={ref} rows={4} value={texto} aria-label="Texto"
            placeholder={tipo === 'problema' ? '¿Qué ves? (ej. hojas de abajo amarillas)' : 'Escribí la nota'}
            onInput={(e) => setTexto((e.target as HTMLTextAreaElement).value)} />
        </div>
      </Seccion>
      <Seccion pie={tipo === 'problema' ? 'Para un diagnóstico: en la ficha de la planta, "Copiar su historia para una IA", y pegala junto con la foto.' : undefined}>
        {vista ? (
          <>
            <div class="fila"><img src={vista} alt="" style={{ maxHeight: '220px', borderRadius: '12px', margin: '0 auto' }} /></div>
            <button class="fila accion peligro" onClick={() => setFoto(undefined)}>Quitar foto</button>
          </>
        ) : (
          <button class="fila accion" onClick={async () => setFoto(await elegirFoto())}><Icono nombre="camara" />Agregar foto</button>
        )}
      </Seccion>
    </Hoja>
  )
}

// ─── pH del drenaje ───

/** "6,4" → 6.4. Solo valores posibles de pH (0 a 14). */
function leerPH(t: string): number | undefined {
  const s = t.trim().replace(',', '.')
  const n = Number(s)
  return s !== '' && Number.isFinite(n) && n >= 0 && n <= 14 ? Math.round(n * 100) / 100 : undefined
}

/** Los últimos riegos (con o sin fertilizante), del más nuevo al más viejo. */
export function riegosRecientes(p: Planta, n = 5): Registro[] {
  return historial(p).filter((r) => r.tipo === 'riego' || r.tipo === 'fertilizante').slice(0, n)
}

function cuando(f: Date): string {
  const ahora = new Date()
  const h = `${Calendario.hora(f)}:${String(Calendario.minuto(f)).padStart(2, '0')}`
  if (Calendario.mismoDia(f, ahora)) return `Hoy, ${h}`
  if (Calendario.dias(f, ahora) === 1) return `Ayer, ${h}`
  return Formato.fechaHora(f)
}

/** El pH del agua que sale por abajo de la maceta: se anota en el riego en el que se midió. */
export function PHDrenaje(p: { planta: Planta; onCerrar: () => void }) {
  const riegos = riegosRecientes(p.planta)
  const [id, setId] = useState(riegos[0]?.id)
  const elegido = riegos.find((r) => r.id === id)
  const [texto, setTexto] = useState(elegido?.phDrenaje === undefined ? '' : Formato.numero(elegido.phDrenaje))
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { setTimeout(() => ref.current?.focus(), 300) }, [])
  const valor = leerPH(texto)

  const guardar = () => {
    if (!elegido || valor === undefined) return
    const v = valor
    cambiar((d) => D.editarRegistro(d, { ...elegido, phDrenaje: v }, p.planta.id))
    avisar(`pH ${Formato.numero(v)} anotado`)
    p.onCerrar()
  }

  return (
    <Hoja titulo="pH del drenaje" onCerrar={p.onCerrar} onGuardar={guardar} guardarDeshabilitado={!elegido || valor === undefined}>
      <Seccion pie="Medí el agua que sale por abajo de la maceta después de regar (con tiras o un medidor).">
        <label class="fila">
          <span style={{ flex: 1 }}>pH</span>
          <input ref={ref} type="text" inputMode="decimal" placeholder="6,5" class="campo-ph" value={texto} aria-label="pH del drenaje"
            onInput={(e) => setTexto((e.target as HTMLInputElement).value)} />
        </label>
      </Seccion>
      {valor !== undefined && <LecturaPH valor={valor} />}
      {texto.trim() !== '' && valor === undefined && <p class="peligro-texto" style={{ margin: '0 6px', fontSize: '14px' }}>El pH va de 0 a 14.</p>}
      <Seccion titulo="¿De qué riego?">
        {riegos.map((r) => (
          <button key={r.id} class="fila" onClick={() => setId(r.id)} aria-pressed={r.id === id}>
            <Icono nombre={r.tipo === 'fertilizante' ? 'matraz' : 'gota'} color={r.tipo === 'fertilizante' ? 'var(--verde)' : 'var(--azul)'} />
            <span class="principal">
              <span class="nombre">{cuando(r.fecha)}</span>
              <span class="secundario">
                {[nombreTipoRegistro[r.tipo], r.aguaML !== undefined ? Formato.volumen(r.aguaML) : undefined,
                  r.phDrenaje !== undefined ? `ya tiene pH ${Formato.numero(r.phDrenaje)}` : undefined].filter(Boolean).join(' · ')}
              </span>
            </span>
            {r.id === id && <Icono nombre="check" color="var(--verde)" />}
          </button>
        ))}
      </Seccion>
    </Hoja>
  )
}

/** Qué quiere decir el número (en tierra, lo ideal es entre 6 y 7). */
function LecturaPH({ valor }: { valor: number }) {
  const [clase, titulo, texto] = valor < 5.8
    ? ['acido', 'Ácido', 'Más bajo que lo ideal en tierra (6 a 7). Si se repite, revisá el pH del agua con la que regás.']
    : valor > 7.2
      ? ['alcalino', 'Alcalino', 'Más alto que lo ideal en tierra (6 a 7). Si se repite, revisá el pH del agua con la que regás.']
      : ['bien', 'Bien', 'En tierra, lo ideal es entre 6 y 7.']
  return (
    <div class={`lectura-ph ${clase}`} role="status">
      <span class="escala-ph" aria-hidden="true"><span class="marca-ph" style={{ left: `${Math.min(Math.max((valor - 4) / 5, 0), 1) * 100}%` }} /></span>
      <strong>{titulo}</strong>
      <span>{texto}</span>
    </div>
  )
}
