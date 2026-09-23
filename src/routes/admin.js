const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { resumenEstudiante, resumenParaUsuarios } = require('../lib/estadisticas');

const router = express.Router();

function validEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// El administrador de la plataforma crea las cuentas de administrador de
// colegio (profesor): no existe registro publico para este rol.
router.post('/profesores', requireAdmin, asyncHandler(async (req, res) => {
  const { nombre, apellidos, email, password, colegio_id } = req.body || {};
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre es obligatorio.' });
  if (!apellidos || !apellidos.trim()) return res.status(400).json({ error: 'Los apellidos son obligatorios.' });
  if (!validEmail(email)) return res.status(400).json({ error: 'Correo electronico invalido.' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'La contrasena debe tener al menos 6 caracteres.' });
  const colegioIdNum = Number(colegio_id);
  if (!colegioIdNum) return res.status(400).json({ error: 'Selecciona el colegio que administrara este profesor.' });

  const colegio = await db.get('SELECT id, nombre FROM colegios WHERE id = ?', [colegioIdNum]);
  if (!colegio) return res.status(400).json({ error: 'El colegio seleccionado no existe.' });

  const existing = await db.get('SELECT id FROM users WHERE email = ?', [email.toLowerCase().trim()]);
  if (existing) return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });

  const hash = bcrypt.hashSync(password, 10);
  const info = await db.run(
    'INSERT INTO users (nombre, apellidos, email, password_hash, role, colegio_id) VALUES (?, ?, ?, ?, ?, ?)',
    [nombre.trim(), apellidos.trim(), email.toLowerCase().trim(), hash, 'profesor', colegioIdNum]
  );
  const profesor = await db.get(
    'SELECT id, nombre, apellidos, email, colegio_id, created_at FROM users WHERE id = ?',
    [info.lastInsertRowid]
  );
  res.status(201).json({ profesor: { ...profesor, colegio_nombre: colegio.nombre } });
}));

// Lista de profesores (administradores de colegio) ya creados, con el nombre
// de su colegio, para el panel de administracion.
router.get('/profesores', requireAdmin, asyncHandler(async (req, res) => {
  const profesores = await db.all(`
    SELECT u.id, u.nombre, u.apellidos, u.email, u.colegio_id, u.created_at, c.nombre as colegio_nombre
    FROM users u LEFT JOIN colegios c ON c.id = u.colegio_id
    WHERE u.role = 'profesor' ORDER BY u.nombre
  `);
  res.json({ profesores });
}));

// Lista de estudiantes con progreso agregado (no solo el numero de
// estudiantes: nombre, correo y sus estadisticas). El administrador ve todos
// los colegios; puede filtrar opcionalmente por uno solo con ?colegio_id=.
router.get('/students', requireAdmin, asyncHandler(async (req, res) => {
  const colegioId = Number(req.query.colegio_id) || null;
  const estudiantes = colegioId
    ? await db.all(
      `SELECT id, nombre, apellidos, email, created_at FROM users WHERE role = 'estudiante' AND colegio_id = ? ORDER BY nombre`,
      [colegioId]
    )
    : await db.all(
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
// materia/competencia/eje, tiempos promedio por respuesta y evolucion
// sesion a sesion). El calculo vive en lib/estadisticas.js porque es el
// mismo que usan el estudiante para su propio progreso y el profesor para
// sus estudiantes: aqui solo se valida que el estudiante exista.
router.get('/students/:id/summary', requireAdmin, asyncHandler(async (req, res) => {
  const estudiante = await db.get(
    `SELECT id, nombre, apellidos, email, created_at FROM users WHERE id = ? AND role = 'estudiante'`,
    [req.params.id]
  );
  if (!estudiante) return res.status(404).json({ error: 'Estudiante no encontrado.' });

  const data = await resumenEstudiante(estudiante.id);
  res.json({ estudiante, ...data });
}));

// Resumen de toda la plataforma (todos los colegios) mas una comparativa
// entre colegios, para que el administrador vea de un vistazo cual
// necesita mas apoyo, igual que el profesor lo ve entre sus estudiantes.
router.get('/resumen', requireAdmin, asyncHandler(async (req, res) => {
  const estudiantes = await db.all(`SELECT id, colegio_id FROM users WHERE role = 'estudiante'`);
  const colegios = await db.all(`SELECT id, nombre FROM colegios ORDER BY nombre`);
  if (!estudiantes.length) {
    return res.json({
      resumen: { total_estudiantes: 0, total_colegios: colegios.length, num_sesiones: 0, num_practicas: 0, num_simulacros: 0, num_preguntas: 0, num_correctas: 0, porcentaje_aciertos: 0, por_materia: [], por_competencia: [], por_eje: [], tiempos: { promedio_general: null, promedio_correcta: null, promedio_incorrecta: null } },
      comparativa_colegios: []
    });
  }

  const data = await resumenParaUsuarios(estudiantes.map((e) => e.id));

  const comparativaColegios = [];
  for (const c of colegios) {
    const idsColegio = estudiantes.filter((e) => e.colegio_id === c.id).map((e) => e.id);
    if (!idsColegio.length) continue;
    const placeholders = idsColegio.map(() => '?').join(',');
    const fila = await db.get(`
      SELECT COUNT(*) as num_sesiones,
             COALESCE(SUM(num_preguntas), 0) as num_preguntas,
             COALESCE(SUM(num_correctas), 0) as num_correctas
      FROM exam_sessions WHERE user_id IN (${placeholders})
    `, idsColegio);
    const numPreg = fila ? (fila.num_preguntas || 0) : 0;
    const numCorr = fila ? (fila.num_correctas || 0) : 0;
    comparativaColegios.push({
      colegio_id: c.id,
      colegio_nombre: c.nombre,
      num_estudiantes: idsColegio.length,
      num_sesiones: fila ? fila.num_sesiones : 0,
      num_preguntas: numPreg,
      num_correctas: numCorr,
      porcentaje_aciertos: numPreg ? Math.round((numCorr / numPreg) * 100) : 0
    });
  }
  comparativaColegios.sort((a, b) => b.porcentaje_aciertos - a.porcentaje_aciertos);

  res.json({
    resumen: { ...data.resumen, total_estudiantes: estudiantes.length, total_colegios: colegios.length },
    comparativa_colegios: comparativaColegios,
    evolucion: data.evolucion
  });
}));

module.exports = router;
