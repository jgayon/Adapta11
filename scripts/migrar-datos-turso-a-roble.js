// Migra los datos reales que estaban en Turso (SQLite) hacia Roble.
//
// Por defecto corre en modo DRY-RUN: lee todo de Turso, compara contra lo que
// ya hay en Roble, y solo IMPRIME un reporte de que haria (no escribe nada).
// Para aplicar los cambios de verdad:
//
//   node scripts/migrar-datos-turso-a-roble.js --aplicar
//
// Requiere en tu .env, ademas de las variables ROBLE_* normales:
//   TURSO_DATABASE_URL=libsql://...
//   TURSO_AUTH_TOKEN=...
// (se pueden borrar del .env despues de migrar, ya no hacen falta)
//
// Es seguro correrlo varias veces: si un colegio/usuario/pregunta/texto ya
// existe en Roble (mismo nombre, correo o enunciado), lo reutiliza en vez de
// duplicarlo. Las sesiones de examen y sus respuestas si se insertan siempre
// como filas nuevas (son historial, no tiene sentido "fusionarlas"), asi que
// --aplicar NO deberia correrse dos veces una vez ya aplicado de verdad.

require('dotenv').config();
const { createClient } = require('@libsql/client');
const db = require('../src/db');

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;
if (!TURSO_URL || !TURSO_TOKEN) {
  console.error('Faltan TURSO_DATABASE_URL y/o TURSO_AUTH_TOKEN en tu .env.');
  process.exit(1);
}

const APLICAR = process.argv.includes('--aplicar');

const turso = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

function norm(v) {
  return typeof v === 'bigint' ? Number(v) : v;
}
function normRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k] = norm(v);
  return out;
}
async function tursoAll(sql) {
  const res = await turso.execute(sql);
  return res.rows.map(normRow);
}

function limpiar(s) {
  return (s || '').toString().trim();
}
function clave(s) {
  return limpiar(s).toLowerCase().replace(/\s+/g, ' ');
}

