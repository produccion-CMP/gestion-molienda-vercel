const numeric = value => value === null || value === undefined || value === '' ? null :
  Number.isFinite(Number(value)) ? Number(value) : null;

const maximum = values => {
  const numbers = values.map(numeric).filter(value => value !== null);
  return numbers.length ? Math.max(...numbers) : null;
};

export function describirPronostico(codigo = '') {
  const s = String(codigo).toLowerCase().replace(/[_-]/g, ' ');
  if (/thunder/.test(s)) return { emoji: '⛈️', texto: 'Tormentas' };
  if (/snow|sleet/.test(s)) return { emoji: '🌨️', texto: 'Nieve o aguanieve' };
  if (/heavy.*rain|rain.*heavy/.test(s)) return { emoji: '🌧️', texto: 'Lluvia intensa' };
  if (/rain|drizzle|showers/.test(s)) return { emoji: '🌦️', texto: 'Lluvias o chaparrones' };
  if (/fog/.test(s)) return { emoji: '🌫️', texto: 'Niebla' };
  if (/cloudy|cloud/.test(s)) return { emoji: '☁️', texto: /partly|fair/.test(s) ? 'Parcialmente nublado' : 'Nublado' };
  if (/clear|sun/.test(s)) return { emoji: '☀️', texto: 'Despejado' };
  return { emoji: '🌤️', texto: 'Condiciones variables' };
}

export function normalizeWeatherCompany(data) {
  const daypart = data?.daypart?.[0] ?? {};
  const dates = data?.validTimeLocal ?? [];
  return dates.slice(0, 5).map((value, index) => {
    const daytime = index * 2;
    const night = daytime + 1;
    return {
      fecha: String(value).slice(0, 10),
      max: numeric(data.calendarDayTemperatureMax?.[index] ?? data.temperatureMax?.[index]),
      min: numeric(data.calendarDayTemperatureMin?.[index] ?? data.temperatureMin?.[index]),
      lluvia: maximum([daypart.precipChance?.[daytime], daypart.precipChance?.[night]]),
      lluviaMm: numeric(data.qpfRain?.[index]),
      humedad: numeric(daypart.relativeHumidity?.[daytime] ?? daypart.relativeHumidity?.[night]),
      viento: numeric(daypart.windSpeed?.[daytime] ?? daypart.windSpeed?.[night]),
      descripcion: String(data.narrative?.[index] ?? daypart.wxPhraseLong?.[daytime] ?? ''),
      enlace: 'https://weather.com/'
    };
  });
}

export function normalizeAccuWeather(data) {
  return (data?.DailyForecasts ?? []).slice(0, 5).map(day => ({
    fecha: String(day.Date ?? '').slice(0, 10),
    max: numeric(day.Temperature?.Maximum?.Value),
    min: numeric(day.Temperature?.Minimum?.Value),
    lluvia: maximum([day.Day?.PrecipitationProbability, day.Night?.PrecipitationProbability,
      day.Day?.RainProbability, day.Night?.RainProbability]),
    lluviaMm: numeric(day.Day?.TotalLiquid?.Value),
    humedad: numeric(day.Day?.RelativeHumidity?.Average ?? day.Day?.RelativeHumidity),
    viento: numeric(day.Day?.Wind?.Speed?.Value),
    descripcion: String(day.Day?.LongPhrase ?? day.Day?.IconPhrase ?? ''),
    enlace: String(day.Link ?? 'https://www.accuweather.com/')
  })).filter(day => day.fecha);
}

export function normalizeWeatherApi(data) {
  return (data?.forecast?.forecastday ?? []).slice(0, 7).map(({ date, day }) => ({
    fecha: String(date ?? ''), max: numeric(day?.maxtemp_c), min: numeric(day?.mintemp_c),
    lluvia: numeric(day?.daily_chance_of_rain), lluviaMm: numeric(day?.totalprecip_mm),
    humedad: numeric(day?.avghumidity), viento: numeric(day?.maxwind_kph),
    descripcion: String(day?.condition?.text ?? ''), enlace: 'https://www.weatherapi.com/'
  })).filter(d => d.fecha);
}

// Los valores de MET son intervalos horarios. Se usa next_1_hours para evitar
// sumar ventanas superpuestas; los días incompletos no reciben un total en mm.
export function normalizeMetNorway(data, now = new Date()) {
  const daily = new Map();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const dateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit' });
  for (const point of data?.properties?.timeseries ?? []) {
    const fecha = dateFormat.format(new Date(point.time));
    if (fecha < today) continue;
    const instant = point.data?.instant?.details ?? {};
    const hour = point.data?.next_1_hours;
    const p = daily.get(fecha) ?? { fecha, temperaturas: [], humedades: [], vientos: [], probabilidades: [],
      precipitaciones: [], simbolo: '', horas: [] };
    if (numeric(instant.air_temperature) !== null) p.temperaturas.push(Number(instant.air_temperature));
    if (numeric(instant.relative_humidity) !== null) p.humedades.push(Number(instant.relative_humidity));
    if (numeric(instant.wind_speed) !== null) p.vientos.push(Number(instant.wind_speed) * 3.6);
    const probabilidad = numeric(hour?.details?.probability_of_precipitation) ??
      numeric(point.data?.next_6_hours?.details?.probability_of_precipitation) ??
      numeric(point.data?.next_12_hours?.details?.probability_of_precipitation);
    if (probabilidad !== null) p.probabilidades.push(probabilidad);
    if (numeric(hour?.details?.precipitation_amount) !== null)
      p.precipitaciones.push(Number(hour.details.precipitation_amount));
    p.simbolo ||= hour?.summary?.symbol_code ?? point.data?.next_6_hours?.summary?.symbol_code ??
      point.data?.next_12_hours?.summary?.symbol_code ?? '';
    p.horas.push({ hora: new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires',
      hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(point.time)),
      temperatura: numeric(instant.air_temperature), probabilidad,
      lluviaMm: numeric(hour?.details?.precipitation_amount),
      simbolo: hour?.summary?.symbol_code ?? point.data?.next_6_hours?.summary?.symbol_code ?? '',
      viento: numeric(instant.wind_speed) === null ? null : Math.round(Number(instant.wind_speed) * 3.6) });
    daily.set(fecha, p);
  }
  return [...daily.values()].slice(0, 7).map(p => ({
    fecha: p.fecha,
    max: p.temperaturas.length ? Math.round(Math.max(...p.temperaturas)) : null,
    min: p.temperaturas.length ? Math.round(Math.min(...p.temperaturas)) : null,
    lluvia: p.probabilidades.length ? Math.round(Math.max(...p.probabilidades)) : null,
    lluviaMm: p.precipitaciones.length >= 20 ? Math.round(p.precipitaciones.reduce((a, b) => a + b, 0) * 10) / 10 : null,
    humedad: p.humedades.length ? Math.round(p.humedades.reduce((a, b) => a + b, 0) / p.humedades.length) : null,
    viento: p.vientos.length ? Math.round(Math.max(...p.vientos)) : null,
    descripcion: p.simbolo.replace(/_/g, ' ').replace(/\bday\b|\bnight\b|\bpolartwilight\b/g, '').trim(),
    horas: p.horas,
    enlace: 'https://www.met.no/en/weather-and-climate'
  }));
}
