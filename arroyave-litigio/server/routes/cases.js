'use strict';
const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const multer = require('multer');
const { all, get, run, insert, transaction, audit, nextCaseRef, UPLOAD_DIR } = require('../db');
const { requireAuth, requireStaff, canManage, isAdmin } = require('../auth');
const { HttpError, wrap, str, int, num, bool, oneOf, dateOrNull, dateTimeOrNull, required, randomToken } = require('../util');
const M = require('../meta');
const { nowLocal, todayLocal, isClient, caseScope, visibilityScope, CASE_SELECT, findCase } = require('../access');

const router = express.Router();
router.use(requireAuth);

const touch = (id) => run("UPDATE cases SET updated_at = datetime('now') WHERE id = ?", id);
const staffOnly = (req) => { if (isClient(req.user)) throw new HttpError(403, 'Su perfil no permite esta acción.'); };
const manageOnly = (req) => { if (!canManage(req.user)) throw new HttpError(403, 'Solo un abogado o administrador puede realizar esta acción.'); };

// ---------- Listado ---------------------------------------------------------
router.get('/', wrap((req, res) => {
  const q = str(req.query.q, 120).toLowerCase();
  const area = str(req.query.area, 40);
  const status = str(req.query.status, 40);
  const lawyer = int(req.query.lawyer);
  const city = str(req.query.city, 80);
  const clientId = int(req.query.client_id);
  const featured = req.query.featured;
  const page = Math.max(1, int(req.query.page, 1));
  const limit = Math.min(100, Math.max(5, int(req.query.limit, 25)));
  const sort = oneOf(str(req.query.sort), ['updated', 'ref', 'title', 'opened', 'due'], 'updated');
  const scope = caseScope(req.user);
  const where = ['1=1' + scope.where];
  const params = [...scope.params];
  if (q) { where.push('(LOWER(c.ref) LIKE ? OR LOWER(c.title) LIKE ? OR LOWER(c.radicado) LIKE ? OR LOWER(cl.name) LIKE ? OR LOWER(c.city) LIKE ? OR LOWER(c.court) LIKE ?)'); for (let i = 0; i < 6; i++) params.push(`%${q}%`); }
  if (area) { where.push('c.area = ?'); params.push(area); }
  if (status) { where.push('c.status = ?'); params.push(status); }
  if (lawyer) { where.push('(c.responsible_id = ? OR c.id IN (SELECT case_id FROM case_team WHERE user_id = ?) OR c.id IN (SELECT case_id FROM case_stages WHERE lawyer_id = ?))'); params.push(lawyer, lawyer, lawyer); }
  if (city) { where.push('LOWER(c.city) = ?'); params.push(city.toLowerCase()); }
  if (clientId) { where.push('c.client_id = ?'); params.push(clientId); }
  if (featured === '1') where.push('c.featured = 1');
  const order = { updated: 'c.updated_at DESC', ref: 'c.ref DESC', title: 'c.title COLLATE NOCASE ASC', opened: 'c.opened_at DESC', due: 'c.next_action_due IS NULL, c.next_action_due ASC' }[sort];
  const w = where.join(' AND ');
  const total = get(`SELECT COUNT(*) AS n FROM cases c LEFT JOIN clients cl ON cl.id = c.client_id WHERE ${w}`, ...params).n;
  const items = all(`${CASE_SELECT} WHERE ${w} ORDER BY ${order} LIMIT ? OFFSET ?`, ...params, limit, (page - 1) * limit);
  res.json({ items, total, page, limit });
}));

router.get('/cities', wrap((req, res) => {
  res.json(all("SELECT city, COUNT(*) AS n FROM cases WHERE city <> '' GROUP BY city ORDER BY n DESC, city"));
}));

