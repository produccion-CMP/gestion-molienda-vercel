/**
 * Implementación opcional para desplegar como Web App desde la planilla principal.
 * Usa AcopiosPlaya y los catálogos existentes como fuente validada. Al cerrar
 * una jornada agrega filas a las tablas operativas y conserva un diario idempotente.
 * Ejecutar como propietario; el acceso del Web App debe restringirse según la política de CMP.
 */
const MES_PRIMARY_ID = '1hiCNaOYxxEYfpkLci6J0wFBxXuhOyShApOIJTMo6k60';
const MES_HISTORICAL_ID = '1Ul1iGGqWSkANvBHWq7Aw1dWRWJAbB243lzp0-3IrkdU';
const MES_PRODUCTION_ID = '10DdVI37wr7uigNpGx4PnrOOmhIMROKAxKn6b5cNRlPc';
const MES_STOCK_HEADER = ['tipo', 'id', 'nombre', 'toneladas', 'humedadNivel', 'actualizado', 'paladasOperativas', 'calidadJSON'];
const MES_AUDIT_HEADER = ['id', 'fecha', 'revision', 'payloadJSON', 'stockJSON', 'registrado'];
const MES_ADJUST_HEADER = ['fecha','tipo','id','nombre','toneladas','motivo','idAjuste','antesTon','diferenciaTon','responsable'];
const MES_REPORT_HEADER = ['idCierre','fecha','archivoId','urlPDF','creado','enviadoA','enviadoEl','estadoEnvio'];
const MES_RECIPIENT_HEADER = ['email','nombre','area','activo'];
const MES_TELEGRAM_HEADER = ['chatId','nombre','telefono','destino','activo'];
const MES_REMINDER_HEADER = ['id','creado','fechaAviso','horaAviso','para','prioridad','texto','completado','realizadoEn','estadoTelegram','notificadoEn'];
const MES_TELEGRAM_LOG_HEADER = ['idAviso','chatId','fecha','estado','detalle','destino'];
const MES_MAP_CURRENT_HEADER = ['revision','actualizado','origen','planoJSON','resumenJSON'];
const MES_MAP_ELEMENTS_HEADER = ['revision','actualizado','tipo','id','nombre','estado','sector','forma','x','y','ancho','alto','radio','pisos','propiedadesJSON'];
const MES_PLAN_HEADER = ['idPlan','revision','estado','fechaInicio','fechaFin','planJSON','creado','actualizado'];
const MES_PLAN_DETAIL_HEADER = ['idPlan','revision','tipo','idElemento','fechaInicio','fechaFin','turnos','sector','nombre','detalleJSON','actualizado'];

// Conserva el menú del proyecto original. Sólo prepara encabezados faltantes:
// no sobrescribe catálogos, existencias ni registros históricos.
function onOpen() {
  SpreadsheetApp.getUi().createMenu('🏭 Gestión Molienda')
    .addItem('Verificar hojas sin borrar datos', 'crearEstructuraHojas')
    .addToUi();
}

function crearEstructuraHojas() {
  const book = SpreadsheetApp.openById(MES_PRIMARY_ID);
  const headers = {
    Turnos: ['Timestamp Registro','Fecha Auditada','Auditor de Turno','Total Toneladas Ingresadas','Total m³ Movidos','Total Paladas','Tiempo Muerto Palas (min)','Tareas Realizadas en Turno'],
    Personal: ['Fecha','Operario','Puesto Planificado','Puesto Real en Turno','¿Hubo Cambio de Puesto?','Pala Planificada','Pala Real en Turno','¿Hubo Cambio de Pala?','¿Tuvo Parada su Pala?','Cant. Paradas Reportadas','Estado de Asistencia','Hora Inicio Real','Hora Fin Real','Observación de Turno'],
    Movimientos: ['Fecha','Maquinista','Pala Cargadora','Capacidad Balde (m³)','Origen','Destino','Cantidad de Paladas','Volumen Calculado (m³)','Toneladas Estimadas','Observaciones Operativas'],
    Paradas: ['Fecha','Pala Cargadora','Maquinista Asignado','Motivo Desperfecto','Hora Inicio Parada','Hora Fin Parada','Minutos Parados','¿Continúa Fuera de Servicio?','¿Problema Resuelto en Turno?','Observaciones de Taller'],
    CalidadTierra: ['Fecha','Origen','Destino en Planta','¿Ingresaron Viajes?','Toneladas Reales','Resumen Calidad (0-3)','Humedad (0-3)','Caliza (0-3)','Raíces (0-3)','Basura (0-3)','Piedras (0-3)','Tierra Negra (0-3)','Observaciones de Calidad'],
    AcopiosPlaya: ['ID Acopio','Nombre del Acopio','Sector en Playa','Cuadrante en Plano','Nivel / Pisos','Toneladas Actuales','Volumen Estimado (m³)','Estado Operativo'],
    Cat_Operarios: ['Operario','Puestos Habilitados','Estado'],
    Cat_Maquinas: ['Modelo / Identificación','Capacidad Balde (m³)','Estado'],
    Cat_Canteras: ['Nombre Origen','Tipo','Estado'],
    Cat_Sectores: ['Nombre Sector','Cuadrante Plano','Estado'],
    Cat_Acciones: ['Nombre Acción','Estado'],
    Configuracion: ['Parámetro','Valor','Descripción']
  };
  Object.entries(headers).forEach(([name, columns]) => {
    let tab = book.getSheetByName(name);
    if (!tab) tab = book.insertSheet(name);
    if (!tab.getRange(1, 1).getValue()) tab.getRange(1, 1, 1, columns.length).setValues([columns]);
    tab.setFrozenRows(1);
  });
  mesTab(book, 'MES_Auditorias', MES_AUDIT_HEADER, true);
  mesTab(book, 'MES_Planos', ['revision','actualizado','planoJSON'], true);
  mesTab(book, 'MES_Plano_Actual', MES_MAP_CURRENT_HEADER, true);
  mesTab(book, 'MES_Plano_Elementos', MES_MAP_ELEMENTS_HEADER, true);
  mesTab(book, 'MES_Planificaciones', MES_PLAN_HEADER, true);
  mesTab(book, 'MES_Planificacion_Detalle', MES_PLAN_DETAIL_HEADER, true);
  mesTab(book, 'MES_Inventario', MES_STOCK_HEADER, true);
  const inventario = book.getSheetByName('MES_Inventario');
  MES_STOCK_HEADER.forEach((name, index) => { if (!inventario.getRange(1, index + 1).getValue()) inventario.getRange(1, index + 1).setValue(name); });
  const ajustes = mesTab(book, 'MES_Ajustes', MES_ADJUST_HEADER, true);
  MES_ADJUST_HEADER.forEach((name, i) => { if (!ajustes.getRange(1, i + 1).getValue())
    ajustes.getRange(1, i + 1).setValue(name); });
  mesTab(book, 'MES_Informes', MES_REPORT_HEADER, true);
  mesTab(book, 'Cat_Destinatarios', MES_RECIPIENT_HEADER, true);
  mesTab(book, 'Cat_Telegram', MES_TELEGRAM_HEADER, true);
  mesTab(book, 'MES_Recordatorios', MES_REMINDER_HEADER, true);
  mesTab(book, 'MES_TelegramEnvios', MES_TELEGRAM_LOG_HEADER, true);
  mesTab(book, 'MES_Indicaciones', ['fecha','textoOriginal','textoAprobado','categoria','descripcion','sector','turno','validada','ID Cierre','Índice Cierre'], true);
  mesTab(book, 'MES_TransferenciasConos', ['fecha','origen','destino','paladas','toneladas','motivo','idCierre','indiceCierre'], true);
  console.log('Estructura verificada. No se modificaron datos existentes.');
}

function ocultarHojasTecnicas() {
  const book = SpreadsheetApp.openById(MES_PRIMARY_ID);
  ['MES_Plano_Elementos','MES_Planos','MES_Planificacion_Detalle','MES_TelegramEnvios'].forEach(name => {
    const tab = book.getSheetByName(name); if (tab) tab.hideSheet();
  });
  const legacy = book.getSheetByName('Maestros');
  if (legacy && legacy.getLastRow() === 0) legacy.hideSheet();
  console.log('Se ocultaron hojas técnicas; no se borraron datos.');
}

function mostrarHojasTecnicas() {
  const book = SpreadsheetApp.openById(MES_PRIMARY_ID);
  ['MES_Plano_Elementos','MES_Planos','MES_Planificacion_Detalle','MES_TelegramEnvios','Maestros'].forEach(name => {
    const tab = book.getSheetByName(name); if (tab) tab.showSheet();
  });
}

