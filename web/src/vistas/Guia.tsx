import { Encabezado, Tarjeta } from '../componentes'
import { Guia } from '../core/guia'
import { Icono, type NombreIcono } from '../iconos'

/** Dudas de siempre, sin internet: riego, sexado, polen, cosecha, secado, curado y reciclar la tierra. */
export function VistaGuia() {
  return (
    <main class="pantalla ancha multicolumna">
      <Encabezado titulo="Guía" />
      <Tarjeta fondo="verde">
        <h3><Icono nombre="copiar" />¿Algo se ve raro?</h3>
        <p class="texto">
          Abrí la planta, tocá <b>Copiar su historia para una IA</b> y pegala en ChatGPT, Gemini o la que uses, con una foto
          de lo que ves: va todo lo que le pasó, para que te diga qué puede ser.
        </p>
      </Tarjeta>
      {Guia.secciones.map((s) => (
        <details class="guia" key={s.titulo}>
          <summary><Icono nombre={s.icono as NombreIcono} color="var(--verde)" />{s.titulo}</summary>
          <ol>{s.pasos.map((paso) => <li key={paso}>{paso}</li>)}</ol>
        </details>
      ))}
    </main>
  )
}
