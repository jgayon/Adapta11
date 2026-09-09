require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./db');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@rutasaber.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'RutaSaber2026!';
const ADMIN_NOMBRE = process.env.ADMIN_NOMBRE || 'Administrador';
const ADMIN_APELLIDOS = process.env.ADMIN_APELLIDOS || 'Ruta Saber';

async function seedAdmin() {
  const existente = await db.get('SELECT * FROM users WHERE email = ?', [ADMIN_EMAIL.toLowerCase()]);
  const hash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
  if (existente) {
    // Idempotente: asegura que el rol sea administrador, pero no pisa la
    // contrasena si ya fue cambiada manualmente en la base de datos.
    if (existente.role !== 'administrador') {
      await db.run('UPDATE users SET role = ? WHERE id = ?', ['administrador', existente.id]);
      console.log('[seed] Cuenta existente actualizada a administrador:', ADMIN_EMAIL);
    } else {
      console.log('[seed] La cuenta administrador ya existe:', ADMIN_EMAIL);
    }
    return;
  }
  await db.run(
    'INSERT INTO users (nombre, apellidos, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
    [ADMIN_NOMBRE, ADMIN_APELLIDOS, ADMIN_EMAIL.toLowerCase(), hash, 'administrador']
  );
  console.log(`[seed] Cuenta administrador creada -> email: ${ADMIN_EMAIL}  password: ${ADMIN_PASSWORD}`);
}

