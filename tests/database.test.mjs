import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
process.on('uncaughtException', error => { console.error(error.message, error.where || ''); process.exit(1); });
const db = new PGlite();
await db.exec(`
 CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE SCHEMA storage;
 CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text,metadata jsonb);
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
 CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array(name,'/') $$;
 GRANT USAGE ON SCHEMA public,auth,storage TO authenticated,anon;
 GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
`);
const migrations=await readdir(new URL('../supabase/migrations/',import.meta.url));
for(const name of migrations.sort()) {
  const sql=await readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8');
  if(name.includes('secure_sirex')) await db.exec(`
    INSERT INTO public.sirex_operators(id,company_name,registration_number,province) VALUES('11111111-1111-4111-8111-111111111111','Legacy','LEGACY','Ituri');
    INSERT INTO public.sirex_acts(id,operator_id,reference,act_type,province,start_date,end_date,authorized_value,consumed_value) VALUES('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','LEGACY','exoneration','Ituri','2026-01-01','2027-12-31',100,100);
    INSERT INTO public.sirex_act_items(act_id,quantity,unit,description,cif_value) VALUES('22222222-2222-4222-8222-222222222222',1,'PCS','Legacy bien',100);
    INSERT INTO public.sirex_declarations(operator_id,act_id,declaration_number,office,declared_date,declared_value,status) VALUES('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','LEGACY','101B','2026-10-13',100,'validee');
  `);
  try {await db.exec(sql);} catch(e) {console.error('Migration failed:',name);throw e;}
}
const admin='00000000-0000-4000-8000-000000000001', stranger='00000000-0000-4000-8000-000000000002', agent='00000000-0000-4000-8000-000000000003', reader='00000000-0000-4000-8000-000000000004';
await db.exec(`INSERT INTO auth.users VALUES ('${admin}'),('${stranger}'),('${agent}'),('${reader}');
 INSERT INTO public.sirex_members(user_id,full_name,role,province) VALUES ('${admin}','Admin','super_admin',null),('${agent}','Agent','agent','Kinshasa'),('${reader}','Lecteur','lecteur','Kinshasa');`);
