// Adaptador TEMPORAL sobre Turso (libSQL/SQLite) con la MISMA interfaz que
// src/db.js (Roble): leer, porId, dondeEn, crear, crearVarias, actualizar,
// borrar, initSchema. Se activa con DB_PROVIDER=turso (ver src/db.js).
//
// - Las tablas se llaman r_<nombre> (r_users, r_questions...) para NO tocar
//   las tablas viejas de Turso (colegios, users, ...), que tienen ids
//   numericos y otro esquema. Asi se pueden migrar despues desde ahi.
// - Cada tabla tiene _id TEXT (UUID) igual que Roble; se expone como `id`.
// - Los booleanos se guardan como 0/1 y se devuelven como true/false.

const crypto = require('crypto');
const { createClient } = require('@libsql/client');

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN || undefined;
if (!url) throw new Error('DB_PROVIDER=turso requiere TURSO_DATABASE_URL (y TURSO_AUTH_TOKEN) en el entorno.');
const client = createClient(authToken ? { url, authToken } : { url });

const PREFIJO = 'r_';
const NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))";

// Esquema: columna -> definicion SQL. Las de tipo BOOL se convierten.
const ESQUEMA = {
  colegios: {
    nombre: 'TEXT NOT NULL UNIQUE',
    created_at: `TEXT NOT NULL DEFAULT ${NOW}`
  },
  users: {
    nombre: 'TEXT NOT NULL',
    apellidos: "TEXT NOT NULL DEFAULT ''",
    email: 'TEXT NOT NULL UNIQUE',
    password_hash: 'TEXT NOT NULL',
    role: "TEXT NOT NULL DEFAULT 'estudiante'",
    colegio_id: 'TEXT',
    email_confirmado: 'BOOL NOT NULL DEFAULT 1',
    confirmacion_token: 'TEXT',
    confirmacion_expira: 'TEXT',
    created_at: `TEXT NOT NULL DEFAULT ${NOW}`
  },
  textos: {
    materia: 'TEXT NOT NULL',
    contenido: 'TEXT NOT NULL',
    imagen: 'TEXT',
    cantidad_preguntas: 'INTEGER',
    preguntas_por_grupo: 'INTEGER',
    created_by: 'TEXT',
    created_at: `TEXT NOT NULL DEFAULT ${NOW}`
  },
  questions: {
    materia: 'TEXT NOT NULL',
    dificultad: 'TEXT NOT NULL',
    competencia: 'TEXT',
    eje: 'TEXT',
    texto_base: 'TEXT',
    texto_id: 'TEXT',
    enunciado: 'TEXT NOT NULL',
    opcion_a: 'TEXT NOT NULL',
    opcion_b: 'TEXT NOT NULL',
    opcion_c: 'TEXT NOT NULL',
    opcion_d: 'TEXT NOT NULL',
    respuesta_correcta: 'TEXT NOT NULL',
    explicacion: 'TEXT',
    imagen: 'TEXT',
    opcion_a_imagen: 'TEXT',
    opcion_b_imagen: 'TEXT',
    opcion_c_imagen: 'TEXT',
    opcion_d_imagen: 'TEXT',
    activo: 'BOOL NOT NULL DEFAULT 1',
    origen: 'TEXT',
    validada: 'BOOL',
    created_by: 'TEXT',
    created_at: `TEXT NOT NULL DEFAULT ${NOW}`
  },
  exam_sessions: {
    user_id: 'TEXT NOT NULL',
    tipo: 'TEXT NOT NULL',
    materia: 'TEXT',
    dificultad: 'TEXT',
    competencia: 'TEXT',
    eje: 'TEXT',
    materias: 'TEXT',
    num_preguntas: 'INTEGER NOT NULL DEFAULT 0',
    num_correctas: 'INTEGER NOT NULL DEFAULT 0',
    tiempo_segundos: 'INTEGER NOT NULL DEFAULT 0',
    nivel_estimado: 'TEXT',
    estrategia: 'TEXT',
    fecha_inicio: `TEXT NOT NULL DEFAULT ${NOW}`,
    fecha_fin: 'TEXT'
  },
  exam_answers: {
    session_id: 'TEXT NOT NULL',
    question_id: 'TEXT',
    orden: 'INTEGER NOT NULL',
    materia: 'TEXT NOT NULL',
    dificultad: 'TEXT NOT NULL',
    competencia: 'TEXT',
    eje: 'TEXT',
    respuesta_usuario: 'TEXT',
    correcta: 'BOOL NOT NULL DEFAULT 0',
    tiempo_segundos: 'INTEGER NOT NULL DEFAULT 0',
    motivo_seleccion: 'TEXT',
    created_at: `TEXT NOT NULL DEFAULT ${NOW}`
  },
  refresh_tokens: {
    user_id: 'TEXT NOT NULL',
    token_hash: 'TEXT NOT NULL',
    created_at: `TEXT NOT NULL DEFAULT ${NOW}`,
    expira: 'TEXT NOT NULL',
    revocado: 'BOOL NOT NULL DEFAULT 0'
  }
};

const BOOLS = {};
for (const [t, cols] of Object.entries(ESQUEMA)) {
  BOOLS[t] = new Set(Object.entries(cols).filter(([, d]) => d.startsWith('BOOL')).map(([c]) => c));
}

function nombreTabla(tabla) {
  if (!ESQUEMA[tabla]) throw new Error(`Tabla desconocida: ${tabla}`);
  return PREFIJO + tabla;
}