function mesJson(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function mesAuthorized(token) {
  const expected = PropertiesService.getScriptProperties().getProperty('MES_SYNC_TOKEN');
  return !!expected && String(token || '') === expected;
}

function mesTab(book, title, header, create) {
  let tab = book.getSheetByName(title);
  if (!tab && create) {
    tab = book.insertSheet(title);
    tab.getRange(1, 1, 1, header.length).setValues([header]);
    tab.setFrozenRows(1);
  }
  return tab;
}

function mesStock(book) {
  const tab = mesTab(book, 'MES_Inventario', MES_STOCK_HEADER, false);
  const rows = tab && tab.getLastRow() > 1 ? tab.getRange(2, 1, tab.getLastRow() - 1, 8).getValues() : [];
  const acopios = [], conos = [];
  let cajon2 = 0;
  rows.forEach(row => {
    const [tipo, id, nombre, toneladas, humedadNivel, actualizado, paladasOperativas, calidadJSON] = row;
    if (!nombre || !Number.isFinite(Number(toneladas)) || Number(toneladas) < 0) return;
    const item = { id: String(id), nombre: String(nombre), toneladas: Number(toneladas), humedadNivel: humedadNivel === '' ? 1 : Number(humedadNivel),
      paladasOperativas: Number(paladasOperativas) || 0, calidades: mesParseQuality(calidadJSON) };
    if (tipo === 'cono') conos.push(item);
    if (tipo === 'cajon2') cajon2 = item.toneladas;
  });
  const playa = book.getSheetByName('AcopiosPlaya');
  if (playa && playa.getLastRow() > 1) playa.getRange(2, 1, playa.getLastRow() - 1, 8).getValues().forEach(r => {
    if (r[0] === '' || !r[1]) return;
    const toneladas = Number(r[5]);
    if (!Number.isFinite(toneladas) || toneladas < 0) throw new Error('AcopiosPlaya contiene toneladas inválidas');
    acopios.push({ id: String(r[0]), nombre: String(r[1]), sector: String(r[2] || ''),
      cuadrante: String(r[3] || ''), pisos: Number(r[4]) || 1, toneladas,
      m3Estimados: Number(r[6]) || 0, activo: String(r[7]).toUpperCase() !== 'INACTIVO', humedadNivel: 1 });
  });
  const shared = mesReadMap(book).map;
  if (shared) {
    const merge = (items, definitions) => {
      definitions.forEach(a => {
        let item = items.find(x => String(x.id) === String(a.id));
        if (!item) { item = { id: String(a.id), toneladas: 0, paladasOperativas: 0, humedadNivel: 1 }; items.push(item); }
        ['nombre','sector','cuadrante','pisos','activo'].forEach(k => { if (a[k] !== undefined) item[k] = a[k]; });
        if (a.calidades && a.calidades.Humedad !== undefined) item.humedadNivel = a.calidades.Humedad;
      });
    };
    merge(acopios, shared.acopios);
    // El plano vigente define qué conos existen. Los renglones sin ese ID son
    // residuos de configuraciones anteriores y no deben volver a la aplicación.
    const byId = new Map(conos.map(x => [String(x.id), x]));
    const conosVigentes = (shared.conos || []).map(def => {
      const item = { ...(byId.get(String(def.id)) || { id: String(def.id), toneladas: 0, paladasOperativas: 0, humedadNivel: 1 }) };
      item.nombre = def.nombre; item.activo = def.activo !== false;
      return item;
    });
    conos.splice(0, conos.length, ...conosVigentes);
  }
  return { acopios, conos, cajon2 };
}

function mesParseQuality(value) {
  try { const parsed = JSON.parse(String(value || '{}')); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; }
  catch (_) { return {}; }
}

function mesCatalogo(book, tabName, fields) {
  const tab = book.getSheetByName(tabName);
  if (!tab || tab.getLastRow() < 2) return [];
  return tab.getRange(2, 1, tab.getLastRow() - 1, fields.length).getValues()
    .filter(row => row[0] !== '' && row[0] !== null)
    .map((row, i) => Object.fromEntries([['id', i + 1], ...fields.map((f, j) => [f, row[j]])]));
}

function mesCatalogos(book) {
  return {
    operadores: mesCatalogo(book, 'Cat_Operarios', ['nombre', 'puestosHabilitados', 'estado']),
    maquinas: mesCatalogo(book, 'Cat_Maquinas', ['nombre', 'm3PorPalada', 'estado']),
    canteras: mesCatalogo(book, 'Cat_Canteras', ['nombre', 'tipo', 'estado']),
    sectores: mesCatalogo(book, 'Cat_Sectores', ['nombre', 'cuadrante', 'estado']),
    acciones: mesCatalogo(book, 'Cat_Acciones', ['nombre', 'estado'])
  };
}

function mesDigest(data) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(data));
  return bytes.map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
}

function mesRevision(book) {
  const tab = mesTab(book, 'MES_Auditorias', MES_AUDIT_HEADER, false);
  if (!tab || tab.getLastRow() < 2) return 0;
  return Number(tab.getRange(tab.getLastRow(), 3).getValue()) || 0;
}

function mesWriteStock(book, stock, data) {
  const playa = book.getSheetByName('AcopiosPlaya');
  if (!playa) throw new Error('Falta la pestaña AcopiosPlaya');
  const current = playa.getLastRow() > 1 ? playa.getRange(2, 1, playa.getLastRow() - 1, 8).getValues() : [];
  const details = data.AcopiosPlaya || [];
  const byId = new Map(current.map((row, i) => [String(row[0]), i + 2]));
  stock.acopios.forEach(a => {
    if (!a.nombre || !Number.isFinite(Number(a.toneladas)) || Number(a.toneladas) < 0)
      throw new Error('Acopio inválido');
    const detail = details.find(x => String(x.id) === String(a.id)) || {};
    const rowIndex = byId.get(String(a.id));
    const old = rowIndex ? current[rowIndex - 2] : [];
    const row = [a.id, a.nombre, detail.sector || old[2] || 'Playa', detail.cuadrante || old[3] || '',
      Number(detail.pisos || old[4] || 1), Number(a.toneladas),
      Number(detail.m3Estimados ?? old[6] ?? 0), detail.activo === false || (!Object.keys(detail).length && String(old[7]).toUpperCase() === 'INACTIVO') ? 'INACTIVO' : 'ACTIVO'];
    if (rowIndex) playa.getRange(rowIndex, 1, 1, 8).setValues([row]);
    else { playa.appendRow(row); byId.set(String(a.id), playa.getLastRow()); }
  });
  const tab = mesTab(book, 'MES_Inventario', MES_STOCK_HEADER, true);
  MES_STOCK_HEADER.forEach((name, index) => { if (!tab.getRange(1, index + 1).getValue()) tab.getRange(1, index + 1).setValue(name); });
  const items = [
    ...(stock.conos || []).map(s => ['cono', s.id, s.nombre, s.toneladas, s.humedadNivel ?? 1, new Date(), s.paladasOperativas ?? 0, JSON.stringify(s.calidades || {})]),
    ['cajon2', 'cajon2', 'Cajón 2', stock.cajon2 || 0, 1, new Date(), 0, '{}']
  ];
  items.forEach(row => {
    if (!row[2] || !Number.isFinite(Number(row[3])) || Number(row[3]) < 0) throw new Error('Inventario inválido');
  });
  if (tab.getLastRow() > 1) tab.getRange(2, 1, tab.getLastRow() - 1, 8).clearContent();
  if (items.length) tab.getRange(2, 1, items.length, 8).setValues(items);
}

const MES_COLUMNS = {
  Turnos: ['timestampSincronizacion','fecha','auditor','totalToneladasIngreso','totalM3Movidos','totalPaladas','totalMinutosParada','tareasRealizadasEnTurno','indicacionesSemana'],
  Personal: ['fecha','operario','puestoPlanificado','puestoReal','cambioDePuesto','maquinaPlanificada','maquinaReal','cambioDeMaquina','tuvoParadaPala','cantParadasPala','estadoAsistencia','horaInicioReal','horaFinReal','observacion','diferenciaEntradaMin','diferenciaSalidaMin'],
  Movimientos: ['fecha','maquinista','maquina','capacidadBaldeM3','origen','destino','cantPaladas','volumenM3Calculado','toneladasEstimadas','observaciones','densidadAplicada','humedadNivel'],
  Paradas: ['fecha','maquina','maquinista','motivoDesperfecto','horaInicio','horaFin','minutosParados','continuaParada','resuelto','observaciones'],
  CalidadTierra: ['fecha','origen','destino','ingresaronViajes','volumenRealTon','resumenEvaluacion0a3','Humedad','Caliza','Raíces','Basura','Piedras','Tierra Negra','observaciones'],
  Tareas: ['fecha','accion','sector','turnos','realizada','observacion','fotoInicioLocal','fotoFinLocal'],
  BalanceSilos: ['nombre','antesTon','entradasTon','salidasTon','finalTon','humedadNivel','paladasOperativas'],
  TransferenciasConos: ['fecha','origen','destino','paladas','toneladas','motivo'],
  MES_Indicaciones: ['fecha','textoOriginal','textoAprobado','categoria','descripcion','sector','turno','validada']
};

