const express = require('express');
const db = require('../db');
const { requireAdmin, requireAuth } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');

const router = express.Router();

const MATERIAS = ['lectura_critica', 'matematicas'];
const DIFICULTADES = ['facil', 'media', 'dificil'];
const LETRAS = ['a', 'b', 'c', 'd'];

function validarPregunta(body) {
  const errores = [];
  const materia = MATERIAS.includes(body.materia) ? body.materia : null;
  const dificultad = DIFICULTADES.includes(body.dificultad) ? body.dificultad : null;
  const correcta = LETRAS.includes((body.respuesta_correcta || '').toLowerCase())
    ? body.respuesta_correcta.toLowerCase() : null;

  if (!materia) errores.push('Selecciona una materia valida.');
  if (!dificultad) errores.push('Selecciona una dificultad valida.');
  if (!body.enunciado || !String(body.enunciado).trim()) errores.push('El enunciado es obligatorio.');
  for (const l of LETRAS) {
    if (!body['opcion_' + l] || !String(body['opcion_' + l]).trim()) {
      errores.push('La opcion ' + l.toUpperCase() + ' es obligatoria.');
    }
  }
  if (!correcta) errores.push('Selecciona cual opcion es la respuesta correcta.');

  return {
    errores,
    normalizado: {
      materia,
      dificultad,
      texto_base: body.texto_base ? String(body.texto_base).trim() : null,
      enunciado: body.enunciado ? String(body.enunciado).trim() : '',
      opcion_a: String(body.opcion_a || '').trim(),
      opcion_b: String(body.opcion_b || '').trim(),
      opcion_c: String(body.opcion_c || '').trim(),
      opcion_d: String(body.opcion_d || '').trim(),
      respuesta_correcta: correcta,
      explicacion: body.explicacion ? String(body.explicacion).trim() : null,
      imagen: body.imagen ? String(body.imagen) : null
    }
  };
}

/* ---------- Rutas para estudiantes (deben ir antes de /:id) ---------- */

// Tanda de preguntas para el modo Practicar.
router.get('/practice', requireAuth, asyncHandler(async (req, res) => {
  const { materia, dificultad } = req.query;
  const count = Math.min(Math.max(Number(req.query.count) || 5, 1), 20);
  if (!MATERIAS.includes(materia) || !DIFICULTADES.includes(dificultad)) {
    return res.status(400).json({ error: 'Materia o dificultad invalida.' });
  }
  const rows = await db.all(
    `SELECT * FROM questions WHERE activo = 1 AND materia = ? AND dificultad = ? ORDER BY RANDOM() LIMIT ?`,
    [materia, dificultad, count]
  );
  res.json({ preguntas: rows });
}));

// Conjunto mixto de preguntas para el Simulacro (navegacion libre entre
// Lectura Critica y Matematicas, ver seccion de preguntas por planilla).
router.get('/simulacro-pool', requireAuth, asyncHandler(async (req, res) => {
  const porMateria = Math.min(Math.max(Number(req.query.porMateria) || 6, 2), 15);
  const preguntas = [];
  for (const materia of MATERIAS) {
    // Mezcla de dificultades: aproximadamente un tercio de cada nivel.
    const porNivel = Math.max(1, Math.round(porMateria / 3));
    for (const dificultad of DIFICULTADES) {
      const rows = await db.all(
        `SELECT * FROM questions WHERE activo = 1 AND materia = ? AND dificultad = ? ORDER BY RANDOM() LIMIT ?`,
        [materia, dificultad, porNivel]
      );
      preguntas.push(...rows);
    }
  }
  res.json({ preguntas });
}));

/* ---------- Rutas de administrador ---------- */

router.get('/', requireAdmin, asyncHandler(async (req, res) => {
  const { materia, dificultad } = req.query;
  const condiciones = ['activo = 1'];
  const params = [];
  if (MATERIAS.includes(materia)) { condiciones.push('materia = ?'); params.push(materia); }
  if (DIFICULTADES.includes(dificultad)) { condiciones.push('dificultad = ?'); params.push(dificultad); }
  const rows = await db.all(
    `SELECT * FROM questions WHERE ${condiciones.join(' AND ')} ORDER BY id DESC`,
    params
  );
  res.json({ preguntas: rows });
}));

router.get('/:id', requireAdmin, asyncHandler(async (req, res) => {
  const pregunta = await db.get('SELECT * FROM questions WHERE id = ?', [req.params.id]);
  if (!pregunta) return res.status(404).json({ error: 'Pregunta no encontrada.' });
  res.json({ pregunta });
}));

router.post('/', requireAdmin, asyncHandler(async (req, res) => {
  const { errores, normalizado } = validarPregunta(req.body || {});
  if (errores.length) return res.status(400).json({ error: errores.join(' ') });

  const info = await db.run(`
    INSERT INTO questions
      (materia, dificultad, texto_base, enunciado, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, explicacion, imagen, activo, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `, [
    normalizado.materia, normalizado.dificultad, normalizado.texto_base, normalizado.enunciado,
    normalizado.opcion_a, normalizado.opcion_b, normalizado.opcion_c, normalizado.opcion_d,
    normalizado.respuesta_correcta, normalizado.explicacion, normalizado.imagen, req.user.id
  ]);

  const pregunta = await db.get('SELECT * FROM questions WHERE id = ?', [info.lastInsertRowid]);
  res.status(201).json({ pregunta });
}));

router.put('/:id', requireAdmin, asyncHandler(async (req, res) => {
  const existente = await db.get('SELECT * FROM questions WHERE id = ?', [req.params.id]);
  if (!existente) return res.status(404).json({ error: 'Pregunta no encontrada.' });

  const { errores, normalizado } = validarPregunta(req.body || {});
  if (errores.length) return res.status(400).json({ error: errores.join(' ') });

  await db.run(`
    UPDATE questions SET materia=?, dificultad=?, texto_base=?, enunciado=?, opcion_a=?, opcion_b=?,
      opcion_c=?, opcion_d=?, respuesta_correcta=?, explicacion=?, imagen=?
    WHERE id=?
  `, [
    normalizado.materia, normalizado.dificultad, normalizado.texto_base, normalizado.enunciado,
    normalizado.opcion_a, normalizado.opcion_b, normalizado.opcion_c, normalizado.opcion_d,
    normalizado.respuesta_correcta, normalizado.explicacion, normalizado.imagen, req.params.id
  ]);

  const pregunta = await db.get('SELECT * FROM questions WHERE id = ?', [req.params.id]);
  res.json({ pregunta });
}));

// Baja logica: no se borra fisicamente porque puede haber respuestas de
// estudiantes que ya la referencian (exam_answers.question_id).
router.delete('/:id', requireAdmin, asyncHandler(async (req, res) => {
  const info = await db.run('UPDATE questions SET activo = 0 WHERE id = ?', [req.params.id]);
  if (info.changes === 0) return res.status(404).json({ error: 'Pregunta no encontrada.' });
  res.json({ ok: true });
}));

module.exports = router;
