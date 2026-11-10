# Viejo Verde → Google Sheets

La app manda cada cosa que registrás a tu planilla, por POST a un **Web App de Apps Script** vinculado a
la planilla. El script escribe en dos hojas nuevas y no toca **Compras** ni **Ahorro**:

- **Registro**: una fila por evento (riego, fertilizante, cambio de etapa, cosecha…). Solo se agregan filas:
  nunca se editan ni se borran. Si corregís o borrás algo en la app, llega una fila "corrección" o
  "borrado" que dice qué ID corrige.
- **Plantas**: una fila por planta con su estado actual (se actualiza sola).

Planilla: <https://docs.google.com/spreadsheets/d/1kLFYUvD6-PsNVRxZ8u3o3uBfBvmuP5z2Il2V0iJkwhI/edit>

## Paso a paso (una sola vez, desde la PC)

### 1. Pegar el script

1. Abrí la planilla → menú **Extensiones → Apps Script**.
2. Arriba a la izquierda, cambiale el nombre al proyecto: **Viejo Verde**.
3. En el archivo `Código.gs`, borrá todo lo que haya y pegá el contenido de [`Code.gs`](Code.gs).
4. Guardá con **Ctrl + S**.

### 2. Crear las hojas: `setup()`

1. Arriba, en el desplegable de funciones (al lado de "Depurar"), elegí **`setup`** → **Ejecutar**.
2. La primera vez pide permisos: **Revisar permisos** → elegí tu cuenta → "Google no verificó esta app" →
   **Configuración avanzada** → **Ir a Viejo Verde (no seguro)** → **Permitir**. Es tu propio script,
   y solo pide acceso a esta planilla.
3. Volvé a la planilla: al final aparecen las pestañas **Registro** y **Plantas** con sus encabezados.
   Compras y Ahorro siguen igual.

### 3. Crear el token: `generarToken()`

1. En el desplegable elegí **`generarToken`** → **Ejecutar**.
2. Abajo, en el **Registro de ejecución**, aparece un token largo (64 letras y números). Copialo: lo vas
   a pegar en el iPhone. Para pasarlo al teléfono, pegalo en una nota de Apple Notes en la PC
   (iCloud.com) o en un mensaje para vos mismo, y borralo de ahí después.
3. Queda guardado en **⚙ Configuración del proyecto → Propiedades del script** con el nombre `TOKEN`.

> Si preferís hacerlo a mano: ⚙ Configuración del proyecto → Propiedades del script →
> **Agregar propiedad del script**: Propiedad `TOKEN`, Valor: un texto largo al azar (32 caracteres o más).

### 4. Probar el script: `testDoPost()`

1. Elegí **`testDoPost`** → **Ejecutar**. En el registro tiene que aparecer
   `{"ok":true,"agregados":2,"repetidos":0,"invalidos":0,"plantas":1}`.
2. Corrélo **otra vez**: ahora tiene que decir `"agregados":0,"repetidos":2`. Eso prueba que no duplica.
3. En la planilla vas a ver dos filas `prueba-…` en Registro y una "Planta de prueba" en Plantas.
4. Para limpiarlas: elegí **`borrarPruebas`** → **Ejecutar**.

### 5. Publicar el Web App

1. Arriba a la derecha: **Implementar → Nueva implementación**.
2. En "Seleccionar tipo" (el engranaje): **Aplicación web**.
3. Descripción: `Viejo Verde v1`.
   - **Ejecutar como: Yo** (tu mail).
   - **Quién tiene acceso: Cualquier persona**. El token es lo que protege el endpoint: sin él no se escribe nada.
4. **Implementar** → copiá la **URL de la aplicación web** (empieza con `https://script.google.com/macros/s/`
   y termina en **`/exec`**). No uses la que termina en `/dev`.
5. Chequeo rápido: abrí esa URL en el navegador. Tiene que mostrar
   `{"ok":false,"error":"Este endpoint solo acepta POST desde Viejo Verde."}`. Si ves eso, está bien publicada.

### 6. Cargarlo en el iPhone

1. En la app: **Ajustes → Planilla de Google**.
2. Pegá la **URL** y el **token** → **Guardar** (queda guardado en el llavero del iPhone y la sincronización
   se activa).
