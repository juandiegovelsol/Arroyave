// Utilidades de interfaz: formato, componentes y diálogos.
export const qs = (s, el = document) => el.querySelector(s);
export const qsa = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const nl2br = (s) => esc(s).replace(/\n/g, '<br>');

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const pad = (n) => String(n).padStart(2, '0');
export const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const nowStr = () => { const d = new Date(); return `${todayStr()}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const addDays = (s, n) => { const d = new Date(s.slice(0, 10) + 'T12:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export function parseLocal(s) { if (!s) return null; const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/); if (!m) return null; return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 12), +(m[5] || 0)); }
export function fmtDate(s, { long = false, weekday = false } = {}) {
  const d = parseLocal(s); if (!d) return '—';
  const base = long ? `${d.getDate()} de ${MONTHS_LONG[d.getMonth()]} de ${d.getFullYear()}` : `${d.getDate()} ${MONTHS[d.getMonth()]}. ${d.getFullYear()}`;
  return weekday ? `${DAYS[d.getDay()]}, ${base}` : base;
}
export function fmtTime(s) { const m = String(s || '').match(/[T ](\d{2}):(\d{2})/); if (!m) return ''; const h = +m[1]; return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? 'a. m.' : 'p. m.'}`; }
export function fmtDateTime(s) { if (!s) return '—'; const t = fmtTime(s); return fmtDate(s) + (t ? ` · ${t}` : ''); }
export function fmtStamp(s) { if (!s) return '—'; // 'YYYY-MM-DD HH:MM:SS' en UTC desde SQLite
  const d = new Date(String(s).replace(' ', 'T') + (String(s).length === 19 ? 'Z' : '')); if (isNaN(d)) return fmtDateTime(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}. ${d.getFullYear()} · ${((d.getHours() + 11) % 12) + 1}:${pad(d.getMinutes())} ${d.getHours() < 12 ? 'a. m.' : 'p. m.'}`; }
export function daysUntil(s) { const d = parseLocal(s); if (!d) return null; const t = parseLocal(todayStr()); return Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - t) / 86400000); }
export function relDays(s) { const n = daysUntil(s); if (n === null) return ''; if (n === 0) return 'hoy'; if (n === 1) return 'mañana'; if (n === -1) return 'ayer'; return n > 0 ? `en ${n} días` : `hace ${-n} días`; }
export const fmtMoney = (n) => (n === null || n === undefined || n === '') ? '—' : new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
export const fmtSize = (b) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`);
export const initials = (name) => String(name || '').split(/\s+/).filter((w) => /^[A-ZÁÉÍÓÚÑ]/.test(w)).slice(0, 2).map((w) => w[0]).join('') || String(name || '?').slice(0, 2).toUpperCase();
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export const labelOf = (list, id) => { const x = (list || []).find((i) => (typeof i === 'string' ? i : i.id) === id); return x ? (typeof x === 'string' ? x : x.label) : (id || '—'); };
export const toneOf = (list, id) => { const x = (list || []).find((i) => i.id === id); return (x && x.tone) || 'neutral'; };
export const badge = (list, id, extra = '') => `<span class="badge ${toneOf(list, id)} ${extra}">${esc(labelOf(list, id))}</span>`;
export const prioBadge = (p) => p === 'alta' ? '<span class="badge danger">Prioridad alta</span>' : p === 'baja' ? '<span class="badge neutral">Prioridad baja</span>' : '';

