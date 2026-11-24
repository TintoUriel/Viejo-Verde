import { useSignal } from '@preact/signals'
import { useState } from 'preact/hooks'
import { cambiar, datos } from '../app/almacen'
import { confirmar } from '../app/ui'
import { Contador, Encabezado, Hoja, Interruptor, Segmentos, Seccion } from '../componentes'
import { Calendario } from '../core/calendario'
import { D } from '../core/datos'
import { Formato } from '../core/formato'
import { Guia } from '../core/guia'
import {
  nombreTipoPlanta, nombreTipoSemilla, nuevoPaquete, nuevoPolen, TIPOS_PLANTA, TIPOS_SEMILLA,
  type PaqueteSemillas, type Polen, type TipoPlanta, type TipoSemilla,
} from '../core/modelos'
import { Icono } from '../iconos'
import { FormPlanta } from './FormPlanta'

export function VistaSemillas() {
  const nuevoPack = useSignal(false)
  const packEditado = useSignal<PaqueteSemillas | undefined>(undefined)
  const germinarDesde = useSignal<PaqueteSemillas | undefined>(undefined)
  const polenNuevo = useSignal(false)

  const packs = [...datos.value.paquetes].sort((a, b) => {
    const va = a.cantidad > 0 ? 0 : 1
    const vb = b.cantidad > 0 ? 0 : 1
    return va !== vb ? va - vb : a.nombre.localeCompare(b.nombre, 'es')
  })
  const polenes = [...datos.value.polenes].sort((a, b) => b.fecha.getTime() - a.fecha.getTime())

  return (
    <main class="pantalla ancha multicolumna">
      <Encabezado titulo="Semillas" acciones={
        <button class="boton-icono" aria-label="Agregar pack" onClick={() => { nuevoPack.value = true }}><Icono nombre="masCirculo" tam={28} /></button>
      } />

      <Seccion titulo="Packs" pie={packs.length > 0 ? 'Tocá un pack para editarlo. "Germinar" descuenta 1 y crea la planta.' : undefined}>
        {packs.length === 0 && <div class="fila"><span class="secundario">Todavía no cargaste semillas. Tocá + para agregar un pack.</span></div>}
        {packs.map((k) => (
          <FilaPack key={k.id} pack={k} onEditar={() => { packEditado.value = k }} onGerminar={() => { germinarDesde.value = k }} />
        ))}
      </Seccion>

      <Seccion titulo="Polen">
        {polenes.length === 0 && <div class="fila"><span class="secundario">Sin polen guardado.</span></div>}
        {polenes.map((x) => <FilaPolen key={x.id} polen={x} />)}
        <button class="fila accion" onClick={() => { polenNuevo.value = true }}><Icono nombre="mas" tam={18} />Agregar polen a mano</button>
      </Seccion>

      <Seccion titulo="Cómo guardar">
        <div class="fila"><Icono nombre="heladera" color="var(--verde)" /><span style={{ fontSize: '15px' }}>{Guia.consejoSemillas}</span></div>
        <div class="fila"><Icono nombre="copo" color="var(--teal)" /><span style={{ fontSize: '15px' }}>{Guia.consejoPolen}</span></div>
      </Seccion>

      {nuevoPack.value && <FormPaquete onCerrar={() => { nuevoPack.value = false }} />}
      {packEditado.value && <FormPaquete original={packEditado.value} onCerrar={() => { packEditado.value = undefined }} />}
      {germinarDesde.value && <FormPlanta desdePaquete={germinarDesde.value} onCerrar={() => { germinarDesde.value = undefined }} />}
      {polenNuevo.value && <FormPolen onCerrar={() => { polenNuevo.value = false }} />}
    </main>
  )
}

function FilaPack({ pack, onEditar, onGerminar }: { pack: PaqueteSemillas; onEditar: () => void; onGerminar: () => void }) {
  return (
    <div class="fila">
      <div class="principal">
        <button class="enlace-fila" onClick={onEditar}>
          <span style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span class="nombre">{pack.nombre}</span>
            {pack.propias && <span class="chip-propias">Propias</span>}
          </span>
          <span class="secundario">{[pack.banco, nombreTipoPlanta[pack.tipo], nombreTipoSemilla[pack.semilla]].filter(Boolean).join(' · ')}</span>
        </button>
        {pack.cantidad > 0 && (
          <button class="mini-boton" style={{ alignSelf: 'flex-start', marginTop: '4px' }} onClick={onGerminar}><Icono nombre="brote" tam={16} />Germinar</button>
        )}
      </div>
      <Contador valor={pack.cantidad} onCambio={(v) => cambiar((d) => D.ajustarCantidad(d, pack.id, v - pack.cantidad))} />
    </div>
  )
}

function FilaPolen({ polen }: { polen: Polen }) {
  const borrar = async () => {
    if (await confirmar(`¿Borrar el polen de ${polen.plantaOrigen}?`, 'Borrar', { destructiva: true })) {
      cambiar((d) => D.borrarPolen(d, polen.id))
    }
  }
  return (
    <div class="fila" style={{ opacity: polen.usado ? 0.6 : 1 }}>
      <div class="principal">
        <span class="nombre">{polen.plantaOrigen}</span>
        <span class="secundario">Juntado el {Formato.fechaCorta(polen.fecha)}{polen.usado ? ' · usado' : ''}</span>
        {polen.notas !== '' && <span class="secundario" style={{ fontSize: '13px' }}>{polen.notas}</span>}
      </div>
      <button class={`mini-boton${polen.usado ? ' gris' : ''}`} onClick={() => cambiar((d) => D.alternarPolenUsado(d, polen.id))}>
        {polen.usado ? 'Sin usar' : 'Usado'}
      </button>
      <button class="mini-boton peligro" aria-label="Borrar polen" onClick={borrar}><Icono nombre="basura" tam={16} /></button>
    </div>
  )
}

