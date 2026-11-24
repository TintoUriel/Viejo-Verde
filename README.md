# Viejo Verde 🌱

App para llevar el autocultivo (REPROCANN, patio en CABA): en qué etapa está cada planta, qué toca hacer
hoy (con ml de agua y de fertilizante), clima, semillas, polen, cosechas, el sol del patio y una guía de dudas.

**Es una app web (PWA):** se abre en <https://tintouriel.github.io/Viejo-Verde/> y se instala en el iPhone
desde Safari, sin firmas ni renovaciones. Sin backend: todo queda en el teléfono (y, si la activás, una
copia de cada registro en tu planilla de Google: ver [`apps-script/README.md`](apps-script/README.md)).

## Instalar en el iPhone

1. Abrí <https://tintouriel.github.io/Viejo-Verde/> en **Safari**.
2. **Compartir** (el cuadrado con la flecha) → **Agregar a inicio**.
3. Abrila siempre desde ese ícono: así funciona sin internet, a pantalla completa, y el iPhone no borra
   los datos (Safari puede borrar los de las páginas que no se visitan seguido).

Cada push a `main` publica la versión nueva sola. En el teléfono aparece el cartel
"Hay una versión nueva" → **Actualizar**.

> Si borrás el ícono de la pantalla de inicio, se borran también los datos. Exportá un backup antes.

### Pasar los datos desde la app de iPhone (Swift)

1. En la app vieja: **Ajustes → Backup → Incluir fotos → Exportar backup** → guardalo en Archivos.
2. En la web: **Ajustes → Backup → Importar backup** → elegí ese archivo. Es el mismo formato.
3. La **URL y el token** de la planilla no viajan en el backup: se cargan solos al entrar con la contraseña.
4. Si usás la planilla: **Ajustes → Planilla de Google → Sincronizar todo** (no duplica nada).

## Qué cambió respecto de la app de iPhone

- **Sin notificaciones.** La pestaña **Hoy** muestra lo que toca (el número rojo en la pestaña son las
  tareas pendientes). Sexado, Top Bloom, tricomas, tallitos y frascos aparecen ahí como tareas.
- **Contraseña de entrada.** La primera vez en cada teléfono la app pide la contraseña: con ella descifra la URL y el token de la planilla (que van cifrados en `web/src/app/config.ts`) y se conecta sola. No hay que cargar nada a mano.
- **La planilla sube y baja.** Cada cambio se anota en Registro y además se guarda una copia completa en
  la planilla; al abrir la app, si esa copia es más nueva, se baja sola. Si la planilla todavía no tiene
  copia, la app rearma tus datos leyendo Registro y Plantas (por ejemplo, lo que mandó la app de iPhone).
  Las fotos no viajan: quedan en cada teléfono. Hay que actualizar el script una vez (ver
  [`apps-script/README.md`](apps-script/README.md)).
- La URL y el token de la planilla quedan en el almacenamiento del navegador del teléfono (no en el llavero).
  Nunca van en los backups.
- **Sin asistente con Claude** (no hace falta pagar una API). La pestaña **Guía** tiene las dudas de siempre,
  sin internet; para un problema puntual, en la ficha de la planta está **Copiar su historia para una IA**.
- "Cargar datos de ejemplo" está siempre en Ajustes (antes solo en debug).
- **Tu patio en Hoy**: arriba de todo está el plano con cada planta donde la ubicaste, con el anillo de su
  etapa y un número rojo si tiene algo para hoy. Tocás una y se abre su ficha (ahí no se arrastra nada, para
  no moverlas sin querer; se acomodan en **Plantas → Patio** o con **Editar**).
- **Próximos 7 días** (en Hoy): qué va a tocar cada día (riegos, fertilizante, neem…) y qué etapas empiezan,
  suponiendo que cada día hacés lo que toca.
- **pH del drenaje** (en la ficha de la planta): el pH del agua que sale por abajo, anotado en el riego en el que
  se midió. Va al historial, a la historia que se copia para una IA y a la planilla (fila "pH del drenaje").
- **Copiar su historia para una IA** (en la ficha de la planta): copia todo lo que le pasó a la planta (datos,
  sol, clima, pH y cada registro con su día y etapa), listo para pegar en ChatGPT, Claude o Gemini.
