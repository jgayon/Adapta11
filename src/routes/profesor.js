const express = require('express');
const db = require('../db');
const { requireProfesor } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { resumenEstudiante, resumenParaUsuarios } = require('../lib/estadisticas');

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

  const data = await resumenEstudiante(estudiante.id);
  res.json({ estudiante, ...data });
}));

// Resumen del colegio completo + comparativa entre sus estudiantes (para que
// el profesor vea de un vistazo quien necesita mas apoyo).
router.get('/resumen', requireProfesor, asyncHandler(async (req, res) => {
  const colegioId = req.user.colegio_id;
  if (!colegioId) return res.json({ resumen: null, comparativa: [] });

  const estudiantes = await db.all(`SELECT id FROM users WHERE role = 'estudiante' AND colegio_id = ?`, [colegioId]);
  if (!estudiantes.length) return res.json({ resumen: null, comparativa: [] });
  const ids = estudiantes.map(e => e.id);

  // El desglose por materia/competencia/eje, los tiempos promedio por
  // respuesta y la evolucion sesion a sesion salen del mismo calculo que
  // usa el estudiante para su propio progreso (lib/estadisticas.js), asi
  // que aqui solo queda armar la comparativa entre estudiantes del colegio.
  const data = await resumenParaUsuarios(ids);

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

  res.json({
    resumen: { ...data.resumen, total_estudiantes: estudiantes.length },
    comparativa,
    evolucion: data.evolucion
  });
}));

module.exports = router;