function mesReportRows(book) {
  const tab = mesTab(book, 'MES_Informes', MES_REPORT_HEADER, false);
  return tab && tab.getLastRow() > 1 ? tab.getRange(2, 1, tab.getLastRow() - 1, 8).getValues() : [];
}

function mesRecipients(book) {
  const tab = mesTab(book, 'Cat_Destinatarios', MES_RECIPIENT_HEADER, false);
  return tab && tab.getLastRow() > 1 ? tab.getRange(2, 1, tab.getLastRow() - 1, 4).getValues()
    .filter(r => String(r[0]).trim()).map(r => ({ email: String(r[0]).trim(), nombre: String(r[1] || ''),
      area: String(r[2] || ''), activo: String(r[3]).toUpperCase() !== 'NO' && String(r[3]).toUpperCase() !== 'INACTIVO' })) : [];
}

function mesPdfTable(body, title, headers, records) {
  body.appendParagraph(title).setHeading(DocumentApp.ParagraphHeading.HEADING2);
  if (!records.length) { body.appendParagraph('Sin registros en esta sección.'); return; }
  const table = body.appendTable([headers].concat(records.map(r => r.map(v => String(v ?? '')))));
  for (let j = 0; j < table.getRow(0).getNumCells(); j++) table.getCell(0, j).editAsText().setBold(true);
  for (let i = 0; i < table.getNumRows(); i++) for (let j = 0; j < table.getRow(i).getNumCells(); j++)
    table.getCell(i, j).editAsText().setFontSize(8);
}

function mesGenerateReport(book, id) {
  const reports = mesTab(book, 'MES_Informes', MES_REPORT_HEADER, true);
  const existing = mesReportRows(book).find(r => String(r[0]) === id && r[2]);
  if (existing) return { id, url: String(existing[3]), enviadoA: String(existing[5] || ''), estadoEnvio: String(existing[7] || '') };
  const audits = mesTab(book, 'MES_Auditorias', MES_AUDIT_HEADER, false);
  const cell = audits && audits.getLastRow() > 1 ? audits.getRange(2, 1, audits.getLastRow() - 1, 1)
    .createTextFinder(id).matchEntireCell(true).findNext() : null;
  if (!cell) throw new Error('El cierre no está confirmado en la planilla.');
  const row = audits.getRange(cell.getRow(), 1, 1, 6).getValues()[0];
  const data = JSON.parse(row[3]);
  const date = String(row[1] || data.Turnos?.[0]?.fecha || '');
  const doc = DocumentApp.create(`CMP - Informe Molienda - ${date} - ${id}`);
  try {
    const body = doc.getBody();
    body.appendParagraph('CERÁMICA MARCOS PAZ  |  CEVIL POZO').setHeading(DocumentApp.ParagraphHeading.SUBTITLE);
    body.appendParagraph('Informe de jornada - Molienda y silo').setHeading(DocumentApp.ParagraphHeading.TITLE);
    body.appendParagraph(`Fecha auditada: ${date}     Cierre: ${id}\nRevisión: ${row[2]}     Generado: ${Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'dd/MM/yyyy HH:mm')}`);
    const turno = data.Turnos?.[0] || {};
    mesPdfTable(body, 'Resumen operativo', ['Indicador','Valor'], [
      ['Tierra ingresada', `${turno.totalToneladasIngreso ?? 0} t`],
      ['Volumen movido', `${turno.totalM3Movidos ?? 0} m³`],
      ['Paladas', turno.totalPaladas ?? 0], ['Paradas', `${turno.totalMinutosParada ?? 0} min`],
      ['Tareas realizadas', turno.tareasRealizadasEnTurno ?? '']]);
    mesPdfTable(body, 'Personal y asistencia', ['Operario','Puesto','Asistencia','Entrada','Salida'],
      (data.Personal || []).map(p => [p.operario,p.puestoReal,p.estadoAsistencia,p.horaInicioReal,p.horaFinReal]));
    mesPdfTable(body, 'Tareas de playa', ['Acción','Sector','Turnos','Estado'],
      (data.Tareas || []).map(t => [t.accion,t.sector,Array.isArray(t.turnos) ? t.turnos.join(', ') : t.turnos,t.realizada ? 'Realizada' : 'No realizada']));
    mesPdfTable(body, 'Movimientos', ['Origen','Destino','Paladas','Toneladas'],
      (data.Movimientos || []).map(m => [m.origen,m.destino,m.cantPaladas,m.toneladasEstimadas]));
    mesPdfTable(body, 'Ingresos de tierra', ['Origen','Destino','Ingresó','Toneladas'],
      (data.CalidadTierra || []).map(c => [c.origen,c.destino,c.ingresaronViajes,c.volumenRealTon]));
    mesPdfTable(body, 'Paradas de máquinas', ['Máquina','Motivo','Inicio','Fin','Minutos'],
      (data.Paradas || []).map(p => [p.maquina,p.motivoDesperfecto,p.horaInicio,p.horaFin,p.minutosParados]));
    mesPdfTable(body, 'Balance de conos', ['Cono','Inicial t','Entradas t','Salidas t','Final t'],
      (data.BalanceSilos || []).map(s => [s.nombre,s.antesTon,s.entradasTon,s.salidasTon,s.finalTon]));
    mesPdfTable(body, 'Traspasos entre conos', ['Origen','Destino','Paladas','Toneladas'],
      (data.TransferenciasConos || []).map(t => [t.origen,t.destino,t.paladas,t.toneladas]));
    if (turno.indicacionesSemana) { body.appendParagraph('Indicaciones semanales').setHeading(DocumentApp.ParagraphHeading.HEADING2);
      body.appendParagraph(String(turno.indicacionesSemana)); }
    body.appendParagraph('Registro generado a partir del cierre confirmado. Verificar mediciones y pesajes en planta.')
      .editAsText().setItalic(true).setFontSize(8);
    doc.saveAndClose();
    const folderName = 'CMP Informes Molienda';
    const folders = DriveApp.getFoldersByName(folderName);
    const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
    const blob = DriveApp.getFileById(doc.getId()).getAs(MimeType.PDF);
    const file = folder.createFile(blob.setName(`CMP-Molienda-${date}-${id}.pdf`));
    DriveApp.getFileById(doc.getId()).setTrashed(true);
    const url = file.getUrl();
    reports.appendRow([id,date,file.getId(),url,new Date(),'','','PENDIENTE']);
    return { id, url, enviadoA: '', estadoEnvio: 'PENDIENTE' };
  } catch (error) { try { doc.saveAndClose(); } catch (_) {} throw error; }
}

function mesWriteRecords(book, id, data) {
  Object.keys(MES_COLUMNS).forEach(name => {
    const columns = MES_COLUMNS[name];
    const entries = data[name] || [];
    if (!Array.isArray(entries) || !entries.length) return;
    const tab = mesTab(book, name, [...columns, 'ID Cierre', 'Índice Cierre'], true);
    const width = columns.length + 2;
    if (tab.getMaxColumns() < width) tab.insertColumnsAfter(tab.getMaxColumns(), width - tab.getMaxColumns());
    const header = tab.getRange(1, 1, 1, width).getValues()[0];
    for (let col = 0; col < columns.length; col++) {
      if (!header[col]) tab.getRange(1, col + 1).setValue(columns[col]);
    }
    tab.getRange(1, width - 1, 1, 2).setValues([['ID Cierre','Índice Cierre']]);
    const existing = new Set();
    if (tab.getLastRow() > 1) tab.getRange(2, width - 1, tab.getLastRow() - 1, 2).getValues()
      .forEach(r => { if (String(r[0]) === id) existing.add(Number(r[1])); });
    entries.forEach((entry, index) => {
      if (existing.has(index)) return;
      const row = columns.map(key => {
        const value = entry[key];
        return Array.isArray(value) ? value.join(', ') : value ?? '';
      });
      tab.appendRow([...row, id, index]);
    });
  });
}

