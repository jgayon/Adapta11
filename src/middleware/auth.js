const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-cambia-esto';

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies.token;
  if (!token) return res.status(401).json({ error: 'No has iniciado sesion.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sesion invalida o expirada. Inicia sesion de nuevo.' });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'administrador') {
      return res.status(403).json({ error: 'Se requieren permisos de administrador.' });
    }
    next();
  });
}

function requireEstudiante(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'estudiante') {
      return res.status(403).json({ error: 'Esta seccion es solo para estudiantes.' });
    }
    next();
  });
}

// Administrador de colegio (profesor): solo ve estadisticas de su propio
// colegio, nunca el banco de preguntas ni otros colegios.
function requireProfesor(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'profesor') {
      return res.status(403).json({ error: 'Esta seccion es solo para administradores de colegio.' });
    }
    next();
  });
}

// Cualquiera de los dos roles con acceso a estadisticas (el administrador ve
// todo sin filtrar por colegio; las rutas que usan esto deben aplicar su
// propio filtro segun req.user.role).
function requireAdminOProfesor(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'administrador' && req.user.role !== 'profesor') {
      return res.status(403).json({ error: 'No tienes permisos para ver esta seccion.' });
    }
    next();
  });
}

// El access token ahora dura poco (antes vivia 30 dias el solo). La sesion
// larga la sostiene el refresh token (ver lib/refreshTokens.js), que es
// revocable; el access token, al ser de corta duracion, limita el dano si se
// llegara a filtrar. El frontend (public/js/app.js, funcion api()) renueva
// el access token automaticamente contra POST /auth/refresh cuando vence.
function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      nombre: user.nombre,
      apellidos: user.apellidos,
      role: user.role,
      colegio_id: user.colegio_id || null
    },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
}

module.exports = {
  requireAuth, requireAdmin, requireEstudiante, requireProfesor, requireAdminOProfesor, signToken, JWT_SECRET
};
