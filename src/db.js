// Capa de acceso a datos sobre Roble (Uninorte OpenLab), en reemplazo de la
// base de datos SQLite/Turso anterior (@libsql/client).
//
// Roble NO ofrece SQL crudo para que lo use la app (eso solo existe en la
// "Consola SQL" del panel de Roble, que se uso una sola vez, a mano, para
// crear las 6 tablas - ver claude/plan-migracion-roble.md en el proyecto de
// Claude). Su API REST para la app solo da CRUD simple por tabla:
//   - leer, con filtros de IGUALDAD exacta (sin JOIN, sin operadores, sin IN)
//   - crear uno o varios registros (Roble asigna un _id UUID a cada uno)
//   - actualizar/borrar un registro por su _id
// Por eso, todo lo que antes hacia SQLite - JOIN, SUM/AVG/COUNT/GROUP BY,
// ORDER BY RANDOM(), IN (...) - ahora se hace en JavaScript, sobre los datos
// ya traidos. La logica de agregacion mas pesada vive en lib/estadisticas.js.
//
// El backend inicia sesion en Roble UNA sola vez, al arrancar, con una
// "cuenta de servicio" (no es una cuenta de estudiante/profesor real: ver
// ROBLE_SERVICE_EMAIL/ROBLE_SERVICE_PASSWORD en .env) y reusa ese token de
// sesion para todas las peticiones de todos los usuarios de la app. La
// autenticacion propia de Adapta11 (bcrypt + JWT en cookie, ver
// middleware/auth.js) no cambia: Roble aqui es solo el almacen de datos.

const ROBLE_BASE_URL = process.env.ROBLE_BASE_URL || 'https://roble-api.test-openlab.uninorte.edu.co';
const ROBLE_CONTRACT_ID = process.env.ROBLE_CONTRACT_ID;
const ROBLE_SERVICE_EMAIL = process.env.ROBLE_SERVICE_EMAIL;
const ROBLE_SERVICE_PASSWORD = process.env.ROBLE_SERVICE_PASSWORD;

if (!ROBLE_CONTRACT_ID || !ROBLE_SERVICE_EMAIL || !ROBLE_SERVICE_PASSWORD) {
  throw new Error(
    'Faltan variables de entorno de Roble: revisa ROBLE_CONTRACT_ID, ' +
    'ROBLE_SERVICE_EMAIL y ROBLE_SERVICE_PASSWORD en tu .env / .roble.mcp.env'
  );
}

let accessToken = null;
let loginEnCurso = null;