function seedQuestionsData() {
  return [
    { materia: 'lectura_critica', dificultad: 'facil',
      texto_base: 'El colibrí es una de las aves más pequeñas del mundo. A pesar de su tamaño, es capaz de volar hacia atrás, una habilidad que casi ninguna otra ave posee. Sus alas se mueven decenas de veces por segundo, lo que produce el zumbido que le da su nombre.',
      enunciado: 'Según el texto, ¿qué hace especial al colibrí entre las aves?',
      opcion_a: 'Su canto melodioso', opcion_b: 'Su capacidad de volar hacia atrás', opcion_c: 'Su tamaño gigante', opcion_d: 'Su capacidad de nadar',
      respuesta_correcta: 'b', explicacion: 'El texto dice explícitamente que el colibrí puede volar hacia atrás.' },
    { materia: 'lectura_critica', dificultad: 'facil',
      texto_base: 'En muchas ciudades colombianas se han instalado puntos de reciclaje separados por colores: verde para orgánicos, azul para plástico y vidrio, y gris para papel y cartón. La correcta separación facilita que los materiales puedan reutilizarse.',
      enunciado: '¿Cuál es el propósito principal de separar los residuos por colores, según el texto?',
      opcion_a: 'Decorar las calles', opcion_b: 'Facilitar la reutilización de los materiales', opcion_c: 'Reducir el tráfico vehicular', opcion_d: 'Aumentar el precio de la basura',
      respuesta_correcta: 'b', explicacion: 'El texto indica que la separación facilita la reutilización.' },
    { materia: 'lectura_critica', dificultad: 'facil',
      texto_base: 'Ana llegó tarde a la reunión porque el bus se demoró más de lo normal. Cuando finalmente llegó, se disculpó con sus compañeros y explicó lo ocurrido.',
      enunciado: '¿Por qué llegó tarde Ana a la reunión?',
      opcion_a: 'Porque se quedó dormida', opcion_b: 'Porque el bus se demoró', opcion_c: 'Porque olvidó la dirección', opcion_d: 'Porque decidió no asistir',
      respuesta_correcta: 'b', explicacion: 'El texto lo dice directamente: el bus se demoró.' },
    { materia: 'lectura_critica', dificultad: 'media',
      texto_base: 'Aunque muchos creen que el café colombiano debe su calidad únicamente al clima, los caficultores insisten en que el cuidado artesanal en la recolección —escogiendo grano por grano solo los que están maduros— es tan determinante como la altitud o la temperatura.',
      enunciado: '¿Cuál es la idea principal que defienden los caficultores según el texto?',
      opcion_a: 'El clima es lo único que importa en la calidad del café', opcion_b: 'El cuidado en la recolección es tan importante como el clima', opcion_c: 'La altitud no influye en el café', opcion_d: 'La recolección mecánica es mejor que la manual',
      respuesta_correcta: 'b', explicacion: 'Los caficultores sostienen que ambos factores pesan por igual.' },
    { materia: 'lectura_critica', dificultad: 'media',
      texto_base: 'El escritor argumenta que la lectura en pantalla y en papel activan procesos cognitivos distintos: el papel favorecería una comprensión más profunda y la pantalla una lectura más rápida pero superficial. Sin embargo, reconoce que la evidencia científica al respecto aún no es concluyente.',
      enunciado: '¿Qué actitud asume el autor frente a esa comparación?',
      opcion_a: 'Afirma con certeza que el papel es siempre mejor', opcion_b: 'Descarta cualquier diferencia entre ambos formatos', opcion_c: 'Presenta una posible diferencia, pero admite que falta evidencia', opcion_d: 'Sostiene que la pantalla es superior para toda lectura',
      respuesta_correcta: 'c', explicacion: 'El autor matiza su argumento reconociendo falta de evidencia concluyente.' },
    { materia: 'lectura_critica', dificultad: 'media',
      texto_base: '—No es que no quiera ir —dijo Marcos—, es que no puedo. Tengo un compromiso que no puedo cancelar. Ojalá pudiera estar en los dos lugares.',
      enunciado: '¿Qué se puede inferir sobre la actitud de Marcos hacia la invitación?',
      opcion_a: 'No le interesa en absoluto', opcion_b: 'Le gustaría asistir, pero tiene otro compromiso', opcion_c: 'Está molesto con quien lo invitó', opcion_d: 'Ya había decidido no ir desde antes',
      respuesta_correcta: 'b', explicacion: 'Marcos expresa deseo de asistir pero un impedimento real.' },
    { materia: 'lectura_critica', dificultad: 'dificil',
      texto_base: 'Algunos sostienen que la tecnología aumenta la desigualdad porque solo quienes tienen acceso a ella aprovechan sus beneficios. Otros replican que toda tecnología nueva comienza siendo costosa y exclusiva, pero tiende a masificarse con el tiempo, como ocurrió con la electricidad o los teléfonos móviles. El riesgo real, afirman estos últimos, está en la ausencia de políticas públicas que aceleren un acceso equitativo.',
      enunciado: '¿Cuál es la función del ejemplo de la electricidad y los teléfonos móviles en el texto?',
      opcion_a: 'Demostrar que la tecnología siempre es negativa', opcion_b: 'Contradecir la idea de que la tecnología aumenta la desigualdad de forma permanente', opcion_c: 'Probar que el acceso a la tecnología nunca cambia', opcion_d: 'Reforzar que las políticas públicas son innecesarias',
      respuesta_correcta: 'b', explicacion: 'El ejemplo histórico respalda la réplica de que la exclusividad tecnológica es temporal.' },
    { materia: 'lectura_critica', dificultad: 'dificil',
      texto_base: 'La ironía de cierta literatura contemporánea radica en que critica la superficialidad de la vida moderna utilizando, precisamente, los recursos más superficiales del lenguaje: frases cortas, referencias fugaces, un ritmo que imita el desplazamiento constante de una pantalla.',
      enunciado: '¿Qué recurso retórico describe principalmente el texto?',
      opcion_a: 'Una comparación entre dos autores', opcion_b: 'Una contradicción entre la forma y el contenido de la crítica', opcion_c: 'Una enumeración de técnicas narrativas', opcion_d: 'Una defensa cerrada de la literatura clásica',
      respuesta_correcta: 'b', explicacion: 'El texto señala que la forma reproduce lo que el contenido critica.' },
    { materia: 'lectura_critica', dificultad: 'dificil',
      texto_base: 'Si toda norma admite excepciones, entonces la afirmación "ninguna norma admite excepciones" sería, en sí misma, una norma sin excepciones, lo cual la volvería contradictoria si se aplicara a sí misma.',
      enunciado: 'El texto plantea principalmente:',
      opcion_a: 'Una anécdota personal', opcion_b: 'Una paradoja lógica sobre la autoaplicación de una norma', opcion_c: 'Una crítica al sistema judicial', opcion_d: 'Una definición técnica de norma jurídica',
      respuesta_correcta: 'b', explicacion: 'Es un razonamiento sobre una norma que se contradice al aplicarse a sí misma.' },
    { materia: 'matematicas', dificultad: 'facil',
      enunciado: 'Un bus tiene 40 puestos. Si ya viajan 27 pasajeros, ¿cuántos puestos quedan disponibles?',
      opcion_a: '12', opcion_b: '13', opcion_c: '14', opcion_d: '67', respuesta_correcta: 'b', explicacion: '40 − 27 = 13.' },
    { materia: 'matematicas', dificultad: 'facil',
      enunciado: '¿Cuál es el resultado de 15% de 200?',
      opcion_a: '20', opcion_b: '25', opcion_c: '30', opcion_d: '35', respuesta_correcta: 'c', explicacion: '0.15 × 200 = 30.' },
    { materia: 'matematicas', dificultad: 'facil',
      enunciado: 'Si un lápiz cuesta $1.200 y compras 4, ¿cuánto pagas en total?',
      opcion_a: '$3.600', opcion_b: '$4.200', opcion_c: '$4.800', opcion_d: '$5.200', respuesta_correcta: 'c', explicacion: '1.200 × 4 = 4.800.' },
    { materia: 'matematicas', dificultad: 'media',
      enunciado: 'Un carro recorre 60 km en 45 minutos manteniendo velocidad constante. ¿Cuál es su velocidad en km/h?',
      opcion_a: '60 km/h', opcion_b: '75 km/h', opcion_c: '80 km/h', opcion_d: '90 km/h', respuesta_correcta: 'c', explicacion: '60 km en 0.75 h equivalen a 80 km/h.' },
    { materia: 'matematicas', dificultad: 'media',
      enunciado: 'La suma de tres números consecutivos es 72. ¿Cuál es el mayor de ellos?',
      opcion_a: '23', opcion_b: '24', opcion_c: '25', opcion_d: '26', respuesta_correcta: 'c', explicacion: 'n+(n+1)+(n+2)=72 → n=23; el mayor es 25.' },
    { materia: 'matematicas', dificultad: 'media',
      enunciado: 'En una tienda, un producto tiene un descuento del 20% y queda en $48.000. ¿Cuál era su precio original?',
      opcion_a: '$52.000', opcion_b: '$56.000', opcion_c: '$58.000', opcion_d: '$60.000', respuesta_correcta: 'd', explicacion: 'precio × 0.8 = 48.000 → precio = 60.000.' },
    { materia: 'matematicas', dificultad: 'dificil',
      enunciado: 'Si 2x² − 8 = 10, ¿cuál es el valor positivo de x?',
      opcion_a: '2', opcion_b: '3', opcion_c: '4', opcion_d: '5', respuesta_correcta: 'b', explicacion: '2x²=18 → x²=9 → x=3.' },
    { materia: 'matematicas', dificultad: 'dificil',
      enunciado: 'Una piscina se llena con dos llaves: la llave A sola la llena en 6 horas y la llave B sola en 3 horas. Si se abren ambas a la vez, ¿en cuántas horas se llena?',
      opcion_a: '1.5 horas', opcion_b: '2 horas', opcion_c: '2.5 horas', opcion_d: '4.5 horas', respuesta_correcta: 'b', explicacion: '1/6 + 1/3 = 1/2 → 2 horas.' },
    { materia: 'matematicas', dificultad: 'dificil',
      enunciado: 'En una progresión geométrica, el primer término es 3 y la razón es 2. ¿Cuál es el sexto término?',
      opcion_a: '48', opcion_b: '64', opcion_c: '96', opcion_d: '192', respuesta_correcta: 'c', explicacion: '3 × 2⁵ = 96.' }
  ];
}

async function seedQuestions() {
  const row = await db.get('SELECT COUNT(*) as c FROM questions');
  if (row.c > 0) {
    console.log('[seed] El banco de preguntas ya tiene datos, no se vuelve a sembrar.');
    return;
  }
  const preguntas = seedQuestionsData();
  const statements = preguntas.map((p) => ({
    sql: `INSERT INTO questions (materia, dificultad, texto_base, enunciado, opcion_a, opcion_b, opcion_c, opcion_d, respuesta_correcta, explicacion, imagen, activo)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1)`,
    args: [p.materia, p.dificultad, p.texto_base || null, p.enunciado, p.opcion_a, p.opcion_b, p.opcion_c, p.opcion_d, p.respuesta_correcta, p.explicacion || null]
  }));
  await db.batch(statements);
  console.log(`[seed] Se cargaron ${preguntas.length} preguntas de ejemplo.`);
}

(async () => {
  try {
    await db.initSchema();
    await seedAdmin();
    await seedQuestions();
    console.log('[seed] Listo.');
    process.exit(0);
  } catch (err) {
    console.error('[seed] Error:', err);
    process.exit(1);
  }
})();
