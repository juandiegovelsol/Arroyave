import { api } from '../api.js';
import { qs, qsa, esc, svg, badge, fmtDate, fmtTime, relDays, labelOf, emptyState, todayStr, addDays, nowStr, toast } from '../ui.js';

export default async function view({ el, params, state, setCrumbs }) {
  const M = state.meta; const client = state.user.role === 'cliente';
  setCrumbs([{ label: 'Agenda' }]);
  let from = params.from || todayStr(); let to = params.to || addDays(from, 30); let mine = params.mine === '1';

  el.innerHTML = `<div class="page-head"><div><p class="eyebrow">Organización</p><h1>Agenda</h1><p class="lead">${client ? 'Fechas confirmadas por el despacho para sus procesos. Hora de Bogotá.' : 'Audiencias, términos, tareas y etapas con fecha límite en un solo calendario. Hora de Bogotá.'}</p></div>
    <div class="actions range-nav"><button class="button secondary" id="prev" aria-label="Periodo anterior">←</button><button class="button secondary" id="today">Hoy</button><button class="button secondary" id="next" aria-label="Periodo siguiente">→</button><select id="span" aria-label="Duración del periodo"><option value="7">7 días</option><option value="14">14 días</option><option value="30" selected>30 días</option><option value="60">60 días</option><option value="90">90 días</option></select>${client ? '' : `<label class="check"><input type="checkbox" id="mine" ${mine ? 'checked' : ''}> Solo lo mío</label>`}</div></div>
    <p class="muted small" id="range"></p><div id="agenda" class="stack"></div>`;
  const span = qs('#span', el);
  qs('#prev', el).addEventListener('click', () => { const n = +span.value; from = addDays(from, -n); to = addDays(from, n); load(); });
  qs('#next', el).addEventListener('click', () => { const n = +span.value; from = addDays(from, n); to = addDays(from, n); load(); });
  qs('#today', el).addEventListener('click', () => { from = todayStr(); to = addDays(from, +span.value); load(); });
  span.addEventListener('change', () => { to = addDays(from, +span.value); load(); });
  qs('#mine', el)?.addEventListener('change', (e) => { mine = e.target.checked; load(); });

  async function load() {
    qs('#range', el).textContent = `${fmtDate(from, { long: true })} — ${fmtDate(to, { long: true })}`;
    const box = qs('#agenda', el); box.innerHTML = '<div class="loading"><span class="spinner dark"></span> Cargando…</div>';
    const d = await api.get(`/api/agenda?from=${from}&to=${to}${mine ? '&mine=1' : ''}`);
    const items = [];
    d.events.forEach((e) => items.push({ date: e.start_at.slice(0, 10), sort: e.start_at, type: 'evento', e }));
    d.dueActions.forEach((a) => items.push({ date: a.next_action_due, sort: a.next_action_due + 'T00:00', type: 'accion', a }));
    d.tasks.forEach((t) => items.push({ date: t.due_at, sort: t.due_at + 'T00:01', type: 'tarea', t }));
    d.stages.forEach((s) => items.push({ date: s.due_at, sort: s.due_at + 'T00:02', type: 'etapa', s }));
    items.sort((x, y) => x.sort.localeCompare(y.sort));
    if (!items.length) { box.innerHTML = `<section class="panel">${emptyState('Nada programado en este periodo', client ? 'Las fechas confirmadas por el despacho aparecerán aquí.' : 'Programe audiencias y términos desde cada proceso.')}</section>`; return; }
    const byDay = {}; items.forEach((i) => { (byDay[i.date] = byDay[i.date] || []).push(i); });
    const today = todayStr();
    box.innerHTML = `<section class="panel">${Object.keys(byDay).sort().map((day) => `<div class="agenda-day ${day === today ? 'today' : ''}"><h3>${esc(fmtDate(day, { long: true, weekday: true }))}${day === today ? ' · hoy' : ''}</h3>${byDay[day].map(renderItem).join('')}</div>`).join('')}
      ${client ? '' : '<p class="panel-note">Un término o vencimiento interno no es automáticamente un término judicial. Verifique siempre la fuente oficial.</p>'}</section>`;
    qsa('[data-done]', box).forEach((b) => b.addEventListener('click', async () => { const e = d.events.find((x) => x.id === +b.dataset.done); await api.put(`/api/cases/${e.case_id}/events/${e.id}`, { ...e, status: 'cumplido' }); toast('Evento marcado como cumplido.'); load(); }));
  }
  function renderItem(i) {
    if (i.type === 'evento') { const e = i.e; const overdue = e.status === 'programado' && e.start_at < nowStr();
      return `<div class="agenda-item"><div class="time">${e.all_day ? 'Todo el día' : (esc(fmtTime(e.start_at)) || '—')}${e.end_at ? `<small>hasta ${esc(fmtTime(e.end_at))}</small>` : ''}</div><div><h4><a href="#/procesos/${e.case_id}/agenda" style="text-decoration:none">${esc(e.title)}</a></h4><p>${e.case_ref ? `${esc(e.case_ref)} · ${esc(e.case_title)}` : ''}${e.location ? ` · ${esc(e.location)}` : ''}${e.responsible_name ? ` · ${esc(e.responsible_name)}` : ''}</p></div><div class="tags"><span class="badge brass">${esc(labelOf(M.EVENT_KINDS, e.kind))}</span>${overdue ? '<span class="badge danger">Vencido</span>' : badge(M.EVENT_STATUS, e.status)}${!client && e.status === 'programado' ? `<button class="text-button" data-done="${e.id}">Cumplido</button>` : ''}</div></div>`; }
    if (i.type === 'accion') { const a = i.a; return `<div class="agenda-item"><div class="time">Acción</div><div><h4><a href="#/procesos/${a.id}" style="text-decoration:none">${esc(a.next_action)}</a></h4><p>${esc(a.ref)} · ${esc(a.title)}${a.responsible_name ? ` · ${esc(a.responsible_name)}` : ''}</p></div><div class="tags"><span class="badge info">Siguiente acción</span></div></div>`; }
    if (i.type === 'tarea') { const t = i.t; return `<div class="agenda-item"><div class="time">Tarea</div><div><h4>${esc(t.title)}</h4><p>${t.case_ref ? `<a href="#/procesos/${t.case_id}/tareas">${esc(t.case_ref)}</a> · ${esc(t.case_title)}` : 'Sin proceso'}${t.assigned_name ? ` · ${esc(t.assigned_name)}` : ''}</p></div><div class="tags">${badge(M.TASK_STATUS, t.status)}</div></div>`; }
    const s = i.s; return `<div class="agenda-item"><div class="time">Etapa</div><div><h4><a href="#/procesos/${s.case_id}/etapas" style="text-decoration:none">${esc(s.name)}</a></h4><p>${esc(s.case_ref)} · ${esc(s.case_title)}${s.lawyer_name ? ` · ${esc(s.lawyer_name)}` : ''}</p></div><div class="tags"><span class="badge warning">Límite de etapa</span>${badge(M.STAGE_STATUS, s.status)}</div></div>`;
  }
  await load();
}
