-- Cambios de esquema en Roble para: imagenes por opcion de respuesta,
-- confirmacion de correo para profesores, y refresh tokens revocables.
--
-- Como aplicarlo: panel de Roble (https://roble.test-openlab.uninorte.edu.co/)
-- -> el proyecto adapta11_c0f86002c5 -> Consola SQL (la misma que se uso para
-- crear las 6 tablas originales). Pega todo este archivo y ejecutalo una vez.
--
-- IMPORTANTE: la Consola SQL de Roble, por seguridad, solo permite ALTER TABLE
-- con una sola columna por sentencia (ADD COLUMN) y no admite IF NOT EXISTS.
-- Si lo vuelves a correr sobre columnas que ya existen, esas lineas fallaran
-- con un error de "columna ya existe": eso es normal, solo significa que ese
-- bloque ya se aplico antes. CREATE TABLE si falla de forma segura si la
-- tabla ya existe (Postgres estandar).

-- 1) Imagenes por opcion de respuesta (igual que la imagen de la pregunta:
--    se guarda como texto, viene en formato dataURL/base64 desde el navegador).
ALTER TABLE questions ADD COLUMN opcion_a_imagen TEXT;
ALTER TABLE questions ADD COLUMN opcion_b_imagen TEXT;
ALTER TABLE questions ADD COLUMN opcion_c_imagen TEXT;
ALTER TABLE questions ADD COLUMN opcion_d_imagen TEXT;

-- 2) Confirmacion de correo. email_confirmado arranca en TRUE para no afectar
--    las cuentas que ya existen (estudiantes, administradores y profesores ya
--    activos); solo las cuentas de profesor que se creen de ahora en adelante
--    arrancaran en FALSE hasta que confirmen el correo.
ALTER TABLE users ADD COLUMN email_confirmado BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN confirmacion_token TEXT;
ALTER TABLE users ADD COLUMN confirmacion_expira TIMESTAMPTZ;

-- 3) Refresh tokens: una fila por sesion/dispositivo. Se guarda el hash del
--    token (nunca el token en texto plano), para poder revocar una sesion sin
--    tener que esperar a que expire sola. No se declara _id: la Consola SQL
--    de Roble se lo agrega automaticamente (uuid, primary key) a cualquier
--    tabla que no lo tenga.
CREATE TABLE refresh_tokens (
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira TIMESTAMPTZ NOT NULL,
  revocado BOOLEAN NOT NULL DEFAULT FALSE
);

-- 4) Imagen opcional para un texto compartido (la lectura/grafico que usan
--    varias preguntas juntas), igual que la imagen de una pregunta suelta.
ALTER TABLE textos ADD COLUMN imagen TEXT;
