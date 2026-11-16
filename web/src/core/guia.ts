export interface SeccionGuia {
  titulo: string
  /** Nombre del ícono (ver iconos.tsx). */
  icono: string
  pasos: string[]
}

/** Guía rápida offline. */
export const Guia = {
  secciones: [
    { titulo: 'Riego', icono: 'gota', pasos: [
      'Levantá la maceta: si pesa poco, regá; si pesa, esperá.',
      'Regá despacio hasta que salga un poco de agua por abajo.',
      'Plántula: chorrito alrededor del tallo, nada más.',
      'Con calor, regá temprano o al atardecer, nunca al mediodía.',
      'Fertilizante siempre en el agua de riego, a mitad de la dosis de la etiqueta.',
    ] },
    { titulo: 'Sexado', icono: 'lupa', pasos: [
      'Mirá los nudos (donde la rama sale del tallo) desde la semana 3.',
      'Hembra: pelitos blancos saliendo de una gotita verde.',
      'Macho: bolitas colgando, como racimos de uvas chiquitas, sin pelitos.',
      'Si dudás, esperá 2–3 días y volvé a mirar.',
      'Macho confirmado: alejalo de las hembras ese mismo día.',
    ] },
    { titulo: 'Polen', icono: 'flor', pasos: [
      'El macho va adentro (ventanal o placard con LED), lejos de las hembras.',
      'Cuando las bolitas empiezan a abrirse, cortá 2–3 ramas.',
      'Ponelas sobre un papel liso o adentro de una bolsa y sacudí.',
      'Secá el polen 1–2 días al aire en un lugar seco.',
      'Guardalo en un sobre de papel dentro de un frasco con arroz: heladera semanas, freezer meses.',
      'Para polinizar una rama, pasá el polen con un pincel por los pelitos blancos y tapala con una bolsa 1 día.',
      'Lavate las manos y cambiate la remera antes de tocar las hembras.',
    ] },
    { titulo: 'Cosecha', icono: 'tijera', pasos: [
      'Mirá los tricomas con lupa (30x o más) en los cogollos, no en las hojitas.',
      'Transparentes: falta. Lechosos: punto. Algunos ámbar: efecto más relajante.',
      'Los pelitos tienen que estar 70–80 % marrones.',
      'Las últimas 1–2 semanas, solo agua.',
      'Cortá a la mañana temprano, antes del sol fuerte.',
    ] },
    { titulo: 'Secado', icono: 'viento', pasos: [
      'Colgá las ramas cabeza abajo, en un lugar oscuro y ventilado.',
      'Ideal entre 18 y 22 °C y sin olor a humedad.',
      'Tarda 7–14 días.',
      'Está cuando los tallitos quiebran con un crac en vez de doblarse.',
    ] },
    { titulo: 'Curado', icono: 'frasco', pasos: [
      'Cogollos en frascos de vidrio llenos hasta 3/4.',
      'Semanas 1–2: abrí los frascos 10–15 minutos por día.',
      'Semanas 3–4: abrilos cada 2–3 días.',
      'Si huele a humedad o ves pelusa blanca, sacá ese cogollo ya.',
      'A las 4 semanas ya está; mejora hasta los 2 meses.',
    ] },
    { titulo: 'Reciclar tierra', icono: 'reciclar', pasos: [
      'Sacá la planta y desarmá el pan de raíces; tirá las raíces gruesas al compost.',
      'Mezclá 1 parte de humus de lombriz cada 3 de tierra usada.',
      'Humedecela y dejala reposar 1–2 semanas antes de usarla.',
      'Mayo a agosto es buen momento para hacerlo y armar compost.',
    ] },
  ] as SeccionGuia[],

  consejoSemillas: 'Semillas: en frasco cerrado, a oscuras, en la heladera (no en el freezer).',
  consejoPolen: 'Polen: sobre de papel dentro de un frasco con arroz. Heladera: semanas. Freezer: meses.',
}
