const Module = require('module');
const path = require('path');
const assert = require('assert');
const T = { questions: [], exam_answers: [], exam_sessions: [], textos: [] };
let nid = 1;
const fakeDb = {
  leer: async (t, f) => (T[t] || []).filter(r => !f || Object.entries(f).every(([k, v]) => String(r[k]) === String(v))).map(r => ({ ...r })),
  porId: async (t, id) => (T[t] || []).find(r => r.id === id) || null,
  dondeEn: (filas, campo, vals) => { const s = new Set(vals.map(String)); return filas.filter(f => s.has(String(f[campo]))); },
  crear: async (t, d) => { const r = { id: 'n' + nid++, ...d }; T[t].push(r); return r; },
  crearVarias: async (t, fs) => { const ins = fs.map(d => ({ id: 'n' + nid++, ...d })); T[t].push(...ins); return { inserted: ins, skipped: [] }; },
  actualizar: async (t, id, cambios) => { const fila = (T[t] || []).find(r => r.id === id); if (fila) Object.assign(fila, cambios); return fila; },
  borrar: async () => true
};
const routes = {};
const fakeExpress = () => ({});
fakeExpress.Router = () => {
  const r = {};
  for (const m of ['get', 'post', 'put', 'delete']) r[m] = (p, ...hs) => { routes[m.toUpperCase() + ' ' + p] = hs[hs.length - 1]; };
  return r;
};
const orig = Module._load;
Module._load = function (req, parent, ...rest) {
  if (req === 'express') return fakeExpress;
  if (req.endsWith('/db') || req === '../db') return fakeDb;
  if (req.endsWith('middleware/auth')) return { requireAuth: 1, requireAdmin: 1 };
  return orig.call(this, req, parent, ...rest);
};
const call = (key, req) => new Promise((resolve, reject) => {
  const res = { status(c) { this.c = c; return this; }, json(b) { resolve({ c: this.c || 200, b }); } };
  routes[key]({ query: {}, params: {}, body: {}, user: { id: 'u1' }, ...req }, res, reject);
});
require(path.resolve('src/routes/questions.js'));

(async () => {
  // Banco: 6 preguntas de argumentacion (matematicas), con historial variado;
  // 1 pendiente de validar (IA); el resto sin suficiente historia.
  const q = (id, extra) => ({ id, materia: 'matematicas', competencia: 'argumentacion', eje: 'algebra_calculo', dificultad: 'media', activo: true, enunciado: 'Pregunta ' + id, opcion_a: 'a', opcion_b: 'b', opcion_c: 'c', opcion_d: 'd', respuesta_correcta: 'a', created_at: id, ...extra });
  T.questions = [
    q('q1'), q('q2'), q('q3'),
    q('q4', { origen: 'ia', validada: false }),
    q('q5', { imagen: 'x' }),
    q('q6', { texto_id: 't1' })
  ];
  // q1: 10 respuestas, 2 correctas (20% -> la mas fallada). q2: 10 respuestas, 9 correctas (90%).
  // q3..q6: menos de 5 respuestas -> no cuentan para el ranking/promedio.
  for (let i = 0; i < 10; i++) T.exam_answers.push({ session_id: 's', question_id: 'q1', respuesta_usuario: 'a', correcta: i < 2 });
  for (let i = 0; i < 10; i++) T.exam_answers.push({ session_id: 's', question_id: 'q2', respuesta_usuario: 'a', correcta: i < 9 });
  for (let i = 0; i < 3; i++) T.exam_answers.push({ session_id: 's', question_id: 'q3', respuesta_usuario: 'a', correcta: true });

  const out = await call('GET /estadisticas', {});
  assert.equal(out.c, 200);
  const b = out.b;

  assert.equal(b.por_materia.matematicas.total, 6);
  assert.equal(b.por_materia.matematicas.con_imagen, 1);
  assert.equal(b.por_materia.matematicas.con_texto, 1);
  assert.equal(b.por_materia.matematicas.pendientes_validar, 1);
  assert.equal(b.por_materia.lectura_critica.total, 0);
  console.log('por_materia: OK');

  const argumentacion = b.por_competencia.find(c => c.materia === 'matematicas' && c.competencia === 'argumentacion');
  assert.equal(argumentacion.total, 6);
  assert.equal(argumentacion.medidas, 2, 'solo q1 y q2 tienen >=5 respuestas');
  assert.equal(argumentacion.promedio_acierto, Math.round(((2 / 10) + (9 / 10)) / 2 * 100));
  console.log('por_competencia: promedio OK (' + argumentacion.promedio_acierto + '%)');

  assert.equal(b.mas_falladas.length, 2, 'solo q1 y q2 califican para el ranking (>=5 respuestas)');
  assert.equal(b.mas_falladas[0].id, 'q1', 'la de menor tasa de acierto va primero');
  assert.equal(b.mas_falladas[0].tasa_acierto, 20);
  console.log('mas_falladas: OK, primera es q1 con 20%');

  assert.equal(b.pendientes_validar_total, 1);
  assert.deepEqual(b.uso_generador, { generadas_hoy: 0, tope_diario: 50 });
  console.log('pendientes_validar_total y uso_generador: OK');

  console.log('TODO OK');
})().catch(e => { console.error('FALLO', e); process.exit(1); });
