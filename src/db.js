const path = require('path');
const fs = require('fs');
const { createClient } = require('@libsql/client');

// Si TURSO_DATABASE_URL esta definida, la app se conecta a una base de datos
// remota gratuita en Turso (libSQL), pensada para produccion (por ejemplo,
// desplegada en el plan gratuito de Render, que no tiene disco persistente).
// Si no esta definida, se usa un archivo SQLite local dentro de DATA_DIR (o
// data/ por defecto) para desarrollo y pruebas en tu propio computador.
const dataDir = process.env.DATA_DIR
  ? process.env.DATA_DIR
  : path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const url = process.env.TURSO_DATABASE_URL || `file:${path.join(dataDir, 'rutasaber.db')}`;
const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

const client = createClient(authToken ? { url, authToken } : { url });

// El cliente de libSQL puede devolver identificadores muy grandes como
// BigInt. En esta app los ids siempre caben en un Number normal, asi que se
// convierten para que se puedan usar sin problemas (por ejemplo con
// JSON.stringify, que no soporta BigInt).
function normalizeRow(row) {
  if (!row) return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = typeof v === 'bigint' ? Number(v) : v;
  }
  return out;
}
function normalizeRows(rows) {
  return rows.map(normalizeRow);
}

async function run(sql, args = {}) {
  const res = await client.execute({ sql, args });
  return {
    lastInsertRowid: res.lastInsertRowid !== undefined && res.lastInsertRowid !== null
      ? Number(res.lastInsertRowid)
      : null,
    changes: res.rowsAffected
  };
}

async function get(sql, args = {}) {
  const res = await client.execute({ sql, args });
  return normalizeRow(res.rows[0]);
}

async function all(sql, args = {}) {
  const res = await client.execute({ sql, args });
  return normalizeRows(res.rows);
}

// Ejecuta varias sentencias de forma atomica (todas o ninguna).
async function batch(statements) {
  if (!statements.length) return;
  await client.batch(statements, 'write');
}

async function execMultiple(sql) {
  await client.executeMultiple(sql);
}

let schemaReady = null;
function initSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = execMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      apellidos TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('estudiante','administrador')) DEFAULT 'estudiante',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      materia TEXT NOT NULL CHECK(materia IN ('lectura_critica','matematicas')),
      dificultad TEXT NOT NULL CHECK(dificultad IN ('facil','media','dificil')),
      competencia TEXT,
      eje TEXT,
      texto_base TEXT,
      enunciado TEXT NOT NULL,
      opcion_a TEXT NOT NULL,
      opcion_b TEXT NOT NULL,
      opcion_c TEXT NOT NULL,
      opcion_d TEXT NOT NULL,
      respuesta_correcta TEXT NOT NULL CHECK(respuesta_correcta IN ('a','b','c','d')),
      explicacion TEXT,
      imagen TEXT,
      activo INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS exam_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      tipo TEXT NOT NULL CHECK(tipo IN ('practica','simulacro')),
      materia TEXT,
      dificultad TEXT,
      competencia TEXT,
      eje TEXT,
      materias TEXT,
      num_preguntas INTEGER NOT NULL DEFAULT 0,
      num_correctas INTEGER NOT NULL DEFAULT 0,
      tiempo_segundos INTEGER NOT NULL DEFAULT 0,
      nivel_estimado TEXT,
      fecha_inicio TEXT NOT NULL DEFAULT (datetime('now')),
      fecha_fin TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS exam_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      question_id INTEGER,
      orden INTEGER NOT NULL,
      materia TEXT NOT NULL,
      dificultad TEXT NOT NULL,
      competencia TEXT,
      eje TEXT,
      respuesta_usuario TEXT,
      correcta INTEGER NOT NULL DEFAULT 0,
      tiempo_segundos INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(session_id) REFERENCES exam_sessions(id),
      FOREIGN KEY(question_id) REFERENCES questions(id)
    );

    CREATE INDEX IF NOT EXISTS idx_questions_materia_dificultad ON questions(materia, dificultad, activo);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON exam_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_answers_session ON exam_answers(session_id);
  `);
  return schemaReady.then(() => migrateColumns()).then(() => createExtraIndexes());
}

// Migracion ligera e idempotente: agrega columnas nuevas a bases de datos que
// ya existian antes de introducir ejes/competencias y el tiempo por pregunta,
// sin afectar los datos historicos (sesiones y respuestas ya guardadas). Debe
// correr antes de crear indices sobre esas columnas, porque CREATE TABLE IF
// NOT EXISTS no modifica una tabla que ya existia con el esquema viejo.
async function migrateColumns() {
  const migrations = [
    { table: 'questions', column: 'competencia', ddl: 'ALTER TABLE questions ADD COLUMN competencia TEXT' },
    { table: 'questions', column: 'eje', ddl: 'ALTER TABLE questions ADD COLUMN eje TEXT' },
    { table: 'exam_answers', column: 'competencia', ddl: 'ALTER TABLE exam_answers ADD COLUMN competencia TEXT' },
    { table: 'exam_answers', column: 'eje', ddl: 'ALTER TABLE exam_answers ADD COLUMN eje TEXT' },
    { table: 'exam_answers', column: 'tiempo_segundos', ddl: 'ALTER TABLE exam_answers ADD COLUMN tiempo_segundos INTEGER NOT NULL DEFAULT 0' },
    { table: 'exam_sessions', column: 'competencia', ddl: 'ALTER TABLE exam_sessions ADD COLUMN competencia TEXT' },
    { table: 'exam_sessions', column: 'eje', ddl: 'ALTER TABLE exam_sessions ADD COLUMN eje TEXT' },
    { table: 'exam_sessions', column: 'materias', ddl: 'ALTER TABLE exam_sessions ADD COLUMN materias TEXT' }
  ];
  for (const { table, column, ddl } of migrations) {
    const cols = await all(`PRAGMA table_info(${table})`);
    const exists = cols.some((c) => c.name === column);
    if (!exists) {
      await run(ddl);
      console.log(`[db] Migracion aplicada: ${table}.${column}`);
    }
  }
}

async function createExtraIndexes() {
  await run('CREATE INDEX IF NOT EXISTS idx_questions_materia_competencia ON questions(materia, competencia, activo)');
  await run('CREATE INDEX IF NOT EXISTS idx_questions_materia_eje ON questions(materia, eje, activo)');
}

module.exports = { run, get, all, batch, execMultiple, initSchema, client };
