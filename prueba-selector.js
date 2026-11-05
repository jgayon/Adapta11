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
const sel = require(path.resolve('src/lib/selector.js'));
const dif = require(path.resolve('src/lib/dificultad.js'));
const call = (key, req) => new Promise((resolve, reject) => {
  const res = { status(c) { this.c = c; return this; }, json(b) { resolve({ c: this.c || 200, b }); } };
  routes[key]({ query: {}, params: {}, body: {}, user: { id: 'u1' }, ...req }, res, reject);
});
const COMP = ['interpretacion_representacion', 'formulacion_ejecucion', 'argumentacion'];
const [A, B, C] = COMP;
// banco: 10 preguntas por competencia (ids A0..A9), niveles variados
const banco = []; for (const c of COMP) for (let i = 0; i < 10; i++) banco.push({ id: c[0] + i, competencia: c, eje: ['algebra_calculo', 'geometria', 'estadistica'][i % 3], activo: true, materia: 'matematicas' });
const nivelFijo = (q) => (['facil', 'medio', 'dificil', 'no_medido'])[Number(q.id.slice(1)) % 4];
const cnt = (sel_) => sel_.reduce((a, s) => { a[s.pregunta.competencia] = (a[s.pregunta.competencia] || 0) + 1; return a; }, {});

// 1) arranque en frio: todo exploracion, repartido parejo
let r = sel.seleccionar({ candidatas: banco, competencias: COMP, historial: {}, respondidas: new Map(), nivelDe: nivelFijo, count: 5 });
assert.equal(r.seleccion.length, 5); assert.ok(r.seleccion.every(s => s.razon === 'exploracion'));
assert.deepEqual(Object.values(cnt(r.seleccion)).sort(), [1, 2, 2]); console.log('frio: 5 preguntas de exploracion, reparto', JSON.stringify(cnt(r.seleccion)));
// 2) historial: A debil, B dominada, C sin evidencia. k=10 -> 6 / 3 / 1
const hist = { [A]: { n: 10, c: 3 }, [B]: { n: 10, c: 9 }, [C]: { n: 2, c: 1 } };
r = sel.seleccionar({ candidatas: banco, competencias: COMP, historial: hist, respondidas: new Map(), nivelDe: nivelFijo, count: 10 });
const c2 = cnt(r.seleccion); assert.equal(c2[A], 6); assert.equal(c2[C], 3); assert.equal(c2[B], 1);
{ const nv = r.seleccion.filter(s => s.pregunta.competencia === A).map(s => nivelFijo(s.pregunta)); // objetivo facil: las 3 faciles, luego no medidas, luego la mas cercana (medio); nunca dificil
  assert.equal(nv.filter(x => x === 'facil').length, 3); assert.equal(nv.filter(x => x === 'no_medido').length, 2); assert.equal(nv.filter(x => x === 'dificil').length, 0); }
assert.equal(r.seleccion.find(s => s.pregunta.competencia === B).razon, 'repaso');
console.log('mixto k=10:', JSON.stringify(c2)); console.log('  ej. motivo refuerzo:', r.seleccion[0].motivo); console.log('  ej. motivo exploracion:', r.seleccion.find(s => s.razon === 'exploracion').motivo);
// 3) no repetir: marcar como respondidas 8 de las 10 de A -> primero salen las 2 nuevas
const resp = new Map(); for (let i = 0; i < 8; i++) resp.set(A[0] + i, { ultima: '2026-01-0' + (i + 1), incorrecta: i % 2 === 0 });
r = sel.seleccionar({ candidatas: banco, competencias: COMP, historial: hist, respondidas: resp, nivelDe: nivelFijo, count: 10 });
const delA = r.seleccion.filter(s => s.pregunta.competencia === A); assert.equal(delA.length, 6);
const nuevas = delA.filter(s => !resp.has(s.pregunta.id)); assert.equal(nuevas.length, 2); // las dos nunca vistas entran
const repetidas = delA.filter(s => resp.has(s.pregunta.id)); assert.ok(repetidas.every(s => /Ya la habías respondido/.test(s.motivo)));
// al repetir, primero las falladas (i par) y las mas antiguas
assert.ok(repetidas.slice(0, 2).every(s => resp.get(s.pregunta.id).incorrecta)); console.log('repeticion: 2 nuevas + 4 repetidas (falladas/antiguas primero)');
// 4) determinismo
const again = sel.seleccionar({ candidatas: banco, competencias: COMP, historial: hist, respondidas: resp, nivelDe: nivelFijo, count: 10 });
assert.deepEqual(again.seleccion.map(s => s.pregunta.id), r.seleccion.map(s => s.pregunta.id)); console.log('determinista: OK');
// 5) complemento: A solo tiene 2 preguntas, se piden 6 de refuerzo
const pocas = banco.filter(q => q.competencia !== A || Number(q.id.slice(1)) < 2);
r = sel.seleccionar({ candidatas: pocas, competencias: COMP, historial: hist, respondidas: new Map(), nivelDe: nivelFijo, count: 10 });
assert.equal(r.seleccion.length, 10); assert.ok(r.seleccion.some(s => s.razon === 'complemento')); console.log('complemento cuando se agota la competencia: OK');
// 6) banco chico: devuelve lo que haya
r = sel.seleccionar({ candidatas: banco.slice(0, 3), competencias: COMP, historial: {}, respondidas: new Map(), nivelDe: nivelFijo, count: 10 });
assert.equal(r.seleccion.length, 3); assert.equal(new Set(r.seleccion.map(s => s.pregunta.id)).size, 3);
// cupos
assert.deepEqual([1, 2, 5, 10, 15, 20].map(k => Object.values(sel.repartirCupos(k)).reduce((a, b) => a + b)), [1, 2, 5, 10, 15, 20]);
console.log('cupos k=5:', JSON.stringify(sel.repartirCupos(5)), 'k=10:', JSON.stringify(sel.repartirCupos(10)), 'k=15:', JSON.stringify(sel.repartirCupos(15)));

