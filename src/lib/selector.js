// Seleccion ADAPTATIVA de preguntas para el modo "Practica adaptativa".
//
// Es la estrategia S1 del informe (regla determinista): a partir del
// historial del estudiante decide cuantas preguntas de cada competencia
// pedirle y de que nivel de dificultad, evitando repetir preguntas. Este
// archivo es una funcion pura (no lee la base de datos) para poder probarla;
// la lectura del historial la hace la ruta GET /api/questions/adaptive.
//
// 1) Unidad de practica = competencia (dentro de la materia elegida).
// 2) Dominio de cada unidad, con suavizado de Laplace:
//        p = (aciertos + 1) / (respuestas + 2)
//    - "sin_evidencia": menos de MIN_EVIDENCIA respuestas.
//    - "debil":         con evidencia suficiente y p < UMBRAL_DEBIL (70 %).
//    - "dominada":      con evidencia suficiente y p >= UMBRAL_DEBIL.
// 3) Reparto de la tanda de k preguntas:
//        60 % refuerzo (unidades debiles, la mas floja primero)
//        25 % exploracion (unidades sin evidencia suficiente)
//        15 % repaso (unidades dominadas)
//    Si un grupo no tiene unidades, su cupo pasa al siguiente que si tenga.
// 4) Nivel de la pregunta segun el dominio de la unidad: p < 40 % -> Facil,
//    p < 70 % -> Medio, p >= 70 % -> Dificil (exploracion: Medio). Se usa el
//    nivel HISTORICO de cada pregunta (lib/dificultad.js); si no hay de ese
//    nivel se prefieren las "no medidas" y luego las de nivel cercano.
// 5) Repeticion: primero las preguntas que el estudiante nunca ha
//    respondido; si se agotan, vuelven primero las que fallo y las que
//    respondio hace mas tiempo.
// 6) Cada pregunta devuelve un `motivo` legible para mostrarselo al estudiante.
//
// Determinista: con el mismo historial y el mismo banco, devuelve lo mismo
// (los empates se resuelven por un orden fijo).

const MIN_EVIDENCIA = Math.max(1, Number(process.env.SELECTOR_MIN_EVIDENCIA) || 5);
const UMBRAL_DEBIL = 0.70;
const UMBRAL_FACIL = 0.40;
const CUOTA_REFUERZO = 0.60;
const CUOTA_EXPLORACION = 0.25; // el resto es repaso

const COMPETENCIA_LABEL = {
  identifica_contenidos_locales: 'Identifica contenidos locales',
  comprende_sentido_global: 'Comprende el sentido global',
  reflexiona_evalua_contenido: 'Reflexiona y evalúa el contenido',
  interpretacion_representacion: 'Interpretación y representación',
  formulacion_ejecucion: 'Formulación y ejecución',
  argumentacion: 'Argumentación'
};
const NIVEL_LABEL = { facil: 'Fácil', medio: 'Medio', dificil: 'Difícil', no_medido: 'No medido' };
const ORDEN_NIVEL = { facil: 0, medio: 1, dificil: 2 };

function estadoUnidad(n, c) {
  const p = (c + 1) / (n + 2);
  let estado;
  if (n < MIN_EVIDENCIA) estado = 'sin_evidencia';
  else estado = p < UMBRAL_DEBIL ? 'debil' : 'dominada';
  return { p, estado };
}

function nivelObjetivo(u) {
  if (u.estado === 'sin_evidencia') return 'medio';
  if (u.p < UMBRAL_FACIL) return 'facil';
  return u.p < UMBRAL_DEBIL ? 'medio' : 'dificil';
}

// Cuantas preguntas de cada tipo de cupo (refuerzo / exploracion / repaso).
function repartirCupos(k) {
  let refuerzo = Math.round(CUOTA_REFUERZO * k);
  let exploracion = Math.round(CUOTA_EXPLORACION * k);
  if (refuerzo + exploracion > k) exploracion = k - refuerzo;
  return { refuerzo, exploracion, repaso: k - refuerzo - exploracion };
}

// Lista ordenada de { unidad, razon } (una por pregunta a pedir).
function planificar(unidades, k) {
  const por = (estado) => unidades.filter((u) => u.estado === estado);
  const grupos = {
    refuerzo: por('debil').sort((a, b) => a.p - b.p || a.competencia.localeCompare(b.competencia)),
    exploracion: por('sin_evidencia').sort((a, b) => a.n - b.n || a.competencia.localeCompare(b.competencia)),
    repaso: por('dominada').sort((a, b) => a.n - b.n || a.competencia.localeCompare(b.competencia))
  };
  const cupos = repartirCupos(k);
  // Si un grupo esta vacio, su cupo pasa al primer grupo con unidades.
  const preferencia = {
    refuerzo: ['exploracion', 'repaso'],
    exploracion: ['refuerzo', 'repaso'],
    repaso: ['refuerzo', 'exploracion']
  };
  for (const g of ['refuerzo', 'exploracion', 'repaso']) {
    if (grupos[g].length || !cupos[g]) continue;
    const destino = preferencia[g].find((d) => grupos[d].length);
    if (destino) { cupos[destino] += cupos[g]; }
    cupos[g] = 0;
  }
  const plan = [];
  for (const g of ['refuerzo', 'exploracion', 'repaso']) {
    for (let i = 0; i < cupos[g]; i++) plan.push({ unidad: grupos[g][i % grupos[g].length], razon: g });
  }
  return plan;
}

