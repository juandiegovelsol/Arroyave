import { api } from '../api.js';
import { qs, qsa, esc, svg, badge, fmtDate, fmtStamp, labelOf, emptyState, field, input, modal, confirmDialog, toast, initials } from '../ui.js';
import { clientDialog } from './clientes.js';
import { newCaseDialog } from './procesos.js';

export default async function view({ el, params, state, setCrumbs, navigate }) {
  const M = state.meta; const manage = ['admin', 'abogado'].includes(state.user.role); const admin = state.user.role === 'admin';
  let d;
  async function load() { d = await api.get(`/api/clients/${params.id}`); render(); }
  function render() {
    const c = d.client;
    setCrumbs([{ label: 'Clientes', href: '#/clientes' }, { label: c.name }]);
    el.innerHTML = `<section class="case-head"><div class="top"><div style="display:flex;gap:18px;align-items:center"><span class="avatar ink lg" aria-hidden="true">${esc(initials(c.name))}</span><div><p class="eyebrow">${c.kind === 'juridica' ? 'Persona jurídica' : 'Persona natural'}${c.doc_number ? ` · ${esc(c.doc_type)} ${esc(c.doc_number)}` : ''}</p><h1>${esc(c.name)}</h1></div></div>
      <div class="actions"><button class="button secondary small" id="edit">${svg('edit')} Editar</button><button class="button primary small" id="new-case">${svg('plus')} Nuevo proceso</button>${manage ? `<button class="button secondary small" id="access">${svg('lock')} ${d.users.length ? 'Restablecer acceso' : 'Crear acceso a la plataforma'}</button>` : ''}${admin && !d.cases.length ? `<button class="button danger small" id="del">${svg('trash')} Eliminar</button>` : ''}</div></div>
      <dl class="kv"><div><dt>Correo</dt><dd>${esc(c.email || '—')}</dd></div><div><dt>Teléfono</dt><dd>${esc(c.phone || '—')}</dd></div><div><dt>Contacto</dt><dd>${esc(c.contact_name || '—')}</dd></div><div><dt>Ciudad</dt><dd>${esc(c.city || '—')}${c.department ? `<span class="muted"> · ${esc(c.department)}</span>` : ''}</dd></div><div><dt>Dirección</dt><dd>${esc(c.address || '—')}</dd></div><div><dt>Cliente desde</dt><dd>${esc(fmtStamp(c.created_at))}</dd></div><div><dt>Acceso a la plataforma</dt><dd>${d.users.length ? d.users.map((u) => `${esc(u.email)} ${u.active ? '<span class="badge success">Activo</span>' : '<span class="badge neutral">Inactivo</span>'}${u.last_login_at ? `<span class="sub muted">Último ingreso ${esc(fmtStamp(u.last_login_at))}</span>` : '<span class="sub muted">Nunca ha ingresado</span>'}`).join('<br>') : '<span class="muted">Sin acceso</span>'}</dd></div></dl>
      ${c.notes ? `<p style="margin-top:16px;font-size:14px;color:var(--color-muted);white-space:pre-wrap">${esc(c.notes)}</p>` : ''}</section>
      <section class="panel"><div class="panel-head"><h2>Procesos del cliente<span class="sub">${d.cases.length} en total</span></h2></div>${d.cases.length ? d.cases.map((k) => `<a class="row" href="#/procesos/${k.id}"><div class="sym">${svg('folder')}</div><div class="info"><span class="overline">${esc(k.ref)} · ${esc(labelOf(M.AREAS, k.area))}${k.city ? ` · ${esc(k.city)}` : ''}</span><h3>${esc(k.title)}</h3><p>${k.current_stage ? `Etapa: ${esc(k.current_stage)}` : ''}${k.responsible_name ? ` · ${esc(k.responsible_name)}` : ''}</p></div><div class="end">${badge(M.CASE_STATUS, k.status)}${k.outcome ? `<span class="when">${esc(labelOf(M.OUTCOMES, k.outcome))}</span>` : ''}</div></a>`).join('') : emptyState('Este cliente aún no tiene procesos')}</section>`;
    qs('#edit', el).addEventListener('click', async () => { if (await clientDialog(M, c)) load(); });
    qs('#new-case', el).addEventListener('click', () => newCaseDialog(state, navigate, { client_id: c.id, city: c.city, department: c.department }));
    qs('#access', el)?.addEventListener('click', async () => {
      const r = await modal({ title: d.users.length ? 'Restablecer acceso del cliente' : 'Crear acceso a la plataforma', eyebrow: c.name, submitLabel: d.users.length ? 'Restablecer' : 'Crear acceso', body: `<div class="form-grid">${field('Correo de acceso', input('email', (d.users[0] && d.users[0].email) || c.email || '', 'type="email" required'), { span: true })}${field('Contraseña inicial', input('password', '', 'minlength="8" placeholder="Si se deja vacía se genera una"'), { span: true, help: 'Entregue la contraseña al cliente por un canal seguro. Se le pedirá cambiarla al ingresar.' })}</div>`, onSubmit: (data) => api.post(`/api/clients/${c.id}/access`, data) });
      if (r) { await modal({ title: 'Acceso listo', body: `<p class="dialog-text">Comparta estas credenciales con el cliente por un canal seguro:</p><div class="cred">Usuario: ${esc(r.email)}<br>Contraseña: ${esc(r.password)}</div>`, submitLabel: 'Entendido', cancelLabel: false }); load(); }
    });
    qs('#del', el)?.addEventListener('click', async () => { if (await confirmDialog('Eliminar cliente', 'Se eliminará el cliente y su acceso a la plataforma.')) { await api.del(`/api/clients/${c.id}`); toast('Cliente eliminado.'); navigate('#/clientes'); } });
  }
  await load();
}
