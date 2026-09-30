import { normalizeMetNorway } from '../../../lib/weather.js';
import { WEATHER_LOCATIONS } from '../../../lib/weather-locations.js';

export const runtime = 'edge';
const caches = new Map();

async function metNorway(zone, location) {
  const cached = caches.get(zone);
  if (cached && Date.now() < cached.expires) return cached.data;
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${location.lat}&lon=${location.lon}`;
  const response = await fetch(url, { headers: {
    'User-Agent': 'GestionMoliendaCMP/1.0 (https://gestion-molienda-marcos-paz.ezequielacevedotuc.chatgpt.site)',
    'Accept': 'application/json',
    ...(cached?.lastModified ? { 'If-Modified-Since': cached.lastModified } : {})
  }, signal: AbortSignal.timeout(10000) });
  if (response.status === 304 && cached) {
    cached.expires = Date.now() + 30 * 60_000;
    return cached.data;
  }
  if (!response.ok) throw new Error(`MET Norway devolvió HTTP ${response.status}`);
  const dias = normalizeMetNorway(await response.json());
  if (!dias.length) throw new Error('MET Norway no devolvió días de pronóstico.');
  const data = { estado: 'actualizado', dias, ubicacion: location.nombre,
    atribucion: 'Datos meteorológicos: Norwegian Meteorological Institute · licencia CC BY 4.0',
    enlaceFuente: 'https://api.met.no/', licencia: 'https://creativecommons.org/licenses/by/4.0/' };
  const expiry = Date.parse(response.headers.get('Expires') ?? '');
  caches.set(zone, { data, lastModified: response.headers.get('Last-Modified'),
    expires: Number.isFinite(expiry) && expiry > Date.now() ? expiry : Date.now() + 30 * 60_000 });
  return data;
}

const coverage = (met) => (met.dias ?? []).slice(0, 7).reduce((score, day) => score +
  [day.max, day.min, day.lluvia, day.lluviaMm, day.humedad, day.viento].filter(value => value !== null && value !== undefined).length +
  (day.horas ?? []).filter(hour => hour.probabilidad !== null).length / 24, 0);

export async function GET(request) {
  const zone = request ? new URL(request.url).searchParams.get('zona') ?? 'planta' : 'planta';
  if (zone !== 'mejor' && !Object.hasOwn(WEATHER_LOCATIONS, zone))
    return Response.json({ error: 'Ubicación no válida' }, { status: 400 });
  let selected = zone === 'mejor' ? 'planta' : zone;
  let met;
  if (zone === 'mejor') {
    const candidates = await Promise.all(Object.entries(WEATHER_LOCATIONS).map(async ([key, place]) => ({
      key, data: await metNorway(key, place).catch(() => null)
    })));
    // Se compara cobertura real; en empate se prefiere el punto exacto de la planta.
    const best = candidates.filter(candidate => candidate.data?.dias?.length)
      .sort((a, b) => coverage(b.data) - coverage(a.data))[0];
    if (best) { selected = best.key; met = best.data; }
  }
  const location = WEATHER_LOCATIONS[selected];
  met ??= await metNorway(selected, location).catch(error => ({ estado: 'error', dias: [], mensaje: error.message }));
  const payload = { actualizado: new Date().toISOString(), zona: zone, zonaSeleccionada: selected,
    coordenadas: [location.lat, location.lon], met };
  return Response.json(payload, { headers: { 'Cache-Control': 'private, max-age=300' } });
}
