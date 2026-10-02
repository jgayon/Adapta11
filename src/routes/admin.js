const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { resumenEstudiante, resumenParaUsuarios } = require('../lib/estadisticas');
const { enviarConfirmacionProfesorConToken } = require('../lib/correo');

const DIAS_EXPIRA_CONFIRMACION = 7;

const router = express.Router();

function validEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Agrega, para un conjunto de estudiantes, sus estadisticas de sesiones
// (numero de sesiones, preguntas, correctas y ultima actividad). Roble no
// tiene GROUP BY: se trae la tabla completa de sesiones una sola vez y el
// conteo se hace aqui.
async function conProgreso(estudiantes) {
  if (!estudiantes.length) return [];
  const todasLasSesiones = await db.leer('exam_sessions');
  const porUsuario = new Map();
  for (const s of todasLasSesiones) {
    if (!porUsuario.has(s.user_id)) porUsuario.set(s.user_id, { num_sesiones: 0, num_preguntas: 0, num_correctas: 0, ultima_actividad: null });
    const g = porUsuario.get(s.user_id);
    g.num_sesiones += 1;
    g.num_preguntas += s.num_preguntas || 0;
    g.num_correctas += s.num_correctas || 0;
    if (!g.ultima_actividad || String(s.fecha_inicio) > String(g.ultima_actividad)) g.ultima_actividad = s.fecha_inicio;
  }
  return estudiantes.map((u) => {
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
}

// El administrador de la plataforma crea las cuentas de administrador de
// colegio (profesor): no existe registro publico para este rol.
router.post('/profesores', requireAdmin, asyncHandler(async (req, res) => {
  const { nombre, apellidos, email, password, colegio_id } = req.body || {};
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre es obligatorio.' });
  if (!apellidos || !apellidos.trim()) return res.status(400).json({ error: 'Los apellidos son obligatorios.' });
  if (!validEmail(email)) return res.status(400).json({ error: 'Correo electronico invalido.' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'La contrasena debe tener al menos 6 caracteres.' });
  if (!colegio_id) return res.status(400).json({ error: 'Selecciona el colegio que administrara este profesor.' });

  const colegio = await db.porId('colegios', colegio_id);
  if (!colegio) return res.status(400).json({ error: 'El colegio seleccionado no existe.' });

  const emailNormalizado = email.toLowerCase().trim();
  const existingRows = await db.leer('users', { email: emailNormalizado });
  if (existingRows.length) return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });

  const hash = bcrypt.hashSync(password, 10);
  const confirmacionToken = crypto.randomBytes(32).toString('hex');
  const confirmacionExpira = new Date(Date.now() + DIAS_EXPIRA_CONFIRMACION * 24 * 60 * 60 * 1000).toISOString();

  const profesor = await db.crear('users', {
    nombre: nombre.trim(),
    apellidos: apellidos.trim(),
    email: emailNormalizado,
    password_hash: hash,
    role: 'profesor',
    colegio_id,
    // El profesor no puede iniciar sesion hasta que confirme el correo (ver
    // POST /auth/login y GET /auth/confirmar en routes/auth.js).
    email_confirmado: false,
    confirmacion_token: confirmacionToken,
    confirmacion_expira: confirmacionExpira
  });

  let correoEnviado = true;
  let correoError = null;
  try {
    await enviarConfirmacionProfesorConToken({
      to: profesor.email,
      nombre: profesor.nombre,
      token: confirmacionToken
    });
  } catch (err) {
    // La cuenta ya quedo creada (sin esto, un error de correo tumbaria la
    // creacion entera y el admin tendria que reintentar todo el formulario).
    // Se informa en la respuesta para que el admin sepa que debe reenviar o
    // confirmar manualmente, y se deja registro en el log del servidor.
    console.error('[admin] No se pudo enviar el correo de confirmacion al profesor', profesor.email, err);
    correoEnviado = false;
    correoError = err.message;
  }

  res.status(201).json({
    profesor: { ...profesor, colegio_nombre: colegio.nombre },
    correoEnviado,
    correoError
  });
}));

// Reenvia el correo de confirmacion (por si el profesor lo perdio, lo borro
// o el primero fallo al enviarse) y renueva el token/la expiracion.
router.post('/profesores/:id/reenviar-confirmacion', requireAdmin, asyncHandler(async (req, res) => {
  const profesor = await db.porId('users', req.params.id);
  if (!profesor || profesor.role !== 'profesor') {
    return res.status(404).json({ error: 'Profesor no encontrado.' });
  }
  if (profesor.email_confirmado) {
    return res.status(400).json({ error: 'Este profesor ya confirmo su correo.' });
  }

  const confirmacionToken = crypto.randomBytes(32).toString('hex');
  const confirmacionExpira = new Date(Date.now() + DIAS_EXPIRA_CONFIRMACION * 24 * 60 * 60 * 1000).toISOString();
  await db.actualizar('users', profesor.id, {
    confirmacion_token: confirmacionToken,
    confirmacion_expira: confirmacionExpira
  });

  await enviarConfirmacionProfesorConToken({ to: profesor.email, nombre: profesor.nombre, token: confirmacionToken });
  res.json({ ok: true });
}));

