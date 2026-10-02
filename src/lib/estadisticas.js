const db = require('../db');

// Agrega un desglose (por materia, por competencia o por eje) con el
// porcentaje de aciertos ya calculado, para no repetir esta cuenta en cada
// pantalla que consume estos datos.
function conDesglose(mapa, campo) {
  return [...mapa.entries()].map(([valor, g]) => ({
    [campo]: valor,
    total: g.total,
    correctas: g.correctas,
    porcentaje: g.total ? Math.round((g.correctas / g.total) * 100) : 0
  }));
}

// Agrupa un arreglo de respuestas (exam_answers ya normalizadas) por el
// valor de `campo`, contando el total y las correctas de cada grupo.
// Reemplaza el "GROUP BY campo, COUNT(*), SUM(correcta)" que hacia SQLite:
// Roble no tiene agregaciones, asi que se calculan aqui.
function agruparPor(respuestas, campo, { soloConValor = false } = {}) {
  const mapa = new Map();
  for (const r of respuestas) {
    const valor = r[campo];
    if (soloConValor && !valor) continue;
    if (!mapa.has(valor)) mapa.set(valor, { total: 0, correctas: 0 });
    const g = mapa.get(valor);
    g.total += 1;
    if (r.correcta) g.correctas += 1;
  }
  return mapa;
}

function promedio(valores) {
  if (!valores.length) return null;
  return Math.round(valores.reduce((a, b) => a + b, 0) / valores.length);
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
//
// Roble no tiene SUM/AVG/GROUP BY ni "WHERE user_id IN (...)": se trae la
// tabla completa de sesiones (y luego de respuestas) una sola vez y todo el
// filtrado/agregacion se hace aqui, en JavaScript.
async function resumenParaUsuarios(userIds) {
  if (!userIds || !userIds.length) {
    return { resumen: resumenVacio(), evolucion: { general: [], por_materia: {} }, sesiones_recientes: [] };
  }

  const todasLasSesiones = await db.leer('exam_sessions');
  const sesiones = db.dondeEn(todasLasSesiones, 'user_id', userIds)
    .sort((a, b) => String(a.fecha_inicio).localeCompare(String(b.fecha_inicio)));
  if (!sesiones.length) {
    return { resumen: resumenVacio(), evolucion: { general: [], por_materia: {} }, sesiones_recientes: [] };
  }

  const sessionIds = sesiones.map((s) => s.id);
  const todasLasRespuestas = await db.leer('exam_answers');
  const respuestas = db.dondeEn(todasLasRespuestas, 'session_id', sessionIds);

  const porMateria = agruparPor(respuestas, 'materia');
  const porCompetencia = agruparPor(respuestas, 'competencia', { soloConValor: true });
  const porEje = agruparPor(respuestas, 'eje', { soloConValor: true });

  const tiempos = {
    promedio_general: promedio(respuestas.map((r) => r.tiempo_segundos).filter((n) => n != null)),
    promedio_correcta: promedio(respuestas.filter((r) => r.correcta).map((r) => r.tiempo_segundos).filter((n) => n != null)),
    promedio_incorrecta: promedio(respuestas.filter((r) => !r.correcta).map((r) => r.tiempo_segundos).filter((n) => n != null))
  };

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
  const porMateriaSesion = new Map(); // materia -> sesion_id -> {total, correctas}
  for (const r of respuestas) {
    if (!porMateriaSesion.has(r.materia)) porMateriaSesion.set(r.materia, new Map());
    const porSesion = porMateriaSesion.get(r.materia);
    if (!porSesion.has(r.session_id)) porSesion.set(r.session_id, { total: 0, correctas: 0 });
    const g = porSesion.get(r.session_id);
    g.total += 1;
    if (r.correcta) g.correctas += 1;
  }
  const evolucionPorMateria = {};
  for (const [materia, porSesion] of porMateriaSesion.entries()) {
    evolucionPorMateria[materia] = [...porSesion.entries()]
      .map(([sesionId, g]) => ({
        sesion_id: sesionId,
        fecha: fechaPorSesion.get(sesionId),
        total: g.total,
        correctas: g.correctas,
        porcentaje: g.total ? Math.round((g.correctas / g.total) * 100) : 0
      }))
      .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
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
        promedio_general: redondear(tiempos.promedio_general),
        promedio_correcta: redondear(tiempos.promedio_correcta),
        promedio_incorrecta: redondear(tiempos.promedio_incorrecta)
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
