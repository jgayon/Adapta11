const db = require('../db');

// Busca un colegio por nombre sin distinguir mayusculas/minusculas, para que
// "Sagrada Familia" y "sagrada familia" se traten como el mismo colegio en
// vez de crear registros duplicados. Se usa tanto en el registro publico de
// estudiantes como en la creacion manual de colegios por el administrador,
// para que ambos caminos se comporten igual.
async function buscarColegioPorNombre(nombre) {
  return db.get('SELECT id, nombre FROM colegios WHERE LOWER(nombre) = LOWER(?)', [nombre]);
}

// Busca un colegio por nombre y, si no existe, lo crea. Asi el estudiante
// puede escribir su colegio aunque el administrador todavia no lo haya
// registrado, y dos estudiantes del mismo colegio que escriban el nombre
// igual (ignorando mayusculas) quedan en el mismo colegio en vez de crear
// uno duplicado por cada registro.
async function obtenerOCrearColegio(nombre) {
  const existente = await buscarColegioPorNombre(nombre);
  if (existente) return existente.id;
  try {
    const info = await db.run('INSERT INTO colegios (nombre) VALUES (?)', [nombre]);
    return info.lastInsertRowid;
  } catch (err) {
    // Condicion de carrera: alguien registro el mismo colegio justo antes.
    const otra = await buscarColegioPorNombre(nombre);
    if (otra) return otra.id;
    throw err;
  }
}

module.exports = { buscarColegioPorNombre, obtenerOCrearColegio };
