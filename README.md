# Viejo Verde 🌱

App de iPhone para llevar el autocultivo (REPROCANN, patio en CABA): en qué etapa está cada planta,
qué toca hacer hoy (con ml de agua y de fertilizante), recordatorios, semillas, polen y un asistente con Claude.

SwiftUI · iOS 17+ · solo iPhone · sin backend: todo queda en el teléfono.

## Estructura

```
Sources/
  ViejoVerdeCore/      Lógica pura (solo Foundation), testeada: modelo, etapas, tareas, dosis,
                       notificaciones, backup, pedido/respuesta de la API de Claude, guía.
  ViejoVerde/          App SwiftUI: Almacen (JSON en Documents), vistas, servicios
                       (Keychain, fotos, notificaciones, cliente de Claude).
Tests/ViejoVerdeCoreTests/
```

- Datos: `Documents/datos.json` (escritura atómica). Fotos: `Documents/Fotos/*.jpg`.
- API key de Anthropic: en el llavero (Keychain), nunca en el código ni en los backups.
- Modo ejemplo (solo en debug, Ajustes → Debug): usa `ejemplo.json` aparte; tus datos no se tocan.

## Tests de la lógica

En Windows (Swift para Windows + Build Tools de Visual Studio):

```powershell
.\probar-core.cmd
```

En WSL / Linux / Mac:

```bash
SOLO_CORE=1 swift test
```

## Instalar en el iPhone

Sin Mac no hay simulador. Hay dos caminos.

### A. GitHub Actions + Sideloadly (sin WSL)

1. Cada `git push` a `main` dispara `.github/workflows/ipa.yml`: corre los tests, genera el proyecto de
   Xcode con XcodeGen (`project.yml`) en una Mac de GitHub y compila un `.ipa` sin firmar.
2. En GitHub → pestaña **Actions** → la última corrida de "Compilar IPA" → abajo, **Artifacts** →
   descargá `ViejoVerde-ipa` (es un .zip con `ViejoVerde.ipa` adentro). Si falló, ahí está `xcodebuild-log`.
3. Instalá [Sideloadly](https://sideloadly.io) en Windows (usa el driver de la app "Dispositivos Apple").
4. Enchufá el iPhone, desbloquealo, arrastrá `ViejoVerde.ipa` a Sideloadly, poné tu Apple ID y **Start**.
5. La primera vez, en el iPhone: Ajustes → General → VPN y gestión de dispositivos → tu Apple ID → Confiar.
   Con iOS 16+ también hace falta el **Modo de desarrollador** (Ajustes → Privacidad y seguridad).

Con Apple ID gratis la firma dura 7 días: volvé a pasar el .ipa por Sideloadly para renovarla.

### B. xtool desde WSL (requiere virtualización activada en el BIOS)

Ver `INSTALAR-EN-IPHONE.md` en el repo RedSegura:

```bash
cd "/mnt/c/Users/<usuario>/Documents/GitHub/Viejo Verde"
xtool dev
```

## Qué probar en el iPhone

Arrancá por **Ajustes → Debug → Cargar ejemplo** para tener plantas en todas las etapas.

1. **Plantas y detalle**: lista por estado con barra de etapas; + para agregar (desde un pack descuenta 1);
   detalle con etapa, día/semana, barra con el marcador de hoy, dosis de hoy, consejos, Regué / Fertilicé /
   Neem / Nota o problema / Foto, sexo (regulares), Polinicé una rama, Cosechar → A frascos → Terminar,
   semillas propias, historial editable (tocá un registro), descartar y borrar.
2. **Hoy**: fecha, consejo de temporada, resumen con cupo X/9 (en rojo si te pasás) y tareas con botones.
   El macho en el patio aparece primero, en rojo. "Hoy no" la esconde hasta mañana.
3. **Semillas**: packs con +/−, deslizar a la derecha para germinar, polen (deslizar para marcar usado), tips.
4. **Notificaciones**: Ajustes → Probar una notificación (llega en 5 s). Resumen diario a la hora elegida
   (9:00 por defecto) y avisos de sexado, Top Bloom, tricomas, tallitos y frascos.
5. **Asistente**: cargá la API key en Ajustes, probá los chips y mandale una foto de una hoja.
   Abajo (o con el botón Guía) está la guía rápida offline.
6. **Backup**: Exportar (con o sin fotos) a Archivos, Borrar todo, Importar ese archivo.

## Notas

- Dosis de etiqueta por defecto: 2 ml/L para Top Veg y Top Bloom (la app usa la mitad). Ajustala en
  Ajustes → Fertilizantes con lo que dice tu botella.
- El asistente usa `claude-sonnet-5-5` (Messages API, versión `2026-10-21`) con fallback automático
  si un clasificador rechaza el pedido. Cada mensaje se cobra en tu cuenta de Anthropic.