// Lista de profesores (administradores de colegio) ya creados, con el nombre
// de su colegio, para el panel de administracion.
router.get('/profesores', requireAdmin, asyncHandler(async (req, res) => {
  const [profesores, colegios] = await Promise.all([
    db.leer('users', { role: 'profesor' }),
    db.leer('colegios')
  ]);
  const colegiosPorId = new Map(colegios.map((c) => [c.id, c]));
  const resultado = profesores
    .map((u) => ({
      id: u.id, nombre: u.nombre, apellidos: u.apellidos, email: u.email,
      colegio_id: u.colegio_id, created_at: u.created_at,
      colegio_nombre: (colegiosPorId.get(u.colegio_id) || {}).nombre || null,
      // Si es undefined (cuentas creadas antes de este cambio, antes de que
      // la columna existiera) se trata como ya confirmado.
      email_confirmado: u.email_confirmado !== false
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  res.json({ profesores: resultado });
}));

// Lista de estudiantes con progreso agregado (no solo el numero de
// estudiantes: nombre, correo y sus estadisticas). El administrador ve todos
// los colegios; puede filtrar opcionalmente por uno solo con ?colegio_id=.
router.get('/students', requireAdmin, asyncHandler(async (req, res) => {
  const colegioId = req.query.colegio_id || null;
  const filtros = colegioId ? { role: 'estudiante', colegio_id: colegioId } : { role: 'estudiante' };
  const estudiantes = await db.leer('users', filtros);
  estudiantes.sort((a, b) => a.nombre.localeCompare(b.nombre));
  const resultado = await conProgreso(estudiantes);
  res.json({ estudiantes: resultado });
}));

// Sesiones de un estudiante especifico, filtradas por tipo (practica o
// simulacro), para el detalle que ve el administrador.
router.get('/students/:id/sessions', requireAdmin, asyncHandler(async (req, res) => {
  const { tipo } = req.query;
  if (!['practica', 'simulacro'].includes(tipo)) {
    return res.status(400).json({ error: 'Indica un tipo de sesion valido (practica o simulacro).' });
  }
  const estudiante = await db.porId('users', req.params.id);
  if (!estudiante || estudiante.role !== 'estudiante') {
    return res.status(404).json({ error: 'Estudiante no encontrado.' });
  }

  const sesiones = await db.leer('exam_sessions', { user_id: req.params.id, tipo });
  sesiones.sort((a, b) => String(b.fecha_inicio).localeCompare(String(a.fecha_inicio)));
  res.json({ estudiante, sesiones });
}));

// Estadisticas globales de un estudiante (todas las sesiones, desglose por
// materia/competencia/eje, tiempos promedio por respuesta y evolucion
// sesion a sesion). El calculo vive en lib/estadisticas.js porque es el
// mismo que usan el estudiante para su propio progreso y el profesor para
// sus estudiantes: aqui solo se valida que el estudiante exista.
router.get('/students/:id/summary', requireAdmin, asyncHandler(async (req, res) => {
  const estudiante = await db.porId('users', req.params.id);
  if (!estudiante || estudiante.role !== 'estudiante') {
    return res.status(404).json({ error: 'Estudiante no encontrado.' });
  }

  const data = await resumenEstudiante(estudiante.id);
  res.json({ estudiante, ...data });
}));

// Resumen de toda la plataforma (todos los colegios) mas una comparativa
// entre colegios, para que el administrador vea de un vistazo cual
// necesita mas apoyo, igual que el profesor lo ve entre sus estudiantes.
router.get('/resumen', requireAdmin, asyncHandler(async (req, res) => {
  const [estudiantes, colegios] = await Promise.all([
    db.leer('users', { role: 'estudiante' }),
    db.leer('colegios')
  ]);
  colegios.sort((a, b) => a.nombre.localeCompare(b.nombre));
  if (!estudiantes.length) {
    return res.json({
      resumen: { total_estudiantes: 0, total_colegios: colegios.length, num_sesiones: 0, num_practicas: 0, num_simulacros: 0, num_preguntas: 0, num_correctas: 0, porcentaje_aciertos: 0, por_materia: [], por_competencia: [], por_eje: [], tiempos: { promedio_general: null, promedio_correcta: null, promedio_incorrecta: null } },
      comparativa_colegios: []
    });
  }

  const [data, todasLasSesiones] = await Promise.all([
    resumenParaUsuarios(estudiantes.map((e) => e.id)),
    db.leer('exam_sessions')
  ]);

  const comparativaColegios = [];
  for (const c of colegios) {
    const idsColegio = new Set(estudiantes.filter((e) => e.colegio_id === c.id).map((e) => e.id));
    if (!idsColegio.size) continue;
    const sesionesColegio = todasLasSesiones.filter((s) => idsColegio.has(s.user_id));
    const numPreg = sesionesColegio.reduce((a, s) => a + (s.num_preguntas || 0), 0);
    const numCorr = sesionesColegio.reduce((a, s) => a + (s.num_correctas || 0), 0);
    comparativaColegios.push({
      colegio_id: c.id,
      colegio_nombre: c.nombre,
      num_estudiantes: idsColegio.size,
      num_sesiones: sesionesColegio.length,
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
