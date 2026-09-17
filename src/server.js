require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const db = require('./db');

const authRoutes = require('./routes/auth');
const questionsRoutes = require('./routes/questions');
const sessionsRoutes = require('./routes/sessions');
const adminRoutes = require('./routes/admin');
const colegiosRoutes = require('./routes/colegios');
const profesorRoutes = require('./routes/profesor');

const app = express();
const PORT = process.env.PORT || 3000;

// Limite generoso en el cuerpo JSON porque las preguntas pueden incluir una
// imagen codificada en base64.
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/questions', questionsRoutes);
app.use('/api/sessions', sessionsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/colegios', colegiosRoutes);
app.use('/api/profesor', profesorRoutes);

app.get('/healthz', (req, res) => res.json({ ok: true }));

// Manejo generico de errores
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'La imagen es demasiado grande.' });
  }
  res.status(500).json({ error: 'Ocurrio un error inesperado en el servidor.' });
});

(async () => {
  try {
    await db.initSchema();
    app.listen(PORT, () => {
      console.log(`Ruta Saber corriendo en http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('No se pudo inicializar la base de datos:', err);
    process.exit(1);
  }
})();