function aFila(tabla, row) {
  if (!row) return null;
  const out = {};
  for (const [k, v0] of Object.entries(row)) {
    let v = typeof v0 === 'bigint' ? Number(v0) : v0;
    if (k === '_id') { out.id = v; continue; }
    if (BOOLS[tabla].has(k) && v !== null && v !== undefined) v = Boolean(v);
    out[k] = v;
  }
  return out;
}

function aValor(tabla, col, v) {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (BOOLS[tabla].has(col) && v !== null) {
    if (v === 'true') return 1;
    if (v === 'false') return 0;
  }
  return v;
}

function columnasValidas(tabla, datos) {
  const cols = [];
  for (const k of Object.keys(datos)) {
    if (k === 'id' || k === '_id' || k === '_owner') continue;
    if (!ESQUEMA[tabla][k]) { console.warn(`[db-turso] columna desconocida ignorada: ${tabla}.${k}`); continue; }
    cols.push(k);
  }
  return cols;
}

function sentenciaInsert(tabla, datos, id) {
  const cols = columnasValidas(tabla, datos);
  const nombres = ['_id', ...cols];
  const args = [id, ...cols.map((c) => aValor(tabla, c, datos[c]))];
  return {
    sql: `INSERT INTO ${nombreTabla(tabla)} (${nombres.join(', ')}) VALUES (${nombres.map(() => '?').join(', ')})`,
    args
  };
}

// ---------- CRUD con la misma interfaz que db.js (Roble) ----------

async function leer(tabla, filtros) {
  const t = nombreTabla(tabla);
  const where = [];
  const args = [];
  if (filtros) {
    for (const [k, v] of Object.entries(filtros)) {
      if (v === undefined || v === null) continue;
      const col = k === 'id' ? '_id' : k;
      if (col !== '_id' && !ESQUEMA[tabla][col]) throw new Error(`Filtro invalido: ${tabla}.${k}`);
      where.push(`${col} = ?`);
      args.push(BOOLS[tabla].has(col) ? aValor(tabla, col, v) : String(v));
    }
  }
  const sql = `SELECT * FROM ${t}` + (where.length ? ` WHERE ${where.join(' AND ')}` : '');
  const res = await client.execute({ sql, args });
  return res.rows.map((r) => aFila(tabla, r));
}

async function porId(tabla, id) {
  if (!id) return null;
  const filas = await leer(tabla, { _id: id });
  return filas[0] || null;
}

function dondeEn(filas, campo, valores) {
  const set = new Set(valores.map((v) => String(v)));
  return filas.filter((f) => set.has(String(f[campo])));
}

async function crear(tabla, datos) {
  const id = crypto.randomUUID();
  await client.execute(sentenciaInsert(tabla, datos, id));
  return porId(tabla, id);
}

async function crearVarias(tabla, filas) {
  if (!filas.length) return { inserted: [], skipped: [] };
  const inserted = [];
  const skipped = [];
  const TANDA = 40;
  for (let i = 0; i < filas.length; i += TANDA) {
    const grupo = filas.slice(i, i + TANDA);
    const ids = grupo.map(() => crypto.randomUUID());
    try {
      await client.batch(grupo.map((d, j) => sentenciaInsert(tabla, d, ids[j])), 'write');
      for (const id of ids) inserted.push(await porId(tabla, id));
    } catch (err) {
      // Si falla la tanda completa (es atomica), reporta cada fila como omitida.
      for (const d of grupo) skipped.push({ record: d, reason: err.message });
    }
  }
  return { inserted, skipped };
}

async function actualizar(tabla, id, datos) {
  const cols = columnasValidas(tabla, datos);
  if (cols.length) {
    await client.execute({
      sql: `UPDATE ${nombreTabla(tabla)} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE _id = ?`,
      args: [...cols.map((c) => aValor(tabla, c, datos[c])), id]
    });
  }
  return porId(tabla, id);
}

async function borrar(tabla, id) {
  const res = await client.execute({ sql: `DELETE FROM ${nombreTabla(tabla)} WHERE _id = ?`, args: [id] });
  return res.rowsAffected > 0;
}

let listo = null;
function initSchema() {
  if (!listo) {
    listo = (async () => {
      for (const [tabla, cols] of Object.entries(ESQUEMA)) {
        const defs = Object.entries(cols).map(([c, d]) => `${c} ${d.replace(/^BOOL/, 'INTEGER')}`);
        await client.execute(
          `CREATE TABLE IF NOT EXISTS ${nombreTabla(tabla)} (_id TEXT PRIMARY KEY, ${defs.join(', ')})`
        );
      }
      await client.execute(`CREATE INDEX IF NOT EXISTS idx_r_questions_materia ON ${PREFIJO}questions(materia)`);
      await client.execute(`CREATE INDEX IF NOT EXISTS idx_r_sessions_user ON ${PREFIJO}exam_sessions(user_id)`);
      await client.execute(`CREATE INDEX IF NOT EXISTS idx_r_answers_session ON ${PREFIJO}exam_answers(session_id)`);
      await client.execute(`CREATE INDEX IF NOT EXISTS idx_r_tokens_hash ON ${PREFIJO}refresh_tokens(token_hash)`);
      console.log('[db] Conectado a Turso (adaptador temporal, tablas r_*).');
    })();
  }
  return listo;
}

module.exports = { leer, porId, dondeEn, crear, crearVarias, actualizar, borrar, initSchema };
