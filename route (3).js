import { parseCsv } from '../../../lib/csv.js';

export const runtime = 'nodejs';

const SOURCE = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTahPDQ0JWVDhx7bb74pxh3wNa3rORRCBIqFqBEiavIiKN6CjlQyAQXF9TLLSkQZp1uC0t62774yPEv/pub?gid=1381238472&single=true&output=csv';
let cache = null, expires = 0;

async function readHistory() {
  const response = await fetch(SOURCE, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`La publicación histórica respondió HTTP ${response.status}`);
  if (Number(response.headers.get('content-length')) > 10_000_000) throw new Error('El CSV supera 10 MB');
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 10_000_000) throw new Error('El CSV supera 10 MB');
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const buffer = new Uint8Array(size);
  let pos = 0;
  for (const chunk of chunks) { buffer.set(chunk, pos); pos += chunk.byteLength; }
  const parsed = parseCsv(new TextDecoder().decode(buffer).replace(/^\uFEFF/, ''));
  if (!parsed.length) throw new Error('El CSV histórico está vacío');
  const campos = [57, 2, 1, 3, 21, 32, 33, 60, 61, 62, 83, 84, 85, 90];
  return {
    encabezados: ['Fecha (BF)', 'Turno (C)', 'Supervisor', 'Novedades molienda y silo', 'Maquinista molienda', 'Producción molienda', 'Pala molienda', 'Producción silo', 'Pala silo', 'Maquinista silo', 'Tiempo de silo', 'Toneladas molidas a silo', 'Cargando en cono', 'Balanza de producción'],
    filas: parsed.slice(1).filter(r => r.some(v => v.trim())).filter(r => r[57] && r[2]).map(r => campos.map(i => r[i] ?? ''))
  };
}

export async function GET(request) {
  const offset = Math.max(0, Math.min(1_000_000, Math.floor(Number(new URL(request.url).searchParams.get('offset')) || 0)));
  try {
    if (!cache || Date.now() >= expires) {
      cache = await readHistory(); expires = Date.now() + 15 * 60_000;
    }
    const totalFilas = cache.filas.length;
    const filas = cache.filas.slice(Math.max(0, totalFilas - offset - 100), totalFilas - offset).reverse();
    return Response.json({ ok: true, origen: 'csv_publicado', seleccionado: 1381238472,
      tabs: [{ gid: 1381238472, nombre: 'Novedades y producción · CSV publicado', filas: totalFilas + 1 }],
      encabezados: cache.encabezados, filas, totalFilas, offset, hayMas: offset + filas.length < totalFilas,
      actualizado: new Date(expires - 15 * 60_000).toISOString() },
    { headers: { 'Cache-Control': 'private, max-age=300' } });
  } catch (error) {
    return Response.json({ ok: false, error: `No se pudo leer el CSV publicado: ${error.message}` }, { status: 502 });
  }
}
