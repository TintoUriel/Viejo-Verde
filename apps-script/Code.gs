/**
 * Viejo Verde → Google Sheets.
 *
 * Web App que recibe lotes de eventos desde la app y los escribe en tres hojas:
 *   - "Registro": log de solo agregar (una fila por evento, nunca se edita ni se borra).
 *   - "Plantas":  estado actual, una fila por planta (upsert por Planta ID).
 *   - "Configuración": lo que no es historial (el plano del patio, dónde va cada planta, las dosis de las
 *                  etiquetas). Se reescribe entera cada vez que la app la manda.
 * Además guarda una copia completa de los datos de la app en la hoja oculta "Estado", para que la
 * app la baje al abrirse (sincronización en los dos sentidos). Las hojas "Compras" y "Ahorro" no se tocan.
 *
 * Pedido (POST, JSON):
 *   {
 *     "token": "…",                       // tiene que coincidir con la propiedad TOKEN del script
 *     "accion": "probar",                 // opcional: solo valida el token, no escribe nada
 *     "eventos": [ { "id", "fecha", "tipo", "plantaID", "planta", "variedad", "autoFoto",
 *                    "etapa", "dia", "cantidad", "unidad", "producto", "dosis", "nota", "app" } ],
 *     "plantas": [ { "id", "nombre", "variedad", "autoFoto", "semilla", "sexo", "ubicacion",
 *                    "litros", "germinacion", "etapa", "dia", "ultimoRiego", "ultimoFertilizante",
 *                    "ultimoNeem", "estado", "gramosHumedos", "gramosSecos", "notas", "actualizado" } ],
 *     "configuracion": [ { "seccion", "dato", "valor", "clave" } ]   // opcional: la hoja entera
 *   }
 * Fechas: ISO 8601 (UTC). Se escriben en hora de Buenos Aires.
 *
 * Copia completa:
 *   {"token", "accion": "guardarEstado", "estado": "<JSON de los datos>", "actualizado": "<ISO>"}
 *     → {"ok": true, "guardado": true}  (o guardado: false si la planilla ya tenía una más nueva)
 *   {"token", "accion": "leerEstado"}
 *     → {"ok": true, "estado": "<JSON>" | null, "actualizado": "<ISO>" | null,
 *        "filasRegistro": [...], "filasPlantas": [...], "filasConfiguracion": [...]}
 *        (las filas, solo si todavía no hay copia)
 *
 * Respuesta: {"ok": true, "agregados": n, "repetidos": n, "invalidos": n, "plantas": n, "configuracion": n}
 *         ("configuracion" solo si el pedido la traía)
 *         o  {"ok": false, "error": "…"}
 */

const ID_PLANILLA = '1kLFYUvD6-PsNVRxZ8u3o3uBfBvmuP5z2Il2V0iJkwhI';
const HOJA_REGISTRO = 'Registro';
const HOJA_PLANTAS = 'Plantas';
const HOJA_ESTADO = 'Estado';
const HOJA_CONFIG = 'Configuración';
/** Una celda admite 50.000 caracteres: la copia se parte en pedazos más chicos. */
const LARGO_PEDAZO = 40000;
const ZONA = 'America/Argentina/Buenos_Aires';
const MAX_EVENTOS_POR_LOTE = 500;

const COLUMNAS_REGISTRO = [
  'ID evento', 'Fecha y hora', 'Tipo', 'Planta ID', 'Planta', 'Variedad', 'Auto/Foto', 'Etapa',
  'Día de cultivo', 'Cantidad', 'Unidad', 'Producto', 'Dosis (ml/L)', 'Nota', 'Versión app',
];

/** Claves del JSON de cada columna (las mismas que manda la app), para devolver las filas. */
const CLAVES_REGISTRO = [
  'id', 'fecha', 'tipo', 'plantaID', 'planta', 'variedad', 'autoFoto', 'etapa', 'dia', 'cantidad', 'unidad',
  'producto', 'dosis', 'nota', 'app',
];
const CLAVES_PLANTAS = [
  'id', 'nombre', 'variedad', 'autoFoto', 'semilla', 'sexo', 'ubicacion', 'litros', 'germinacion', 'etapa', 'dia',
  'ultimoRiego', 'ultimoFertilizante', 'ultimoNeem', 'estado', 'gramosHumedos', 'gramosSecos', 'notas', 'actualizado',
];

