const express = require('express');
const db = require('../db');
const { requireProfesor } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');

const router = express.Router();

// Todas las rutas de este archivo estan restringidas al colegio del profesor
// que inicio sesion (req.user.colegio_id, incluido en el JWT): un profesor
// nunca puede ver estudiantes ni estadisticas de otro colegio.

router.get('/students', requireProfesor, asyncHandler(async (req, res) => {
  const colegioId = req.user.colegio_id;
  const estudiantes = colegioId
    ? await db.all(
      `SELECT id, nombre, apellidos, email, created_at FROM users WHERE role = 'estudiante' AND colegio_id = ? ORDER BY nombre`,
      [colegioId]
    )
    : [];
  if (!estudiantes.length) return res.json({ estudiantes: [] });

  const ids = estudiantes.map(e => e.id);
  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.all(`
    SELECT user_id,
           COUNT(*) as num_sesiones,
           SUM(num_preguntas) as num_preguntas,
           SUM(num_correctas) as num_correctas,
           MAX(fecha_inicio) as ultima_actividad
    FROM exam_sessions
    WHERE user_id IN (${placeholders})
    GROUP BY user_id
  `, ids);
  const porUsuario = new Map(rows.map(r => [r.user_id, r]));

  const resultado = estudiantes.map(u => {
    const stats = porUsuario.get(u.id);
    const totalPreg = stats ? (stats.num_preguntas || 0) : 0;
    const totalCorr = stats ? (stats.num_correctas || 0) : 0;
    return {
      id: u.id,
      nombre: u.nombre,
      apellidos: u.apellidos,
      email: u.email,
      created_at: u.created_at,
      num_sesiones: stats ? stats.num_sesiones : 0,
      num_preguntas: totalPreg,
      num_correctas: totalCorr,
      porcentaje_aciertos: totalPreg ? Math.round((totalCorr / totalPreg) * 100) : 0,
      ultima_actividad: stats ? stats.ultima_actividad : null
    };
  });

  res.json({ estudiantes: resultado });
}));

router.get('/students/:id/sessions', requireProfesor, asyncHandler(async (req, res) => {
  const { tipo } = req.query;
  if (!['practica', 'simulacro'].includes(tipo)) {
    return res.status(400).json({ error: 'Indica un tipo de sesion valido (practica o simulacro).' });
  }
  const estudiante = await db.get(
    `SELECT id, nombre, apellidos, email FROM users WHERE id = ? AND role = 'estudiante' AND colegio_id = ?`,
    [req.params.id, req.user.colegio_id]
  );
  if (!estudiante) return res.status(404).json({ error: 'Estudiante no encontrado en tu colegio.' });

  const sesiones = await db.all(
    `SELECT * FROM exam_sessions WHERE user_id = ? AND tipo = ? ORDER BY fecha_inicio DESC`,
    [req.params.id, tipo]
  );
  res.json({ estudiante, sesiones });
}));

router.get('/students/:id/summary', requireProfesor, asyncHandler(async (req, res) => {
  const estudiante = await db.get(
    `SELECT id, nombre, apellidos, email, created_at FROM users WHERE id = ? AND role = 'estudiante' AND colegio_id = ?`,
    [req.params.id, req.user.colegio_id]
  );
  if (!estudiante) return res.status(404).json({ error: 'Estudiante no encontrado en tu colegio.' });

  const sesiones = await db.all(
    `SELECT * FROM exam_sessions WHERE user_id = ? ORDER BY fecha_inicio DESC`,
    [req.params.id]
  );
  const porMateria = await db.all(`
    SELECT materia, COUNT(*) as total, SUM(correcta) as correctas
    FROM exam_answers WHERE session_id IN (SELECT id FROM exam_sessions WHERE user_id = ?) GROUP BY materia
  `, [req.params.id]);
  const porCompetencia = await db.all(`
    SELECT competencia, COUNT(*) as total, SUM(correcta) as correctas
    FROM exam_answers WHERE session_id IN (SELECT id FROM exam_sessions WHERE user_id = ?) AND competencia IS NOT NULL GROUP BY competencia
  `, [req.params.id]);
  const porEje = await db.all(`
    SELECT eje, COUNT(*) as total, SUM(correcta) as correctas
    FROM exam_answers WHERE session_id IN (SELECT id FROM exam_sessions WHERE user_id = ?) AND eje IS NOT NULL GROUP BY eje
  `, [req.params.id]);

  const totalPreg = sesiones.reduce((a, s) => a + (s.num_preguntas || 0), 0);
  const totalCorr = sesiones.reduce((a, s) => a + (s.num_correctas || 0), 0);
  const conDesglose = (rows, campo) => rows.map(r => ({
    [campo]: r[campo], total: r.total, correctas: r.correctas || 0,
    porcentaje: r.total ? Math.round(((r.correctas || 0) / r.total) * 100) : 0
  }));

  res.json({
    estudiante,
    resumen: {
      num_sesiones: sesiones.length,
      num_practicas: sesiones.filter(s => s.tipo === 'practica').length,
      num_simulacros: sesiones.filter(s => s.tipo === 'simulacro').length,
      num_preguntas: totalPreg,
      num_correctas: totalCorr,
      porcentaje_aciertos: totalPreg ? Math.round((totalCorr / totalPreg) * 100) : 0,
      por_materia: conDesglose(porMateria, 'materia'),
      por_competencia: conDesglose(porCompetencia, 'competencia'),
      por_eje: conDesglose(porEje, 'eje')
    },
    sesiones_recientes: sesiones.slice(0, 10)
  });
}));

