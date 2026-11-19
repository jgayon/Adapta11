const assert = require('assert');
const path = require('path');
const gen = require(path.resolve('src/lib/generador.js'));

// 1) sin ANTHROPIC_API_KEY: no esta disponible y no genera nada
delete process.env.ANTHROPIC_API_KEY;
assert.equal(gen.disponible(), false);

// 2) validarItem: casos validos e invalidos
const base = { enunciado: 'Un enunciado suficientemente largo para pasar la validacion.', opcion_a: 'a', opcion_b: 'b', opcion_c: 'c', opcion_d: 'd', respuesta_correcta: 'B', explicacion: 'porque si' };
assert.ok(gen.validarItem(base), 'item valido deberia pasar');
assert.equal(gen.validarItem(base).respuesta_correcta, 'b', 'normaliza la letra a minuscula');
assert.equal(gen.validarItem({ ...base, enunciado: 'corto' }), null, 'enunciado muy corto se descarta');
assert.equal(gen.validarItem({ ...base, opcion_c: 'a' }), null, 'opciones repetidas se descartan');
assert.equal(gen.validarItem({ ...base, respuesta_correcta: 'z' }), null, 'letra invalida se descarta');
assert.equal(gen.validarItem({ ...base, opcion_d: '' }), null, 'opcion vacia se descarta');
console.log('validarItem: OK');

// 3) sonParecidos: deteccion de casi-duplicados
assert.ok(gen.sonParecidos('¿Cual es la capital de Colombia?', 'cual es la capital de colombia'), 'identico salvo tildes/mayusculas');
assert.ok(gen.sonParecidos('Segun el texto, el autor afirma que la economia crecio en el ultimo año', 'Segun el texto, el autor afirma que la economia crecio en el ultimo año debido a X factor'), 'una es prefijo largo de la otra');
assert.ok(!gen.sonParecidos('Cual es el resultado de 2+2', 'Cual es la capital de Francia'), 'preguntas distintas no son parecidas');
console.log('sonParecidos: OK');

// 4) extraerJSON: con y sin bloque de codigo, y formato invalido
assert.deepEqual(gen.extraerJSON('[{"a":1}]'), [{ a: 1 }]);
assert.deepEqual(gen.extraerJSON('```json\n[{"a":1}]\n```'), [{ a: 1 }]);
assert.equal(gen.extraerJSON('esto no es json'), null);
console.log('extraerJSON: OK');

// 5) generarPreguntas sin API key: devuelve [] sin lanzar
(async () => {
  const r = await gen.generarPreguntas({ materia: 'matematicas', competencia: 'argumentacion', eje: 'algebra_calculo', nivel: 'facil', cantidad: 3, evitar: [] });
  assert.deepEqual(r, []);
  console.log('generarPreguntas sin API key: [] (no lanza)');

  // 6) generarPreguntas con fetch simulado: una pregunta valida, una
  // duplicada de "evitar", y una invalida (opciones repetidas) -> solo 1
  process.env.ANTHROPIC_API_KEY = 'clave-de-prueba';
  const original = global.fetch;
  let bodyCapturado = null;
  global.fetch = async (_url, opts) => {
    bodyCapturado = JSON.parse(opts.body);
    const items = [
      { enunciado: 'Una pregunta nueva de algebra, bastante distinta a las anteriores en el banco.', opcion_a: 'x', opcion_b: 'y', opcion_c: 'z', opcion_d: 'w', respuesta_correcta: 'a', explicacion: 'e' },
      { enunciado: '¿Cuanto es 2 mas 2?', opcion_a: '3', opcion_b: '4', opcion_c: '5', opcion_d: '6', respuesta_correcta: 'b', explicacion: 'suma basica' }, // parecida a "evitar"
      { enunciado: 'Pregunta con opciones repetidas, debe descartarse por invalida.', opcion_a: 'x', opcion_b: 'x', opcion_c: 'z', opcion_d: 'w', respuesta_correcta: 'a', explicacion: 'e' }
    ];
    return { ok: true, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(items) }] }) };
  };
  const r2 = await gen.generarPreguntas({ materia: 'matematicas', competencia: 'argumentacion', eje: 'algebra_calculo', nivel: 'facil', cantidad: 3, evitar: ['¿Cuanto es 2 mas 2?'] });
  assert.ok(bodyCapturado, 'se llego a llamar fetch');
  assert.equal(bodyCapturado.model, 'claude-sonnet-4-5-20250929', 'usa el modelo por defecto si no hay ANTHROPIC_MODEL');
  assert.ok(bodyCapturado.messages[0].content.includes('Argumentaci'), 'el prompt menciona la competencia pedida');
  assert.ok(bodyCapturado.messages[0].content.includes('Cuanto es 2 mas 2'), 'el prompt incluye la pregunta a evitar');
  assert.equal(r2.length, 1, 'descarta la parecida y la invalida, solo queda 1');
  assert.equal(r2[0].materia, 'matematicas');
  assert.equal(r2[0].competencia, 'argumentacion');
  assert.equal(r2[0].eje, 'algebra_calculo');
  console.log('generarPreguntas con fetch simulado: filtra duplicadas e invalidas -> OK (' + r2.length + ' valida)');

  // 7) si la API responde con error HTTP, no lanza, devuelve []
  global.fetch = async () => ({ ok: false, status: 500, text: async () => 'boom' });
  const r3 = await gen.generarPreguntas({ materia: 'matematicas', competencia: 'argumentacion', eje: 'algebra_calculo', nivel: 'facil', cantidad: 2, evitar: [] });
  assert.deepEqual(r3, []);
  console.log('generarPreguntas con error HTTP de la API: [] (no lanza)');

  global.fetch = original;
  console.log('TODO OK');
})().catch(e => { console.error('FALLO', e); process.exit(1); });
