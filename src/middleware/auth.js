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

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, nombre: user.nombre, apellidos: user.apellidos, role: user.role },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

module.exports = { requireAuth, requireAdmin, requireEstudiante, signToken, JWT_SECRET };
