import { normalizeMetNorway } from '../../../lib/weather.js';

export const runtime = 'edge';

let metCache = null, metExpires = 0, metLastModified = null;

async function metNorway() {
  if (metCache && Date.now() < metExpires) return metCache;
  const url = 'https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=-26.7890&lon=-65.2558';
  const response = await fetch(url, { headers: {
    'User-Agent': 'GestionMoliendaCMP/1.0 (https://gestion-molienda-marcos-paz.ezequielacevedotuc.chatgpt.site)',
    'Accept': 'application/json',
    ...(metLastModified ? { 'If-Modified-Since': metLastModified } : {})
  }, signal: AbortSignal.timeout(10000) });
  const nextExpiry = Date.parse(response.headers.get('Expires') ?? '');
  metExpires = Number.isFinite(nextExpiry) && nextExpiry > Date.now() ? nextExpiry : Date.now() + 30 * 60_000;
  if (response.status === 304 && metCache) return metCache;
  if (!response.ok) throw new Error(`MET Norway devolvió HTTP ${response.status}`);
  metLastModified = response.headers.get('Last-Modified') ?? metLastModified;
  const dias = normalizeMetNorway(await response.json());
  if (!dias.length) throw new Error('MET Norway no devolvió días de pronóstico.');
  metCache = { estado: 'actualizado', dias, ubicacion: 'Playa Molienda · -26.7890, -65.2558',
    atribucion: 'Datos meteorológicos: Norwegian Meteorological Institute · licencia CC BY 4.0',
    enlaceFuente: 'https://api.met.no/', licencia: 'https://creativecommons.org/licenses/by/4.0/' };
  return metCache;
}

export async function GET() {
  const met = await metNorway().catch(error => ({ estado: 'error', dias: [], mensaje: error.message }));
  const payload = { actualizado: new Date().toISOString(), coordenadas: [-26.789032095110457, -65.25581721750703],
    met };
  return Response.json(payload, { headers: { 'Cache-Control': 'private, max-age=300' } });
}
