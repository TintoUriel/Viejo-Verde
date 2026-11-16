import { signal } from '@preact/signals'
import { useEffect } from 'preact/hooks'
import { DB } from '../app/db'
import { Tarjeta } from '../componentes'
import { Icono } from '../iconos'

/** ¿Se abrió desde el ícono de la pantalla de inicio? */
export const instalada = (): boolean =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

const esIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

const oculto = signal(true)

/** Cartel para agregarla a la pantalla de inicio: así iOS no borra los datos y se abre a pantalla completa. */
export function AvisoInstalar() {
  useEffect(() => {
    if (instalada()) return
    DB.leer<boolean>('instalar.oculto').then((v) => { oculto.value = v === true }, () => { oculto.value = false })
  }, [])
  if (instalada() || oculto.value) return null
  const cerrar = () => {
    oculto.value = true
    void DB.guardar('instalar.oculto', true)
  }
  return (
    <Tarjeta fondo="verde">
      <h3><Icono nombre="celular" />Agregala a la pantalla de inicio</h3>
      {esIOS() ? (
        <p class="texto">
          En Safari tocá <strong>Compartir</strong> (el cuadrado con la flecha) → <strong>Agregar a inicio</strong>.
          Así se abre como una app, funciona sin internet y el iPhone no borra tus datos.
        </p>
      ) : (
        <p class="texto">Desde el menú del navegador elegí <strong>Instalar app</strong> o <strong>Agregar a pantalla de inicio</strong>.</p>
      )}
      <button class="boton-texto" style={{ alignSelf: 'flex-start', padding: 0 }} onClick={cerrar}>Ahora no</button>
    </Tarjeta>
  )
}