function mesTelegramRecipients(book) {
  const tab = mesTab(book, 'Cat_Telegram', MES_TELEGRAM_HEADER, true);
  return tab.getLastRow() < 2 ? [] : tab.getRange(2, 1, tab.getLastRow() - 1, 5).getValues()
    .filter(r => r[0]).map(r => ({ chatId: String(r[0]), nombre: String(r[1] || ''),
      telefono: String(r[2] || ''), destino: String(r[3] || 'Todos'), activo: String(r[4]) === 'ACTIVO' }));
}

function mesReminders(book) {
  const tab = mesTab(book, 'MES_Recordatorios', MES_REMINDER_HEADER, true);
  const zone = Session.getScriptTimeZone();
  const dateOnly = value => value instanceof Date ? Utilities.formatDate(value, zone, 'yyyy-MM-dd') : String(value || '');
  const timeOnly = value => value instanceof Date ? Utilities.formatDate(value, zone, 'HH:mm') : String(value || '');
  return tab.getLastRow() < 2 ? [] : tab.getRange(2, 1, tab.getLastRow() - 1, 11).getValues()
    .filter(r => r[0]).map(r => ({ id: String(r[0]), fecha: r[1] instanceof Date ? r[1].toISOString() : String(r[1] || ''), fechaAviso: dateOnly(r[2]),
      horaAviso: timeOnly(r[3]), para: String(r[4] || ''), prioridad: String(r[5] || ''),
      texto: String(r[6] || ''), completado: r[7] === true, realizadoEn: r[8] instanceof Date ? r[8].toISOString() : String(r[8] || ''),
      estadoTelegram: String(r[9] || ''), notificadoEn: String(r[10] || '') }));
}

function instalarAvisosTelegram() {
  if (!PropertiesService.getScriptProperties().getProperty('MES_TELEGRAM_BOT_TOKEN'))
    throw new Error('Configurá MES_TELEGRAM_BOT_TOKEN en Propiedades del proyecto.');
  const existentes = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'mesProcesarAvisosTelegram');
  if (!existentes.length) ScriptApp.newTrigger('mesProcesarAvisosTelegram').timeBased().everyMinutes(5).create();
  return 'Avisos de Telegram programados cada 5 minutos.';
}

function mesProcesarAvisosTelegram() {
  const token = PropertiesService.getScriptProperties().getProperty('MES_TELEGRAM_BOT_TOKEN');
  if (!token) throw new Error('Falta MES_TELEGRAM_BOT_TOKEN.');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    const book = SpreadsheetApp.openById(MES_PRIMARY_ID);
    const tab = mesTab(book, 'MES_Recordatorios', MES_REMINDER_HEADER, true);
    const log = mesTab(book, 'MES_TelegramEnvios', MES_TELEGRAM_LOG_HEADER, true);
    const recipients = mesTelegramRecipients(book).filter(r => r.activo);
    const rows = tab.getLastRow() > 1 ? tab.getRange(2, 1, tab.getLastRow() - 1, 11).getValues() : [];
    const now = Date.now();
    rows.forEach((r, index) => {
      const [id,,fecha,hora,para,prioridad,texto,completado,,estado] = r;
      if (!id || !fecha || !hora || completado === true || String(estado) !== 'PENDIENTE') return;
      const due = new Date(`${fecha}T${hora}:00-03:00`).getTime();
      if (!Number.isFinite(due) || due > now) return;
      const targets = recipients.filter(x => String(para) === 'Todos' || x.destino === 'Todos' || x.destino === String(para)).slice(0, 20);
      if (!targets.length) return;
      tab.getRange(index + 2, 10).setValue('ENVIANDO');
      let delivered = 0;
      targets.forEach(target => {
        const logRow = log.getLastRow() + 1;
        log.getRange(logRow, 1, 1, 6).setValues([[id,target.chatId,new Date(),'ENVIANDO','',target.destino]]);
        try {
          const response = UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'post', payload: { chat_id: target.chatId, text: `CMP · Molienda | ${String(prioridad).toUpperCase()}\n${texto}\n${fecha} ${hora} (Argentina)` },
            muteHttpExceptions: true });
          if (response.getResponseCode() !== 200) throw new Error(`Telegram HTTP ${response.getResponseCode()}`);
          log.getRange(logRow, 4, 1, 2).setValues([['ENVIADO','']]); delivered++;
        } catch (error) { log.getRange(logRow, 4, 1, 2).setValues([['REVISAR',String(error.message).slice(0,180)]]); }
      });
      tab.getRange(index + 2, 10, 1, 2).setValues([[delivered === targets.length ? 'ENVIADO' : 'REVISAR', new Date()]]);
    });
  } finally { lock.releaseLock(); }
}

function mesState() {
  const book = SpreadsheetApp.openById(MES_PRIMARY_ID);
  const stock = mesStock(book);
  const audit = mesTab(book, 'MES_Auditorias', MES_AUDIT_HEADER, false);
  const reports = audit && audit.getLastRow() > 1
    ? audit.getRange(Math.max(2, audit.getLastRow() - 29), 1, Math.min(30, audit.getLastRow() - 1), 6)
      .getValues().map(row => ({ id: String(row[0]), fecha: String(row[1]), revision: Number(row[2]) }))
    : [];
  const turnos = book.getSheetByName('Turnos');
  const ajustes = mesTab(book, 'MES_Ajustes', MES_ADJUST_HEADER, false);
  const ajustesRecientes = ajustes && ajustes.getLastRow() > 1 && ajustes.getLastColumn() >= 10
    ? ajustes.getRange(Math.max(2, ajustes.getLastRow() - 29), 1,
      Math.min(30, ajustes.getLastRow() - 1), 10).getValues()
      .filter(r => r[6]).map(r => ({ fecha: r[0], tipo: r[1], id: r[2], nombre: r[3],
        despuesTon: Number(r[4]), metodo: r[5], idAjuste: r[6],
        antesTon: Number(r[7]), diferenciaTon: Number(r[8]),
        responsable: r[9] })).reverse() : [];
  return { ok: true, revision: mesRevision(book), etag: mesDigest(stock), stock,
    catalogos: mesCatalogos(book), reports, ajustesRecientes, planificacion: mesReadPlan(book),
    destinatarios: mesRecipients(book), informes: mesReportRows(book).slice(-30).map(r => ({ id: String(r[0]), fecha: String(r[1] || ''), url: String(r[3]),
      enviadoA: String(r[5] || ''), estadoEnvio: String(r[7] || '') })),
    telegramDestinatarios: mesTelegramRecipients(book), recordatorios: mesReminders(book).slice(-200),
    cantidadTurnos: turnos ? Math.max(0, turnos.getLastRow() - 1) : 0,
    conosValidados: stock.conos.length > 0 };
}

function mesReadPlan(book) {
  const tab = mesTab(book, 'MES_Planificaciones', MES_PLAN_HEADER, true);
  if (tab.getLastRow() < 2) return { revision: 0, plan: null };
  const row = tab.getRange(tab.getLastRow(), 1, 1, 8).getValues()[0];
  try { return { idPlan: String(row[0]), revision: Number(row[1]) || 0, estado: String(row[2]), plan: JSON.parse(String(row[5] || '{}')), actualizado: row[7] }; }
  catch (_) { throw new Error('La última planificación guardada no tiene un formato válido.'); }
}

function mesPlanDetailRows(plan, idPlan, revision, updatedAt) {
  const detail = [], add = (tipo, item, id, nombre, sector, turnos) => detail.push([idPlan,revision,tipo,String(id || ''),plan.fechaInicio || '',plan.fechaFin || '',
    Array.isArray(turnos) ? turnos.join(', ') : String(turnos || ''),String(sector || ''),String(nombre || ''),JSON.stringify(item || {}),updatedAt]);
  (plan.personal || []).forEach(x => add('PERSONAL',x,x.id,x.nombre,x.sector,x.turnos));
  (plan.tareasPlaya || []).forEach(x => add('TAREA',x,x.id,x.accion,x.sector,x.turnos));
  (plan.recetasAcopio || []).forEach(x => add('ACOPIO_PREVISTO',x,x.id,x.nombreNuevoAcopio,x.sectorDestino,x.turnos));
  (plan.camiones || []).forEach(x => add('CAMION_PREVISTO',x,x.id,x.origen,x.destino,x.turnos));
  (plan.indicacionesEstructuradas || []).forEach(x => add('INDICACION',x,x.id,x.descripcion || x.texto,x.sector,x.turno));
  if (plan.observacionSemanal) add('OBSERVACION_SEMANAL',{ texto: plan.observacionSemanal },'observacion',plan.observacionSemanal,'','');
  return detail;
}

