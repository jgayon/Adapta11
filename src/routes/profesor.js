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
    ? await db.leer('users', { role: 'estudiante', colegio_id: colegioId })
    : [];
  estudiantes.sort((a, b) => a.nombre.localeCompare(b.nombre));
  if (!estudiantes.length) return res.json({ estudiantes: [] });

  // Roble no tiene GROUP BY: se trae la tabla completa de sesiones una sola
  // vez y el conteo por estudiante se hace aqui.
  const idsEstudiantes = new Set(estudiantes.map((e) => e.id));
  const todasLasSesiones = await db.leer('exam_sessions');
  const porUsuario = new Map();
  for (const s of todasLasSesiones) {
    if (!idsEstudiantes.has(s.user_id)) continue;
    if (!porUsuario.has(s.user_id)) porUsuario.set(s.user_id, { num_sesiones: 0, num_preguntas: 0, num_correctas: 0, ultima_actividad: null });
    const g = porUsuario.get(s.user_id);
    g.num_sesiones += 1;
    g.num_preguntas += s.num_preguntas || 0;
    g.num_correctas += s.num_correctas || 0;
    if (!g.ultima_actividad || String(s.fecha_inicio) > String(g.ultima_actividad)) g.ultima_actividad = s.fecha_inicio;
  }

  const resultado = estudiantes.map(u => {
    const stats = porUsuario.get(u.id);
    const totalPreg = stats ? stats.num_preguntas : 0;
    const totalCorr = stats ? stats.num_correctas : 0;
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
  const estudiante = await db.porId('users', req.params.id);
  if (!estudiante || estudiante.role !== 'estudiante' || estudiante.colegio_id !== req.user.colegio_id) {
    return res.status(404).json({ error: 'Estudiante no encontrado en tu colegio.' });
  }

  const sesiones = await db.leer('exam_sessions', { user_id: req.params.id, tipo });
  sesiones.sort((a, b) => String(b.fecha_inicio).localeCompare(String(a.fecha_inicio)));
  res.json({ estudiante, sesiones });
}));

router.get('/students/:id/summary', requireProfesor, asyncHandler(async (req, res) => {
  const estudiante = await db.porId('users', req.params.id);
  if (!estudiante || estudiante.role !== 'estudiante' || estudiante.colegio_id !== req.user.colegio_id) {
    return res.status(404).json({ error: 'Estudiante no encontrado en tu colegio.' });
  }

  const data = await resumenEstudiante(estudiante.id);
  res.json({ estudiante, ...data });
}));

// Resumen del colegio completo + comparativa entre sus estudiantes (para que
// el profesor vea de un vistazo quien necesita mas apoyo).
router.get('/resumen', requireProfesor, asyncHandler(async (req, res) => {
  const colegioId = req.user.colegio_id;
  if (!colegioId) return res.json({ resumen: null, comparativa: [] });

  const estudiantes = await db.leer('users', { role: 'estudiante', colegio_id: colegioId });
  if (!estudiantes.length) return res.json({ resumen: null, comparativa: [] });
  const ids = estudiantes.map(e => e.id);

  // El desglose por materia/competencia/eje, los tiempos promedio por
  // respuesta y la evolucion sesion a sesion salen del mismo calculo que
  // usa el estudiante para su propio progreso (lib/estadisticas.js), asi
  // que aqui solo queda armar la comparativa entre estudiantes del colegio.
  const [data, todasLasSesiones] = await Promise.all([
    resumenParaUsuarios(ids),
    db.leer('exam_sessions')
  ]);

  const idsSet = new Set(ids);
  const porEstudiante = new Map();
  for (const s of todasLasSesiones) {
    if (!idsSet.has(s.user_id)) continue;
    if (!porEstudiante.has(s.user_id)) porEstudiante.set(s.user_id, { num_sesiones: 0, num_preguntas: 0, num_correctas: 0 });
    const g = porEstudiante.get(s.user_id);
    g.num_sesiones += 1;
    g.num_preguntas += s.num_preguntas || 0;
    g.num_correctas += s.num_correctas || 0;
  }

  const comparativa = estudiantes
    .map((u) => {
      const g = porEstudiante.get(u.id) || { num_sesiones: 0, num_preguntas: 0, num_correctas: 0 };
      return {
        id: u.id,
        nombre: u.nombre,
        apellidos: u.apellidos,
        num_sesiones: g.num_sesiones,
        num_preguntas: g.num_preguntas,
        num_correctas: g.num_correctas,
        porcentaje_aciertos: g.num_preguntas ? Math.round((g.num_correctas / g.num_preguntas) * 100) : 0
      };
    })
    .sort((a, b) => b.porcentaje_aciertos - a.porcentaje_aciertos);

  res.json({
    resumen: { ...data.resumen, total_estudiantes: estudiantes.length },
    comparativa,
    evolucion: data.evolucion
  });
}));

module.exports = router;
