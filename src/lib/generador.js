// Generador de preguntas de RESPALDO con la API de Claude (Anthropic), para
// cuando el banco de preguntas no tiene suficientes para una combinacion de
// materia/competencia/eje/nivel (ver GET /practice y GET /adaptive en
// routes/questions.js). Las preguntas que devuelve este modulo se guardan
// marcadas como `origen: 'ia'` y `validada: false`: se le muestran al
// estudiante de una vez (para que la practica no se quede corta ni le
// repita siempre las mismas preguntas), pero quedan pendientes de que un
// administrador las revise y las apruebe -o las borre- desde el panel
// (ver PUT /:id/validar). NUNCA se usan en el Simulacro (GET
// /simulacro-pool filtra `validada !== false`), solo como respaldo en
// Practica.
//
// Requiere ANTHROPIC_API_KEY en el .env (ver .env.example). Si no esta
// configurada, o si la llamada falla por cualquier razon (red, limite de
// uso, formato de respuesta invalido, etc.), este modulo no genera nada y
// no lanza: la practica sigue funcionando igual que antes, solo con menos
// preguntas de las pedidas. Nunca se confia en el contenido que devuelve el
// modelo sin validarlo primero (ver validarItem).

const { COMPETENCIA_LABEL } = require('./selector');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
// Verificar el identificador de modelo vigente en
// https://docs.claude.com/en/docs/about-claude/models y ajustarlo con
// ANTHROPIC_MODEL en el .env si este queda desactualizado.
const MODELO_DEFECTO = 'claude-sonnet-4-5-20250929';
// Tope de preguntas generadas por peticion del estudiante: evita que una
// sola practica con el banco muy corto dispare una llamada larga o costosa.
const MAX_POR_LLAMADA = 5;

const EJE_LABEL = {
  literario: 'Texto literario',
  informativo: 'Texto informativo',
  algebra_calculo: 'Algebra y calculo',
  geometria: 'Geometria',
  estadistica: 'Estadistica'
};
const NIVEL_LABEL = { facil: 'facil', medio: 'medio', dificil: 'dificil' };
const LETRAS = ['a', 'b', 'c', 'd'];

function disponible() {
  return !!process.env.ANTHROPIC_API_KEY;
}

