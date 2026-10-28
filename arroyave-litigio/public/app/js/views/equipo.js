import { api } from '../api.js';
import { qs, qsa, esc, svg, fmtStamp, labelOf, emptyState, field, input, select, textarea, modal, toast, initials } from '../ui.js';

export default async function view({ el, state, setCrumbs }) {
  const M = state.meta; const admin = state.user.role === 'admin';
  setCrumbs([{ label: 'Equipo' }]);
  let users;
  async function load() { users = await api.get('/api/users'); render(); }
  function card(u) {
    return `<article class="member"><div class="head"><span class="avatar ink lg" aria-hidden="true">${esc(initials(u.name))}</span><div><h3>${esc(u.name)}</h3><p class="role">${esc(u.title || labelOf(M.ROLES, u.role))}</p></div></div>
      <div class="chips"><span class="chip">${esc(labelOf(M.ROLES, u.role))}</span>${u.is_public ? '<span class="chip">Visible en el sitio</span>' : ''}${!u.active ? '<span class="badge neutral">Inactivo</span>' : ''}${u.specialties.map((s) => `<span class="chip">${esc(s)}</span>`).join('')}</div>
      ${u.bio ? `<p class="bio">${esc(u.bio)}</p>` : ''}
      <div class="facts">${u.role !== 'cliente' ? `<span><b>${u.active_cases}</b> procesos activos</span><span><b>${u.stages_in_progress}</b> etapas en curso</span>` : ''}<span>${esc(u.email)}</span>${u.last_login_at ? `<span>Último ingreso ${esc(fmtStamp(u.last_login_at))}</span>` : ''}</div>
      ${admin ? `<div style="display:flex;gap:12px"><button class="text-button" data-edit="${u.id}">Editar</button><button class="text-button" data-pw="${u.id}">Restablecer contraseña</button></div>` : ''}</article>`;
  }
  function render() {
    const staff = users.filter((u) => u.role !== 'cliente'); const clients = users.filter((u) => u.role === 'cliente');
    el.innerHTML = `<div class="page-head"><div><p class="eyebrow">Despacho</p><h1>Equipo</h1><p class="lead">Abogados y asistentes. Los perfiles marcados como visibles aparecen en el sitio web público.</p></div>${admin ? `<div class="actions"><button class="button primary" id="new">${svg('plus')} Nuevo usuario</button></div>` : ''}</div>
      <div class="team-cards">${staff.map(card).join('')}</div>
      ${clients.length ? `<h2 style="font-family:var(--font-body);font-size:16px;font-weight:650;margin:32px 0 14px">Accesos de clientes (${clients.length})</h2><section class="panel">${clients.map((u) => `<div class="row"><span class="avatar" aria-hidden="true">${esc(initials(u.name))}</span><div class="info"><h3>${esc(u.name)}</h3><p>${esc(u.email)}${u.client_id ? ` · <a href="#/clientes/${u.client_id}">Ver cliente</a>` : ''}${u.last_login_at ? ` · último ingreso ${esc(fmtStamp(u.last_login_at))}` : ' · nunca ha ingresado'}</p></div><div class="end">${u.active ? '<span class="badge success">Activo</span>' : '<span class="badge neutral">Inactivo</span>'}${admin ? `<div style="display:flex;gap:12px"><button class="text-button" data-edit="${u.id}">Editar</button><button class="text-button" data-pw="${u.id}">Restablecer contraseña</button></div>` : ''}</div></div>`).join('')}</section>` : ''}`;
    qs('#new', el)?.addEventListener('click', () => userDialog());
    qsa('[data-edit]', el).forEach((b) => b.addEventListener('click', () => userDialog(users.find((u) => u.id === +b.dataset.edit))));
    qsa('[data-pw]', el).forEach((b) => b.addEventListener('click', async () => {
      const u = users.find((x) => x.id === +b.dataset.pw);
      const r = await modal({ title: 'Restablecer contraseña', eyebrow: u.email, submitLabel: 'Restablecer', body: `<div class="form-grid">${field('Nueva contraseña', input('password', '', 'minlength="8" placeholder="Si se deja vacía se genera una"'), { span: true, help: 'Se cerrarán las sesiones abiertas del usuario y deberá cambiarla al ingresar.' })}</div>`, onSubmit: (data) => api.put(`/api/users/${u.id}/password`, data) });
      if (r) await modal({ title: 'Contraseña restablecida', body: `<p class="dialog-text">Entregue la nueva contraseña por un canal seguro:</p><div class="cred">${esc(r.password)}</div>`, submitLabel: 'Entendido', cancelLabel: false });
    }));
  }
  async function userDialog(u) {
    const clients = await api.get('/api/clients');
    const r = await modal({ title: u ? 'Editar usuario' : 'Nuevo usuario', submitLabel: u ? 'Guardar' : 'Crear usuario', width: '760px', body: `<div class="form-grid">${field('Nombre', input('name', u?.name || '', 'required maxlength="120"'), { required: true })}${field('Correo (usuario de acceso)', input('email', u?.email || '', 'type="email" required maxlength="160"'), { required: true })}${field('Perfil', select('role', M.ROLES, u?.role || 'abogado'), { help: 'Administrador: todo. Abogado: procesos, clientes y solicitudes. Asistente: registra y consulta, sin cerrar ni eliminar. Cliente: solo sus procesos.' })}${field('Cliente vinculado (solo perfil cliente)', select('client_id', clients.map((c) => ({ id: c.id, label: c.name })), u?.client_id || '', { empty: '—' }))}${u ? '' : field('Contraseña inicial', input('password', '', 'minlength="8" placeholder="Si se deja vacía se genera una"'))}${field('Cargo', input('title', u?.title || '', 'maxlength="120" placeholder="Ej. Abogada asociada · Laboral"'))}${field('Teléfono', input('phone', u?.phone || '', 'maxlength="40"'))}${field('Tarjeta profesional', input('card_number', u?.card_number || '', 'maxlength="60"'))}${field('Formación', input('education', u?.education || '', 'maxlength="600"'), { span: true })}${field('Especialidades (separadas por coma)', input('specialties', (u?.specialties || []).join(', '), 'maxlength="300"'), { span: true })}${field('Perfil breve (sitio web)', textarea('bio', u?.bio || '', 'rows="3" maxlength="2000"'), { span: true })}${field('Orden en el sitio', input('sort_order', u?.sort_order ?? 100, 'type="number" min="1" max="999"'))}<div><label class="check"><input type="checkbox" name="is_public" ${u?.is_public ? 'checked' : ''}> Mostrar en el sitio web</label>${u ? `<label class="check"><input type="checkbox" name="active" ${u.active ? 'checked' : ''}> Usuario activo</label>` : ''}</div></div>`,
      onSubmit: (data) => { data.specialties = data.specialties.split(',').map((s) => s.trim()).filter(Boolean); return u ? api.put(`/api/users/${u.id}`, data) : api.post('/api/users', data); } });
    if (r) {
      if (!u && r.password) await modal({ title: 'Usuario creado', body: `<p class="dialog-text">Credenciales iniciales. Entréguelas por un canal seguro; se pedirá cambiar la contraseña al ingresar.</p><div class="cred">Usuario: ${esc(r.user.email)}<br>Contraseña: ${esc(r.password)}</div>`, submitLabel: 'Entendido', cancelLabel: false });
      toast('Usuario guardado.'); load();
    }
  }
  await load();
}
