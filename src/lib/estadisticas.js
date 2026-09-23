const db = require('../db');

// Agrega un desglose (por materia, por competencia o por eje) con el
// porcentaje de aciertos ya calculado, para no repetir esta cuenta en cada
// pantalla que consume estos datos.
function conDesglose(rows, campo) {
  return rows.map((r) => ({
    [campo]: r[campo],
    total: r.total,
    correctas: r.correctas || 0,
    porcentaje: r.total ? Math.round(((r.correctas || 0) / r.total) * 100) : 0
  }));
}

function redondear(n) {
  return n === null || n === undefined ? null : Math.round(n);
}

function resumenVacio() {
  return {
    num_sesiones: 0,
    num_practicas: 0,
    num_simulacros: 0,
    num_preguntas: 0,
    num_correctas: 0,
    porcentaje_aciertos: 0,
    por_materia: [],
    por_competencia: [],
    por_eje: [],
    tiempos: { promedio_general: null, promedio_correcta: null, promedio_incorrecta: null }
  };
}

// Calcula el resumen estadistico agregado (sesiones, desgloses, tiempos
// promedio por respuesta y evolucion sesion a sesion para graficar) de un
// conjunto de usuarios. La usan tanto el estudiante para ver su propio
// progreso (con un solo id) como el profesor (todos los ids de su colegio)
// y el administrador (todos los ids de la plataforma o de un colegio), asi
// que el calculo y el formato de salida quedan en un solo lugar.
async function resumenParaUsuarios(userIds) {
  if (!userIds || !userIds.length) {
    return { resumen: resumenVacio(), evolucion: { general: [], por_materia: {} }, sesiones_recientes: [] };
  }
  const placeholders = userIds.map(() => '?').join(',');

  const sesiones = await db.all(
    `SELECT * FROM exam_sessions WHERE user_id IN (${placeholders}) ORDER BY fecha_inicio ASC`,
    userIds
  );
  if (!sesiones.length) {
    return { resumen: resumenVacio(), evolucion: { general: [], por_materia: {} }, sesiones_recientes: [] };
  }
  const sessionIds = sesiones.map((s) => s.id);
  const sp = sessionIds.map(() => '?').join(',');

  const [porMateria, porCompetencia, porEje, filaTiempos, porMateriaSesion] = await Promise.all([
    db.all(`SELECT materia, COUNT(*) as total, SUM(correcta) as correctas FROM exam_answers WHERE session_id IN (${sp}) GROUP BY materia`, sessionIds),
    db.all(`SELECT competencia, COUNT(*) as total, SUM(correcta) as correctas FROM exam_answers WHERE session_id IN (${sp}) AND competencia IS NOT NULL GROUP BY competencia`, sessionIds),
    db.all(`SELECT eje, COUNT(*) as total, SUM(correcta) as correctas FROM exam_answers WHERE session_id IN (${sp}) AND eje IS NOT NULL GROUP BY eje`, sessionIds),
    db.get(`
      SELECT
        AVG(tiempo_segundos) as promedio_general,
        AVG(CASE WHEN correcta = 1 THEN tiempo_segundos END) as promedio_correcta,
        AVG(CASE WHEN correcta = 0 THEN tiempo_segundos END) as promedio_incorrecta
      FROM exam_answers WHERE session_id IN (${sp})
    `, sessionIds),
    db.all(`
      SELECT session_id, materia, COUNT(*) as total, SUM(correcta) as correctas
      FROM exam_answers WHERE session_id IN (${sp})
      GROUP BY session_id, materia
    `, sessionIds)
  ]);

  const totalPreg = sesiones.reduce((a, s) => a + (s.num_preguntas || 0), 0);
  const totalCorr = sesiones.reduce((a, s) => a + (s.num_correctas || 0), 0);

  // Evolucion general: el % de aciertos de cada sesion, en orden
  // cronologico, para graficar como iba mejorando (o no) el estudiante.
  const evolucionGeneral = sesiones.map((s) => ({
    sesion_id: s.id,
    fecha: s.fecha_inicio,
    tipo: s.tipo,
    num_preguntas: s.num_preguntas,
    num_correctas: s.num_correctas,
    porcentaje: s.num_preguntas ? Math.round((s.num_correctas / s.num_preguntas) * 100) : 0
  }));

  // Evolucion por materia: igual que la general, pero una serie separada
  // por cada materia (una sesion de simulacro con ambas materias aporta un
  // punto a cada una, calculado solo con sus propias preguntas).
  const fechaPorSesion = new Map(sesiones.map((s) => [s.id, s.fecha_inicio]));
  const evolucionPorMateria = {};
  for (const fila of porMateriaSesion) {
    if (!evolucionPorMateria[fila.materia]) evolucionPorMateria[fila.materia] = [];
    evolucionPorMateria[fila.materia].push({
      sesion_id: fila.session_id,
      fecha: fechaPorSesion.get(fila.session_id),
      total: fila.total,
      correctas: fila.correctas || 0,
      porcentaje: fila.total ? Math.round(((fila.correctas || 0) / fila.total) * 100) : 0
    });
  }
  for (const materia of Object.keys(evolucionPorMateria)) {
    evolucionPorMateria[materia].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  }

  return {
    resumen: {
      num_sesiones: sesiones.length,
      num_practicas: sesiones.filter((s) => s.tipo === 'practica').length,
      num_simulacros: sesiones.filter((s) => s.tipo === 'simulacro').length,
      num_preguntas: totalPreg,
      num_correctas: totalCorr,
      porcentaje_aciertos: totalPreg ? Math.round((totalCorr / totalPreg) * 100) : 0,
      por_materia: conDesglose(porMateria, 'materia'),
      por_competencia: conDesglose(porCompetencia, 'competencia'),
      por_eje: conDesglose(porEje, 'eje'),
      tiempos: {
        promedio_general: redondear(filaTiempos && filaTiempos.promedio_general),
        promedio_correcta: redondear(filaTiempos && filaTiempos.promedio_correcta),
        promedio_incorrecta: redondear(filaTiempos && filaTiempos.promedio_incorrecta)
      }
    },
    // Sesion a sesion, en orden cronologico (para graficar) y ademas las 10
    // mas recientes primero (para la tabla de "sesiones recientes").
    evolucion: { general: evolucionGeneral, por_materia: evolucionPorMateria },
    sesiones_recientes: sesiones.slice(-10).reverse()
  };
}

function resumenEstudiante(userId) {
  return resumenParaUsuarios([userId]);
}

module.exports = { resumenParaUsuarios, resumenEstudiante };