const COLUMNAS_CONFIG = ['Sección', 'Dato', 'Valor', 'Clave'];
const CLAVES_CONFIG = ['seccion', 'dato', 'valor', 'clave'];

const COLUMNAS_PLANTAS = [
  'Planta ID', 'Nombre', 'Variedad', 'Auto/Foto', 'Feminizada/Regular', 'Sexo', 'Ubicación',
  'Maceta (L)', 'Fecha germinación', 'Etapa actual', 'Día', 'Último riego', 'Último fertilizante',
  'Último neem', 'Estado', 'Gramos húmedos', 'Gramos secos', 'Notas', 'Actualizado',
];

// ───────────────────────────── Configuración ─────────────────────────────

/** Crea las hojas "Registro", "Plantas" y "Configuración" si no existen. No toca ninguna otra hoja. */
function setup() {
  const ss = planilla_();
  crearHoja_(ss, HOJA_REGISTRO, COLUMNAS_REGISTRO);
  crearHoja_(ss, HOJA_PLANTAS, COLUMNAS_PLANTAS);
  crearHoja_(ss, HOJA_CONFIG, COLUMNAS_CONFIG);
  Logger.log('Listo: hojas "%s", "%s" y "%s" preparadas.', HOJA_REGISTRO, HOJA_PLANTAS, HOJA_CONFIG);
}

/**
 * Genera un token al azar, lo guarda en Script Properties (TOKEN) y lo muestra en el registro
 * de ejecución para copiarlo en la app. Correrlo de nuevo cambia el token (la app deja de poder
 * enviar hasta que pegues el nuevo).
 */
function generarToken() {
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('TOKEN', token);
  Logger.log('Token nuevo (copialo en la app, en Ajustes → Google Sheets):\n%s', token);
}

function crearHoja_(ss, nombre, columnas) {
  let hoja = ss.getSheetByName(nombre);
  if (!hoja) hoja = ss.insertSheet(nombre, ss.getNumSheets());
  if (hoja.getLastRow() === 0) {
    hoja.getRange(1, 1, 1, columnas.length).setValues([columnas]).setFontWeight('bold');
    hoja.setFrozenRows(1);
    // La columna A son IDs: como texto, para que Sheets no los interprete.
    hoja.getRange('A:A').setNumberFormat('@');
  }
  return hoja;
}

function planilla_() {
  return SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(ID_PLANILLA);
}

// ───────────────────────────── Web App ─────────────────────────────

function doGet() {
  return responder_({ ok: false, error: 'Este endpoint solo acepta POST desde Viejo Verde.' });
}

function doPost(e) {
  try {
    const pedido = leerPedido_(e);
    validarToken_(pedido.token);
    if (pedido.accion === 'probar') {
      return responder_({ ok: true, prueba: true, estado: true, configuracion: true });
    }
    if (pedido.accion === 'leerEstado') {
      return responder_(leerEstado_(planilla_()));
    }
    if (pedido.accion === 'guardarEstado') {
      return conLock_(function () { return guardarEstado_(planilla_(), pedido.estado, pedido.actualizado); });
    }
    const eventos = Array.isArray(pedido.eventos) ? pedido.eventos : [];
    const plantas = Array.isArray(pedido.plantas) ? pedido.plantas : [];
    if (eventos.length > MAX_EVENTOS_POR_LOTE) {
      return responder_({ ok: false, error: 'Lote demasiado grande (máximo ' + MAX_EVENTOS_POR_LOTE + ').' });
    }

    return conLock_(function () {
      const ss = planilla_();
      const r = agregarEventos_(crearHoja_(ss, HOJA_REGISTRO, COLUMNAS_REGISTRO), eventos);
      const n = actualizarPlantas_(crearHoja_(ss, HOJA_PLANTAS, COLUMNAS_PLANTAS), plantas);
      const salida = { ok: true, agregados: r.agregados, repetidos: r.repetidos, invalidos: r.invalidos, plantas: n };
      if (Array.isArray(pedido.configuracion)) {
        salida.configuracion = escribirConfiguracion_(crearHoja_(ss, HOJA_CONFIG, COLUMNAS_CONFIG), pedido.configuracion);
      }
      SpreadsheetApp.flush();
      return salida;
    });
  } catch (err) {
    return responder_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

/** Corre la escritura con el lock del script (dos envíos a la vez no se pisan). */
function conLock_(trabajo) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return responder_({ ok: false, error: 'La planilla está ocupada, reintentá.' });
  }
  try {
    return responder_(trabajo());
  } finally {
    lock.releaseLock();
  }
}

