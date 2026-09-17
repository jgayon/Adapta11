const express = require('express');
const db = require('../db');
const { requireAdmin, requireAuth } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');

const router = express.Router();

const MATERIAS = ['lectura_critica', 'matematicas'];
const DIFICULTADES = ['facil', 'media', 'dificil'];
const LETRAS = ['a', 'b', 'c', 'd'];

// Clasificacion oficial del Icfes (Marcos de referencia Saber 11, Icfes 2021 /
// 2019), usada en vez de facil/media/dificil como eje principal de
// organizacion del banco de preguntas. "dificultad" se conserva internamente
// solo para el calculo del nivel estimado del simulacro (ver sessions.js).
const COMPETENCIAS_POR_MATERIA = {
  lectura_critica: ['identifica_contenidos_locales', 'comprende_sentido_global', 'reflexiona_evalua_contenido'],
  matematicas: ['interpretacion_representacion', 'formulacion_ejecucion', 'argumentacion']
};
const EJES_POR_MATERIA = {
  lectura_critica: ['literario', 'informativo'],
  matematicas: ['algebra_calculo', 'geometria', 'estadistica']
};

function validarPregunta(body) {
  const errores = [];
  const materia = MATERIAS.includes(body.materia) ? body.materia : null;
  const dificultad = DIFICULTADES.includes(body.dificultad) ? body.dificultad : 'media';
  const competencia = materia && COMPETENCIAS_POR_MATERIA[materia].includes(body.competencia)
    ? body.competencia : null;
  const eje = materia && EJES_POR_MATERIA[materia].includes(body.eje) ? body.eje : null;
  const correcta = LETRAS.includes((body.respuesta_correcta || '').toLowerCase())
    ? body.respuesta_correcta.toLowerCase() : null;

  if (!materia) errores.push('Selecciona una materia valida.');
  if (materia && !competencia) errores.push('Selecciona una competencia valida para esa materia.');
  if (materia && !eje) errores.push('Selecciona un eje tematico valido para esa materia.');
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
      competencia,
      eje,
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

// Tanda de preguntas para el modo Practicar. Se filtra por materia y,
// opcionalmente, por competencia y/o eje tematico (clasificacion oficial del
// Icfes). Si no se indica competencia/eje, se toman preguntas de toda la
// materia.
router.get('/practice', requireAuth, asyncHandler(async (req, res) => {
  const { materia, competencia, eje } = req.query;
  const count = Math.min(Math.max(Number(req.query.count) || 5, 1), 20);
  if (!MATERIAS.includes(materia)) {
    return res.status(400).json({ error: 'Materia invalida.' });
  }
  const condiciones = ['activo = 1', 'materia = ?'];
  const params = [materia];
  if (COMPETENCIAS_POR_MATERIA[materia].includes(competencia)) {
    condiciones.push('competencia = ?');
    params.push(competencia);
  }
  if (EJES_POR_MATERIA[materia].includes(eje)) {
    condiciones.push('eje = ?');
    params.push(eje);
  }
  params.push(count);
  const rows = await db.all(
    `SELECT * FROM questions WHERE ${condiciones.join(' AND ')} ORDER BY RANDOM() LIMIT ?`,
    params
  );
  res.json({ preguntas: rows });
}));

// Conjunto de preguntas para el Simulacro. "materias" indica si el estudiante
// eligio presentar solo Lectura Critica, solo Matematicas o ambas (navegacion
// libre entre las materias seleccionadas).
router.get('/simulacro-pool', requireAuth, asyncHandler(async (req, res) => {
  const porMateria = Math.min(Math.max(Number(req.query.porMateria) || 6, 2), 15);
  const materiasSolicitadas = String(req.query.materias || '')
    .split(',').map((m) => m.trim()).filter((m) => MATERIAS.includes(m));
  const materias = materiasSolicitadas.length ? [...new Set(materiasSolicitadas)] : MATERIAS;

  const preguntas = [];
  for (const materia of materias) {
    // Mezcla de dificultades: aproximadamente un tercio de cada nivel (esto
    // solo calibra la mezcla interna de preguntas; no se muestra al usuario).
    const porNivel = Math.max(1, Math.round(porMateria / 3));
    for (const dificultad of DIFICULTADES) {
      const rows = await db.all(
        `SELECT * FROM questions WHERE activo = 1 AND materia = ? AND dificultad = ? ORDER BY RANDOM() LIMIT ?`,
        [materia, dificultad, porNivel]
      );
      preguntas.push(...rows);
    }
  }
  res.json({ preguntas, materias });
}));

/* ---------- Rutas de administrador ---------- */

router.get('/', requireAdmin, asyncHandler(async (req, res) => {
  const { materia, competencia, eje } = req.query;
  const condiciones = ['activo = 1'];
  const params = [];
  if (MATERIAS.includes(materia)) { condiciones.push('materia = ?'); params.push(materia); }
  if (materia && COMPETENCIAS_POR_MATERIA[materia] && COMPETENCIAS_POR_MATERIA[materia].includes(competencia)) {
    condiciones.push('competencia = ?'); params.push(competencia);
  }
  if (materia && EJES_POR_MATERIA[materia] && EJES_POR_MATERIA[materia].includes(eje)) {
    condiciones.push('eje = ?'); params.push(eje);
  }
  const rows = await db.all(
    `SELECT * FROM questions WHERE ${condiciones.join(' AND ')} ORDER BY id DESC`,
    params
  );
  res.json({ preguntas: rows });
}));

// Catalogo de competencias y ejes por materia, para que el frontend arme los
// selects sin duplicar esta clasificacion.
router.get('/taxonomia', requireAuth, asyncHandler(async (req, res) => {
  res.json({ competencias: COMPETENCIAS_POR_MATERIA, ejes: EJES_POR_MATERIA });
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
      (materia, dificultad, competencia, eje, texto_base, enunciado, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, explicacion, imagen, activo, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `, [
    normalizado.materia, normalizado.dificultad, normalizado.competencia, normalizado.eje, normalizado.texto_base, normalizado.enunciado,
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
    UPDATE questions SET materia=?, dificultad=?, competencia=?, eje=?, texto_base=?, enunciado=?, opcion_a=?, opcion_b=?,
      opcion_c=?, opcion_d=?, respuesta_correcta=?, explicacion=?, imagen=?
    WHERE id=?
  `, [
    normalizado.materia, normalizado.dificultad, normalizado.competencia, normalizado.eje, normalizado.texto_base, normalizado.enunciado,
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
