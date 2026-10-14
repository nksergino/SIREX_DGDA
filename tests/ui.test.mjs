import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import React from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://test.invalid/'});
globalThis.window=dom.window;globalThis.document=dom.window.document;
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const member={user_id:'u1',full_name:'Agent test',role:'super_admin',province:null,active:true};
const operator={id:'o1',company_name:'Entreprise test',registration_number:'RCCM',province:'Kinshasa',status:'actif'};
const act={id:'a1',reference:'ACT1',operator_id:'o1',act_type:'exoneration',start_date:'2026-01-01',end_date:'2027-12-31',status:'valide',province:'Kinshasa',authorized_value:1000,consumed_value:0,currency:'USD',operator:{id:'o1',company_name:'Entreprise test'}};
const declaration={id:'d1',operator_id:'o1',declaration_number:'DEC1',office:'101B',declared_date:'2026-10-13',status:'en_attente',declared_value:200,currency:'USD',act:{id:'a1',reference:'ACT1'},operator:{company_name:'Entreprise test'}};
const alert={id:'n1',title:'Alerte test',detail:'Écart test',severity:'attention',province:'Kinshasa',status:'ouverte',created_at:'2026-10-13T10:00:00Z'};
const tables={sirex_members:[member],sirex_operators:[operator],sirex_acts:[act],sirex_declarations:[declaration],sirex_alerts:[alert],sirex_audit_logs:[{id:'log1',action:'INSERT',entity_type:'sirex_operators',entity_id:'o1',actor_id:'u1',created_at:'2026-10-13T10:00:00Z',details:{province:'Kinshasa'}}],sirex_declaration_items:[{declaration_id:'d1',description:'Pompe',hs_code:'8413',quantity:2,unit:'PCS',cif_value:200,currency:'USD'}]};
const rpcCalls=[];
const backend={auth:{onAuthStateChange(callback){queueMicrotask(()=>callback('INITIAL_SESSION',{user:{id:'u1'}}));return {data:{listener:null,subscription:{unsubscribe(){}}}};},async signOut(){return {error:null};}},from(table){
 let single=false,patch=null,filter=null;
 const query={select(){return query;},order(){return query;},range(){return query;},limit(){return query;},eq(key,value){filter=[key,value];return query;},update(value){patch=value;return query;},upsert(value){patch=value;return query;},maybeSingle(){single=true;return query;},single(){single=true;return query;},then(resolve,reject){
  const rows=(tables[table]||[]).filter(row=>!filter||row[filter[0]]===filter[1]);if(patch) rows.forEach(row=>Object.assign(row,patch));
  return Promise.resolve({data:single?(rows[0]||null):rows.map(row=>({...row})),error:null}).then(resolve,reject);
 }};return query;
},async rpc(name,args){rpcCalls.push({name,args});
 if(name==='sirex_import_declarations')return {data:{declarations:args.p_declarations.length,articles:args.p_declarations.reduce((n,d)=>n+d.items.length,0)},error:null};
 if(name==='sirex_act_balances')return {data:[{item_id:'i1',description:'Pompe à eau',hs_code:'8413',unit:'PCS',currency:'USD',authorized_quantity:10,imported_quantity:2,remaining_quantity:8,authorized_value:1000,imported_value:200,remaining_value:800,ambiguous:false}],error:null};
 return {data:[],error:null};}};