function leerPedido_(e) {
  if (!e || !e.postData || !e.postData.contents) throw new Error('Pedido vacío.');
  try {
    return JSON.parse(e.postData.contents);
  } catch (err) {
    throw new Error('El cuerpo no es JSON válido.');
  }
}

function validarToken_(token) {
  const esperado = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!esperado) throw new Error('Falta configurar TOKEN en las propiedades del script.');
  if (typeof token !== 'string' || !iguales_(token, esperado)) throw new Error('Token inválido.');
}

/** Comparación sin cortar en el primer carácter distinto. */
function iguales_(a, b) {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

function responder_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ───────────────────────────── Registro ─────────────────────────────

/** Agrega solo los eventos cuyo ID no está ya en la columna A (idempotente). */
function agregarEventos_(hoja, eventos) {
  const vistos = new Set(idsDeColumnaA_(hoja));
  const filas = [];
  let repetidos = 0;
  let invalidos = 0;
  eventos.forEach(function (ev) {
    if (!ev || typeof ev.id !== 'string' || ev.id === '' || !ev.tipo) { invalidos++; return; }
    if (vistos.has(ev.id)) { repetidos++; return; }
    vistos.add(ev.id);
    filas.push([
      ev.id,
      fechaHora_(ev.fecha),
      texto_(ev.tipo),
      texto_(ev.plantaID),
      texto_(ev.planta),
      texto_(ev.variedad),
      texto_(ev.autoFoto),
      texto_(ev.etapa),
      numero_(ev.dia),
      numero_(ev.cantidad),
      texto_(ev.unidad),
      texto_(ev.producto),
      numero_(ev.dosis),
      texto_(ev.nota),
      texto_(ev.app),
    ]);
  });
  if (filas.length > 0) {
    hoja.getRange(hoja.getLastRow() + 1, 1, filas.length, COLUMNAS_REGISTRO.length).setValues(filas);
  }
  return { agregados: filas.length, repetidos: repetidos, invalidos: invalidos };
}

function idsDeColumnaA_(hoja) {
  const ultima = hoja.getLastRow();
  if (ultima < 2) return [];
  return hoja.getRange(2, 1, ultima - 1, 1).getValues().map(function (f) { return String(f[0]); });
}

// ───────────────────────────── Plantas ─────────────────────────────

/** Upsert por Planta ID. Si el mismo lote trae la planta dos veces, gana la última. */
function actualizarPlantas_(hoja, plantas) {
  if (plantas.length === 0) return 0;
  const ids = idsDeColumnaA_(hoja);
  const filaDe = {};
  ids.forEach(function (id, i) { filaDe[id] = i + 2; });

  let siguiente = hoja.getLastRow() + 1;
  let n = 0;
  plantas.forEach(function (p) {
    if (!p || typeof p.id !== 'string' || p.id === '') return;
    const fila = [
      p.id,
      texto_(p.nombre),
      texto_(p.variedad),
      texto_(p.autoFoto),
      texto_(p.semilla),
      texto_(p.sexo),
      texto_(p.ubicacion),
      numero_(p.litros),
      texto_(p.germinacion),
      texto_(p.etapa),
      numero_(p.dia),
      fechaHora_(p.ultimoRiego),
      fechaHora_(p.ultimoFertilizante),
      fechaHora_(p.ultimoNeem),
      texto_(p.estado),
      numero_(p.gramosHumedos),
      numero_(p.gramosSecos),
      texto_(p.notas),
      fechaHora_(p.actualizado),
    ];
    let destino = filaDe[p.id];
    if (!destino) {
      destino = siguiente++;
      filaDe[p.id] = destino;
    }
    hoja.getRange(destino, 1, 1, COLUMNAS_PLANTAS.length).setValues([fila]);
    n++;
  });
  return n;
}

// ───────────────────────────── Configuración ─────────────────────────────

/** Reemplaza todas las filas (menos el encabezado) por las que mandó la app. */
function escribirConfiguracion_(hoja, filas) {
  const valores = [];
  filas.forEach(function (f) {
    if (!f || typeof f.clave !== 'string' || f.clave === '') return;
    const valor = typeof f.valor === 'number' && isFinite(f.valor) ? f.valor : texto_(f.valor);
    valores.push([texto_(f.seccion), texto_(f.dato), valor, texto_(f.clave)]);
  });
  const ultima = hoja.getLastRow();
  if (ultima > 1) hoja.getRange(2, 1, ultima - 1, COLUMNAS_CONFIG.length).clearContent();
  if (valores.length > 0) hoja.getRange(2, 1, valores.length, COLUMNAS_CONFIG.length).setValues(valores);
  return valores.length;
}

// ───────────────────────────── Copia completa (hoja "Estado") ─────────────────────────────
// Fila 1: "actualizado" y la fecha ISO de la copia. Filas 2+: el JSON partido en pedazos, cada uno con
// una "x" adelante para que Sheets nunca lo interprete como número, fecha o fórmula.

function guardarEstado_(ss, estado, actualizado) {
  if (typeof estado !== 'string' || estado === '') throw new Error('Falta el estado.');
  const nueva = new Date(actualizado);
  if (isNaN(nueva.getTime())) throw new Error('Fecha de actualización inválida.');
  const hoja = hojaEstado_(ss);
  const actual = actualizadoGuardado_(hoja);
  if (actual && new Date(actual).getTime() > nueva.getTime()) {
    return { ok: true, guardado: false, actualizado: actual };
  }
  const filas = [['actualizado', nueva.toISOString()]];
  for (let i = 0; i < estado.length; i += LARGO_PEDAZO) filas.push(['x' + estado.slice(i, i + LARGO_PEDAZO), '']);
  hoja.clearContents();
  hoja.getRange(1, 1, filas.length, 2).setNumberFormat('@').setValues(filas);
  SpreadsheetApp.flush();
  return { ok: true, guardado: true, actualizado: nueva.toISOString() };
}

function leerEstado_(ss) {
  const hoja = ss.getSheetByName(HOJA_ESTADO);
  const actualizado = hoja ? actualizadoGuardado_(hoja) : null;
  if (hoja && actualizado && hoja.getLastRow() >= 2) {
    const pedazos = hoja.getRange(2, 1, hoja.getLastRow() - 1, 1).getValues();
    const estado = pedazos.map(function (f) { return String(f[0]).slice(1); }).join('');
    return { ok: true, estado: estado, actualizado: actualizado };
  }
  // Todavía no hay copia: van las filas para que la app reconstruya los datos.
  return {
    ok: true, estado: null, actualizado: null,
    filasRegistro: filas_(ss.getSheetByName(HOJA_REGISTRO), CLAVES_REGISTRO),
    filasPlantas: filas_(ss.getSheetByName(HOJA_PLANTAS), CLAVES_PLANTAS),
    filasConfiguracion: filas_(ss.getSheetByName(HOJA_CONFIG), CLAVES_CONFIG),
  };
}

function hojaEstado_(ss) {
  let hoja = ss.getSheetByName(HOJA_ESTADO);
  if (!hoja) {
    hoja = ss.insertSheet(HOJA_ESTADO, ss.getNumSheets());
    hoja.hideSheet();
  }
  return hoja;
}

function actualizadoGuardado_(hoja) {
  if (hoja.getLastRow() < 1) return null;
  const v = hoja.getRange(1, 2).getValue();
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** Las filas de una hoja como objetos con las claves de la app. Fechas → ISO; celdas vacías → "". */
function filas_(hoja, claves) {
  if (!hoja || hoja.getLastRow() < 2) return [];
  const valores = hoja.getRange(2, 1, hoja.getLastRow() - 1, claves.length).getValues();
  return valores.map(function (fila) {
    const o = {};
    claves.forEach(function (k, i) { o[k] = valorParaApp_(fila[i]); });
    return o;
  });
}

function valorParaApp_(v) {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') {
    // Una fecha que quedó como texto ("2026-11-10 14:30:00", hora de Buenos Aires).
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v)) {
      return Utilities.parseDate(v, ZONA, 'yyyy-MM-dd HH:mm:ss').toISOString();
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      return Utilities.parseDate(v + ' 12:00:00', ZONA, 'yyyy-MM-dd HH:mm:ss').toISOString();
    }
  }
  return v;
}

