import { useState } from 'preact/hooks'
import { cambiar, datos } from '../app/almacen'
import { avisar } from '../app/ui'
import { Contador, Hoja, Segmentos, Seccion } from '../componentes'
import { Calendario } from '../core/calendario'
import { D } from '../core/datos'
import { Formato } from '../core/formato'
import {
  nombreSexo, nombreTipoPlanta, nombreTipoSemilla, nombreUbicacion, nuevaPlanta, SEXOS, TIPOS_PLANTA, TIPOS_SEMILLA,
  UBICACIONES, type PaqueteSemillas, type Planta, type Sexo, type TipoPlanta, type TipoSemilla, type Ubicacion,
} from '../core/modelos'

const opciones = <T extends string>(valores: readonly T[], nombres: Record<T, string>) =>
  valores.map((v) => [v, nombres[v]] as const)

/** Alta o edición de una planta. */
export function FormPlanta(p: { editando?: Planta; desdePaquete?: PaqueteSemillas; onCerrar: () => void }) {
  const o = p.editando
  const pack = p.desdePaquete
  const [nombre, setNombre] = useState(o?.nombre ?? '')
  const [variedad, setVariedad] = useState(o?.variedad ?? pack?.nombre ?? '')
  const [tipo, setTipo] = useState<TipoPlanta>(o?.tipo ?? pack?.tipo ?? 'auto')
  const [semilla, setSemilla] = useState<TipoSemilla>(o?.semilla ?? pack?.semilla ?? 'feminizada')
  const [sexo, setSexo] = useState<Sexo>(o?.sexo ?? 'desconocido')
  const [ubicacion, setUbicacion] = useState<Ubicacion>(o?.ubicacion ?? 'patio')
  const [germinacion, setGerminacion] = useState<Date>(o?.fechaGerminacion ?? new Date())
  const [litros, setLitros] = useState(o?.litrosMaceta ?? 20)
  const [paqueteID, setPaqueteID] = useState<string | undefined>(pack?.id)

  const esNueva = !o
  const packs = datos.value.paquetes.filter((k) => k.cantidad > 0 || k.id === paqueteID)
  const nombreFinal = (() => {
    const n = nombre.trim()
    if (n !== '') return n
    const base = variedad.trim() === '' ? 'Planta' : variedad.trim()
    const cuantas = datos.value.plantas.filter((x) => x.variedad === variedad.trim()).length
    return `${base} ${cuantas + 1}`
  })()

  const elegirPack = (id: string) => {
    const k = datos.value.paquetes.find((x) => x.id === id)
    setPaqueteID(k?.id)
    if (k) {
      setVariedad(k.nombre)
      setTipo(k.tipo)
      setSemilla(k.semilla)
    }
  }

  const guardar = () => {
    const sexoFinal: Sexo = semilla === 'feminizada' ? 'hembra' : sexo
    if (o) {
      const editada: Planta = structuredClone(o)
      editada.nombre = nombreFinal
      editada.variedad = variedad.trim()
      editada.tipo = tipo
      editada.semilla = semilla
      editada.sexo = sexoFinal
      editada.ubicacion = ubicacion
      editada.fechaGerminacion = germinacion
      editada.litrosMaceta = litros
      // Si se corrigió la germinación, se corrige también su registro.
      const r = editada.registros.find((x) => x.tipo === 'germinacion')
      if (r) r.fecha = germinacion
      cambiar((d) => D.actualizar(d, editada))
    } else {
      const nueva = nuevaPlanta({ nombre: nombreFinal, variedad: variedad.trim(), tipo, semilla, sexo: sexoFinal, ubicacion,
        fechaGerminacion: germinacion, litrosMaceta: litros })
      cambiar((d) => D.agregarPlanta(d, nueva, paqueteID))
      avisar(`${nombreFinal} agregada`)
    }
    p.onCerrar()
  }

  const hoyClave = Calendario.claveDia(new Date())

  return (
    <Hoja titulo={esNueva ? 'Nueva planta' : 'Editar planta'} onCerrar={p.onCerrar} onGuardar={guardar}>
      {esNueva && packs.length > 0 && (
        <Seccion pie="Se descuenta una semilla del pack.">
          <label class="fila">
            <span>Sale del pack</span>
            <select value={paqueteID ?? ''} onChange={(e) => elegirPack((e.target as HTMLSelectElement).value)}>
              <option value="">Ninguno</option>
              {packs.map((k) => <option key={k.id} value={k.id}>{k.nombre} ({k.cantidad})</option>)}
            </select>
          </label>
        </Seccion>
      )}

      <Seccion titulo="Planta">
        <div class="fila">
          <input type="text" placeholder={`Nombre (ej. ${nombreFinal})`} value={nombre} aria-label="Nombre"
            onInput={(e) => setNombre((e.target as HTMLInputElement).value)} />
        </div>
        <div class="fila">
          <input type="text" placeholder="Variedad (ej. Banana Blaze)" value={variedad} aria-label="Variedad"
            onInput={(e) => setVariedad((e.target as HTMLInputElement).value)} />
        </div>
      </Seccion>

      <Seccion titulo="Tipo">
        <div class="fila"><Segmentos opciones={opciones(TIPOS_PLANTA, nombreTipoPlanta)} valor={tipo} onCambio={setTipo} /></div>
        <div class="fila"><Segmentos opciones={opciones(TIPOS_SEMILLA, nombreTipoSemilla)} valor={semilla} onCambio={setSemilla} /></div>
        {semilla === 'regular' && (
          <div class="fila"><Segmentos opciones={opciones(SEXOS, nombreSexo)} valor={sexo} onCambio={setSexo} /></div>
        )}
      </Seccion>

      <Seccion pie={tipo === 'foto' ? 'Las fotoperiódicas siguen el calendario del patio (hemisferio sur).' : undefined}>
        <div class="fila"><Segmentos opciones={opciones(UBICACIONES, nombreUbicacion)} valor={ubicacion} onCambio={setUbicacion} /></div>
        <label class="fila">
          <span>Germinó</span>
          <input type="date" max={hoyClave} value={Calendario.claveDia(germinacion)}
            onChange={(e) => {
              const v = (e.target as HTMLInputElement).value
              const f = v ? Calendario.leerClave(v) : undefined
              // Si el día no cambió se deja la fecha original (con su hora).
              if (f && !Calendario.mismoDia(f, germinacion)) setGerminacion(f)
            }} />
        </label>
        <div class="fila">
          <span style={{ flex: 1 }}>Maceta</span>
          <Contador valor={litros} min={1} max={200} paso={litros < 10 ? 1 : 5} texto={`${Formato.numero(litros)} L`}
            onCambio={setLitros} />
        </div>
      </Seccion>
    </Hoja>
  )
}
