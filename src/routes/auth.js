const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken, requireAuth } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');

const router = express.Router();

const isProd = process.env.NODE_ENV === 'production';
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: isProd,
  maxAge: 30 * 24 * 60 * 60 * 1000
};

function validEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function publicUser(u) {
  return {
    id: u.id, nombre: u.nombre, apellidos: u.apellidos, email: u.email, role: u.role,
    colegio_id: u.colegio_id || null
  };
}

// Registro publico -> siempre crea una cuenta de tipo "estudiante", ligada a
// un colegio (obligatorio). No existe registro publico de administrador ni
// de profesor (los profesores los crea el administrador, ver admin.js).
router.post('/register', asyncHandler(async (req, res) => {
  const { nombre, apellidos, email, password, colegio_id } = req.body || {};

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: 'El nombre es obligatorio.' });
  }
  if (!apellidos || !apellidos.trim()) {
    return res.status(400).json({ error: 'Los apellidos son obligatorios.' });
  }
  if (!validEmail(email)) {
    return res.status(400).json({ error: 'Correo electronico invalido.' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'La contrasena debe tener al menos 6 caracteres.' });
  }
  const colegioIdNum = Number(colegio_id);
  if (!colegioIdNum) {
    return res.status(400).json({ error: 'Selecciona tu colegio.' });
  }
  const colegio = await db.get('SELECT id FROM colegios WHERE id = ?', [colegioIdNum]);
  if (!colegio) {
    return res.status(400).json({ error: 'El colegio seleccionado no es valido.' });
  }

  const existing = await db.get('SELECT id FROM users WHERE email = ?', [email.toLowerCase().trim()]);
  if (existing) {
    return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const info = await db.run(
    'INSERT INTO users (nombre, apellidos, email, password_hash, role, colegio_id) VALUES (?, ?, ?, ?, ?, ?)',
    [nombre.trim(), apellidos.trim(), email.toLowerCase().trim(), hash, 'estudiante', colegioIdNum]
  );

  const user = await db.get('SELECT * FROM users WHERE id = ?', [info.lastInsertRowid]);
  const token = signToken(user);
  res.cookie('token', token, COOKIE_OPTS);
  res.json({ user: publicUser(user) });
}));

// Login unico para los tres tipos de cuenta: el rol lo determina el registro
// en la base de datos, no lo que elija el usuario en el formulario.
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!validEmail(email) || !password) {
    return res.status(400).json({ error: 'Correo o contrasena invalidos.' });
  }

  const user = await db.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase().trim()]);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Correo o contrasena incorrectos.' });
  }

  const token = signToken(user);
  res.cookie('token', token, COOKIE_OPTS);
  res.json({ user: publicUser(user) });
}));

router.post('/logout', (req, res) => {
  res.clearCookie('token', { httpOnly: true, sameSite: 'lax', secure: isProd });
  res.json({ ok: true });
});

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!user) return res.status(401).json({ error: 'Usuario no encontrado.' });
  res.json({ user: publicUser(user) });
}));

module.exports = router;
