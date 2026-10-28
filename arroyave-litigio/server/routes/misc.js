'use strict';
const express = require('express');
const { all, get, run, insert, audit, getSetting, setSetting, allSettings } = require('../db');
const { requireAuth, requireStaff, requireRole, hashPassword, canManage, isAdmin } = require('../auth');
const { HttpError, wrap, str, int, bool, oneOf, isEmail, dateOrNull, required, randomToken } = require('../util');
const M = require('../meta');
const { nowLocal, todayLocal, addDays, isClient, caseScope, visibilityScope, CASE_SELECT } = require('../access');
const { safeUser } = require('./auth');

// ---------- Catálogos -------------------------------------------------------
const meta = express.Router();
meta.get('/', requireAuth, (req, res) => {
  const staff = all("SELECT id, name, role, title FROM users WHERE active = 1 AND role IN ('admin','abogado','asistente') ORDER BY sort_order, name");
  res.json({ ...M.publicMeta(), staff, lawyers: staff.filter((u) => u.role !== 'asistente') });
});

// ---------- Clientes --------------------------------------------------------
const clients = express.Router();
clients.use(requireStaff);
function clientFields(b) {
  return { kind: oneOf(str(b.kind), ['natural', 'juridica'], 'natural'), name: str(b.name, 160), doc_type: oneOf(str(b.doc_type), M.DOC_TYPES, 'CC'), doc_number: str(b.doc_number, 40), email: str(b.email, 160).toLowerCase(), phone: str(b.phone, 40), address: str(b.address, 200), city: str(b.city, 80), department: str(b.department, 80), contact_name: str(b.contact_name, 120), notes: str(b.notes, 2000) };
}
clients.get('/', wrap((req, res) => {
  const q = str(req.query.q, 120).toLowerCase();
  const params = [];
  let where = '1=1';
  if (q) { where += ' AND (LOWER(cl.name) LIKE ? OR cl.doc_number LIKE ? OR LOWER(cl.email) LIKE ? OR LOWER(cl.city) LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`); }
  res.json(all(`SELECT cl.*, (SELECT COUNT(*) FROM cases c WHERE c.client_id = cl.id) AS case_count, (SELECT COUNT(*) FROM cases c WHERE c.client_id = cl.id AND c.status = 'activo') AS active_count FROM clients cl WHERE ${where} ORDER BY cl.name COLLATE NOCASE LIMIT 500`, ...params));
}));
clients.get('/:id', wrap((req, res) => {
  const cl = get('SELECT * FROM clients WHERE id = ?', int(req.params.id));
  if (!cl) throw new HttpError(404, 'Cliente no encontrado.');
  res.json({ client: cl, cases: all(`${CASE_SELECT} WHERE c.client_id = ? ORDER BY c.updated_at DESC`, cl.id), users: all('SELECT id, name, email, active, last_login_at FROM users WHERE client_id = ?', cl.id) });
}));
clients.post('/', wrap((req, res) => {
  const f = clientFields(req.body); if (!f.name) throw new HttpError(400, 'El nombre es obligatorio.');
  if (f.email && !isEmail(f.email)) throw new HttpError(400, 'Correo no válido.');
  const id = insert('INSERT INTO clients(kind,name,doc_type,doc_number,email,phone,address,city,department,contact_name,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?)', ...Object.values(f));
  audit(req.user.id, 'create', 'client', id, { name: f.name });
  res.status(201).json(get('SELECT * FROM clients WHERE id = ?', id));
}));
clients.put('/:id', wrap((req, res) => {
  const id = int(req.params.id); if (!get('SELECT id FROM clients WHERE id = ?', id)) throw new HttpError(404, 'Cliente no encontrado.');
  const f = clientFields(req.body); if (!f.name) throw new HttpError(400, 'El nombre es obligatorio.');
  if (f.email && !isEmail(f.email)) throw new HttpError(400, 'Correo no válido.');
  run('UPDATE clients SET kind=?,name=?,doc_type=?,doc_number=?,email=?,phone=?,address=?,city=?,department=?,contact_name=?,notes=? WHERE id = ?', ...Object.values(f), id);
  audit(req.user.id, 'update', 'client', id, {});
  res.json(get('SELECT * FROM clients WHERE id = ?', id));
}));
clients.delete('/:id', wrap((req, res) => {
  if (!isAdmin(req.user)) throw new HttpError(403, 'Solo el administrador puede eliminar clientes.');
  const id = int(req.params.id);
  if (get('SELECT COUNT(*) AS n FROM cases WHERE client_id = ?', id).n > 0) throw new HttpError(400, 'El cliente tiene procesos asociados. Reasígnelos o archívelos antes de eliminarlo.');
  run('DELETE FROM clients WHERE id = ?', id); audit(req.user.id, 'delete', 'client', id, {}); res.json({ ok: true });
}));
// Crea (o reactiva) el acceso a la plataforma para un cliente.
clients.post('/:id/access', wrap((req, res) => {
  if (!canManage(req.user)) throw new HttpError(403, 'Solo un abogado o administrador puede crear accesos.');
  const cl = get('SELECT * FROM clients WHERE id = ?', int(req.params.id));
  if (!cl) throw new HttpError(404, 'Cliente no encontrado.');
  const email = str(req.body.email, 160).toLowerCase() || cl.email;
  if (!isEmail(email)) throw new HttpError(400, 'Indique un correo válido para el acceso.');
  const password = String(req.body.password || '') || `Arh-${randomToken(6)}`;
  if (password.length < 8) throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres.');
  const existing = get('SELECT * FROM users WHERE email = ?', email);
  let uid;
  if (existing) {
    if (existing.role !== 'cliente' || (existing.client_id && existing.client_id !== cl.id)) throw new HttpError(400, 'Ese correo ya está en uso por otro usuario.');
    run('UPDATE users SET password_hash = ?, active = 1, client_id = ?, must_change_password = 1, name = ? WHERE id = ?', hashPassword(password), cl.id, cl.contact_name || cl.name, existing.id);
    uid = existing.id;
  } else {
    uid = insert('INSERT INTO users(name,email,password_hash,role,client_id,must_change_password) VALUES(?,?,?,?,?,1)', cl.contact_name || cl.name, email, hashPassword(password), 'cliente', cl.id);
  }
  audit(req.user.id, 'client_access', 'user', uid, { client_id: cl.id });
  res.json({ user_id: uid, email, password });
}));

// ---------- Usuarios / equipo ----------------------------------------------
const users = express.Router();
users.use(requireStaff);
const USER_COLS = 'id, name, email, role, title, bio, phone, specialties, card_number, education, is_public, sort_order, active, client_id, must_change_password, created_at, last_login_at';
users.get('/', wrap((req, res) => {
  const rows = all(`SELECT ${USER_COLS}, (SELECT COUNT(*) FROM cases c WHERE c.responsible_id = users.id AND c.status = 'activo') AS active_cases, (SELECT COUNT(*) FROM case_stages s WHERE s.lawyer_id = users.id AND s.status = 'en_curso') AS stages_in_progress FROM users ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'abogado' THEN 1 WHEN 'asistente' THEN 2 ELSE 3 END, sort_order, name`);
  res.json(rows.map((u) => ({ ...u, specialties: JSON.parse(u.specialties || '[]') })));
}));
function userFields(b, existing) {
  return { name: str(b.name, 120), email: str(b.email, 160).toLowerCase(), role: oneOf(str(b.role), M.ids(M.ROLES), existing ? existing.role : 'abogado'), title: str(b.title, 120), bio: str(b.bio, 2000), phone: str(b.phone, 40), specialties: JSON.stringify(Array.isArray(b.specialties) ? b.specialties.map((s) => str(s, 60)).filter(Boolean).slice(0, 8) : []), card_number: str(b.card_number, 60), education: str(b.education, 600), is_public: bool(b.is_public), sort_order: int(b.sort_order, 100), active: existing ? bool(b.active ?? existing.active) : 1, client_id: int(b.client_id) };
}
users.post('/', requireRole('admin'), wrap((req, res) => {
  const f = userFields(req.body);
  if (!f.name || !isEmail(f.email)) throw new HttpError(400, 'Nombre y correo válido son obligatorios.');
  if (get('SELECT id FROM users WHERE email = ?', f.email)) throw new HttpError(400, 'Ya existe un usuario con ese correo.');
  if (f.role === 'cliente' && !f.client_id) throw new HttpError(400, 'Un usuario cliente debe estar vinculado a un cliente.');
  const password = String(req.body.password || '') || `Arh-${randomToken(6)}`;
  if (password.length < 8) throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres.');
  const id = insert('INSERT INTO users(name,email,password_hash,role,title,bio,phone,specialties,card_number,education,is_public,sort_order,active,client_id,must_change_password) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)', f.name, f.email, hashPassword(password), f.role, f.title, f.bio, f.phone, f.specialties, f.card_number, f.education, f.is_public, f.sort_order, 1, f.role === 'cliente' ? f.client_id : null);
  audit(req.user.id, 'create', 'user', id, { email: f.email, role: f.role });
  res.status(201).json({ user: safeUser(get('SELECT * FROM users WHERE id = ?', id)), password });
}));
users.put('/:id', requireRole('admin'), wrap((req, res) => {
  const id = int(req.params.id); const existing = get('SELECT * FROM users WHERE id = ?', id);
  if (!existing) throw new HttpError(404, 'Usuario no encontrado.');
  const f = userFields(req.body, existing);
  if (!f.name || !isEmail(f.email)) throw new HttpError(400, 'Nombre y correo válido son obligatorios.');
  const dup = get('SELECT id FROM users WHERE email = ? AND id <> ?', f.email, id); if (dup) throw new HttpError(400, 'Ya existe otro usuario con ese correo.');
  if (id === req.user.id && (f.role !== 'admin' || !f.active)) throw new HttpError(400, 'No puede quitarse a sí mismo el perfil de administrador ni desactivarse.');
  run('UPDATE users SET name=?,email=?,role=?,title=?,bio=?,phone=?,specialties=?,card_number=?,education=?,is_public=?,sort_order=?,active=?,client_id=? WHERE id = ?', f.name, f.email, f.role, f.title, f.bio, f.phone, f.specialties, f.card_number, f.education, f.is_public, f.sort_order, f.active, f.role === 'cliente' ? f.client_id : null, id);
  if (!f.active) run('DELETE FROM sessions WHERE user_id = ?', id);
  audit(req.user.id, 'update', 'user', id, {});
  res.json(safeUser(get('SELECT * FROM users WHERE id = ?', id)));
}));
users.put('/:id/password', requireRole('admin'), wrap((req, res) => {
  const id = int(req.params.id); if (!get('SELECT id FROM users WHERE id = ?', id)) throw new HttpError(404, 'Usuario no encontrado.');
  const password = String(req.body.password || '') || `Arh-${randomToken(6)}`;
  if (password.length < 8) throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres.');
  run('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?', hashPassword(password), id);
  run('DELETE FROM sessions WHERE user_id = ?', id);
  audit(req.user.id, 'password_reset', 'user', id, {});
  res.json({ password });
}));

// ---------- Agenda y tareas globales ---------------------------------------
const agenda = express.Router();
agenda.get('/', requireAuth, wrap((req, res) => {
  const from = dateOrNull(req.query.from) || todayLocal();
  const to = dateOrNull(req.query.to) || addDays(from, 45);
  const scope = caseScope(req.user);
  const vis = visibilityScope(req.user, 'e');
  const mine = req.query.mine === '1' && !isClient(req.user);
  const events = all(`SELECT e.*, u.name AS responsible_name, c.ref AS case_ref, c.title AS case_title FROM events e LEFT JOIN users u ON u.id = e.responsible_id LEFT JOIN cases c ON c.id = e.case_id
    WHERE substr(e.start_at,1,10) BETWEEN ? AND ? ${vis} ${scope.where.replace(/c\./g, 'c.')} ${mine ? ' AND e.responsible_id = ? ' : ''} ORDER BY e.start_at`, from, to, ...scope.params, ...(mine ? [req.user.id] : []));
  const dueActions = isClient(req.user) ? [] : all(`SELECT c.id, c.ref, c.title, c.next_action, c.next_action_due, u.name AS responsible_name FROM cases c LEFT JOIN users u ON u.id = c.responsible_id WHERE c.status = 'activo' AND c.next_action_due BETWEEN ? AND ? ${mine ? ' AND c.responsible_id = ? ' : ''} ORDER BY c.next_action_due`, from, to, ...(mine ? [req.user.id] : []));
  const tasks = isClient(req.user) ? [] : all(`SELECT t.*, u.name AS assigned_name, c.ref AS case_ref, c.title AS case_title FROM tasks t LEFT JOIN users u ON u.id = t.assigned_to LEFT JOIN cases c ON c.id = t.case_id WHERE t.status <> 'hecha' AND t.due_at BETWEEN ? AND ? ${mine ? ' AND t.assigned_to = ? ' : ''} ORDER BY t.due_at`, from, to, ...(mine ? [req.user.id] : []));
  const stages = isClient(req.user) ? [] : all(`SELECT s.id, s.name, s.due_at, s.status, c.id AS case_id, c.ref AS case_ref, c.title AS case_title, u.name AS lawyer_name FROM case_stages s JOIN cases c ON c.id = s.case_id LEFT JOIN users u ON u.id = s.lawyer_id WHERE s.status IN ('pendiente','en_curso') AND s.due_at BETWEEN ? AND ? ${mine ? ' AND s.lawyer_id = ? ' : ''} ORDER BY s.due_at`, from, to, ...(mine ? [req.user.id] : []));
  res.json({ from, to, events, dueActions, tasks, stages });
}));

const tasks = express.Router();
tasks.use(requireStaff);
tasks.get('/', wrap((req, res) => {
  const status = str(req.query.status); const assigned = str(req.query.assigned);
  const params = []; let where = '1=1';
  if (status === 'open') where += " AND t.status <> 'hecha'"; else if (status) { where += ' AND t.status = ?'; params.push(status); }
  if (assigned === 'me') { where += ' AND t.assigned_to = ?'; params.push(req.user.id); } else if (int(assigned)) { where += ' AND t.assigned_to = ?'; params.push(int(assigned)); }
  res.json(all(`SELECT t.*, u.name AS assigned_name, c.ref AS case_ref, c.title AS case_title FROM tasks t LEFT JOIN users u ON u.id = t.assigned_to LEFT JOIN cases c ON c.id = t.case_id WHERE ${where} ORDER BY CASE t.status WHEN 'hecha' THEN 1 ELSE 0 END, t.due_at IS NULL, t.due_at, t.priority LIMIT 300`, ...params));
}));
tasks.post('/', wrap((req, res) => {
  const b = req.body; const title = str(b.title, 200); if (!title) throw new HttpError(400, 'La tarea necesita un título.');
  const caseId = int(b.case_id); if (caseId && !get('SELECT id FROM cases WHERE id = ?', caseId)) throw new HttpError(400, 'Proceso no válido.');
  const id = insert('INSERT INTO tasks(case_id,title,description,assigned_to,due_at,status,priority,created_by) VALUES(?,?,?,?,?,?,?,?)', caseId, title, str(b.description, 2000), int(b.assigned_to) ?? req.user.id, dateOrNull(b.due_at), 'pendiente', oneOf(str(b.priority), M.ids(M.PRIORITIES), 'media'), req.user.id);
  res.status(201).json(get('SELECT t.*, u.name AS assigned_name, c.ref AS case_ref, c.title AS case_title FROM tasks t LEFT JOIN users u ON u.id = t.assigned_to LEFT JOIN cases c ON c.id = t.case_id WHERE t.id = ?', id));
}));
tasks.put('/:id', wrap((req, res) => {
  const t = get('SELECT * FROM tasks WHERE id = ?', int(req.params.id)); if (!t) throw new HttpError(404, 'Tarea no encontrada.');
  const b = req.body;
  const status = oneOf(str(b.status), M.ids(M.TASK_STATUS), t.status);
  run("UPDATE tasks SET title=?,description=?,assigned_to=?,due_at=?,status=?,priority=?,completed_at=CASE WHEN ?='hecha' THEN COALESCE(completed_at, datetime('now')) ELSE NULL END WHERE id = ?",
    str(b.title, 200) || t.title, b.description === undefined ? t.description : str(b.description, 2000), b.assigned_to === undefined ? t.assigned_to : int(b.assigned_to), b.due_at === undefined ? t.due_at : dateOrNull(b.due_at), status, oneOf(str(b.priority), M.ids(M.PRIORITIES), t.priority), status, t.id);
  res.json(get('SELECT t.*, u.name AS assigned_name, c.ref AS case_ref, c.title AS case_title FROM tasks t LEFT JOIN users u ON u.id = t.assigned_to LEFT JOIN cases c ON c.id = t.case_id WHERE t.id = ?', t.id));
}));
tasks.delete('/:id', wrap((req, res) => { run('DELETE FROM tasks WHERE id = ?', int(req.params.id)); res.json({ ok: true }); }));

// ---------- Resumen (dashboard) --------------------------------------------
const dashboard = express.Router();
dashboard.get('/', requireAuth, wrap((req, res) => {
  const today = todayLocal(); const now = nowLocal(); const in7 = addDays(today, 7);
  if (isClient(req.user)) {
    const cid = req.user.client_id ?? -1;
    const cases = all(`${CASE_SELECT} WHERE c.client_id = ? ORDER BY c.status = 'activo' DESC, c.updated_at DESC`, cid);
    const events = all(`SELECT e.*, c.ref AS case_ref, c.title AS case_title, u.name AS responsible_name FROM events e JOIN cases c ON c.id = e.case_id LEFT JOIN users u ON u.id = e.responsible_id WHERE c.client_id = ? AND e.visibility = 'cliente' AND e.status = 'programado' AND e.start_at >= ? ORDER BY e.start_at LIMIT 8`, cid, now);
    const docket = all(`SELECT d.*, c.ref AS case_ref, c.title AS case_title FROM docket d JOIN cases c ON c.id = d.case_id WHERE c.client_id = ? AND d.visibility = 'cliente' ORDER BY d.date DESC, d.id DESC LIMIT 10`, cid);
    const pendingDocs = all(`SELECT d.*, c.ref AS case_ref FROM documents d JOIN cases c ON c.id = d.case_id WHERE c.client_id = ? AND d.visibility = 'cliente' AND d.status = 'requiere_atencion'`, cid);
    const messages = all(`SELECT m.*, u.name AS author_name, c.ref AS case_ref FROM messages m JOIN cases c ON c.id = m.case_id LEFT JOIN users u ON u.id = m.author_id WHERE c.client_id = ? AND m.visibility = 'cliente' ORDER BY m.created_at DESC LIMIT 5`, cid);
    return res.json({ role: 'cliente', cases, events, docket, pendingDocs, messages, client: get('SELECT * FROM clients WHERE id = ?', cid) });
  }
  const me = req.user.id;
  const counts = {
    active: get("SELECT COUNT(*) AS n FROM cases WHERE status = 'activo'").n,
    mine: get("SELECT COUNT(*) AS n FROM cases WHERE status = 'activo' AND (responsible_id = ? OR id IN (SELECT case_id FROM case_team WHERE user_id = ?))", me, me).n,
    events7: get("SELECT COUNT(*) AS n FROM events WHERE status = 'programado' AND substr(start_at,1,10) BETWEEN ? AND ?", today, in7).n,
    overdueEvents: get("SELECT COUNT(*) AS n FROM events WHERE status = 'programado' AND start_at < ?", now).n,
    tasksOpen: get("SELECT COUNT(*) AS n FROM tasks WHERE status <> 'hecha' AND assigned_to = ?", me).n,
    tasksOverdue: get("SELECT COUNT(*) AS n FROM tasks WHERE status <> 'hecha' AND assigned_to = ? AND due_at < ?", me, today).n,
    docsReview: get("SELECT COUNT(*) AS n FROM documents WHERE status IN ('recibido','en_revision')").n,
    leadsNew: get("SELECT COUNT(*) AS n FROM leads WHERE status = 'nueva'").n,
    clients: get('SELECT COUNT(*) AS n FROM clients').n,
    closedYear: get("SELECT COUNT(*) AS n FROM cases WHERE status IN ('terminado','archivado') AND substr(closed_at,1,4) = ?", today.slice(0, 4)).n,
    favorableYear: get("SELECT COUNT(*) AS n FROM cases WHERE status IN ('terminado','archivado') AND outcome IN ('favorable','parcial','conciliado') AND substr(closed_at,1,4) = ?", today.slice(0, 4)).n,
  };
  const upcoming = all(`SELECT e.*, c.ref AS case_ref, c.title AS case_title, u.name AS responsible_name FROM events e LEFT JOIN cases c ON c.id = e.case_id LEFT JOIN users u ON u.id = e.responsible_id WHERE e.status = 'programado' AND e.start_at >= ? ORDER BY e.start_at LIMIT 8`, now);
  const overdue = all(`SELECT e.*, c.ref AS case_ref, c.title AS case_title, u.name AS responsible_name FROM events e LEFT JOIN cases c ON c.id = e.case_id LEFT JOIN users u ON u.id = e.responsible_id WHERE e.status = 'programado' AND e.start_at < ? ORDER BY e.start_at LIMIT 6`, now);
  const myTasks = all(`SELECT t.*, c.ref AS case_ref, c.title AS case_title FROM tasks t LEFT JOIN cases c ON c.id = t.case_id WHERE t.status <> 'hecha' AND t.assigned_to = ? ORDER BY t.due_at IS NULL, t.due_at LIMIT 8`, me);
  const myCases = all(`${CASE_SELECT} WHERE c.status = 'activo' AND (c.responsible_id = ? OR c.id IN (SELECT case_id FROM case_team WHERE user_id = ?) OR c.id IN (SELECT case_id FROM case_stages WHERE lawyer_id = ? AND status = 'en_curso')) ORDER BY c.next_action_due IS NULL, c.next_action_due, c.updated_at DESC LIMIT 8`, me, me, me);
  const dueActions = all(`SELECT c.id, c.ref, c.title, c.next_action, c.next_action_due, u.name AS responsible_name FROM cases c LEFT JOIN users u ON u.id = c.responsible_id WHERE c.status = 'activo' AND c.next_action_due IS NOT NULL AND c.next_action_due <= ? ORDER BY c.next_action_due LIMIT 8`, in7);
  const recentDocket = all(`SELECT d.*, c.ref AS case_ref, c.title AS case_title, u.name AS user_name FROM docket d JOIN cases c ON c.id = d.case_id LEFT JOIN users u ON u.id = d.user_id ORDER BY d.created_at DESC, d.id DESC LIMIT 10`);
  const byArea = all("SELECT area, COUNT(*) AS n FROM cases WHERE status = 'activo' GROUP BY area ORDER BY n DESC");
  const byStatus = all('SELECT status, COUNT(*) AS n FROM cases GROUP BY status');
  const byLawyer = all("SELECT u.id, u.name, COUNT(c.id) AS n FROM users u LEFT JOIN cases c ON c.responsible_id = u.id AND c.status = 'activo' WHERE u.role IN ('admin','abogado') AND u.active = 1 GROUP BY u.id ORDER BY n DESC, u.name");
  const leads = all("SELECT id, name, reason, created_at FROM leads WHERE status = 'nueva' ORDER BY created_at DESC LIMIT 5");
  res.json({ role: req.user.role, counts, upcoming, overdue, myTasks, myCases, dueActions, recentDocket, byArea, byStatus, byLawyer, leads, today });
}));

// ---------- Solicitudes de contacto (leads) --------------------------------
const leads = express.Router();
leads.use(requireStaff);
leads.get('/', wrap((req, res) => {
  const status = str(req.query.status);
  res.json(all(`SELECT l.*, u.name AS assigned_name FROM leads l LEFT JOIN users u ON u.id = l.assigned_to ${status ? 'WHERE l.status = ?' : ''} ORDER BY l.created_at DESC LIMIT 300`, ...(status ? [status] : [])));
}));
leads.put('/:id', wrap((req, res) => {
  const l = get('SELECT * FROM leads WHERE id = ?', int(req.params.id)); if (!l) throw new HttpError(404, 'Solicitud no encontrada.');
  const b = req.body;
  run('UPDATE leads SET status=?,assigned_to=?,notes=? WHERE id = ?', oneOf(str(b.status), M.ids(M.LEAD_STATUS), l.status), b.assigned_to === undefined ? l.assigned_to : int(b.assigned_to), b.notes === undefined ? l.notes : str(b.notes, 2000), l.id);
  audit(req.user.id, 'update', 'lead', l.id, {});
  res.json(get('SELECT l.*, u.name AS assigned_name FROM leads l LEFT JOIN users u ON u.id = l.assigned_to WHERE l.id = ?', l.id));
}));
leads.post('/:id/convert', wrap((req, res) => {
  const l = get('SELECT * FROM leads WHERE id = ?', int(req.params.id)); if (!l) throw new HttpError(404, 'Solicitud no encontrada.');
  let cl = l.email ? get('SELECT * FROM clients WHERE email = ?', l.email.toLowerCase()) : null;
  if (!cl) { const id = insert('INSERT INTO clients(kind,name,email,phone,notes) VALUES(?,?,?,?,?)', 'natural', l.name, l.email.toLowerCase(), l.phone, `Creado desde la solicitud web del ${l.created_at}. Motivo: ${l.reason}.`); cl = get('SELECT * FROM clients WHERE id = ?', id); }
  run("UPDATE leads SET status = 'convertida', assigned_to = COALESCE(assigned_to, ?) WHERE id = ?", req.user.id, l.id);
  audit(req.user.id, 'convert', 'lead', l.id, { client_id: cl.id });
  res.json({ client: cl });
}));
leads.delete('/:id', wrap((req, res) => { if (!isAdmin(req.user)) throw new HttpError(403, 'Solo el administrador puede eliminar solicitudes.'); run('DELETE FROM leads WHERE id = ?', int(req.params.id)); res.json({ ok: true }); }));

// ---------- Ajustes y auditoría --------------------------------------------
const SETTING_KEYS = ['firm_name', 'firm_descriptor', 'firm_tagline', 'firm_intro', 'firm_about', 'firm_about_2', 'firm_address', 'firm_city', 'firm_phone', 'firm_whatsapp', 'firm_email', 'firm_hours', 'firm_founded', 'site_show_success', 'site_show_team', 'site_show_stats', 'demo_notice', 'site_success_note'];
const settings = express.Router();
settings.get('/', requireStaff, (req, res) => res.json(allSettings()));
settings.put('/', requireRole('admin'), wrap((req, res) => {
  SETTING_KEYS.forEach((k) => { if (req.body[k] !== undefined) setSetting(k, str(req.body[k], 4000)); });
  audit(req.user.id, 'update', 'settings', null, {});
  res.json(allSettings());
}));
const auditRouter = express.Router();
auditRouter.get('/', requireRole('admin'), wrap((req, res) => {
  res.json(all('SELECT a.*, u.name AS user_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT ?', Math.min(500, int(req.query.limit, 200))));
}));

// ---------- Sitio público ---------------------------------------------------
const pub = express.Router();
const contactHits = new Map();
pub.get('/site', wrap((req, res) => {
  const s = allSettings();
  const team = s.site_show_team === '0' ? [] : all("SELECT id, name, title, bio, specialties, education, card_number, sort_order, role FROM users WHERE is_public = 1 AND active = 1 AND role IN ('admin','abogado','asistente') ORDER BY sort_order, name").map((u) => ({ ...u, specialties: JSON.parse(u.specialties || '[]'), active_cases: get("SELECT COUNT(*) AS n FROM cases WHERE status = 'activo' AND responsible_id = ?", u.id).n }));
  const success = s.site_show_success === '0' ? [] : all(`SELECT c.id, c.area, c.process_type, c.city, c.department, c.outcome, c.closed_at, c.opened_at, c.instance, COALESCE(NULLIF(c.public_title,''), c.title) AS title, c.public_summary AS summary, u.name AS lawyer, u.title AS lawyer_title,
      (SELECT GROUP_CONCAT(DISTINCT u2.name) FROM case_stages s JOIN users u2 ON u2.id = s.lawyer_id WHERE s.case_id = c.id AND u2.is_public = 1) AS team
    FROM cases c LEFT JOIN users u ON u.id = c.responsible_id WHERE c.featured = 1 AND c.status IN ('terminado','archivado') AND c.outcome IN ('favorable','parcial','conciliado') AND c.public_summary <> '' ORDER BY c.closed_at DESC`);
  const stats = s.site_show_stats === '0' ? null : {
    closed: get("SELECT COUNT(*) AS n FROM cases WHERE status IN ('terminado','archivado')").n,
    favorable: get("SELECT COUNT(*) AS n FROM cases WHERE status IN ('terminado','archivado') AND outcome IN ('favorable','parcial','conciliado')").n,
    cities: get("SELECT COUNT(DISTINCT city) AS n FROM cases WHERE city <> ''").n,
    areas: get('SELECT COUNT(DISTINCT area) AS n FROM cases').n,
    lawyers: team.length,
  };
  res.json({ settings: s, team, success, stats, areas: M.AREAS, outcomes: M.OUTCOMES });
}));
pub.post('/contact', wrap((req, res) => {
  const b = req.body || {};
  if (str(b.website)) return res.json({ ok: true }); // honeypot
  const now = Date.now(); const hits = (contactHits.get(req.ip) || []).filter((t) => now - t < 3600000);
  if (hits.length >= 5) throw new HttpError(429, 'Ha enviado varias solicitudes. Intente de nuevo más tarde.');
  const name = str(b.name, 120); const email = str(b.email, 160).toLowerCase(); const phone = str(b.phone, 40); const reason = str(b.reason, 80); const message = str(b.message, 2000);
  if (!name || !isEmail(email) || !reason) throw new HttpError(400, 'Complete su nombre, un correo válido y el motivo de contacto.');
  hits.push(now); contactHits.set(req.ip, hits);
  const id = insert('INSERT INTO leads(name,email,phone,reason,message,ip) VALUES(?,?,?,?,?,?)', name, email, phone, reason, message, req.ip || '');
  audit(null, 'create', 'lead', id, { from: 'web' });
  res.status(201).json({ ok: true });
}));

module.exports = { meta, clients, users, agenda, tasks, dashboard, leads, settings, audit: auditRouter, pub, SETTING_KEYS };
