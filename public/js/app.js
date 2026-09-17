/* Ruta Saber - logica de la aplicacion (frontend)
 * Aplicacion de una sola pagina que consume la API REST del backend
 * (Express + base de datos). Todas las llamadas usan cookies httpOnly
 * para la sesion (credentials: 'include'), asi que el registro y el
 * progreso del estudiante quedan guardados en el servidor y el
 * administrador puede verlos desde cualquier computador.
 */

(function () {
  'use strict';

  /* ---------------------------------------------------------------- */
  /* Estado global                                                     */
  /* ---------------------------------------------------------------- */

  const state = {
    user: null,
    view: 'cargando', // cargando | auth | admin | profesor | estudiante
    authTab: 'login',
    authError: '',
    colegiosDisponibles: [], // para el select de colegio en el registro
    colegiosCargados: false, // evita volver a pedirlos en cada render si la lista esta vacia de verdad

    admin: {
      tab: 'preguntas', // preguntas | estudiantes | colegios
      preguntas: [],
      textos: [],
      filtroMateria: '',
      filtroCompetencia: '',
      filtroEje: '',
      modal: null, // { modo: 'crear'|'editar'|'ver', pregunta }
      modalError: '',
      estudiantes: [],
      estudianteSeleccionado: null,
      detalle: null, // { tipo: 'practica'|'simulacro'|'global', datos }
      colegios: [],
      profesores: [],
      colegioError: '',
      profesorError: '',
    },

    profesor: {
      tab: 'resumen', // resumen | estudiantes
      resumen: null,
      comparativa: [],
      estudiantes: [],
      estudianteSeleccionado: null,
      detalle: null,
    },

    estudiante: {
      pantalla: 'inicio', // inicio | practica-config | practica-run | simulacro-config | simulacro-run | resultado
      practica: null,
      simulacro: null,
      resultado: null,
      resultadoDetalle: null,
    }
  };

  const MATERIA_LABEL = { lectura_critica: 'Lectura Critica', matematicas: 'Matematicas' };
  const LETRAS = ['a', 'b', 'c', 'd'];

  // Clasificacion oficial del Icfes (Marcos de referencia Saber 11): se usa
  // en vez de facil/media/dificil como eje principal para organizar y elegir
  // preguntas. Debe reflejar exactamente lo que valida el backend
  // (src/routes/questions.js).
  const COMPETENCIAS_POR_MATERIA = {
    lectura_critica: ['identifica_contenidos_locales', 'comprende_sentido_global', 'reflexiona_evalua_contenido'],
    matematicas: ['interpretacion_representacion', 'formulacion_ejecucion', 'argumentacion']
  };
  const EJES_POR_MATERIA = {
    lectura_critica: ['literario', 'informativo'],
    matematicas: ['algebra_calculo', 'geometria', 'estadistica']
  };
  const COMPETENCIA_LABEL = {
    identifica_contenidos_locales: 'Identifica contenidos locales',
    comprende_sentido_global: 'Comprende el sentido global',
    reflexiona_evalua_contenido: 'Reflexiona y evalua el contenido',
    interpretacion_representacion: 'Interpretacion y representacion',
    formulacion_ejecucion: 'Formulacion y ejecucion',
    argumentacion: 'Argumentacion'
  };
  const EJE_LABEL = {
    literario: 'Texto literario',
    informativo: 'Texto informativo',
    algebra_calculo: 'Algebra y calculo',
    geometria: 'Geometria',
    estadistica: 'Estadistica'
  };

  /* ---------------------------------------------------------------- */
  /* Utilidades                                                        */
  /* ---------------------------------------------------------------- */

  function el(id) { return document.getElementById(id); }
  const app = () => el('app');
  const topnav = () => el('topnav');

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function materiaLabel(m) { return MATERIA_LABEL[m] || m || '-'; }
  function competenciaLabel(c) { return COMPETENCIA_LABEL[c] || c || '-'; }
  function ejeLabel(j) { return EJE_LABEL[j] || j || '-'; }

  // Una pregunta se muestra en formato "texto a la izquierda / pregunta a la
  // derecha" cuando tiene imagen o un texto_base largo (lectura extensa),
  // para que ambos queden visibles sin tener que hacer scroll entre ellos.
  function esLayoutDividido(p) {
    return !!(p && (p.imagen || (p.texto_base && p.texto_base.length > 220) || (p.texto_contenido && p.texto_contenido.length > 220)));
  }

  // Devuelve el texto de lectura que corresponde a una pregunta: si
  // pertenece a un texto compartido (texto_id) usa el contenido de ese
  // texto (buscado en el mapa que llega junto con la tanda de preguntas);
  // si no, usa su propio texto_base (lectura individual, como antes).
  function textoDe(q, textosMap) {
    if (q && q.texto_id && textosMap && textosMap.has(q.texto_id)) return textosMap.get(q.texto_id);
    return (q && (q.texto_contenido || q.texto_base)) || null;
  }

  const ROLE_LABEL = { administrador: 'Administrador', profesor: 'Administrador de colegio', estudiante: 'Estudiante' };

  function formatTiempo(segundos) {
    segundos = Math.max(0, Math.round(Number(segundos) || 0));
    const m = Math.floor(segundos / 60);
    const s = segundos % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  // Grafica de dona simple en SVG (sin librerias externas) para mostrar un
  // porcentaje con su valor exacto en el centro. r=42 => circunferencia ~264.
  function donutSvg(pct, colorVar, tamano) {
    pct = Math.max(0, Math.min(100, Math.round(pct)));
    tamano = tamano || 132;
    const r = 42, c = 2 * Math.PI * r;
    const relleno = (pct / 100) * c;
    return `
      <svg width="${tamano}" height="${tamano}" viewBox="0 0 100 100" class="donut-chart" role="img" aria-label="${pct}%">
        <circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="12" />
        <circle cx="50" cy="50" r="${r}" fill="none" stroke="var(${colorVar || '--accent'})" stroke-width="12"
          stroke-dasharray="${relleno.toFixed(1)} ${c.toFixed(1)}" stroke-linecap="round"
          transform="rotate(-90 50 50)" />
        <text x="50" y="54" text-anchor="middle" class="donut-chart-label">${pct}%</text>
      </svg>
    `;
  }

  // Barra horizontal con el valor exacto (correctas/total) ademas del
  // porcentaje, para que quede claro de donde sale cada numero.
  function barraConValor(label, correctas, total, pct) {
    return `
      <div class="barra-valor">
        <div class="row between" style="margin-bottom:0.25rem;">
          <strong>${label}</strong>
          <span class="text-muted">${correctas}/${total} correctas &middot; ${pct}%</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;"></div></div>
      </div>
    `;
  }

  function formatFechaHora(fechaSql) {
    if (!fechaSql) return { fecha: '-', hora: '-' };
    const partes = String(fechaSql).split(' ');
    return { fecha: partes[0] || '-', hora: (partes[1] || '').slice(0, 5) || '-' };
  }

  async function api(path, opts) {
    opts = opts || {};
    const headers = {};
    let body;
    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }
    const res = await fetch('/api' + path, {
      method: opts.method || 'GET',
      headers,
      credentials: 'include',
      body
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* respuesta sin cuerpo */ }
    if (!res.ok) {
      const msg = (data && data.error) || ('Error de red (' + res.status + ')');
      throw new Error(msg);
    }
    return data;
  }

  function compressImage(file, maxWidth, quality) {
    maxWidth = maxWidth || 800;
    quality = quality || 0.72;
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let w = img.width, h = img.height;
          if (w > maxWidth) { h = Math.round(h * (maxWidth / w)); w = maxWidth; }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => reject(new Error('No se pudo leer la imagen.'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
      reader.readAsDataURL(file);
    });
  }

  /* ---------------------------------------------------------------- */
  /* Arranque / sesion                                                  */
  /* ---------------------------------------------------------------- */

  async function init() {
    try {
      const data = await api('/auth/me');
      state.user = data.user;
      routeAfterLogin();
    } catch (e) {
      state.user = null;
      state.view = 'auth';
    }
    render();
  }

  function routeAfterLogin() {
    if (state.user.role === 'administrador') {
      state.view = 'admin';
      loadAdminPreguntas();
      loadAdminEstudiantes();
    } else if (state.user.role === 'profesor') {
      state.view = 'profesor';
      state.profesor.tab = 'resumen';
      loadProfesorResumen();
    } else {
      state.view = 'estudiante';
      state.estudiante.pantalla = 'inicio';
    }
  }

  async function logout() {
    try { await api('/auth/logout', { method: 'POST' }); } catch (e) { /* ignorar */ }
    state.user = null;
    state.view = 'auth';
    state.authTab = 'login';
    render();
  }

  /* ---------------------------------------------------------------- */
  /* Render raiz                                                       */
  /* ---------------------------------------------------------------- */

  function render() {
    renderTopnav();
    if (state.view === 'cargando') {
      app().innerHTML = '<div class="loading">Cargando Ruta Saber...</div>';
    } else if (state.view === 'auth') {
      renderAuth();
    } else if (state.view === 'admin') {
      renderAdmin();
    } else if (state.view === 'profesor') {
      renderProfesor();
    } else if (state.view === 'estudiante') {
      renderEstudiante();
    }
  }

  function renderTopnav() {
    if (!state.user) { topnav().innerHTML = ''; return; }
    const nombreCompleto = escapeHtml(state.user.nombre + ' ' + (state.user.apellidos || ''));
    const rol = ROLE_LABEL[state.user.role] || state.user.role;
    topnav().innerHTML = `
      <span class="user-chip">${nombreCompleto} &middot; ${escapeHtml(rol)}</span>
      <button id="btn-logout">Cerrar sesion</button>
    `;
    el('btn-logout').onclick = logout;
  }

  /* ================================================================== */
  /* VISTA: AUTENTICACION                                                */
  /* ================================================================== */

  function renderAuth() {
    const t = state.authTab;

    app().innerHTML = `
      <div class="auth-shell">
        <div class="auth-visual">
          <div>
            <div class="visual-brand"><span>Ruta</span><span class="vb-saber">Saber</span><span class="dot"></span></div>
            <h1>Práctica para el <em>Saber 11</em>,<br>a tu propio ritmo.</h1>
            <p class="sub">Práctica guiada para Lectura Crítica y Matemáticas, con tu progreso guardado en el servidor.</p>
          </div>
          <p class="visual-foot">Ruta Saber &middot; examen Saber 11</p>
        </div>
        <div class="auth-form-wrap">
          <div class="auth-card card">
            <h2 class="mb-0" style="font-size:1.4rem; margin-bottom:4px;">${t === 'registro' ? 'Crear cuenta' : 'Iniciar sesión'}</h2>
            <p class="hint" style="margin-bottom:10px;">${t === 'registro' ? 'Regístrate como estudiante para practicar y guardar tu progreso.' : 'Ingresa con el correo y la contraseña de tu cuenta (estudiante, profesor o administrador).'}</p>
            ${state.authError ? `<div class="error-box">${escapeHtml(state.authError)}</div>` : ''}
            ${t === 'login' ? formLogin() : formRegistro()}
            <div class="authmode-switch">
              ${t === 'registro'
                ? `&iquest;Ya tienes cuenta? <button type="button" id="btn-switch-mode">Inicia sesión</button>`
                : `&iquest;No tienes cuenta? <button type="button" id="btn-switch-mode">Regístrate</button>`}
            </div>
          </div>
        </div>
      </div>
    `;

    const btnSwitch = el('btn-switch-mode');
    if (btnSwitch) btnSwitch.onclick = () => { state.authTab = t === 'registro' ? 'login' : 'registro'; state.authError = ''; render(); };

    if (t === 'login') {
      el('form-login').onsubmit = onSubmitLogin;
    } else {
      // Solo se piden una vez: si la lista llega vacia de verdad (todavia no
      // hay colegios creados), "colegiosCargados" evita reintentar en cada
      // render, que antes provocaba un ciclo de fetch+render infinito y
      // dejaba el formulario inutilizable (se volvia a dibujar todo el
      // tiempo, perdiendo el foco y lo que se hubiera escrito).
      if (!state.colegiosCargados) loadColegiosPublicos();
      el('form-registro').onsubmit = onSubmitRegistro;
    }
  }

  async function loadColegiosPublicos() {
    try {
      const data = await api('/colegios');
      state.colegiosDisponibles = data.colegios;
    } catch (e) { /* si falla, el select queda vacio y se avisa al enviar */ }
    state.colegiosCargados = true;
    if (state.view === 'auth' && state.authTab === 'registro') render();
  }

  function formLogin() {
    return `
      <form id="form-login" class="stack">
        <div class="field">
          <label>Correo electrónico</label>
          <input type="email" name="email" required autocomplete="username" />
        </div>
        <div class="field">
          <label>Contraseña</label>
          <input type="password" name="password" required autocomplete="current-password" />
        </div>
        <button type="submit" class="btn btn-primary btn-block">Entrar</button>
      </form>
    `;
  }

  function formRegistro() {
    // Campo de busqueda con autocompletado (datalist nativo): el estudiante
    // escribe y ve sugerencias de colegios ya existentes; si el suyo no
    // aparece, puede escribir el nombre completo y el servidor lo crea
    // automaticamente al registrarse (ver POST /auth/register).
    const opcionesColegio = state.colegiosDisponibles
      .map(c => `<option value="${escapeHtml(c.nombre)}"></option>`).join('');
    return `
      <form id="form-registro" class="stack">
        <div class="field">
          <label>Nombre</label>
          <input type="text" name="nombre" required autocomplete="given-name" />
        </div>
        <div class="field">
          <label>Apellidos</label>
          <input type="text" name="apellidos" required autocomplete="family-name" />
        </div>
        <div class="field">
          <label>Colegio</label>
          <input
            type="text" name="colegio" required autocomplete="off" list="lista-colegios"
            placeholder="${!state.colegiosCargados ? 'Cargando colegios...' : 'Busca tu colegio...'}"
          />
          <datalist id="lista-colegios">${opcionesColegio}</datalist>
          <div class="hint">Escribe para buscarlo. Si no aparece en la lista, escribe el nombre completo de tu colegio y se creará automáticamente.</div>
        </div>
        <div class="field">
          <label>Correo electrónico</label>
          <input type="email" name="email" required autocomplete="username" />
        </div>
        <div class="field">
          <label>Contraseña</label>
          <input type="password" name="password" required minlength="6" autocomplete="new-password" />
          <div class="hint">Mínimo 6 caracteres.</div>
        </div>
        <button type="submit" class="btn btn-primary btn-block">Crear mi cuenta</button>
      </form>
    `;
  }

  async function onSubmitLogin(ev) {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    state.authError = '';
    try {
      const data = await api('/auth/login', { method: 'POST', body: { email: fd.get('email'), password: fd.get('password') } });
      state.user = data.user;
      routeAfterLogin();
    } catch (e) {
      state.authError = e.message;
    }
    render();
  }

  async function onSubmitRegistro(ev) {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    state.authError = '';
    try {
      const data = await api('/auth/register', {
        method: 'POST',
        body: {
          nombre: fd.get('nombre'),
          apellidos: fd.get('apellidos'),
          email: fd.get('email'),
          password: fd.get('password'),
          colegio: fd.get('colegio')
        }
      });
      state.user = data.user;
      routeAfterLogin();
    } catch (e) {
      state.authError = e.message;
    }
    render();
  }

  /* ================================================================== */
  /* VISTA: ADMINISTRADOR                                                */
  /* ================================================================== */

  async function loadAdminPreguntas() {
    const params = new URLSearchParams();
    if (state.admin.filtroMateria) params.set('materia', state.admin.filtroMateria);
    if (state.admin.filtroCompetencia) params.set('competencia', state.admin.filtroCompetencia);
    if (state.admin.filtroEje) params.set('eje', state.admin.filtroEje);
    const data = await api('/questions?' + params.toString());
    state.admin.preguntas = data.preguntas;
    render();
  }

  async function loadAdminEstudiantes() {
    const data = await api('/admin/students');
    state.admin.estudiantes = data.estudiantes;
    render();
  }

  async function loadAdminColegios() {
    const [colegiosData, profesoresData] = await Promise.all([
      api('/colegios/detalle'),
      api('/admin/profesores')
    ]);
    state.admin.colegios = colegiosData.colegios;
    state.admin.profesores = profesoresData.profesores;
    render();
  }

  function renderAdmin() {
    const a = state.admin;
    app().innerHTML = `
      <div class="row" style="margin-bottom:1.25rem;">
        <h1 class="mb-0" style="flex:1;">Panel de administrador</h1>
      </div>
      <div class="topnav" style="margin-bottom:1.25rem; gap:0.5rem;">
        <button id="tab-preguntas" class="btn ${a.tab === 'preguntas' ? 'btn-secondary' : 'btn-outline'}">Banco de preguntas</button>
        <button id="tab-estudiantes" class="btn ${a.tab === 'estudiantes' ? 'btn-secondary' : 'btn-outline'}">Estudiantes</button>
        <button id="tab-colegios" class="btn ${a.tab === 'colegios' ? 'btn-secondary' : 'btn-outline'}">Colegios y profesores</button>
      </div>
      <div id="admin-content"></div>
    `;
    el('tab-preguntas').onclick = () => { a.tab = 'preguntas'; render(); };
    el('tab-estudiantes').onclick = () => {
      a.tab = 'estudiantes'; a.estudianteSeleccionado = null; a.detalle = null; render();
    };
    el('tab-colegios').onclick = () => { a.tab = 'colegios'; loadAdminColegios(); render(); };

    if (a.tab === 'preguntas') renderAdminPreguntas();
    else if (a.tab === 'estudiantes') renderAdminEstudiantes();
    else renderAdminColegios();

    if (a.modal) renderModalPregunta();
  }

  /* ---------- Admin: colegios y profesores ---------- */

  function renderAdminColegios() {
    const a = state.admin;
    const filasColegios = a.colegios.map(c => `
      <tr>
        <td>${escapeHtml(c.nombre)}</td>
        <td>${c.num_estudiantes}</td>
        <td>${c.num_profesores}</td>
      </tr>
    `).join('');
    const opcionesColegio = a.colegios.map(c => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
    const filasProfesores = a.profesores.map(p => `
      <tr>
        <td>${escapeHtml(p.nombre)} ${escapeHtml(p.apellidos)}</td>
        <td>${escapeHtml(p.email)}</td>
        <td>${escapeHtml(p.colegio_nombre || '-')}</td>
      </tr>
    `).join('');

    el('admin-content').innerHTML = `
      <div class="grid-2">
        <div class="card">
          <h3>Crear colegio</h3>
          ${a.colegioError ? `<div class="error-box">${escapeHtml(a.colegioError)}</div>` : ''}
          <form id="form-colegio" class="stack">
            <div class="field">
              <label>Nombre del colegio</label>
              <input type="text" name="nombre" required />
            </div>
            <button type="submit" class="btn btn-primary btn-block">Crear colegio</button>
          </form>
        </div>
        <div class="card">
          <h3>Crear administrador de colegio (profesor)</h3>
          ${a.profesorError ? `<div class="error-box">${escapeHtml(a.profesorError)}</div>` : ''}
          ${!a.colegios.length ? '<p class="hint">Primero crea un colegio para poder asignarle un profesor.</p>' : `
            <form id="form-profesor" class="stack">
              <div class="field"><label>Nombre</label><input type="text" name="nombre" required /></div>
              <div class="field"><label>Apellidos</label><input type="text" name="apellidos" required /></div>
              <div class="field"><label>Colegio</label><select name="colegio_id" required>${opcionesColegio}</select></div>
              <div class="field"><label>Correo electrónico</label><input type="email" name="email" required /></div>
              <div class="field"><label>Contraseña</label><input type="password" name="password" required minlength="6" /></div>
              <button type="submit" class="btn btn-primary btn-block">Crear profesor</button>
            </form>
          `}
        </div>
      </div>
      <div class="card">
        <h3>Colegios registrados</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Colegio</th><th>Estudiantes</th><th>Profesores</th></tr></thead>
            <tbody>${filasColegios}</tbody>
          </table>
          ${!a.colegios.length ? '<div class="empty-state">Todavia no hay colegios registrados.</div>' : ''}
        </div>
      </div>
      <div class="card">
        <h3>Profesores (administradores de colegio)</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Nombre</th><th>Correo</th><th>Colegio</th></tr></thead>
            <tbody>${filasProfesores}</tbody>
          </table>
          ${!a.profesores.length ? '<div class="empty-state">Todavia no hay profesores creados.</div>' : ''}
        </div>
      </div>
    `;

    const formColegio = el('form-colegio');
    if (formColegio) {
      formColegio.onsubmit = async (ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.target);
        a.colegioError = '';
        try {
          await api('/colegios', { method: 'POST', body: { nombre: fd.get('nombre') } });
          await loadAdminColegios();
        } catch (err) {
          a.colegioError = err.message;
          render();
        }
      };
    }
    const formProfesor = el('form-profesor');
    if (formProfesor) {
      formProfesor.onsubmit = async (ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.target);
        a.profesorError = '';
        try {
          await api('/admin/profesores', {
            method: 'POST',
            body: {
              nombre: fd.get('nombre'), apellidos: fd.get('apellidos'), email: fd.get('email'),
              password: fd.get('password'), colegio_id: fd.get('colegio_id')
            }
          });
          await loadAdminColegios();
        } catch (err) {
          a.profesorError = err.message;
          render();
        }
      };
    }
  }

  /* ---------- Admin: banco de preguntas ---------- */

  function renderAdminPreguntas() {
    const a = state.admin;
    const filas = a.preguntas.map(p => `
      <tr>
        <td>#${p.id}</td>
        <td><span class="pill pill-materia">${materiaLabel(p.materia)}</span></td>
        <td><span class="pill pill-competencia">${competenciaLabel(p.competencia)}</span></td>
        <td><span class="pill pill-eje">${ejeLabel(p.eje)}</span></td>
        <td style="white-space:normal; max-width:320px;">${escapeHtml(p.enunciado).slice(0, 110)}${p.enunciado.length > 110 ? '&hellip;' : ''}</td>
        <td>${p.imagen ? '&#128247;' : ''}${p.texto_id ? ` <span class="pill pill-eje" title="Texto compartido #${p.texto_id}">Texto #${p.texto_id}</span>` : ''}</td>
        <td>
          <div class="row" style="gap:0.4rem;">
            <button class="btn btn-outline btn-sm" data-ver="${p.id}">Ver</button>
            <button class="btn btn-outline btn-sm" data-editar="${p.id}">Editar</button>
            <button class="btn btn-danger btn-sm" data-eliminar="${p.id}">Eliminar</button>
          </div>
        </td>
      </tr>
    `).join('');

    const opcionesCompetencia = a.filtroMateria
      ? COMPETENCIAS_POR_MATERIA[a.filtroMateria].map(c => `<option value="${c}" ${a.filtroCompetencia === c ? 'selected' : ''}>${competenciaLabel(c)}</option>`).join('')
      : '';
    const opcionesEje = a.filtroMateria
      ? EJES_POR_MATERIA[a.filtroMateria].map(j => `<option value="${j}" ${a.filtroEje === j ? 'selected' : ''}>${ejeLabel(j)}</option>`).join('')
      : '';

    el('admin-content').innerHTML = `
      <div class="card">
        <div class="row between" style="margin-bottom:1rem; flex-wrap:wrap;">
          <div class="row" style="gap:0.6rem; flex-wrap:wrap;">
            <select id="filtro-materia">
              <option value="">Todas las materias</option>
              <option value="lectura_critica" ${a.filtroMateria === 'lectura_critica' ? 'selected' : ''}>Lectura Critica</option>
              <option value="matematicas" ${a.filtroMateria === 'matematicas' ? 'selected' : ''}>Matematicas</option>
            </select>
            <select id="filtro-competencia" ${a.filtroMateria ? '' : 'disabled'}>
              <option value="">Toda competencia</option>
              ${opcionesCompetencia}
            </select>
            <select id="filtro-eje" ${a.filtroMateria ? '' : 'disabled'}>
              <option value="">Todo eje</option>
              ${opcionesEje}
            </select>
          </div>
          <button id="btn-nueva-pregunta" class="btn btn-primary">+ Agregar pregunta</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>ID</th><th>Materia</th><th>Competencia</th><th>Eje</th><th>Enunciado</th><th>Imagen</th><th>Acciones</th></tr></thead>
            <tbody>${filas || ''}</tbody>
          </table>
          ${!a.preguntas.length ? '<div class="empty-state">No hay preguntas con estos filtros todavia.</div>' : ''}
        </div>
      </div>
    `;

    el('filtro-materia').onchange = (e) => {
      a.filtroMateria = e.target.value; a.filtroCompetencia = ''; a.filtroEje = ''; loadAdminPreguntas();
    };
    el('filtro-competencia').onchange = (e) => { a.filtroCompetencia = e.target.value; loadAdminPreguntas(); };
    el('filtro-eje').onchange = (e) => { a.filtroEje = e.target.value; loadAdminPreguntas(); };
    el('btn-nueva-pregunta').onclick = () => { a.modal = { modo: 'crear', pregunta: null }; a.modalError = ''; render(); };

    app().querySelectorAll('[data-ver]').forEach(btn => {
      btn.onclick = async () => {
        const p = await api('/questions/' + btn.dataset.ver);
        a.modal = { modo: 'ver', pregunta: p.pregunta };
        render();
      };
    });
    app().querySelectorAll('[data-editar]').forEach(btn => {
      btn.onclick = async () => {
        const p = await api('/questions/' + btn.dataset.editar);
        a.modal = { modo: 'editar', pregunta: p.pregunta };
        a.modalError = '';
        render();
      };
    });
    app().querySelectorAll('[data-eliminar]').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Esta pregunta se quitara del banco activo. ¿Continuar?')) return;
        await api('/questions/' + btn.dataset.eliminar, { method: 'DELETE' });
        loadAdminPreguntas();
      };
    });
  }

  function renderModalPregunta() {
    const a = state.admin;
    const { modo, pregunta } = a.modal;
    const soloLectura = modo === 'ver';
    const p = pregunta || {};

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.id = 'modal-backdrop';

    const titulo = modo === 'crear' ? 'Agregar pregunta' : modo === 'editar' ? 'Editar pregunta' : ('Pregunta #' + p.id);

    if (soloLectura) {
      const dividido = esLayoutDividido(p);
      const textoMostrado = p.texto_contenido || p.texto_base;
      const bloqueFuente = (textoMostrado || p.imagen) ? `
          ${p.texto_id ? `<div class="texto-grupo-aviso">Texto compartido #${p.texto_id} (usado por varias preguntas).</div>` : ''}
          ${textoMostrado ? `<div class="texto-base">${escapeHtml(textoMostrado)}</div>` : ''}
          ${p.imagen ? `<img class="pregunta-img" src="${p.imagen}" alt="Imagen de la pregunta" />` : ''}
      ` : '';
      const bloquePregunta = `
          <p style="font-weight:600;">${escapeHtml(p.enunciado)}</p>
          <div class="opciones">
            ${LETRAS.map(l => `
              <div class="opcion readonly ${p.respuesta_correcta === l ? 'correcta' : ''}">
                <span class="letra">${l.toUpperCase()}</span>
                <span>${escapeHtml(p['opcion_' + l])}</span>
              </div>
            `).join('')}
          </div>
          ${p.explicacion ? `<p class="hint"><strong>Explicacion:</strong> ${escapeHtml(p.explicacion)}</p>` : ''}
      `;
      backdrop.innerHTML = `
        <div class="modal modal-wide">
          <div class="modal-header">
            <h2 class="mb-0">${titulo}</h2>
            <button class="modal-close" id="modal-cerrar">&times;</button>
          </div>
          <div class="row" style="gap:0.5rem; margin-bottom:1rem;">
            <span class="pill pill-materia">${materiaLabel(p.materia)}</span>
            <span class="pill pill-competencia">${competenciaLabel(p.competencia)}</span>
            <span class="pill pill-eje">${ejeLabel(p.eje)}</span>
          </div>
          ${bloqueFuente ? `
            <div class="question-box ${dividido ? 'question-box-split' : ''}">
              <div class="question-box-fuente">${bloqueFuente}</div>
              <div class="question-box-pregunta">${bloquePregunta}</div>
            </div>
          ` : bloquePregunta}
          <div class="row end"><button class="btn btn-outline" id="modal-cerrar-2">Cerrar</button></div>
        </div>
      `;
      document.body.appendChild(backdrop);
      const close = () => { backdrop.remove(); a.modal = null; render(); };
      el('modal-cerrar').onclick = close;
      el('modal-cerrar-2').onclick = close;
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
      return;
    }

    backdrop.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2 class="mb-0">${titulo}</h2>
          <button class="modal-close" id="modal-cerrar">&times;</button>
        </div>
        ${a.modalError ? `<div class="error-box">${escapeHtml(a.modalError)}</div>` : ''}
        <form id="form-pregunta" class="stack">
          <div class="grid-2">
            <div class="field">
              <label>Materia</label>
              <select name="materia" id="input-materia" required>
                <option value="lectura_critica" ${p.materia === 'lectura_critica' ? 'selected' : ''}>Lectura Critica</option>
                <option value="matematicas" ${(p.materia === 'matematicas' || !p.materia) ? 'selected' : ''}>Matematicas</option>
              </select>
            </div>
          </div>
          <div class="grid-2">
            <div class="field">
              <label>Competencia (Icfes)</label>
              <select name="competencia" id="input-competencia" required></select>
            </div>
            <div class="field">
              <label>Eje tematico</label>
              <select name="eje" id="input-eje" required></select>
            </div>
          </div>
          <div class="field">
            <label>Texto base / lectura (opcional)</label>
            <textarea name="texto_base" id="input-texto-base" placeholder="Parrafo o contexto de lectura, si aplica" ${p.texto_id ? 'disabled' : ''}>${escapeHtml(p.texto_id ? '' : (p.texto_base || ''))}</textarea>
          </div>
          <div class="field">
            <label>Texto compartido (opcional)</label>
            <select id="input-texto-select"></select>
            <input type="hidden" name="texto_id" id="input-texto-id" value="${p.texto_id || ''}" />
            <div class="hint">Se usa cuando varias preguntas comparten la misma lectura (minimo 5 preguntas para que el estudiante las vea juntas bajo un mismo texto). Elige uno existente para agregarle esta pregunta, o crea uno nuevo a partir del texto base de arriba.</div>
          </div>
          <div class="field">
            <label>Enunciado de la pregunta</label>
            <textarea name="enunciado" required>${escapeHtml(p.enunciado || '')}</textarea>
          </div>
          <div class="field">
            <label>Imagen (opcional)</label>
            <input type="file" id="input-imagen" accept="image/*" />
            <div id="preview-imagen" style="margin-top:0.6rem;">
              ${p.imagen ? `<img src="${p.imagen}" class="pregunta-img" style="max-width:220px;" />` : ''}
            </div>
            <input type="hidden" name="imagen" id="input-imagen-hidden" value="${p.imagen ? escapeHtml(p.imagen) : ''}" />
            ${p.imagen ? '<button type="button" class="btn btn-ghost btn-sm" id="btn-quitar-imagen">Quitar imagen</button>' : ''}
          </div>
          <div class="grid-2">
            ${LETRAS.map(l => `
              <div class="field">
                <label>Opcion ${l.toUpperCase()}</label>
                <input type="text" name="opcion_${l}" required value="${escapeHtml(p['opcion_' + l] || '')}" />
              </div>
            `).join('')}
          </div>
          <div class="field">
            <label>Respuesta correcta</label>
            <select name="respuesta_correcta" required>
              ${LETRAS.map(l => `<option value="${l}" ${p.respuesta_correcta === l ? 'selected' : ''}>Opcion ${l.toUpperCase()}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Explicacion (opcional)</label>
            <textarea name="explicacion">${escapeHtml(p.explicacion || '')}</textarea>
          </div>
          <div class="row end" style="gap:0.5rem;">
            <button type="button" class="btn btn-outline" id="modal-cancelar">Cancelar</button>
            <button type="submit" class="btn btn-primary">${modo === 'crear' ? 'Guardar pregunta' : 'Guardar cambios'}</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(backdrop);

    // Las opciones de competencia y eje dependen de la materia elegida (cada
    // materia tiene su propia clasificacion oficial del Icfes), asi que se
    // llenan por JS y se vuelven a llenar si el usuario cambia la materia.
    function poblarTaxonomia(materiaActual, competenciaPrevia, ejePrevia) {
      el('input-competencia').innerHTML = COMPETENCIAS_POR_MATERIA[materiaActual]
        .map(c => `<option value="${c}" ${competenciaPrevia === c ? 'selected' : ''}>${competenciaLabel(c)}</option>`).join('');
      el('input-eje').innerHTML = EJES_POR_MATERIA[materiaActual]
        .map(j => `<option value="${j}" ${ejePrevia === j ? 'selected' : ''}>${ejeLabel(j)}</option>`).join('');
    }
    poblarTaxonomia(p.materia || 'matematicas', p.competencia, p.eje);

    // El select de "texto compartido" se llena con los textos ya existentes
    // de la materia elegida (para poder agregarle una pregunta mas a uno de
    // ellos) mas la opcion de crear uno nuevo a partir del texto base.
    async function poblarTextos(materiaActual, textoIdPrevio) {
      const data = await api('/questions/textos?materia=' + materiaActual);
      const opciones = data.textos.map(t => `
        <option value="${t.id}" ${String(textoIdPrevio) === String(t.id) ? 'selected' : ''}>
          #${t.id} (${t.num_preguntas} preg.) &middot; ${escapeHtml(t.contenido.slice(0, 60))}${t.contenido.length > 60 ? '&hellip;' : ''}
        </option>
      `).join('');
      el('input-texto-select').innerHTML = `
        <option value="">Ninguno (usar el texto base de arriba, solo para esta pregunta)</option>
        ${opciones}
        <option value="__nuevo__">+ Crear nuevo texto compartido a partir del texto base de arriba</option>
      `;
    }
    poblarTextos(p.materia || 'matematicas', p.texto_id || '');

    el('input-materia').onchange = (e) => {
      poblarTaxonomia(e.target.value, null, null);
      poblarTextos(e.target.value, '');
      el('input-texto-id').value = '';
      el('input-texto-base').disabled = false;
    };

    el('input-texto-select').onchange = async (e) => {
      const valor = e.target.value;
      if (valor === '__nuevo__') {
        const contenido = el('input-texto-base').value.trim();
        if (!contenido) {
          alert('Escribe primero el contenido en "Texto base / lectura" para crear el texto compartido.');
          e.target.value = el('input-texto-id').value || '';
          return;
        }
        try {
          const materiaActual = el('input-materia').value;
          const data = await api('/questions/textos', { method: 'POST', body: { materia: materiaActual, contenido } });
          el('input-texto-id').value = data.texto.id;
          el('input-texto-base').value = '';
          el('input-texto-base').disabled = true;
          await poblarTextos(materiaActual, data.texto.id);
        } catch (err) {
          alert('No se pudo crear el texto compartido: ' + err.message);
          e.target.value = '';
        }
      } else if (valor) {
        el('input-texto-id').value = valor;
        el('input-texto-base').value = '';
        el('input-texto-base').disabled = true;
      } else {
        el('input-texto-id').value = '';
        el('input-texto-base').disabled = false;
      }
    };

    const close = () => { backdrop.remove(); a.modal = null; render(); };
    el('modal-cerrar').onclick = close;
    el('modal-cancelar').onclick = close;
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

    el('input-imagen').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const dataUrl = await compressImage(file);
        el('input-imagen-hidden').value = dataUrl;
        el('preview-imagen').innerHTML = `<img src="${dataUrl}" class="pregunta-img" style="max-width:220px;" />`;
      } catch (err) {
        alert('No se pudo procesar la imagen: ' + err.message);
      }
    };
    const btnQuitar = el('btn-quitar-imagen');
    if (btnQuitar) {
      btnQuitar.onclick = () => {
        el('input-imagen-hidden').value = '';
        el('preview-imagen').innerHTML = '';
      };
    }

    el('form-pregunta').onsubmit = async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const body = {
        materia: fd.get('materia'),
        competencia: fd.get('competencia'),
        eje: fd.get('eje'),
        texto_base: fd.get('texto_base'),
        texto_id: fd.get('texto_id') || null,
        enunciado: fd.get('enunciado'),
        opcion_a: fd.get('opcion_a'),
        opcion_b: fd.get('opcion_b'),
        opcion_c: fd.get('opcion_c'),
        opcion_d: fd.get('opcion_d'),
        respuesta_correcta: fd.get('respuesta_correcta'),
        explicacion: fd.get('explicacion'),
        imagen: fd.get('imagen') || null
      };
      try {
        if (modo === 'crear') {
          await api('/questions', { method: 'POST', body });
        } else {
          await api('/questions/' + p.id, { method: 'PUT', body });
        }
        backdrop.remove();
        a.modal = null;
        loadAdminPreguntas();
      } catch (err) {
        a.modalError = err.message;
        backdrop.remove();
        render();
      }
    };
  }

  /* ---------- Admin: estudiantes ---------- */

  function renderAdminEstudiantes() {
    const a = state.admin;

    if (a.estudianteSeleccionado) {
      renderAdminDetalleEstudiante();
      return;
    }

    const filas = a.estudiantes.map(u => `
      <tr class="clickable" data-id="${u.id}">
        <td>${escapeHtml(u.nombre)} ${escapeHtml(u.apellidos)}</td>
        <td>${escapeHtml(u.email)}</td>
        <td>${u.num_sesiones}</td>
        <td>${u.num_preguntas}</td>
        <td>${u.porcentaje_aciertos}%</td>
        <td>${u.ultima_actividad ? formatFechaHora(u.ultima_actividad).fecha : '-'}</td>
      </tr>
    `).join('');

    el('admin-content').innerHTML = `
      <div class="card">
        <h2>Estudiantes registrados</h2>
        <p class="text-muted">Selecciona un estudiante para ver su practica, su simulacro o sus estadisticas globales.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Nombre</th><th>Correo</th><th>Sesiones</th><th>Preguntas resp.</th><th>% Aciertos</th><th>Ultima actividad</th></tr></thead>
            <tbody>${filas}</tbody>
          </table>
          ${!a.estudiantes.length ? '<div class="empty-state">Todavia no se ha registrado ningun estudiante.</div>' : ''}
        </div>
      </div>
    `;
    app().querySelectorAll('tr[data-id]').forEach(tr => {
      tr.onclick = () => {
        const u = a.estudiantes.find(x => String(x.id) === tr.dataset.id);
        a.estudianteSeleccionado = u;
        a.detalle = null;
        render();
      };
    });
  }

  function renderAdminDetalleEstudiante() {
    const a = state.admin;
    const u = a.estudianteSeleccionado;

    let cuerpo = '<div class="grid-3">' +
      seccionBoton('practica', 'Practica', 'Sesiones de practica por materia, competencia y eje tematico.') +
      seccionBoton('simulacro', 'Simulacro', 'Simulacros completos tipo examen.') +
      seccionBoton('global', 'Estadisticas globales', 'Resumen general y desglose por materia.') +
      '</div>';

    el('admin-content').innerHTML = `
      <div class="row" style="margin-bottom:1rem;">
        <button class="btn btn-outline btn-sm" id="btn-volver-lista">&larr; Volver a estudiantes</button>
      </div>
      <div class="card">
        <div class="eyebrow">Estudiante</div>
        <h2>${escapeHtml(u.nombre)} ${escapeHtml(u.apellidos)}</h2>
        <p class="text-muted mb-0">${escapeHtml(u.email)}</p>
      </div>
      <div class="card">
        <h3>¿Que deseas ver?</h3>
        ${cuerpo}
      </div>
      <div id="detalle-estudiante"></div>
    `;

    function seccionBoton(tipo, titulo, desc) {
      const activo = a.detalle && a.detalle.tipo === tipo;
      return `
        <button class="mode-card" data-tipo="${tipo}" style="${activo ? 'border-color:var(--accent);' : ''}">
          <div class="mode-icon">${titulo[0]}</div>
          <h3 class="mb-0">${titulo}</h3>
          <p class="text-muted mb-0">${desc}</p>
        </button>
      `;
    }

    el('btn-volver-lista').onclick = () => { a.estudianteSeleccionado = null; a.detalle = null; render(); };
    app().querySelectorAll('.mode-card[data-tipo]').forEach(btn => {
      btn.onclick = () => cargarDetalleEstudiante(btn.dataset.tipo);
    });

    if (a.detalle) pintarDetalleEstudiante();
  }

  async function cargarDetalleEstudiante(tipo) {
    const a = state.admin;
    const id = a.estudianteSeleccionado.id;
    if (tipo === 'global') {
      const data = await api(`/admin/students/${id}/summary`);
      a.detalle = { tipo: 'global', datos: data };
    } else {
      const data = await api(`/admin/students/${id}/sessions?tipo=${tipo}`);
      a.detalle = { tipo, datos: data };
    }
    render();
  }

  function pintarDetalleEstudiante() {
    const cont = el('detalle-estudiante');
    if (!cont) return;
    pintarDetalleEstudianteEn(cont, state.admin.detalle);
  }

  // Presentacion compartida del detalle de un estudiante (sesiones de
  // practica/simulacro o estadisticas globales), usada tanto por el panel
  // de administrador como por el de profesor (mismo formato de datos,
  // distinto contenedor y distinto origen de la peticion).
  function pintarDetalleEstudianteEn(cont, detalleParam) {
    const { tipo, datos } = detalleParam;

    if (tipo === 'practica' || tipo === 'simulacro') {
      const sesiones = datos.sesiones;
      const filas = sesiones.map(s => {
        const fh = formatFechaHora(s.fecha_inicio);
        const pct = s.num_preguntas ? Math.round((s.num_correctas / s.num_preguntas) * 100) : 0;
        const enfoque = [s.competencia ? competenciaLabel(s.competencia) : '', s.eje ? ejeLabel(s.eje) : '']
          .filter(Boolean).join(' / ') || 'Toda la materia';
        return `
          <tr>
            <td>${fh.fecha}</td>
            <td>${fh.hora}</td>
            <td>${s.num_preguntas}</td>
            <td>${s.num_correctas} (${pct}%)</td>
            <td>${formatTiempo(s.tiempo_segundos)}</td>
            ${tipo === 'practica'
              ? `<td>${materiaLabel(s.materia)}</td><td>${enfoque}</td>`
              : `<td>${s.nivel_estimado || '-'}</td><td>${s.materias ? s.materias.split(',').map(materiaLabel).join(' + ') : 'Ambas'}</td>`}
          </tr>
        `;
      }).join('');

      cont.innerHTML = `
        <div class="card">
          <h3>${tipo === 'practica' ? 'Sesiones de practica' : 'Simulacros'}</h3>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th><th>Hora</th><th>Preg. totales</th><th>Correctas</th><th>Tiempo</th>
                  ${tipo === 'practica' ? '<th>Materia</th><th>Enfoque</th>' : '<th>Nivel estimado</th><th>Materias</th>'}
                </tr>
              </thead>
              <tbody>${filas}</tbody>
            </table>
            ${!sesiones.length ? `<div class="empty-state">Este estudiante todavia no tiene sesiones de ${tipo === 'practica' ? 'practica' : 'simulacro'}.</div>` : ''}
          </div>
        </div>
      `;
      return;
    }

    // Estadisticas globales
    const r = datos.resumen;
    const barrasMateria = r.por_materia.map(m => barraConValor(materiaLabel(m.materia), m.correctas, m.total, m.porcentaje)).join('');
    const barrasCompetencia = (r.por_competencia || []).map(c => barraConValor(competenciaLabel(c.competencia), c.correctas, c.total, c.porcentaje)).join('');
    const barrasEje = (r.por_eje || []).map(e => barraConValor(ejeLabel(e.eje), e.correctas, e.total, e.porcentaje)).join('');

    const recientes = datos.sesiones_recientes.map(s => {
      const fh = formatFechaHora(s.fecha_inicio);
      const pct = s.num_preguntas ? Math.round((s.num_correctas / s.num_preguntas) * 100) : 0;
      return `
        <tr>
          <td>${fh.fecha} ${fh.hora}</td>
          <td><span class="pill pill-tipo-${s.tipo}">${s.tipo === 'practica' ? 'Practica' : 'Simulacro'}</span></td>
          <td>${s.num_correctas}/${s.num_preguntas} (${pct}%)</td>
          <td>${formatTiempo(s.tiempo_segundos)}</td>
        </tr>
      `;
    }).join('');

    cont.innerHTML = `
      <div class="card">
        <h3>Estadisticas globales</h3>
        <div class="row" style="gap:1.5rem; align-items:center; flex-wrap:wrap; margin-bottom:1.5rem;">
          ${donutSvg(r.porcentaje_aciertos, '--accent')}
          <div class="grid-3" style="flex:1; min-width:220px;">
            <div class="stat-card"><div class="stat-value">${r.num_sesiones}</div><div class="stat-label">Sesiones totales</div></div>
            <div class="stat-card"><div class="stat-value">${r.num_practicas}</div><div class="stat-label">Practicas</div></div>
            <div class="stat-card"><div class="stat-value">${r.num_simulacros}</div><div class="stat-label">Simulacros</div></div>
          </div>
        </div>
        <p class="hint" style="margin-bottom:1.25rem;">El % de aciertos general se calcula como respuestas correctas &divide; preguntas respondidas en todas las sesiones (${r.num_correctas}/${r.num_preguntas} = ${r.porcentaje_aciertos}%). Cada barra de abajo aplica el mismo calculo, pero solo con las preguntas de esa categoria.</p>
        <h4>Desglose por materia</h4>
        ${barrasMateria || '<p class="text-muted">Sin datos todavia.</p>'}
        ${barrasCompetencia ? `<h4 style="margin-top:1.25rem;">Desglose por competencia</h4>${barrasCompetencia}` : ''}
        ${barrasEje ? `<h4 style="margin-top:1.25rem;">Desglose por eje tematico</h4>${barrasEje}` : ''}
      </div>
      <div class="card">
        <h3>Sesiones recientes</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Fecha</th><th>Tipo</th><th>Resultado</th><th>Tiempo</th></tr></thead>
            <tbody>${recientes}</tbody>
          </table>
          ${!datos.sesiones_recientes.length ? '<div class="empty-state">Sin sesiones registradas.</div>' : ''}
        </div>
      </div>
    `;
  }

  /* ================================================================== */
  /* VISTA: PROFESOR (administrador de colegio)                          */
  /* ================================================================== */

  async function loadProfesorResumen() {
    const data = await api('/profesor/resumen');
    state.profesor.resumen = data.resumen;
    state.profesor.comparativa = data.comparativa;
    render();
  }

  async function loadProfesorEstudiantes() {
    const data = await api('/profesor/students');
    state.profesor.estudiantes = data.estudiantes;
    render();
  }

  function renderProfesor() {
    const p = state.profesor;
    app().innerHTML = `
      <div class="row" style="margin-bottom:1.25rem;">
        <h1 class="mb-0" style="flex:1;">Panel de tu colegio</h1>
      </div>
      <div class="topnav" style="margin-bottom:1.25rem; gap:0.5rem;">
        <button id="tab-resumen" class="btn ${p.tab === 'resumen' ? 'btn-secondary' : 'btn-outline'}">Resumen y comparativas</button>
        <button id="tab-pf-estudiantes" class="btn ${p.tab === 'estudiantes' ? 'btn-secondary' : 'btn-outline'}">Estudiantes</button>
      </div>
      <div id="profesor-content"></div>
    `;
    el('tab-resumen').onclick = () => { p.tab = 'resumen'; loadProfesorResumen(); render(); };
    el('tab-pf-estudiantes').onclick = () => {
      p.tab = 'estudiantes'; p.estudianteSeleccionado = null; p.detalle = null; loadProfesorEstudiantes(); render();
    };
    if (p.tab === 'resumen') renderProfesorResumen(); else renderProfesorEstudiantes();
  }

  function renderProfesorResumen() {
    const p = state.profesor;
    const r = p.resumen;
    if (!r) {
      el('profesor-content').innerHTML = `<div class="card"><p class="text-muted mb-0">Todavia no hay estudiantes registrados en tu colegio, asi que no hay estadisticas para mostrar.</p></div>`;
      return;
    }
    const barrasMateria = r.por_materia.map(m => barraConValor(materiaLabel(m.materia), m.correctas, m.total, m.porcentaje)).join('');
    const barrasCompetencia = (r.por_competencia || []).map(c => barraConValor(competenciaLabel(c.competencia), c.correctas, c.total, c.porcentaje)).join('');
    const barrasEje = (r.por_eje || []).map(e => barraConValor(ejeLabel(e.eje), e.correctas, e.total, e.porcentaje)).join('');

    const filasComparativa = p.comparativa.map((c, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(c.nombre)} ${escapeHtml(c.apellidos)}</td>
        <td>${c.num_sesiones}</td>
        <td>${c.num_preguntas}</td>
        <td>${c.porcentaje_aciertos}%</td>
      </tr>
    `).join('');

    el('profesor-content').innerHTML = `
      <div class="card">
        <h3>Resumen del colegio</h3>
        <div class="row" style="gap:1.5rem; align-items:center; flex-wrap:wrap; margin-bottom:1.5rem;">
          ${donutSvg(r.porcentaje_aciertos, '--accent')}
          <div class="grid-3" style="flex:1; min-width:220px;">
            <div class="stat-card"><div class="stat-value">${r.total_estudiantes}</div><div class="stat-label">Estudiantes</div></div>
            <div class="stat-card"><div class="stat-value">${r.num_preguntas}</div><div class="stat-label">Preguntas respondidas</div></div>
            <div class="stat-card"><div class="stat-value">${r.porcentaje_aciertos}%</div><div class="stat-label">Aciertos</div></div>
          </div>
        </div>
        <h4>Desglose por materia</h4>
        ${barrasMateria || '<p class="text-muted">Sin datos todavia.</p>'}
        ${barrasCompetencia ? `<h4 style="margin-top:1.25rem;">Desglose por competencia</h4>${barrasCompetencia}` : ''}
        ${barrasEje ? `<h4 style="margin-top:1.25rem;">Desglose por eje tematico</h4>${barrasEje}` : ''}
      </div>
      <div class="card">
        <h3>Comparativa entre estudiantes</h3>
        <p class="hint">Ordenada de mayor a menor porcentaje de aciertos.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Estudiante</th><th>Sesiones</th><th>Preguntas resp.</th><th>% Aciertos</th></tr></thead>
            <tbody>${filasComparativa}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderProfesorEstudiantes() {
    const p = state.profesor;
    if (p.estudianteSeleccionado) { renderProfesorDetalleEstudiante(); return; }

    const filas = p.estudiantes.map(u => `
      <tr class="clickable" data-id="${u.id}">
        <td>${escapeHtml(u.nombre)} ${escapeHtml(u.apellidos)}</td>
        <td>${escapeHtml(u.email)}</td>
        <td>${u.num_sesiones}</td>
        <td>${u.num_preguntas}</td>
        <td>${u.porcentaje_aciertos}%</td>
        <td>${u.ultima_actividad ? formatFechaHora(u.ultima_actividad).fecha : '-'}</td>
      </tr>
    `).join('');

    el('profesor-content').innerHTML = `
      <div class="card">
        <h2>Estudiantes de tu colegio</h2>
        <p class="text-muted">Selecciona un estudiante para ver su practica, su simulacro o sus estadisticas globales.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Nombre</th><th>Correo</th><th>Sesiones</th><th>Preguntas resp.</th><th>% Aciertos</th><th>Ultima actividad</th></tr></thead>
            <tbody>${filas}</tbody>
          </table>
          ${!p.estudiantes.length ? '<div class="empty-state">Todavia no se ha registrado ningun estudiante en tu colegio.</div>' : ''}
        </div>
      </div>
    `;
    app().querySelectorAll('tr[data-id]').forEach(tr => {
      tr.onclick = () => {
        const u = p.estudiantes.find(x => String(x.id) === tr.dataset.id);
        p.estudianteSeleccionado = u;
        p.detalle = null;
        render();
      };
    });
  }

  function renderProfesorDetalleEstudiante() {
    const p = state.profesor;
    const u = p.estudianteSeleccionado;

    let cuerpo = '<div class="grid-3">' +
      seccionBotonPf('practica', 'Practica', 'Sesiones de practica por materia, competencia y eje tematico.') +
      seccionBotonPf('simulacro', 'Simulacro', 'Simulacros completos tipo examen.') +
      seccionBotonPf('global', 'Estadisticas globales', 'Resumen general y desglose por materia.') +
      '</div>';

    el('profesor-content').innerHTML = `
      <div class="row" style="margin-bottom:1rem;">
        <button class="btn btn-outline btn-sm" id="btn-volver-lista-pf">&larr; Volver a estudiantes</button>
      </div>
      <div class="card">
        <div class="eyebrow">Estudiante</div>
        <h2>${escapeHtml(u.nombre)} ${escapeHtml(u.apellidos)}</h2>
        <p class="text-muted mb-0">${escapeHtml(u.email)}</p>
      </div>
      <div class="card">
        <h3>¿Que deseas ver?</h3>
        ${cuerpo}
      </div>
      <div id="detalle-estudiante-pf"></div>
    `;

    function seccionBotonPf(tipo, titulo, desc) {
      const activo = p.detalle && p.detalle.tipo === tipo;
      return `
        <button class="mode-card" data-tipo="${tipo}" style="${activo ? 'border-color:var(--accent);' : ''}">
          <div class="mode-icon">${titulo[0]}</div>
          <h3 class="mb-0">${titulo}</h3>
          <p class="text-muted mb-0">${desc}</p>
        </button>
      `;
    }

    el('btn-volver-lista-pf').onclick = () => { p.estudianteSeleccionado = null; p.detalle = null; render(); };
    app().querySelectorAll('.mode-card[data-tipo]').forEach(btn => {
      btn.onclick = () => cargarDetalleEstudiantePf(btn.dataset.tipo);
    });

    if (p.detalle) pintarDetalleEstudiantePf();
  }

  async function cargarDetalleEstudiantePf(tipo) {
    const p = state.profesor;
    const id = p.estudianteSeleccionado.id;
    if (tipo === 'global') {
      const data = await api(`/profesor/students/${id}/summary`);
      p.detalle = { tipo: 'global', datos: data };
    } else {
      const data = await api(`/profesor/students/${id}/sessions?tipo=${tipo}`);
      p.detalle = { tipo, datos: data };
    }
    render();
  }

  // Reutiliza exactamente la misma presentacion que el detalle de
  // estudiante del administrador (mismo formato de datos), apuntando al
  // contenedor del panel de profesor.
  function pintarDetalleEstudiantePf() {
    const cont = el('detalle-estudiante-pf');
    if (!cont) return;
    pintarDetalleEstudianteEn(cont, state.profesor.detalle);
  }

  /* ================================================================== */
  /* VISTA: ESTUDIANTE                                                   */
  /* ================================================================== */

  function renderEstudiante() {
    const p = state.estudiante.pantalla;
    if (p === 'inicio') return renderEstudianteInicio();
    if (p === 'practica-config') return renderPracticaConfig();
    if (p === 'practica-run') return renderPracticaRun();
    if (p === 'simulacro-config') return renderSimulacroConfig();
    if (p === 'simulacro-run') return renderSimulacroRun();
    if (p === 'resultado') return renderResultado();
  }

  function renderEstudianteInicio() {
    app().innerHTML = `
      <h1>Hola, ${escapeHtml(state.user.nombre)}</h1>
      <p class="text-muted">Elige como quieres prepararte hoy.</p>
      <div class="grid-2" style="margin-top:1.25rem;">
        <button class="mode-card" id="ir-practica">
          <div class="mode-icon">P</div>
          <h3>Practica</h3>
          <p class="text-muted mb-0">Elige materia, competencia o eje tematico, con cronometro que puedes pausar entre preguntas.</p>
        </button>
        <button class="mode-card" id="ir-simulacro">
          <div class="mode-icon">S</div>
          <h3>Simulacro</h3>
          <p class="text-muted mb-0">Examen completo con cronometro continuo, navegacion libre y ambas materias.</p>
        </button>
      </div>
    `;
    el('ir-practica').onclick = () => { state.estudiante.pantalla = 'practica-config'; render(); };
    el('ir-simulacro').onclick = () => { state.estudiante.pantalla = 'simulacro-config'; render(); };
  }

  /* ---------- Practica ---------- */

  function renderPracticaConfig() {
    const materiaInicial = 'lectura_critica';
    app().innerHTML = `
      <button class="btn btn-ghost btn-sm" id="volver">&larr; Volver</button>
      <h1>Practica</h1>
      <div class="card" style="max-width:480px;">
        <p class="hint">Elige la materia y, si quieres, enfoca la practica en una competencia o un eje tematico especifico (clasificacion oficial del Icfes). Si los dejas en "Todas", se mezclan preguntas de toda la materia.</p>
        <form id="form-practica" class="stack">
          <div class="field">
            <label>Materia</label>
            <select name="materia" id="input-p-materia" required>
              <option value="lectura_critica">Lectura Critica</option>
              <option value="matematicas">Matematicas</option>
            </select>
          </div>
          <div class="field">
            <label>Competencia (opcional)</label>
            <select name="competencia" id="input-p-competencia"></select>
          </div>
          <div class="field">
            <label>Eje tematico (opcional)</label>
            <select name="eje" id="input-p-eje"></select>
          </div>
          <div class="field">
            <label>Cantidad de preguntas</label>
            <select name="count">
              <option value="5">5</option>
              <option value="10" selected>10</option>
              <option value="15">15</option>
            </select>
          </div>
          <button type="submit" class="btn btn-primary btn-block">Iniciar practica</button>
        </form>
      </div>
    `;
    function poblarTaxonomiaPractica(materiaActual) {
      el('input-p-competencia').innerHTML = '<option value="">Todas</option>' +
        COMPETENCIAS_POR_MATERIA[materiaActual].map(c => `<option value="${c}">${competenciaLabel(c)}</option>`).join('');
      el('input-p-eje').innerHTML = '<option value="">Todos</option>' +
        EJES_POR_MATERIA[materiaActual].map(j => `<option value="${j}">${ejeLabel(j)}</option>`).join('');
    }
    poblarTaxonomiaPractica(materiaInicial);
    el('input-p-materia').onchange = (e) => poblarTaxonomiaPractica(e.target.value);

    el('volver').onclick = () => { state.estudiante.pantalla = 'inicio'; render(); };
    el('form-practica').onsubmit = async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const materia = fd.get('materia'), competencia = fd.get('competencia'), eje = fd.get('eje'), count = fd.get('count');
      const params = new URLSearchParams({ materia, count });
      if (competencia) params.set('competencia', competencia);
      if (eje) params.set('eje', eje);
      const data = await api(`/questions/practice?${params.toString()}`);
      if (!data.preguntas.length) {
        alert('Todavia no hay preguntas cargadas para esa combinacion. Elige otra competencia o eje.');
        return;
      }
      state.estudiante.practica = {
        materia, competencia, eje,
        preguntas: data.preguntas,
        textosMap: new Map((data.textos || []).map(t => [t.id, t.contenido])),
        idx: 0,
        respuestas: new Array(data.preguntas.length).fill(null),
        tiempoPorPregunta: new Array(data.preguntas.length).fill(0),
        tiempo: 0,
        pausado: false,
        intervalo: null
      };
      state.estudiante.pantalla = 'practica-run';
      render();
      iniciarTimerPractica();
    };
  }

  function iniciarTimerPractica() {
    const pr = state.estudiante.practica;
    if (pr.intervalo) clearInterval(pr.intervalo);
    pr.intervalo = setInterval(() => {
      if (!pr.pausado) {
        pr.tiempo += 1;
        pr.tiempoPorPregunta[pr.idx] = (pr.tiempoPorPregunta[pr.idx] || 0) + 1;
        const t = el('practica-timer');
        if (t) t.textContent = formatTiempo(pr.tiempo);
      }
    }, 1000);
  }

  function renderPracticaRun() {
    const pr = state.estudiante.practica;
    const q = pr.preguntas[pr.idx];
    const seleccion = pr.respuestas[pr.idx];
    const esUltima = pr.idx === pr.preguntas.length - 1;

    const textoCompartido = textoDe(q, pr.textosMap);
    const dividido = !!(q.imagen || (textoCompartido && textoCompartido.length > 220));
    const grupoTotal = q.texto_id ? pr.preguntas.filter(x => x.texto_id === q.texto_id).length : 0;
    const bloqueFuente = (textoCompartido || q.imagen) ? `
        ${grupoTotal >= 5 ? `<div class="texto-grupo-aviso">Responde las siguientes ${grupoTotal} preguntas con el texto presentado.</div>` : ''}
        ${textoCompartido ? `<div class="texto-base">${escapeHtml(textoCompartido)}</div>` : ''}
        ${q.imagen ? `<img class="pregunta-img" src="${q.imagen}" alt="Imagen de la pregunta" />` : ''}
    ` : '';
    const bloquePregunta = `
        <div class="enunciado">${escapeHtml(q.enunciado)}</div>
        <div class="opciones" id="opciones">
          ${LETRAS.map(l => `
            <button type="button" class="opcion ${seleccion === l ? 'selected' : ''}" data-letra="${l}" ${pr.pausado ? 'disabled' : ''}>
              <span class="letra">${l.toUpperCase()}</span>
              <span>${escapeHtml(q['opcion_' + l])}</span>
            </button>
          `).join('')}
        </div>
        <div class="row between">
          <button class="btn btn-outline" id="btn-anterior" ${pr.idx === 0 || pr.pausado ? 'disabled' : ''}>&larr; Anterior</button>
          ${esUltima
            ? `<button class="btn btn-primary" id="btn-finalizar" ${pr.pausado ? 'disabled' : ''}>Finalizar practica</button>`
            : `<button class="btn btn-secondary" id="btn-siguiente" ${pr.pausado ? 'disabled' : ''}>Siguiente &rarr;</button>`}
        </div>
        ${pr.pausado ? '<p class="hint" style="margin-top:0.75rem;">El cronometro esta en pausa. Presiona "Continuar" para seguir avanzando.</p>' : ''}
    `;

    app().innerHTML = `
      <div class="exam-header">
        <div>
          <div class="eyebrow">Practica &middot; ${materiaLabel(pr.materia)} &middot; ${competenciaLabel(q.competencia)} &middot; ${ejeLabel(q.eje)}</div>
          <h2 class="mb-0">Pregunta ${pr.idx + 1} de ${pr.preguntas.length}</h2>
        </div>
        <div class="row" style="gap:0.6rem;">
          <span id="practica-timer" class="timer ${pr.pausado ? 'paused' : ''}">${formatTiempo(pr.tiempo)}</span>
          <button class="btn ${pr.pausado ? 'btn-primary' : 'btn-outline'}" id="btn-pausa">${pr.pausado ? 'Continuar' : 'Pausar'}</button>
        </div>
      </div>
      ${bloqueFuente ? `
      <div class="card question-box ${dividido ? 'question-box-split' : ''}">
        <div class="question-box-fuente">${bloqueFuente}</div>
        <div class="question-box-pregunta">${bloquePregunta}</div>
      </div>` : `<div class="card question-box">${bloquePregunta}</div>`}
    `;

    el('btn-pausa').onclick = () => { pr.pausado = !pr.pausado; render(); };
    app().querySelectorAll('#opciones .opcion').forEach(btn => {
      btn.onclick = () => {
        if (pr.pausado) return;
        pr.respuestas[pr.idx] = btn.dataset.letra;
        render();
      };
    });
    const btnAnt = el('btn-anterior');
    if (btnAnt) btnAnt.onclick = () => { pr.idx = Math.max(0, pr.idx - 1); render(); };
    const btnSig = el('btn-siguiente');
    if (btnSig) btnSig.onclick = () => { pr.idx = Math.min(pr.preguntas.length - 1, pr.idx + 1); render(); };
    const btnFin = el('btn-finalizar');
    if (btnFin) btnFin.onclick = finalizarPractica;
  }

  async function finalizarPractica() {
    const pr = state.estudiante.practica;
    if (pr.intervalo) clearInterval(pr.intervalo);
    const respuestas = pr.preguntas.map((q, i) => ({
      question_id: q.id, respuesta_usuario: pr.respuestas[i], tiempo_segundos: pr.tiempoPorPregunta[i] || 0
    }));
    const data = await api('/sessions', {
      method: 'POST',
      body: { tipo: 'practica', materia: pr.materia, competencia: pr.competencia, eje: pr.eje, tiempo_segundos: pr.tiempo, respuestas }
    });
    state.estudiante.resultado = data.sesion;
    state.estudiante.resultadoDetalle = data.detalle;
    state.estudiante.pantalla = 'resultado';
    render();
  }

  /* ---------- Simulacro ---------- */

  function renderSimulacroConfig() {
    app().innerHTML = `
      <button class="btn btn-ghost btn-sm" id="volver">&larr; Volver</button>
      <h1>Simulacro</h1>
      <div class="card" style="max-width:480px;">
        <p class="text-muted">El simulacro tiene un cronometro que corre desde el inicio. Puedes moverte libremente entre preguntas y, si eliges ambas materias, cambiar de materia cuando quieras.</p>
        <form id="form-simulacro" class="stack">
          <div class="field">
            <label>¿Que quieres presentar?</label>
            <div class="stack" style="gap:0.5rem;">
              <label class="opcion-radio">
                <input type="radio" name="modo" value="lectura_critica" />
                <span>Solo Lectura Critica</span>
              </label>
              <label class="opcion-radio">
                <input type="radio" name="modo" value="matematicas" />
                <span>Solo Matematicas</span>
              </label>
              <label class="opcion-radio">
                <input type="radio" name="modo" value="ambas" checked />
                <span>Ambas materias</span>
              </label>
            </div>
          </div>
          <div class="field">
            <label>Preguntas por materia (aprox.)</label>
            <select name="porMateria">
              <option value="6">6 por materia (12 en total si eliges ambas)</option>
              <option value="9" selected>9 por materia (18 en total si eliges ambas)</option>
              <option value="12">12 por materia (24 en total si eliges ambas)</option>
            </select>
          </div>
          <button type="submit" class="btn btn-primary btn-block">Iniciar simulacro</button>
        </form>
      </div>
    `;
    el('volver').onclick = () => { state.estudiante.pantalla = 'inicio'; render(); };
    el('form-simulacro').onsubmit = async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const porMateria = fd.get('porMateria');
      const modo = fd.get('modo') || 'ambas';
      const materias = modo === 'ambas' ? ['lectura_critica', 'matematicas'] : [modo];
      const data = await api(`/questions/simulacro-pool?porMateria=${porMateria}&materias=${materias.join(',')}`);
      if (!data.preguntas.length) {
        alert('Todavia no hay suficientes preguntas cargadas para el simulacro.');
        return;
      }
      const byMateria = { lectura_critica: [], matematicas: [] };
      data.preguntas.forEach(q => { (byMateria[q.materia] || byMateria.lectura_critica).push(q); });

      state.estudiante.simulacro = {
        materias,
        todas: data.preguntas,
        textosMap: new Map((data.textos || []).map(t => [t.id, t.contenido])),
        byMateria,
        tab: materias[0],
        pos: { lectura_critica: 0, matematicas: 0 },
        respuestas: {},
        tiempoPorPregunta: {},
        tiempo: 0,
        intervalo: null
      };
      state.estudiante.pantalla = 'simulacro-run';
      render();
      iniciarTimerSimulacro();
    };
  }

  function iniciarTimerSimulacro() {
    const sm = state.estudiante.simulacro;
    if (sm.intervalo) clearInterval(sm.intervalo);
    sm.intervalo = setInterval(() => {
      sm.tiempo += 1;
      const subset = sm.byMateria[sm.tab] || [];
      const qActual = subset[sm.pos[sm.tab] || 0];
      if (qActual) sm.tiempoPorPregunta[qActual.id] = (sm.tiempoPorPregunta[qActual.id] || 0) + 1;
      const t = el('simulacro-timer');
      if (t) t.textContent = formatTiempo(sm.tiempo);
    }, 1000);
  }

  function renderSimulacroRun() {
    const sm = state.estudiante.simulacro;
    const subset = sm.byMateria[sm.tab] || [];
    const pos = sm.pos[sm.tab] || 0;
    const q = subset[pos];

    const totalRespondidas = Object.keys(sm.respuestas).length;

    const tabs = ['lectura_critica', 'matematicas']
      .filter(m => sm.byMateria[m].length)
      .map(m => {
        const respondidasM = sm.byMateria[m].filter(qq => sm.respuestas[qq.id]).length;
        return `<button data-tab="${m}" class="${sm.tab === m ? 'active' : ''}">${materiaLabel(m)} (${respondidasM}/${sm.byMateria[m].length})</button>`;
      }).join('');

    const grid = subset.map((qq, i) => {
      const respondida = !!sm.respuestas[qq.id];
      const esActual = i === pos;
      return `<button data-idx="${i}" class="${respondida ? 'answered' : ''} ${esActual ? 'current' : ''}">${i + 1}</button>`;
    }).join('');

    const seleccion = q ? sm.respuestas[q.id] : null;

    app().innerHTML = `
      <div class="exam-header">
        <div>
          <div class="eyebrow">Simulacro</div>
          <h2 class="mb-0">${totalRespondidas} de ${sm.todas.length} respondidas</h2>
        </div>
        <div class="row" style="gap:0.6rem;">
          <span id="simulacro-timer" class="timer">${formatTiempo(sm.tiempo)}</span>
          <button class="btn btn-primary" id="btn-finalizar-sim">Finalizar simulacro</button>
        </div>
      </div>

      <div class="card">
        <div class="subject-tabs">${tabs}</div>
        <div class="q-grid">${grid}</div>
      </div>

      ${q ? (() => {
        const textoCompartido = textoDe(q, sm.textosMap);
        const dividido = !!(q.imagen || (textoCompartido && textoCompartido.length > 220));
        const grupoTotal = q.texto_id ? sm.todas.filter(x => x.texto_id === q.texto_id).length : 0;
        const pills = `
          <div class="row question-box-pills" style="gap:0.5rem; margin-bottom:0.75rem;">
            <span class="pill pill-materia">${materiaLabel(q.materia)}</span>
            <span class="pill pill-competencia">${competenciaLabel(q.competencia)}</span>
            <span class="pill pill-eje">${ejeLabel(q.eje)}</span>
          </div>
        `;
        const bloqueFuente = (textoCompartido || q.imagen) ? `
          ${grupoTotal >= 5 ? `<div class="texto-grupo-aviso">Responde las siguientes ${grupoTotal} preguntas con el texto presentado.</div>` : ''}
          ${textoCompartido ? `<div class="texto-base">${escapeHtml(textoCompartido)}</div>` : ''}
          ${q.imagen ? `<img class="pregunta-img" src="${q.imagen}" alt="Imagen de la pregunta" />` : ''}
        ` : '';
        const bloquePregunta = `
          <div class="enunciado">${escapeHtml(q.enunciado)}</div>
          <div class="opciones" id="opciones">
            ${LETRAS.map(l => `
              <button type="button" class="opcion ${seleccion === l ? 'selected' : ''}" data-letra="${l}">
                <span class="letra">${l.toUpperCase()}</span>
                <span>${escapeHtml(q['opcion_' + l])}</span>
              </button>
            `).join('')}
          </div>
          <div class="row between">
            <button class="btn btn-outline" id="btn-anterior" ${pos === 0 ? 'disabled' : ''}>&larr; Anterior</button>
            <button class="btn btn-secondary" id="btn-siguiente" ${pos === subset.length - 1 ? 'disabled' : ''}>Siguiente &rarr;</button>
          </div>
        `;
        return bloqueFuente
          ? `<div class="card question-box ${dividido ? 'question-box-split' : ''}">${pills}<div class="question-box-fuente">${bloqueFuente}</div><div class="question-box-pregunta">${bloquePregunta}</div></div>`
          : `<div class="card question-box">${pills}${bloquePregunta}</div>`;
      })() : '<div class="card"><p class="text-muted mb-0">No hay preguntas en esta materia.</p></div>'}
    `;

    app().querySelectorAll('.subject-tabs button').forEach(btn => {
      btn.onclick = () => { sm.tab = btn.dataset.tab; render(); };
    });
    app().querySelectorAll('.q-grid button').forEach(btn => {
      btn.onclick = () => { sm.pos[sm.tab] = Number(btn.dataset.idx); render(); };
    });
    if (q) {
      app().querySelectorAll('#opciones .opcion').forEach(btn => {
        btn.onclick = () => { sm.respuestas[q.id] = btn.dataset.letra; render(); };
      });
      const btnAnt = el('btn-anterior');
      if (btnAnt) btnAnt.onclick = () => { sm.pos[sm.tab] = Math.max(0, pos - 1); render(); };
      const btnSig = el('btn-siguiente');
      if (btnSig) btnSig.onclick = () => { sm.pos[sm.tab] = Math.min(subset.length - 1, pos + 1); render(); };
    }
    el('btn-finalizar-sim').onclick = finalizarSimulacro;
  }

  async function finalizarSimulacro() {
    const sm = state.estudiante.simulacro;
    const total = sm.todas.length;
    const respondidas = Object.keys(sm.respuestas).length;
    if (respondidas < total) {
      const ok = confirm(`Has respondido ${respondidas} de ${total} preguntas. ¿Seguro que deseas finalizar el simulacro?`);
      if (!ok) return;
    }
    if (sm.intervalo) clearInterval(sm.intervalo);
    const respuestas = sm.todas.map(q => ({
      question_id: q.id, respuesta_usuario: sm.respuestas[q.id] || null, tiempo_segundos: sm.tiempoPorPregunta[q.id] || 0
    }));
    const data = await api('/sessions', {
      method: 'POST',
      body: { tipo: 'simulacro', materias: sm.materias, tiempo_segundos: sm.tiempo, respuestas }
    });
    state.estudiante.resultado = data.sesion;
    state.estudiante.resultadoDetalle = data.detalle;
    state.estudiante.pantalla = 'resultado';
    render();
  }

  /* ---------- Resultado ---------- */

  function renderResultado() {
    const r = state.estudiante.resultado;
    const det = state.estudiante.resultadoDetalle;
    const pct = r.num_preguntas ? Math.round((r.num_correctas / r.num_preguntas) * 100) : 0;
    const tiempoPromedio = det && det.preguntas.length
      ? Math.round(det.preguntas.reduce((a, p) => a + (p.tiempo_segundos || 0), 0) / det.preguntas.length)
      : 0;

    const mejorar = det ? [...det.porCompetencia, ...det.porEje] : [];
    const bloqueMejorar = mejorar.length ? `
      <div class="card">
        <h3>¿En que conviene reforzar?</h3>
        <p class="hint">Se calcula como el porcentaje de aciertos dentro de cada competencia o eje que aparecio en esta sesion (correctas &divide; total de esa categoria). Los que quedaron por debajo del 70% son los que mas conviene repasar.</p>
        ${det.porCompetencia.map(g => barraConValor('Competencia: ' + competenciaLabel(g.clave), g.correctas, g.total, g.porcentaje)).join('')}
        ${det.porEje.map(g => barraConValor('Eje: ' + ejeLabel(g.clave), g.correctas, g.total, g.porcentaje)).join('')}
        ${det.aMejorar.length ? `<p class="hint" style="margin-top:0.5rem;">Prioriza: ${det.aMejorar.map(k => `<strong>${competenciaLabel(k) !== k ? competenciaLabel(k) : ejeLabel(k)}</strong>`).join(', ')}.</p>` : '<p class="hint" style="margin-top:0.5rem;">Buen desempeño en todas las categorias de esta sesion (70% o mas de aciertos).</p>'}
      </div>
    ` : '';

    const bloquePreguntas = det ? `
      <div class="card">
        <h3>Revision pregunta por pregunta</h3>
        <div class="stack" style="gap:0.9rem;">
          ${det.preguntas.map((p, i) => `
            <div class="revision-pregunta ${p.correcta ? 'correcta' : 'incorrecta'}">
              <div class="row between" style="gap:0.5rem; flex-wrap:wrap;">
                <strong>Pregunta ${i + 1}${p.competencia ? ' &middot; ' + competenciaLabel(p.competencia) : ''}${p.eje ? ' &middot; ' + ejeLabel(p.eje) : ''}</strong>
                <span class="pill ${p.correcta ? 'pill-correcta' : 'pill-incorrecta'}">${p.correcta ? 'Correcta' : 'Incorrecta'}</span>
              </div>
              ${p.enunciado ? `<p style="margin:0.5rem 0;">${escapeHtml(p.enunciado)}</p>` : ''}
              ${p.opciones ? `
                <div class="opciones opciones-revision">
                  ${LETRAS.map(l => `
                    <div class="opcion readonly ${p.respuesta_correcta === l ? 'correcta' : ''} ${p.respuesta_usuario === l && p.respuesta_usuario !== p.respuesta_correcta ? 'incorrecta' : ''}">
                      <span class="letra">${l.toUpperCase()}</span>
                      <span>${escapeHtml(p.opciones[l])}</span>
                      ${p.respuesta_usuario === l ? '<span class="hint">(tu respuesta)</span>' : ''}
                    </div>
                  `).join('')}
                </div>
              ` : ''}
              ${p.explicacion ? `<p class="hint" style="margin-top:0.5rem;"><strong>Explicacion:</strong> ${escapeHtml(p.explicacion)}</p>` : ''}
              <p class="hint mb-0" style="margin-top:0.4rem;">Tiempo en esta pregunta: ${formatTiempo(p.tiempo_segundos)}</p>
            </div>
          `).join('')}
        </div>
      </div>
    ` : '';

    app().innerHTML = `
      <div class="text-center" style="max-width:640px; margin:0 auto;">
        <h1>${r.tipo === 'practica' ? '¡Practica completada!' : '¡Simulacro completado!'}</h1>
        <div class="card">
          <div class="row" style="gap:1.5rem; align-items:center; justify-content:center; flex-wrap:wrap;">
            ${donutSvg(pct, '--accent')}
            <div class="grid-3" style="flex:1; min-width:220px;">
              <div class="stat-card"><div class="stat-value">${r.num_preguntas}</div><div class="stat-label">Preguntas</div></div>
              <div class="stat-card"><div class="stat-value">${r.num_correctas}</div><div class="stat-label">Correctas</div></div>
              <div class="stat-card"><div class="stat-value">${pct}%</div><div class="stat-label">Aciertos</div></div>
            </div>
          </div>
          <p class="hint text-center" style="margin-top:0.75rem;">El porcentaje de aciertos se calcula como preguntas correctas &divide; preguntas totales (${r.num_correctas}/${r.num_preguntas} = ${pct}%).</p>
          <p class="text-muted text-center" style="margin-top:0.5rem;">Tiempo total: ${formatTiempo(r.tiempo_segundos)} &middot; Tiempo promedio por pregunta: ${formatTiempo(tiempoPromedio)}${r.nivel_estimado ? ' &middot; Nivel estimado: ' + r.nivel_estimado : ''}</p>
        </div>
        ${bloqueMejorar}
        ${bloquePreguntas}
        <button class="btn btn-primary" id="btn-volver-inicio">Volver al inicio</button>
      </div>
    `;
    el('btn-volver-inicio').onclick = () => {
      state.estudiante.practica = null;
      state.estudiante.simulacro = null;
      state.estudiante.resultado = null;
      state.estudiante.resultadoDetalle = null;
      state.estudiante.pantalla = 'inicio';
      render();
    };
  }

  /* ---------------------------------------------------------------- */

  document.addEventListener('DOMContentLoaded', init);
})();