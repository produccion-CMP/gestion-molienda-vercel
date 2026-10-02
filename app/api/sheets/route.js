import { timingSafeEqual } from 'node:crypto';

export const maxDuration = 60;
export const runtime = 'nodejs';

const DEFAULT_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx0KsVei3Nz-z9qpEu-Pot10qEKTQKJqOl93wsTXdOWHaCM80jnw-wqrTRPrS8zue36/exec';
const isAppsScriptUrl = raw => {
  try {
    const url = new URL(raw);
    const configured = new URL(process.env.MES_APPS_SCRIPT_URL || DEFAULT_SCRIPT_URL);
    return url.origin === configured.origin && url.pathname === configured.pathname &&
      !url.search && !url.hash;
  } catch { return false; }
};

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return Response.json({ ok: false, error: 'JSON inválido' }, { status: 400 }); }
  if (!isAppsScriptUrl(body.url)) return Response.json({ ok: false, error: 'URL de Apps Script inválida' }, { status: 400 });
  if (!['state', 'historical', 'productionHistory', 'getMap', 'saveMap', 'savePlan', 'saveAudit', 'initializeCones', 'adjustStock', 'saveRecipient', 'generateReport', 'sendReport',
    'saveTelegramRecipient', 'saveReminder', 'completeReminder'].includes(body.action))
    return Response.json({ ok: false, error: 'Acción no permitida' }, { status: 400 });
  if (['saveMap', 'adjustStock'].includes(body.action)) {
    const expected = process.env.MES_MAP_PIN;
    if (!expected || expected.length < 8) return Response.json({ ok: false, error: 'Configurá MES_MAP_PIN en Vercel con al menos 8 caracteres.' }, { status: 503 });
    const a = Buffer.from(String(body.mapPin || '')), b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a,b)) return Response.json({ ok: false, error: 'PIN de publicación incorrecto.' }, { status: 401 });
  }
  const token = process.env.MES_SYNC_TOKEN;
  if (!token) return Response.json({ ok: false, error: 'Falta MES_SYNC_TOKEN en los secretos del servidor.' }, { status: 503 });
  try {
    const url = new URL(body.url);
    let response;
    if (!['state', 'historical', 'productionHistory', 'getMap'].includes(body.action)) {
      response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ ...body.payload, action: body.action, token }), signal: AbortSignal.timeout(45000) });
    } else {
      url.searchParams.set('action', body.action);
      url.searchParams.set('token', token);
      if (['historical', 'productionHistory'].includes(body.action)) {
        if (Number.isInteger(body.gid)) url.searchParams.set('gid', String(body.gid));
        if (Number.isInteger(body.offset) && body.offset >= 0) url.searchParams.set('offset', String(body.offset));
      }
      response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
    }
    if (!response.ok) throw new Error(`Google respondió HTTP ${response.status}`);
    const text = await response.text();
    if (text.length > 2_000_000) throw new Error('La respuesta de la planilla excede el límite');
    if (!text.trimStart().startsWith('{'))
      throw new Error('El despliegue de Apps Script no devolvió JSON. Guardá el código compatible y actualizá la implementación con una versión nueva; verificá que doGet y doPost estén publicados.');
    const result = JSON.parse(text);
    return Response.json(result, { status: result.ok === false ? 409 : 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ ok: false, error: `No se pudo consultar Apps Script: ${String(error.message).replaceAll(token, '[redactado]')}` }, { status: 502 });
  }
}
