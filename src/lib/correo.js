// Envio de correos (por ahora, solo la confirmacion de cuenta de profesor)
// via la API HTTP de Brevo (antes Sendinblue), no por SMTP.
//
// Por que no SMTP: Render, en su plan gratuito, bloquea las conexiones
// salientes a los puertos SMTP (465/587) para evitar que se use para spam.
// Eso hacia que nodemailer con Gmail se quedara colgado hasta fallar con
// "Connection timeout", sin importar que las credenciales estuvieran bien.
// La API de Brevo viaja por HTTPS (puerto 443), que si esta permitido.
//
// Como configurarlo (una sola vez):
//   1. Crea una cuenta gratis en https://www.brevo.com (plan gratis: 300
//      correos/dia, sin necesitar un dominio propio).
//   2. "Senders" (remitentes) -> agrega el correo que quieres que aparezca
//      como remitente (puede ser el mismo Gmail de antes) -> Brevo te manda
//      un correo de confirmacion a esa cuenta, confirmalo (esto se llama
//      "Single Sender Verification", no requiere verificar un dominio).
//   3. "Settings" -> "SMTP & API" -> "API Keys" -> genera una API key.
//
// Variables de entorno necesarias en .env:
//   GMAIL_USER=cuenta@gmail.com   (el remitente, el mismo que verificaste en Brevo)
//   BREVO_API_KEY=xxxxxxxxxxxxxxxx
//   APP_URL=https://adapta11.onrender.com  (para armar el enlace de confirmacion;
//                                            en local usa http://localhost:3000)

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

const GMAIL_USER = process.env.GMAIL_USER;
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const APP_URL = (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');

function urlConfirmacion(token) {
  return `${APP_URL}/api/auth/confirmar?token=${encodeURIComponent(token)}`;
}

function escapeHtmlBasico(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

async function enviarPorBrevo({ to, subject, text, html }) {
  if (!GMAIL_USER || !BREVO_API_KEY) {
    throw new Error(
      'Faltan GMAIL_USER y/o BREVO_API_KEY en el .env: no se puede enviar el correo de confirmacion.'
    );
  }

  const respuesta = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'api-key': BREVO_API_KEY
    },
    body: JSON.stringify({
      sender: { name: 'Ruta Saber', email: GMAIL_USER },
      to: [{ email: to }],
      subject,
      textContent: text,
      htmlContent: html
    })
  });

  if (!respuesta.ok) {
    const cuerpo = await respuesta.text().catch(() => '');
    throw new Error(`Brevo respondio con error ${respuesta.status}: ${cuerpo.slice(0, 300)}`);
  }
}

// `token` ya viene generado y guardado en la fila del profesor por admin.js;
// esta funcion solo arma el enlace y manda el correo.
async function enviarConfirmacionProfesorConToken({ to, nombre, token }) {
  const link = urlConfirmacion(token);
  const nombreSeguro = escapeHtmlBasico(nombre);
  await enviarPorBrevo({
    to,
    subject: 'Confirma tu cuenta de profesor en Ruta Saber',
    text:
      `Hola ${nombre},\n\n` +
      `Tu cuenta de profesor en Ruta Saber ya esta creada. Para activarla, entra a este enlace:\n${link}\n\n` +
      'Si tu no esperabas este correo, puedes ignorarlo.',
    html: `
      <div style="font-family:sans-serif; max-width:480px;">
        <p>Hola ${nombreSeguro},</p>
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
