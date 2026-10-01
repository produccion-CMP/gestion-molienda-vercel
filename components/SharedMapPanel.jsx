"use client";
import React, { useEffect, useRef, useState } from 'react';
import { extractSharedMap } from '../lib/shared-map.js';
export default function SharedMapPanel({ draft, editing, request, onApply }) {
  const fingerprint = JSON.stringify(draft);
  const [baseline, setBaseline] = useState(fingerprint);
  const [revision, setRevision] = useState(null);
  const [message, setMessage] = useState('Consultando plano compartido…');
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const current = useRef({});
  const running = useRef(false);
  const alive = useRef(true);
  current.current = { draft, fingerprint, baseline, revision, request, onApply, editing };
  const accept = data => {
    const map = extractSharedMap(data.map);
    current.current.onApply(map);
    setBaseline(JSON.stringify(map)); setRevision(data.revision); setConflict(false);
    setMessage(`Plano compartido · versión ${data.revision} · ${new Date(data.updatedAt).toLocaleString('es-AR')}`);
  };
  async function refresh(force = false) {
    if (running.current) return;
    if (force && current.current.fingerprint !== current.current.baseline && !window.confirm('Descartar los cambios del plano sin publicar y cargar la versión compartida?')) return;
    running.current = true;
    try {
      const data = await current.current.request('getMap');
      if (!alive.current) return;
      if (data.mapProtocol !== 1) throw new Error('Actualizá la implementación de Apps Script para habilitar el plano compartido.');
      if (!data.map) { setRevision(0); setMessage('Todavía no hay plano compartido. Importá el respaldo correcto en el editor y publicalo una vez.'); return; }
      const dirty = current.current.fingerprint !== current.current.baseline;
      if (!force && dirty) {
        if (data.revision !== current.current.revision) { setConflict(true); setMessage('Otra persona publicó una versión. Conservamos tus cambios locales; recargá la versión compartida antes de editar de nuevo.'); }
        return;
      }
      if (force || data.revision !== current.current.revision) accept(data);
    } catch (error) { if (alive.current) setMessage('Sin sincronizar: ' + error.message); }
    finally { running.current = false; }
  }
  useEffect(() => {
    alive.current = true; refresh();
    const timer = setInterval(() => refresh(), 30000);
    const focus = () => refresh(); window.addEventListener('focus', focus);
    return () => { alive.current = false; clearInterval(timer); window.removeEventListener('focus', focus); };
  }, []);
  async function save() {
    if (revision === null || conflict || busy || running.current) return;
    if (revision === 0 && !window.confirm('Publicar este plano como versión inicial para todos los usuarios? No se reemplazan los saldos de inventario.')) return;
    setBusy(true); running.current = true;
    const saved = current.current.draft;
    try {
      const data = await request('saveMap', { payload: { action: 'saveMap', expectedRevision: revision, map: saved } });
      if (alive.current) { setRevision(data.revision); setBaseline(JSON.stringify(saved)); setMessage(`Guardado para todos · versión ${data.revision}`); }
    } catch (error) { setMessage('No se publicó: ' + error.message); if (/versión|version|conflicto/i.test(error.message)) setConflict(true); }
    finally { setBusy(false); running.current = false; }
  }
  return <section className="rounded-xl border border-cyan-600 bg-slate-900 text-slate-100 p-4 space-y-3">
    <p role="status" className="text-sm">{message}</p>
    <p className="text-xs text-slate-300">{fingerprint !== baseline ? 'Cambios del plano sin publicar.' : 'Consulta automática cada 30 segundos mientras esta vista está abierta.'} El plano compartido no reemplaza los saldos de inventario ni los borradores de planificación.</p>
    <div className="flex flex-wrap gap-3">
      <button type="button" disabled={busy} onClick={() => refresh(true)} className="border border-slate-500 rounded-lg px-3 py-2 text-sm">Cargar versión compartida</button>
      {editing && <><button type="button" onClick={save} disabled={busy || revision === null || conflict} className="rounded-lg px-3 py-2 text-sm bg-cyan-700 text-white disabled:opacity-40">{busy ? 'Publicando…' : 'Publicar plano para todos'}</button>
      <label className="border border-slate-500 rounded-lg px-3 py-2 text-sm cursor-pointer">Importar solo el plano del respaldo<input type="file" accept=".json" className="hidden" disabled={busy} onChange={async e => { const file = e.target.files?.[0]; if (!file) return; try { if (file.size > 8000000) throw new Error('Archivo demasiado grande.'); const map = extractSharedMap(JSON.parse(await file.text())); onApply(map); setMessage('Plano importado localmente. Revisalo y pulsá Publicar plano para todos.'); } catch (error) { setMessage(error.message); } e.target.value = ''; }} /></label></>}
    </div>
  </section>;
}