// ---------- Crear -----------------------------------------------------------
function caseFields(b, user, existing) {
  const area = oneOf(str(b.area), M.ids(M.AREAS), existing ? existing.area : 'civil');
  const f = {
    title: str(b.title, 200),
    radicado: str(b.radicado, 40).replace(/\s+/g, ''),
    area,
    process_type: str(b.process_type, 80),
    instance: oneOf(str(b.instance), M.ids(M.INSTANCES), existing ? existing.instance : 'primera'),
    priority: oneOf(str(b.priority), M.ids(M.PRIORITIES), existing ? existing.priority : 'media'),
    client_id: int(b.client_id),
    city: str(b.city, 80),
    department: str(b.department, 80),
    court: str(b.court, 160),
    judge: str(b.judge, 120),
    amount: num(b.amount),
    description: str(b.description, 6000),
    next_action: str(b.next_action, 300),
    next_action_due: dateOrNull(b.next_action_due),
    opened_at: dateOrNull(b.opened_at) || (existing ? existing.opened_at : todayLocal()),
  };
  if (canManage(user)) {
    f.responsible_id = int(b.responsible_id);
    f.status = oneOf(str(b.status), M.ids(M.CASE_STATUS), existing ? existing.status : 'activo');
    f.outcome = oneOf(str(b.outcome), M.ids(M.OUTCOMES), existing ? existing.outcome : '');
    f.closed_at = dateOrNull(b.closed_at);
    f.featured = bool(b.featured);
    f.public_title = str(b.public_title, 160);
    f.public_summary = str(b.public_summary, 2000);
    if (['terminado', 'archivado'].includes(f.status) && !f.closed_at) f.closed_at = todayLocal();
    if (f.status === 'activo') f.closed_at = null;
  }
  if (f.client_id && !get('SELECT id FROM clients WHERE id = ?', f.client_id)) throw new HttpError(400, 'El cliente seleccionado no existe.');
  if (f.responsible_id && !get("SELECT id FROM users WHERE id = ? AND role IN ('admin','abogado') AND active = 1", f.responsible_id)) throw new HttpError(400, 'El abogado responsable no es válido.');
  return f;
}

function applyTemplate(caseId, templateKey, lawyerId, replace) {
  const tpl = M.STAGE_TEMPLATES[templateKey];
  if (!tpl) throw new HttpError(400, 'Plantilla de etapas desconocida.');
  if (replace) run('DELETE FROM case_stages WHERE case_id = ?', caseId);
  const base = get('SELECT COALESCE(MAX(position),0) AS p FROM case_stages WHERE case_id = ?', caseId).p;
  tpl.stages.forEach(([name, description], i) => {
    insert('INSERT INTO case_stages(case_id,position,name,description,status,lawyer_id) VALUES(?,?,?,?,?,?)',
      caseId, base + i + 1, name, description, base === 0 && i === 0 ? 'en_curso' : 'pendiente', lawyerId ?? null);
  });
}

router.post('/', requireStaff, wrap((req, res) => {
  const b = req.body;
  required(b, ['title', 'area']);
  const f = caseFields(b, req.user);
  if (!canManage(req.user)) { f.responsible_id = int(b.responsible_id); f.status = 'activo'; f.outcome = ''; f.featured = 0; f.public_title = ''; f.public_summary = ''; f.closed_at = null; }
  const id = transaction(() => {
    const ref = nextCaseRef();
    const keys = Object.keys(f);
    const id = insert(`INSERT INTO cases(ref,created_by,${keys.join(',')}) VALUES(?,?,${keys.map(() => '?').join(',')})`, ref, req.user.id, ...keys.map((k) => f[k]));
    if (f.responsible_id) run('INSERT OR IGNORE INTO case_team(case_id,user_id,role_in_case) VALUES(?,?,?)', id, f.responsible_id, 'Apoderado principal');
    const tplKey = str(b.template) || M.DEFAULT_TEMPLATE_BY_AREA[f.area] || 'generico';
    if (tplKey !== 'none') applyTemplate(id, tplKey, f.responsible_id, false);
    run('INSERT INTO docket(case_id,date,kind,title,description,source,visibility,user_id) VALUES(?,?,?,?,?,?,?,?)', id, todayLocal(), 'nota', 'Apertura del proceso', `Proceso creado en la plataforma con referencia ${ref}.`, 'interna', 'cliente', req.user.id);
    return id;
  });
  audit(req.user.id, 'create', 'case', id, { title: f.title });
  res.status(201).json(findCase(id, req.user));
}));