// Normaliza texto para comparar duplicados: minusculas, sin tildes, sin
// signos de puntuacion, espacios colapsados.
function normalizarTexto(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Dos enunciados se consideran "muy parecidos" si, una vez normalizados, son
// iguales o uno es basicamente el arranque del otro (patron tipico de una
// reformulacion superficial del modelo sobre una pregunta que ya existe).
function sonParecidos(a, b) {
  const na = normalizarTexto(a);
  const nb = normalizarTexto(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const corto = na.length <= nb.length ? na : nb;
  const largo = na.length <= nb.length ? nb : na;
  return corto.length >= 20 && largo.startsWith(corto.slice(0, Math.min(60, corto.length)));
}

function construirPrompt({ materia, competencia, eje, nivel, cantidad, evitar }) {
  const materiaLabel = materia === 'matematicas' ? 'Matematicas' : 'Lectura Critica';
  const compLabel = COMPETENCIA_LABEL[competencia] || competencia;
  const ejeLabel = EJE_LABEL[eje] || eje;
  const nivelTxt = NIVEL_LABEL[nivel] ? ('de dificultad ' + NIVEL_LABEL[nivel]) : 'de dificultad variada';
  const listaEvitar = (evitar || []).slice(0, 12).map((e, i) => (i + 1) + '. ' + String(e).slice(0, 160)).join('\n');

  return 'Eres un generador de preguntas de practica tipo examen Saber 11 (ICFES) ' +
    'para la app educativa "Ruta Saber". Escribe ' + cantidad + ' pregunta(s) de ' +
    'opcion multiple con unica respuesta, ORIGINALES (nunca copies ni parafrasees ' +
    'preguntas reales de examenes Icfes ni de ningun banco existente), para:\n\n' +
    '- Materia: ' + materiaLabel + '\n' +
    '- Competencia: ' + compLabel + '\n' +
    '- Eje tematico: ' + ejeLabel + '\n' +
    '- Nivel ' + nivelTxt + '\n\n' +
    (listaEvitar ? ('No repitas el tema ni el enfoque de estas preguntas que YA existen ' +
      'en el banco (evita parecerte a ellas):\n' + listaEvitar + '\n\n') : '') +
    'Cada pregunta debe tener exactamente 4 opciones (a, b, c, d), todas distintas ' +
    'entre si, con una sola respuesta correcta, y una explicacion breve (1-2 frases) ' +
    'de por que esa es la respuesta correcta.\n\n' +
    'Responde UNICAMENTE con un arreglo JSON (sin texto antes ni despues, sin bloques ' +
    'de codigo), con exactamente esta forma por cada pregunta:\n' +
    '[{"enunciado": "...", "opcion_a": "...", "opcion_b": "...", "opcion_c": "...", ' +
    '"opcion_d": "...", "respuesta_correcta": "a", "explicacion": "..."}]';
}

function extraerJSON(texto) {
  let t = String(texto || '').trim();
  // Por si el modelo igual envuelve la respuesta en un bloque de codigo.
  t = t.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const inicio = t.indexOf('[');
  const fin = t.lastIndexOf(']');
  if (inicio === -1 || fin === -1 || fin < inicio) return null;
  try {
    return JSON.parse(t.slice(inicio, fin + 1));
  } catch {
    return null;
  }
}

// Valida un item devuelto por el modelo contra la forma esperada. Nunca se
// confia en el modelo: cualquier campo invalido descarta la pregunta
// completa (no se intenta "arreglar" el contenido).
function validarItem(item) {
  if (!item || typeof item !== 'object') return null;
  const enunciado = String(item.enunciado || '').trim();
  if (enunciado.length < 15 || enunciado.length > 800) return null;
  const opciones = {};
  for (const l of LETRAS) {
    const v = String(item['opcion_' + l] || '').trim();
    if (!v || v.length > 300) return null;
    opciones[l] = v;
  }
  const vistos = new Set(Object.values(opciones).map(normalizarTexto));
  if (vistos.size < LETRAS.length) return null; // dos opciones iguales
  const correcta = String(item.respuesta_correcta || '').toLowerCase().trim();
  if (!LETRAS.includes(correcta)) return null;
  const explicacion = item.explicacion ? String(item.explicacion).trim().slice(0, 500) : null;
  return {
    enunciado,
    opcion_a: opciones.a, opcion_b: opciones.b, opcion_c: opciones.c, opcion_d: opciones.d,
    respuesta_correcta: correcta,
    explicacion
  };
}

// Pide `cantidad` preguntas nuevas a la API de Claude para la combinacion
// dada y devuelve solo las que pasaron la validacion y no se parecen a las
// de `evitar` (puede ser menos de `cantidad`, o un arreglo vacio si algo
// fallo: API no configurada, red, formato invalido, etc. -- nunca lanza).
async function generarPreguntas({ materia, competencia, eje, nivel, cantidad, evitar }) {
  if (!disponible()) return [];
  const pedir = Math.min(Math.max(1, Number(cantidad) || 1), MAX_POR_LLAMADA);

  let data;
  try {
    const resp = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || MODELO_DEFECTO,
        max_tokens: Math.min(4096, 600 * pedir + 400),
        messages: [{ role: 'user', content: construirPrompt({ materia, competencia, eje, nivel, cantidad: pedir, evitar }) }]
      })
    });
    if (!resp.ok) {
      console.error('generador: la API de Claude respondio', resp.status, await resp.text().catch(() => ''));
      return [];
    }
    data = await resp.json();
  } catch (err) {
    console.error('generador: fallo la llamada a la API de Claude:', err.message);
    return [];
  }

  const texto = data && data.content && data.content[0] && data.content[0].text;
  const items = extraerJSON(texto);
  if (!Array.isArray(items)) {
    console.error('generador: la respuesta de Claude no fue un arreglo JSON valido');
    return [];
  }

  const existentes = (evitar || []).slice();
  const resultado = [];
  for (const item of items) {
    const valido = validarItem(item);
    if (!valido) continue;
    if (existentes.some((e) => sonParecidos(e, valido.enunciado))) continue;
    existentes.push(valido.enunciado);
    resultado.push({ ...valido, materia, competencia, eje });
    if (resultado.length >= pedir) break;
  }
  return resultado;
}

module.exports = { disponible, generarPreguntas, normalizarTexto, sonParecidos, validarItem, extraerJSON };
