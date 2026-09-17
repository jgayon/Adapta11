const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { buscarColegioPorNombre } = require('../lib/colegios');

const router = express.Router();

// Publico: lista simple para el selector de colegio en el registro de
// estudiantes (no requiere sesion iniciada).
router.get('/', asyncHandler(async (req, res) => {
  const colegios = await db.all('SELECT id, nombre FROM colegios ORDER BY nombre');
  res.json({ colegios });
}));

// Administrador: lista con conteo de profesores y estudiantes, para el panel
// de administracion de colegios.
router.get('/detalle', requireAdmin, asyncHandler(async (req, res) => {
  const colegios = await db.all(`
    SELECT c.id, c.nombre, c.created_at,
      (SELECT COUNT(*) FROM users WHERE colegio_id = c.id AND role = 'estudiante') as num_estudiantes,
      (SELECT COUNT(*) FROM users WHERE colegio_id = c.id AND role = 'profesor') as num_profesores
    FROM colegios c ORDER BY c.nombre
  `);
  res.json({ colegios });
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

  const info = await db.run('INSERT INTO colegios (nombre) VALUES (?)', [nombre]);
  const colegio = await db.get('SELECT * FROM colegios WHERE id = ?', [info.lastInsertRowid]);
  res.status(201).json({ colegio });
}));

module.exports = router;