// ---------- Detalle ---------------------------------------------------------
router.get('/:id', wrap((req, res) => {
  const id = int(req.params.id);
  const c = findCase(id, req.user);
  const client = isClient(req.user);
  const vis = (alias) => visibilityScope(req.user, alias);
  const out = {
    case: c,
    client: c.client_id ? get('SELECT * FROM clients WHERE id = ?', c.client_id) : null,
    team: all(`SELECT t.id, t.user_id, t.role_in_case, u.name, u.title, u.role, u.email, u.phone FROM case_team t JOIN users u ON u.id = t.user_id WHERE t.case_id = ? ORDER BY t.id`, id),
    stages: all(`SELECT s.*, u.name AS lawyer_name FROM case_stages s LEFT JOIN users u ON u.id = s.lawyer_id WHERE s.case_id = ? ORDER BY s.position, s.id`, id),
    parties: all('SELECT * FROM case_parties WHERE case_id = ? ORDER BY side, id', id),
    docket: all(`SELECT d.*, u.name AS user_name, s.name AS stage_name FROM docket d LEFT JOIN users u ON u.id = d.user_id LEFT JOIN case_stages s ON s.id = d.stage_id WHERE d.case_id = ? ${vis('d')} ORDER BY d.date DESC, d.id DESC`, id),
    documents: all(`SELECT d.*, u.name AS uploaded_by_name, s.name AS stage_name FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by LEFT JOIN case_stages s ON s.id = d.stage_id WHERE d.case_id = ? ${vis('d')} ORDER BY d.created_at DESC, d.id DESC`, id),
    events: all(`SELECT e.*, u.name AS responsible_name FROM events e LEFT JOIN users u ON u.id = e.responsible_id WHERE e.case_id = ? ${vis('e')} ORDER BY e.start_at DESC`, id),
    tasks: client ? [] : all(`SELECT t.*, u.name AS assigned_name FROM tasks t LEFT JOIN users u ON u.id = t.assigned_to WHERE t.case_id = ? ORDER BY CASE t.status WHEN 'hecha' THEN 1 ELSE 0 END, t.due_at IS NULL, t.due_at`, id),
    messages: all(`SELECT m.*, u.name AS author_name, u.role AS author_role FROM messages m LEFT JOIN users u ON u.id = m.author_id WHERE m.case_id = ? ${vis('m')} ORDER BY m.created_at ASC, m.id ASC`, id),
  };
  if (client) {
    out.team = out.team.map(({ email, phone, ...t }) => t);
    out.parties = out.parties.map(({ doc_number, email, phone, ...p }) => p);
  }
  res.json(out);
}));

router.put('/:id', requireStaff, wrap((req, res) => {
  const id = int(req.params.id);
  const existing = findCase(id, req.user);
  const f = caseFields(req.body, req.user, existing);
  if (!f.title) throw new HttpError(400, 'El título es obligatorio.');
  const keys = Object.keys(f);
  run(`UPDATE cases SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`, ...keys.map((k) => f[k]), id);
  if (f.responsible_id && f.responsible_id !== existing.responsible_id) {
    run('INSERT OR IGNORE INTO case_team(case_id,user_id,role_in_case) VALUES(?,?,?)', id, f.responsible_id, 'Apoderado principal');
    run("UPDATE case_team SET role_in_case = 'Apoderado principal' WHERE case_id = ? AND user_id = ?", id, f.responsible_id);
  }
  if (canManage(req.user) && f.status !== existing.status) {
    run('INSERT INTO docket(case_id,date,kind,title,description,source,visibility,user_id) VALUES(?,?,?,?,?,?,?,?)', id, todayLocal(), 'nota', 'Cambio de estado del proceso',
      `El estado interno pasó de "${existing.status}" a "${f.status}".`, 'interna', 'cliente', req.user.id);
  }
  audit(req.user.id, 'update', 'case', id, { changed: keys.filter((k) => String(existing[k] ?? '') !== String(f[k] ?? '')) });
  res.json(findCase(id, req.user));
}));

router.delete('/:id', requireStaff, wrap((req, res) => {
  if (!isAdmin(req.user)) throw new HttpError(403, 'Solo el administrador puede eliminar procesos.');
  const id = int(req.params.id);
  const c = findCase(id, req.user);
  const docs = all('SELECT stored_name FROM documents WHERE case_id = ?', id);
  run('DELETE FROM cases WHERE id = ?', id);
  docs.forEach((d) => { try { fs.unlinkSync(path.join(UPLOAD_DIR, d.stored_name)); } catch {} });
  audit(req.user.id, 'delete', 'case', id, { ref: c.ref, title: c.title });
  res.json({ ok: true });
}));

