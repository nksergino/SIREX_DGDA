import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../src/lib/declarationImport.ts',import.meta.url),'utf8');
const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const d=await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
const operator={id:'o1',registration_number:'RCCM1'},acts=[{id:'a1',reference:'ACT1',operator_id:'o1'}];
function preview(csv=d.importTemplate,existing=[],style='comma'){const table=d.parseCsv(csv);return d.prepareImport(table,d.suggestMapping(table.headers),operator,acts,existing,style,'a1');}
test('UTF-8 template groups article lines into one declaration with exact CIF total',()=>{
 const result=preview();assert.deepEqual(result.issues,[]);assert.equal(result.declarations.length,1);assert.equal(result.declarations[0].items.length,2);assert.equal(result.declarations[0].declared_value,350);assert.equal(result.declarations[0].declared_date,'2026-10-14');assert.equal(result.declarations[0].act_id,'a1');
});
test('CSV handles quoted delimiters, multiline cells, BOM, escaped quotes and Excel sep directive',()=>{
 const table=d.parseCsv('\uFEFFsep=;\r\na;b\r\n1;"pompe; à eau\nmodèle ""B"""\r\n');assert.equal(table.rows[0][1],'pompe; à eau\nmodèle "B"');assert.deepEqual(table.lineNumbers,[3]);
 assert.equal(d.parseCsv('a,b\n1,"deux, trois"').rows[0][1],'deux, trois');
 assert.equal(d.parseCsv('a\tb\n1\t2').delimiter,'\t');
});
test('invalid CSV structure and duplicate headers are rejected',()=>{
 for(const csv of ['a;b\n1','a;a\n1;2','a;b\n1;"broken','a;b\n1;"ok"X','a;b\n1;"'+ 'x'.repeat(4001)+'"'])assert.throws(()=>d.parseCsv(csv));
});
test('decimal formats are explicit, precision and impossible dates are rejected',()=>{
 assert.equal(d.decimal('1 234,56','comma',2).value,1234.56);assert.equal(d.decimal('1,234.56','point',2).value,1234.56);assert.equal(d.decimal('0,003','comma',3).value,0.003);
 for(const [value,style,precision] of [['1,234','comma',2],['12 34,50','comma',2],['-1','comma',2],['100.00','comma',2],['NaN','point',2]])assert.throws(()=>d.decimal(value,style,precision));
 assert.throws(()=>d.importDate('31/02/2026'));assert.throws(()=>d.importDate('45000'));assert.equal(d.importDate('2026-10-14'),'2026-10-14');
});
test('existing declarations, unknown acts, mismatched totals and duplicate article numbers block the lot',()=>{
 assert.ok(preview(d.importTemplate,['EXEMPLE-2026-001']).issues.length);
 assert.ok(preview(d.importTemplate.replace(/350,00/g,'351,00')).issues.some(i=>i.message.includes('total CIF')));
 assert.ok(preview(d.importTemplate.replace(';2;Générateur',';1;Générateur')).issues.some(i=>i.message.includes('dupliquée')));
 assert.ok(preview(d.importTemplate.replace(/350,00;\r/g,'350,00;INCONNU\r')).issues.some(i=>i.message.includes('Arrêté inconnu')));
});
test('CSV exports neutralize spreadsheet formulas but preserve Unicode and quoting',()=>{
 const csv=d.exportCsv(['Nom','Valeur'],[['=HYPERLINK("bad")',100],[' Équipement; spécial',null],['  @SUM(1)',-2]]);
 assert.ok(csv.includes("'=HYPERLINK"));assert.ok(csv.includes("'  @SUM"));assert.ok(csv.includes('Équipement; spécial'));assert.ok(csv.startsWith('\uFEFF'));
});
