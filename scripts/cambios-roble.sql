-- Cambios de esquema en Roble para: imagenes por opcion de respuesta,
-- confirmacion de correo para profesores, y refresh tokens revocables.
--
-- Como aplicarlo: panel de Roble (https://roble.test-openlab.uninorte.edu.co/)
-- -> el proyecto adapta11_c0f86002c5 -> Consola SQL (la misma que se uso para
-- crear las 6 tablas originales). Pega todo este archivo y ejecutalo una vez.
-- Es seguro volver a correrlo (todo usa IF NOT EXISTS).

-- 1) Imagenes por opcion de respuesta (igual que la imagen de la pregunta:
--    se guarda como texto, viene en formato dataURL/base64 desde el navegador).
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS opcion_a_imagen TEXT,
  ADD COLUMN IF NOT EXISTS opcion_b_imagen TEXT,
  ADD COLUMN IF NOT EXISTS opcion_c_imagen TEXT,
  ADD COLUMN IF NOT EXISTS opcion_d_imagen TEXT;

-- 2) Confirmacion de correo. email_confirmado arranca en TRUE para no afectar
--    las cuentas que ya existen (estudiantes, administradores y profesores ya
--    activos); solo las cuentas de profesor que se creen de ahora en adelante
--    arrancaran en FALSE hasta que confirmen el correo.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_confirmado BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS confirmacion_token TEXT,
  ADD COLUMN IF NOT EXISTS confirmacion_expira TIMESTAMPTZ;

-- 3) Refresh tokens: una fila por sesion/dispositivo. Se guarda el hash del
--    token (nunca el token en texto plano), para poder revocar una sesion sin
--    tener que esperar a que expire sola.
CREATE TABLE IF NOT EXISTS refresh_tokens (
  _id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira TIMESTAMPTZ NOT NULL,
  revocado BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens (token_hash);