// ---------- Etapas ----------------------------------------------------------
function stageFields(b, existing) {
  return {
    name: str(b.name, 160) || (existing ? existing.name : ''),
    description: str(b.description, 1000),
    status: oneOf(str(b.status), M.ids(M.STAGE_STATUS), existing ? existing.status : 'pendiente'),
    lawyer_id: int(b.lawyer_id),
    started_at: dateOrNull(b.started_at),
    due_at: dateOrNull(b.due_at),
    completed_at: dateOrNull(b.completed_at),
    notes: str(b.notes, 2000),
  };
}
router.post('/:id/stages', requireStaff, wrap((req, res) => {
  const id = int(req.params.id); findCase(id, req.user);
  const f = stageFields(req.body);
  if (!f.name) throw new HttpError(400, 'La etapa necesita un nombre.');
  const position = get('SELECT COALESCE(MAX(position),0)+1 AS p FROM case_stages WHERE case_id = ?', id).p;
  const sid = insert('INSERT INTO case_stages(case_id,position,name,description,status,lawyer_id,started_at,due_at,completed_at,notes) VALUES(?,?,?,?,?,?,?,?,?,?)', id, position, f.name, f.description, f.status, f.lawyer_id, f.started_at, f.due_at, f.completed_at, f.notes);
  if (f.lawyer_id) run('INSERT OR IGNORE INTO case_team(case_id,user_id,role_in_case) VALUES(?,?,?)', id, f.lawyer_id, 'Abogado de apoyo');
  touch(id); audit(req.user.id, 'create', 'stage', sid, { case_id: id, name: f.name });
  res.status(201).json(get('SELECT s.*, u.name AS lawyer_name FROM case_stages s LEFT JOIN users u ON u.id = s.lawyer_id WHERE s.id = ?', sid));
}));
router.post('/:id/stages/template', requireStaff, wrap((req, res) => {
  const id = int(req.params.id); const c = findCase(id, req.user);
  applyTemplate(id, str(req.body.template), int(req.body.lawyer_id) ?? c.responsible_id, bool(req.body.replace));
  touch(id); audit(req.user.id, 'apply_template', 'case', id, { template: req.body.template });
  res.json(all('SELECT s.*, u.name AS lawyer_name FROM case_stages s LEFT JOIN users u ON u.id = s.lawyer_id WHERE s.case_id = ? ORDER BY s.position', id));
}));
router.post('/:id/stages/reorder', requireStaff, wrap((req, res) => {
  const id = int(req.params.id); findCase(id, req.user);
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map((x) => int(x)).filter(Boolean) : [];
  transaction(() => ids.forEach((sid, i) => run('UPDATE case_stages SET position = ? WHERE id = ? AND case_id = ?', i + 1, sid, id)));
  touch(id);
  res.json({ ok: true });
}));
router.put('/:id/stages/:sid', requireStaff, wrap((req, res) => {
  const id = int(req.params.id); findCase(id, req.user);
  const existing = get('SELECT * FROM case_stages WHERE id = ? AND case_id = ?', int(req.params.sid), id);
  if (!existing) throw new HttpError(404, 'Etapa no encontrada.');
  const f = stageFields(req.body, existing);
  if (f.status === 'completada' && !f.completed_at) f.completed_at = todayLocal();
  if (f.status === 'en_curso' && !f.started_at) f.started_at = todayLocal();
  run('UPDATE case_stages SET name=?,description=?,status=?,lawyer_id=?,started_at=?,due_at=?,completed_at=?,notes=? WHERE id = ?', f.name, f.description, f.status, f.lawyer_id, f.started_at, f.due_at, f.completed_at, f.notes, existing.id);
  if (f.lawyer_id) run('INSERT OR IGNORE INTO case_team(case_id,user_id,role_in_case) VALUES(?,?,?)', id, f.lawyer_id, 'Abogado de apoyo');
  if (f.status !== existing.status) {
    const label = (M.STAGE_STATUS.find((s) => s.id === f.status) || {}).label || f.status;
    run('INSERT INTO docket(case_id,stage_id,date,kind,title,description,source,visibility,user_id) VALUES(?,?,?,?,?,?,?,?,?)', id, existing.id, todayLocal(), 'nota', `Etapa "${f.name}": ${label.toLowerCase()}`, '', 'interna', 'cliente', req.user.id);
  }
  touch(id); audit(req.user.id, 'update', 'stage', existing.id, { case_id: id, status: f.status });
  res.json(get('SELECT s.*, u.name AS lawyer_name FROM case_stages s LEFT JOIN users u ON u.id = s.lawyer_id WHERE s.id = ?', existing.id));
}));
router.delete('/:id/stages/:sid', requireStaff, wrap((req, res) => {
  manageOnly(req);
  const id = int(req.params.id); findCase(id, req.user);
  run('DELETE FROM case_stages WHERE id = ? AND case_id = ?', int(req.params.sid), id);
  touch(id); res.json({ ok: true });
}));

