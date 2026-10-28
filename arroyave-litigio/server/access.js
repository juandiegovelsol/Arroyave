'use strict';
// Reglas de acceso por perfil y utilidades de fecha local (hora de Bogotá en el servidor).
const { get } = require('./db');
const { notFound } = require('./util');

const pad = (n) => String(n).padStart(2, '0');
function nowLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const todayLocal = () => nowLocal().slice(0, 10);
function addDays(dateStr, days) {
  const d = new Date(dateStr.slice(0, 10) + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const isClient = (u) => !!u && u.role === 'cliente';

// Fragmento SQL que limita los procesos visibles para un cliente. El personal ve todo el despacho.
function caseScope(user, alias = 'c') {
  if (isClient(user)) return { where: ` AND ${alias}.client_id = ? `, params: [user.client_id ?? -1] };
  return { where: '', params: [] };
}
// Fragmento para tablas con columna visibility.
function visibilityScope(user, alias) {
  return isClient(user) ? ` AND ${alias}.visibility = 'cliente' ` : '';
}

const CASE_SELECT = `
  SELECT c.*, cl.name AS client_name, cl.kind AS client_kind, u.name AS responsible_name,
    (SELECT s.name FROM case_stages s WHERE s.case_id = c.id AND s.status = 'en_curso' ORDER BY s.position LIMIT 1) AS current_stage,
    (SELECT COUNT(*) FROM case_stages s WHERE s.case_id = c.id) AS stage_count,
    (SELECT COUNT(*) FROM case_stages s WHERE s.case_id = c.id AND s.status = 'completada') AS stage_done
  FROM cases c
  LEFT JOIN clients cl ON cl.id = c.client_id
  LEFT JOIN users u ON u.id = c.responsible_id`;

function findCase(id, user) {
  const scope = caseScope(user);
  const row = get(`${CASE_SELECT} WHERE c.id = ? ${scope.where}`, id, ...scope.params);
  if (!row) throw notFound('El proceso no existe o no tiene acceso a él.');
  return row;
}

module.exports = { nowLocal, todayLocal, addDays, isClient, caseScope, visibilityScope, CASE_SELECT, findCase };
