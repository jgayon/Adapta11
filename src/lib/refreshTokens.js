// Refresh tokens revocables, guardados en la tabla `refresh_tokens` de Roble
// (ver scripts/cambios-roble.sql). Nunca se guarda el token en texto plano,
// solo su hash; lo que viaja en la cookie del navegador es el valor crudo.
//
// Rotacion: cada vez que se usa un refresh token para pedir un access token
// nuevo, ese refresh token se marca revocado y se entrega uno nuevo. Si
// alguien reutiliza un refresh token ya usado (por ejemplo, uno robado), se
// encuentra revocado y la renovacion falla, obligando a iniciar sesion de
// nuevo. Esto tambien permite cerrar una sola sesion/dispositivo sin afectar
// las demas (logout revoca solo el refresh token de esa cookie).

const crypto = require('crypto');
const db = require('../db');

const DIAS_EXPIRA = 30;

function generar() {
  return crypto.randomBytes(48).toString('hex');
}
function hash(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

async function crear(userId) {
  const raw = generar();
  const expira = new Date(Date.now() + DIAS_EXPIRA * 24 * 60 * 60 * 1000).toISOString();
  await db.crear('refresh_tokens', {
    user_id: String(userId),
    token_hash: hash(raw),
    expira,
    revocado: false
  });
  return { raw, expira };
}

// Valida un refresh token recibido del navegador y, si es valido, lo rota:
// revoca el actual y crea uno nuevo. Devuelve null si no sirve (no existe,
// ya vencio o ya estaba revocado).
async function rotar(rawToken) {
  if (!rawToken) return null;
  const filas = await db.leer('refresh_tokens', { token_hash: hash(rawToken) });
  const fila = filas[0];
  if (!fila || fila.revocado === true || new Date(fila.expira) < new Date()) return null;

  await db.actualizar('refresh_tokens', fila.id, { revocado: true });
  const nuevo = await crear(fila.user_id);
  return { userId: fila.user_id, raw: nuevo.raw, expira: nuevo.expira };
}

async function revocar(rawToken) {
  if (!rawToken) return;
  const filas = await db.leer('refresh_tokens', { token_hash: hash(rawToken) });
  if (filas[0]) await db.actualizar('refresh_tokens', filas[0].id, { revocado: true });
}

module.exports = { crear, rotar, revocar };
