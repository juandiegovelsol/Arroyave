'use strict';
// Capa de datos: SQLite integrado en Node (node:sqlite). Sin dependencias nativas.
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'arroyave.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL DEFAULT 'natural' CHECK (kind IN ('natural','juridica')),
  name TEXT NOT NULL,
  doc_type TEXT DEFAULT 'CC',
  doc_number TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  address TEXT DEFAULT '',
  city TEXT DEFAULT '',
  department TEXT DEFAULT '',
  contact_name TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','abogado','asistente','cliente')),
  title TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  specialties TEXT DEFAULT '[]',
  card_number TEXT DEFAULT '',
  education TEXT DEFAULT '',
  photo TEXT DEFAULT '',
  is_public INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 100,
  active INTEGER NOT NULL DEFAULT 1,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  ip TEXT, user_agent TEXT
);
CREATE TABLE IF NOT EXISTS cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL UNIQUE,
  radicado TEXT DEFAULT '',
  title TEXT NOT NULL,
  area TEXT NOT NULL,
  process_type TEXT DEFAULT '',
  instance TEXT DEFAULT 'primera',
  status TEXT NOT NULL DEFAULT 'activo' CHECK (status IN ('activo','suspendido','terminado','archivado')),
  outcome TEXT DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'media' CHECK (priority IN ('alta','media','baja')),
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  responsible_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  city TEXT DEFAULT '',
  department TEXT DEFAULT '',
  court TEXT DEFAULT '',
  judge TEXT DEFAULT '',
  amount REAL,
  description TEXT DEFAULT '',
  next_action TEXT DEFAULT '',
  next_action_due TEXT,
  opened_at TEXT,
  closed_at TEXT,
  featured INTEGER NOT NULL DEFAULT 0,
  public_title TEXT DEFAULT '',
  public_summary TEXT DEFAULT '',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS case_team (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_in_case TEXT NOT NULL DEFAULT 'Abogado de apoyo',
  UNIQUE (case_id, user_id)
);
CREATE TABLE IF NOT EXISTS case_stages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','en_curso','completada','omitida')),
  lawyer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  started_at TEXT,
  due_at TEXT,
  completed_at TEXT,
  notes TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS case_parties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Demandante',
  side TEXT NOT NULL DEFAULT 'nuestra' CHECK (side IN ('nuestra','contraparte','tercero','autoridad')),
  doc_type TEXT DEFAULT '',
  doc_number TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  counsel TEXT DEFAULT '',
  notes TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS docket (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  stage_id INTEGER REFERENCES case_stages(id) ON DELETE SET NULL,
  date TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'actuacion',
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  source TEXT NOT NULL DEFAULT 'interna',
  visibility TEXT NOT NULL DEFAULT 'interno' CHECK (visibility IN ('interno','cliente')),
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  stage_id INTEGER REFERENCES case_stages(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'otro',
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime TEXT DEFAULT '',
  size INTEGER DEFAULT 0,
  visibility TEXT NOT NULL DEFAULT 'interno' CHECK (visibility IN ('interno','cliente')),
  status TEXT NOT NULL DEFAULT 'recibido' CHECK (status IN ('recibido','en_revision','disponible','requiere_atencion')),
  version INTEGER NOT NULL DEFAULT 1,
  notes TEXT DEFAULT '',
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER REFERENCES cases(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'audiencia',
  start_at TEXT NOT NULL,
  end_at TEXT,
  all_day INTEGER NOT NULL DEFAULT 0,
  location TEXT DEFAULT '',
  responsible_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  source TEXT DEFAULT 'interna',
  status TEXT NOT NULL DEFAULT 'programado' CHECK (status IN ('programado','cumplido','vencido','cancelado')),
  visibility TEXT NOT NULL DEFAULT 'interno' CHECK (visibility IN ('interno','cliente')),
  notes TEXT DEFAULT '',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER REFERENCES cases(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_at TEXT,
  status TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','en_curso','hecha')),
  priority TEXT NOT NULL DEFAULT 'media' CHECK (priority IN ('alta','media','baja')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'interno' CHECK (visibility IN ('interno','cliente')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT DEFAULT '',
  reason TEXT DEFAULT '',
  message TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'nueva' CHECK (status IN ('nueva','en_contacto','convertida','descartada')),
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT DEFAULT '',
  ip TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  details TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_client ON cases(client_id);
CREATE INDEX IF NOT EXISTS idx_cases_resp ON cases(responsible_id);
CREATE INDEX IF NOT EXISTS idx_stage_case ON case_stages(case_id, position);
CREATE INDEX IF NOT EXISTS idx_docket_case ON docket(case_id, date);
CREATE INDEX IF NOT EXISTS idx_docs_case ON documents(case_id);
CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_at);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`;
db.exec(SCHEMA);

// ---- Helpers -------------------------------------------------------------
const stmtCache = new Map();
function prep(sql) {
  let s = stmtCache.get(sql);
  if (!s) { s = db.prepare(sql); stmtCache.set(sql, s); }
  return s;
}
const all = (sql, ...params) => prep(sql).all(...params);
const get = (sql, ...params) => prep(sql).get(...params);
const run = (sql, ...params) => prep(sql).run(...params);
const insert = (sql, ...params) => Number(prep(sql).run(...params).lastInsertRowid);
const transaction = (fn) => {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
};

function getSetting(key, fallback = '') {
  const row = get('SELECT value FROM settings WHERE key = ?', key);
  return row ? row.value : fallback;
}
function setSetting(key, value) {
  run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, String(value ?? ''));
}
function allSettings() {
  return Object.fromEntries(all('SELECT key, value FROM settings').map((r) => [r.key, r.value]));
}
function audit(userId, action, entity, entityId, details) {
  run('INSERT INTO audit_log(user_id,action,entity,entity_id,details) VALUES(?,?,?,?,?)',
    userId ?? null, action, entity, entityId ?? null, typeof details === 'string' ? details : JSON.stringify(details ?? {}));
}
function nextCaseRef(year = new Date().getFullYear()) {
  const row = get('SELECT ref FROM cases WHERE ref LIKE ? ORDER BY ref DESC LIMIT 1', `ARH-${year}-%`);
  const n = row ? parseInt(row.ref.split('-')[2], 10) + 1 : 1;
  return `ARH-${year}-${String(n).padStart(4, '0')}`;
}

module.exports = { db, all, get, run, insert, transaction, getSetting, setSetting, allSettings, audit, nextCaseRef, DATA_DIR, UPLOAD_DIR };
