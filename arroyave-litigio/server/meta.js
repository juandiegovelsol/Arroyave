'use strict';
// Catálogos y plantillas del dominio jurídico colombiano. Editables por el despacho.

const AREAS = [
  { id: 'civil', label: 'Civil', description: 'Responsabilidad civil, contratos, obligaciones, procesos declarativos y ejecutivos.' },
  { id: 'comercial', label: 'Comercial', description: 'Sociedades, contratos mercantiles, títulos valores e insolvencia.' },
  { id: 'laboral', label: 'Laboral y seguridad social', description: 'Despidos, acreencias laborales, pensiones y conflictos con empleadores o fondos.' },
  { id: 'familia', label: 'Familia', description: 'Divorcio, custodia, alimentos, sucesiones y liquidación de sociedad conyugal.' },
  { id: 'penal', label: 'Penal', description: 'Defensa técnica y representación de víctimas en todas las etapas del proceso.' },
  { id: 'administrativo', label: 'Administrativo', description: 'Medios de control ante la jurisdicción contencioso-administrativa y actuaciones ante entidades públicas.' },
  { id: 'constitucional', label: 'Constitucional', description: 'Acciones de tutela, cumplimiento y protección de derechos fundamentales.' },
];

const PROCESS_TYPES = {
  civil: ['Verbal', 'Verbal sumario', 'Ejecutivo', 'Declarativo de pertenencia', 'Responsabilidad civil extracontractual', 'Restitución de inmueble', 'Otro'],
  comercial: ['Ejecutivo', 'Verbal', 'Reorganización / insolvencia', 'Arbitraje', 'Otro'],
  laboral: ['Ordinario laboral', 'Ejecutivo laboral', 'Fuero sindical', 'Reclamación administrativa', 'Otro'],
  familia: ['Divorcio', 'Custodia y alimentos', 'Sucesión', 'Liquidación de sociedad conyugal', 'Conciliación prejudicial', 'Otro'],
  penal: ['Defensa', 'Representación de víctimas', 'Querella', 'Otro'],
  administrativo: ['Nulidad y restablecimiento del derecho', 'Reparación directa', 'Controversias contractuales', 'Conciliación extrajudicial', 'Otro'],
  constitucional: ['Acción de tutela', 'Incidente de desacato', 'Acción de cumplimiento', 'Acción popular', 'Otro'],
};

const INSTANCES = [
  { id: 'prejudicial', label: 'Etapa prejudicial' },
  { id: 'primera', label: 'Primera instancia' },
  { id: 'segunda', label: 'Segunda instancia' },
  { id: 'casacion', label: 'Casación / extraordinario' },
  { id: 'ejecucion', label: 'Ejecución de la decisión' },
];