async function as(user) {await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub','${user}',false); SET ROLE authenticated;`);}
async function owner() {await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);`);}
await as(admin);
const op=(await db.query("INSERT INTO public.sirex_operators(company_name,registration_number,province) VALUES ('Entreprise','RCCM1','Kinshasa') RETURNING id")).rows[0].id;
const op2=(await db.query("INSERT INTO public.sirex_operators(company_name,registration_number,province) VALUES ('Autre','RCCM2','Haut-Katanga') RETURNING id")).rows[0].id;
async function actFor(operator=op, province='Kinshasa', ref='ACT1') {
 const data={operator_id:operator,reference:ref,act_type:'exoneration',province,start_date:'2026-01-01',end_date:'2027-12-31',project_name:'Projet',currency:'USD'};
 return (await db.query('SELECT public.sirex_create_dossier($1::jsonb,$2::jsonb) AS act',[JSON.stringify(data),JSON.stringify([{description:'Pompe à eau',quantity:10,unit:'PCS',cif_value:1000,currency:'USD'}])])).rows[0].act;
}
const act=await actFor(); const foreign=await actFor(op2,'Haut-Katanga','ACT2');
let seq=0;
async function declaration({act_id=act.id,operator_id=op,designation='Pompe à eau',quantity=2,value=200,currency='USD',date='2026-10-13',unit='PCS'}={}) {
 const d=(await db.query('INSERT INTO public.sirex_declarations(operator_id,act_id,declaration_number,office,declared_date,designation,declared_value,currency) VALUES($1,$2,$3,\'101B\',$4,$5,$6,$7) RETURNING id',[operator_id,act_id,`DEC-${++seq}`,date,designation,value,currency])).rows[0].id;
 if(quantity!==null) await db.query('SELECT public.sirex_save_declaration_items($1,$2::jsonb)',[d,JSON.stringify([{description:designation,quantity,unit,cif_value:value,currency}])]);
 return d;
}
async function check(id) {return (await db.query('SELECT * FROM public.sirex_check_declaration($1)',[id])).rows;}
async function validate(id) {return db.query("UPDATE public.sirex_declarations SET status='validee' WHERE id=$1",[id]);}
test('unhabilitated, revoked, reader and cross-province paths are denied', async()=>{
 await as(stranger);
 assert.equal((await db.query('SELECT * FROM public.sirex_operators')).rows.length,0);
 await assert.rejects(db.query("INSERT INTO public.sirex_operators(company_name,registration_number,province) VALUES('X','X','Kinshasa')"));
 await assert.rejects(db.query(`INSERT INTO public.sirex_members(user_id,full_name,role) VALUES('${stranger}','Me','super_admin')`));
 await assert.rejects(db.query(`INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('sirex-documents','acts/${act.id}/x.pdf','{"mimetype":"application/pdf"}')`));
 await as(agent);
 assert.equal((await db.query('SELECT * FROM public.sirex_operators')).rows.length,1);
 await assert.rejects(db.query(`UPDATE public.sirex_operators SET province='Haut-Katanga' WHERE id='${op}'`));
 await assert.rejects(db.query(`INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('sirex-documents','acts/${foreign.id}/x.pdf','{"mimetype":"application/pdf"}')`));
 await as(reader);
 await assert.rejects(db.query("INSERT INTO public.sirex_operators(company_name,registration_number,province) VALUES('X','X','Kinshasa')"));
 await as(admin);await db.exec(`UPDATE public.sirex_members SET active=false WHERE user_id='${agent}'`);
 await as(agent);assert.equal((await db.query('SELECT * FROM public.sirex_operators')).rows.length,0);
 await as(admin);await db.exec(`UPDATE public.sirex_members SET active=true WHERE user_id='${agent}'`);
});
test('authorized validation updates consumption once and reversal restores it',async()=>{
 await as(agent);const id=await declaration();assert.deepEqual(await check(id),[]);await validate(id);await validate(id);
 assert.equal(Number((await db.query('SELECT consumed_value FROM public.sirex_acts WHERE id=$1',[act.id])).rows[0].consumed_value),200);
 await assert.rejects(db.query('UPDATE public.sirex_declaration_items SET quantity=1 WHERE declaration_id=$1',[id]));
 await assert.rejects(db.query('UPDATE public.sirex_declarations SET declared_value=1 WHERE id=$1',[id]));
 await assert.rejects(db.query('UPDATE public.sirex_act_items SET quantity=100 WHERE act_id=$1',[act.id]));
 await db.query("UPDATE public.sirex_declarations SET status='en_attente' WHERE id=$1",[id]);
 assert.equal(Number((await db.query('SELECT consumed_value FROM public.sirex_acts WHERE id=$1',[act.id])).rows[0].consumed_value),0);
});
test('non-authorized goods, missing lines, currency, dates, quantities and values block direct validation',async()=>{
 await as(agent);
 for (const input of [{designation:'Télévision'},{quantity:null},{currency:'CDF'},{date:'2028-01-01'},{quantity:11},{value:1001},{unit:'KG'}]) {
  const id=await declaration(input);assert.ok((await check(id)).length);await assert.rejects(validate(id));
 }
 await assert.rejects(declaration({act_id:foreign.id}));
});
test('cumulative quantities cannot be evaded by splitting declarations or duplicate rows',async()=>{
 await as(agent);const a=await declaration({quantity:8,value:800});await validate(a);
 const b=await declaration({quantity:3,value:200});assert.ok((await check(b)).some(i=>i.code==='quantite_depassee'));await assert.rejects(validate(b));
 await db.query("UPDATE public.sirex_declarations SET status='en_attente' WHERE id=$1",[a]);
 const c=await declaration({quantity:1,value:100});
 await db.query('SELECT public.sirex_save_declaration_items($1,$2::jsonb)',[c,JSON.stringify([{description:'Pompe à eau',quantity:6,unit:'PCS',cif_value:50,currency:'USD'},{description:' Pompe   à eau ',quantity:6,unit:'PCS',cif_value:50,currency:'USD'}])]);
 await assert.rejects(validate(c));
});
test('dossier and line replacement roll back atomically; audit actor is server-derived',async()=>{
 await as(agent);const id=await declaration();
 const before=(await db.query('SELECT * FROM public.sirex_declaration_items WHERE declaration_id=$1',[id])).rows;
 await assert.rejects(db.query('SELECT public.sirex_save_declaration_items($1,$2::jsonb)',[id,JSON.stringify([{description:'X',quantity:-1,unit:'PCS',cif_value:0,currency:'USD'}])]));
 assert.deepEqual((await db.query('SELECT * FROM public.sirex_declaration_items WHERE declaration_id=$1',[id])).rows,before);
 const count=(await db.query('SELECT count(*)::int n FROM public.sirex_acts')).rows[0].n;
 await assert.rejects(db.query('SELECT public.sirex_create_dossier($1::jsonb,$2::jsonb)',[JSON.stringify({operator_id:op,reference:'BAD',province:'Kinshasa',act_type:'exoneration',start_date:'2026-01-01',end_date:'2027-01-01',currency:'USD'}),JSON.stringify([{description:'X',quantity:-1,unit:'PCS',cif_value:1,currency:'USD'}])]));
 assert.equal((await db.query('SELECT count(*)::int n FROM public.sirex_acts')).rows[0].n,count);
 await assert.rejects(db.exec("INSERT INTO public.sirex_audit_logs(action,entity_type) VALUES('fake','fake')"));
 assert.ok((await db.query('SELECT * FROM public.sirex_audit_logs WHERE actor_id=$1',[agent])).rows.length>0);
 await assert.rejects(db.exec('DELETE FROM public.sirex_audit_logs'));
});
test('private helper execution, anonymous calls and last administrator removal are denied',async()=>{
 await as(admin);await assert.rejects(db.exec("UPDATE public.sirex_members SET active=false WHERE role='super_admin'"));
 await assert.rejects(db.query('SELECT sirex_private.refresh_alerts($1)',[act.id]));
 await owner();await db.exec('SET ROLE anon');await assert.rejects(db.query('SELECT * FROM public.sirex_check_declaration($1)',[act.id]));await owner();
});

test('generic storage policies do not bypass SIREX reader and anonymous boundaries',async()=>{
 await owner();await db.exec("GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO anon; CREATE POLICY generic_read ON storage.objects FOR SELECT TO anon,authenticated USING(true); CREATE POLICY generic_delete ON storage.objects FOR DELETE TO anon,authenticated USING(true);");
 await as(agent);const file=(await db.query(`INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('sirex-documents','acts/${act.id}/approved.pdf','{"mimetype":"application/pdf"}') RETURNING id`)).rows[0].id;
 await as(reader);assert.equal((await db.query('DELETE FROM storage.objects WHERE id=$1 RETURNING id',[file])).rows.length,0);
 assert.equal((await db.query('SELECT * FROM storage.objects WHERE id=$1',[file])).rows.length,1);
 await owner();await db.exec('SET ROLE anon');assert.equal((await db.query('SELECT * FROM storage.objects WHERE id=$1',[file])).rows.length,0);
 assert.equal((await db.query('DELETE FROM storage.objects WHERE id=$1 RETURNING id',[file])).rows.length,0);
 await as(agent);assert.equal((await db.query('DELETE FROM storage.objects WHERE id=$1 RETURNING id',[file])).rows.length,1);
});
test('mixed missing SH codes are rejected and CIF totals are checked',async()=>{
 await as(agent);const a=await actFor(op,'Kinshasa','SH-ACT');await db.query("UPDATE public.sirex_act_items SET hs_code='8413' WHERE act_id=$1",[a.id]);
 const id=await declaration({act_id:a.id,quantity:2,value:200});
 await db.query('SELECT public.sirex_save_declaration_items($1,$2::jsonb)',[id,JSON.stringify([{description:'Pompe à eau',hs_code:'8413',quantity:1,unit:'PCS',cif_value:100,currency:'USD'},{description:'Pompe à eau',hs_code:null,quantity:1,unit:'PCS',cif_value:100,currency:'USD'}])]);
 assert.ok((await check(id)).some(i=>i.code==='code_sh'));await assert.rejects(validate(id));
 await db.query('UPDATE public.sirex_declaration_items SET hs_code=$1 WHERE declaration_id=$2',['8413',id]);
 assert.deepEqual(await check(id),[]);await validate(id);
 await db.query("UPDATE public.sirex_declarations SET status='en_attente' WHERE id=$1",[id]);
 await db.query('UPDATE public.sirex_declaration_items SET cif_value=50 WHERE declaration_id=$1',[id]);
 assert.ok((await check(id)).some(i=>i.code==='total_articles'));await assert.rejects(validate(id));
});
test('anomalies are generated and resolved when declaration defects are corrected',async()=>{
 await as(agent);const id=await declaration({designation:'Télévision'});
 assert.ok((await db.query("SELECT * FROM public.sirex_alerts WHERE declaration_id=$1 AND code='bien_non_autorise' AND status='ouverte'",[id])).rows.length);
 await db.query('SELECT public.sirex_save_declaration_items($1,$2::jsonb)',[id,JSON.stringify([{description:'Pompe à eau',quantity:2,unit:'PCS',cif_value:200,currency:'USD'}])]);
 assert.deepEqual(await check(id),[]);
 assert.equal((await db.query("SELECT * FROM public.sirex_alerts WHERE declaration_id=$1 AND status<>'resolue'",[id])).rows.length,0);
});

test('migration preserves legacy dossiers and sends unchecked validations for reassessment',async()=>{
 await as(admin);
 const act=(await db.query("SELECT currency,consumed_value FROM public.sirex_acts WHERE reference='LEGACY'")).rows[0];assert.equal(act.currency,'USD');assert.equal(Number(act.consumed_value),0);
 assert.equal((await db.query("SELECT status FROM public.sirex_declarations WHERE declaration_number='LEGACY'")).rows[0].status,'a_regulariser');
 assert.ok((await db.query("SELECT * FROM public.sirex_audit_logs WHERE action='REASSESS_LEGACY_VALIDATION'")).rows.length);
});

const importHash='a'.repeat(64);
function importPayload(number, actId=act.id, operatorId=op) {
 return [{operator_id:operatorId,act_id:actId,declaration_number:number,office:'101B',declared_date:'2026-10-14',declared_value:300,currency:'USD',items:[{description:'Pompe à eau',hs_code:'8413',quantity:2,unit:'PCS',cif_value:200,currency:'USD',source_line:2},{description:'Pompe à eau',hs_code:'8413',quantity:1,unit:'PCS',cif_value:100,currency:'USD',source_line:3}]}];
}
async function importBatch(payload,id=crypto.randomUUID()) {return (await db.query('SELECT public.sirex_import_declarations($1,$2,$3,$4::jsonb) result',[id,'export-test.csv',importHash,JSON.stringify(payload)])).rows[0].result;}
test('controlled import is pending, retry-safe and reflected in validated article balances',async()=>{
 await as(agent);const a=await actFor(op,'Kinshasa','IMPORT-ACT');const payload=importPayload('IMPORT-001',a.id);const batch=crypto.randomUUID();
 const imported=await importBatch(payload,batch);assert.equal(imported.declarations,1);assert.equal(imported.articles,2);assert.equal(imported.already_imported,false);
 const retry=await importBatch(payload,batch);assert.equal(retry.already_imported,true);assert.equal(retry.declarations,1);
 const d=(await db.query('SELECT id,status FROM public.sirex_declarations WHERE source_import_id=$1',[batch])).rows[0];assert.equal(d.status,'en_attente');
 let balance=(await db.query('SELECT * FROM public.sirex_act_balances($1)',[a.id])).rows[0];assert.equal(Number(balance.imported_quantity),0);
 await validate(d.id);balance=(await db.query('SELECT * FROM public.sirex_act_balances($1)',[a.id])).rows[0];assert.equal(Number(balance.imported_quantity),3);assert.equal(Number(balance.remaining_quantity),7);assert.equal(Number(balance.remaining_value),700);
 await validate(d.id);assert.equal(Number((await db.query('SELECT * FROM public.sirex_act_balances($1)',[a.id])).rows[0].imported_quantity),3);
 await db.query("UPDATE public.sirex_declarations SET status='en_attente' WHERE id=$1",[d.id]);assert.equal(Number((await db.query('SELECT * FROM public.sirex_act_balances($1)',[a.id])).rows[0].remaining_quantity),10);
 const history=(await db.query('SELECT * FROM public.sirex_import_history()')).rows;assert.ok(history.some(b=>b.id===batch&&Number(b.articles)===2));
 payload[0].office='102B';await assert.rejects(importBatch(payload,batch));
 await assert.rejects(db.query('UPDATE public.sirex_declarations SET source_import_id=null WHERE id=$1',[d.id]));
});
test('bad rows, duplicate declarations and non-finite numbers roll back the whole batch',async()=>{
 await as(agent);const bad=importPayload('IMPORT-ROLLBACK-1');bad.push({...bad[0],declaration_number:'IMPORT-ROLLBACK-2',items:[{...bad[0].items[0],quantity:-1}]});
 const batch=crypto.randomUUID();await assert.rejects(importBatch(bad,batch));assert.equal((await db.query('SELECT * FROM public.sirex_import_batches WHERE id=$1',[batch])).rows.length,0);assert.equal((await db.query("SELECT * FROM public.sirex_declarations WHERE declaration_number LIKE 'IMPORT-ROLLBACK-%'")).rows.length,0);
 for(const mutate of [p=>{p[0].declared_value='NaN';},p=>{p[0].items[0].quantity='NaN';},p=>{p[0].items[0].cif_value='Infinity';},p=>{p[0].items[0].cif_value=0.001;},p=>{p[0].status='validee';},p=>{p[0].declared_value=301;}]) {const p=importPayload('BAD-IMPORT-'+crypto.randomUUID());mutate(p);await assert.rejects(importBatch(p));}
 const duplicate=importPayload('IMPORT-001');await assert.rejects(importBatch(duplicate));
});
test('import and history respect provincial scope and read-only rights',async()=>{
 await as(reader);await assert.rejects(importBatch(importPayload('READER-IMPORT')));assert.ok((await db.query('SELECT * FROM public.sirex_import_history()')).rows.length);
 await assert.rejects(db.query('SELECT * FROM public.sirex_act_balances($1)',[foreign.id]));
 await as(agent);await assert.rejects(importBatch(importPayload('FOREIGN-IMPORT',foreign.id,op2)));
 await as(stranger);assert.equal((await db.query('SELECT * FROM public.sirex_import_history()')).rows.length,0);await assert.rejects(importBatch(importPayload('UNAUTHORIZED-IMPORT')));
 await as(admin);
});
test('ambiguous authorized rows produce unknown balances instead of double-counted consumption',async()=>{
 await as(agent);const a=await actFor(op,'Kinshasa','AMBIG-BALANCE');await db.query("INSERT INTO public.sirex_act_items(act_id,quantity,unit,description,cif_value,currency) VALUES($1,1,'PCS','Pompe à eau',100,'USD')",[a.id]);
 const rows=(await db.query('SELECT * FROM public.sirex_act_balances($1)',[a.id])).rows;assert.equal(rows.length,2);assert.ok(rows.every(r=>r.ambiguous&&r.imported_quantity===null&&r.remaining_value===null));
});
test('bulk import supports 2000 articles with statement-level anomaly reconciliation',async()=>{
 await as(agent);const payload=importPayload('IMPORT-BULK');payload[0].declared_value=20;payload[0].items=Array.from({length:2000},(_,i)=>({description:'Pompe à eau',hs_code:'8413',quantity:0.001,unit:'PCS',cif_value:0.01,currency:'USD',source_line:i+2}));
 const batch=crypto.randomUUID();const result=await importBatch(payload,batch);assert.equal(result.articles,2000);
 const open=(await db.query("SELECT a.code FROM public.sirex_alerts a JOIN public.sirex_declarations d ON d.id=a.declaration_id WHERE d.source_import_id=$1 AND a.status='ouverte'",[batch])).rows;assert.deepEqual(open,[]);
});
