"use client";
import React, { useEffect, useRef, useState } from 'react';
import { extractSharedMap } from '../lib/shared-map.js';
export default function SharedMapPanel({ draft, editing, authorizeStock, visible, request, onApply, onInventory, onPublished, onStatus, pin, onPin }) {
  const fingerprint = JSON.stringify(draft);
  const [baseline, setBaseline] = useState(null);
  const [revision, setRevision] = useState(null);
  const [message, setMessage] = useState('Consultando plano compartido…');
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const current = useRef({});
  const running = useRef(false);
  const alive = useRef(true);
  const dirty = baseline !== null && fingerprint !== baseline;
  current.current = { draft, fingerprint, baseline, revision, request, onApply, onInventory, onPublished, onStatus, editing, dirty };
  const accept = data => {
    const map = extractSharedMap(data.map);
    current.current.onApply(map);
    setBaseline(JSON.stringify(map)); setRevision(data.revision); setConflict(false);
    current.current.onPublished(map);
    setMessage(`Plano compartido · versión ${data.revision} · ${new Date(data.updatedAt).toLocaleString('es-AR')}`);
  };
  async function refresh(force = false) {
    if (running.current) return;
    if (force && current.current.dirty && !window.confirm('Descartar el borrador sin publicar y cargar la versión compartida?')) return;
    running.current = true;
    try {
      const data = await current.current.request('getMap');
      if (!alive.current) return;
      if (data.mapProtocol !== 2) throw new Error('Actualizá la implementación de Apps Script. Se requiere el protocolo de plano 2.');
      current.current.onInventory(data);
      current.current.onStatus({ connected: true, checkedAt: data.checkedAt, initialized: !!data.map });
      if (!data.map) { setRevision(0); if (current.current.baseline === null) setBaseline(current.current.fingerprint); setMessage('Sin plano publicado. Importá el respaldo correcto y publicalo una vez.'); return; }
      if (!force && current.current.dirty) {
        if (data.revision !== current.current.revision) { setConflict(true); setMessage('Otra persona publicó cambios. Tu borrador está conservado; descargalo antes de cargar la versión compartida.'); }
        return;
      }
      if (force || data.revision !== current.current.revision || current.current.baseline === null) accept(data);
      else setMessage(`Plano compartido · versión ${data.revision} · conexión verificada ${new Date(data.checkedAt).toLocaleTimeString('es-AR')}`);
    } catch (error) { if (alive.current) { setMessage('Sin sincronizar: ' + error.message); current.current.onStatus({ connected: false }); } }
    finally { running.current = false; }
  }
  useEffect(() => {
    alive.current = true; refresh();
    const timer = setInterval(() => refresh(), 30000);
    const focus = () => refresh();
    window.addEventListener('focus', focus); window.addEventListener('online', focus); window.addEventListener('mes-map-refresh', focus);
    return () => { alive.current = false; clearInterval(timer); window.removeEventListener('focus', focus); window.removeEventListener('online', focus); window.removeEventListener('mes-map-refresh', focus); };
  }, []);
  useEffect(() => {
    const warn = e => { if (current.current.dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  async function save() {
    if (revision === null || conflict || busy || running.current) return;
    if (!pin) { setMessage('Ingresá el PIN de publicación configurado en Vercel.'); return; }
    if (revision === 0 && !window.confirm('Publicar este plano inicial para todos? Los saldos existentes en Google Sheets se conservan.')) return;
    setBusy(true); running.current = true;
    const saved = current.current.draft;
    try {
      const data = await request('saveMap', { payload: { action: 'saveMap', expectedRevision: revision, map: saved } });
      if (alive.current) { setRevision(data.revision); setBaseline(JSON.stringify(saved)); onPublished(saved); setMessage(`Guardado para todos · versión ${data.revision}`); }
    } catch (error) { setMessage('No se publicó: ' + error.message); if (/versión|version|conflicto/i.test(error.message)) setConflict(true); }
    finally { setBusy(false); running.current = false; }
    await refresh();
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'plano-borrador.json'; a.click(); URL.revokeObjectURL(url);
  }
  return <section hidden={!visible && !dirty} className="mx-auto max-w-7xl rounded-xl border border-cyan-600 bg-slate-900 text-slate-100 p-4 space-y-3">
    <p role="status" className="text-sm">{message}</p>
    <p className="text-xs text-slate-300">{dirty ? 'Borrador sin publicar. Los demás siguen viendo la última versión guardada.' : 'Actualización automática cada 30 segundos y al volver a la pestaña.'} Las toneladas se consultan en el inventario central; el dibujo no reemplaza saldos.</p>
    <div className="flex flex-wrap gap-3">
      <button type="button" disabled={busy} onClick={() => refresh(true)} className="border border-slate-500 rounded-lg px-3 py-2 text-sm">Cargar versión compartida</button>
      {(editing || dirty) && <><button type="button" onClick={download} className="border border-slate-500 rounded-lg px-3 py-2 text-sm">Descargar borrador del plano</button></>}
      {(editing || authorizeStock) && <label className="text-sm">PIN de publicación (servidor)<input type="password" autoComplete="off" value={pin} onChange={e => onPin(e.target.value)} className="block rounded border border-slate-500 bg-slate-800 text-white p-2" /></label>}
      {editing && <><button type="button" onClick={save} disabled={busy || revision === null || conflict} className="rounded-lg px-3 py-2 text-sm bg-cyan-700 text-white disabled:opacity-40">{busy ? 'Publicando…' : 'Publicar plano para todos'}</button>
      <label className="border border-slate-500 rounded-lg px-3 py-2 text-sm cursor-pointer">Importar plano del respaldo<input type="file" accept=".json" className="hidden" disabled={busy || revision === null} onChange={async e => { const file = e.target.files?.[0]; if (!file) return; try { if (file.size > 8000000) throw new Error('Archivo demasiado grande.'); const map = extractSharedMap(JSON.parse(await file.text())); onApply(map); setMessage('Respaldo importado como borrador. Revisalo y pulsá Publicar plano para todos.'); } catch (error) { setMessage(error.message); } e.target.value = ''; }} /></label></>}
    </div>
  </section>;
}