// ---------- Partes ----------------------------------------------------------
function partyFields(b) {
  return { name: str(b.name, 160), role: str(b.role, 80) || 'Demandante', side: oneOf(str(b.side), M.ids(M.PARTY_SIDES), 'nuestra'), doc_type: str(b.doc_type, 10), doc_number: str(b.doc_number, 40), email: str(b.email, 160), phone: str(b.phone, 40), counsel: str(b.counsel, 160), notes: str(b.notes, 1000) };
}
router.post('/:id/parties', requireStaff, wrap((req, res) => {
  const id = int(req.params.id); findCase(id, req.user);
  const f = partyFields(req.body); if (!f.name) throw new HttpError(400, 'El nombre de la parte es obligatorio.');
  const pid = insert('INSERT INTO case_parties(case_id,name,role,side,doc_type,doc_number,email,phone,counsel,notes) VALUES(?,?,?,?,?,?,?,?,?,?)', id, f.name, f.role, f.side, f.doc_type, f.doc_number, f.email, f.phone, f.counsel, f.notes);
  touch(id); res.status(201).json(get('SELECT * FROM case_parties WHERE id = ?', pid));
}));
router.put('/:id/parties/:pid', requireStaff, wrap((req, res) => {
  const id = int(req.params.id); findCase(id, req.user);
  const f = partyFields(req.body); if (!f.name) throw new HttpError(400, 'El nombre de la parte es obligatorio.');
  run('UPDATE case_parties SET name=?,role=?,side=?,doc_type=?,doc_number=?,email=?,phone=?,counsel=?,notes=? WHERE id = ? AND case_id = ?', f.name, f.role, f.side, f.doc_type, f.doc_number, f.email, f.phone, f.counsel, f.notes, int(req.params.pid), id);
  touch(id); res.json(get('SELECT * FROM case_parties WHERE id = ?', int(req.params.pid)));
}));
router.delete('/:id/parties/:pid', requireStaff, wrap((req, res) => {
  const id = int(req.params.id); findCase(id, req.user);
  run('DELETE FROM case_parties WHERE id = ? AND case_id = ?', int(req.params.pid), id); touch(id); res.json({ ok: true });
}));

// ---------- Actuaciones -----------------------------------------------------
function docketFields(b) {
  return { stage_id: int(b.stage_id), date: dateOrNull(b.date) || todayLocal(), kind: oneOf(str(b.kind), M.ids(M.DOCKET_KINDS), 'actuacion'), title: str(b.title, 200), description: str(b.description, 4000), source: oneOf(str(b.source), M.ids(M.DOCKET_SOURCES), 'interna'), visibility: oneOf(str(b.visibility), ['interno', 'cliente'], 'interno') };
}
router.post('/:id/docket', requireStaff, wrap((req, res) => {
  const id = int(req.params.id); findCase(id, req.user);
  const f = docketFields(req.body); if (!f.title) throw new HttpError(400, 'La actuación necesita un título.');
  const did = insert('INSERT INTO docket(case_id,stage_id,date,kind,title,description,source,visibility,user_id) VALUES(?,?,?,?,?,?,?,?,?)', id, f.stage_id, f.date, f.kind, f.title, f.description, f.source, f.visibility, req.user.id);
  touch(id); audit(req.user.id, 'create', 'docket', did, { case_id: id });
  res.status(201).json(get('SELECT d.*, u.name AS user_name, s.name AS stage_name FROM docket d LEFT JOIN users u ON u.id = d.user_id LEFT JOIN case_stages s ON s.id = d.stage_id WHERE d.id = ?', did));
}));
router.put('/:id/docket/:did', requireStaff, wrap((req, res) => {
  const id = int(req.params.id); findCase(id, req.user);
  const f = docketFields(req.body); if (!f.title) throw new HttpError(400, 'La actuación necesita un título.');
  run('UPDATE docket SET stage_id=?,date=?,kind=?,title=?,description=?,source=?,visibility=? WHERE id = ? AND case_id = ?', f.stage_id, f.date, f.kind, f.title, f.description, f.source, f.visibility, int(req.params.did), id);
  touch(id); res.json(get('SELECT d.*, u.name AS user_name, s.name AS stage_name FROM docket d LEFT JOIN users u ON u.id = d.user_id LEFT JOIN case_stages s ON s.id = d.stage_id WHERE d.id = ?', int(req.params.did)));
}));
router.delete('/:id/docket/:did', requireStaff, wrap((req, res) => {
  const id = int(req.params.id); findCase(id, req.user);
  run('DELETE FROM docket WHERE id = ? AND case_id = ?', int(req.params.did), id); touch(id); res.json({ ok: true });
}));