export function FormPaquete({ original, onCerrar }: { original?: PaqueteSemillas; onCerrar: () => void }) {
  const [nombre, setNombre] = useState(original?.nombre ?? '')
  const [banco, setBanco] = useState(original?.banco ?? '')
  const [tipo, setTipo] = useState<TipoPlanta>(original?.tipo ?? 'auto')
  const [semilla, setSemilla] = useState<TipoSemilla>(original?.semilla ?? 'feminizada')
  const [cantidad, setCantidad] = useState(original?.cantidad ?? 3)
  const [fecha, setFecha] = useState<Date>(original?.fechaCompra ?? new Date())
  const [propias, setPropias] = useState(original?.propias ?? false)

  const guardar = () => {
    const base = original ?? nuevoPaquete({ nombre: '', banco: '', tipo, semilla, cantidad: 0, fechaCompra: fecha })
    const pack: PaqueteSemillas = { ...base, nombre: nombre.trim(), banco: banco.trim(), tipo, semilla, cantidad, fechaCompra: fecha, propias }
    cambiar((d) => (original ? D.actualizarPaquete(d, pack) : D.agregarPaquete(d, pack)))
    onCerrar()
  }
  const borrar = async () => {
    if (!original) return
    if (await confirmar(`¿Borrar el pack ${original.nombre}?`, 'Borrar pack', { destructiva: true })) {
      cambiar((d) => D.borrarPaquete(d, original.id))
      onCerrar()
    }
  }

  return (
    <Hoja titulo={original ? 'Editar pack' : 'Nuevo pack'} onCerrar={onCerrar} onGuardar={guardar} guardarDeshabilitado={nombre.trim() === ''}>
      <Seccion>
        <div class="fila">
          <input type="text" placeholder="Nombre (ej. Banana Blaze)" aria-label="Nombre" value={nombre}
            onInput={(e) => setNombre((e.target as HTMLInputElement).value)} />
        </div>
        <div class="fila">
          <input type="text" placeholder="Banco (ej. Dutch Passion)" aria-label="Banco" value={banco}
            onInput={(e) => setBanco((e.target as HTMLInputElement).value)} />
        </div>
      </Seccion>
      <Seccion>
        <div class="fila"><Segmentos opciones={TIPOS_PLANTA.map((t) => [t, nombreTipoPlanta[t]] as const)} valor={tipo} onCambio={setTipo} /></div>
        <div class="fila"><Segmentos opciones={TIPOS_SEMILLA.map((t) => [t, nombreTipoSemilla[t]] as const)} valor={semilla} onCambio={setSemilla} /></div>
        <div class="fila">
          <span style={{ flex: 1 }}>Cantidad</span>
          <Contador valor={cantidad} min={0} max={999} onCambio={setCantidad} />
        </div>
        <label class="fila">
          <span>Comprado</span>
          <input type="date" max={Calendario.claveDia(new Date())} value={Calendario.claveDia(fecha)}
            onChange={(e) => {
              const f = Calendario.leerClave((e.target as HTMLInputElement).value)
              if (f && !Calendario.mismoDia(f, fecha)) setFecha(f)
            }} />
        </label>
        <div class="fila">
          <span style={{ flex: 1 }}>Semillas propias</span>
          <Interruptor etiqueta="Semillas propias" valor={propias} onCambio={setPropias} />
        </div>
      </Seccion>
      {original && (
        <Seccion>
          <button class="fila accion peligro" onClick={borrar}>Borrar pack</button>
        </Seccion>
      )}
    </Hoja>
  )
}

function FormPolen({ onCerrar }: { onCerrar: () => void }) {
  const [origen, setOrigen] = useState('')
  const [fecha, setFecha] = useState<Date>(new Date())
  const [notas, setNotas] = useState('')
  const guardar = () => {
    const polen = nuevoPolen({ fecha, plantaOrigen: origen.trim(), notas: notas.trim() })
    cambiar((d) => D.agregarPolen(d, polen))
    onCerrar()
  }
  return (
    <Hoja titulo="Polen" onCerrar={onCerrar} onGuardar={guardar} guardarDeshabilitado={origen.trim() === ''}>
      <Seccion>
        <div class="fila">
          <input type="text" placeholder="De qué planta (ej. Macho regular 1)" aria-label="Planta de origen" value={origen}
            onInput={(e) => setOrigen((e.target as HTMLInputElement).value)} />
        </div>
        <label class="fila">
          <span>Juntado</span>
          <input type="date" max={Calendario.claveDia(new Date())} value={Calendario.claveDia(fecha)}
            onChange={(e) => {
              const f = Calendario.leerClave((e.target as HTMLInputElement).value)
              if (f && !Calendario.mismoDia(f, fecha)) setFecha(f)
            }} />
        </label>
        <div class="fila">
          <textarea rows={2} placeholder="Notas (ej. sobre en frasco con arroz)" aria-label="Notas" value={notas}
            onInput={(e) => setNotas((e.target as HTMLTextAreaElement).value)} />
        </div>
      </Seccion>
    </Hoja>
  )
}