function mesSavePlan(book, body) {
  const plan = body.plan;
  if (!plan || !/^\d{4}-\d{2}-\d{2}$/.test(String(plan.fechaInicio || '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(plan.fechaFin || '')))
    throw new Error('La planificación debe indicar fecha de inicio y fin válidas.');
  const current = mesReadPlan(book), expected = Number(body.expectedRevision || 0);
  if (expected !== current.revision) throw new Error('La planificación cambió en otro equipo. Recargá la página antes de guardar.');
  const text = JSON.stringify(plan);
  if (text.length > 45000) throw new Error('La planificación es demasiado extensa para registrarla.');
  const idPlan = String(plan.idPlan || `plan-${plan.fechaInicio}`), revision = current.revision + 1, now = new Date();
  const tab = mesTab(book, 'MES_Planificaciones', MES_PLAN_HEADER, true);
  tab.appendRow([idPlan,revision,'ACTIVA',plan.fechaInicio,plan.fechaFin,text,now,now]);
  const details = mesPlanDetailRows({ ...plan, idPlan }, idPlan, revision, now);
  if (details.length) mesTab(book, 'MES_Planificacion_Detalle', MES_PLAN_DETAIL_HEADER, true).getRange(
    mesTab(book, 'MES_Planificacion_Detalle', MES_PLAN_DETAIL_HEADER, true).getLastRow() + 1, 1, details.length, MES_PLAN_DETAIL_HEADER.length).setValues(details);
  return { idPlan, revision, plan: { ...plan, idPlan } };
}

function mesProductionHistory(e) {
  const tab = SpreadsheetApp.openById(MES_PRODUCTION_ID).getSheetByName('Respuestas de formulario 1');
  if (!tab) throw new Error('No se encontró «Respuestas de formulario 1» en Informe de Producción CMP – Planta CEVIL.');
  const last = tab.getLastRow(), offset = Math.max(0, Math.floor(Number(e.parameter.offset) || 0)), size = 100;
  const start = Math.max(2, last - offset - size + 1), count = Math.max(0, last - start + 1);
  const raw = count ? tab.getRange(start, 1, count, Math.min(91, tab.getLastColumn())).getDisplayValues().reverse() : [];
  const filas = raw.filter(r => r[57] && r[2]).map(r => [r[57],r[2],r[1],r[3],r[21],r[32],r[33],r[60],r[61],r[62],r[83],r[84],r[85],r[90]]);
  return { ok: true, fuente: 'Informe de Producción CMP – Planta CEVIL', hoja: 'Respuestas de formulario 1',
    encabezados: ['Fecha (BF)','Turno (C)','Supervisor','Novedades molienda y silo','Maquinista molienda','Producción molienda','Pala molienda','Producción silo','Pala silo','Maquinista silo','Tiempo de silo','Toneladas molidas a silo','Cargando en cono','Balanza de producción'],
    filas, offset, hayMas: start > 2 };
}

function mesHistorical(e) {
  const book = SpreadsheetApp.openById(MES_HISTORICAL_ID);
  const tabs = book.getSheets().filter(s => !s.isSheetHidden()).map(s => ({ gid: s.getSheetId(), nombre: s.getName(), filas: s.getLastRow() }));
  const gid = Number(e.parameter.gid || 1381238472);
  const tab = book.getSheets().find(s => s.getSheetId() === gid);
  if (!tab) return { ok: true, tabs, seleccionado: null, encabezados: [], filas: [] };
  const width = Math.min(35, tab.getLastColumn());
  const last = tab.getLastRow();
  const encabezados = width && last ? tab.getRange(1, 1, 1, width).getDisplayValues()[0] : [];
  const totalFilas = Math.max(0, last - 1);
  const offset = Math.min(totalFilas, Math.max(0, Math.floor(Number(e.parameter.offset) || 0)));
  const count = Math.min(100, Math.max(0, totalFilas - offset));
  const filas = count && width ? tab.getRange(last - offset - count + 1, 1, count, width).getDisplayValues().reverse() : [];
  return { ok: true, tabs, seleccionado: gid, encabezados, filas, totalFilas,
    offset, hayMas: offset + count < totalFilas };
}

function doGet(e) {
  try {
    if (e.parameter?.action === 'health') return mesJson({ ok: true, servicio: 'MES Molienda', version: 3 });
    if (!mesAuthorized(e.parameter?.token)) return mesJson({ ok: false, error: 'No autorizado' });
    return mesJson(e.parameter.action === 'productionHistory' ? mesProductionHistory(e) : e.parameter.action === 'historical' ? mesHistorical(e) : e.parameter.action === 'getMap' ? mesMapSnapshot() : mesState());
  }
  catch (error) { return mesJson({ ok: false, error: error.message }); }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const body = JSON.parse(e.postData.contents);
    if (!mesAuthorized(body.token)) throw new Error('No autorizado');
    if (body.action === 'savePlan') {
      if (!lock.tryLock(20000)) throw new Error('Planificación ocupada. Reintentá.');
      return mesJson({ ok: true, planificacion: mesSavePlan(SpreadsheetApp.openById(MES_PRIMARY_ID), body) });
    }
    if (body.action === 'saveMap') {
      if (!lock.tryLock(20000)) throw new Error('Plano ocupado. Reintentá.');
      const book = SpreadsheetApp.openById(MES_PRIMARY_ID);
      const current = mesReadMap(book);
      if (!Number.isInteger(body.expectedRevision) || body.expectedRevision !== current.revision)
        throw new Error('Conflicto de versión: otra persona publicó el plano. Cargá la versión compartida.');
      mesValidateMap(body.map);
      if (body.map.schema !== 2) throw new Error('Actualizá la aplicación antes de guardar el plano.');
      const map = mesCanonicalizeMap(book, JSON.parse(JSON.stringify(body.map)));
      mesValidateMap(map);
      const stock = mesStock(book);
      const removed = (old, next) => old.filter(a => !next.some(b => String(a.id) === String(b.id) && b.activo !== false));
      const unavailable = [...removed(current.map?.acopios || [], map.acopios).map(a => ['acopio', a]),
        ...removed(current.map?.conos || [], map.conos).map(a => ['cono', a])];
      unavailable.forEach(([tipo, a]) => {
        const item = (tipo === 'cono' ? stock.conos : stock.acopios).find(x => String(x.id) === String(a.id));
        if (item && item.toneladas > 0) throw new Error('Conciliá el stock antes de quitar o desactivar ' + a.nombre);
      });
      const text = JSON.stringify(map);
      if (text.length > 45000) throw new Error('El plano supera el tamaño admitido.');
      const revision = current.revision + 1;
      const updatedAt = new Date().toISOString();
      mesEnsureMapInventory(book, map);
      mesWriteMap(book, map, revision, updatedAt);
      return mesJson({ ok: true, mapProtocol: 2, revision, updatedAt });
    }
    if (body.action === 'saveTelegramRecipient') {
      if (!lock.tryLock(20000)) throw new Error('Configuración ocupada. Reintentá.');
      const chatId = String(body.chatId || '').trim(), telefono = String(body.telefono || '').trim();
      if (!/^-?\d{5,20}$/.test(chatId) || (telefono && !/^\+?[0-9 ()-]{7,24}$/.test(telefono)))
        throw new Error('Ingresá un chat ID numérico y un teléfono válido. El número no sustituye al chat ID.');
      const book = SpreadsheetApp.openById(MES_PRIMARY_ID);
      const tab = mesTab(book, 'Cat_Telegram', MES_TELEGRAM_HEADER, true);
      const rows = tab.getLastRow() > 1 ? tab.getRange(2, 1, tab.getLastRow() - 1, 1).getValues() : [];
      const index = rows.findIndex(r => String(r[0]) === chatId);
      const row = [chatId,String(body.nombre || '').slice(0,120),telefono,String(body.destino || 'Todos').slice(0,120),
        body.activo === false ? 'INACTIVO' : 'ACTIVO'];
      if (index < 0) tab.appendRow(row); else tab.getRange(index + 2, 1, 1, 5).setValues([row]);
      return mesJson({ ok: true, telegramDestinatarios: mesTelegramRecipients(book) });
    }
    if (body.action === 'saveReminder') {
      if (!lock.tryLock(20000)) throw new Error('Pizarrón ocupado. Reintentá.');
      const id = String(body.id || ''), fecha = String(body.fechaAviso || ''), hora = String(body.horaAviso || '');
      const texto = String(body.texto || '').trim();
      if (!/^[\w-]{5,100}$/.test(id) || texto.length < 3 || texto.length > 800 ||
          (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) || (hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) || (hora && !fecha))
        throw new Error('Recordatorio inválido. Revisá mensaje, fecha y hora.');
      const book = SpreadsheetApp.openById(MES_PRIMARY_ID), tab = mesTab(book, 'MES_Recordatorios', MES_REMINDER_HEADER, true);
      const found = tab.getLastRow() > 1 ? tab.getRange(2, 1, tab.getLastRow() - 1, 1).createTextFinder(id).matchEntireCell(true).findNext() : null;
      if (found) return mesJson({ ok: true, duplicate: true, recordatorios: mesReminders(book).slice(-200) });
      tab.appendRow([id,new Date(),fecha,hora,String(body.para || 'Todos').slice(0,120),
        String(body.prioridad || 'normal').slice(0,20),texto,false,'',fecha && hora ? 'PENDIENTE' : 'SIN_FECHA','']);
      return mesJson({ ok: true, recordatorios: mesReminders(book).slice(-200) });
    }
    if (body.action === 'completeReminder') {
      if (!lock.tryLock(20000)) throw new Error('Pizarrón ocupado. Reintentá.');
      const book = SpreadsheetApp.openById(MES_PRIMARY_ID), tab = mesTab(book, 'MES_Recordatorios', MES_REMINDER_HEADER, true);
      const found = tab.getLastRow() > 1 ? tab.getRange(2, 1, tab.getLastRow() - 1, 1)
        .createTextFinder(String(body.id || '')).matchEntireCell(true).findNext() : null;
      if (!found) throw new Error('Recordatorio no encontrado en la planilla.');
      const row = found.getRow(), current = tab.getRange(row, 1, 1, 11).getValues()[0];
      const completed = body.completado === true;
      tab.getRange(row, 8, 1, 2).setValues([[completed, completed ? new Date() : '']]);
      if (completed && current[9] === 'PENDIENTE') tab.getRange(row, 10).setValue('CANCELADO');
      if (!completed && current[9] === 'CANCELADO' && current[2] && current[3]) tab.getRange(row, 10).setValue('PENDIENTE');
      return mesJson({ ok: true, recordatorios: mesReminders(book).slice(-200) });
    }
    if (body.action === 'saveRecipient') {
      if (!lock.tryLock(20000)) throw new Error('Configuración ocupada. Reintentá.');
      const email = String(body.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150) throw new Error('Correo inválido');
      const book = SpreadsheetApp.openById(MES_PRIMARY_ID);
      const tab = mesTab(book, 'Cat_Destinatarios', MES_RECIPIENT_HEADER, true);
      const rows = tab.getLastRow() > 1 ? tab.getRange(2, 1, tab.getLastRow() - 1, 4).getValues() : [];
      const index = rows.findIndex(r => String(r[0]).trim().toLowerCase() === email);
      const values = [email, String(body.nombre || '').slice(0,120), String(body.area || '').slice(0,120), body.activo === false ? 'INACTIVO' : 'ACTIVO'];
      if (index >= 0) tab.getRange(index + 2, 1, 1, 4).setValues([values]); else tab.appendRow(values);
      return mesJson({ ok: true, destinatarios: mesRecipients(book) });
    }
    if (body.action === 'generateReport') {
      if (!lock.tryLock(20000)) throw new Error('Otro informe está generándose. Reintentá.');
      const book = SpreadsheetApp.openById(MES_PRIMARY_ID);
      return mesJson({ ok: true, informe: mesGenerateReport(book, String(body.id || '')) });
    }
    if (body.action === 'sendReport') {
      if (!lock.tryLock(20000)) throw new Error('Otro informe está enviándose. Reintentá.');
      const book = SpreadsheetApp.openById(MES_PRIMARY_ID);
      const tab = mesTab(book, 'MES_Informes', MES_REPORT_HEADER, false);
      const rows = mesReportRows(book);
      const index = rows.findIndex(r => String(r[0]) === String(body.id));
      if (index < 0) throw new Error('Generá primero el PDF del cierre.');
      const row = rows[index], estado = String(row[7] || '');
      if (estado === 'ENVIADO') return mesJson({ ok: true, duplicate: true, enviadoA: String(row[5]) });
      if (estado === 'ENVIANDO') throw new Error('Envío pendiente de verificación; revisá el correo antes de reintentar.');
      const recipients = mesRecipients(book).filter(r => r.activo).map(r => r.email);
      if (!recipients.length || recipients.length > 20) throw new Error('Configurá entre 1 y 20 destinatarios activos.');
      const file = DriveApp.getFileById(String(row[2]));
      tab.getRange(index + 2, 8).setValue('ENVIANDO');
      MailApp.sendEmail({ to: recipients.join(','), subject: `CMP | Informe Molienda ${row[1]}`,
        body: `Se adjunta el informe de molienda y silo del ${row[1]}.\n\nCierre: ${body.id}`,
        attachments: [file.getBlob().setName(file.getName())] });
      tab.getRange(index + 2, 6, 1, 3).setValues([[recipients.join(', '), new Date(), 'ENVIADO']]);
      return mesJson({ ok: true, enviadoA: recipients.join(', ') });
    }
    if (body.action === 'initializeCones') {
      if (!lock.tryLock(20000)) throw new Error('Inventario ocupado. Reintentá.');
      const book = SpreadsheetApp.openById(MES_PRIMARY_ID);
      const current = mesStock(book);
      if (current.conos.length) throw new Error('Ya hay saldos de conos en la planilla. Recargá valores validados.');
      if (body.expectedEtag !== mesDigest(current)) throw new Error('Los acopios cambiaron. Recargá valores validados.');
      const conos = body.conos;
      if (!Array.isArray(conos) || !conos.length || conos.some(s => !s.id || !s.nombre ||
          !Number.isFinite(Number(s.toneladas)) || Number(s.toneladas) < 0) ||
          new Set(conos.map(s => String(s.id))).size !== conos.length)
        throw new Error('Saldos de conos inválidos');
      const ajuste = mesTab(book, 'MES_Ajustes', MES_ADJUST_HEADER, true);
      ajuste.getRange(ajuste.getLastRow() + 1, 1, conos.length, 6).setValues(conos.map(s =>
        [new Date(), 'cono', s.id, s.nombre, Number(s.toneladas), 'Saldo inicial medido']));
      mesWriteStock(book, { ...current, conos: conos.map(s => ({ ...s, toneladas: Number(s.toneladas) })) }, {});
      return mesJson({ ok: true, etag: mesDigest(mesStock(book)), revision: mesRevision(book) });
    }
    if (body.action === 'adjustStock') {
      if (!lock.tryLock(20000)) throw new Error('Inventario ocupado. Reintentá.');
      const book = SpreadsheetApp.openById(MES_PRIMARY_ID);
      const current = mesStock(book);
      const tab = mesTab(book, 'MES_Ajustes', MES_ADJUST_HEADER, true);
      if (tab.getMaxColumns() < MES_ADJUST_HEADER.length)
        tab.insertColumnsAfter(tab.getMaxColumns(), MES_ADJUST_HEADER.length - tab.getMaxColumns());
      MES_ADJUST_HEADER.forEach((name, i) => { if (!tab.getRange(1, i + 1).getValue())
        tab.getRange(1, i + 1).setValue(name); });
      const idAjuste = String(body.idAjuste || '');
      if (!idAjuste || idAjuste.length > 100) throw new Error('Identificador de ajuste inválido');
      const existing = tab.getLastRow() > 1 ? tab.getRange(2, 7, tab.getLastRow() - 1, 1)
        .createTextFinder(idAjuste).matchEntireCell(true).findNext() : null;
      if (existing) return mesJson({ ok: true, duplicate: true, etag: mesDigest(current) });
      if (body.expectedEtag !== mesDigest(current)) throw new Error('El stock cambió. Recargá los valores antes de ajustar.');
      const tipo = String(body.tipo || '');
      const items = tipo === 'acopio' ? current.acopios : tipo === 'cono' ? current.conos : [];
      const target = items.find(x => String(x.id) === String(body.id));
      const despues = Number(body.toneladas), motivo = String(body.motivo || '').trim(), responsable = String(body.responsable || '').trim();
      if (!target || !Number.isFinite(despues) || despues < 0 || despues > 1000000 ||
          motivo.length < 5 || motivo.length > 500 || !responsable || responsable.length > 120)
        throw new Error('Completá un stock medido válido, motivo y responsable.');
      const antes = Number(target.toneladas);
      if (Math.abs(antes - despues) < 0.001) throw new Error('El stock medido coincide con el registrado.');
      target.toneladas = despues;
      if (tipo === 'cono') target.paladasOperativas = antes > 0
        ? Math.round(Number(target.paladasOperativas || 0) * despues / antes) : 0;
      mesWriteStock(book, current, {});
      tab.appendRow([new Date(), tipo, target.id, target.nombre, despues, motivo, idAjuste,
        antes, Math.round((despues - antes) * 100) / 100, responsable]);
      return mesJson({ ok: true, etag: mesDigest(mesStock(book)), antesTon: antes, despuesTon: despues });
    }
    if (body.action !== 'saveAudit' || body.schema !== 2 || !body.id || !body.data || !body.stock)
      throw new Error('Auditoría incompleta');
    if (!lock.tryLock(20000)) throw new Error('Otra auditoría está registrándose. Reintentá.');
    const book = SpreadsheetApp.openById(MES_PRIMARY_ID);
    const tab = mesTab(book, 'MES_Auditorias', MES_AUDIT_HEADER, true);
    const existing = tab.getRange(1, 1, tab.getLastRow(), 1).createTextFinder(String(body.id)).matchEntireCell(true).findNext();
    if (existing) {
      const row = tab.getRange(existing.getRow(), 1, 1, 6).getValues()[0];
      // Un reintento de la última revisión repara proyecciones parciales.
      if (mesRevision(book) === Number(row[2])) {
        const data = JSON.parse(row[3]);
        mesWriteRecords(book, String(body.id), data);
        mesWriteStock(book, JSON.parse(row[4]), data);
      }
      return mesJson({ ok: true, duplicate: true, revision: mesRevision(book), etag: mesDigest(mesStock(book)) });
    }
    const current = mesStock(book);
    if (body.expectedEtag !== mesDigest(current)) throw new Error('Inventario desactualizado. Recargá los valores validados antes de reintentar.');
    const payload = JSON.stringify(body.data);
    const snapshot = JSON.stringify(body.stock);
    if (payload.length > 45000 || snapshot.length > 45000) throw new Error('Auditoría demasiado extensa para una celda');
    const revision = mesRevision(book) + 1;
    tab.appendRow([String(body.id), String(body.data.Turnos?.[0]?.fecha || ''), revision, payload, snapshot, new Date()]);
    mesWriteRecords(book, String(body.id), body.data);
    mesWriteStock(book, body.stock, body.data);
    return mesJson({ ok: true, revision, etag: mesDigest(mesStock(book)) });
  } catch (error) { return mesJson({ ok: false, error: error.message }); }
  finally { if (lock.hasLock()) lock.releaseLock(); }
}

function mesTelegramCall(method, payload) {
  const token = PropertiesService.getScriptProperties().getProperty('MES_TELEGRAM_BOT_TOKEN');
  if (!token) throw new Error('Falta MES_TELEGRAM_BOT_TOKEN en Propiedades del proyecto.');
  let response;
  try {
    response = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/' + method, {
      method: 'post', contentType: 'application/json', payload: JSON.stringify(payload || {}), muteHttpExceptions: true
    });
  } catch (_) { throw new Error('No se pudo conectar con Telegram. Revisá la conexión y los permisos.'); }
  let data;
  try { data = JSON.parse(response.getContentText()); } catch (_) { throw new Error('Respuesta de Telegram no válida.'); }
  if (response.getResponseCode() !== 200 || !data.ok) throw new Error('Telegram rechazó la operación: HTTP ' + response.getResponseCode());
  return data.result;
}

