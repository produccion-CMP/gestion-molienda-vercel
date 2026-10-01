import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { extractSharedMap } from '../lib/shared-map.js';
const map = extractSharedMap({ verticesPoligono: [{x:0,y:0},{x:1,y:0},{x:1,y:1}], sectoresVirtuales: [], posicionNaveMolienda: {}, posicionSiloConos: {}, posicionCajones: {}, posicionConos: {}, elementosMapa: [], stockPlaya: [{id:1,nombre:'Acopio',posX:1,posY:2,radioBase:3,largoEje:4,toneladas:123}], adminPin:'privado' });
test('el plano compartido no contiene PIN, saldos ni datos de personal', () => {
  assert.equal(map.adminPin, undefined); assert.equal(map.acopios[0].toneladas, undefined);
});
test('dos navegadores no pueden sobrescribir la misma revisión del plano', () => {
  const rows=[['revision','actualizado','planoJSON']];
  const tab={getLastRow:()=>rows.length,getRange:r=>({getValues:()=>[rows[r-1]]}),appendRow:r=>rows.push(r)};
  const book={getSheetByName:()=>tab};
  const ctx=vm.createContext({console,SpreadsheetApp:{openById:()=>book},LockService:{getScriptLock:()=>({tryLock:()=>true,hasLock:()=>true,releaseLock(){}})}});
  vm.runInContext(fs.readFileSync(new URL('../integrations/Code.gs',import.meta.url),'utf8'),ctx);
  ctx.mesAuthorized=()=>true;ctx.mesJson=x=>x;ctx.mesTab=()=>tab;
  const save=revision=>ctx.doPost({postData:{contents:JSON.stringify({action:'saveMap',expectedRevision:revision,map})}});
  assert.equal(save(0).revision,1);
  assert.match(save(0).error,/Conflicto/);assert.equal(rows.length,2);
  assert.equal(save(1).revision,2);
  assert.equal(ctx.mesReadMap(book).map.acopios[0].nombre,'Acopio');
  assert.throws(()=>ctx.mesValidateMap({...map,adminPin:'secreto'}),/inválido/);
});
