import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { extractSharedMap, mergeMapItems, withInventory } from '../lib/shared-map.js';
const map = extractSharedMap({ verticesPoligono: [{x:0,y:0},{x:1,y:0},{x:1,y:1}], sectoresVirtuales: [], posicionNaveMolienda: {}, posicionSiloConos: {}, posicionCajones: {}, posicionConos: {}, elementosMapa: [], stockPlaya: [{id:1,nombre:'Acopio',posX:1,posY:2,radioBase:3,largoEje:4,toneladas:123}], adminPin:'privado' });
test('el plano compartido no contiene PIN, saldos ni datos de personal', () => {
  assert.equal(map.adminPin, undefined); assert.equal(map.acopios[0].toneladas, undefined);
});
test('dos navegadores no pueden sobrescribir la misma revisión del plano', () => {
  const rows=[['revision','actualizado','planoJSON']];
  const tab={getLastRow:()=>rows.length,getRange:r=>({getValues:()=>[rows[r-1]],getValue:()=>''}),appendRow:r=>rows.push(r)};
  const book={getSheetByName:()=>tab};
  const ctx=vm.createContext({console,SpreadsheetApp:{openById:()=>book},LockService:{getScriptLock:()=>({tryLock:()=>true,hasLock:()=>true,releaseLock(){}})}});
  vm.runInContext(fs.readFileSync(new URL('../integrations/Code.gs',import.meta.url),'utf8'),ctx);
  ctx.mesStock=()=>({acopios:[],conos:[],cajon2:0});ctx.mesAuthorized=()=>true;ctx.mesJson=x=>x;ctx.mesTab=()=>tab;
  ctx.mesCanonicalizeMap=(_book,value)=>value;ctx.mesEnsureMapInventory=()=>{};ctx.mesWriteMap=(_book,value,revision,updatedAt)=>tab.appendRow([revision,updatedAt,JSON.stringify(value)]);
  const save=revision=>ctx.doPost({postData:{contents:JSON.stringify({action:'saveMap',expectedRevision:revision,map})}});
  assert.equal(save(0).revision,1);
  assert.match(save(0).error,/Conflicto/);assert.equal(rows.length,2);
  assert.equal(save(1).revision,2);
  assert.equal(ctx.mesReadMap(book).map.acopios[0].nombre,'Acopio');
  ctx.mesStock=()=>({acopios:[{id:1,toneladas:20}],conos:[],cajon2:0});
  const removed=ctx.doPost({postData:{contents:JSON.stringify({action:'saveMap',expectedRevision:2,map:{...map,acopios:[]}})}});
  assert.match(removed.error,/Conciliá/);assert.equal(rows.length,3);
  const invalid=structuredClone(map);invalid.acopios[0].textura={arcilla:80,arena:50,limo:10};
  assert.throws(()=>ctx.mesValidateMap(invalid),/100%/);
  assert.match(ctx.doPost({postData:{contents:JSON.stringify({action:'saveMap',expectedRevision:2,map:{...map,schema:1}})}}).error,/Actualizá/);
  assert.throws(()=>ctx.mesValidateMap({...map,adminPin:'secreto'}),/inválido/);
});

