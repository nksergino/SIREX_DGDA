export const importFields = [
  {key:'declaration_number',label:'Référence complète de déclaration',required:true,aliases:['declaration','numero declaration','reference declaration','declaration number']},
  {key:'office',label:'Bureau douanier',required:true,aliases:['bureau','office','bureau douanier']},
  {key:'declared_date',label:'Date d’enregistrement',required:true,aliases:['date','date declaration','declared date','date enregistrement']},
  {key:'description',label:'Désignation de l’article',required:true,aliases:['designation','description','libelle','marchandise']},
  {key:'quantity',label:'Quantité de l’article',required:true,aliases:['quantite','quantity','qte']},
  {key:'unit',label:'Unité de l’article',required:true,aliases:['unite','unit']},
  {key:'cif_value',label:'Valeur CIF de l’article',required:true,aliases:['valeur cif','cif value','cif','valeur article']},
  {key:'currency',label:'Devise',required:true,aliases:['devise','currency']},
  {key:'hs_code',label:'Code SH',required:false,aliases:['code sh','hs code','position tarifaire']},
  {key:'article_number',label:'Numéro de ligne article',required:false,aliases:['numero article','ligne article','article number']},
  {key:'declared_total',label:'Total CIF de la déclaration',required:false,aliases:['total declaration','declared total','total cif declaration']},
  {key:'act_reference',label:'Référence de l’arrêté',required:false,aliases:['arrete','reference arrete','act reference']},
  {key:'operator_registration',label:'RCCM du bénéficiaire',required:false,aliases:['rccm','operator registration']},
  {key:'customs_regime',label:'Régime douanier',required:false,aliases:['regime','customs regime']},
  {key:'exporter_name',label:'Nom du fournisseur / exportateur',required:false,aliases:['exportateur','fournisseur','exporter name']},
  {key:'origin_country',label:'Pays d’origine',required:false,aliases:['pays origine','origin country']},
  {key:'shipment_country',label:'Pays de provenance',required:false,aliases:['pays provenance','shipment country']},
] as const;
export type Field = typeof importFields[number]['key'];
export type Mapping = Partial<Record<Field,number>>;
export type Table = {headers:string[];rows:string[][];lineNumbers:number[];delimiter:string};
export type ImportItem = {description:string;hs_code:string|null;quantity:number;unit:string;cif_value:number;currency:string;source_line:number};
export type ImportDeclaration = {declaration_number:string;office:string;declared_date:string;operator_id:string;act_id:string|null;declared_value:number;currency:string;customs_regime:string|null;exporter_name:string|null;origin_country:string|null;shipment_country:string|null;items:ImportItem[]};
export type Issue = {line:number;message:string};
export const MAX_IMPORT_ROWS=2000;
export function headerKey(value:string) {return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function parseDelimited(text:string,delimiter:string) {
  const records:string[][]=[];const lines:number[]=[];let row:string[]=[],cell='',quoted=false,closed=false,line=1,start=1;
  function field(){if(cell.length>4000)throw new Error(`Champ trop long, ligne ${start}.`);row.push(cell.trim());cell='';closed=false;}
  function record(){field();if(row.some(Boolean)){records.push(row);lines.push(start);}row=[];if(records.length>MAX_IMPORT_ROWS+1)throw new Error(`Le fichier dépasse ${MAX_IMPORT_ROWS} lignes d’articles.`);}
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else{cell+=c;if(c==='\n')line++;}continue;}
    if(c==='"'){if(cell.trim() || closed)throw new Error(`Guillemets invalides à la ligne ${line}.`);cell='';quoted=true;continue;}
    if(c===delimiter){field();continue;}
    if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;record();line++;start=line;continue;}
    if(closed&&!/\s/.test(c))throw new Error(`Caractère inattendu après un champ cité, ligne ${line}.`);
    cell+=c;if(cell.length>4000)throw new Error(`Champ trop long, ligne ${line}.`);
  }
  if(quoted)throw new Error('Un champ CSV contient des guillemets non fermés.');
  if(cell || row.length)record();
  return {records,lines};
}
export function parseCsv(input:string,delimiter?:string):Table {
  if(input.length>2*1024*1024)throw new Error('Le fichier doit faire 2 Mo maximum.');
  let text=input.replace(/^\uFEFF/,'');
  let chosen=delimiter;
  const directive=text.match(/^sep=([;,\t])\r?\n/i);
  if(directive){if(!chosen)chosen=directive[1];text=text.slice(directive[0].length);}
  if(!chosen){
    let quote=false;const counts:Record<string,number>={';':0,',':0,'\t':0};
    for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quote&&text[i+1]==='"'){i++;continue;}quote=!quote;}else if(!quote){if(c==='\n'||c==='\r')break;if(c in counts)counts[c]++;}}
    chosen=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0];
  }
  if(![';',',','\t'].includes(chosen))throw new Error('Séparateur CSV non pris en charge.');
  const {records,lines}=parseDelimited(text,chosen);
  if(records.length<2)throw new Error('Le fichier doit contenir un en-tête et au moins un article.');
  const headers=records.shift()!;lines.shift();
  if(headers.length<2||headers.length>80||headers.some(h=>!h))throw new Error('Vérifiez l’en-tête et le séparateur du fichier.');
  const keys=headers.map(headerKey);if(new Set(keys).size!==keys.length)throw new Error('Les noms des colonnes doivent être distincts.');
  records.forEach((r,i)=>{if(r.length!==headers.length)throw new Error(`La ligne ${lines[i]} contient ${r.length} colonnes au lieu de ${headers.length}.`);});
  return {headers,rows:records,lineNumbers:directive?lines.map(n=>n+1):lines,delimiter:chosen};
}
export function suggestMapping(headers:string[]):Mapping {
  const mapping:Mapping={};
  for(const f of importFields){const match=headers.flatMap((h,i)=>[headerKey(f.key),...f.aliases.map(headerKey)].includes(headerKey(h))?[i]:[]);if(match.length===1)mapping[f.key]=match[0];}
  return mapping;
}
export function decimal(value:string,style:'comma'|'point',precision:number) {
  const raw=value.trim().replace(/[\u00a0\u202f]/g,' ');
  const sep=style==='comma'?',':'.',group=style==='comma'?'.':',';
  const parts=raw.split(sep);if(parts.length>2||!parts[0]||(parts[1]!==undefined&&(!/^\d+$/.test(parts[1])||parts[1].length>precision)))throw new Error(`Nombre ou précision invalide : ${value}.`);
  const integer=parts[0];
  const grouping=integer.includes(' ')?' ':group;
  if(integer.includes(' ')&&integer.includes(group))throw new Error(`Séparateurs de milliers mélangés : ${value}.`);
  const chunks=integer.split(grouping);if(chunks.length>1&&(!/^[1-9]\d{0,2}$/.test(chunks[0])||chunks.slice(1).some(c=>!/^\d{3}$/.test(c))))throw new Error(`Groupement des milliers invalide : ${value}.`);
  const digits=chunks.join('');if(!/^\d+$/.test(digits))throw new Error(`Nombre invalide : ${value}.`);
  const normalized=digits+(parts[1]!==undefined?'.'+parts[1]:'');
  const scaled=Number(digits)*10**precision+Number((parts[1]||'').padEnd(precision,'0'));
  if(!Number.isSafeInteger(scaled))throw new Error('Montant ou quantité trop élevé pour être importé avec précision.');
  return {value:Number(normalized),scaled};
}
export function importDate(value:string) {
  const french=value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const date=french?`${french[3]}-${french[2].padStart(2,'0')}-${french[1].padStart(2,'0')}`:value;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error(`Date invalide : ${value}. Utilisez JJ/MM/AAAA ou AAAA-MM-JJ.`);
  const parsed=new Date(`${date}T00:00:00Z`);if(Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)throw new Error(`Date impossible : ${value}.`);return date;
}
export function prepareImport(table:Table,mapping:Mapping,operator:{id:string;registration_number:string},acts:{id:string;reference:string;operator_id:string}[],existing:string[],style:'comma'|'point',defaultActId:string|null) {
  const issues:Issue[]=[];const grouped=new Map<string,{header:Omit<ImportDeclaration,'items'|'declared_value'>;items:ImportItem[];cents:number;declaredTotal:number|null;seen:Set<string>}>();
  for(const f of importFields){if(f.required&&mapping[f.key]===undefined)issues.push({line:1,message:`Associez la colonne « ${f.label} ».`});}
  const mapped=Object.values(mapping).filter(i=>i!==undefined);if(new Set(mapped).size!==mapped.length)issues.push({line:1,message:'Une colonne ne peut pas servir à plusieurs champs.'});
  if(issues.length)return {declarations:[] as ImportDeclaration[],issues};
  if(defaultActId&&!acts.some(a=>a.id===defaultActId&&a.operator_id===operator.id))issues.push({line:1,message:'L’arrêté choisi ne correspond pas au bénéficiaire.'});
  const existingSet=new Set(existing);
  table.rows.forEach((row,index)=>{
    const line=table.lineNumbers[index];const get=(key:Field)=>mapping[key]===undefined?'':row[mapping[key]!]?.trim()||'';
    try {
      const number=get('declaration_number');if(!number||number.length>120)throw new Error('Référence de déclaration absente ou trop longue.');
      if(existingSet.has(number))throw new Error(`La déclaration ${number} est déjà enregistrée ; aucun remplacement automatique.`);
      if(!get('office'))throw new Error('Bureau douanier absent.');
      if(get('operator_registration')&&get('operator_registration')!==operator.registration_number)throw new Error('Le RCCM du fichier diffère de celui du bénéficiaire sélectionné.');
      if(mapping.operator_registration!==undefined&&!get('operator_registration'))throw new Error('RCCM manquant dans la colonne associée.');
      const currency=get('currency').toUpperCase();if(!['USD','CDF','EUR','JPY'].includes(currency))throw new Error('Devise manquante ou non prise en charge (USD, CDF, EUR, JPY).');
      const unit=get('unit').toUpperCase();if(!['PCS','UN','KG','TONNE','LOT'].includes(unit))throw new Error('Unité manquante ou non prise en charge.');
      const description=get('description');if(!description)throw new Error('Désignation de l’article absente.');
      const qty=decimal(get('quantity'),style,3);if(qty.value<=0)throw new Error('La quantité doit être positive.');
      const cif=decimal(get('cif_value'),style,2);
      const code=get('hs_code').replace(/[.\s]/g,'');if(code&&!/^\d{4,10}$/.test(code))throw new Error('Code SH invalide : conserver 4 à 10 chiffres.');
      const reference=get('act_reference');const matches=reference?acts.filter(a=>a.operator_id===operator.id&&a.reference===reference):[];
      if(reference&&matches.length!==1)throw new Error(`Arrêté inconnu ou d’un autre bénéficiaire : ${reference}.`);
      const header={declaration_number:number,office:get('office'),declared_date:importDate(get('declared_date')),operator_id:operator.id,act_id:reference?matches[0].id:defaultActId,currency,customs_regime:get('customs_regime')||null,exporter_name:get('exporter_name')||null,origin_country:get('origin_country')||null,shipment_country:get('shipment_country')||null};
      const total=get('declared_total')?decimal(get('declared_total'),style,2).scaled:null;
      if(mapping.declared_total!==undefined&&total===null)throw new Error('Total CIF de déclaration manquant.');
      const old=grouped.get(number);if(old&&(JSON.stringify(old.header)!==JSON.stringify(header)||old.declaredTotal!==total))throw new Error(`Informations d’en-tête différentes entre les lignes de ${number}.`);
      const key=get('article_number')||JSON.stringify([description,code,qty.value,unit,cif.value,currency]);
      if(mapping.article_number!==undefined&&!get('article_number'))throw new Error('Numéro de ligne article manquant.');
      if(old?.seen.has(key))throw new Error(`Ligne article dupliquée dans ${number}. Vérifiez les numéros de ligne.`);
      const group=old||{header,items:[],cents:0,declaredTotal:total,seen:new Set<string>()};
      group.seen.add(key);group.cents+=cif.scaled;if(!Number.isSafeInteger(group.cents))throw new Error('Total CIF trop élevé.');
      group.items.push({description,hs_code:code||null,quantity:qty.value,unit,cif_value:cif.value,currency,source_line:line});grouped.set(number,group);
    }catch(e){issues.push({line,message:e instanceof Error?e.message:'Ligne invalide.'});}
  });
  if(grouped.size>200)issues.push({line:1,message:'Maximum 200 déclarations par import. Scindez le fichier.'});
  const declarations=Array.from(grouped.values()).map(g=>{
    if(g.declaredTotal!==null&&g.declaredTotal!==g.cents)issues.push({line:g.items[0].source_line,message:`Le total CIF de ${g.header.declaration_number} diffère de la somme des articles.`});
    return {...g.header,declared_value:g.cents/100,items:g.items};
  });
  return {declarations,issues};
}
export function exportCsv(headers:string[],rows:(string|number|null|undefined)[][]) {
  const cell=(value:unknown)=>{let text=String(value??'');if(/^[\s]*[=+\-@]/.test(text)||/^[\t\r\n]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};
  return '\uFEFF'+[headers,...rows].map(row=>row.map(cell).join(';')).join('\r\n');
}
export function downloadCsv(name:string,contents:string) {
  const url=URL.createObjectURL(new Blob([contents],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export const importTemplate='declaration_number;office;declared_date;article_number;description;hs_code;quantity;unit;cif_value;currency;declared_total;act_reference\r\nEXEMPLE-2026-001;101B;14/10/2026;1;Pompe à eau;841370;2;PCS;200,00;USD;350,00;\r\nEXEMPLE-2026-001;101B;14/10/2026;2;Générateur;850211;1;PCS;150,00;USD;350,00;\r\n';