const CASE_STATUS = [
  { id: 'activo', label: 'Activo', tone: 'info' },
  { id: 'suspendido', label: 'Suspendido', tone: 'warning' },
  { id: 'terminado', label: 'Terminado', tone: 'success' },
  { id: 'archivado', label: 'Archivado', tone: 'neutral' },
];
const OUTCOMES = [
  { id: '', label: 'Sin decisión aún' },
  { id: 'favorable', label: 'Favorable' },
  { id: 'parcial', label: 'Parcialmente favorable' },
  { id: 'conciliado', label: 'Conciliado / acuerdo' },
  { id: 'desfavorable', label: 'Desfavorable' },
  { id: 'desistido', label: 'Desistido / retirado' },
];
const PRIORITIES = [{ id: 'alta', label: 'Alta' }, { id: 'media', label: 'Media' }, { id: 'baja', label: 'Baja' }];
const STAGE_STATUS = [
  { id: 'pendiente', label: 'Pendiente', tone: 'neutral' },
  { id: 'en_curso', label: 'En curso', tone: 'info' },
  { id: 'completada', label: 'Completada', tone: 'success' },
  { id: 'omitida', label: 'No aplica', tone: 'neutral' },
];
const PARTY_ROLES = ['Demandante', 'Demandado', 'Accionante', 'Accionado', 'Denunciante', 'Indiciado / procesado', 'Víctima', 'Tercero interviniente', 'Litisconsorte', 'Apoderado de la contraparte', 'Testigo', 'Perito', 'Ministerio Público', 'Juzgado / despacho', 'Entidad vinculada'];
const PARTY_SIDES = [
  { id: 'nuestra', label: 'Nuestra parte' },
  { id: 'contraparte', label: 'Contraparte' },
  { id: 'tercero', label: 'Tercero' },
  { id: 'autoridad', label: 'Autoridad' },
];
const DOCKET_KINDS = [
  { id: 'actuacion', label: 'Actuación del despacho' },
  { id: 'auto', label: 'Auto' },
  { id: 'notificacion', label: 'Notificación' },
  { id: 'memorial', label: 'Memorial radicado' },
  { id: 'audiencia', label: 'Audiencia' },
  { id: 'sentencia', label: 'Sentencia / fallo' },
  { id: 'recurso', label: 'Recurso' },
  { id: 'reunion', label: 'Reunión con cliente' },
  { id: 'nota', label: 'Nota interna' },
];
const DOCKET_SOURCES = [
  { id: 'interna', label: 'Registro interno' },
  { id: 'rama_judicial', label: 'Rama Judicial (consulta de procesos)' },
  { id: 'estado_electronico', label: 'Estado electrónico' },
  { id: 'correo', label: 'Correo electrónico' },
  { id: 'cliente', label: 'Aportado por el cliente' },
];
const DOC_CATEGORIES = [
  { id: 'poder', label: 'Poder' },
  { id: 'demanda', label: 'Demanda / escrito inicial' },
  { id: 'contestacion', label: 'Contestación' },
  { id: 'prueba', label: 'Prueba' },
  { id: 'auto', label: 'Auto / providencia' },
  { id: 'sentencia', label: 'Sentencia' },
  { id: 'recurso', label: 'Recurso' },
  { id: 'contrato', label: 'Contrato / acuerdo' },
  { id: 'identificacion', label: 'Identificación' },
  { id: 'comunicacion', label: 'Comunicación' },
  { id: 'otro', label: 'Otro' },
];
const DOC_STATUS = [
  { id: 'recibido', label: 'Recibido', tone: 'neutral' },
  { id: 'en_revision', label: 'En revisión', tone: 'info' },
  { id: 'disponible', label: 'Disponible', tone: 'success' },
  { id: 'requiere_atencion', label: 'Requiere atención', tone: 'danger' },
];
const EVENT_KINDS = [
  { id: 'audiencia', label: 'Audiencia' },
  { id: 'termino', label: 'Vencimiento de término' },
  { id: 'diligencia', label: 'Diligencia' },
  { id: 'reunion', label: 'Reunión' },
  { id: 'recordatorio', label: 'Recordatorio' },
];
const EVENT_STATUS = [
  { id: 'programado', label: 'Programado', tone: 'info' },
  { id: 'cumplido', label: 'Cumplido', tone: 'success' },
  { id: 'vencido', label: 'Vencido', tone: 'danger' },
  { id: 'cancelado', label: 'Cancelado', tone: 'neutral' },
];
const TASK_STATUS = [
  { id: 'pendiente', label: 'Pendiente', tone: 'warning' },
  { id: 'en_curso', label: 'En curso', tone: 'info' },
  { id: 'hecha', label: 'Hecha', tone: 'success' },
];
const LEAD_STATUS = [
  { id: 'nueva', label: 'Nueva', tone: 'warning' },
  { id: 'en_contacto', label: 'En contacto', tone: 'info' },
  { id: 'convertida', label: 'Convertida en cliente', tone: 'success' },
  { id: 'descartada', label: 'Descartada', tone: 'neutral' },
];
const TEAM_ROLES = ['Apoderado principal', 'Abogado sustituto', 'Abogado de apoyo', 'Asistente jurídico', 'Revisor'];
const DOC_TYPES = ['CC', 'CE', 'NIT', 'PAS', 'TI', 'PEP'];
const ROLES = [
  { id: 'admin', label: 'Administrador' },
  { id: 'abogado', label: 'Abogado' },
  { id: 'asistente', label: 'Asistente jurídico' },
  { id: 'cliente', label: 'Cliente' },
];

