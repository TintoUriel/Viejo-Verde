import { cambiar, datos } from '../app/almacen'
import { Fotos } from '../app/fotos'
import { Barra, EtiquetaEtapa, fotoAbierta, Imagen, Vacio } from '../componentes'
import { Calendario } from '../core/calendario'
import { D, planta as buscar } from '../core/datos'
import { lineaDeTiempo } from '../core/estadisticas'
import { Etapas } from '../core/etapas'
import { Formato } from '../core/formato'

/** Las fotos de una planta en orden, con el día de cultivo y la etapa de cada una. */
export function VistaLineaTiempo({ id }: { id: string }) {
  const p = buscar(datos.value, id)
  const quitar = (nombre: string) => () => {
    void Fotos.borrar(nombre)
    cambiar((d) => D.quitarFoto(d, nombre, id))
  }
  return (
    <main class="pantalla">
      <Barra titulo="Línea de tiempo" atras={`planta/${id}`} textoAtras={p?.nombre ?? 'Atrás'} />
      {!p || p.fotos.length === 0 ? (
        <Vacio icono="imagen" titulo="Sin fotos" texto="Sacale fotos desde el detalle de la planta." />
      ) : (
        <div class="linea-tiempo">
          {lineaDeTiempo(p).map((f) => {
            const dia = f.fecha ? Calendario.dias(p.fechaGerminacion, f.fecha) : undefined
            return (
              <div key={f.nombre}>
                <div class="cab">
                  {f.fecha && dia !== undefined ? (
                    <>
                      <strong style={{ fontVariantNumeric: 'tabular-nums' }}>Día {dia}</strong>
                      <span class="nota">{Formato.fechaCorta(f.fecha)}</span>
                      <span style={{ marginLeft: 'auto' }}>
                        <EtiquetaEtapa etapa={Etapas.etapaDeCultivo(dia, Etapas.de(p)).etapa} />
                      </span>
                    </>
                  ) : (
                    <span class="nota">Sin fecha</span>
                  )}
                </div>
                <button onClick={() => { fotoAbierta.value = { nombre: f.nombre, alBorrar: quitar(f.nombre) } }} aria-label="Ver foto">
                  <Imagen nombre={f.nombre} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
