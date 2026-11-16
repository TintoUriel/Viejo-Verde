import { useEffect, useRef, useState } from 'preact/hooks'
import { cambiar } from '../app/almacen'
import { elegirFoto, Fotos } from '../app/fotos'
import { avisar, confirmar } from '../app/ui'
import { Hoja, Segmentos, Seccion } from '../componentes'
import { Calendario } from '../core/calendario'
import { D } from '../core/datos'
import { nombreTipoRegistro, TIPOS_REGISTRO, type Registro, type TipoRegistro } from '../core/modelos'
import { Icono } from '../iconos'

/** Editar o borrar un registro del historial. */
export function EditarRegistro(p: { plantaID: string; registro: Registro; onCerrar: () => void }) {
  const r = p.registro
  const [tipo, setTipo] = useState<TipoRegistro>(r.tipo)
  const [fecha, setFecha] = useState<Date>(r.fecha)
  const [producto, setProducto] = useState(r.producto ?? '')
  const [nota, setNota] = useState(r.nota ?? '')
  const [agua, setAgua] = useState(r.aguaML === undefined ? '' : String(r.aguaML))

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
      <Seccion pie={tipo === 'problema' ? 'Después podés preguntarle al asistente y mandarle la foto.' : undefined}>
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
