const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');

const router = express.Router();

// Lista de estudiantes con progreso agregado (no solo el numero de
// estudiantes: nombre, correo y sus estadisticas).
router.get('/students', requireAdmin, asyncHandler(async (req, res) => {
  const estudiantes = await db.all(
    `SELECT id, nombre, apellidos, email, created_at FROM users WHERE role = 'estudiante' ORDER BY nombre`
  );
  const rows = await db.all(`
    SELECT user_id,
           COUNT(*) as num_sesiones,
           SUM(num_preguntas) as num_preguntas,
           SUM(num_correctas) as num_correctas,
           MAX(fecha_inicio) as ultima_actividad
    FROM exam_sessions
    GROUP BY user_id
  `);
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

// Sesiones de un estudiante especifico, filtradas por tipo (practica o
// simulacro), para el detalle que ve el administrador.
router.get('/students/:id/sessions', requireAdmin, asyncHandler(async (req, res) => {
  const { tipo } = req.query;
  if (!['practica', 'simulacro'].includes(tipo)) {
    return res.status(400).json({ error: 'Indica un tipo de sesion valido (practica o simulacro).' });
  }
  const estudiante = await db.get(
    `SELECT id, nombre, apellidos, email FROM users WHERE id = ? AND role = 'estudiante'`,
    [req.params.id]
  );
  if (!estudiante) return res.status(404).json({ error: 'Estudiante no encontrado.' });

  const sesiones = await db.all(
    `SELECT * FROM exam_sessions WHERE user_id = ? AND tipo = ? ORDER BY fecha_inicio DESC`,
    [req.params.id, tipo]
  );
  res.json({ estudiante, sesiones });
}));

// Estadisticas globales de un estudiante (todas las sesiones, desglose por
// materia y por tipo de sesion).
router.get('/students/:id/summary', requireAdmin, asyncHandler(async (req, res) => {
  const estudiante = await db.get(
    `SELECT id, nombre, apellidos, email, created_at FROM users WHERE id = ? AND role = 'estudiante'`,
    [req.params.id]
  );
  if (!estudiante) return res.status(404).json({ error: 'Estudiante no encontrado.' });

  const sesiones = await db.all(
    `SELECT * FROM exam_sessions WHERE user_id = ? ORDER BY fecha_inicio DESC`,
    [req.params.id]
  );
  const porMateria = await db.all(`
    SELECT materia, COUNT(*) as total, SUM(correcta) as correctas
    FROM exam_answers
    WHERE session_id IN (SELECT id FROM exam_sessions WHERE user_id = ?)
    GROUP BY materia
  `, [req.params.id]);

  const totalPreg = sesiones.reduce((a, s) => a + (s.num_preguntas || 0), 0);
  const totalCorr = sesiones.reduce((a, s) => a + (s.num_correctas || 0), 0);
  const practicaCount = sesiones.filter(s => s.tipo === 'practica').length;
  const simulacroCount = sesiones.filter(s => s.tipo === 'simulacro').length;

  res.json({
    estudiante,
    resumen: {
      num_sesiones: sesiones.length,
      num_practicas: practicaCount,
      num_simulacros: simulacroCount,
      num_preguntas: totalPreg,
      num_correctas: totalCorr,
      porcentaje_aciertos: totalPreg ? Math.round((totalCorr / totalPreg) * 100) : 0,
      por_materia: porMateria.map(m => ({
        materia: m.materia,
        total: m.total,
        correctas: m.correctas || 0,
        porcentaje: m.total ? Math.round(((m.correctas || 0) / m.total) * 100) : 0
      }))
    },
    sesiones_recientes: sesiones.slice(0, 10)
  });
}));

module.exports = router;