// Plantillas de etapas por tipo de proceso. Cada etapa puede asignarse a un abogado distinto.
const STAGE_TEMPLATES = {
  civil_verbal: { label: 'Civil · proceso verbal (CGP)', stages: [
    ['Estudio del caso y poder', 'Análisis de viabilidad, recaudo de pruebas iniciales y otorgamiento del poder.'],
    ['Presentación de la demanda', 'Radicación de la demanda con anexos ante el juzgado competente.'],
    ['Admisión y notificación', 'Auto admisorio y notificación personal o por aviso a la parte demandada.'],
    ['Contestación y excepciones', 'Traslado de la contestación; pronunciamiento sobre excepciones de mérito.'],
    ['Audiencia inicial (art. 372 CGP)', 'Conciliación, interrogatorios, saneamiento, fijación del litigio y decreto de pruebas.'],
    ['Audiencia de instrucción y juzgamiento (art. 373 CGP)', 'Práctica de pruebas, alegatos y sentencia.'],
    ['Sentencia y recursos', 'Lectura de la sentencia; apelación cuando proceda.'],
    ['Cumplimiento y cierre', 'Ejecución de la decisión, liquidación de costas y archivo.'],
  ] },
  civil_ejecutivo: { label: 'Civil / comercial · proceso ejecutivo', stages: [
    ['Estudio del título y poder', 'Verificación del título ejecutivo y de la exigibilidad de la obligación.'],
    ['Demanda y mandamiento de pago', 'Radicación y obtención del mandamiento ejecutivo.'],
    ['Medidas cautelares', 'Solicitud y registro de embargos o secuestros.'],
    ['Notificación', 'Notificación del mandamiento de pago a la parte ejecutada.'],
    ['Excepciones y traslado', 'Trámite de excepciones de mérito, si se proponen.'],
    ['Audiencia y sentencia', 'Decisión sobre excepciones u orden de seguir adelante la ejecución.'],
    ['Liquidación del crédito', 'Presentación y aprobación de la liquidación del crédito y costas.'],
    ['Remate y entrega', 'Avalúo, remate de bienes y entrega del producto.'],
  ] },
  laboral_ordinario: { label: 'Laboral · proceso ordinario (CPTSS)', stages: [
    ['Reclamación previa', 'Reclamación al empleador o entidad; agotamiento de la vía administrativa cuando aplica.'],
    ['Presentación de la demanda', 'Radicación de la demanda ante el juzgado laboral.'],
    ['Admisión y notificación', 'Auto admisorio y notificación a la parte demandada.'],
    ['Contestación', 'Traslado de la contestación y excepciones.'],
    ['Audiencia art. 77 CPTSS', 'Conciliación, decisión de excepciones previas, saneamiento y fijación del litigio.'],
    ['Audiencia de trámite y juzgamiento (art. 80)', 'Práctica de pruebas, alegatos y sentencia de primera instancia.'],
    ['Apelación o consulta', 'Trámite ante el Tribunal Superior, Sala Laboral.'],
    ['Cumplimiento y cierre', 'Liquidación, pago y archivo.'],
  ] },
  familia: { label: 'Familia · proceso con conciliación previa', stages: [
    ['Conciliación prejudicial', 'Audiencia de conciliación ante centro o comisaría de familia.'],
    ['Presentación de la demanda', 'Radicación ante el juzgado de familia.'],
    ['Admisión y notificación', 'Auto admisorio, notificación y medidas provisionales si proceden.'],
    ['Contestación', 'Traslado de la contestación de la demanda.'],
    ['Audiencia', 'Conciliación, pruebas y decisión en audiencia.'],
    ['Sentencia y recursos', 'Lectura de la sentencia; apelación cuando proceda.'],
    ['Cumplimiento y cierre', 'Registro de la decisión y archivo.'],
  ] },
  penal: { label: 'Penal · sistema acusatorio (Ley 906)', stages: [
    ['Noticia criminal / indagación', 'Denuncia o querella; actos urgentes y recaudo de elementos materiales probatorios.'],
    ['Formulación de imputación', 'Audiencia preliminar ante juez de control de garantías.'],
    ['Formulación de acusación', 'Escrito y audiencia de acusación ante juez de conocimiento.'],
    ['Audiencia preparatoria', 'Descubrimiento probatorio y decreto de pruebas.'],
    ['Juicio oral', 'Práctica de pruebas, alegatos y anuncio del sentido del fallo.'],
    ['Sentencia', 'Lectura de la sentencia e individualización de la pena.'],
    ['Recursos', 'Apelación ante el Tribunal Superior; casación cuando proceda.'],
  ] },
  tutela: { label: 'Constitucional · acción de tutela', stages: [
    ['Preparación y presentación', 'Elaboración de la acción y radicación por reparto.'],
    ['Admisión y vinculación', 'Auto admisorio y vinculación de las entidades accionadas.'],
    ['Contestación de la entidad', 'Traslado de la respuesta de la entidad accionada.'],
    ['Fallo de primera instancia', 'Decisión dentro de los diez días siguientes a la presentación.'],
    ['Impugnación', 'Impugnación y fallo de segunda instancia.'],
    ['Cumplimiento / desacato', 'Verificación del cumplimiento; incidente de desacato si es necesario.'],
  ] },
  administrativo: { label: 'Administrativo · medio de control (CPACA)', stages: [
    ['Conciliación extrajudicial', 'Solicitud ante la Procuraduría como requisito de procedibilidad.'],
    ['Presentación de la demanda', 'Radicación ante el juzgado o tribunal administrativo.'],
    ['Admisión y notificación', 'Auto admisorio y notificación a la entidad demandada.'],
    ['Contestación (30 días)', 'Traslado de la contestación, excepciones y llamamiento en garantía.'],
    ['Audiencia inicial (art. 180 CPACA)', 'Saneamiento, excepciones previas, fijación del litigio y decreto de pruebas.'],
    ['Audiencia de pruebas', 'Práctica de las pruebas decretadas.'],
    ['Alegatos y sentencia', 'Alegatos de conclusión y sentencia de primera instancia.'],
    ['Apelación', 'Trámite de segunda instancia.'],
  ] },
  generico: { label: 'Genérica · cuatro etapas', stages: [
    ['Apertura', 'Estudio del asunto, poder y planeación.'],
    ['Trámite', 'Actuaciones ante la autoridad competente.'],
    ['Decisión', 'Pronunciamiento de fondo y recursos.'],
    ['Cierre', 'Cumplimiento y archivo.'],
  ] },
};

