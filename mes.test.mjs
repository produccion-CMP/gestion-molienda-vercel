import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { normalizeAccuWeather, normalizeWeatherCompany, normalizeMetNorway, describirPronostico } from '../lib/weather.js';
import { parseCsv } from '../lib/csv.js';
import { GET as getWeather } from '../app/api/weather/route.js';
import { nearestWeatherLocation } from '../lib/weather-locations.js';
import { POST as postSheets } from '../app/api/sheets/route.js';
const scriptUrl = 'https://script.google.com/macros/s/AKfycbx0KsVei3Nz-z9qpEu-Pot10qEKTQKJqOl93wsTXdOWHaCM80jnw-wqrTRPrS8zue36/exec';

const source = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const domain = source.slice(source.indexOf('const APPS_SCRIPT_URL'), source.indexOf('const Icons'));
const { calcularBalanceJornada, normalizarTextura, densidadPorHumedad, errorAsistencia } = runInNewContext(
  `${domain}\n({ calcularBalanceJornada, normalizarTextura, densidadPorHumedad, errorAsistencia })`,
  { Intl, Date, Math, Number, String, Error, globalThis: { crypto: { randomUUID: () => 'id' } } }
);

const base = () => ({
  playa: [{ id: 1, nombre: 'Acopio', toneladas: 100, calidades: { Humedad: 1 } }],
  silos: [{ id: 2, nombre: 'Cono 1', toneladas: 0, activo: true }], cajon2: 0,
  ingresos: [], movimientos: [], maquinas: [{ nombre: 'Pala', m3PorPalada: 3 }], densidad: 1.5
});

test('arcilla, arena y limo se mantienen en 100% incluso al llegar a cero', () => {
  const textura = normalizarTextura({ arcilla: 60, arena: 20, limo: 20 }, 'arcilla', 80);
  assert.equal(textura.arcilla + textura.arena + textura.limo, 100);
  assert.equal(textura.arcilla, 80);
  assert.equal(normalizarTextura(textura, 'arena', 0).arena, 0);
});

test('la densidad húmeda crece con el agua sobre base nominal', () => {
  assert.equal(densidadPorHumedad(1.5, 1), 1.5);
  assert.ok(densidadPorHumedad(1.5, 0) < 1.5);
  assert.ok(densidadPorHumedad(1.5, 3) > densidadPorHumedad(1.5, 2));
});

test('recepción, carga a cono y consumo conservan masa y no mutan origen', () => {
  const input = base();
  input.ingresos = [{ origen: 'Cantera', destino: 'Acopio', ingresaronViajes: true, volumenRealTon: 20,
    calidadesEvaluadas: { Humedad: 1 } }];
  input.movimientos = [
    { id: 1, origen: 'Acopio', destino: 'Cono 1', maquina: 'Pala', cantPaladas: 10 },
    { id: 2, origen: 'Cono 1', destino: 'Cajón 3 - En Producción', maquina: 'Pala', cantPaladas: 4 }
  ];
  const result = calcularBalanceJornada(input);
  assert.equal(result.traza.length, 2);
  assert.equal(result.traza[0].toneladas, 45);
  assert.equal(result.acopios[0].toneladas + result.conos[0].toneladas + result.consumo, 120);
  assert.equal(input.playa[0].toneladas, 100);
});

test('Cajón 2 recibe de un acopio, pero no se usa como origen', () => {
  const input = base();
  input.movimientos = [{ origen: 'Acopio', destino: 'Cajón 2 - Entrada Silo', maquina: 'Pala', cantPaladas: 2 }];
  const result = calcularBalanceJornada(input);
  assert.equal(result.cajon2, 9);
  assert.equal(result.acopios[0].toneladas, 91);
  input.movimientos[0].origen = 'Cajón 2 - Entrada Silo';
  assert.throws(() => calcularBalanceJornada(input), /no puede ser origen/);
});

test('consumo a Cajón 1 y puesta en cero conservan las toneladas entre conos', () => {
  const input = base();
  input.silos.push({ id: 3, nombre: 'Cono 2', toneladas: 0, activo: true });
  input.movimientos = [
    { origen: 'Acopio', destino: 'Cono 1', maquina: 'Pala', cantPaladas: 10 },
    { origen: 'Cono 1', destino: 'Cajón 1 - Consumo Silo', maquina: 'Pala', cantPaladas: 3 }
  ];
  input.transferenciasConos = [{ id: 'x', origenId: 2, destinoId: 3 }];
  const result = calcularBalanceJornada(input);
  assert.equal(result.conos[0].toneladas, 0);
  assert.equal(result.conos[1].toneladas, 31.5);
  assert.equal(result.conos[1].paladasOperativas, 7);
  assert.equal(result.acopios[0].toneladas + result.conos[1].toneladas + result.consumo, 100);
});

