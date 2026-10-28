import { api } from '../api.js';
import { qs, qsa, esc, svg, fmtStamp, labelOf, emptyState, toast } from '../ui.js';

export default async function view({ el, state, setCrumbs }) {
  const M = state.meta;
  setCrumbs([{ label: 'Mensajes' }]);
  const list = (await api.get('/api/cases?limit=100')).items;
  let current = list[0] ? list[0].id : null;
  el.innerHTML = `<div class="page-head"><div><p class="eyebrow">Conversación</p><h1>Mensajes</h1><p class="lead">Escriba al equipo responsable de cada proceso. Le responderemos en este mismo espacio.</p></div></div>
    ${list.length ? `<div class="filter-bar"><label class="field" style="min-width:280px">Proceso<select id="case-select">${list.map((c) => `<option value="${c.id}">${esc(c.ref)} · ${esc(c.title)}</option>`).join('')}</select></label></div><section class="panel" id="box"></section>` : `<section class="panel">${emptyState('Aún no hay procesos', 'Cuando el despacho comparta un proceso con usted podrá escribirnos desde aquí.')}</section>`}`;
  if (!list.length) return;
  qs('#case-select', el).addEventListener('change', (e) => { current = +e.target.value; load(); });
  async function load() {
    const d = await api.get(`/api/cases/${current}`);
    const box = qs('#box', el);
    box.innerHTML = `<div class="panel-head"><h2>${esc(d.case.title)}<span class="sub">${esc(d.case.ref)}${d.case.responsible_name ? ` · Responsable: ${esc(d.case.responsible_name)}` : ''}</span></h2><a class="text-button" href="#/procesos/${d.case.id}">Ver proceso ${svg('arrow')}</a></div>
      <div class="thread" id="thread">${d.messages.length ? d.messages.map((m) => `<div class="bubble ${m.author_id === state.user.id ? 'own' : ''}"><span class="who">${esc(m.author_name || 'Despacho')}</span><p>${esc(m.body)}</p><time>${esc(fmtStamp(m.created_at))}</time></div>`).join('') : '<p class="muted small">Aún no hay mensajes en este proceso. Escriba el primero.</p>'}</div>
      <form class="compose" id="compose"><label class="field">Escriba su mensaje<textarea name="body" rows="3" maxlength="4000" required placeholder="Escriba aquí su pregunta o comentario. Evite incluir datos sensibles de terceros."></textarea></label><div class="foot"><p>Su mensaje llegará al equipo responsable del proceso.</p><button class="button primary" type="submit">Enviar ${svg('arrow')}</button></div></form>`;
    qs('#compose', box).addEventListener('submit', async (e) => { e.preventDefault(); const body = e.currentTarget.elements.body.value.trim(); if (!body) return; await api.post(`/api/cases/${current}/messages`, { body }); toast('Mensaje enviado al despacho.'); load(); });
    const th = qs('#thread', box); th.scrollTop = th.scrollHeight;
  }
  await load();
}
