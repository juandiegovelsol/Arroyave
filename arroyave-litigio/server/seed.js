'use strict';
// Crea el administrador inicial y, opcionalmente, un conjunto de datos de ejemplo.
// Todos los nombres, procesos y documentos de ejemplo son ficticios y deben reemplazarse antes de publicar.
try { process.loadEnvFile(require('node:path').join(__dirname, '..', '.env')); } catch { /* sin .env */ }
const fs = require('node:fs');
const path = require('node:path');
const { db, all, get, run, insert, transaction, getSetting, setSetting, nextCaseRef, UPLOAD_DIR } = require('./db');
const { hashPassword } = require('./auth');
const M = require('./meta');
const { todayLocal, addDays } = require('./access');

const DEFAULT_SETTINGS = {
  firm_name: 'Arroyave H. Litigio',
  firm_descriptor: 'Asesoría y representación judicial',
  firm_tagline: 'Claridad jurídica. Acompañamiento cercano.',
  firm_intro: 'Cada asunto merece ser escuchado. El primer paso es comprender su situación.',
  firm_about: 'Somos un despacho de familia. Llevamos el nombre Arroyave H. con la seriedad del ejercicio jurídico y con un trato cercano y comprensible para cada persona que confía en nosotros.',
  firm_about_2: 'Acompañamos procesos civiles, laborales, de familia, penales, administrativos y constitucionales ante juzgados y tribunales de distintas ciudades del país. Explicamos cada paso con claridad y mantenemos a nuestros clientes informados a través de una plataforma privada.',
  firm_address: '[Dirección por confirmar]',
  firm_city: '[Ciudad por confirmar], Colombia',
  firm_phone: '[Teléfono por confirmar]',
  firm_whatsapp: '',
  firm_email: '[correo por confirmar]',
  firm_hours: 'Lunes a viernes, 8:00 a. m. a 5:00 p. m.',
  firm_founded: '',
  site_show_success: '1',
  site_show_team: '1',
  site_show_stats: '1',
  demo_notice: '1',
  site_success_note: 'Los casos que presentamos se publican con autorización de los clientes y sin datos que permitan identificarlos. Cada asunto es distinto: los resultados anteriores no garantizan resultados futuros.',
};

function ensureAdmin() {
  Object.entries(DEFAULT_SETTINGS).forEach(([k, v]) => { if (get('SELECT 1 FROM settings WHERE key = ?', k) === undefined) setSetting(k, v); });
  if (get("SELECT id FROM users WHERE role = 'admin'")) return;
  const email = (process.env.ADMIN_EMAIL || 'admin@arroyaveh.co').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'Admin2026*';
  insert('INSERT INTO users(name,email,password_hash,role,title,is_public,sort_order,must_change_password) VALUES(?,?,?,?,?,?,?,?)', 'Administración', email, hashPassword(password), 'admin', 'Administración del despacho', 0, 1, 0);
  console.log(`Administrador creado: ${email}`);
}

