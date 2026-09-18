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
  const textoId = body.texto_id ? Number(body.texto_id) : null;

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
      // Si la pregunta pertenece a un texto compartido (texto_id), ese texto
      // manda sobre texto_base (que queda para lecturas propias de una sola
      // pregunta). Ver GET/POST /textos mas abajo.
      texto_base: textoId ? null : (body.texto_base ? String(body.texto_base).trim() : null),
      texto_id: textoId,
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

// Baraja un arreglo sin mutar el original (Fisher-Yates).
function barajar(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Minimo de preguntas activas para mostrar un texto compartido como grupo,
// usado solo para textos viejos que no tienen guardada su propia cantidad
// planeada (creados antes de que el administrador pudiera indicarla al
// crear el texto).
const MINIMO_GRUPO_DEFECTO = 2;

// Cuantas preguntas de un texto se le muestran juntas al estudiante en cada
// intento: la que el administrador guardo en textos.preguntas_por_grupo, o
// si no la puso, la cantidad total de preguntas del texto (comportamiento
// viejo: se mostraban todas), o el minimo por defecto si tampoco hay eso
// guardado (textos muy viejos).
function objetivoGrupo(texto) {
  return texto.preguntas_por_grupo || texto.cantidad_preguntas || MINIMO_GRUPO_DEFECTO;
}

// Si alguna de las preguntas ya elegidas al azar pertenece a un texto
// compartido que ya tiene preguntas activas suficientes (ver objetivoGrupo),
// se arma el grupo que se le muestra al estudiante: un subconjunto al azar
// del banco de ese texto, del tamano indicado por el administrador (por
// ejemplo, el texto puede tener 5 preguntas creadas pero mostrarse solo con
// 3 cada vez, distintas en cada intento). Las preguntas que ya habian salido
// en el sorteo original se aprovechan primero; si faltan, se completan al
// azar con el resto del banco del texto. Un texto que todavia no alcanza su
// objetivo (le faltan preguntas por crear) no se muestra como grupo.
async function completarGrupos(preguntas) {
  const idsTexto = [...new Set(preguntas.filter((q) => q.texto_id).map((q) => q.texto_id))];
  if (!idsTexto.length) return { preguntas, textos: [] };

  const resultado = preguntas.filter((q) => !q.texto_id);
  const textosValidos = [];
  for (const textoId of idsTexto) {
    const texto = await db.get('SELECT * FROM textos WHERE id = ?', [textoId]);
    if (!texto) continue;
    const miembros = await db.all('SELECT * FROM questions WHERE texto_id = ? AND activo = 1', [textoId]);
    // Todavia no hay suficientes preguntas activas para completar ni un solo
    // grupo del tamano pedido: el texto no se muestra como grupo mientras no
    // se alcance esa cantidad.
    if (miembros.length < objetivoGrupo(texto)) continue;
    const objetivo = objetivoGrupo(texto);

    const yaElegidas = preguntas.filter((q) => q.texto_id === textoId);
    const idsYaElegidas = new Set(yaElegidas.map((q) => q.id));
    let grupoFinal;
    if (yaElegidas.length >= objetivo) {
      grupoFinal = barajar(yaElegidas).slice(0, objetivo);
    } else {
      const restantes = miembros.filter((m) => !idsYaElegidas.has(m.id));
      const faltan = objetivo - yaElegidas.length;
      grupoFinal = [...yaElegidas, ...barajar(restantes).slice(0, faltan)];
    }

    textosValidos.push(texto);
    resultado.push(...grupoFinal);
  }

  const textos = textosValidos.map((t) => ({ id: t.id, contenido: t.contenido }));
  return { preguntas: barajarConservandoGrupos(resultado), textos };
}

// Mezcla el orden de las preguntas sueltas/grupos entre si, pero mantiene
// contiguas las preguntas de un mismo texto compartido (y en orden aleatorio
// entre ellas), para poder mostrarlas juntas bajo un mismo encabezado.
function barajarConservandoGrupos(preguntas) {
  const porTexto = new Map();
  const unidades = [];
  for (const q of preguntas) {
    if (q.texto_id) {
      if (!porTexto.has(q.texto_id)) {
        const unidad = { preguntas: [] };
        porTexto.set(q.texto_id, unidad);
        unidades.push(unidad);
      }
      porTexto.get(q.texto_id).preguntas.push(q);
    } else {
      unidades.push({ preguntas: [q] });
    }
  }
  const salida = [];
  for (const u of barajar(unidades)) {
    salida.push(...barajar(u.preguntas));
  }
  return salida;
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
  const { preguntas, textos } = await completarGrupos(rows);
  res.json({ preguntas, textos });
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
  const completo = await completarGrupos(preguntas);
  res.json({ preguntas: completo.preguntas, materias, textos: completo.textos });
}));

