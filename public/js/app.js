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
    view: 'cargando', // cargando | auth | admin | estudiante
    authTab: 'login',
    authRole: 'estudiante', // 'estudiante' | 'administrador' -- solo cambia el texto de ayuda del login
    authError: '',

    admin: {
      tab: 'preguntas',
      preguntas: [],
      filtroMateria: '',
      filtroDificultad: '',
      modal: null, // { modo: 'crear'|'editar'|'ver', pregunta }
      modalError: '',
      estudiantes: [],
      estudianteSeleccionado: null,
      detalle: null, // { tipo: 'practica'|'simulacro'|'global', datos }
    },

    estudiante: {
      pantalla: 'inicio', // inicio | practica-config | practica-run | simulacro-config | simulacro-run | resultado
      practica: null,
      simulacro: null,
      resultado: null,
    }
  };

  const MATERIA_LABEL = { lectura_critica: 'Lectura Critica', matematicas: 'Matematicas' };
  const DIFICULTAD_LABEL = { facil: 'Facil', media: 'Media', dificil: 'Dificil' };
  const LETRAS = ['a', 'b', 'c', 'd'];

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
  function dificultadLabel(d) { return DIFICULTAD_LABEL[d] || d || '-'; }

  function formatTiempo(segundos) {
    segundos = Math.max(0, Math.round(Number(segundos) || 0));
    const m = Math.floor(segundos / 60);
    const s = segundos % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
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
    } else if (state.view === 'estudiante') {
      renderEstudiante();
    }
  }

  function renderTopnav() {
    if (!state.user) { topnav().innerHTML = ''; return; }
    const nombreCompleto = escapeHtml(state.user.nombre + ' ' + (state.user.apellidos || ''));
    topnav().innerHTML = `
      <span class="user-chip">${nombreCompleto}${state.user.role === 'administrador' ? ' &middot; Administrador' : ''}</span>
      <button id="btn-logout">Cerrar sesion</button>
    `;
    el('btn-logout').onclick = logout;
  }

  /* ================================================================== */
  /* VISTA: AUTENTICACION                                                */
  /* ================================================================== */

  function renderAuth() {
    const t = state.authTab;
    const isAdminRole = state.authRole === 'administrador';
    const blockedAdminRegister = t === 'registro' && isAdminRole;

    app().innerHTML = `
      <div class="auth-shell">
        <div class="auth-visual">
          <div>
            <div class="visual-brand"><span>Ruta</span><span class="vb-saber">Saber</span><span class="dot"></span></div>
            <h1>Práctica para el <em>Saber 11</em>,<br>a tu propio ritmo.</h1>
            <p class="sub">Práctica guiada para Lectura Crítica y Matemáticas, con tu progreso guardado en el servidor.</p>
            <div class="diff-legend">
              <span><i class="dotc" style="background:var(--success)"></i>Fácil</span>
              <span><i class="dotc" style="background:var(--accent)"></i>Media</span>
              <span><i class="dotc" style="background:#5B8DEF"></i>Difícil</span>
            </div>
          </div>
          <p class="visual-foot">Ruta Saber &middot; examen Saber 11</p>
        </div>
        <div class="auth-form-wrap">
          <div class="auth-card card">
            <div class="role-toggle">
              <button type="button" data-role="estudiante" class="${!isAdminRole ? 'active' : ''}">Estudiante</button>
              <button type="button" data-role="administrador" class="${isAdminRole ? 'active' : ''}">Administrador</button>
            </div>
            ${blockedAdminRegister ? `
              <h2 class="mb-0" style="font-size:1.4rem; margin-bottom:4px;">Cuenta de administrador</h2>
              <p class="hint" style="margin-bottom:14px;">Este sistema no permite crear cuentas de administrador desde el registro: ya existe una única cuenta. Si eres administrador, inicia sesión con tus credenciales.</p>
              <button type="button" class="btn btn-primary btn-block" id="btn-ir-login">Ir a iniciar sesión</button>
            ` : `
              <h2 class="mb-0" style="font-size:1.4rem; margin-bottom:4px;">${t === 'registro' ? 'Crear cuenta' : 'Iniciar sesión'}</h2>
              <p class="hint" style="margin-bottom:10px;">${t === 'registro' ? 'Regístrate como estudiante para practicar y guardar tu progreso.' : (isAdminRole ? 'Ingresa con el correo y la contraseña del administrador.' : 'Ingresa con la cuenta que creaste.')}</p>
              ${state.authError ? `<div class="error-box">${escapeHtml(state.authError)}</div>` : ''}
              ${t === 'login' ? formLogin() : formRegistro()}
              ${!isAdminRole ? `
                <div class="authmode-switch">
                  ${t === 'registro'
                    ? `&iquest;Ya tienes cuenta? <button type="button" id="btn-switch-mode">Inicia sesión</button>`
                    : `&iquest;No tienes cuenta? <button type="button" id="btn-switch-mode">Regístrate</button>`}
                </div>
              ` : ''}
            `}
          </div>
        </div>
      </div>
    `;

    app().querySelectorAll('.role-toggle button').forEach(btn => {
      btn.onclick = () => { state.authRole = btn.dataset.role; render(); };
    });
    const btnIrLogin = el('btn-ir-login');
    if (btnIrLogin) btnIrLogin.onclick = () => { state.authTab = 'login'; render(); };
    const btnSwitch = el('btn-switch-mode');
    if (btnSwitch) btnSwitch.onclick = () => { state.authTab = t === 'registro' ? 'login' : 'registro'; state.authError = ''; render(); };

    if (!blockedAdminRegister) {
      if (t === 'login') {
        el('form-login').onsubmit = onSubmitLogin;
      } else {
        el('form-registro').onsubmit = onSubmitRegistro;
      }
    }
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
          password: fd.get('password')
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
    if (state.admin.filtroDificultad) params.set('dificultad', state.admin.filtroDificultad);
    const data = await api('/questions?' + params.toString());
    state.admin.preguntas = data.preguntas;
    render();
  }

  async function loadAdminEstudiantes() {
    const data = await api('/admin/students');
    state.admin.estudiantes = data.estudiantes;
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
      </div>
      <div id="admin-content"></div>
    `;
    el('tab-preguntas').onclick = () => { a.tab = 'preguntas'; render(); };
    el('tab-estudiantes').onclick = () => {
      a.tab = 'estudiantes'; a.estudianteSeleccionado = null; a.detalle = null; render();
    };

    if (a.tab === 'preguntas') renderAdminPreguntas(); else renderAdminEstudiantes();

    if (a.modal) renderModalPregunta();
  }

  /* ---------- Admin: banco de preguntas ---------- */

  function renderAdminPreguntas() {
    const a = state.admin;
    const filas = a.preguntas.map(p => `
      <tr>
        <td>#${p.id}</td>
        <td><span class="pill pill-materia">${materiaLabel(p.materia)}</span></td>
        <td><span class="pill pill-${p.dificultad}">${dificultadLabel(p.dificultad)}</span></td>
        <td style="white-space:normal; max-width:360px;">${escapeHtml(p.enunciado).slice(0, 110)}${p.enunciado.length > 110 ? '&hellip;' : ''}</td>
        <td>${p.imagen ? '&#128247;' : ''}</td>
        <td>
          <div class="row" style="gap:0.4rem;">
            <button class="btn btn-outline btn-sm" data-ver="${p.id}">Ver</button>
            <button class="btn btn-outline btn-sm" data-editar="${p.id}">Editar</button>
            <button class="btn btn-danger btn-sm" data-eliminar="${p.id}">Eliminar</button>
          </div>
        </td>
      </tr>
    `).join('');

    el('admin-content').innerHTML = `
      <div class="card">
        <div class="row between" style="margin-bottom:1rem;">
          <div class="row" style="gap:0.6rem;">
            <select id="filtro-materia">
              <option value="">Todas las materias</option>
              <option value="lectura_critica" ${a.filtroMateria === 'lectura_critica' ? 'selected' : ''}>Lectura Critica</option>
              <option value="matematicas" ${a.filtroMateria === 'matematicas' ? 'selected' : ''}>Matematicas</option>
            </select>
            <select id="filtro-dificultad">
              <option value="">Toda dificultad</option>
              <option value="facil" ${a.filtroDificultad === 'facil' ? 'selected' : ''}>Facil</option>
              <option value="media" ${a.filtroDificultad === 'media' ? 'selected' : ''}>Media</option>
              <option value="dificil" ${a.filtroDificultad === 'dificil' ? 'selected' : ''}>Dificil</option>
            </select>
          </div>
          <button id="btn-nueva-pregunta" class="btn btn-primary">+ Agregar pregunta</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>ID</th><th>Materia</th><th>Dificultad</th><th>Enunciado</th><th>Imagen</th><th>Acciones</th></tr></thead>
            <tbody>${filas || ''}</tbody>
          </table>
          ${!a.preguntas.length ? '<div class="empty-state">No hay preguntas con estos filtros todavia.</div>' : ''}
        </div>
      </div>
    `;

    el('filtro-materia').onchange = (e) => { a.filtroMateria = e.target.value; loadAdminPreguntas(); };
    el('filtro-dificultad').onchange = (e) => { a.filtroDificultad = e.target.value; loadAdminPreguntas(); };
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
      backdrop.innerHTML = `
        <div class="modal">
          <div class="modal-header">
            <h2 class="mb-0">${titulo}</h2>
            <button class="modal-close" id="modal-cerrar">&times;</button>
          </div>
          <div class="row" style="gap:0.5rem; margin-bottom:1rem;">
            <span class="pill pill-materia">${materiaLabel(p.materia)}</span>
            <span class="pill pill-${p.dificultad}">${dificultadLabel(p.dificultad)}</span>
          </div>
          ${p.texto_base ? `<div class="question-box"><div class="texto-base">${escapeHtml(p.texto_base)}</div></div>` : ''}
          ${p.imagen ? `<img class="pregunta-img" src="${p.imagen}" alt="Imagen de la pregunta" />` : ''}
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
              <select name="materia" required>
                <option value="lectura_critica" ${p.materia === 'lectura_critica' ? 'selected' : ''}>Lectura Critica</option>
                <option value="matematicas" ${p.materia === 'matematicas' ? 'selected' : ''}>Matematicas</option>
              </select>
            </div>
            <div class="field">
              <label>Dificultad</label>
              <select name="dificultad" required>
                <option value="facil" ${p.dificultad === 'facil' ? 'selected' : ''}>Facil</option>
                <option value="media" ${p.dificultad === 'media' ? 'selected' : ''}>Media</option>
                <option value="dificil" ${p.dificultad === 'dificil' ? 'selected' : ''}>Dificil</option>
              </select>
            </div>
          </div>
          <div class="field">
            <label>Texto base / lectura (opcional)</label>
            <textarea name="texto_base" placeholder="Parrafo o contexto de lectura, si aplica">${escapeHtml(p.texto_base || '')}</textarea>
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
        dificultad: fd.get('dificultad'),
        texto_base: fd.get('texto_base'),
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
      seccionBoton('practica', 'Practica', 'Sesiones de practica por materia y dificultad.') +
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
    const a = state.admin;
    const cont = el('detalle-estudiante');
    if (!cont) return;
    const { tipo, datos } = a.detalle;

    if (tipo === 'practica' || tipo === 'simulacro') {
      const sesiones = datos.sesiones;
      const filas = sesiones.map(s => {
        const fh = formatFechaHora(s.fecha_inicio);
        const pct = s.num_preguntas ? Math.round((s.num_correctas / s.num_preguntas) * 100) : 0;
        return `
          <tr>
            <td>${fh.fecha}</td>
            <td>${fh.hora}</td>
            <td>${s.num_preguntas}</td>
            <td>${s.num_correctas} (${pct}%)</td>
            <td>${formatTiempo(s.tiempo_segundos)}</td>
            ${tipo === 'practica' ? `<td>${dificultadLabel(s.dificultad)}</td><td>${materiaLabel(s.materia)}</td>` : `<td>${s.nivel_estimado || '-'}</td>`}
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
                  ${tipo === 'practica' ? '<th>Nivel</th><th>Materia</th>' : '<th>Nivel estimado</th>'}
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
    const barrasMateria = r.por_materia.map(m => `
      <div style="margin-bottom:0.8rem;">
        <div class="row between" style="margin-bottom:0.25rem;">
          <strong>${materiaLabel(m.materia)}</strong>
          <span class="text-muted">${m.correctas}/${m.total} &middot; ${m.porcentaje}%</span>
        </div>
        <div class="bar-track"><div class="bar-fill blue" style="width:${m.porcentaje}%;"></div></div>
      </div>
    `).join('');

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
        <div class="grid-3" style="margin-bottom:1.5rem;">
          <div class="stat-card"><div class="stat-value">${r.num_sesiones}</div><div class="stat-label">Sesiones totales</div></div>
          <div class="stat-card"><div class="stat-value">${r.num_practicas}</div><div class="stat-label">Practicas</div></div>
          <div class="stat-card"><div class="stat-value">${r.num_simulacros}</div><div class="stat-label">Simulacros</div></div>
        </div>
        <div style="margin-bottom:1.5rem;">
          <div class="row between" style="margin-bottom:0.25rem;">
            <strong>% de aciertos general</strong>
            <span class="text-muted">${r.num_correctas}/${r.num_preguntas}</span>
          </div>
          <div class="bar-track"><div class="bar-fill" style="width:${r.porcentaje_aciertos}%;"></div></div>
        </div>
        <h4>Desglose por materia</h4>
        ${barrasMateria || '<p class="text-muted">Sin datos todavia.</p>'}
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
          <p class="text-muted mb-0">Elige materia y dificultad, con cronometro que puedes pausar entre preguntas.</p>
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
    app().innerHTML = `
      <button class="btn btn-ghost btn-sm" id="volver">&larr; Volver</button>
      <h1>Practica</h1>
      <div class="card" style="max-width:480px;">
        <form id="form-practica" class="stack">
          <div class="field">
            <label>Materia</label>
            <select name="materia" required>
              <option value="lectura_critica">Lectura Critica</option>
              <option value="matematicas">Matematicas</option>
            </select>
          </div>
          <div class="field">
            <label>Dificultad</label>
            <select name="dificultad" required>
              <option value="facil">Facil</option>
              <option value="media">Media</option>
              <option value="dificil">Dificil</option>
            </select>
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
    el('volver').onclick = () => { state.estudiante.pantalla = 'inicio'; render(); };
    el('form-practica').onsubmit = async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const materia = fd.get('materia'), dificultad = fd.get('dificultad'), count = fd.get('count');
      const data = await api(`/questions/practice?materia=${materia}&dificultad=${dificultad}&count=${count}`);
      if (!data.preguntas.length) {
        alert('Todavia no hay preguntas cargadas para esa materia y dificultad. Elige otra combinacion.');
        return;
      }
      state.estudiante.practica = {
        materia, dificultad,
        preguntas: data.preguntas,
        idx: 0,
        respuestas: new Array(data.preguntas.length).fill(null),
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

    app().innerHTML = `
      <div class="exam-header">
        <div>
          <div class="eyebrow">Practica &middot; ${materiaLabel(pr.materia)} &middot; ${dificultadLabel(pr.dificultad)}</div>
          <h2 class="mb-0">Pregunta ${pr.idx + 1} de ${pr.preguntas.length}</h2>
        </div>
        <div class="row" style="gap:0.6rem;">
          <span id="practica-timer" class="timer ${pr.pausado ? 'paused' : ''}">${formatTiempo(pr.tiempo)}</span>
          <button class="btn ${pr.pausado ? 'btn-primary' : 'btn-outline'}" id="btn-pausa">${pr.pausado ? 'Continuar' : 'Pausar'}</button>
        </div>
      </div>
      <div class="card question-box">
        ${q.texto_base ? `<div class="texto-base">${escapeHtml(q.texto_base)}</div>` : ''}
        ${q.imagen ? `<img class="pregunta-img" src="${q.imagen}" alt="Imagen de la pregunta" />` : ''}
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
      </div>
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
    const respuestas = pr.preguntas.map((q, i) => ({ question_id: q.id, respuesta_usuario: pr.respuestas[i] }));
    const data = await api('/sessions', {
      method: 'POST',
      body: { tipo: 'practica', materia: pr.materia, dificultad: pr.dificultad, tiempo_segundos: pr.tiempo, respuestas }
    });
    state.estudiante.resultado = data.sesion;
    state.estudiante.pantalla = 'resultado';
    render();
  }

  /* ---------- Simulacro ---------- */

  function renderSimulacroConfig() {
    app().innerHTML = `
      <button class="btn btn-ghost btn-sm" id="volver">&larr; Volver</button>
      <h1>Simulacro</h1>
      <div class="card" style="max-width:480px;">
        <p class="text-muted">El simulacro incluye preguntas de Lectura Critica y Matematicas, con un cronometro que corre desde el inicio. Puedes moverte libremente entre preguntas y cambiar de materia cuando quieras.</p>
        <form id="form-simulacro" class="stack">
          <div class="field">
            <label>Preguntas por materia (aprox.)</label>
            <select name="porMateria">
              <option value="6">6 por materia (12 en total)</option>
              <option value="9" selected>9 por materia (18 en total)</option>
              <option value="12">12 por materia (24 en total)</option>
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
      const data = await api('/questions/simulacro-pool?porMateria=' + porMateria);
      if (!data.preguntas.length) {
        alert('Todavia no hay suficientes preguntas cargadas para el simulacro.');
        return;
      }
      const byMateria = { lectura_critica: [], matematicas: [] };
      data.preguntas.forEach(q => { (byMateria[q.materia] || byMateria.lectura_critica).push(q); });

      state.estudiante.simulacro = {
        todas: data.preguntas,
        byMateria,
        tab: byMateria.lectura_critica.length ? 'lectura_critica' : 'matematicas',
        pos: { lectura_critica: 0, matematicas: 0 },
        respuestas: {},
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

      ${q ? `
      <div class="card question-box">
        <div class="row" style="gap:0.5rem; margin-bottom:0.75rem;">
          <span class="pill pill-materia">${materiaLabel(q.materia)}</span>
          <span class="pill pill-${q.dificultad}">${dificultadLabel(q.dificultad)}</span>
        </div>
        ${q.texto_base ? `<div class="texto-base">${escapeHtml(q.texto_base)}</div>` : ''}
        ${q.imagen ? `<img class="pregunta-img" src="${q.imagen}" alt="Imagen de la pregunta" />` : ''}
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
      </div>` : '<div class="card"><p class="text-muted mb-0">No hay preguntas en esta materia.</p></div>'}
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
    const respuestas = sm.todas.map(q => ({ question_id: q.id, respuesta_usuario: sm.respuestas[q.id] || null }));
    const data = await api('/sessions', {
      method: 'POST',
      body: { tipo: 'simulacro', tiempo_segundos: sm.tiempo, respuestas }
    });
    state.estudiante.resultado = data.sesion;
    state.estudiante.pantalla = 'resultado';
    render();
  }

  /* ---------- Resultado ---------- */

  function renderResultado() {
    const r = state.estudiante.resultado;
    const pct = r.num_preguntas ? Math.round((r.num_correctas / r.num_preguntas) * 100) : 0;
    app().innerHTML = `
      <div class="text-center" style="max-width:520px; margin:0 auto;">
        <h1>${r.tipo === 'practica' ? '¡Practica completada!' : '¡Simulacro completado!'}</h1>
        <div class="card">
          <div class="grid-3">
            <div class="stat-card"><div class="stat-value">${r.num_preguntas}</div><div class="stat-label">Preguntas</div></div>
            <div class="stat-card"><div class="stat-value">${r.num_correctas}</div><div class="stat-label">Correctas</div></div>
            <div class="stat-card"><div class="stat-value">${pct}%</div><div class="stat-label">Aciertos</div></div>
          </div>
          <div style="margin-top:1.25rem;">
            <div class="bar-track"><div class="bar-fill" style="width:${pct}%;"></div></div>
          </div>
          <p class="text-muted" style="margin-top:1rem;">Tiempo total: ${formatTiempo(r.tiempo_segundos)}${r.nivel_estimado ? ' &middot; Nivel estimado: ' + r.nivel_estimado : ''}</p>
        </div>
        <button class="btn btn-primary" id="btn-volver-inicio">Volver al inicio</button>
      </div>
    `;
    el('btn-volver-inicio').onclick = () => {
      state.estudiante.practica = null;
      state.estudiante.simulacro = null;
      state.estudiante.resultado = null;
      state.estudiante.pantalla = 'inicio';
      render();
    };
  }

  /* ---------------------------------------------------------------- */

  document.addEventListener('DOMContentLoaded', init);
})();