test('la novedad de asistencia exige horarios coherentes', () => {
  const p = { inicio: '22:00', fin: '06:00', inicioReal: '22:00', finReal: '06:00', estado: 'llegada_tarde' };
  assert.match(errorAsistencia(p), /posterior/);
  p.inicioReal = '22:15'; assert.equal(errorAsistencia(p), '');
  p.estado = 'retiro_temprano'; p.finReal = '05:30'; assert.equal(errorAsistencia(p), '');
  p.estado = 'extras'; p.inicioReal = '21:45'; p.finReal = '06:30'; assert.equal(errorAsistencia(p), '');
});

test('se rechazan faltantes, rutas ilegales y confirmaciones pendientes', () => {
  const input = base();
  input.movimientos = [{ origen: 'Acopio', destino: 'Cono 1', maquina: 'Pala', cantPaladas: 100 }];
  assert.throws(() => calcularBalanceJornada(input), /Stock insuficiente/);
  input.movimientos[0] = { origen: 'Cono 1', destino: 'Acopio', maquina: 'Pala', cantPaladas: 1 };
  input.silos[0].toneladas = 100;
  assert.throws(() => calcularBalanceJornada(input), /Ruta no permitida/);
  input.movimientos = [];
  input.ingresos = [{ origen: 'Cantera', ingresaronViajes: null }];
  assert.throws(() => calcularBalanceJornada(input), /Confirmá los viajes/);
});

test('dos fuentes se normalizan sin inventar medidas faltantes', () => {
  const twc = normalizeWeatherCompany({ validTimeLocal: ['2026-09-23T07:00:00-0300'],
    calendarDayTemperatureMax: [26], calendarDayTemperatureMin: [11], qpfRain: [2.5],
    daypart: [{ precipChance: [30, 60], relativeHumidity: [null, 82], windSpeed: [12, 8] }] });
  assert.equal(twc[0].lluvia, 60);
  assert.equal(twc[0].humedad, 82);
  const accu = normalizeAccuWeather({ DailyForecasts: [{ Date: '2026-09-23T07:00:00-03:00',
    Temperature: { Maximum: { Value: 27 }, Minimum: { Value: 10 } },
    Day: { IconPhrase: 'Soleado' }, Link: 'https://www.accuweather.com/' }] });
  assert.equal(accu[0].max, 27);
  assert.equal(accu[0].lluvia, null);
});

test('pronóstico sin clave usa MET sin exigir otros proveedores', async () => {
  const original = globalThis.fetch;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  globalThis.fetch = async () => new Response(JSON.stringify({ properties: { timeseries: [
    { time: `${today}T15:00:00Z`, data: { instant: { details: {
      air_temperature: 24, relative_humidity: 48, wind_speed: 5 } },
      next_1_hours: { details: { probability_of_precipitation: 35, precipitation_amount: 0.5 },
        summary: { symbol_code: 'partlycloudy_day' } } } }
  ] } }), { headers: { Expires: new Date(Date.now() + 3600000).toUTCString() } });
  try {
    const result = await (await getWeather()).json();
    assert.equal(result.met.estado, 'actualizado');
    assert.equal(result.met.dias[0].fecha, today);
    assert.equal(result.met.dias[0].viento, 18);
    assert.equal(result.met.dias[0].lluviaMm, null);
    assert.equal(result.weather, undefined);
  } finally { globalThis.fetch = original; }
});

test('ubicaciones válidas usan sus coordenadas y cada localidad se selecciona por cercanía', async () => {
  const original = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = async url => { requestedUrl = url; return new Response(JSON.stringify({ properties: { timeseries: [] } })); };
  try {
    const result = await (await getWeather(new Request('https://example.test/api/weather?zona=yerba_buena'))).json();
    assert.equal(result.zona, 'yerba_buena');
    assert.match(requestedUrl, /lat=-26.81298&lon=-65.29543/);
    assert.equal(nearestWeatherLocation(-26.81298, -65.29543), 'yerba_buena');
    const invalid = await getWeather(new Request('https://example.test/api/weather?zona=desconocida'));
    assert.equal(invalid.status, 400);
  } finally { globalThis.fetch = original; }
});