function verificarTelegram() {
  const bot = mesTelegramCall('getMe');
  console.log('Bot verificado: @' + bot.username);
  return bot.username;
}

function prepararClaveSincronizacion() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('MES_SYNC_TOKEN')) props.setProperty('MES_SYNC_TOKEN', Utilities.getUuid() + Utilities.getUuid());
  console.log('MES_SYNC_TOKEN disponible en Propiedades del proyecto. Copialo solo al servidor.');
}

function instalarRegistroTelegram() {
  verificarTelegram();
  const webhook = mesTelegramCall('getWebhookInfo');
  if (webhook.url) throw new Error('Este bot tiene un webhook activo. Usá un bot exclusivo para Molienda; no se modificó su conexión existente.');
  if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'registrarUsuariosTelegram'))
    ScriptApp.newTrigger('registrarUsuariosTelegram').timeBased().everyMinutes(5).create();
  console.log('Registro habilitado cada cinco minutos. Las altas quedan INACTIVAS hasta aprobación.');
}

function registrarUsuariosTelegram() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    const props = PropertiesService.getScriptProperties();
    const updates = mesTelegramCall('getUpdates', { offset: Number(props.getProperty('MES_TELEGRAM_OFFSET') || 0), limit: 100, timeout: 0, allowed_updates: ['message'] });
    const book = SpreadsheetApp.openById(MES_PRIMARY_ID);
    const tab = mesTab(book, 'Cat_Telegram', MES_TELEGRAM_HEADER, true);
    const existing = new Set(mesTelegramRecipients(book).map(x => x.chatId));
    updates.forEach(update => {
      const message = update.message;
      if (message && message.chat.type === 'private' && /^\/start(?:@\w+)?(?:\s|$)/.test(message.text || '')) {
        const id = String(message.chat.id);
        if (!existing.has(id)) {
          const row = tab.getLastRow() + 1;
          const name = [message.from.first_name, message.from.last_name].filter(Boolean).join(' ').replace(/^[=+@-]/, '');
          tab.getRange(row, 1, 1, 5).setNumberFormat('@').setValues([[id, name, '', 'PENDIENTE', 'INACTIVO']]);
          existing.add(id);
        }
      }
      props.setProperty('MES_TELEGRAM_OFFSET', String(update.update_id + 1));
    });
    console.log('Registro revisado. Consultá Cat_Telegram; no se activaron usuarios automáticamente.');
  } finally { lock.releaseLock(); }
}