// Resumen del colegio completo + comparativa entre sus estudiantes (para que
// el profesor vea de un vistazo quien necesita mas apoyo).
router.get('/resumen', requireProfesor, asyncHandler(async (req, res) => {
  const colegioId = req.user.colegio_id;
  if (!colegioId) return res.json({ resumen: null, comparativa: [] });

  const estudiantes = await db.all(`SELECT id FROM users WHERE role = 'estudiante' AND colegio_id = ?`, [colegioId]);
  if (!estudiantes.length) return res.json({ resumen: null, comparativa: [] });
  const ids = estudiantes.map(e => e.id);
  const placeholders = ids.map(() => '?').join(',');

  const porMateria = await db.all(`
    SELECT materia, COUNT(*) as total, SUM(correcta) as correctas
    FROM exam_answers WHERE session_id IN (SELECT id FROM exam_sessions WHERE user_id IN (${placeholders})) GROUP BY materia
  `, ids);
  const porCompetencia = await db.all(`
    SELECT competencia, COUNT(*) as total, SUM(correcta) as correctas
    FROM exam_answers WHERE session_id IN (SELECT id FROM exam_sessions WHERE user_id IN (${placeholders})) AND competencia IS NOT NULL GROUP BY competencia
  `, ids);
  const porEje = await db.all(`
    SELECT eje, COUNT(*) as total, SUM(correcta) as correctas
    FROM exam_answers WHERE session_id IN (SELECT id FROM exam_sessions WHERE user_id IN (${placeholders})) AND eje IS NOT NULL GROUP BY eje
  `, ids);
  const conDesglose = (rows, campo) => rows.map(r => ({
    [campo]: r[campo], total: r.total, correctas: r.correctas || 0,
    porcentaje: r.total ? Math.round(((r.correctas || 0) / r.total) * 100) : 0
  }));

  const comparativaRaw = await db.all(`
    SELECT u.id, u.nombre, u.apellidos,
      COUNT(es.id) as num_sesiones,
      COALESCE(SUM(es.num_preguntas), 0) as num_preguntas,
      COALESCE(SUM(es.num_correctas), 0) as num_correctas
    FROM users u LEFT JOIN exam_sessions es ON es.user_id = u.id
    WHERE u.role = 'estudiante' AND u.colegio_id = ?
    GROUP BY u.id ORDER BY u.nombre
  `, [colegioId]);
  const comparativa = comparativaRaw
    .map(c => ({
      ...c,
      porcentaje_aciertos: c.num_preguntas ? Math.round((c.num_correctas / c.num_preguntas) * 100) : 0
    }))
    .sort((a, b) => b.porcentaje_aciertos - a.porcentaje_aciertos);

  const totalPreg = comparativa.reduce((a, c) => a + c.num_preguntas, 0);
  const totalCorr = comparativa.reduce((a, c) => a + c.num_correctas, 0);

  res.json({
    resumen: {
      total_estudiantes: estudiantes.length,
      num_preguntas: totalPreg,
      num_correctas: totalCorr,
      porcentaje_aciertos: totalPreg ? Math.round((totalCorr / totalPreg) * 100) : 0,
      por_materia: conDesglose(porMateria, 'materia'),
      por_competencia: conDesglose(porCompetencia, 'competencia'),
      por_eje: conDesglose(porEje, 'eje')
    },
    comparativa
  });
}));

module.exports = router;