async function iniciarSesionServicio() {
  const res = await fetch(`${ROBLE_BASE_URL}/auth/${ROBLE_CONTRACT_ID}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ROBLE_SERVICE_EMAIL, password: ROBLE_SERVICE_PASSWORD })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.accessToken) {
    throw new Error(
      `No se pudo iniciar sesion en Roble con la cuenta de servicio (${res.status}): ` +
      (data && (data.message || data.error) || 'respuesta inesperada')
    );
  }
  accessToken = data.accessToken;
  return accessToken;
}

function asegurarSesion() {
  if (accessToken) return Promise.resolve(accessToken);
  if (!loginEnCurso) {
    loginEnCurso = iniciarSesionServicio().finally(() => { loginEnCurso = null; });
  }
  return loginEnCurso;
}

// Ejecuta una peticion autenticada contra la API de Roble. Si el token de la
// cuenta de servicio ya vencio (401), inicia sesion de nuevo una sola vez y
// reintenta la misma peticion.
async function peticion(path, { method = 'GET', body, query, _reintentar = true } = {}) {
  await asegurarSesion();
  let url = `${ROBLE_BASE_URL}${path}`;
  if (query) {
    const qs = new URLSearchParams(query).toString();
    if (qs) url += (url.includes('?') ? '&' : '?') + qs;
  }
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  if (res.status === 401 && _reintentar) {
    accessToken = null;
    return peticion(path, { method, body, query, _reintentar: false });
  }

  const texto = await res.text();
  const data = texto ? JSON.parse(texto) : null;
  if (!res.ok) {
    const err = new Error((data && (data.message || data.error)) || `Error ${res.status} en ${path}`);
    err.statusCode = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

// Convierte el _id que asigna Roble en un campo "id" normal, para que el
// resto de la app (JWT, rutas, frontend) siga usando row.id como siempre
// hacia con el id autoincremental de SQLite (ahora es un UUID en texto, no
// un numero, pero se usa exactamente igual: por comparacion de igualdad).
function normalizar(fila) {
  if (!fila) return fila;
  const { _id, _owner, ...resto } = fila;
  return { id: _id, ...resto };
}
function normalizarTodas(filas) {
  return (filas || []).map(normalizar);
}

// ---------- CRUD generico por tabla ----------

// Filtros: SOLO igualdad exacta (limitacion de Roble). No uses aqui filtros
// de tipo boolean (activo, correcta): el valor viaja como texto en la query
// string y no esta documentado que Roble lo compare bien contra una columna
// boolean de Postgres. Para esos casos, trae los datos con un filtro simple
// (materia, user_id, session_id, etc.) y filtra el booleano en JavaScript.
async function leer(tabla, filtros) {
  const query = { tableName: tabla };
  if (filtros) {
    for (const [k, v] of Object.entries(filtros)) {
      if (v !== undefined && v !== null) query[k] = String(v);
    }
  }
  const res = await peticion(`/database/${ROBLE_CONTRACT_ID}/read`, { query });
  const filas = Array.isArray(res) ? res : (res && res.data) || [];
  return normalizarTodas(filas);
}

async function porId(tabla, id) {
  if (!id) return null;
  const filas = await leer(tabla, { _id: id });
  return filas[0] || null;
}

// Trae toda la tabla (o un subconjunto ya filtrado por igualdad) y se queda
// solo con las filas cuyo campo `campo` esta en `valores`. Reemplaza el
// `WHERE campo IN (...)` de SQL, que Roble no soporta.
function dondeEn(filas, campo, valores) {
  const set = new Set(valores.map((v) => String(v)));
  return filas.filter((f) => set.has(String(f[campo])));
}

async function crear(tabla, datos) {
  const fila = await peticion(`/database/${ROBLE_CONTRACT_ID}/insert-one`, {
    method: 'POST',
    body: { tableName: tabla, record: datos }
  });
  return normalizar(fila);
}

async function crearVarias(tabla, filas) {
  if (!filas.length) return { inserted: [], skipped: [] };
  const res = await peticion(`/database/${ROBLE_CONTRACT_ID}/insert`, {
    method: 'POST',
    body: { tableName: tabla, records: filas }
  });
  return {
    inserted: normalizarTodas(res && res.inserted),
    skipped: (res && res.skipped) || []
  };
}

async function actualizar(tabla, id, datos) {
  const fila = await peticion(`/database/${ROBLE_CONTRACT_ID}/update`, {
    method: 'PUT',
    body: { tableName: tabla, idColumn: '_id', idValue: id, updates: datos }
  });
  return normalizar(fila);
}

async function borrar(tabla, id) {
  try {
    await peticion(`/database/${ROBLE_CONTRACT_ID}/delete`, {
      method: 'DELETE',
      body: { tableName: tabla, idColumn: '_id', idValue: id }
    });
    return true;
  } catch (err) {
    if (err.statusCode === 404) return false; // ya no existia
    throw err;
  }
}

// Antes creaba las tablas (CREATE TABLE IF NOT EXISTS...) y corria
// migraciones. Las tablas de Roble ya existen (se crearon una sola vez desde
// la Consola SQL del panel), asi que ahora esta funcion solo confirma que la
// cuenta de servicio puede iniciar sesion, para fallar rapido al arrancar si
// falta configuracion en vez de fallar en la primera peticion de un usuario.
let listo = null;
function initSchema() {
  if (!listo) {
    listo = asegurarSesion().then(() => {
      console.log('[db] Conectado a Roble (proyecto ' + ROBLE_CONTRACT_ID + ') como cuenta de servicio.');
    });
  }
  return listo;
}

module.exports = { leer, porId, dondeEn, crear, crearVarias, actualizar, borrar, initSchema };