function mesReadMap(book) {
  // MES_Plano_Actual es la lectura rápida; MES_Planos queda como historial inmutable.
  const current = book.getSheetByName('MES_Plano_Actual');
  if (current && current.getLastRow() >= 2 && current.getRange(2, 4).getValue()) {
    const row = current.getRange(2, 1, 1, 5).getValues()[0];
    const map = JSON.parse(String(row[3]));
    mesValidateMap(map);
    const revision = Number(row[0]);
    if (!Number.isInteger(revision) || revision < 1) throw new Error('La revisión actual del plano no es válida.');
    return { ok: true, mapProtocol: 2, revision, updatedAt: row[1] instanceof Date ? row[1].toISOString() : String(row[1]), map };
  }
  // Compatibilidad con una publicación anterior que sólo tenía MES_Planos.
  const history = book.getSheetByName('MES_Planos');
  if (!history || history.getLastRow() < 2) return { ok: true, mapProtocol: 2, revision: 0, map: null };
  const row = history.getRange(history.getLastRow(), 1, 1, 3).getValues()[0];
  const map = JSON.parse(String(row[2]));
  mesValidateMap(map);
  const revision = Number(row[0]);
  if (!Number.isInteger(revision) || revision < 1) throw new Error('La revisión del historial del plano no es válida.');
  return { ok: true, mapProtocol: 2, revision, updatedAt: row[1] instanceof Date ? row[1].toISOString() : String(row[1]), map };
}

function mesMapKey(value) {
  return String(value || '').trim().toLocaleLowerCase();
}

function mesCanonicalizeMap(book, map) {
  const beach = book.getSheetByName('AcopiosPlaya');
  const rows = beach && beach.getLastRow() > 1 ? beach.getRange(2, 1, beach.getLastRow() - 1, 8).getValues() : [];
  const byId = new Map(rows.filter(r => r[0] !== '').map(r => [String(r[0]), r]));
  const byName = new Map(rows.filter(r => r[1]).map(r => [mesMapKey(r[1]), r]));
  const ids = new Set();
  map.acopios.forEach(a => {
    const known = byId.get(String(a.id)) || byName.get(mesMapKey(a.nombre));
    if (known) a.id = String(known[0]);
    if (ids.has(String(a.id))) throw new Error('Dos acopios del plano coinciden con el mismo registro de inventario. Cambiá nombre o ID.');
    ids.add(String(a.id));
  });
  return map;
}

