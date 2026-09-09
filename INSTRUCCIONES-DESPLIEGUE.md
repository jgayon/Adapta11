# Ruta Saber

Aplicacion web de practica para el examen Saber 11 (Lectura Critica y
Matematicas), con un backend real (Node.js + Express) y una base de datos
(SQLite local para desarrollo, o Turso/libSQL en la nube para produccion).
El registro de cada estudiante y su progreso quedan guardados en el
servidor, asi que el administrador puede verlos desde cualquier
computador, y no dependen del navegador de cada persona.

## Estructura del proyecto

```
ruta-saber-app/
  src/
    db.js                Conexion a la base de datos y creacion de tablas
    seed.js               Crea la cuenta de administrador y preguntas de ejemplo
    server.js              Arranque del servidor Express
    lib/asyncHandler.js    Utilidad para rutas async
    middleware/auth.js     Autenticacion con JWT (cookie httpOnly)
    routes/
      auth.js               Registro, inicio de sesion, cierre de sesion
      questions.js          Banco de preguntas (CRUD admin + practica/simulacro)
      sessions.js           Guardado de sesiones de practica y simulacro
      admin.js               Listado de estudiantes y sus estadisticas
  public/
    index.html              Pagina unica de la aplicacion
    css/styles.css          Estilos
    js/app.js                Toda la logica de la interfaz (SPA)
  render.yaml               Blueprint de despliegue para Render.com
  .env.example              Variables de entorno de ejemplo
```

## Cuenta de administrador

Solo existe **una** cuenta de administrador (no hay registro publico para
administradores). Se crea automaticamente al ejecutar `npm run seed`, con
los valores definidos en las variables de entorno `ADMIN_EMAIL` y
`ADMIN_PASSWORD` (ver `.env.example`). Por defecto, si no defines nada:

- correo: `admin@rutasaber.com`
- contrasena: `RutaSaber2026!`

**Importante:** cambia esa contrasena por defecto antes de compartir el
enlace de la aplicacion con otras personas (defínela en tu archivo `.env`
local, o en las variables de entorno de Render antes de desplegar).

Los estudiantes se registran ellos mismos desde la pantalla de inicio
("Crear cuenta"), indicando nombre, apellidos, correo y contrasena.

## Uso en tu computador (desarrollo local)

Requisitos: tener instalado [Node.js](https://nodejs.org) (version 18 o
superior).

1. Instala las dependencias:
   ```
   npm install
   ```
2. Copia el archivo de variables de entorno de ejemplo:
   ```
   cp .env.example .env
   ```
   Puedes dejarlo tal cual para probar en tu computador: la aplicacion
   creara automaticamente un archivo de base de datos SQLite dentro de
   `src/data/rutasaber.db`. No necesitas Turso para trabajar localmente.
3. Crea la cuenta de administrador y las preguntas de ejemplo:
   ```
   npm run seed
   ```
4. Inicia el servidor:
   ```
   npm start
   ```
5. Abre `http://localhost:3000` en tu navegador.

Cada vez que uno de los tres integrantes del grupo quiera trabajar en el
codigo, puede repetir estos mismos pasos en su propio computador; la base
de datos local (`src/data/rutasaber.db`) es solo para pruebas y no se
comparte entre computadores. Para que **todos vean los mismos datos** (los
mismos estudiantes registrados y el mismo banco de preguntas) es necesario
desplegar la aplicacion en internet con una base de datos compartida,
como se explica a continuacion.

## Despliegue gratuito en internet (Turso + Render)

Este proyecto esta pensado para desplegarse totalmente gratis usando dos
servicios: **Turso** (base de datos SQLite en la nube) y **Render**
(hospedaje del servidor Node.js). Sigue estos pasos en orden.

### 1. Sube el proyecto a GitHub