3. **Probar conexión** → tiene que decir "Conexión OK".
4. **Sincronizar todo** (la primera vez): manda todo tu historial y la fila de cada planta. Si lo repetís,
   no duplica nada.

Desde ahí, cada riego, fertilizante, nota, etc. se anota solo. Si no hay señal (el patio), queda en la cola
del iPhone ("Eventos pendientes") y se manda cuando vuelve la conexión: al registrar otra cosa, al volver
a abrir la app o en segundo plano.

## Si cambiás el código del script

**Implementar → Gestionar implementaciones** → lápiz ✏️ → Versión: **Nueva versión** → **Implementar**.
Así la URL sigue siendo la misma. (Con "Nueva implementación" sale una URL nueva y hay que pegarla en la app.)

## Si algo falla

| La app dice | Qué hacer |
|---|---|
| Token inválido | El token de la app no es el de Propiedades del script. Volvé a pegarlo (Ajustes → Borrar URL y token → Guardar). |
| Falta configurar TOKEN | No corriste `generarToken()` (o no agregaste la propiedad `TOKEN`). |
| La URL no devolvió JSON | El acceso no es "Cualquier persona", o pegaste la URL `/dev`, o falta implementar una versión nueva. |
| Sin conexión | Normal en el patio: queda en la cola y se reintenta solo (30 s, 1 min, 2 min… hasta cada 15 min). |

Si el token se filtra: corré `generarToken()` otra vez y pegá el nuevo en la app. El viejo deja de servir en el acto.

Probar desde la PC sin la app (cambiá `TOKEN` y `URL`):

```bash
curl -L -H "Content-Type: application/json" -d '{"token":"TOKEN","accion":"probar"}' "URL"
```

Tiene que responder `{"ok":true,"prueba":true}` (`-L` sigue el redirect 302 que hace Google).

## Pasarle la planilla a Claude

Para chatear con todo el contexto: en la planilla, **Archivo → Descargar → Valores separados por comas (.csv)**
estando en la hoja Registro (y otra vez en Plantas), y adjuntá los dos archivos en el chat. O conectá
Google Drive en claude.ai y pedile que lea la planilla.

## Qué viaja y qué no

- Sí: tipo de evento, fecha, planta, variedad, etapa y día de cultivo, cantidades (ml, g, mm, semillas),
  producto, dosis, tus notas y la versión de la app.
- No: fotos (solo "saqué una foto"), la API key de Anthropic, el chat con el asistente, ajustes, ni nada
  del modo ejemplo.
- Importar un backup o "Borrar todos los datos" no manda nada (para no llenar el Registro de borrados).
  Después de importar, tocá **Sincronizar todo**.

## Formato del pedido (para tocar el código)

```json
{
  "token": "…",
  "eventos": [{
    "id": "UUID del registro, o etapa-<planta>-<etapa>, foto-<archivo>, semillas-<pack>, polen-<id>",
    "fecha": "2026-11-10T14:30:00Z", "tipo": "riego", "plantaID": "…", "planta": "Banana",
    "variedad": "Banana Blaze", "autoFoto": "Auto", "etapa": "Crecimiento", "dia": 23,
    "cantidad": 1500, "unidad": "ml", "producto": "Top Veg", "dosis": 1, "nota": "…", "app": "1.0 (1)"
  }],
  "plantas": [{
    "id": "…", "nombre": "…", "variedad": "…", "autoFoto": "Auto", "semilla": "Feminizada",
    "sexo": "Hembra", "ubicacion": "Patio", "litros": 20, "germinacion": "2026-10-18",
    "etapa": "Crecimiento", "dia": 23, "ultimoRiego": "…", "ultimoFertilizante": "…", "ultimoNeem": "…",
    "estado": "activa", "gramosHumedos": null, "gramosSecos": null, "notas": "…", "actualizado": "…"
  }]
}
```

Con `"accion": "probar"` solo valida el token. Los nombres salen de
`Sources/ViejoVerdeCore/Sincronizacion/ModelosSync.swift`: si cambiás uno, cambialo en los dos lados.