- **Hoja Configuración** en la planilla: el patio, dónde está cada planta y las dosis de las etiquetas van ahí
  (una fila por dato, se reescribe sola), separado de Registro, que queda solo para el historial.
- **Plano del patio** (nuevo, en **Plantas → Patio**): cargás las medidas, la altura de cada pared (y si hay un
  edificio más atrás), hacia dónde da (a mano o con la brújula del teléfono) y lo que hace sombra adentro. La app
  calcula las horas de sol directo de cada lugar (por temporada, por día o a una hora), marca los mejores
  lugares y te deja ubicar cada maceta arrastrándola. La app de iPhone no lo usa
  (lo ignora si viene en un backup).

## Estructura

```
web/                   La app web (Vite + Preact + TypeScript).
  src/core/            Lógica pura portada de ViejoVerdeCore, testeada: modelo, etapas, tareas, dosis,
                       clima, planificador, agenda de 7 días, sol del patio, estadísticas, backup, historia
                       para una IA, guía, sync/ (eventos para la planilla, cola local, formato del POST).
  src/app/             Almacén (IndexedDB), fotos, servicios (clima, planilla), navegación.
  src/vistas/          Pantallas: Hoy, Plantas, Detalle, Semillas, Guía, Ajustes, Planificar, Cosechas, Patio.
  test/                Los mismos casos que Tests/ViejoVerdeCoreTests (Vitest).
apps-script/           Web App de Google Apps Script que escribe en la planilla (Code.gs + instrucciones).
.github/workflows/     web.yml publica en GitHub Pages; ipa.yml compila la app de iPhone vieja.
Sources/, Tests/       App de iPhone en SwiftUI (anterior). Se borra cuando la web esté probada.
```

- Datos: IndexedDB `viejo-verde` (clave `datos`, JSON igual al de los backups). Fotos: IndexedDB
  `viejo-verde-fotos` (JPEG achicados a 2048 px).
- Cola de la planilla: clave `bandeja`. Secretos (URL y token de la planilla): clave `secretos`.
- Fechas: todo se cuenta en días de Buenos Aires (UTC−3), como en la app de Swift.

## Desarrollo

Necesitás Node 24.

```powershell
cd web
npm install
npm run dev        # http://localhost:5173/Viejo-Verde/ (con recarga al guardar)
npm test           # tests de la lógica
npm run build      # lo mismo que corre GitHub Actions antes de publicar
```

Para probarla en el iPhone desde la PC, `npm run dev -- --host` y abrí la IP de la PC en Safari
(en modo desarrollo no hay modo sin conexión ni instalación; para eso, la versión publicada).

## Qué probar

Arrancá por **Ajustes → Probar la app → Cargar datos de ejemplo** para tener plantas en todas las etapas
(no toca tus datos ni manda nada a la planilla; "Salir" arriba vuelve a lo tuyo).

1. **Hoy**: fecha, consejo de temporada, clima de CABA (↻ para actualizar), resumen con cupo X/9 (en rojo
   si te pasás) y tareas con botones. El macho en el patio aparece primero, en rojo. "Hoy no" la esconde
   hasta mañana. **Regué las N** con 2 o más riegos pendientes. La lluvia no cuenta como riego (el patio está techado con nylon).
2. **Plantas y detalle**: lista por estado con barra de etapas; ⊕ para agregar (desde un pack descuenta 1);
   detalle con etapa, día/semana, dosis de hoy, Regué / Fertilicé / Neem / Nota o problema / Foto, sexo
   (regulares), Polinicé una rama, Cosechar → A frascos → Terminar, semillas propias, historial editable
   (tocá un registro), descartar y borrar. Con 2+ fotos: **Ver línea de tiempo**.
3. **Semillas**: packs con −/+, **Germinar**, tocar para editar o borrar; polen (Usado / borrar), tips.
4. **Planificar** (Hoy, abajo, o Plantas): fechas estimadas de una tanda y gráfico de plantas en flor por
   semana contra el cupo de 9, con cuántas podrías germinar sin pasarte.
