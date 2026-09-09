const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');

const router = express.Router();

// Registra una sesion completa (practica o simulacro) ya finalizada, con
// todas sus respuestas. La correccion de cada respuesta se recalcula en el
// servidor contra el banco de preguntas (no se confia en lo que mande el
// navegador), para que las estadisticas del administrador sean confiables.
router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const { tipo, materia, dificultad, tiempo_segundos, respuestas } = req.body || {};
  if (!['practica', 'simulacro'].includes(tipo)) {
    return res.status(400).json({ error: 'Tipo de sesion invalido.' });
  }
  if (!Array.isArray(respuestas) || !respuestas.length) {
    return res.status(400).json({ error: 'La sesion no tiene respuestas para guardar.' });
  }
  const tiempo = Math.max(0, Math.round(Number(tiempo_segundos) || 0));

  const ids = [...new Set(respuestas.map(r => r.question_id).filter(Boolean))];
  let preguntas = [];
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    preguntas = await db.all(
      `SELECT id, materia, dificultad, respuesta_correcta FROM questions WHERE id IN (${placeholders})`,
      ids
    );
  }
  const porId = new Map(preguntas.map(p => [p.id, p]));

  const respuestasNormalizadas = respuestas.map((r, idx) => {
    const q = porId.get(r.question_id);
    const respuestaUsuario = r.respuesta_usuario ? String(r.respuesta_usuario).toLowerCase() : null;
    const correcta = q && respuestaUsuario ? (respuestaUsuario === q.respuesta_correcta ? 1 : 0) : 0;
    return {
      question_id: r.question_id || null,
      orden: idx + 1,
      materia: q ? q.materia : (r.materia || materia || 'lectura_critica'),
      dificultad: q ? q.dificultad : (r.dificultad || dificultad || 'media'),
      respuesta_usuario: respuestaUsuario,
      correcta
    };
  });

  const numCorrectas = respuestasNormalizadas.filter(a => a.correcta).length;

  let nivelEstimado = null;
  if (tipo === 'simulacro') {
    const pesos = { facil: 1, media: 2, dificil: 3 };
    const puntaje = respuestasNormalizadas.reduce(
      (acc, a) => acc + (a.correcta ? (pesos[a.dificultad] || 1) : 0), 0
    );
    nivelEstimado = puntaje >= 16 ? 'Avanzado' : (puntaje >= 9 ? 'Intermedio' : 'Basico');
  }

  const infoSesion = await db.run(`
    INSERT INTO exam_sessions (user_id, tipo, materia, dificultad, num_preguntas, num_correctas, tiempo_segundos, nivel_estimado, fecha_fin)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `, [
    req.user.id, tipo, materia || null, dificultad || null,
    respuestasNormalizadas.length, numCorrectas, tiempo, nivelEstimado
  ]);

  const sessionId = infoSesion.lastInsertRowid;
  const statements = respuestasNormalizadas.map((a) => ({
    sql: `INSERT INTO exam_answers (session_id, question_id, orden, materia, dificultad, respuesta_usuario, correcta) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [sessionId, a.question_id, a.orden, a.materia, a.dificultad, a.respuesta_usuario, a.correcta]
  }));
  await db.batch(statements);

  const sesion = await db.get('SELECT * FROM exam_sessions WHERE id = ?', [sessionId]);
  res.status(201).json({ sesion });
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const { tipo } = req.query;
  const condiciones = ['user_id = ?'];
  const params = [req.user.id];
  if (['practica', 'simulacro'].includes(tipo)) {
    condiciones.push('tipo = ?');
    params.push(tipo);
  }
  const rows = await db.all(
    `SELECT * FROM exam_sessions WHERE ${condiciones.join(' AND ')} ORDER BY fecha_inicio DESC`,
    params
  );
  res.json({ sesiones: rows });
}));

module.exports = router;
