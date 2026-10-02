// Envio de correos (por ahora, solo la confirmacion de cuenta de profesor)
// via Gmail SMTP, usando una "contraseña de aplicacion" de una cuenta de
// Gmail (no la contraseña normal: se genera en la configuracion de seguridad
// de esa cuenta de Google, con la verificacion en dos pasos activada).
//
// Variables de entorno necesarias en .env:
//   GMAIL_USER=cuenta@gmail.com
//   GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx   (16 caracteres, con o sin espacios)
//   APP_URL=https://adapta11.onrender.com  (para armar el enlace de confirmacion;
//                                            en local usa http://localhost:3000)

const nodemailer = require('nodemailer');

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const APP_URL = (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');

let transporter = null;
function obtenerTransporter() {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    throw new Error(
      'Faltan GMAIL_USER y/o GMAIL_APP_PASSWORD en el .env: no se puede enviar el correo de confirmacion.'
    );
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD }
    });
  }
  return transporter;
}

function urlConfirmacion(token) {
  return `${APP_URL}/api/auth/confirmar?token=${encodeURIComponent(token)}`;
}

// `token` ya viene generado y guardado en la fila del profesor por admin.js;
// esta funcion solo arma el enlace y manda el correo.
async function enviarConfirmacionProfesorConToken({ to, nombre, token }) {
  const t = obtenerTransporter();
  const link = urlConfirmacion(token);
  await t.sendMail({
    from: `"Ruta Saber" <${GMAIL_USER}>`,
    to,
    subject: 'Confirma tu cuenta de profesor en Ruta Saber',
    text:
      `Hola ${nombre},\n\n` +
      `Tu cuenta de profesor en Ruta Saber ya esta creada. Para activarla, entra a este enlace:\n${link}\n\n` +
      'Si tu no esperabas este correo, puedes ignorarlo.',
    html: `
      <div style="font-family:sans-serif; max-width:480px;">
        <p>Hola ${nombre},</p>
        <p>Tu cuenta de profesor en <strong>Ruta Saber</strong> ya esta creada. Para activarla, confirma tu correo:</p>
        <p>
          <a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">
            Confirmar mi cuenta
          </a>
        </p>
        <p style="font-size:0.85rem;color:#555;">O copia y pega este enlace en tu navegador:<br>${link}</p>
        <p style="font-size:0.85rem;color:#555;">Si tu no esperabas este correo, puedes ignorarlo.</p>
      </div>
    `
  });
}

module.exports = { enviarConfirmacionProfesorConToken };