5. **Cosechas** (Plantas): totales, gramos por cosecha, por variedad y por temporada.
6. **Guía**: riego, sexado, polen, cosecha, secado, curado y reciclar la tierra, sin internet. En la ficha de
   una planta, **Copiar su historia para una IA** copia todo lo que le pasó para pegarlo en ChatGPT o Gemini.
7. **Backup**: Exportar (con o sin fotos: abre el menú de compartir → Guardar en Archivos), Importar.
8. **Planilla de Google** (Ajustes): configurala con [`apps-script/README.md`](apps-script/README.md)
   y tocá **Probar conexión**. En modo avión registrá algo: "Eventos pendientes" sube y baja solo al
   volver la señal (o al reabrir la app). **Bajar de la planilla ahora** trae la copia completa (o la
   rearma desde Registro y Plantas la primera vez).

## Notas

- Dosis de etiqueta por defecto: 2 ml/L para Top Veg y Top Bloom (la app usa la mitad). Ajustala en
  Ajustes → Fertilizantes con lo que dice tu botella.

---

## App de iPhone en SwiftUI (anterior)

Queda en el repo hasta pasar los datos a la web. Necesita firmarse con Sideloadly y, con Apple ID gratis,
la firma vence cada 7 días.

### Estructura

```
Sources/
  ViejoVerdeCore/      Lógica pura (solo Foundation), testeada: modelo, etapas, tareas, dosis,
                       notificaciones, backup, pedido/respuesta de la API de Claude, guía,
                       Sincronizacion/ (eventos para la planilla, cola local, formato del POST).
  ViejoVerde/          App SwiftUI: Almacen (JSON en Documents), vistas, servicios
                       (Keychain, fotos, notificaciones, cliente de Claude, Sincronizador).
Tests/ViejoVerdeCoreTests/
apps-script/           Web App de Google Apps Script que escribe en la planilla (Code.gs + instrucciones).
```

- Cola de la planilla: `Documents/outbox.json`. URL y token del Web App: en el llavero.

- Datos: `Documents/datos.json` (escritura atómica). Fotos: `Documents/Fotos/*.jpg`.
- API key de Anthropic: en el llavero (Keychain), nunca en el código ni en los backups.
- Modo ejemplo (solo en debug, Ajustes → Debug): usa `ejemplo.json` aparte; tus datos no se tocan.

### Tests de la lógica

En Windows (Swift para Windows + Build Tools de Visual Studio):

```powershell
.\probar-core.cmd
```

En WSL / Linux / Mac:

```bash
SOLO_CORE=1 swift test
```

### Instalar en el iPhone

Sin Mac no hay simulador. Hay dos caminos.

#### A. GitHub Actions + Sideloadly (sin WSL)

1. Cada `git push` a `main` dispara `.github/workflows/ipa.yml`: corre los tests, genera el proyecto de
   Xcode con XcodeGen (`project.yml`) en una Mac de GitHub y compila un `.ipa` sin firmar.
2. En GitHub → pestaña **Actions** → la última corrida de "Compilar IPA" → abajo, **Artifacts** →
   descargá `ViejoVerde-ipa` (es un .zip con `ViejoVerde.ipa` adentro). Si falló, ahí está `xcodebuild-log`.
3. Instalá [Sideloadly](https://sideloadly.io) en Windows (usa el driver de la app "Dispositivos Apple").
4. Enchufá el iPhone, desbloquealo, arrastrá `ViejoVerde.ipa` a Sideloadly, poné tu Apple ID y **Start**.
5. La primera vez, en el iPhone: Ajustes → General → VPN y gestión de dispositivos → tu Apple ID → Confiar.
   Con iOS 16+ también hace falta el **Modo de desarrollador** (Ajustes → Privacidad y seguridad).

Con Apple ID gratis la firma dura 7 días: volvé a pasar el .ipa por Sideloadly para renovarla.

#### B. xtool desde WSL (requiere virtualización activada en el BIOS)

Ver `INSTALAR-EN-IPHONE.md` en el repo RedSegura:

```bash
cd "/mnt/c/Users/<usuario>/Documents/GitHub/Viejo Verde"
xtool dev
```