// ---------- Documentos ------------------------------------------------------
const ALLOWED_EXT = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.jpg', '.jpeg', '.png', '.gif', '.txt', '.rtf', '.odt', '.zip', '.mp3', '.mp4', '.m4a', '.csv']);
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, `${Date.now()}-${randomToken(12)}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) return cb(new HttpError(400, `Tipo de archivo no permitido (${ext || 'sin extensión'}).`));
    cb(null, true);
  },
});
const DOC_SELECT = 'SELECT d.*, u.name AS uploaded_by_name, s.name AS stage_name FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by LEFT JOIN case_stages s ON s.id = d.stage_id';

router.post('/:id/documents', (req, res, next) => upload.single('file')(req, res, (err) => next(err)), wrap((req, res) => {
  const id = int(req.params.id); findCase(id, req.user);
  if (!req.file) throw new HttpError(400, 'Seleccione un archivo.');
  const b = req.body || {};
  const client = isClient(req.user);
  const title = str(b.title, 200) || path.basename(req.file.originalname, path.extname(req.file.originalname));
  const category = oneOf(str(b.category), M.ids(M.DOC_CATEGORIES), 'otro');
  const visibility = client ? 'cliente' : oneOf(str(b.visibility), ['interno', 'cliente'], 'interno');
  const status = client ? 'recibido' : oneOf(str(b.status), M.ids(M.DOC_STATUS), 'recibido');
  const version = 1 + (get('SELECT COUNT(*) AS n FROM documents WHERE case_id = ? AND title = ?', id, title).n);
  const did = insert('INSERT INTO documents(case_id,stage_id,title,category,original_name,stored_name,mime,size,visibility,status,version,notes,uploaded_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
    id, client ? null : int(b.stage_id), title, category, req.file.originalname, req.file.filename, req.file.mimetype || '', req.file.size, visibility, status, version, str(b.notes, 1000), req.user.id);
  run('INSERT INTO docket(case_id,date,kind,title,description,source,visibility,user_id) VALUES(?,?,?,?,?,?,?,?)', id, todayLocal(), 'nota', `Documento recibido: ${title}`, client ? 'Aportado por el cliente desde la plataforma.' : '', client ? 'cliente' : 'interna', visibility, req.user.id);
  touch(id); audit(req.user.id, 'upload', 'document', did, { case_id: id, title });
  res.status(201).json(get(`${DOC_SELECT} WHERE d.id = ?`, did));
}));
router.put('/:id/documents/:did', requireStaff, wrap((req, res) => {
  const id = int(req.params.id); findCase(id, req.user);
  const d = get('SELECT * FROM documents WHERE id = ? AND case_id = ?', int(req.params.did), id);
  if (!d) throw new HttpError(404, 'Documento no encontrado.');
  const b = req.body;
  run('UPDATE documents SET title=?,category=?,visibility=?,status=?,stage_id=?,notes=? WHERE id = ?',
    str(b.title, 200) || d.title, oneOf(str(b.category), M.ids(M.DOC_CATEGORIES), d.category), oneOf(str(b.visibility), ['interno', 'cliente'], d.visibility), oneOf(str(b.status), M.ids(M.DOC_STATUS), d.status), int(b.stage_id), str(b.notes, 1000), d.id);
  touch(id); audit(req.user.id, 'update', 'document', d.id, { case_id: id });
  res.json(get(`${DOC_SELECT} WHERE d.id = ?`, d.id));
}));
router.delete('/:id/documents/:did', requireStaff, wrap((req, res) => {
  manageOnly(req);
  const id = int(req.params.id); findCase(id, req.user);
  const d = get('SELECT * FROM documents WHERE id = ? AND case_id = ?', int(req.params.did), id);
  if (!d) throw new HttpError(404, 'Documento no encontrado.');
  run('DELETE FROM documents WHERE id = ?', d.id);
  try { fs.unlinkSync(path.join(UPLOAD_DIR, d.stored_name)); } catch {}
  touch(id); audit(req.user.id, 'delete', 'document', d.id, { case_id: id, title: d.title });
  res.json({ ok: true });
}));

// Descarga: se monta en /api/documents/:did/download
const downloadRouter = express.Router();
downloadRouter.get('/:did/download', requireAuth, wrap((req, res) => {
  const d = get('SELECT * FROM documents WHERE id = ?', int(req.params.did));
  if (!d) throw new HttpError(404, 'Documento no encontrado.');
  findCase(d.case_id, req.user);
  if (isClient(req.user) && d.visibility !== 'cliente') throw new HttpError(404, 'Documento no encontrado.');
  const file = path.join(UPLOAD_DIR, path.basename(d.stored_name));
  if (!fs.existsSync(file)) throw new HttpError(410, 'El archivo ya no está disponible en el servidor.');
  audit(req.user.id, 'download', 'document', d.id, {});
  const inline = req.query.inline === '1' && ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.txt'].includes(path.extname(d.stored_name).toLowerCase());
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (inline) { res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(d.original_name)}`); return res.sendFile(file); }
  res.download(file, d.original_name);
}));