export function options(list, value, { empty = null } = {}) {
  const out = [];
  if (empty !== null) out.push(`<option value=""${!value ? ' selected' : ''}>${esc(empty)}</option>`);
  (list || []).forEach((i) => { const id = typeof i === 'string' ? i : i.id; const label = typeof i === 'string' ? i : i.label; out.push(`<option value="${esc(id)}"${String(id) === String(value ?? '') ? ' selected' : ''}>${esc(label)}</option>`); });
  return out.join('');
}
export const field = (label, control, { help = '', span = false, required = false } = {}) => `<label class="field${span ? ' span-2' : ''}"><span>${esc(label)}${required ? ' <span aria-hidden="true">*</span>' : ''}</span>${control}${help ? `<span class="helper-text">${esc(help)}</span>` : ''}</label>`;
export const input = (name, value = '', attrs = '') => `<input name="${name}" value="${esc(value)}" ${attrs}>`;
export const textarea = (name, value = '', attrs = 'rows="3"') => `<textarea name="${name}" ${attrs}>${esc(value)}</textarea>`;
export const select = (name, list, value, opts = {}, attrs = '') => `<select name="${name}" ${attrs}>${options(list, value, opts)}</select>`;
export const emptyState = (title, text = '', action = '') => `<div class="empty-state"><img src="/img/monogram-navy.svg" alt=""><h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}${action}</div>`;
export const icon = (name) => ({
  folder: '<path d="M3 7h7l2 2h9v11H3zM3 7V4h7l2 3"/>', doc: '<path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6"/>', calendar: '<path d="M3 5h18v16H3zM7 2v6M17 2v6M3 10h18"/>', check: '<path d="m5 12 4 4L19 6"/>', message: '<path d="M3 4h18v13H8l-5 4zM7 8h10M7 12h7"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20a7 7 0 0 1 14 0M16 4a3.5 3.5 0 0 1 0 7M22 20a7 7 0 0 0-5-6.7"/>', grid: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"/>', inbox: '<path d="M3 13h5l2 3h4l2-3h5M3 13V5h18v8M3 13v6h18v-6"/>', settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>', plus: '<path d="M12 5v14M5 12h14"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', warning: '<path d="M12 8v5m0 3h.01M10.3 3.9 2.6 17.3A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.7L13.7 3.9a2 2 0 0 0-3.4 0Z"/>', search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>', download: '<path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v3h16v-3"/>', upload: '<path d="M12 15V3m0 0 4 4m-4-4-4 4M4 17v3h16v-3"/>', trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', edit: '<path d="M4 20h4l10-10-4-4L4 16v4ZM13 7l4 4"/>', arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>', scale: '<path d="M12 3v18M5 21h14M3 7h18M6 7 3 14a3 3 0 0 0 6 0L6 7Zm12 0-3 7a3 3 0 0 0 6 0l-3-7Z"/>', pin: '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/>', eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>', lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
}[name] || '');
export const svg = (name, cls = 'icon') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${icon(name)}</svg>`;

// ---- Avisos (toast) -------------------------------------------------------
export function toast(message, tone = 'success', ms = 4200) {
  const box = qs('#toasts'); const el = document.createElement('div');
  el.className = `toast ${tone}`; el.setAttribute('role', tone === 'danger' ? 'alert' : 'status'); el.textContent = message;
  box.appendChild(el); setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
}

// ---- Diálogo modal con formulario ----------------------------------------
let lastTrigger = null;
const dialog = () => qs('#modal');
export function closeModal() { const d = dialog(); if (d.open) d.close(); }
/**
 * Abre un diálogo. opts: { title, eyebrow, body (html), submitLabel, cancelLabel, danger, width, onSubmit(formData, form) -> Promise, onOpen(form) }
 * Devuelve una promesa que se resuelve con el resultado de onSubmit o null si se cancela.
 */
export function modal(opts) {
  const d = dialog(); const form = qs('#modal-form'); const body = qs('#modal-body'); const error = qs('#modal-error'); const actions = qs('#modal-actions');
  lastTrigger = document.activeElement;
  qs('#modal-title').textContent = opts.title || '';
  qs('#modal-eyebrow').textContent = opts.eyebrow || '';
  body.innerHTML = opts.body || '';
  error.hidden = true; error.textContent = '';
  d.style.maxWidth = opts.width || '640px';
  actions.innerHTML = `${opts.cancelLabel === false ? '' : `<button type="button" class="button secondary" data-cancel>${esc(opts.cancelLabel || 'Cancelar')}</button>`}${opts.submitLabel === false ? '' : `<button type="submit" class="button ${opts.danger ? 'danger' : 'primary'}" id="modal-submit">${esc(opts.submitLabel || 'Guardar')}</button>`}`;
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; cleanup(); if (d.open) d.close(); resolve(v); };
    const onCancel = () => finish(null);
    const onSubmit = async (e) => {
      e.preventDefault();
      const submit = qs('#modal-submit'); if (submit) { submit.disabled = true; submit.setAttribute('aria-busy', 'true'); }
      error.hidden = true;
      try {
        const data = Object.fromEntries(new FormData(form).entries());
        qsa('input[type=checkbox]', form).forEach((c) => { data[c.name] = c.checked ? 1 : 0; });
        const result = opts.onSubmit ? await opts.onSubmit(data, form) : data;
        if (result === false) { if (submit) { submit.disabled = false; submit.removeAttribute('aria-busy'); } return; }
        finish(result === undefined ? data : result);
      } catch (err) {
        error.textContent = err.message || 'No fue posible completar la acción.'; error.hidden = false;
        if (err.data && err.data.fields) qsa(err.data.fields.map((f) => `[name="${f}"]`).join(','), form).forEach((i) => i.setAttribute('aria-invalid', 'true'));
        if (submit) { submit.disabled = false; submit.removeAttribute('aria-busy'); }
      }
    };
    const onClose = () => finish(null);
    const cleanup = () => { form.removeEventListener('submit', onSubmit); d.removeEventListener('close', onClose); actions.querySelector('[data-cancel]')?.removeEventListener('click', onCancel); if (lastTrigger && lastTrigger.focus) lastTrigger.focus(); };
    form.addEventListener('submit', onSubmit); d.addEventListener('close', onClose); actions.querySelector('[data-cancel]')?.addEventListener('click', onCancel);
    d.showModal();
    if (opts.onOpen) opts.onOpen(form);
    const first = form.querySelector('input:not([type=hidden]):not([disabled]),select,textarea'); if (first) first.focus();
  });
}
export const confirmDialog = (title, text, { submitLabel = 'Confirmar', danger = true } = {}) => modal({ title, body: `<p class="dialog-text">${esc(text)}</p>`, submitLabel, danger, width: '480px' }).then((r) => r !== null);

qs('#modal-close').addEventListener('click', closeModal);
dialog().addEventListener('click', (e) => { const d = dialog(); const r = d.getBoundingClientRect(); if (e.target === d && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) d.close(); });