test('formas, propiedades, conos, reservas y parámetros se conservan sin saldos', () => {
  const value=extractSharedMap({...map,acopios:[{...map.acopios[0],forma:'triangulo',calidades:{Humedad:2},textura:{arcilla:60,arena:20,limo:20}}],
    conos:[{id:'c1',nombre:'Cono nuevo',activo:false,toneladas:15}],reservas:[{id:'r1',nombreNuevoAcopio:'Previsto'}],parametros:{densidadTierra:1.6,escalaCalidad:5,caracteristicasTierra:[]}});
  assert.equal(value.acopios[0].forma,'triangulo');assert.equal(value.acopios[0].calidades.Humedad,2);
  assert.equal(value.conos[0].activo,false);assert.equal(value.conos[0].toneladas,undefined);
  assert.equal(value.reservas[0].nombreNuevoAcopio,'Previsto');assert.equal(value.parametros.escalaCalidad,5);
});
test('aplicar un plano no conserva propiedades locales obsoletas ni elimina inventarios', () => {
  const merged=mergeMapItems([{...map.acopios[0],origenReceta:'viejo',toneladas:123},{id:99,nombre:'Otro',toneladas:8}],map.acopios);
  assert.equal(merged[0].origenReceta,undefined);assert.equal(merged[0].toneladas,123);
  assert.equal(merged[1].enPlano,false);assert.equal(merged[1].toneladas,8);
  assert.deepEqual(extractSharedMap({...map,acopios:merged}).acopios,map.acopios);
});
test('la vista usa el saldo central por ID y calcula el volumen con humedad', () => {
  const item=withInventory({...map.acopios[0],calidades:{Humedad:2}},[{id:'1',nombre:'Viejo',toneladas:33.4}],1.6);
  assert.equal(item.nombre,'Acopio');assert.equal(item.toneladas,33.4);assert.equal(item.m3Estimados,20);
});

test('el PIN de publicación se valida en servidor y la acción no puede sustituirse en el payload', async () => {
  const { POST }=await import('../app/api/sheets/route.js');
  const oldFetch=global.fetch,oldToken=process.env.MES_SYNC_TOKEN,oldPin=process.env.MES_MAP_PIN;
  process.env.MES_SYNC_TOKEN='sync-test';process.env.MES_MAP_PIN='pin-test-123';
  const url='https://script.google.com/macros/s/AKfycbx0KsVei3Nz-z9qpEu-Pot10qEKTQKJqOl93wsTXdOWHaCM80jnw-wqrTRPrS8zue36/exec';
  const req=mapPin=>new Request('http://localhost/api/sheets',{method:'POST',body:JSON.stringify({url,action:'saveMap',mapPin,payload:{action:'saveAudit'}})});
  try {
    global.fetch=()=>{throw new Error('No debe llamar a Google');};
    assert.equal((await POST(req('incorrecto'))).status,401);
    let sent;global.fetch=async (_url,opts)=>{sent=JSON.parse(opts.body);return new Response('{"ok":true}');};
    assert.equal((await POST(req('pin-test-123'))).status,200);assert.equal(sent.action,'saveMap');assert.equal(sent.mapPin,undefined);
  } finally {
    global.fetch=oldFetch;
    if(oldToken===undefined)delete process.env.MES_SYNC_TOKEN;else process.env.MES_SYNC_TOKEN=oldToken;
    if(oldPin===undefined)delete process.env.MES_MAP_PIN;else process.env.MES_MAP_PIN=oldPin;
  }
});

test('la hoja de elementos contiene todos los objetos del plano para consulta común', () => {
  const ctx=vm.createContext({console});
  vm.runInContext(fs.readFileSync(new URL('../integrations/Code.gs',import.meta.url),'utf8'),ctx);
  const full=extractSharedMap({...map,conos:[{id:'cono-1',nombre:'Cono 1',activo:true}], reservas:[{id:'r1',nombreNuevoAcopio:'Acopio previsto'}], parametros:{densidadTierra:1.5,escalaCalidad:3,caracteristicasTierra:[]},
    posicionCajones:{c1:{nombre:'Cajón 1',x:2,y:3,w:4,h:5,visible:true}}, elementosMapa:[{id:'e1',nombre:'Balanza',x:3,y:4,w:5,h:6,forma:'rectangulo',color:'#fff'}]});
  const rows=ctx.mesMapElementRows(full,7,'2026-10-01T00:00:00Z');
  assert.deepEqual(new Set(rows.map(r=>r[2])),new Set(['ACOPIO','CONO','CAJON','LIMITE','NAVE','SILO','ELEMENTO','RESERVA','REFERENCIA_CARDINAL']));
  assert.equal(rows.find(r=>r[2]==='ACOPIO')[4],'Acopio');assert.equal(rows.find(r=>r[2]==='CONO')[4],'Cono 1');
});