// 7) ruta GET /adaptive y guardado de la sesion con motivo
(async () => {
  T.questions = banco.map(q => ({ ...q, dificultad: 'media', enunciado: 'e', opcion_a: 'a', opcion_b: 'b', opcion_c: 'c', opcion_d: 'd', respuesta_correcta: 'a', eje: q.eje }));
  T.exam_sessions = [{ id: 's1', user_id: 'u1', fecha_inicio: '2026-01-01', fecha_fin: '2026-01-01' }, { id: 's2', user_id: 'otro', fecha_inicio: '2026-01-02' }];
  const add = (sid, qid, comp, ok) => T.exam_answers.push({ session_id: sid, question_id: qid, materia: 'matematicas', competencia: comp, respuesta_usuario: 'a', correcta: ok });
  for (let i = 0; i < 8; i++) add('s1', A[0] + i, A, i < 2);            // u1 falla A (2/8)
  for (let i = 0; i < 8; i++) add('s1', B[0] + i, B, true);             // u1 domina B (8/8)
  for (let i = 0; i < 8; i++) add('s2', C[0] + i, C, false);            // OTRO usuario: no debe contar para u1
  require(path.resolve('src/routes/questions.js')); require(path.resolve('src/routes/sessions.js'));
  let out = await call('GET /adaptive', { query: { materia: 'matematicas', count: '10' } });
  const u = Object.fromEntries(out.b.unidades.map(x => [x.competencia, x])); 
  assert.equal(u[A].estado, 'debil'); assert.equal(u[B].estado, 'dominada'); assert.equal(u[C].estado, 'sin_evidencia'); assert.equal(u[C].respuestas, 0, 'no cuenta lo de otro usuario');
  assert.equal(out.b.preguntas.length, 10); assert.ok(out.b.preguntas.every(p => p.motivo)); assert.equal(out.b.modo, 'adaptativo');
  const rep = out.b.preguntas.filter(p => /^Refuerzo/.test(p.motivo)); assert.ok(rep.length >= 5);
  console.log('ruta /adaptive:', out.b.unidades.map(x => x.competencia.slice(0, 5) + ':' + x.estado + '(' + x.dominio + '%)').join(' '));
  console.log('  1a pregunta ->', out.b.preguntas[0].motivo);
  out = await call('GET /adaptive', { query: { materia: 'xyz' } }); assert.equal(out.c, 400);
  // guardar sesion con motivo y modo
  out = await call('POST /', { body: { tipo: 'practica', materia: 'matematicas', modo: 'adaptativo', tiempo_segundos: 10, respuestas: [{ question_id: A + '' === '' ? 'x' : 'a9', respuesta_usuario: 'a', motivo: 'Refuerzo: prueba' }] } });
  assert.equal(out.c, 201); assert.equal(out.b.detalle.preguntas[0].motivo, 'Refuerzo: prueba');
  const ses = T.exam_sessions.find(s => s.id === out.b.sesion.id), fila = T.exam_answers.find(a => a.session_id === ses.id);
  assert.ok(!('estrategia' in ses) && !('motivo_seleccion' in fila)); console.log('sesion con GUARDAR_ESTRATEGIA apagado: no escribe columnas nuevas, devuelve motivo en la retro');
  console.log('TODO OK');
})().catch(e => { console.error('FALLO', e); process.exit(1); });
