// Nivel de dificultad HISTORICO de cada pregunta, calculado con lo que
// realmente respondieron los estudiantes (no con la etiqueta manual
// `questions.dificultad`, que se conserva aparte porque la usan el simulacro
// y el nivel estimado).
//
// Formula (indice de dificultad clasico):
//     tasa_acierto = veces_correcta / veces_contestada
//
// - "Contestada" = la fila de exam_answers tiene respuesta_usuario (una
//   pregunta dejada en blanco no cuenta como intento).
// - Cuentan las respuestas de practica y de simulacro, de todos los
//   estudiantes.
//
// Rangos (por defecto; ajustables con variables de entorno):
//     No medido : menos de MIN_RESPUESTAS respuestas (sin historia suficiente)
//     Facil     : tasa_acierto >= 70 %   (el mismo 70 % que ya usa la
//                                         retroalimentacion para "reforzar")
//     Medio     : 40 % <= tasa_acierto < 70 %
//     Dificil   : tasa_acierto < 40 %    (con 4 opciones, adivinar da ~25 %)
//
// Roble no tiene agregaciones: se lee exam_answers completo y se cuenta en
// JavaScript, igual que lib/estadisticas.js. Para no repetir esa lectura en
// cada pantalla, el resultado se guarda en memoria CACHE_MS (ver invalidar()).

const db = require('../db');

const MIN_RESPUESTAS = Math.max(1, Number(process.env.DIFICULTAD_MIN_RESPUESTAS) || 5);
const UMBRAL_FACIL = Number(process.env.DIFICULTAD_UMBRAL_FACIL) || 0.70;
const UMBRAL_DIFICIL = Number(process.env.DIFICULTAD_UMBRAL_DIFICIL) || 0.40;
const CACHE_MS = 60 * 1000;

const NIVELES = ['facil', 'medio', 'dificil', 'no_medido'];
// Niveles que el estudiante puede pedir al iniciar una practica.
const NIVELES_SELECCIONABLES = ['facil', 'medio', 'dificil', 'aleatorio'];

function clasificar(total, correctas) {
  if (!total || total < MIN_RESPUESTAS) return 'no_medido';
  const tasa = correctas / total;
  if (tasa >= UMBRAL_FACIL) return 'facil';
  if (tasa >= UMBRAL_DIFICIL) return 'medio';
  return 'dificil';
}

let cache = { hasta: 0, promesa: null };

async function calcular() {
  const respuestas = await db.leer('exam_answers');
  const mapa = new Map();
  for (const r of respuestas) {
    if (!r.question_id || !r.respuesta_usuario) continue;
    if (!mapa.has(r.question_id)) mapa.set(r.question_id, { total: 0, correctas: 0 });
    const g = mapa.get(r.question_id);
    g.total += 1;
    if (r.correcta === true || r.correcta === 'true') g.correctas += 1;
  }
  return mapa;
}

// Map(question_id -> { total, correctas }). Comparte la misma lectura entre
// peticiones simultaneas y la reutiliza durante CACHE_MS.
function estadisticasPorPregunta() {
  const ahora = Date.now();
  if (cache.promesa && ahora < cache.hasta) return cache.promesa;
  const promesa = calcular();
  cache = { hasta: ahora + CACHE_MS, promesa };
  promesa.catch(() => { if (cache.promesa === promesa) cache = { hasta: 0, promesa: null }; });
  return promesa;
}

// Descarta el calculo guardado (se llama al guardar una sesion nueva).
function invalidar() {
  cache = { hasta: 0, promesa: null };
}

// Datos de nivel listos para mandar al frontend.
function infoNivel(stat) {
  const total = stat ? stat.total : 0;
  const correctas = stat ? stat.correctas : 0;
  return {
    nivel: clasificar(total, correctas),
    tasa_acierto: total ? Math.round((correctas / total) * 100) : null,
    veces_contestada: total
  };
}

module.exports = {
  NIVELES, NIVELES_SELECCIONABLES, MIN_RESPUESTAS, UMBRAL_FACIL, UMBRAL_DIFICIL,
  clasificar, estadisticasPorPregunta, invalidar, infoNivel
};