function pct(c, n) { return n ? Math.round((c / n) * 100) : 0; }

function motivoDe(razon, u, q, nivelQ, yaRespondida, esComplemento) {
  const lab = COMPETENCIA_LABEL[u.competencia] || u.competencia;
  let base;
  if (esComplemento) base = 'Complemento: ' + lab + ' (no quedaban más preguntas disponibles de la competencia prevista)';
  else if (razon === 'refuerzo') base = 'Refuerzo: ' + lab + ' (' + u.c + ' de ' + u.n + ' aciertos, ' + pct(u.c, u.n) + ' %)';
  else if (razon === 'exploracion') {
    base = 'Exploración: ' + lab + (u.n === 0
      ? ' (aún no la has practicado)'
      : ' (solo ' + u.n + ' respuesta' + (u.n === 1 ? '' : 's') + '; falta evidencia para saber cómo vas)');
  } else base = 'Repaso: ' + lab + ' (' + u.c + ' de ' + u.n + ' aciertos, ' + pct(u.c, u.n) + ' %)';
  return base + '. Nivel de la pregunta: ' + (NIVEL_LABEL[nivelQ] || 'No medido') + '.' +
    (yaRespondida ? ' Ya la habías respondido antes.' : '');
}

// entrada:
//   candidatas : preguntas activas de la materia (objetos de `questions`)
//   competencias: competencias de la materia, p. ej. ['argumentacion', ...]
//   historial  : { [competencia]: { n, c } } del estudiante en esta materia
//   respondidas: Map(question_id -> { ultima: 'ISO', incorrecta: bool })
//   nivelDe    : (pregunta) => 'facil'|'medio'|'dificil'|'no_medido'
//   count      : cuantas preguntas pedir
// salida: { seleccion: [{ pregunta, motivo, razon }], unidades: [...] }
function seleccionar({ candidatas, competencias, historial, respondidas, nivelDe, count }) {
  const unidades = competencias.map((competencia) => {
    const h = historial[competencia] || { n: 0, c: 0 };
    return { competencia, n: h.n, c: h.c, ...estadoUnidad(h.n, h.c) };
  });
  const plan = planificar(unidades, count);

  const usadas = new Set();
  const elegidasPorEje = new Map();
  const seleccion = [];

  const costo = (q, objetivo) => {
    const r = respondidas.get(q.id);
    const nivel = nivelDe(q);
    let distancia;
    if (nivel === objetivo) distancia = 0;
    else if (nivel === 'no_medido') distancia = 1;
    else distancia = 1 + Math.abs(ORDEN_NIVEL[nivel] - ORDEN_NIVEL[objetivo]);
    return [
      r ? 1 : 0,                                  // nunca respondidas primero
      distancia,                                  // nivel buscado
      elegidasPorEje.get(q.competencia + '|' + q.eje) || 0, // variar ejes
      r ? (r.incorrecta ? 0 : 1) : 0,             // al repetir: primero las falladas
      r ? String(r.ultima || '') : '',            // y las respondidas hace mas tiempo
      String(q.id)
    ];
  };
  const comparar = (a, b) => {
    for (let i = 0; i < a.length; i++) {
      if (a[i] < b[i]) return -1;
      if (a[i] > b[i]) return 1;
    }
    return 0;
  };
  const mejorDe = (lista, objetivo) => {
    let mejor = null, mejorCosto = null;
    for (const q of lista) {
      if (usadas.has(q.id)) continue;
      const c = costo(q, objetivo);
      if (!mejor || comparar(c, mejorCosto) < 0) { mejor = q; mejorCosto = c; }
    }
    return mejor;
  };

  for (const { unidad, razon } of plan) {
    const objetivo = nivelObjetivo(unidad);
    let q = mejorDe(candidatas.filter((x) => x.competencia === unidad.competencia), objetivo);
    let esComplemento = false;
    let u = unidad;
    if (!q) {
      // La competencia prevista no tiene mas preguntas: se toma de otra.
      for (const otra of unidades) {
        if (otra.competencia === unidad.competencia) continue;
        q = mejorDe(candidatas.filter((x) => x.competencia === otra.competencia), nivelObjetivo(otra));
        if (q) { u = otra; esComplemento = true; break; }
      }
    }
    if (!q) break;
    usadas.add(q.id);
    const clave = q.competencia + '|' + q.eje;
    elegidasPorEje.set(clave, (elegidasPorEje.get(clave) || 0) + 1);
    seleccion.push({
      pregunta: q,
      razon: esComplemento ? 'complemento' : razon,
      motivo: motivoDe(razon, u, q, nivelDe(q), respondidas.has(q.id), esComplemento)
    });
  }
  return { seleccion, unidades };
}

module.exports = {
  seleccionar, planificar, estadoUnidad, nivelObjetivo, repartirCupos,
  MIN_EVIDENCIA, UMBRAL_DEBIL, UMBRAL_FACIL, COMPETENCIA_LABEL
};