/* ---------- Rutas de administrador ---------- */

router.get('/', requireAdmin, asyncHandler(async (req, res) => {
  const { materia, competencia, eje } = req.query;
  const condiciones = ['q.activo = 1'];
  const params = [];
  if (MATERIAS.includes(materia)) { condiciones.push('q.materia = ?'); params.push(materia); }
  if (materia && COMPETENCIAS_POR_MATERIA[materia] && COMPETENCIAS_POR_MATERIA[materia].includes(competencia)) {
    condiciones.push('q.competencia = ?'); params.push(competencia);
  }
  if (materia && EJES_POR_MATERIA[materia] && EJES_POR_MATERIA[materia].includes(eje)) {
    condiciones.push('q.eje = ?'); params.push(eje);
  }
  const rows = await db.all(
    `SELECT q.*, t.contenido as texto_contenido FROM questions q LEFT JOIN textos t ON t.id = q.texto_id
     WHERE ${condiciones.join(' AND ')} ORDER BY q.id DESC`,
    params
  );
  res.json({ preguntas: rows });
}));

// Catalogo de competencias y ejes por materia, para que el frontend arme los
// selects sin duplicar esta clasificacion.
router.get('/taxonomia', requireAuth, asyncHandler(async (req, res) => {
  res.json({ competencias: COMPETENCIAS_POR_MATERIA, ejes: EJES_POR_MATERIA });
}));

// Textos compartidos (lecturas usadas por varias preguntas). Van antes de
// /:id para que "/textos" no se interprete como un id de pregunta.
router.get('/textos', requireAdmin, asyncHandler(async (req, res) => {
  const { materia } = req.query;
  const condiciones = [];
  const params = [];
  if (MATERIAS.includes(materia)) { condiciones.push('t.materia = ?'); params.push(materia); }
  const where = condiciones.length ? 'WHERE ' + condiciones.join(' AND ') : '';
  const textos = await db.all(`
    SELECT t.id, t.materia, t.contenido, t.cantidad_preguntas, t.preguntas_por_grupo, t.created_at,
      (SELECT COUNT(*) FROM questions q WHERE q.texto_id = t.id AND q.activo = 1) as num_preguntas
    FROM textos t ${where} ORDER BY t.created_at DESC
  `, params);
  res.json({ textos });
}));