// Genera un PDF mínimo válido con unas líneas de texto (documentos de ejemplo).
function makePdf(title, lines) {
  const esc = (s) => s.replace(/[\\()]/g, (c) => '\\' + c).replace(/[^\x20-\x7E]/g, (c) => ({ á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ñ: 'n', Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', Ñ: 'N' }[c] || '?'));
  const content = ['BT', '/F1 20 Tf 72 740 Td', `(${esc(title)}) Tj`, '/F1 11 Tf 0 -36 Td', ...lines.flatMap((l) => [`(${esc(l)}) Tj`, '0 -16 Td']), 'ET'].join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n'; const offsets = [];
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'binary');
}

function seedDemoIfEmpty() {
  if (process.env.SEED_DEMO === '0') return;
  if (get('SELECT COUNT(*) AS n FROM cases').n > 0 || getSetting('demo_seeded') === '1') return;
  seedDemo();
}

function seedDemo() {
  const today = todayLocal();
  const d = (n) => addDays(today, n);
  const PASS = hashPassword('Demo2026*');
  const CLIENT_PASS = hashPassword('Cliente2026*');

  transaction(() => {
    // ---- Equipo ---------------------------------------------------------
    const admin = get("SELECT * FROM users WHERE role = 'admin' ORDER BY id LIMIT 1");
    run('UPDATE users SET name=?,title=?,bio=?,phone=?,specialties=?,education=?,card_number=?,is_public=1,sort_order=1 WHERE id = ?',
      'Carolina Arroyave H.', 'Socia directora', 'Dirige el despacho y lleva personalmente los asuntos de familia y administrativos. Cree que cada decisión jurídica debe poder explicarse en una conversación tranquila.', '',
      JSON.stringify(['Familia', 'Administrativo', 'Negociación y conciliación']), 'Abogada. Especialista en Derecho de Familia.', '', admin.id);
    const U = { carolina: admin.id };
    U.andres = insert('INSERT INTO users(name,email,password_hash,role,title,bio,specialties,education,is_public,sort_order) VALUES(?,?,?,?,?,?,?,?,1,2)', 'Andrés Arroyave H.', 'andres@arroyaveh.co', PASS, 'abogado', 'Socio · Litigio civil y comercial', 'Representa a personas y empresas en procesos declarativos, ejecutivos y de responsabilidad civil. Prepara cada audiencia como si fuera la única.', JSON.stringify(['Civil', 'Comercial', 'Responsabilidad civil']), 'Abogado. Especialista en Derecho Procesal.');
    U.valentina = insert('INSERT INTO users(name,email,password_hash,role,title,bio,specialties,education,is_public,sort_order) VALUES(?,?,?,?,?,?,?,?,1,3)', 'Valentina Restrepo M.', 'valentina@arroyaveh.co', PASS, 'abogado', 'Abogada asociada · Laboral y seguridad social', 'Acompaña a trabajadores y empleadores en reclamaciones laborales, pensionales y de seguridad social, con énfasis en soluciones tempranas.', JSON.stringify(['Laboral', 'Seguridad social', 'Pensiones']), 'Abogada. Especialista en Derecho Laboral y Seguridad Social.');
    U.julian = insert('INSERT INTO users(name,email,password_hash,role,title,bio,specialties,education,is_public,sort_order) VALUES(?,?,?,?,?,?,?,?,1,4)', 'Julián Ocampo R.', 'julian@arroyaveh.co', PASS, 'abogado', 'Abogado asociado · Penal y constitucional', 'Defensa técnica, representación de víctimas y acciones constitucionales. Explica el proceso penal paso a paso y sin tecnicismos innecesarios.', JSON.stringify(['Penal', 'Constitucional', 'Tutela']), 'Abogado. Especialista en Derecho Penal y Criminología.');
    U.laura = insert('INSERT INTO users(name,email,password_hash,role,title,bio,specialties,is_public,sort_order) VALUES(?,?,?,?,?,?,?,1,5)', 'Laura Giraldo T.', 'laura@arroyaveh.co', PASS, 'asistente', 'Asistente jurídica', 'Organiza expedientes, radica memoriales y mantiene la agenda del despacho al día. Primer punto de contacto para los clientes.', JSON.stringify(['Gestión de expedientes', 'Vigilancia judicial']));

    // ---- Clientes -------------------------------------------------------
    const C = {};
    const client = (key, kind, name, docType, docNumber, email, phone, city, dep, contact = '') => { C[key] = insert('INSERT INTO clients(kind,name,doc_type,doc_number,email,phone,city,department,contact_name) VALUES(?,?,?,?,?,?,?,?,?)', kind, name, docType, docNumber, email, phone, city, dep, contact); };
    client('maria', 'natural', 'María Fernanda López Cardona', 'CC', '43.812.550', 'cliente@ejemplo.co', '300 000 0001', 'Medellín', 'Antioquia');
    client('norte', 'juridica', 'Inversiones del Norte S.A.S.', 'NIT', '900.123.456-7', 'cliente2@ejemplo.co', '601 000 0002', 'Bogotá', 'Bogotá D.C.', 'Jorge Mesa (gerente)');
    client('carlos', 'natural', 'Carlos Andrés Múnera Vélez', 'CC', '71.330.912', 'carlos.munera@ejemplo.co', '310 000 0003', 'Envigado', 'Antioquia');
    client('alameda', 'juridica', 'Constructora Alameda Ltda.', 'NIT', '811.222.333-1', 'juridica@alameda-ejemplo.co', '604 000 0004', 'Medellín', 'Antioquia', 'Patricia Rendón (directora administrativa)');
    client('luz', 'natural', 'Luz Dary Hernández Ospina', 'CC', '32.110.780', 'luzdary@ejemplo.co', '311 000 0005', 'Rionegro', 'Antioquia');
    client('laceja', 'juridica', 'Transportes La Ceja S.A.S.', 'NIT', '901.555.777-2', 'gerencia@laceja-ejemplo.co', '604 000 0006', 'La Ceja', 'Antioquia', 'Óscar Valencia (gerente)');
    client('pedro', 'natural', 'Pedro José Ramírez Duque', 'CC', '79.456.123', 'pedro.ramirez@ejemplo.co', '315 000 0007', 'Bogotá', 'Bogotá D.C.');
    client('ana', 'natural', 'Ana Lucía Betancur Mejía', 'CC', '66.789.012', 'analucia@ejemplo.co', '316 000 0008', 'Cali', 'Valle del Cauca');
    client('solyluna', 'juridica', 'Distribuidora Sol y Luna S.A.S.', 'NIT', '802.444.555-9', 'legal@solyluna-ejemplo.co', '605 000 0009', 'Barranquilla', 'Atlántico', 'Mónica Pérez (representante legal)');
    client('hernando', 'natural', 'Hernando Castaño Giraldo', 'CC', '10.234.567', 'hernando.castano@ejemplo.co', '312 000 0010', 'Manizales', 'Caldas');
    client('caminos', 'juridica', 'Fundación Caminos', 'NIT', '900.888.999-3', 'direccion@caminos-ejemplo.org', '604 000 0011', 'Medellín', 'Antioquia', 'Esteban Ruiz (director)');
    client('sandra', 'natural', 'Sandra Milena Ortiz Arango', 'CC', '43.998.112', 'sandra.ortiz@ejemplo.co', '313 000 0012', 'Bello', 'Antioquia');

    // Accesos de clientes a la plataforma
    insert('INSERT INTO users(name,email,password_hash,role,client_id) VALUES(?,?,?,?,?)', 'María Fernanda López', 'cliente@ejemplo.co', CLIENT_PASS, 'cliente', C.maria);
    insert('INSERT INTO users(name,email,password_hash,role,client_id) VALUES(?,?,?,?,?)', 'Jorge Mesa · Inversiones del Norte', 'cliente2@ejemplo.co', CLIENT_PASS, 'cliente', C.norte);

    // ---- Procesos -------------------------------------------------------
    const pdf = (caseId, title, category, visibility, status, uploadedBy, lines, stageId = null, daysAgo = 10) => {
      const stored = `demo-${caseId}-${Math.random().toString(36).slice(2, 8)}.pdf`;
      const buf = makePdf(title, ['Documento de ejemplo generado automaticamente.', 'No corresponde a un expediente real.', '', ...lines]);
      fs.writeFileSync(path.join(UPLOAD_DIR, stored), buf);
      insert('INSERT INTO documents(case_id,stage_id,title,category,original_name,stored_name,mime,size,visibility,status,uploaded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', caseId, stageId, title, category, title.replace(/[^\w\sáéíóúñ-]/gi, '').replace(/\s+/g, '_') + '.pdf', stored, 'application/pdf', buf.length, visibility, status, uploadedBy, d(-daysAgo) + ' 15:00:00');
    };

    let refYear = {};
    const mkRef = (year) => { refYear[year] = (refYear[year] || 0) + 1; return `ARH-${year}-${String(refYear[year]).padStart(4, '0')}`; };

    function createCase(o) {
      const opened = o.opened; const year = opened.slice(0, 4);
      const id = insert(`INSERT INTO cases(ref,radicado,title,area,process_type,instance,status,outcome,priority,client_id,responsible_id,city,department,court,judge,amount,description,next_action,next_action_due,opened_at,closed_at,featured,public_title,public_summary,created_by,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        mkRef(year), o.radicado || '', o.title, o.area, o.type, o.instance || 'primera', o.status || 'activo', o.outcome || '', o.priority || 'media', o.client, o.lawyer, o.city, o.dep, o.court || '', o.judge || '', o.amount ?? null, o.description || '', o.next || '', o.nextDue || null, opened, o.closed || null, o.featured ? 1 : 0, o.publicTitle || '', o.publicSummary || '', U.carolina, opened + ' 14:00:00', (o.closed || d(-(o.updatedAgo ?? 1))) + ' 17:00:00');
      run('INSERT INTO case_team(case_id,user_id,role_in_case) VALUES(?,?,?)', id, o.lawyer, 'Apoderado principal');
      (o.team || []).forEach(([uid, role]) => run('INSERT OR IGNORE INTO case_team(case_id,user_id,role_in_case) VALUES(?,?,?)', id, uid, role));
      // Etapas desde plantilla, con avance y abogados por etapa.
      const tpl = M.STAGE_TEMPLATES[o.template];
      const done = o.done ?? 0; const total = tpl.stages.length;
      const closed = ['terminado', 'archivado'].includes(o.status);
      const span = closed ? Math.max(30, Math.round((new Date(o.closed) - new Date(opened)) / 86400000)) : Math.max(20, Math.round((new Date(today) - new Date(opened)) / 86400000));
      const stageIds = [];
      tpl.stages.forEach(([name, description], i) => {
        const lawyer = (o.stageLawyers && o.stageLawyers[i]) || o.lawyer;
        let status = 'pendiente', started = null, completed = null, due = null;
        const stepDays = Math.round(span / (closed ? total : done + 2));
        if (closed) { status = i < total - 1 || o.status === 'terminado' ? 'completada' : 'completada'; started = addDays(opened, stepDays * i); completed = i === total - 1 ? o.closed : addDays(opened, stepDays * (i + 1)); }
        else if (i < done) { status = 'completada'; started = addDays(opened, stepDays * i); completed = addDays(opened, stepDays * (i + 1)); }
        else if (i === done) { status = 'en_curso'; started = addDays(opened, stepDays * i); due = o.stageDue ? d(o.stageDue) : null; }
        if (o.status === 'archivado' && o.outcome === 'desistido' && i >= (o.done ?? 0)) { status = i === (o.done ?? 0) ? 'omitida' : 'omitida'; started = null; completed = null; }
        const sid = insert('INSERT INTO case_stages(case_id,position,name,description,status,lawyer_id,started_at,due_at,completed_at) VALUES(?,?,?,?,?,?,?,?,?)', id, i + 1, name, description, status, lawyer, started, due, completed);
        stageIds.push(sid);
        if (status === 'completada') run('INSERT INTO docket(case_id,stage_id,date,kind,title,description,source,visibility,user_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)', id, sid, completed, i === 0 ? 'nota' : 'actuacion', `Etapa completada: ${name}`, description, 'interna', 'cliente', lawyer, completed + ' 21:00:00');
      });
      run('INSERT INTO docket(case_id,date,kind,title,description,source,visibility,user_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)', id, opened, 'nota', 'Apertura del proceso', 'Proceso creado en la plataforma.', 'interna', 'cliente', U.laura, opened + ' 13:30:00');
      (o.parties || []).forEach(([name, role, side, counsel]) => insert('INSERT INTO case_parties(case_id,name,role,side,counsel) VALUES(?,?,?,?,?)', id, name, role, side, counsel || ''));
      (o.docket || []).forEach(([daysAgo, kind, title, description, source, visibility, who]) => insert('INSERT INTO docket(case_id,stage_id,date,kind,title,description,source,visibility,user_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)', id, stageIds[Math.min(done, total - 1)], d(-daysAgo), kind, title, description, source || 'interna', visibility || 'interno', who || o.lawyer, d(-daysAgo) + ' 20:00:00'));
      (o.events || []).forEach(([days, time, kind, title, location, status, visibility, who]) => insert('INSERT INTO events(case_id,title,kind,start_at,end_at,location,responsible_id,status,visibility,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)', id, title, kind, `${d(days)}T${time}`, null, location || '', who || o.lawyer, status || 'programado', visibility || 'interno', U.laura));
      (o.tasks || []).forEach(([days, title, who, status, priority]) => insert('INSERT INTO tasks(case_id,title,assigned_to,due_at,status,priority,created_by) VALUES(?,?,?,?,?,?,?)', id, title, who, d(days), status || 'pendiente', priority || 'media', o.lawyer));
      (o.messages || []).forEach(([daysAgo, who, body, visibility]) => insert('INSERT INTO messages(case_id,author_id,body,visibility,created_at) VALUES(?,?,?,?,?)', id, who, body, visibility || 'interno', d(-daysAgo) + ' 21:00:00'));
      (o.docs || []).forEach(([title, category, visibility, status, who, lines, daysAgo]) => pdf(id, title, category, visibility, status, who || U.laura, lines || [], null, daysAgo ?? 10));
      return id;
    }

    // Casos terminados y destacados (se muestran en el sitio público, de forma anónima).
    createCase({ title: 'Responsabilidad civil extracontractual — accidente de tránsito', area: 'civil', type: 'Responsabilidad civil extracontractual', template: 'civil_verbal', status: 'terminado', outcome: 'favorable', client: C.maria, lawyer: U.andres, city: 'Medellín', dep: 'Antioquia', court: 'Juzgado 12 Civil del Circuito de Medellín', radicado: '05001310301220240021500', opened: '2024-03-11', closed: '2026-06-18', amount: 185000000, featured: true,
      publicTitle: 'Indemnización integral tras un accidente de tránsito', publicSummary: 'Representamos a una persona que sufrió lesiones en un accidente de tránsito. Tras la audiencia de instrucción y juzgamiento, el juzgado declaró la responsabilidad del conductor y de la aseguradora y ordenó el pago de los perjuicios materiales, el lucro cesante y el daño moral reclamados. La decisión quedó en firme sin necesidad de segunda instancia.',
      description: 'Lesiones por colisión en la autopista Norte. Se reclamó daño emergente, lucro cesante y perjuicios morales.', stageLawyers: { 0: U.laura, 4: U.carolina },
      parties: [['María Fernanda López Cardona', 'Demandante', 'nuestra'], ['Conductor (reservado)', 'Demandado', 'contraparte', 'Gómez & Asociados'], ['Aseguradora (reservado)', 'Demandado', 'contraparte', 'Área jurídica de la aseguradora']],
      events: [[-130, '09:00', 'audiencia', 'Audiencia de instrucción y juzgamiento', 'Juzgado 12 Civil del Circuito, sala 3', 'cumplido', 'cliente']],
      docs: [['Poder especial', 'poder', 'cliente', 'disponible', U.laura, ['Poder otorgado al despacho para la representacion judicial.'], 800], ['Sentencia de primera instancia', 'sentencia', 'cliente', 'disponible', U.andres, ['Sentencia que declara la responsabilidad y ordena el pago de perjuicios.'], 126]],
      messages: [[125, U.andres, 'Le compartimos la sentencia. Ya está disponible en la sección de documentos. Con gusto la revisamos juntos en una llamada.', 'cliente']] });

    createCase({ title: 'Contrato realidad y acreencias laborales', area: 'laboral', type: 'Ordinario laboral', template: 'laboral_ordinario', status: 'terminado', outcome: 'favorable', client: C.pedro, lawyer: U.valentina, city: 'Bogotá', dep: 'Bogotá D.C.', court: 'Juzgado 23 Laboral del Circuito de Bogotá', radicado: '11001310502320230038900', opened: '2023-09-04', closed: '2026-03-27', amount: 64000000, featured: true,
      publicTitle: 'Reconocimiento de contrato realidad y pago de prestaciones', publicSummary: 'Acompañamos a un trabajador vinculado durante años mediante contratos de prestación de servicios. El juzgado declaró la existencia de un contrato de trabajo, ordenó el pago de prestaciones sociales, vacaciones y la sanción moratoria, y la decisión fue confirmada en segunda instancia.',
      stageLawyers: { 0: U.laura, 6: U.carolina },
      parties: [['Pedro José Ramírez Duque', 'Demandante', 'nuestra'], ['Empresa contratante (reservado)', 'Demandado', 'contraparte']],
      docs: [['Sentencia de segunda instancia', 'sentencia', 'cliente', 'disponible', U.valentina, ['Confirma la sentencia de primera instancia.'], 210]] });

    createCase({ title: 'Custodia compartida y cuota de alimentos', area: 'familia', type: 'Custodia y alimentos', template: 'familia', status: 'terminado', outcome: 'conciliado', client: C.carlos, lawyer: U.carolina, city: 'Envigado', dep: 'Antioquia', court: 'Comisaría Primera de Familia de Envigado', opened: '2025-07-15', closed: '2025-11-20', featured: true,
      publicTitle: 'Acuerdo de custodia compartida sin llegar a juicio', publicSummary: 'En un conflicto familiar con dos menores de edad, orientamos a nuestro cliente hacia una conciliación con la otra parte. El acuerdo fijó la custodia compartida, el régimen de visitas y una cuota de alimentos proporcional, evitando un proceso judicial largo y protegiendo la relación entre los padres y los niños.',
      stageLawyers: { 0: U.valentina },
      parties: [['Carlos Andrés Múnera Vélez', 'Accionante', 'nuestra'], ['Madre de los menores (reservado)', 'Accionado', 'contraparte']] });

    createCase({ title: 'Acción de tutela — autorización de tratamiento médico', area: 'constitucional', type: 'Acción de tutela', template: 'tutela', status: 'terminado', outcome: 'favorable', client: C.luz, lawyer: U.julian, city: 'Rionegro', dep: 'Antioquia', court: 'Juzgado 2 Civil Municipal de Rionegro', radicado: '05615400300220260014300', opened: '2026-07-21', closed: '2026-08-14', featured: true, instance: 'primera',
      publicTitle: 'Protección del derecho a la salud en diez días', publicSummary: 'Una paciente llevaba meses esperando la autorización de un tratamiento ordenado por su médico tratante. Presentamos una acción de tutela y el juzgado ordenó a la entidad de salud autorizar y garantizar el tratamiento integral en un plazo de 48 horas. El fallo no fue impugnado.',
      parties: [['Luz Dary Hernández Ospina', 'Accionante', 'nuestra'], ['Entidad promotora de salud (reservado)', 'Accionado', 'contraparte']],
      docs: [['Fallo de tutela', 'sentencia', 'cliente', 'disponible', U.julian, ['Ampara el derecho fundamental a la salud.'], 69]] });

    createCase({ title: 'Cobro ejecutivo de facturas de venta', area: 'comercial', type: 'Ejecutivo', template: 'civil_ejecutivo', status: 'terminado', outcome: 'favorable', client: C.norte, lawyer: U.andres, city: 'Medellín', dep: 'Antioquia', court: 'Juzgado 8 Civil Municipal de Medellín', radicado: '05001400300820250042100', opened: '2025-02-10', closed: '2026-01-30', amount: 92000000, featured: true,
      publicTitle: 'Recuperación completa de cartera comercial', publicSummary: 'Una empresa acumulaba facturas sin pagar por parte de un distribuidor. Iniciamos un proceso ejecutivo con medidas cautelares sobre cuentas bancarias; el deudor no propuso excepciones y el juzgado ordenó seguir adelante la ejecución. El capital, los intereses y las costas fueron recuperados en su totalidad.',
      stageLawyers: { 2: U.laura, 6: U.laura },
      parties: [['Inversiones del Norte S.A.S.', 'Demandante', 'nuestra'], ['Distribuidor (reservado)', 'Demandado', 'contraparte']],
      docs: [['Liquidación del crédito aprobada', 'auto', 'cliente', 'disponible', U.laura, ['Auto que aprueba la liquidacion del credito y las costas.'], 270]] });

    createCase({ title: 'Nulidad y restablecimiento del derecho — desvinculación sin motivación', area: 'administrativo', type: 'Nulidad y restablecimiento del derecho', template: 'administrativo', status: 'terminado', outcome: 'parcial', client: C.hernando, lawyer: U.carolina, city: 'Manizales', dep: 'Caldas', court: 'Juzgado 3 Administrativo de Manizales', radicado: '17001333300320230019800', opened: '2023-05-08', closed: '2025-09-12', featured: true, instance: 'segunda',
      publicTitle: 'Reintegro de un servidor público desvinculado sin motivación', publicSummary: 'Un servidor en provisionalidad fue retirado del cargo mediante un acto sin motivación. El tribunal declaró la nulidad del acto y ordenó el reintegro; el reconocimiento económico se concedió de forma parcial, descontando los periodos en que el cliente tuvo otros ingresos, conforme a la jurisprudencia vigente.',
      parties: [['Hernando Castaño Giraldo', 'Demandante', 'nuestra'], ['Entidad territorial (reservado)', 'Demandado', 'contraparte'], ['Procuraduría delegada', 'Ministerio Público', 'autoridad']] });

    createCase({ title: 'Defensa penal — preclusión por atipicidad', area: 'penal', type: 'Defensa', template: 'penal', status: 'terminado', outcome: 'favorable', client: C.ana, lawyer: U.julian, city: 'Cali', dep: 'Valle del Cauca', court: 'Juzgado 5 Penal del Circuito de Cali', radicado: '76001600000020240112300', opened: '2024-08-19', closed: '2026-05-06', featured: true,
      publicTitle: 'Preclusión de una investigación por atipicidad de la conducta', publicSummary: 'Nuestra cliente fue vinculada a una investigación por un presunto delito contra el patrimonio económico. Demostramos que los hechos correspondían a un incumplimiento contractual sin relevancia penal. La Fiscalía solicitó la preclusión y el juez la decretó, cerrando definitivamente la investigación.',
      parties: [['Ana Lucía Betancur Mejía', 'Indiciado / procesado', 'nuestra'], ['Fiscalía 14 Seccional', 'Entidad vinculada', 'autoridad'], ['Denunciante (reservado)', 'Denunciante', 'contraparte']] });

    // Procesos activos
    createCase({ title: 'Incumplimiento de contrato de obra civil', area: 'civil', type: 'Verbal', template: 'civil_verbal', status: 'activo', client: C.alameda, lawyer: U.andres, city: 'Medellín', dep: 'Antioquia', court: 'Juzgado 4 Civil del Circuito de Medellín', radicado: '05001310300420260031200', opened: d(-150), amount: 310000000, priority: 'alta', done: 3, stageDue: 14, updatedAgo: 0,
      description: 'El contratista abandonó la obra con un avance del 60 %. Se reclama la terminación del contrato, la cláusula penal y los perjuicios.', next: 'Preparar interrogatorio de parte y pliego de preguntas para la audiencia inicial', nextDue: d(6),
      stageLawyers: { 0: U.laura, 3: U.carolina }, team: [[U.laura, 'Asistente jurídico'], [U.carolina, 'Revisor']],
      parties: [['Constructora Alameda Ltda.', 'Demandante', 'nuestra'], ['Obras y Diseños del Valle S.A.S.', 'Demandado', 'contraparte', 'Restrepo Abogados'], ['Aseguradora de cumplimiento', 'Litisconsorte', 'tercero']],
      docket: [[2, 'auto', 'Auto fija fecha de audiencia inicial', 'El juzgado fija audiencia inicial del art. 372 CGP y ordena la comparecencia personal de las partes.', 'estado_electronico', 'cliente'], [9, 'notificacion', 'Traslado de la contestación', 'Se corre traslado de las excepciones de mérito por 5 días.', 'rama_judicial', 'cliente'], [8, 'memorial', 'Pronunciamiento sobre excepciones', 'Se radicó el escrito que descorre el traslado y solicita pruebas adicionales.', 'interna', 'interno']],
      events: [[12, '09:00', 'audiencia', 'Audiencia inicial (art. 372 CGP)', 'Juzgado 4 Civil del Circuito de Medellín, sala 2', 'programado', 'cliente'], [5, '17:00', 'termino', 'Vence término para aportar dictamen pericial', '', 'programado', 'interno']],
      tasks: [[4, 'Coordinar con el perito la entrega del dictamen', U.laura, 'en_curso', 'alta'], [6, 'Preparar interrogatorio de parte', U.andres, 'pendiente', 'alta'], [10, 'Confirmar asistencia del representante legal a la audiencia', U.laura]],
      messages: [[3, U.andres, 'Recibimos el auto que fija fecha para la audiencia inicial. Le explicamos en una llamada qué debe esperar ese día.', 'cliente'], [2, U.laura, 'Pendiente confirmar la disponibilidad del perito antes del viernes.', 'interno']],
      docs: [['Poder especial', 'poder', 'cliente', 'disponible', U.laura, ['Poder para representar a la constructora.'], 150], ['Demanda y anexos', 'demanda', 'cliente', 'disponible', U.andres, ['Demanda verbal por incumplimiento contractual.'], 120], ['Contestación de la demanda', 'contestacion', 'interno', 'en_revision', U.laura, ['Contestacion presentada por la parte demandada.'], 9]] });

    createCase({ title: 'Despido sin justa causa — indemnización y salarios', area: 'laboral', type: 'Ordinario laboral', template: 'laboral_ordinario', status: 'activo', client: C.sandra, lawyer: U.valentina, city: 'Bello', dep: 'Antioquia', court: 'Juzgado 1 Laboral del Circuito de Bello', opened: d(-48), amount: 38000000, done: 1, stageDue: 3, updatedAgo: 1,
      description: 'Terminación del contrato sin justa causa tras ocho años de servicio. Se reclama indemnización, salarios adeudados y sanción moratoria.', next: 'Radicar la demanda con anexos', nextDue: d(3),
      stageLawyers: { 0: U.laura }, team: [[U.laura, 'Asistente jurídico']],
      parties: [['Sandra Milena Ortiz Arango', 'Demandante', 'nuestra'], ['Comercializadora del Valle de Aburrá S.A.S.', 'Demandado', 'contraparte']],
      events: [[3, '16:00', 'termino', 'Fecha límite interna para radicar la demanda', '', 'programado', 'interno']],
      tasks: [[1, 'Revisar liquidación final y certificados laborales', U.valentina, 'en_curso', 'alta'], [2, 'Solicitar al cliente los desprendibles de nómina faltantes', U.laura, 'pendiente', 'media']],
      messages: [[5, U.valentina, 'Necesitamos un documento adicional para continuar: los desprendibles de nómina de los últimos tres meses. Puede subirlos en la sección de documentos.', 'cliente']],
      docs: [['Carta de terminación del contrato', 'prueba', 'cliente', 'disponible', U.laura, ['Carta de terminacion aportada por la clienta.'], 40]] });

    createCase({ title: 'Cobro ejecutivo de pagaré', area: 'comercial', type: 'Ejecutivo', template: 'civil_ejecutivo', status: 'activo', client: C.norte, lawyer: U.andres, city: 'Bogotá', dep: 'Bogotá D.C.', court: 'Juzgado 31 Civil Municipal de Bogotá', radicado: '11001400303120260088700', opened: d(-95), amount: 145000000, done: 2, stageDue: 20, updatedAgo: 2,
      description: 'Pagaré por 145 millones vencido y sin pago. Mandamiento de pago librado; en trámite medidas cautelares.', next: 'Verificar respuesta de los bancos a los oficios de embargo', nextDue: d(7),
      stageLawyers: { 2: U.laura, 6: U.laura }, team: [[U.laura, 'Asistente jurídico']],
      parties: [['Inversiones del Norte S.A.S.', 'Demandante', 'nuestra'], ['Comercial Andina Ltda.', 'Demandado', 'contraparte']],
      docket: [[6, 'auto', 'Auto decreta embargo de cuentas bancarias', 'Se decreta el embargo y retención de dineros en cuentas del demandado.', 'rama_judicial', 'cliente'], [4, 'memorial', 'Oficios de embargo enviados a entidades bancarias', '', 'interna', 'interno', U.laura]],
      events: [[20, '08:30', 'diligencia', 'Diligencia de notificación personal', 'Oficina de la parte demandada', 'programado', 'interno']],
      tasks: [[7, 'Hacer seguimiento a respuesta de bancos', U.laura, 'pendiente', 'media']],
      messages: [[4, U.andres, 'El juzgado decretó el embargo de cuentas. Le informaremos cuando los bancos confirmen la retención.', 'cliente']],
      docs: [['Mandamiento de pago', 'auto', 'cliente', 'disponible', U.laura, ['Auto que libra mandamiento ejecutivo.'], 60]] });

    createCase({ title: 'Acción de tutela — negación de medicamento', area: 'constitucional', type: 'Acción de tutela', template: 'tutela', status: 'activo', client: C.luz, lawyer: U.julian, city: 'Medellín', dep: 'Antioquia', court: 'Juzgado 15 Civil Municipal de Medellín', radicado: '05001400301520260112900', opened: d(-6), priority: 'alta', done: 2, stageDue: 4, updatedAgo: 0,
      description: 'La EPS negó la entrega de un medicamento no incluido en el plan de beneficios, pese a la orden del médico tratante.', next: 'Vigilar el vencimiento del término para fallar', nextDue: d(4),
      parties: [['Luz Dary Hernández Ospina', 'Accionante', 'nuestra'], ['Entidad promotora de salud', 'Accionado', 'contraparte']],
      docket: [[4, 'auto', 'Auto admite la tutela y vincula a la EPS', 'Se concede a la entidad dos días para responder.', 'estado_electronico', 'cliente'], [1, 'notificacion', 'Respuesta de la EPS', 'La entidad alega que el medicamento requiere trámite ante el Comité Técnico Científico.', 'correo', 'interno']],
      events: [[4, '17:00', 'termino', 'Vence término de 10 días para el fallo de tutela', '', 'programado', 'cliente']],
      tasks: [[1, 'Preparar escrito de pronunciamiento sobre la respuesta de la EPS', U.julian, 'en_curso', 'alta']],
      docs: [['Orden médica y negación de la EPS', 'prueba', 'cliente', 'disponible', U.laura, ['Orden del medico tratante y respuesta negativa de la EPS.'], 6]] });

    createCase({ title: 'Divorcio contencioso y liquidación de sociedad conyugal', area: 'familia', type: 'Divorcio', template: 'familia', status: 'activo', client: C.carlos, lawyer: U.carolina, city: 'Envigado', dep: 'Antioquia', court: 'Juzgado 2 de Familia de Envigado', radicado: '05266311000220260025600', opened: d(-120), done: 3, stageDue: 25, updatedAgo: 3,
      description: 'Divorcio por la causal de separación de hecho por más de dos años. Se discute la liquidación de un inmueble y un vehículo.', next: 'Solicitar avalúo del inmueble', nextDue: d(10),
      stageLawyers: { 0: U.valentina }, team: [[U.valentina, 'Abogado sustituto']],
      parties: [['Carlos Andrés Múnera Vélez', 'Demandante', 'nuestra'], ['Cónyuge (reservado)', 'Demandado', 'contraparte', 'Defensoría del Pueblo']],
      events: [[25, '10:00', 'audiencia', 'Audiencia de conciliación, pruebas y fallo', 'Juzgado 2 de Familia de Envigado', 'programado', 'cliente']],
      tasks: [[10, 'Contratar avalúo comercial del inmueble', U.laura, 'pendiente', 'media']],
      docs: [['Registro civil de matrimonio', 'identificacion', 'cliente', 'disponible', U.laura, ['Copia del registro civil de matrimonio.'], 110]] });

    createCase({ title: 'Representación de víctima — lesiones personales', area: 'penal', type: 'Representación de víctimas', template: 'penal', status: 'activo', client: C.ana, lawyer: U.julian, city: 'Cali', dep: 'Valle del Cauca', court: 'Juzgado 9 Penal Municipal con Función de Control de Garantías de Cali', radicado: '76001600000020260045100', opened: d(-70), done: 1, stageDue: 20, updatedAgo: 4,
      description: 'Lesiones personales con incapacidad de 45 días. Se acompaña a la víctima durante la imputación y se prepara el incidente de reparación integral.', next: 'Asistir a la audiencia de formulación de imputación', nextDue: d(20),
      parties: [['Ana Lucía Betancur Mejía', 'Víctima', 'nuestra'], ['Fiscalía 22 Local', 'Entidad vinculada', 'autoridad'], ['Indiciado (reservado)', 'Indiciado / procesado', 'contraparte', 'Defensor público']],
      events: [[20, '14:00', 'audiencia', 'Audiencia de formulación de imputación', 'Complejo judicial de Cali, sala 7', 'programado', 'cliente']],
      tasks: [[15, 'Reunir soportes de gastos médicos para el incidente de reparación', U.laura, 'pendiente', 'media']] });

    createCase({ title: 'Reparación directa — falla en el servicio médico', area: 'administrativo', type: 'Reparación directa', template: 'administrativo', status: 'activo', client: C.pedro, lawyer: U.carolina, city: 'Bogotá', dep: 'Bogotá D.C.', court: 'Procuraduría 120 Judicial I para Asuntos Administrativos', opened: d(-30), amount: 420000000, done: 0, stageDue: 9, updatedAgo: 1,
      description: 'Daño derivado de una cirugía en un hospital público. Etapa de conciliación extrajudicial como requisito de procedibilidad.', next: 'Audiencia de conciliación ante la Procuraduría', nextDue: d(9),
      parties: [['Pedro José Ramírez Duque', 'Demandante', 'nuestra'], ['Hospital público (reservado)', 'Demandado', 'contraparte'], ['Procuraduría 120 Judicial', 'Ministerio Público', 'autoridad']],
      events: [[9, '09:30', 'audiencia', 'Audiencia de conciliación extrajudicial', 'Procuraduría General de la Nación, sede Bogotá', 'programado', 'cliente']],
      tasks: [[5, 'Obtener historia clínica completa', U.laura, 'en_curso', 'alta'], [8, 'Elaborar propuesta de fórmula conciliatoria', U.carolina, 'pendiente', 'media']] });

    createCase({ title: 'Impugnación de acta de asamblea de accionistas', area: 'comercial', type: 'Verbal', template: 'civil_verbal', status: 'activo', client: C.solyluna, lawyer: U.andres, city: 'Barranquilla', dep: 'Atlántico', court: 'Superintendencia de Sociedades — Delegatura de Procedimientos Mercantiles', opened: d(-40), priority: 'alta', done: 1, stageDue: 8, updatedAgo: 2,
      description: 'Decisiones adoptadas sin el quórum estatutario. Se solicita la nulidad de las decisiones y la suspensión provisional.', next: 'Radicar solicitud de medida cautelar de suspensión', nextDue: d(2),
      team: [[U.carolina, 'Revisor']],
      parties: [['Distribuidora Sol y Luna S.A.S. (accionista minoritario)', 'Demandante', 'nuestra'], ['Sociedad y accionistas mayoritarios (reservado)', 'Demandado', 'contraparte', 'Barrios & Cía.']],
      events: [[2, '12:00', 'termino', 'Radicar solicitud de suspensión provisional', '', 'programado', 'interno']],
      tasks: [[2, 'Finalizar escrito de medida cautelar', U.andres, 'en_curso', 'alta']] });

    createCase({ title: 'Pensión de sobrevivientes — reclamación ante el fondo', area: 'laboral', type: 'Reclamación administrativa', template: 'laboral_ordinario', status: 'activo', client: C.hernando, lawyer: U.valentina, city: 'Manizales', dep: 'Caldas', court: 'Administradora de fondos de pensiones (sede administrativa)', opened: d(-20), done: 0, stageDue: 30, updatedAgo: 5,
      description: 'Reclamación de pensión de sobrevivientes tras el fallecimiento de la cónyuge. Etapa de reclamación previa ante el fondo.', next: 'Esperar respuesta del fondo (plazo legal)', nextDue: d(30),
      parties: [['Hernando Castaño Giraldo', 'Demandante', 'nuestra'], ['Fondo de pensiones (reservado)', 'Demandado', 'contraparte']],
      tasks: [[12, 'Verificar radicado de la reclamación y solicitar acuse', U.laura, 'pendiente', 'baja']] });

    createCase({ title: 'Restitución de inmueble arrendado', area: 'civil', type: 'Restitución de inmueble', template: 'civil_verbal', status: 'suspendido', client: C.caminos, lawyer: U.andres, city: 'Rionegro', dep: 'Antioquia', court: 'Juzgado 1 Civil Municipal de Rionegro', opened: d(-200), done: 3, updatedAgo: 15,
      description: 'Mora en el pago del canon. El proceso se encuentra suspendido mientras se cumple un acuerdo de pago firmado entre las partes.', next: 'Verificar cumplimiento del acuerdo de pago', nextDue: d(21),
      parties: [['Fundación Caminos', 'Demandante', 'nuestra'], ['Arrendatario (reservado)', 'Demandado', 'contraparte']],
      docket: [[15, 'memorial', 'Solicitud conjunta de suspensión del proceso', 'Las partes solicitan la suspensión por tres meses mientras se cumple el acuerdo de pago.', 'interna', 'cliente']] });

    createCase({ title: 'Declaración de pertenencia — prescripción adquisitiva', area: 'civil', type: 'Declarativo de pertenencia', template: 'civil_verbal', status: 'activo', client: C.maria, lawyer: U.carolina, city: 'Medellín', dep: 'Antioquia', court: 'Juzgado 20 Civil del Circuito de Medellín', radicado: '05001310302020250068400', opened: d(-300), done: 4, stageDue: 2, updatedAgo: 0,
      description: 'Posesión pacífica e ininterrumpida por más de diez años de un inmueble en el barrio Belén. Se solicita la declaración de pertenencia.', next: 'Audiencia inicial: preparar a la cliente para el interrogatorio', nextDue: d(2),
      stageLawyers: { 1: U.andres, 2: U.laura, 4: U.andres }, team: [[U.andres, 'Abogado sustituto'], [U.laura, 'Asistente jurídico']],
      parties: [['María Fernanda López Cardona', 'Demandante', 'nuestra'], ['Herederos indeterminados del titular inscrito', 'Demandado', 'contraparte', 'Curador ad litem'], ['Personas indeterminadas', 'Demandado', 'contraparte']],
      docket: [[7, 'auto', 'Auto fija fecha de audiencia inicial', 'Se fija audiencia inicial y se requiere la comparecencia personal de la demandante.', 'estado_electronico', 'cliente'], [20, 'actuacion', 'Instalación de la valla y publicación del aviso', 'Se acreditó la instalación de la valla en el inmueble y el emplazamiento.', 'interna', 'cliente', U.laura]],
      events: [[2, '10:00', 'audiencia', 'Audiencia inicial (art. 372 CGP)', 'Juzgado 20 Civil del Circuito de Medellín, sala 1', 'programado', 'cliente'], [-1, '15:00', 'reunion', 'Reunión de preparación con la cliente', 'Despacho', 'cumplido', 'cliente']],
      tasks: [[1, 'Preparar guion de interrogatorio de la demandante', U.carolina, 'en_curso', 'alta'], [1, 'Imprimir y foliar expediente para la audiencia', U.laura, 'pendiente', 'media']],
      messages: [[8, U.carolina, 'Buen día. El juzgado fijó la audiencia inicial para dentro de unos días. Nos reuniremos antes para explicarle qué va a pasar y resolver sus dudas.', 'cliente'], [7, get("SELECT id FROM users WHERE email = 'cliente@ejemplo.co'").id, 'Muchas gracias, doctora. Quedo atenta a la hora de la reunión.', 'cliente'], [1, U.laura, 'Confirmada la asistencia de la cliente. Expediente foliado listo mañana.', 'interno']],
      docs: [['Poder especial', 'poder', 'cliente', 'disponible', U.laura, ['Poder para el proceso de pertenencia.'], 300], ['Demanda de pertenencia', 'demanda', 'cliente', 'disponible', U.carolina, ['Demanda declarativa de pertenencia.'], 280], ['Certificado de tradición y libertad', 'prueba', 'cliente', 'disponible', U.laura, ['Certificado expedido por la Oficina de Registro.'], 290], ['Recibos de servicios públicos (2016-2026)', 'prueba', 'cliente', 'recibido', get("SELECT id FROM users WHERE email = 'cliente@ejemplo.co'").id, ['Recibos aportados por la clienta como prueba de posesion.'], 3]] });

    createCase({ title: 'Reclamación por garantía de vehículo', area: 'civil', type: 'Verbal sumario', template: 'generico', status: 'archivado', outcome: 'desistido', client: C.sandra, lawyer: U.andres, city: 'Medellín', dep: 'Antioquia', court: 'Superintendencia de Industria y Comercio', opened: '2025-04-02', closed: '2025-08-15', done: 1,
      description: 'Acción de protección al consumidor por fallas en un vehículo nuevo. El concesionario reconoció la garantía antes de la audiencia y la clienta desistió.',
      parties: [['Sandra Milena Ortiz Arango', 'Demandante', 'nuestra'], ['Concesionario (reservado)', 'Demandado', 'contraparte']] });

    // ---- Solicitudes web de ejemplo ------------------------------------
    insert('INSERT INTO leads(name,email,phone,reason,message,status,created_at) VALUES(?,?,?,?,?,?,?)', 'Camilo Restrepo', 'camilo.r@ejemplo.co', '300 000 0020', 'Agendar una consulta', 'Quisiera asesoría sobre un contrato de arrendamiento comercial que el arrendador quiere terminar anticipadamente.', 'nueva', d(-1) + ' 14:12:00');
    insert('INSERT INTO leads(name,email,phone,reason,message,status,assigned_to,created_at) VALUES(?,?,?,?,?,?,?,?)', 'Gloria Patiño', 'gloria.p@ejemplo.co', '', 'Solicitar información', '¿Atienden procesos de sucesión en Rionegro?', 'en_contacto', U.carolina, d(-4) + ' 21:40:00');

    setSetting('demo_seeded', '1');
  });
  console.log('Datos de ejemplo cargados. Usuarios: andres@arroyaveh.co, valentina@arroyaveh.co, julian@arroyaveh.co, laura@arroyaveh.co (Demo2026*) · cliente@ejemplo.co, cliente2@ejemplo.co (Cliente2026*)');
}

function resetAll() {
  ['audit_log', 'messages', 'tasks', 'events', 'documents', 'docket', 'case_parties', 'case_stages', 'case_team', 'cases', 'leads', 'sessions', 'users', 'clients', 'settings'].forEach((t) => run(`DELETE FROM ${t}`));
  run("DELETE FROM sqlite_sequence");
  fs.readdirSync(UPLOAD_DIR).forEach((f) => { if (f !== '.gitkeep') fs.unlinkSync(path.join(UPLOAD_DIR, f)); });
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--reset')) { resetAll(); ensureAdmin(); seedDemo(); }
  else if (args.includes('--force')) { ensureAdmin(); seedDemo(); }
  else { ensureAdmin(); seedDemoIfEmpty(); }
  console.log('Listo.');
}

module.exports = { ensureAdmin, seedDemoIfEmpty, seedDemo, resetAll, DEFAULT_SETTINGS };
