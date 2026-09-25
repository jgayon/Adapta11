const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { buscarColegioPorNombre } = require('../lib/colegios');

const router = express.Router();

// Publico: lista simple para el selector de colegio en el registro de
// estudiantes (no requiere sesion iniciada). "no-store" evita que el
// navegador devuelva una copia en cache cuando un colegio se creo despues de
// la primera visita a la pagina de registro.
router.get('/', asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const colegios = await db.leer('colegios');
  colegios.sort((a, b) => a.nombre.localeCompare(b.nombre));
  res.json({ colegios: colegios.map((c) => ({ id: c.id, nombre: c.nombre })) });
}));

// Administrador: lista con conteo de profesores y estudiantes, para el panel
// de administracion de colegios.
router.get('/detalle', requireAdmin, asyncHandler(async (req, res) => {
  const [colegios, usuarios] = await Promise.all([
    db.leer('colegios'),
    db.leer('users')
  ]);
  const resultado = colegios.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    created_at: c.created_at,
    num_estudiantes: usuarios.filter((u) => u.colegio_id === c.id && u.role === 'estudiante').length,
    num_profesores: usuarios.filter((u) => u.colegio_id === c.id && u.role === 'profesor').length
  })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  res.json({ colegios: resultado });
}));

// Administrador: crear un colegio nuevo.
router.post('/', requireAdmin, asyncHandler(async (req, res) => {
  const nombre = (req.body && req.body.nombre ? String(req.body.nombre) : '').trim();
  if (!nombre) return res.status(400).json({ error: 'El nombre del colegio es obligatorio.' });

  // Comparacion sin distinguir mayusculas/minusculas (misma logica que el
  // registro de estudiantes en auth.js), para no crear un colegio duplicado
  // cuando ya existe uno con el mismo nombre escrito con otra capitalizacion
  // (por ejemplo "sagrada familia" creado automaticamente al registrarse un
  // estudiante, y luego "Sagrada Familia" creado a mano por el administrador).
  const existente = await buscarColegioPorNombre(nombre);
  if (existente) {
    return res.status(409).json({ error: `Ya existe un colegio registrado como "${existente.nombre}".` });
  }

  const colegio = await db.crear('colegios', { nombre });
  res.status(201).json({ colegio });
}));

module.exports = router;