async function main() {
  console.log(
    APLICAR
      ? '=== MIGRACION Turso -> Roble (modo real: SI va a escribir) ===\n'
      : '=== DRY-RUN Turso -> Roble (no se escribe nada todavia) ===\n'
  );

  const [tColegios, tUsers, tTextos, tQuestions, tSessions, tAnswers] = await Promise.all([
    tursoAll('SELECT * FROM colegios'),
    tursoAll('SELECT * FROM users'),
    tursoAll('SELECT * FROM textos'),
    tursoAll('SELECT * FROM questions'),
    tursoAll('SELECT * FROM exam_sessions'),
    tursoAll('SELECT * FROM exam_answers')
  ]);

  console.log(
    `Turso tiene: ${tColegios.length} colegios, ${tUsers.length} usuarios, ` +
    `${tTextos.length} textos, ${tQuestions.length} preguntas, ` +
    `${tSessions.length} sesiones, ${tAnswers.length} respuestas.\n`
  );

  await db.initSchema();

  // ---------------- Colegios ----------------
  const robleColegios = await db.leer('colegios');
  const colegioPorNombre = new Map(robleColegios.map((c) => [clave(c.nombre), c]));
  const mapColegio = new Map();
  let colegiosNuevos = 0, colegiosReusados = 0;
  for (const c of tColegios) {
    const k = clave(c.nombre);
    const existente = colegioPorNombre.get(k);
    if (existente) {
      mapColegio.set(c.id, existente.id);
      colegiosReusados++;
      continue;
    }
    colegiosNuevos++;
    if (APLICAR) {
      const creado = await db.crear('colegios', {
        nombre: limpiar(c.nombre),
        created_at: c.created_at || undefined
      });
      mapColegio.set(c.id, creado.id);
      colegioPorNombre.set(k, creado);
    } else {
      mapColegio.set(c.id, `PENDIENTE:colegio:${c.id}`);
    }
  }
  console.log(`Colegios: ${colegiosNuevos} nuevos, ${colegiosReusados} ya existian en Roble.`);

  // ---------------- Usuarios ----------------
  const robleUsers = await db.leer('users');
  const userPorEmail = new Map(robleUsers.map((u) => [clave(u.email), u]));
  const mapUser = new Map();
  let usersNuevos = 0, usersReusados = 0;
  for (const u of tUsers) {
    const k = clave(u.email);
    const existente = userPorEmail.get(k);
    if (existente) {
      mapUser.set(u.id, existente.id);
      usersReusados++;
      continue;
    }
    usersNuevos++;
    const datos = {
      nombre: limpiar(u.nombre),
      apellidos: limpiar(u.apellidos) || '',
      email: limpiar(u.email).toLowerCase(),
      password_hash: u.password_hash,
      role: u.role,
      colegio_id: u.colegio_id != null ? mapColegio.get(u.colegio_id) || null : null,
      created_at: u.created_at || undefined
    };
    if (APLICAR) {
      const creado = await db.crear('users', datos);
      mapUser.set(u.id, creado.id);
      userPorEmail.set(k, creado);
    } else {
      mapUser.set(u.id, `PENDIENTE:user:${u.id}`);
    }
  }
  console.log(`Usuarios: ${usersNuevos} nuevos, ${usersReusados} ya existian en Roble (mismo correo).`);

  // ---------------- Textos (lecturas compartidas) ----------------
  const robleTextos = await db.leer('textos');
  const textoPorClave = new Map(
    robleTextos.map((t) => [clave(t.materia) + '|' + clave(t.contenido).slice(0, 200), t])
  );
  const mapTexto = new Map();
  let textosNuevos = 0, textosReusados = 0;
  for (const t of tTextos) {
    const k = clave(t.materia) + '|' + clave(t.contenido).slice(0, 200);
    const existente = textoPorClave.get(k);
    if (existente) {
      mapTexto.set(t.id, existente.id);
      textosReusados++;
      continue;
    }
    textosNuevos++;
    const datos = {
      materia: t.materia,
      contenido: t.contenido,
      created_by: t.created_by != null ? mapUser.get(t.created_by) || null : null,
      created_at: t.created_at || undefined
    };
    if (APLICAR) {
      const creado = await db.crear('textos', datos);
      mapTexto.set(t.id, creado.id);
      textoPorClave.set(k, creado);
    } else {
      mapTexto.set(t.id, `PENDIENTE:texto:${t.id}`);
    }
  }
  console.log(`Textos: ${textosNuevos} nuevos, ${textosReusados} ya existian en Roble.`);

  // ---------------- Preguntas ----------------
  const robleQuestions = await db.leer('questions');
  const qPorClave = new Map(
    robleQuestions.map((q) => [clave(q.materia) + '|' + clave(q.dificultad) + '|' + clave(q.enunciado), q])
  );
  const mapQuestion = new Map();
  let qNuevas = 0, qReusadas = 0;
  for (const q of tQuestions) {
    const k = clave(q.materia) + '|' + clave(q.dificultad) + '|' + clave(q.enunciado);
    const existente = qPorClave.get(k);
    if (existente) {
      mapQuestion.set(q.id, existente.id);
      qReusadas++;
      continue;
    }
    qNuevas++;
    const datos = {
      materia: q.materia,
      dificultad: q.dificultad,
      competencia: q.competencia || null,
      eje: q.eje || null,
      texto_base: q.texto_base || null,
      texto_id: q.texto_id != null ? mapTexto.get(q.texto_id) || null : null,
      enunciado: q.enunciado,
      opcion_a: q.opcion_a,
      opcion_b: q.opcion_b,
      opcion_c: q.opcion_c,
      opcion_d: q.opcion_d,
      respuesta_correcta: q.respuesta_correcta,
      explicacion: q.explicacion || null,
      imagen: q.imagen || null,
      activo: !!q.activo,
      created_by: q.created_by != null ? mapUser.get(q.created_by) || null : null,
      created_at: q.created_at || undefined
    };
    if (APLICAR) {
      const creado = await db.crear('questions', datos);
      mapQuestion.set(q.id, creado.id);
      qPorClave.set(k, creado);
    } else {
      mapQuestion.set(q.id, `PENDIENTE:pregunta:${q.id}`);
    }
  }
  console.log(`Preguntas: ${qNuevas} nuevas, ${qReusadas} ya existian en Roble (mismo enunciado).`);

  // ---------------- Sesiones de examen ----------------
  const mapSession = new Map();
  let sesionesNuevas = 0, sesionesOmitidas = 0;
  for (const s of tSessions) {
    const uid = mapUser.get(s.user_id);
    if (!uid) {
      sesionesOmitidas++;
      continue;
    }
    sesionesNuevas++;
    const datos = {
      user_id: uid,
      tipo: s.tipo,
      materia: s.materia || null,
      dificultad: s.dificultad || null,
      competencia: s.competencia || null,
      eje: s.eje || null,
      materias: s.materias || null,
      num_preguntas: s.num_preguntas || 0,
      num_correctas: s.num_correctas || 0,
      tiempo_segundos: s.tiempo_segundos || 0,
      nivel_estimado: s.nivel_estimado || null,
      fecha_inicio: s.fecha_inicio || undefined,
      fecha_fin: s.fecha_fin || s.fecha_inicio || new Date().toISOString()
    };
    if (APLICAR) {
      const creada = await db.crear('exam_sessions', datos);
      mapSession.set(s.id, creada.id);
    } else {
      mapSession.set(s.id, `PENDIENTE:sesion:${s.id}`);
    }
  }
  console.log(`Sesiones de examen: ${sesionesNuevas} a migrar, ${sesionesOmitidas} omitidas (usuario no encontrado).`);

  // ---------------- Respuestas ----------------
  let respuestasNuevas = 0, respuestasOmitidas = 0;
  const filasPorSesion = new Map();
  for (const a of tAnswers) {
    const sid = mapSession.get(a.session_id);
    if (!sid) {
      respuestasOmitidas++;
      continue;
    }
    respuestasNuevas++;
    if (!APLICAR) continue;
    const datos = {
      session_id: sid,
      question_id: a.question_id != null ? mapQuestion.get(a.question_id) || null : null,
      orden: a.orden,
      materia: a.materia,
      dificultad: a.dificultad,
      competencia: a.competencia || null,
      eje: a.eje || null,
      respuesta_usuario: a.respuesta_usuario || null,
      correcta: !!a.correcta,
      tiempo_segundos: a.tiempo_segundos || 0,
      created_at: a.created_at || undefined
    };
    if (!filasPorSesion.has(sid)) filasPorSesion.set(sid, []);
    filasPorSesion.get(sid).push(datos);
  }
  if (APLICAR) {
    for (const [, filas] of filasPorSesion) {
      for (let i = 0; i < filas.length; i += 40) {
        const lote = filas.slice(i, i + 40);
        const res = await db.crearVarias('exam_answers', lote);
        if (res.skipped.length) {
          console.error(`[migracion] ${res.skipped.length} respuestas no se pudieron guardar:`, res.skipped);
        }
      }
    }
  }
  console.log(`Respuestas: ${respuestasNuevas} a migrar, ${respuestasOmitidas} omitidas (sesion no encontrada).`);

  console.log(
    APLICAR
      ? '\nMigracion aplicada. Los estudiantes pueden iniciar sesion con su mismo correo y contrasena de siempre.'
      : '\nEsto fue un dry-run, no se escribio nada. Si el reporte de arriba se ve bien, corre:\n  node scripts/migrar-datos-turso-a-roble.js --aplicar'
  );
}

main().catch((err) => {
  console.error('Error en la migracion:', err);
  process.exit(1);
});
