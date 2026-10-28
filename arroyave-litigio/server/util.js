'use strict';
const crypto = require('node:crypto');

class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}
const badRequest = (m, extra) => new HttpError(400, m, extra);
const forbidden = (m = 'No tiene permiso para realizar esta acción.') => new HttpError(403, m);
const notFound = (m = 'No encontrado.') => new HttpError(404, m);

// Envuelve controladores async para que los errores lleguen al manejador global.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const str = (v, max = 4000) => (v === undefined || v === null ? '' : String(v)).trim().slice(0, max);
const int = (v, fallback = null) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : fallback; };
const num = (v) => { if (v === '' || v === null || v === undefined) return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const bool = (v) => (v === true || v === 1 || v === '1' || v === 'true' || v === 'on') ? 1 : 0;
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || '');
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
const isDateTime = (v) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(v || '');
const dateOrNull = (v) => (isDate(v) ? v : (isDateTime(v) ? v.slice(0, 10) : null));
const dateTimeOrNull = (v) => (isDateTime(v) ? v.slice(0, 16) : (isDate(v) ? v + 'T00:00' : null));
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
const today = () => new Date().toISOString().slice(0, 10);

function required(obj, fields) {
  const missing = fields.filter((f) => !str(obj[f]));
  if (missing.length) throw badRequest('Faltan campos obligatorios: ' + missing.join(', ') + '.', { fields: missing });
}

module.exports = { HttpError, badRequest, forbidden, notFound, wrap, str, int, num, bool, oneOf, isEmail, isDate, isDateTime, dateOrNull, dateTimeOrNull, randomToken, today, required };