const DEFAULT_TEMPLATE_BY_AREA = { civil: 'civil_verbal', comercial: 'civil_ejecutivo', laboral: 'laboral_ordinario', familia: 'familia', penal: 'penal', constitucional: 'tutela', administrativo: 'administrativo' };

const DEPARTMENTS = ['Amazonas', 'Antioquia', 'Arauca', 'Atlántico', 'Bogotá D.C.', 'Bolívar', 'Boyacá', 'Caldas', 'Caquetá', 'Casanare', 'Cauca', 'Cesar', 'Chocó', 'Córdoba', 'Cundinamarca', 'Guainía', 'Guaviare', 'Huila', 'La Guajira', 'Magdalena', 'Meta', 'Nariño', 'Norte de Santander', 'Putumayo', 'Quindío', 'Risaralda', 'San Andrés y Providencia', 'Santander', 'Sucre', 'Tolima', 'Valle del Cauca', 'Vaupés', 'Vichada'];

function publicMeta() {
  return {
    AREAS, PROCESS_TYPES, INSTANCES, CASE_STATUS, OUTCOMES, PRIORITIES, STAGE_STATUS, PARTY_ROLES, PARTY_SIDES, DOCKET_KINDS, DOCKET_SOURCES, DOC_CATEGORIES, DOC_STATUS, EVENT_KINDS, EVENT_STATUS, TASK_STATUS, LEAD_STATUS, TEAM_ROLES, DOC_TYPES, ROLES, DEPARTMENTS, DEFAULT_TEMPLATE_BY_AREA,
    STAGE_TEMPLATES: Object.fromEntries(Object.entries(STAGE_TEMPLATES).map(([k, v]) => [k, { label: v.label, stages: v.stages.map(([name, description]) => ({ name, description })) }])),
  };
}
const ids = (list) => list.map((x) => (typeof x === 'string' ? x : x.id));
module.exports = { AREAS, PROCESS_TYPES, INSTANCES, CASE_STATUS, OUTCOMES, PRIORITIES, STAGE_STATUS, PARTY_ROLES, PARTY_SIDES, DOCKET_KINDS, DOCKET_SOURCES, DOC_CATEGORIES, DOC_STATUS, EVENT_KINDS, EVENT_STATUS, TASK_STATUS, LEAD_STATUS, TEAM_ROLES, DOC_TYPES, ROLES, STAGE_TEMPLATES, DEFAULT_TEMPLATE_BY_AREA, DEPARTMENTS, publicMeta, ids };
