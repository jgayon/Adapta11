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
  const { tipo, materia, dificultad, competencia, eje, materias, tiempo_segundos, respuestas } = req.body || {};
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
      `SELECT id, materia, dificultad, competencia, eje, enunciado, texto_base, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, explicacion FROM questions WHERE id IN (${placeholders})`,
      ids
    );
  }
  const porId = new Map(preguntas.map(p => [p.id, p]));

  const respuestasNormalizadas = respuestas.map((r, idx) => {
    const q = porId.get(r.question_id);
    const respuestaUsuario = r.respuesta_usuario ? String(r.respuesta_usuario).toLowerCase() : null;
    const correcta = q && respuestaUsuario ? (respuestaUsuario === q.respuesta_correcta ? 1 : 0) : 0;
    // El tiempo por pregunta lo cronometra el navegador (no es un dato que
    // afecte la calificacion), asi que solo se acota a un rango razonable.
    const tiempoPregunta = Math.max(0, Math.min(3600, Math.round(Number(r.tiempo_segundos) || 0)));
    return {
      question_id: r.question_id || null,
      orden: idx + 1,
      materia: q ? q.materia : (r.materia || materia || 'lectura_critica'),
      dificultad: q ? q.dificultad : (r.dificultad || dificultad || 'media'),
      competencia: q ? q.competencia : null,
      eje: q ? q.eje : null,
      respuesta_usuario: respuestaUsuario,
      correcta,
      tiempo_segundos: tiempoPregunta,
      // Datos de la pregunta para armar la retroalimentacion sin un segundo
      // round-trip; se toman siempre del banco (nunca de lo enviado por el
      // navegador), igual que la correccion.
      _pregunta: q || null
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

  const materiasTexto = Array.isArray(materias) && materias.length ? materias.join(',') : null;
  const infoSesion = await db.run(`
    INSERT INTO exam_sessions (user_id, tipo, materia, dificultad, competencia, eje, materias, num_preguntas, num_correctas, tiempo_segundos, nivel_estimado, fecha_fin)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `, [
    req.user.id, tipo, materia || null, dificultad || null, competencia || null, eje || null, materiasTexto,
    respuestasNormalizadas.length, numCorrectas, tiempo, nivelEstimado
  ]);

  const sessionId = infoSesion.lastInsertRowid;
  const statements = respuestasNormalizadas.map((a) => ({
    sql: `INSERT INTO exam_answers (session_id, question_id, orden, materia, dificultad, competencia, eje, respuesta_usuario, correcta, tiempo_segundos) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [sessionId, a.question_id, a.orden, a.materia, a.dificultad, a.competencia, a.eje, a.respuesta_usuario, a.correcta, a.tiempo_segundos]
  }));
  await db.batch(statements);

  const sesion = await db.get('SELECT * FROM exam_sessions WHERE id = ?', [sessionId]);
  const detalle = construirRetroalimentacion(respuestasNormalizadas);
  res.status(201).json({ sesion, detalle });
}));

// Construye, a partir de las respuestas ya calificadas, la retroalimentacion
// por pregunta (enunciado, respuesta del estudiante, respuesta correcta,
// explicacion y tiempo empleado) y un resumen de que competencias/ejes
// conviene reforzar (aquellos con mayor proporcion de respuestas incorrectas).
function construirRetroalimentacion(respuestasNormalizadas) {
  const preguntas = respuestasNormalizadas.map((a) => ({
    orden: a.orden,
    materia: a.materia,
    dificultad: a.dificultad,
    competencia: a.competencia,
    eje: a.eje,
    correcta: !!a.correcta,
    tiempo_segundos: a.tiempo_segundos,
    respuesta_usuario: a.respuesta_usuario,
    enunciado: a._pregunta ? a._pregunta.enunciado : null,
    texto_base: a._pregunta ? a._pregunta.texto_base : null,
    opciones: a._pregunta ? {
      a: a._pregunta.opcion_a, b: a._pregunta.opcion_b, c: a._pregunta.opcion_c, d: a._pregunta.opcion_d
    } : null,
    respuesta_correcta: a._pregunta ? a._pregunta.respuesta_correcta : null,
    explicacion: a._pregunta ? a._pregunta.explicacion : null
  }));

  const agrupar = (campo) => {
    const grupos = new Map();
    for (const a of respuestasNormalizadas) {
      const clave = a[campo];
      if (!clave) continue;
      if (!grupos.has(clave)) grupos.set(clave, { clave, total: 0, correctas: 0 });
      const g = grupos.get(clave);
      g.total += 1;
      if (a.correcta) g.correctas += 1;
    }
    return [...grupos.values()]
      .map((g) => ({ ...g, porcentaje: Math.round((g.correctas / g.total) * 100) }))
      .sort((x, y) => x.porcentaje - y.porcentaje);
  };

  const porCompetencia = agrupar('competencia');
  const porEje = agrupar('eje');
  const aMejorar = [...porCompetencia, ...porEje]
    .filter((g) => g.porcentaje < 70)
    .map((g) => g.clave);

  return { preguntas, porCompetencia, porEje, aMejorar };
}

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

// Retroalimentacion detallada de una sesion propia ya finalizada (para
// revisarla despues, no solo justo al terminarla).
router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const sesion = await db.get('SELECT * FROM exam_sessions WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!sesion) return res.status(404).json({ error: 'Sesion no encontrada.' });

  const respuestas = await db.all(`
    SELECT ea.orden, ea.materia, ea.dificultad, ea.competencia, ea.eje, ea.correcta, ea.tiempo_segundos,
           ea.respuesta_usuario, q.enunciado, q.texto_base, q.opcion_a, q.opcion_b, q.opcion_c, q.opcion_d,
           q.respuesta_correcta, q.explicacion
    FROM exam_answers ea LEFT JOIN questions q ON q.id = ea.question_id
    WHERE ea.session_id = ? ORDER BY ea.orden ASC
  `, [sesion.id]);

  const respuestasNormalizadas = respuestas.map((r) => ({
    orden: r.orden, materia: r.materia, dificultad: r.dificultad, competencia: r.competencia, eje: r.eje,
    correcta: r.correcta, tiempo_segundos: r.tiempo_segundos, respuesta_usuario: r.respuesta_usuario,
    _pregunta: { enunciado: r.enunciado, texto_base: r.texto_base, opcion_a: r.opcion_a, opcion_b: r.opcion_b,
      opcion_c: r.opcion_c, opcion_d: r.opcion_d, respuesta_correcta: r.respuesta_correcta, explicacion: r.explicacion }
  }));

  const detalle = construirRetroalimentacion(respuestasNormalizadas);
  res.json({ sesion, detalle });
}));

module.exports = router;