router.post('/textos', requireAdmin, asyncHandler(async (req, res) => {
  const materia = MATERIAS.includes(req.body && req.body.materia) ? req.body.materia : null;
  const contenido = req.body && req.body.contenido ? String(req.body.contenido).trim() : '';
  // Opcional: cuantas preguntas va a tener este texto en total. La usa el
  // modal "Crear texto con varias preguntas" para saber cuantos formularios
  // mostrar de una vez y para que completarGrupos() (ver arriba) sepa cuando
  // el grupo ya esta completo. El flujo viejo (crear el texto al vuelo desde
  // una sola pregunta) no la manda, y el texto queda con cantidad_preguntas
  // en null (usa el minimo por defecto).
  let cantidadPreguntas = null;
  if (req.body && req.body.cantidad_preguntas !== undefined && req.body.cantidad_preguntas !== null && req.body.cantidad_preguntas !== '') {
    const n = Number(req.body.cantidad_preguntas);
    if (!Number.isInteger(n) || n < 2 || n > 10) {
      return res.status(400).json({ error: 'La cantidad de preguntas debe ser un numero entero entre 2 y 10.' });
    }
    cantidadPreguntas = n;
  }
  // Opcional: cuantas de esas preguntas se le muestran juntas al estudiante
  // en cada intento (puede ser menor que cantidad_preguntas, para armar un
  // banco mas grande del que se toma un subconjunto al azar cada vez). Si no
  // se manda, se usa cantidad_preguntas completa (o el minimo por defecto).
  let preguntasPorGrupo = null;
  if (req.body && req.body.preguntas_por_grupo !== undefined && req.body.preguntas_por_grupo !== null && req.body.preguntas_por_grupo !== '') {
    const n = Number(req.body.preguntas_por_grupo);
    if (!Number.isInteger(n) || n < 2) {
      return res.status(400).json({ error: 'La cantidad de preguntas que se muestran juntas debe ser un numero entero de al menos 2.' });
    }
    if (cantidadPreguntas && n > cantidadPreguntas) {
      return res.status(400).json({ error: 'La cantidad de preguntas que se muestran juntas no puede ser mayor que el total de preguntas del texto.' });
    }
    preguntasPorGrupo = n;
  }
  if (!materia) return res.status(400).json({ error: 'Selecciona una materia valida para el texto.' });
  if (!contenido) return res.status(400).json({ error: 'El contenido del texto es obligatorio.' });
  const info = await db.run(
    'INSERT INTO textos (materia, contenido, cantidad_preguntas, preguntas_por_grupo, created_by) VALUES (?, ?, ?, ?, ?)',
    [materia, contenido, cantidadPreguntas, preguntasPorGrupo, req.user.id]
  );
  const texto = await db.get('SELECT * FROM textos WHERE id = ?', [info.lastInsertRowid]);
  res.status(201).json({ texto });
}));

router.get('/:id', requireAdmin, asyncHandler(async (req, res) => {
  const pregunta = await db.get(
    `SELECT q.*, t.contenido as texto_contenido FROM questions q LEFT JOIN textos t ON t.id = q.texto_id WHERE q.id = ?`,
    [req.params.id]
  );
  if (!pregunta) return res.status(404).json({ error: 'Pregunta no encontrada.' });
  res.json({ pregunta });
}));

router.post('/', requireAdmin, asyncHandler(async (req, res) => {
  const { errores, normalizado } = validarPregunta(req.body || {});
  if (errores.length) return res.status(400).json({ error: errores.join(' ') });
  if (normalizado.texto_id) {
    const texto = await db.get('SELECT * FROM textos WHERE id = ?', [normalizado.texto_id]);
    if (!texto || texto.materia !== normalizado.materia) {
      return res.status(400).json({ error: 'El texto compartido seleccionado no existe o no corresponde a la materia elegida.' });
    }
  }

  const info = await db.run(`
    INSERT INTO questions
      (materia, dificultad, competencia, eje, texto_base, texto_id, enunciado, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, explicacion, imagen, activo, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `, [
    normalizado.materia, normalizado.dificultad, normalizado.competencia, normalizado.eje, normalizado.texto_base, normalizado.texto_id, normalizado.enunciado,
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
  if (normalizado.texto_id) {
    const texto = await db.get('SELECT * FROM textos WHERE id = ?', [normalizado.texto_id]);
    if (!texto || texto.materia !== normalizado.materia) {
      return res.status(400).json({ error: 'El texto compartido seleccionado no existe o no corresponde a la materia elegida.' });
    }
  }

  await db.run(`
    UPDATE questions SET materia=?, dificultad=?, competencia=?, eje=?, texto_base=?, texto_id=?, enunciado=?, opcion_a=?, opcion_b=?,
      opcion_c=?, opcion_d=?, respuesta_correcta=?, explicacion=?, imagen=?
    WHERE id=?
  `, [
    normalizado.materia, normalizado.dificultad, normalizado.competencia, normalizado.eje, normalizado.texto_base, normalizado.texto_id, normalizado.enunciado,
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