/** Prueba la copia completa sin la app: guarda una copia chiquita, la lee y la borra. */
function testEstado() {
  const ss = planilla_();
  const antes = ss.getSheetByName(HOJA_ESTADO);
  if (antes && antes.getLastRow() > 0) {
    Logger.log('Ya hay una copia guardada: no la toco. %s', JSON.stringify(leerEstado_(ss)).slice(0, 300));
    return;
  }
  Logger.log(JSON.stringify(guardarEstado_(ss, '{"plantas":[],"prueba":"=hola"}', new Date().toISOString())));
  Logger.log(JSON.stringify(leerEstado_(ss)));
  ss.getSheetByName(HOJA_ESTADO).clearContents();
  Logger.log('Copia de prueba borrada.');
}

// ───────────────────────────── Formato ─────────────────────────────

/** ISO 8601 → "2026-11-10 14:30:00" en hora de Buenos Aires (vacío si no hay fecha). */
function fechaHora_(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return texto_(iso);
  return Utilities.formatDate(d, ZONA, 'yyyy-MM-dd HH:mm:ss');
}

function numero_(x) {
  return typeof x === 'number' && isFinite(x) ? x : '';
}

/** Texto seguro: lo que empieza con = + - @ no se interpreta como fórmula. */
function texto_(x) {
  if (x === null || x === undefined) return '';
  const s = String(x);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

// ───────────────────────────── Pruebas ─────────────────────────────

/**
 * Simula un POST de la app con dos eventos y una planta de prueba (IDs que empiezan con "prueba-").
 * Corrélo dos veces: la segunda tiene que decir agregados: 0, repetidos: 2 (idempotencia).
 * Después podés limpiar con borrarPruebas().
 */
function testDoPost() {
  const token = PropertiesService.getScriptProperties().getProperty('TOKEN');
  const ahora = new Date().toISOString();
  const payload = {
    token: token,
    eventos: [
      {
        id: 'prueba-riego-1', fecha: ahora, tipo: 'riego', plantaID: 'prueba-planta',
        planta: 'Planta de prueba', variedad: 'Banana Blaze', autoFoto: 'Auto', etapa: 'Crecimiento',
        dia: 23, cantidad: 1500, unidad: 'ml', producto: '', nota: '', app: 'prueba',
      },
      {
        id: 'prueba-fertilizante-1', fecha: ahora, tipo: 'fertilizante', plantaID: 'prueba-planta',
        planta: 'Planta de prueba', variedad: 'Banana Blaze', autoFoto: 'Auto', etapa: 'Crecimiento',
        dia: 23, cantidad: 1.5, unidad: 'ml', producto: 'Top Veg', dosis: 1, nota: 'Agua: 1500 ml',
        app: 'prueba',
      },
    ],
    plantas: [
      {
        id: 'prueba-planta', nombre: 'Planta de prueba', variedad: 'Banana Blaze', autoFoto: 'Auto',
        semilla: 'Feminizada', sexo: 'Hembra', ubicacion: 'Patio', litros: 20, germinacion: '2026-10-18',
        etapa: 'Crecimiento', dia: 23, ultimoRiego: ahora, ultimoFertilizante: ahora, estado: 'activa',
        notas: 'Fila de prueba', actualizado: ahora,
      },
    ],
  };
  const salida = doPost({ postData: { contents: JSON.stringify(payload) } });
  Logger.log(salida.getContent());
}

/** Borra las filas de prueba (ID que empieza con "prueba-") de Registro y Plantas. */
function borrarPruebas() {
  const ss = planilla_();
  [HOJA_REGISTRO, HOJA_PLANTAS].forEach(function (nombre) {
    const hoja = ss.getSheetByName(nombre);
    if (!hoja) return;
    const ids = idsDeColumnaA_(hoja);
    for (let i = ids.length - 1; i >= 0; i--) {
      if (ids[i].indexOf('prueba-') === 0) hoja.deleteRow(i + 2);
    }
  });
  Logger.log('Filas de prueba borradas.');
}
