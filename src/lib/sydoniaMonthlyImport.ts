import * as XLSX from 'xlsx';

export type SydoniaRow = {
  source_line:number; declaration_number:string; declaration_date:string; declaration_year:number;
  office_code:string; office_name:string; declarant_code:string; declarant_name:string;
  nif:string; operator_name:string; act_reference:string; article_number:string;
  hs_code:string; description:string; net_weight:number; cif_value:number|null;
  currency:string|null; exchange_rate:number|null; total_taxes:number|null;
};
export type SydoniaPreview = { headers:string[]; rows:SydoniaRow[]; issues:{line:number;message:string}[] };

const fields = {
  declaration_number:['REPERTOIRE_DEC'], declaration_date:['DATE_ENREG'], declaration_year:['ANNEE'],
  office_code:['CODE_BUREAU'], office_name:['NOM_BUREAU'], declarant_code:['CODE_DECLARANT'],
  declarant_name:['NOM_DCL'], nif:['NIF_IMPORTATEUR'], operator_name:['IMPORTATEUR'],
  act_reference:['CODD_ADD','CODE_ADD'], article_number:['NUM_ART'], hs_code:['POS_TARIF'],
  description:['DESIGNATION_MSE'], net_weight:['P_NET'], cif_value:['CIF'], currency:['DEVISE'],
  exchange_rate:['TAUX_DEVISE'], total_taxes:['TOTAL_TAXE_GLOBAL','MONTANT_TOT_A_PAYE_OU_PAYE'],
} as const;
const required = ['declaration_number','declaration_date','declaration_year','office_code','office_name','nif','operator_name','act_reference','article_number','hs_code','description','net_weight'] as const;
function key(v:unknown){return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'');}
function text(v:unknown){return String(v??'').trim();}
function number(v:unknown):number|null {
  if(typeof v==='number') return Number.isFinite(v)?v:null;
  const raw=text(v).replace(/[\s\u00a0\u202f]/g,'');
  if(!raw) return null;
  const normalized=raw.includes(',')&&raw.includes('.') ? (raw.lastIndexOf(',')>raw.lastIndexOf('.')?raw.replace(/\./g,'').replace(',','.'):raw.replace(/,/g,'')) : raw.replace(',','.');
  return /^-?\d+(\.\d+)?$/.test(normalized)&&Number.isFinite(Number(normalized))?Number(normalized):null;
}
function date(v:unknown):string|null {
  if(v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0,10);
  const value=text(v);
  const m=value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const iso=m?\`\${m[3]}-\${m[2].padStart(2,'0')}-\${m[1].padStart(2,'0')}\`:value;
  const parsed=new Date(iso+'T00:00:00Z');
  return /^\d{4}-\d{2}-\d{2}$/.test(iso)&&!Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===iso?iso:null;
}
export async function parseSydoniaWorkbook(file:File):Promise<{hash:string;preview:SydoniaPreview}> {
  if(file.size>25*1024*1024) throw new Error('Le fichier dépasse 25 Mo.');
  if(!/\.(xls|xlsx)$/i.test(file.name)) throw new Error('Choisissez un export SYDONIA Excel (.xls ou .xlsx).');
  const bytes=await file.arrayBuffer();
  const workbook=XLSX.read(bytes,{type:'array',cellDates:true});
  const sheet=workbook.Sheets[workbook.SheetNames[0]];
  if(!sheet) throw new Error('Le classeur ne contient aucune feuille exploitable.');
  const matrix=XLSX.utils.sheet_to_json<unknown[]>(sheet,{header:1,defval:'',raw:false});
  if(matrix.length<2) throw new Error('Le fichier ne contient pas de lignes de déclaration.');
  const headers=matrix[0].map(text); const indices:Record<string,number>={};
  headers.forEach((h,i)=>{indices[key(h)]=i;});
  const column=(name:keyof typeof fields)=>fields[name].map(key).map(k=>indices[k]).find(i=>i!==undefined);
  const map=Object.fromEntries(Object.keys(fields).map(name=>[name,column(name as keyof typeof fields)])) as Record<string,number|undefined>;
  const missing=required.filter(name=>map[name]===undefined);
  if(missing.length) throw new Error('Colonnes SYDONIA absentes : '+missing.map(name=>fields[name][0]).join(', ')+'.');
  const rows:SydoniaRow[]=[]; const issues:{line:number;message:string}[]=[];
  matrix.slice(1).forEach((cells,index)=>{
    const line=index+2; const get=(name:string)=>map[name]===undefined?'':text(cells[map[name]!]);
    if(!cells.some(v=>text(v))) return;
    const declaration_date=date(get('declaration_date')); const declaration_year=number(get('declaration_year')); const net_weight=number(get('net_weight'));
    const missingValue=[['REPERTOIRE_DEC',get('declaration_number')],['NIF_IMPORTATEUR',get('nif')],['CODD_ADD',get('act_reference')],['POS_TARIF',get('hs_code')],['DESIGNATION_MSE',get('description')]].find(([,v])=>!v);
    if(missingValue||!declaration_date||!declaration_year||net_weight===null||net_weight<0) {
      issues.push({line,message:missingValue?\`\${missingValue[0]} est absent.\`:'Date, année ou P_NET invalide.'}); return;
    }
    rows.push({source_line:line,declaration_number:get('declaration_number'),declaration_date,declaration_year:Math.trunc(declaration_year),office_code:get('office_code'),office_name:get('office_name'),declarant_code:get('declarant_code'),declarant_name:get('declarant_name'),nif:get('nif'),operator_name:get('operator_name'),act_reference:get('act_reference'),article_number:get('article_number'),hs_code:get('hs_code').replace(/[.\s]/g,''),description:get('description'),net_weight,cif_value:number(get('cif_value')),currency:get('currency').toUpperCase()||null,exchange_rate:number(get('exchange_rate')),total_taxes:number(get('total_taxes'))});
  });
  if(rows.length>20000) throw new Error('Le fichier dépasse 20 000 lignes. Scindez-le par période ou bureau.');
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return {hash:Array.from(new Uint8Array(digest)).map(v=>v.toString(16).padStart(2,'0')).join(''),preview:{headers,rows,issues}};
}