function mesMapElementRows(map, revision, updatedAt) {
  const out = [], push = (tipo, item, geo, extras) => {
    const g = geo || {};
    out.push([revision, updatedAt, tipo, String(item.id || ''), String(item.nombre || item.label || tipo),
      item.activo === false || item.visible === false ? 'INACTIVO' : item.esFuturo ? 'PREVISTO' : 'ACTIVO',
      String(item.sector || item.sectorDestino || ''), String(item.forma || ''), Number(g.x || item.x || item.posX || 0),
      Number(g.y || item.y || item.posY || 0), Number(g.w || item.w || item.largoEje || 0), Number(g.h || item.h || item.radioBase || 0),
      Number(g.r || item.r || item.radioBase || 0), Number(item.pisos || 0), JSON.stringify(extras || item)]);
  };
  map.acopios.forEach(a => push('ACOPIO', a));
  map.conos.forEach(c => push('CONO', c, map.posicionConos[c.id]));
  Object.entries(map.posicionCajones).forEach(([id, c]) => push('CAJON', { ...c, id }));
  map.sectoresVirtuales.forEach(x => push('SECTOR', x));
  map.verticesPoligono.forEach((x, i) => push('LIMITE', { ...x, id: x.id || `limite-${i}`, nombre: x.label || `Vértice ${i + 1}` }));
  push('NAVE', { id: 'nave-molienda', nombre: 'Nave de molienda' }, map.posicionNaveMolienda);
  push('SILO', { id: 'bateria-silo', nombre: 'Batería de silo' }, map.posicionSiloConos);
  map.elementosMapa.forEach(x => push('ELEMENTO', x));
  map.reservas.forEach(x => push('RESERVA', { ...x, nombre: x.nombreNuevoAcopio }));
  if (map.referenciaCardinal) push('REFERENCIA_CARDINAL', { ...map.referenciaCardinal, id: 'referencia-cardinal', nombre: 'Referencia cardinal' });
  return out;
}

function mesWriteMap(book, map, revision, updatedAt) {
  const text = JSON.stringify(map);
  const summary = JSON.stringify({ acopios: map.acopios.length, conos: map.conos.length, cajones: Object.keys(map.posicionCajones).length,
    sectores: map.sectoresVirtuales.length, elementos: map.elementosMapa.length, reservas: map.reservas.length });
  const history = mesTab(book, 'MES_Planos', ['revision','actualizado','planoJSON'], true);
  history.appendRow([revision, updatedAt, text]);
  const current = mesTab(book, 'MES_Plano_Actual', MES_MAP_CURRENT_HEADER, true);
  if (current.getLastRow() > 1) current.getRange(2, 1, current.getLastRow() - 1, MES_MAP_CURRENT_HEADER.length).clearContent();
  current.getRange(2, 1, 1, MES_MAP_CURRENT_HEADER.length).setValues([[revision, updatedAt, 'Gestión Molienda', text, summary]]);
  const elements = mesTab(book, 'MES_Plano_Elementos', MES_MAP_ELEMENTS_HEADER, true);
  if (elements.getLastRow() > 1) elements.getRange(2, 1, elements.getLastRow() - 1, MES_MAP_ELEMENTS_HEADER.length).clearContent();
  const rows = mesMapElementRows(map, revision, updatedAt);
  if (rows.length) elements.getRange(2, 1, rows.length, MES_MAP_ELEMENTS_HEADER.length).setValues(rows);
  [history,current,elements].forEach(tab => { tab.setFrozenRows(1); tab.autoResizeColumns(1, Math.min(tab.getLastColumn(), 8)); });
}

function mesEnsureMapInventory(book, map) {
  const stock = mesStock(book);
  map.acopios.forEach(a => {
    let item = stock.acopios.find(x => String(x.id) === String(a.id));
    if (!item) { item = { id: String(a.id), toneladas: 0, m3Estimados: 0 }; stock.acopios.push(item); }
    ['nombre','sector','cuadrante','pisos','activo'].forEach(k => { if (a[k] !== undefined) item[k] = a[k]; });
  });
  map.conos.forEach(c => {
    let item = stock.conos.find(x => String(x.id) === String(c.id));
    if (!item) { item = { id: String(c.id), toneladas: 0, humedadNivel: 1, paladasOperativas: 0 }; stock.conos.push(item); }
    item.nombre = c.nombre; item.activo = c.activo !== false;
  });
  mesWriteStock(book, stock, { AcopiosPlaya: map.acopios });
}

function mesValidateMap(map) {
  const allowed = ['schema','verticesPoligono','sectoresVirtuales','posicionNaveMolienda','posicionSiloConos','posicionCajones','posicionConos','elementosMapa','referenciaCardinal','acopios','conos','reservas','parametros'];
  if (!map || ![1,2].includes(map.schema) || Object.keys(map).some(k => allowed.indexOf(k) < 0)) throw new Error('Formato del plano inválido.');
  ['verticesPoligono','sectoresVirtuales','elementosMapa','acopios'].forEach(k => {
    if (!Array.isArray(map[k]) || map[k].length > 300) throw new Error('Colección del plano inválida: ' + k);
  });
  if (map.verticesPoligono.length < 3) throw new Error('El límite debe tener al menos tres puntos.');
  ['posicionNaveMolienda','posicionSiloConos','posicionCajones','posicionConos'].forEach(k => {
    if (!map[k] || typeof map[k] !== 'object' || Array.isArray(map[k])) throw new Error('Posiciones inválidas: ' + k);
  });
  map.verticesPoligono.forEach(v => { if (!v || !Number.isFinite(v.x) || !Number.isFinite(v.y)) throw new Error('Coordenadas inválidas.'); });
  const ids = new Set();
  const acopioFields = ['id','nombre','sector','cuadrante','pisos','posX','posY','radioBase','largoEje','activo','esFuturo','forma','textura','calidades','recetaId','origenReceta'];
  map.acopios.forEach(a => {
    if (!a || !a.id || typeof a.nombre !== 'string' || ids.has(String(a.id)) || Object.keys(a).some(k => acopioFields.indexOf(k) < 0)) throw new Error('Acopio de plano inválido.');
    ['posX','posY','radioBase','largoEje'].forEach(k => { if (!Number.isFinite(a[k])) throw new Error('Geometría de acopio inválida.'); });
    if (a.textura) {
      const values = ['arcilla','arena','limo'].map(k => a.textura[k]);
      if (values.some(v => !Number.isFinite(v) || v < 0 || v > 100) || (values.reduce((x,y) => x+y,0) !== 0 && Math.abs(values.reduce((x,y) => x+y,0) - 100) > 0.01)) throw new Error('La textura debe sumar 100% o quedar sin evaluar (0%).');
    }
    if (a.calidades && Object.values(a.calidades).some(v => !Number.isFinite(v) || v < 0 || v > 10)) throw new Error('Calidad inválida.');
    if (a.calidades?.Humedad !== undefined && (!Number.isInteger(a.calidades.Humedad) || a.calidades.Humedad > 3)) throw new Error('Humedad inválida.');
    ids.add(String(a.id));
  });
  if (map.schema === 2) {
    if (!Array.isArray(map.conos) || map.conos.length > 300 || !Array.isArray(map.reservas) || map.reservas.length > 300) throw new Error('Elementos de plano inválidos.');
    const coneIds = new Set();
    map.conos.forEach(c => {
      if (!c.id || typeof c.nombre !== 'string' || !c.nombre.trim() || coneIds.has(String(c.id)) || Object.keys(c).some(k => !['id','nombre','activo'].includes(k))) throw new Error('Cono inválido.');
      coneIds.add(String(c.id));
    });
    const p = map.parametros;
    if (!p || !Number.isFinite(p.densidadTierra) || p.densidadTierra <= 0 || p.densidadTierra > 5 || ![3,5,10].includes(p.escalaCalidad) || !Array.isArray(p.caracteristicasTierra)) throw new Error('Parámetros de tierra inválidos.');
    const r = map.referenciaCardinal;
    if (!r || !Number.isFinite(r.x) || !Number.isFinite(r.y) || !Number.isFinite(r.tamano) || !Number.isFinite(r.rotacion) || typeof r.visible !== 'boolean') throw new Error('Referencia cardinal inválida.');
  }
}

function mesMapSnapshot() {
  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(10000)) throw new Error('Se está registrando un cambio. Reintentá.');
    const book = SpreadsheetApp.openById(MES_PRIMARY_ID);
    const snapshot = mesReadMap(book);
    const stock = mesStock(book);
    return { ...snapshot, stock, stockEtag: mesDigest(stock), checkedAt: new Date().toISOString() };
  } finally { if (lock.hasLock()) lock.releaseLock(); }
}
