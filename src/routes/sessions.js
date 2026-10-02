const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { resumenEstudiante } = require('../lib/estadisticas');

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
  // Roble no soporta "WHERE id IN (...)": se trae el banco completo de
  // preguntas y se filtra aqui por los ids que aparecen en esta sesion.
  const todasLasPreguntas = ids.length ? await db.leer('questions') : [];
  const preguntas = db.dondeEn(todasLasPreguntas, 'id', ids);
  const porId = new Map(preguntas.map(p => [p.id, p]));

  const respuestasNormalizadas = respuestas.map((r, idx) => {
    const q = porId.get(r.question_id);
    const respuestaUsuario = r.respuesta_usuario ? String(r.respuesta_usuario).toLowerCase() : null;
    const correcta = !!(q && respuestaUsuario && respuestaUsuario === q.respuesta_correcta);
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
  const sesion = await db.crear('exam_sessions', {
    user_id: req.user.id,
    tipo,
    materia: materia || null,
    dificultad: dificultad || null,
    competencia: competencia || null,
    eje: eje || null,
    materias: materiasTexto,
    num_preguntas: respuestasNormalizadas.length,
    num_correctas: numCorrectas,
    tiempo_segundos: tiempo,
    nivel_estimado: nivelEstimado,
    fecha_fin: new Date().toISOString()
  });

  const filas = respuestasNormalizadas.map((a) => ({
    session_id: sesion.id,
    question_id: a.question_id,
    orden: a.orden,
    materia: a.materia,
    dificultad: a.dificultad,
    competencia: a.competencia,
    eje: a.eje,
    respuesta_usuario: a.respuesta_usuario,
    correcta: a.correcta,
    tiempo_segundos: a.tiempo_segundos
  }));
  const resultadoInsercion = await db.crearVarias('exam_answers', filas);
  if (resultadoInsercion.skipped.length) {
    // No pasa a diario: la sesion (con su nota final) ya quedo guardada; solo
    // se pierde el detalle de esas respuestas puntuales para la retro y las
    // estadisticas. Se deja constancia en el log del servidor para poder
    // revisarlo si se repite.
    console.error(
      `[sessions] ${resultadoInsercion.skipped.length} respuestas no se pudieron guardar (sesion ${sesion.id}):`,
      resultadoInsercion.skipped
    );
  }

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
    // Imagen opcional de cada opcion (ademas del texto de arriba), aparte
    // para no romper nada que ya lea `opciones` esperando solo texto.
    opcionesImagen: a._pregunta ? {
      a: a._pregunta.opcion_a_imagen || null,
      b: a._pregunta.opcion_b_imagen || null,
      c: a._pregunta.opcion_c_imagen || null,
      d: a._pregunta.opcion_d_imagen || null
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
  const filtros = { user_id: req.user.id };
  if (['practica', 'simulacro'].includes(tipo)) filtros.tipo = tipo;
  const rows = await db.leer('exam_sessions', filtros);
  rows.sort((a, b) => String(b.fecha_inicio).localeCompare(String(a.fecha_inicio)));
  res.json({ sesiones: rows });
}));

// Resumen estadistico del propio estudiante: sesiones totales, desglose por
// materia/competencia/eje, tiempo promedio por respuesta (en general, en
// las correctas y en las incorrectas) y la evolucion sesion a sesion para
// graficar su progreso ("Mi progreso"). Debe ir antes de GET /:id para que
// "summary" no se interprete como un id de sesion.
router.get('/summary', requireAuth, asyncHandler(async (req, res) => {
  const data = await resumenEstudiante(req.user.id);
  res.json(data);
}));

// Retroalimentacion detallada de una sesion propia ya finalizada (para
// revisarla despues, no solo justo al terminarla).
router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const sesion = await db.porId('exam_sessions', req.params.id);
  if (!sesion || sesion.user_id !== req.user.id) {
    return res.status(404).json({ error: 'Sesion no encontrada.' });
  }

  const [respuestas, todasLasPreguntas] = await Promise.all([
    db.leer('exam_answers', { session_id: sesion.id }),
    db.leer('questions')
  ]);
  respuestas.sort((a, b) => a.orden - b.orden);
  const porId = new Map(todasLasPreguntas.map((q) => [q.id, q]));

  const respuestasNormalizadas = respuestas.map((r) => ({
    orden: r.orden, materia: r.materia, dificultad: r.dificultad, competencia: r.competencia, eje: r.eje,
    correcta: r.correcta, tiempo_segundos: r.tiempo_segundos, respuesta_usuario: r.respuesta_usuario,
    _pregunta: porId.get(r.question_id) || null
  }));

  const detalle = construirRetroalimentacion(respuestasNormalizadas);
  res.json({ sesion, detalle });
}));

module.exports = router;