// ---------- Agenda del proceso ---------------------------------------------
function eventFields(b, existing) {
  return { title: str(b.title, 200), kind: oneOf(str(b.kind), M.ids(M.EVENT_KINDS), 'audiencia'), start_at: dateTimeOrNull(b.start_at), end_at: dateTimeOrNull(b.end_at), all_day: bool(b.all_day), location: str(b.location, 200), responsible_id: int(b.responsible_id), source: str(b.source, 80) || 'interna', status: oneOf(str(b.status), M.ids(M.EVENT_STATUS), existing ? existing.status : 'programado'), visibility: oneOf(str(b.visibility), ['interno', 'cliente'], 'interno'), notes: str(b.notes, 2000) };
}
const EVENT_SELECT = 'SELECT e.*, u.name AS responsible_name FROM events e LEFT JOIN users u ON u.id = e.responsible_id';
router.post('/:id/events', requireStaff, wrap((req, res) => {
  const id = int(req.params.id); findCase(id, req.user);
  const f = eventFields(req.body); if (!f.title || !f.start_at) throw new HttpError(400, 'Indique título y fecha del evento.');
  const eid = insert('INSERT INTO events(case_id,title,kind,start_at,end_at,all_day,location,responsible_id,source,status,visibility,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)', id, f.title, f.kind, f.start_at, f.end_at, f.all_day, f.location, f.responsible_id, f.source, f.status, f.visibility, f.notes, req.user.id);
  touch(id); audit(req.user.id, 'create', 'event', eid, { case_id: id });
  res.status(201).json(get(`${EVENT_SELECT} WHERE e.id = ?`, eid));
}));
router.put('/:id/events/:eid', requireStaff, wrap((req, res) => {
  const id = int(req.params.id); findCase(id, req.user);
  const existing = get('SELECT * FROM events WHERE id = ? AND case_id = ?', int(req.params.eid), id);
  if (!existing) throw new HttpError(404, 'Evento no encontrado.');
  const f = eventFields(req.body, existing); if (!f.title || !f.start_at) throw new HttpError(400, 'Indique título y fecha del evento.');
  run('UPDATE events SET title=?,kind=?,start_at=?,end_at=?,all_day=?,location=?,responsible_id=?,source=?,status=?,visibility=?,notes=? WHERE id = ?', f.title, f.kind, f.start_at, f.end_at, f.all_day, f.location, f.responsible_id, f.source, f.status, f.visibility, f.notes, existing.id);
  touch(id); res.json(get(`${EVENT_SELECT} WHERE e.id = ?`, existing.id));
}));
router.delete('/:id/events/:eid', requireStaff, wrap((req, res) => {
  const id = int(req.params.id); findCase(id, req.user);
  run('DELETE FROM events WHERE id = ? AND case_id = ?', int(req.params.eid), id); touch(id); res.json({ ok: true });
}));