1. Crea un repositorio nuevo y vacio en [github.com](https://github.com)
   (por ejemplo, `ruta-saber`). No lo inicialices con README.
2. Desde una terminal, dentro de esta carpeta del proyecto:
   ```
   git init
   git add .
   git commit -m "Version inicial de Ruta Saber"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/ruta-saber.git
   git push -u origin main
   ```

### 2. Crea una base de datos gratuita en Turso

1. Entra a [turso.tech](https://turso.tech) y crea una cuenta gratuita.
2. Crea una base de datos nueva (por ejemplo, llamada `ruta-saber`).
3. Copia la **URL de la base de datos** (empieza con `libsql://...`).
4. Genera un **token de autenticacion** para esa base de datos y copialo.
5. Guarda esos dos valores; los necesitaras en el siguiente paso.

### 3. Crea el servicio web en Render

1. Entra a [render.com](https://render.com) y crea una cuenta gratuita
   (puedes usar tu cuenta de GitHub para conectarte mas facil).
2. Elige "New +" y luego "Web Service".
3. Conecta tu repositorio de GitHub (`ruta-saber`).
4. Configura:
   - **Runtime:** Node
   - **Build Command:** `npm install && npm run seed`
   - **Start Command:** `npm start`
   - **Plan:** Free
5. En la seccion de variables de entorno, agrega:
   - `NODE_ENV` = `production`
   - `JWT_SECRET` = cualquier texto largo y aleatorio (puede generarlo Render automaticamente)
   - `ADMIN_EMAIL` = el correo que quieras usar para el administrador
   - `ADMIN_PASSWORD` = una contrasena segura
   - `TURSO_DATABASE_URL` = la URL que copiaste de Turso
   - `TURSO_AUTH_TOKEN` = el token que copiaste de Turso
6. Haz clic en "Create Web Service". Render instalara las dependencias,
   creara las tablas y la cuenta de administrador automaticamente, y
   dejara la aplicacion corriendo en una direccion como
   `https://ruta-saber.onrender.com`.

Con esto, la aplicacion queda visible para cualquier persona con ese
enlace, guardando todos los registros de estudiantes y su progreso en la
base de datos de Turso, sin depender del navegador de cada quien.

### Nota sobre el plan gratuito de Render

El plan gratuito de Render "duerme" el servicio despues de 15 minutos sin
uso, y tarda unos segundos en despertar cuando alguien vuelve a entrar.
Esto es normal y no afecta los datos guardados: el proyecto usa Turso
(no un disco de Render) para la base de datos, asi que la informacion no
se pierde entre reinicios.

## Como funciona por dentro (resumen)

- **Autenticacion:** al iniciar sesion o registrarse, el servidor genera
  un token (JWT) y lo guarda en una cookie `httpOnly`, para que el
  navegador la envie automaticamente en cada peticion sin exponerla en
  el codigo del frontend. Las contrasenas se guardan cifradas
  (`bcryptjs`), nunca en texto plano.
- **Banco de preguntas:** cada pregunta tiene materia, dificultad,
  enunciado, cuatro opciones, la respuesta correcta, una explicacion
  opcional y una imagen opcional (guardada como texto codificado en
  base64 dentro de la base de datos). Al "eliminar" una pregunta no se
  borra de verdad: se marca como inactiva, para no romper el historial
  de quienes ya la respondieron.
- **Practica:** el estudiante elige materia y dificultad; el cronometro
  corre mientras responde y puede pausarlo (mientras esta en pausa no
  puede avanzar ni retroceder de pregunta).
- **Simulacro:** mezcla preguntas de ambas materias y las tres
  dificultades; el cronometro corre de forma continua desde el inicio,
  el estudiante puede moverse libremente entre preguntas y entre
  materias (pestañas), ve una cuadricula con las preguntas ya
  respondidas y las pendientes, y decide cuando terminar con el boton
  "Finalizar simulacro".
- **Correccion:** el servidor vuelve a calcular si cada respuesta fue
  correcta comparandola contra el banco de preguntas (nunca confia en lo
  que envie el navegador), para que las estadisticas del administrador
  sean confiables.
- **Panel de administrador:** permite ver, agregar, editar y quitar
  preguntas (con filtros por materia y dificultad), ver la lista de
  estudiantes con su progreso, y entrar al detalle de cada estudiante
  para revisar sus sesiones de practica, sus simulacros, o un resumen
  de estadisticas globales con el porcentaje de aciertos por materia.