test('búsqueda cercana compara cobertura y elige la localidad con más datos', async () => {
  const { GET: isolatedWeather } = await import('../app/api/weather/route.js?coverage-test');
  const original = globalThis.fetch;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  globalThis.fetch = async url => new Response(JSON.stringify({ properties: { timeseries: [{
    time: `${today}T15:00:00Z`, data: { instant: { details: { air_temperature: 24 } },
      next_1_hours: { details: url.includes('lat=-26.81298') ? { probability_of_precipitation: 65 } : {},
        summary: { symbol_code: 'rain' } } }
  }] } }));
  try {
    const result = await (await isolatedWeather(new Request('https://example.test/api/weather?zona=mejor'))).json();
    assert.equal(result.zonaSeleccionada, 'yerba_buena');
    assert.equal(result.met.dias[0].lluvia, 65);
  } finally { globalThis.fetch = original; }
});

test('MET toma probabilidad de intervalos de seis horas y traduce símbolos', () => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const dias = normalizeMetNorway({ properties: { timeseries: [{ time: `${today}T15:00:00Z`, data: {
    instant: { details: { air_temperature: 22 } }, next_6_hours: { details: { probability_of_precipitation: 70 },
      summary: { symbol_code: 'heavyrain_day' } }
  } }] } });
  assert.equal(dias[0].lluvia, 70);
  assert.equal(describirPronostico(dias[0].descripcion).texto, 'Lluvia intensa');
  assert.equal(dias[0].horas.length, 1);
  assert.equal(dias[0].horas[0].probabilidad, 70);
});

test('el CSV conserva saltos y comillas en los registros', () => {
  assert.deepEqual(parseCsv('Fecha,Nota\r\n2026-09-24,"Pala, turno 2"\r\n2026-09-25,"Una ""nota""\ny silo"\r\n'),
    [['Fecha','Nota'], ['2026-09-24','Pala, turno 2'], ['2026-09-25','Una "nota"\ny silo']]);
  assert.throws(() => parseCsv('Fecha,"incompleto'), /incompleto/);
});

test('el puente a Sheets rechaza URLs ajenas a Apps Script', async () => {
  const request = new Request('https://example.test/api/sheets', { method: 'POST',
    body: JSON.stringify({ url: 'https://example.com/secret', action: 'state' }) });
  const response = await postSheets(request);
  assert.equal(response.status, 400);
});

test('el puente explica un despliegue de Apps Script que devuelve HTML', async () => {
  const original = globalThis.fetch;
  const oldToken = process.env.MES_SYNC_TOKEN;
  process.env.MES_SYNC_TOKEN = 'token-de-prueba';
  globalThis.fetch = async () => new Response('<html>No se encontró doGet</html>', { status: 200 });
  try {
    const request = new Request('https://example.test/api/sheets', { method: 'POST',
      body: JSON.stringify({ url: scriptUrl, action: 'state' }) });
    const response = await postSheets(request);
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /versión nueva/);
  } finally {
    globalThis.fetch = original;
    if (oldToken === undefined) delete process.env.MES_SYNC_TOKEN;
    else process.env.MES_SYNC_TOKEN = oldToken;
  }
});

test('el token de Sheets se inyecta solo desde el servidor', async () => {
  const oldToken = process.env.MES_SYNC_TOKEN;
  const original = globalThis.fetch;
  process.env.MES_SYNC_TOKEN = 'secreto-servidor';
  let requested;
  globalThis.fetch = async url => {
    requested = String(url);
    return Response.json({ ok: true, stock: {}, etag: 'abc' });
  };
  try {
    const request = new Request('https://example.test/api/sheets', { method: 'POST',
      body: JSON.stringify({ url: scriptUrl, action: 'state' }) });
    const response = await postSheets(request);
    assert.equal(response.status, 200);
    assert.equal(new URL(requested).searchParams.get('token'), 'secreto-servidor');
  } finally {
    globalThis.fetch = original;
    if (oldToken === undefined) delete process.env.MES_SYNC_TOKEN;
    else process.env.MES_SYNC_TOKEN = oldToken;
  }
});