const nativeRequire=createRequire(import.meta.url),cache=new Map();
function component(relative){
 const filename=path.resolve(relative);if(cache.has(filename))return cache.get(filename).exports;
 const source=readFileSync(filename,'utf8');const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2020}}).outputText;
 const module={exports:{}};cache.set(filename,module);
 const require=name=>{
  if(name==='@/lib/supabase')return {supabase:backend,isConfigured:true};
  if(name.startsWith('@/')){const p=path.resolve('src',name.slice(2));return component(p+(p.includes('/lib/')?'.ts':'.tsx'));}
  return nativeRequire(name);
 };
 new Function('require','module','exports',output)(require,module,module.exports);return module.exports;
}
function button(label){const found=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===label);assert.ok(found,`button ${label}`);return found;}
async function click(label){await React.act(async()=>{button(label).click();await new Promise(r=>setTimeout(r,0));});}
test('workspace displays object relations, open anomalies and refreshed actions; admin modules render',async()=>{
 const App=component('src/App.tsx').default;
 const root=createRoot(document.getElementById('root'));
 await React.act(async()=>{root.render(React.createElement(App));await new Promise(r=>setTimeout(r,0));});
 assert.match(document.body.textContent,/Bonjour, Agent test/);
 await click('Arrêtés & décisions');assert.match(document.querySelector('.workspace-page').textContent,/Entreprise test/);
 await click('Anomalies');assert.match(document.querySelector('.alert-list').textContent,/Alerte test/);
 await click('Prendre en charge');
 const selects=document.querySelectorAll('.registry-filters select');
 await React.act(async()=>{selects[1].value='en_cours';selects[1].dispatchEvent(new window.Event('change',{bubbles:true}));});
 assert.ok(button('Résoudre'));
 await click('Apurement');await click('Contrôler');assert.match(document.body.textContent,/aucun écart détecté/);
 await click('Valider');assert.ok(button('Annuler la validation'));assert.match(document.querySelector('.operator-summary').textContent,/Validées1/);
 await click('Déclarations');await click('Voir');assert.match(document.body.textContent,/Articles déclarés pour le contrôle/);assert.match(document.body.textContent,/Annulez la validation/);await click('Fermer');
 await click('Utilisateurs');assert.match(document.body.textContent,/Habiliter un compte existant/);
 await click('Journal d’audit');assert.match(document.querySelector('.workspace-page').textContent,/INSERT/);
 await React.act(async()=>root.unmount());
});
test('consultation mode has no anomaly write actions',async()=>{
 const Component=component('src/components/AnomaliesWorkspace.tsx').default;const root=createRoot(document.getElementById('root'));
 await React.act(async()=>root.render(React.createElement(Component,{alerts:[{...alert,status:'ouverte'}],search:'',onSearchChange(){},async onChanged(){},canWrite:false})));
 assert.match(document.body.textContent,/Alerte test/);assert.equal([...document.querySelectorAll('button')].some(b=>b.textContent.includes('Clôturer')),false);
 await React.act(async()=>root.unmount());
});

test('import requires a verified preview and confirmation before sending a pending batch',async()=>{
 const Modal=component('src/components/DeclarationImportModal.tsx').default;const domain=component('src/lib/declarationImport.ts');const root=createRoot(document.getElementById('root'));let changed=0;
 await React.act(async()=>root.render(React.createElement(Modal,{operators:[operator],acts:[act],existing:[],onClose(){},async onChanged(){changed++;}})));
 assert.equal(button('Enregistrer l’import').disabled,true);
 const beneficiary=document.querySelector('select');await React.act(async()=>{beneficiary.value='o1';beneficiary.dispatchEvent(new window.Event('change',{bubbles:true}));});
 const input=document.querySelector('input[type=file]');const bytes=new TextEncoder().encode(domain.importTemplate);
 Object.defineProperty(input,'files',{value:[{name:'export.csv',size:bytes.length,async arrayBuffer(){return bytes.buffer;}}],configurable:true});
 await React.act(async()=>{input.dispatchEvent(new window.Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,20));});
 assert.match(document.body.textContent,/0 erreurs bloquantes/);assert.match(document.body.textContent,/EXEMPLE-2026-001/);assert.equal(button('Enregistrer l’import').disabled,true);
 await React.act(async()=>document.querySelector('input[type=checkbox]').click());
 assert.equal(button('Enregistrer l’import').disabled,false);await click('Enregistrer l’import');
 assert.match(document.body.textContent,/Import enregistré : 1 déclarations et 2 articles/);assert.equal(changed,1);
 const call=rpcCalls.find(c=>c.name==='sirex_import_declarations');assert.equal(call.args.p_declarations[0].declared_value,350);assert.equal(call.args.p_declarations[0].items.length,2);assert.equal(call.args.p_declarations[0].status,undefined);
 await React.act(async()=>root.unmount());
});
test('balances display validated quantities, remaining values and export availability',async()=>{
 const Component=component('src/components/BalancesWorkspace.tsx').default;const root=createRoot(document.getElementById('root'));
 await React.act(async()=>root.render(React.createElement(Component,{acts:[act]})));assert.equal(button('Exporter les reliquats CSV').disabled,true);
 await React.act(async()=>{const select=document.querySelector('select');select.value='a1';select.dispatchEvent(new window.Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,0));});
 assert.match(document.body.textContent,/Pompe à eau/);assert.match(document.body.textContent,/20%/);assert.equal(button('Exporter les reliquats CSV').disabled,false);
 await React.act(async()=>root.unmount());
});
test('first dossier opens operator creation instead of leaving a disabled action',async()=>{
 const previous={...tables};tables.sirex_operators=[];tables.sirex_acts=[];tables.sirex_declarations=[];tables.sirex_alerts=[];
 const App=component('src/App.tsx').default;const root=createRoot(document.getElementById('root'));
 await React.act(async()=>{root.render(React.createElement(App));await new Promise(r=>setTimeout(r,0));});assert.equal(button('Nouveau dossier').disabled,false);await click('Nouveau dossier');
 assert.match(document.body.textContent,/Ajouter un opérateur/);assert.ok(button('Enregistrer l’opérateur'));
 await React.act(async()=>root.unmount());Object.assign(tables,previous);
});
