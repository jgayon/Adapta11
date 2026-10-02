const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken, requireAuth } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { obtenerOCrearColegio } = require('../lib/colegios');
const refreshTokens = require('../lib/refreshTokens');

const router = express.Router();

const isProd = process.env.NODE_ENV === 'production';

// Access token: vive poco (15 min, ver middleware/auth.js) y viaja en cada
// peticion a la API.
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: isProd,
  maxAge: 15 * 60 * 1000
};
// Refresh token: vive mucho mas (30 dias) pero solo viaja hacia /api/auth/*
// (login, refresh, logout), nunca en el resto de la API, para exponerlo lo
// menos posible. Es revocable (ver lib/refreshTokens.js): logout o un reuso
// detectado lo invalidan sin tener que esperar a que expire solo.
const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: isProd,
  path: '/api/auth',
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

async function buscarUsuarioPorEmail(email) {
  const filas = await db.leer('users', { email });
  return filas[0] || null;
}

async function emitirSesion(res, user) {
  const access = signToken(user);
  const refresh = await refreshTokens.crear(user.id);
  res.cookie('token', access, COOKIE_OPTS);
  res.cookie('refresh_token', refresh.raw, REFRESH_COOKIE_OPTS);
}

function limpiarCookiesSesion(res) {
  res.clearCookie('token', { httpOnly: true, sameSite: 'lax', secure: isProd });
  res.clearCookie('refresh_token', { httpOnly: true, sameSite: 'lax', secure: isProd, path: '/api/auth' });
}

// Registro publico -> siempre crea una cuenta de tipo "estudiante", ligada a
// un colegio (obligatorio). No existe registro publico de administrador ni
// de profesor (los profesores los crea el administrador, ver admin.js).
router.post('/register', asyncHandler(async (req, res) => {
  const { nombre, apellidos, email, password, colegio } = req.body || {};

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
  const colegioNombre = colegio ? String(colegio).trim() : '';
  if (!colegioNombre) {
    return res.status(400).json({ error: 'Escribe o busca tu colegio.' });
  }
  if (colegioNombre.length > 150) {
    return res.status(400).json({ error: 'El nombre del colegio es demasiado largo.' });
  }
  const colegioId = await obtenerOCrearColegio(colegioNombre);

  const emailNormalizado = email.toLowerCase().trim();
  const existing = await buscarUsuarioPorEmail(emailNormalizado);
  if (existing) {
    return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const user = await db.crear('users', {
    nombre: nombre.trim(),
    apellidos: apellidos.trim(),
    email: emailNormalizado,
    password_hash: hash,
    role: 'estudiante',
    colegio_id: colegioId,
    email_confirmado: true // el registro publico (siempre estudiante) no requiere confirmar correo
  });

  await emitirSesion(res, user);
  res.json({ user: publicUser(user) });
}));

// Login unico para los tres tipos de cuenta: el rol lo determina el registro
// en la base de datos, no lo que elija el usuario en el formulario.
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!validEmail(email) || !password) {
    return res.status(400).json({ error: 'Correo o contrasena invalidos.' });
  }

  const user = await buscarUsuarioPorEmail(email.toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Correo o contrasena incorrectos.' });
  }

  // Las cuentas de profesor las crea el administrador (ver admin.js) con
  // email_confirmado=false y un correo de confirmacion enviado al profesor;
  // no pueden entrar hasta que confirmen. Estudiantes y administradores no
  // pasan por esto (email_confirmado=true desde que se crean).
  if (user.role === 'profesor' && user.email_confirmado === false) {
    return res.status(403).json({
      error: 'Todavia no confirmas tu correo. Revisa tu bandeja de entrada (y spam) y entra al enlace de confirmacion antes de iniciar sesion.'
    });
  }

  await emitirSesion(res, user);
  res.json({ user: publicUser(user) });
}));

router.post('/logout', asyncHandler(async (req, res) => {
  const refreshCookie = req.cookies && req.cookies.refresh_token;
  if (refreshCookie) await refreshTokens.revocar(refreshCookie);
  limpiarCookiesSesion(res);
  res.json({ ok: true });
}));

// Renueva el access token usando el refresh token (cookie aparte, de mas
// larga duracion). El frontend llama esto solo (ver public/js/app.js,
// funcion api()) cuando una peticion normal responde 401 por access token
// vencido; no hace falta que el usuario haga nada.
router.post('/refresh', asyncHandler(async (req, res) => {
  const refreshCookie = req.cookies && req.cookies.refresh_token;
  const resultado = refreshCookie ? await refreshTokens.rotar(refreshCookie) : null;
  if (!resultado) {
    limpiarCookiesSesion(res);
    return res.status(401).json({ error: 'Sesion vencida, inicia sesion de nuevo.' });
  }

  const user = await db.porId('users', resultado.userId);
  if (!user) {
    limpiarCookiesSesion(res);
    return res.status(401).json({ error: 'Usuario no encontrado.' });
  }

  res.cookie('token', signToken(user), COOKIE_OPTS);
  res.cookie('refresh_token', resultado.raw, REFRESH_COOKIE_OPTS);
  res.json({ ok: true });
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await db.porId('users', req.user.id);
  if (!user) return res.status(401).json({ error: 'Usuario no encontrado.' });
  res.json({ user: publicUser(user) });
}));

// Enlace que recibe el profesor por correo (ver lib/correo.js y admin.js).
// Es publico a proposito: el propio token largo e impredecible en la URL es
// la prueba de que quien entra es el dueño del correo, no hace falta sesion.
router.get('/confirmar', asyncHandler(async (req, res) => {
  const token = req.query.token ? String(req.query.token) : '';
  const filas = token ? await db.leer('users', { confirmacion_token: token }) : [];
  const user = filas[0] || null;
  const vencido = user && user.confirmacion_expira && new Date(user.confirmacion_expira) < new Date();

  if (!user || vencido) {
    return res.redirect('/?confirmado=0');
  }

  await db.actualizar('users', user.id, {
    email_confirmado: true,
    confirmacion_token: null,
    confirmacion_expira: null
  });
  res.redirect('/?confirmado=1');
}));

module.exports = router;
