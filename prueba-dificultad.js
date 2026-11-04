const Module = require('module');
const path = require('path');
const assert = require('assert');
// ---- base de datos falsa en memoria ----
const T = { questions: [], exam_answers: [], exam_sessions: [], textos: [] };
let nid = 1;
const fakeDb = {
  leer: async (t, f) => (T[t] || []).filter(r => !f || Object.entries(f).every(([k, v]) => String(r[k]) === String(v))).map(r => ({ ...r })),
  porId: async (t, id) => (T[t] || []).find(r => r.id === id) || null,
  dondeEn: (filas, campo, vals) => { const s = new Set(vals.map(String)); return filas.filter(f => s.has(String(f[campo]))); },
  crear: async (t, d) => { const r = { id: 'n' + nid++, ...d }; T[t].push(r); return r; },
  crearVarias: async (t, fs) => { const ins = fs.map(d => ({ id: 'n' + nid++, ...d })); T[t].push(...ins); return { inserted: ins, skipped: [] }; },
  actualizar: async () => ({}), borrar: async () => true
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
const dif = require(path.resolve('src/lib/dificultad.js'));
// clasificar
assert.equal(dif.clasificar(4, 4), 'no_medido');
assert.equal(dif.clasificar(5, 5), 'facil');
assert.equal(dif.clasificar(10, 7), 'facil');   // 70 %
assert.equal(dif.clasificar(10, 6), 'medio');
assert.equal(dif.clasificar(10, 4), 'medio');   // 40 %
assert.equal(dif.clasificar(10, 3), 'dificil');
assert.equal(dif.clasificar(0, 0), 'no_medido');
console.log('clasificar OK (umbrales 70/40, minimo', dif.MIN_RESPUESTAS + ')');

const q = (id, extra = {}) => ({ id, materia: 'matematicas', competencia: 'argumentacion', eje: 'algebra_calculo', dificultad: 'media', activo: true, enunciado: 'e' + id, opcion_a: 'a', opcion_b: 'b', opcion_c: 'c', opcion_d: 'd', respuesta_correcta: 'a', created_at: id, ...extra });
T.questions = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'].map(i => q(i)); T.questions.push(q('q7', { activo: false }));
const ans = (id, n, ok) => { for (let i = 0; i < n; i++) T.exam_answers.push({ question_id: id, respuesta_usuario: 'a', correcta: i < ok }); };
ans('q1', 10, 9); ans('q2', 10, 5); ans('q3', 10, 2); ans('q4', 3, 3);
for (let i = 0; i < 20; i++) T.exam_answers.push({ question_id: 'q5', respuesta_usuario: null, correcta: false }); // en blanco: no cuentan
require(path.resolve('src/routes/questions.js')); require(path.resolve('src/routes/sessions.js'));
const call = (key, req) => new Promise((resolve, reject) => {
  const res = { status(c) { this.c = c; return this; }, json(b) { resolve({ c: this.c || 200, b }); } };
  routes[key]({ query: {}, params: {}, body: {}, user: { id: 'u1' }, ...req }, res, reject);
});

(async () => {
  let r = await call('GET /practice', { query: { materia: 'matematicas', nivel: 'facil', count: '5' } });
  const ids = r.b.preguntas.map(p => p.id).sort();
  assert.deepEqual(ids, ['q1', 'q4', 'q5', 'q6'], 'facil + no medidas'); assert.ok(r.b.aviso); console.log('practice facil ->', ids.join(','), '|', r.b.aviso);
  r = await call('GET /practice', { query: { materia: 'matematicas', nivel: 'dificil', count: '1' } });
  assert.deepEqual(r.b.preguntas.map(p => p.id), ['q3']); assert.equal(r.b.aviso, null); console.log('practice dificil count=1 -> q3, sin aviso');
  r = await call('GET /practice', { query: { materia: 'matematicas', nivel: 'medio', count: '5' } });
  assert.ok(r.b.preguntas.map(p => p.id).includes('q2')); assert.ok(!r.b.preguntas.some(p => ['q1', 'q3'].includes(p.id)));
  r = await call('GET /practice', { query: { materia: 'matematicas', nivel: 'xyz', count: '20' } });
  assert.equal(r.b.nivel, 'aleatorio'); assert.equal(r.b.preguntas.length, 6); assert.ok(!r.b.preguntas.some(p => p.id === 'q7')); console.log('nivel invalido -> aleatorio, 6 activas (sin la desactivada)');
  r = await call('GET /', {});
  const m = Object.fromEntries(r.b.preguntas.map(p => [p.id, [p.nivel, p.tasa_acierto, p.veces_contestada]]));
  console.log('admin:', JSON.stringify(m));
  assert.deepEqual(m.q1, ['facil', 90, 10]); assert.deepEqual(m.q5, ['no_medido', null, 0]); assert.deepEqual(m.q4, ['no_medido', 100, 3]);
  // sesion: q3 contestada correcta 3 veces mas -> 5/13 = 38 % sigue dificil; q4 pasa a 3+2=5 contestadas
  r = await call('POST /', { body: { tipo: 'practica', materia: 'matematicas', nivel_solicitado: 'medio', tiempo_segundos: 30, respuestas: [
    { question_id: 'q4', respuesta_usuario: 'a', tiempo_segundos: 5 }, { question_id: 'q1', respuesta_usuario: 'b', tiempo_segundos: 5 }] } });
  assert.equal(r.c, 201);
  const pr = r.b.detalle.preguntas; console.log('retro (antes de sumar la sesion):', pr.map(p => p.id || p.orden + ':' + p.nivel + ' ' + p.tasa_acierto + '%/' + p.veces_contestada).join(' | '));
  assert.equal(pr[1].nivel, 'facil'); assert.equal(pr[0].nivel, 'no_medido');
  assert.equal(T.exam_sessions[0].dificultad, 'media'); console.log('sesion guarda dificultad pedida (medio -> "media")');
  r = await call('GET /', {}); const m2 = Object.fromEntries(r.b.preguntas.map(p => [p.id, [p.nivel, p.tasa_acierto, p.veces_contestada]]));
  assert.deepEqual(m2.q4, ['no_medido', 100, 4]); console.log('cache invalidada tras la sesion: q4 ahora', JSON.stringify(m2.q4));
  console.log('TODO OK');
})().catch(e => { console.error('FALLO', e); process.exit(1); });
