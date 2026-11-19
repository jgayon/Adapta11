const Module = require('module');
const path = require('path');
const assert = require('assert');
// ---- base de datos falsa en memoria (mismo patron que prueba-selector.js) ----
const T = { questions: [], exam_answers: [], exam_sessions: [], textos: [] };
let nid = 1;
const fakeDb = {
  leer: async (t, f) => (T[t] || []).filter(r => !f || Object.entries(f).every(([k, v]) => String(r[k]) === String(v))).map(r => ({ ...r })),
  porId: async (t, id) => (T[t] || []).find(r => r.id === id) || null,
  dondeEn: (filas, campo, vals) => { const s = new Set(vals.map(String)); return filas.filter(f => s.has(String(f[campo]))); },
  crear: async (t, d) => { const r = { id: 'n' + nid++, ...d }; T[t].push(r); return r; },
  crearVarias: async (t, fs) => { const ins = fs.map(d => ({ id: 'n' + nid++, ...d })); T[t].push(...ins); return { inserted: ins, skipped: [] }; },
  actualizar: async (t, id, cambios) => {
    const fila = (T[t] || []).find(r => r.id === id);
    if (fila) Object.assign(fila, cambios);
    return fila;
  },
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

process.env.ANTHROPIC_API_KEY = 'clave-de-prueba';
let llamadasFetch = 0;
global.fetch = async (_url, opts) => {
  llamadasFetch++;
  const body = JSON.parse(opts.body);
  // Averigua cuantas pidio el prompt ("Escribe N pregunta(s)") para generar justo esas.
  const m = body.messages[0].content.match(/Escribe (\d+) pregunta/);
  const n = m ? Number(m[1]) : 1;
  const items = [];
  for (let i = 0; i < n; i++) {
    items.push({
      enunciado: 'Pregunta generada numero ' + i + ' para esta prueba de integracion, con suficiente longitud.',
      opcion_a: 'opcion A' + i, opcion_b: 'opcion B' + i, opcion_c: 'opcion C' + i, opcion_d: 'opcion D' + i,
      respuesta_correcta: 'a', explicacion: 'explicacion ' + i
    });
  }
  return { ok: true, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(items) }] }) };
};

require(path.resolve('src/routes/questions.js'));
require(path.resolve('src/routes/sessions.js'));

(async () => {
  // Banco MUY corto a proposito: 1 sola pregunta activa de matematicas/argumentacion.
  T.questions = [{
    id: 'q1', materia: 'matematicas', competencia: 'argumentacion', eje: 'algebra_calculo',
    dificultad: 'media', activo: true, enunciado: 'Pregunta real ya existente en el banco.',
    opcion_a: 'a', opcion_b: 'b', opcion_c: 'c', opcion_d: 'd', respuesta_correcta: 'a', created_at: '2026-01-01'
  }];

  // 1) /practice pide 4, el banco solo tiene 1 -> deben generarse 3 de respaldo
  let out = await call('GET /practice', { query: { materia: 'matematicas', competencia: 'argumentacion', eje: 'algebra_calculo', count: '4' } });
  assert.equal(out.c, 200);
  assert.equal(out.b.preguntas.length, 4, 'se completa con generadas hasta llegar a 4');
  const generadasPractice = out.b.preguntas.filter(p => p.origen === 'ia');
  assert.equal(generadasPractice.length, 3, 'exactamente 3 fueron generadas');
  assert.ok(generadasPractice.every(p => p.validada === false), 'quedan sin validar');
  assert.ok(out.b.aviso && out.b.aviso.includes('respaldo'), 'el aviso menciona el respaldo generado');
  console.log('/practice: banco corto se completa con 3 generadas de respaldo, sin validar -> OK');

  // Las generadas ya quedaron insertadas en T.questions (persisten para el resto de la prueba)
  assert.equal(T.questions.filter(q => q.origen === 'ia').length, 3);

  // 2) /simulacro-pool NUNCA debe incluir las generadas sin validar
  out = await call('GET /simulacro-pool', { query: { materias: 'matematicas', porMateria: '10' } });
  assert.equal(out.c, 200);
  const enSimulacro = out.b.preguntas.filter(p => p.origen === 'ia');
  assert.equal(enSimulacro.length, 0, 'ninguna generada sin validar entra al simulacro');
  console.log('/simulacro-pool: excluye las generadas sin validar -> OK');

  // 3) GET /?pendientes=1 (admin) solo debe listar las generadas sin validar
  out = await call('GET /', { query: { pendientes: '1' } });
  assert.equal(out.c, 200);
  assert.equal(out.b.preguntas.length, 3);
  assert.ok(out.b.preguntas.every(p => p.origen === 'ia' && p.validada === false));
  console.log('GET /?pendientes=1: lista solo las 3 generadas sin validar -> OK');

  // 4) PUT /:id/validar aprueba una de ellas
  const idAprobar = out.b.preguntas[0].id;
  out = await call('PUT /:id/validar', { params: { id: idAprobar } });
  assert.equal(out.c, 200);
  assert.equal(out.b.pregunta.validada, true);
  out = await call('GET /', { query: { pendientes: '1' } });
  assert.equal(out.b.preguntas.length, 2, 'la aprobada ya no aparece como pendiente');
  console.log('PUT /:id/validar: aprueba y deja de salir en pendientes -> OK');

  // 5) La misma pregunta, ya validada, SI puede entrar al simulacro
  out = await call('GET /simulacro-pool', { query: { materias: 'matematicas', porMateria: '10' } });
  const validadaEnSimulacro = out.b.preguntas.filter(p => p.id === idAprobar);
  assert.equal(validadaEnSimulacro.length, 1, 'una vez validada, si puede salir en el simulacro');
  console.log('/simulacro-pool: la ya validada si puede salir -> OK');

  // 6) /adaptive con historial vacio y banco corto -> tambien genera de respaldo
  T.exam_sessions = [];
  T.exam_answers = [];
  out = await call('GET /adaptive', { query: { materia: 'matematicas', count: '5' } });
  assert.equal(out.c, 200);
  const generadasAdaptive = out.b.preguntas.filter(p => p.origen === 'ia' && p.validada === false);
  assert.ok(generadasAdaptive.length > 0, 'tambien genera de respaldo cuando el selector se queda corto');
  // Nota: algunas de estas pueden venir de antes (generadas en el paso 1 de
  // /practice, que ya quedaron en el banco y el selector las reutiliza como
  // candidatas normales via "complemento" -- eso es correcto, es justo el
  // punto de dejarlas en el banco). Lo que importa aqui es que al MENOS una
  // sea nueva, generada por el propio relleno de /adaptive.
  assert.ok(generadasAdaptive.some(p => /espaldo/.test(p.motivo)), 'al menos una se genero por el relleno de /adaptive (motivo "respaldo")');
  console.log('/adaptive: tambien se completa con generadas de respaldo cuando el banco no alcanza -> OK (' + generadasAdaptive.length + ')');

  console.log('llamadas a la API simulada:', llamadasFetch);
  console.log('TODO OK');
})().catch(e => { console.error('FALLO', e); process.exit(1); });