// ---------- Tareas ----------------------------------------------------------
function taskFields(b, existing) {
  return { title: str(b.title, 200), description: str(b.description, 2000), assigned_to: int(b.assigned_to), due_at: dateOrNull(b.due_at), status: oneOf(str(b.status), M.ids(M.TASK_STATUS), existing ? existing.status : 'pendiente'), priority: oneOf(str(b.priority), M.ids(M.PRIORITIES), existing ? existing.priority : 'media') };
}
const TASK_SELECT = 'SELECT t.*, u.name AS assigned_name, c.ref AS case_ref, c.title AS case_title FROM tasks t LEFT JOIN users u ON u.id = t.assigned_to LEFT JOIN cases c ON c.id = t.case_id';
router.post('/:id/tasks', requireStaff, wrap((req, res) => {
  const id = int(req.params.id); findCase(id, req.user);
  const f = taskFields(req.body); if (!f.title) throw new HttpError(400, 'La tarea necesita un título.');
  const tid = insert('INSERT INTO tasks(case_id,title,description,assigned_to,due_at,status,priority,created_by) VALUES(?,?,?,?,?,?,?,?)', id, f.title, f.description, f.assigned_to, f.due_at, f.status, f.priority, req.user.id);
  touch(id); res.status(201).json(get(`${TASK_SELECT} WHERE t.id = ?`, tid));
}));
router.put('/:id/tasks/:tid', requireStaff, wrap((req, res) => {
  const id = int(req.params.id); findCase(id, req.user);
  const existing = get('SELECT * FROM tasks WHERE id = ? AND case_id = ?', int(req.params.tid), id);
  if (!existing) throw new HttpError(404, 'Tarea no encontrada.');
  const f = taskFields(req.body, existing); if (!f.title) throw new HttpError(400, 'La tarea necesita un título.');
  run("UPDATE tasks SET title=?,description=?,assigned_to=?,due_at=?,status=?,priority=?,completed_at=CASE WHEN ?='hecha' THEN COALESCE(completed_at, datetime('now')) ELSE NULL END WHERE id = ?", f.title, f.description, f.assigned_to, f.due_at, f.status, f.priority, f.status, existing.id);
  touch(id); res.json(get(`${TASK_SELECT} WHERE t.id = ?`, existing.id));
}));
router.delete('/:id/tasks/:tid', requireStaff, wrap((req, res) => {
  const id = int(req.params.id); findCase(id, req.user);
  run('DELETE FROM tasks WHERE id = ? AND case_id = ?', int(req.params.tid), id); touch(id); res.json({ ok: true });
}));

// ---------- Mensajes y notas ------------------------------------------------
router.post('/:id/messages', wrap((req, res) => {
  const id = int(req.params.id); findCase(id, req.user);
  const body = str(req.body.body, 4000); if (!body) throw new HttpError(400, 'Escriba un mensaje.');
  const visibility = isClient(req.user) ? 'cliente' : oneOf(str(req.body.visibility), ['interno', 'cliente'], 'interno');
  const mid = insert('INSERT INTO messages(case_id,author_id,body,visibility) VALUES(?,?,?,?)', id, req.user.id, body, visibility);
  touch(id); audit(req.user.id, 'message', 'case', id, { visibility });
  res.status(201).json(get('SELECT m.*, u.name AS author_name, u.role AS author_role FROM messages m LEFT JOIN users u ON u.id = m.author_id WHERE m.id = ?', mid));
}));
router.delete('/:id/messages/:mid', requireStaff, wrap((req, res) => {
  const id = int(req.params.id); findCase(id, req.user);
  const m = get('SELECT * FROM messages WHERE id = ? AND case_id = ?', int(req.params.mid), id);
  if (!m) throw new HttpError(404, 'Mensaje no encontrado.');
  if (!isAdmin(req.user) && m.author_id !== req.user.id) throw new HttpError(403, 'Solo puede eliminar sus propios mensajes.');
  run('DELETE FROM messages WHERE id = ?', m.id); res.json({ ok: true });
}));

// ---------- Equipo del proceso ---------------------------------------------
router.post('/:id/team', requireStaff, wrap((req, res) => {
  const id = int(req.params.id); findCase(id, req.user);
  const uid = int(req.body.user_id); const role = str(req.body.role_in_case, 80) || 'Abogado de apoyo';
  if (!uid || !get("SELECT id FROM users WHERE id = ? AND role IN ('admin','abogado','asistente') AND active = 1", uid)) throw new HttpError(400, 'Seleccione un miembro del equipo válido.');
  run('INSERT INTO case_team(case_id,user_id,role_in_case) VALUES(?,?,?) ON CONFLICT(case_id,user_id) DO UPDATE SET role_in_case = excluded.role_in_case', id, uid, role);
  touch(id); res.json(all('SELECT t.id, t.user_id, t.role_in_case, u.name, u.title, u.role, u.email, u.phone FROM case_team t JOIN users u ON u.id = t.user_id WHERE t.case_id = ? ORDER BY t.id', id));
}));
router.delete('/:id/team/:uid', requireStaff, wrap((req, res) => {
  manageOnly(req);
  const id = int(req.params.id); const c = findCase(id, req.user);
  const uid = int(req.params.uid);
  if (uid === c.responsible_id) throw new HttpError(400, 'Cambie primero el abogado responsable del proceso.');
  run('DELETE FROM case_team WHERE case_id = ? AND user_id = ?', id, uid); touch(id); res.json({ ok: true });
}));

module.exports = { router, downloadRouter, applyTemplate };
