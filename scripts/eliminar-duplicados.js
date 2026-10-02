// Elimina preguntas duplicadas del banco de preguntas.
//
// "Duplicada" = misma materia + misma dificultad + mismo enunciado (ignorando
// mayusculas/espacios extra) que otra pregunta ya existente. De cada grupo de
// duplicadas se conserva la mas antigua (la que tiene el created_at mas
// chico) y se borran las demas.
//
// Antes de borrar una pregunta duplicada, este script reasigna (UPDATE) todas
// las respuestas de estudiantes (exam_answers) que apuntaban a esa pregunta
// para que ahora apunten a la pregunta que se conserva. Asi el historial de
// un estudiante (pantalla de revision de un intento ya hecho) no se rompe:
// sigue mostrando la pregunta, solo que ahora es la copia que sobrevive.
//
// Por defecto corre en modo DRY-RUN: solo imprime un reporte de que haria
// (no escribe nada, no borra nada). Para aplicar los cambios de verdad:
//
//   node scripts/eliminar-duplicados.js --aplicar
//
// Es seguro volver a correrlo: si ya no quedan duplicados, no hace nada.

require('dotenv').config();
const db = require('../src/db');

const APLICAR = process.argv.includes('--aplicar');

function clave(s) {
  return (s || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
}

async function main() {
  console.log(APLICAR
    ? '=== Eliminar duplicados (modo real: SI va a borrar) ===\n'
    : '=== DRY-RUN eliminar duplicados (no se borra nada todavia) ===\n');

  await db.initSchema();

  const [preguntas, respuestas] = await Promise.all([
    db.leer('questions'),
    db.leer('exam_answers')
  ]);
  console.log(`Banco de preguntas: ${preguntas.length} preguntas. Respuestas de estudiantes: ${respuestas.length}.\n`);

  const grupos = new Map();
  for (const p of preguntas) {
    const k = clave(p.materia) + '|' + clave(p.dificultad) + '|' + clave(p.enunciado);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(p);
  }

  const gruposDuplicados = [...grupos.values()].filter((g) => g.length > 1);
  if (!gruposDuplicados.length) {
    console.log('No se encontraron preguntas duplicadas. No hay nada que hacer.');
    return;
  }

  console.log(`Grupos de preguntas duplicadas encontrados: ${gruposDuplicados.length}\n`);

  // Agrupa las respuestas existentes por question_id para saber, sin tener
  // que volver a pedirle datos a Roble, cuantas respuestas hay que reasignar
  // por cada pregunta que se va a borrar.
  const respuestasPorPregunta = new Map();
  for (const r of respuestas) {
    const qid = r.question_id;
    if (!qid) continue;
    if (!respuestasPorPregunta.has(qid)) respuestasPorPregunta.set(qid, []);
    respuestasPorPregunta.get(qid).push(r);
  }

  let totalABorrar = 0;
  let totalRespuestasAReasignar = 0;
  let i = 0;

  for (const grupo of gruposDuplicados) {
    i++;
    // La mas antigua (created_at mas chico como texto ISO funciona para
    // ordenar fechas) se conserva; el resto se borra.
    const ordenado = grupo.slice().sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
    const sobrevive = ordenado[0];
    const sobrantes = ordenado.slice(1);

    console.log(`[${i}/${gruposDuplicados.length}] "${sobrevive.enunciado.slice(0, 80)}${sobrevive.enunciado.length > 80 ? '...' : ''}"`);
    console.log(`  materia=${sobrevive.materia} dificultad=${sobrevive.dificultad} -> conserva id=${sobrevive.id} (created_at=${sobrevive.created_at || 'sin fecha'})`);

    for (const dup of sobrantes) {
      const resp = respuestasPorPregunta.get(dup.id) || [];
      totalABorrar++;
      totalRespuestasAReasignar += resp.length;
      console.log(`  borra id=${dup.id} (created_at=${dup.created_at || 'sin fecha'})${resp.length ? `, reasigna ${resp.length} respuesta(s) de estudiantes` : ''}`);

      if (APLICAR) {
        for (const r of resp) {
          await db.actualizar('exam_answers', r.id, { question_id: sobrevive.id });
        }
        await db.borrar('questions', dup.id);
      }
    }
    console.log('');
  }

  console.log(`Total preguntas duplicadas ${APLICAR ? 'borradas' : 'a borrar'}: ${totalABorrar}`);
  console.log(`Total respuestas de estudiantes ${APLICAR ? 'reasignadas' : 'a reasignar'}: ${totalRespuestasAReasignar}`);
  console.log(APLICAR
    ? '\nListo, se aplicaron los cambios.'
    : '\nEsto fue un dry-run, no se borro nada. Si el reporte de arriba se ve bien, corre:\n  node scripts/eliminar-duplicados.js --aplicar');
}

main().catch((err) => {
  console.error('Error eliminando duplicados:', err);
  process.exit(1);
});
