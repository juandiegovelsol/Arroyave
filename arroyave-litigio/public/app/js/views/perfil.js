import { api } from '../api.js';
import { qs, qsa, esc, field, input, textarea, toast, labelOf, initials } from '../ui.js';

export default async function view({ el, state, setCrumbs }) {
  const u = state.user; const M = state.meta; const client = u.role === 'cliente';
  setCrumbs([{ label: 'Mi perfil' }]);
  el.innerHTML = `<div class="page-head"><div><p class="eyebrow">${esc(labelOf(M.ROLES, u.role))}</p><h1>Mi perfil</h1><p class="lead">Datos de su cuenta y cambio de contraseña.</p></div></div>
  <div class="grid-eq">
    <form class="panel" id="profile"><div class="panel-head"><h2>Datos personales</h2></div><div class="panel-body form-grid">
      ${field('Nombre', input('name', u.name, 'required maxlength="120"'), { span: true })}${field('Correo', input('email', u.email, 'disabled'), { help: 'El correo de acceso lo cambia el administrador.' })}${field('Teléfono', input('phone', u.phone || '', 'maxlength="40"'))}
      ${client ? '' : `${field('Cargo', input('title', u.title || '', 'maxlength="120"'))}${field('Tarjeta profesional', input('card_number', u.card_number || '', 'maxlength="60"'))}${field('Formación', input('education', u.education || '', 'maxlength="600"'), { span: true })}${field('Especialidades (separadas por coma)', input('specialties', (u.specialties || []).join(', '), 'maxlength="300"'), { span: true })}${field('Perfil breve (sitio web)', textarea('bio', u.bio || '', 'rows="4" maxlength="2000"'), { span: true })}`}
      <div class="span-2" style="display:flex;justify-content:flex-end"><button class="button primary" type="submit">Guardar</button></div></div></form>
    <form class="panel" id="password"><div class="panel-head"><h2>Cambiar contraseña</h2></div><div class="panel-body form-grid">
      ${field('Contraseña actual', input('current', '', 'type="password" autocomplete="current-password" required'), { span: true })}${field('Nueva contraseña', input('next', '', 'type="password" autocomplete="new-password" required minlength="8"'), { span: true, help: 'Mínimo 8 caracteres. Se cerrarán sus otras sesiones.' })}${field('Repita la nueva contraseña', input('confirm', '', 'type="password" autocomplete="new-password" required minlength="8"'), { span: true })}
      <p id="pw-error" class="alert danger span-2" hidden></p>
      <div class="span-2" style="display:flex;justify-content:flex-end"><button class="button primary" type="submit">Actualizar contraseña</button></div></div></form>
  </div>`;
  qs('#profile', el).addEventListener('submit', async (e) => {
    e.preventDefault(); const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    if (data.specialties !== undefined) data.specialties = data.specialties.split(',').map((s) => s.trim()).filter(Boolean);
    const r = await api.put('/api/auth/profile', data); Object.assign(state.user, r.user); qs('#user-name').textContent = r.user.name; qs('#user-avatar').textContent = initials(r.user.name); toast('Perfil actualizado.');
  });
  qs('#password', el).addEventListener('submit', async (e) => {
    e.preventDefault(); const form = e.currentTarget; const err = qs('#pw-error', el); err.hidden = true;
    const data = Object.fromEntries(new FormData(form).entries());
    if (data.next !== data.confirm) { err.textContent = 'Las contraseñas nuevas no coinciden.'; err.hidden = false; return; }
    try { await api.put('/api/auth/password', data); form.reset(); state.user.must_change_password = 0; toast('Contraseña actualizada.'); }
    catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });
}
