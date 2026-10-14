import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { money } from '@/lib/domain';
import { downloadCsv, importFields, importTemplate, Mapping, parseCsv, prepareImport, suggestMapping, Table } from '@/lib/declarationImport';
type Operator={id:string;company_name:string;registration_number:string};
type Act={id:string;reference:string;operator_id:string};
type Source={name:string;hash:string;table:Table};
export default function DeclarationImportModal({operators,acts,existing,onClose,onChanged}:{operators:Operator[];acts:Act[];existing:string[];onClose:()=>void;onChanged:()=>Promise<void>}) {
  const [source,setSource]=useState<Source|null>(null);const [mapping,setMapping]=useState<Mapping>({});
  const [operatorId,setOperatorId]=useState('');const [actId,setActId]=useState('');const [style,setStyle]=useState<'comma'|'point'>('comma');
  const [error,setError]=useState('');const [reading,setReading]=useState(false);const [saving,setSaving]=useState(false);const [confirmed,setConfirmed]=useState(false);
  const [result,setResult]=useState<{declarations:number;articles:number}|null>(null);
  const generation=useRef(0);const submission=useRef<{payload:string;id:string}|null>(null);
  useEffect(()=>()=>{generation.current++;},[]);
  useEffect(()=>{setConfirmed(false);submission.current=null;},[source,mapping,operatorId,actId,style]);
  const operator=operators.find(o=>o.id===operatorId);
  const preview=useMemo(()=>source&&operator?prepareImport(source.table,mapping,operator,acts,existing,style,actId||null):null,[source,mapping,operator,acts,existing,style,actId]);
  async function readFile(file:File|undefined){
    const request=++generation.current;setSource(null);setResult(null);setError('');if(!file)return;
    if(!/\.csv$/i.test(file.name)||file.size>2*1024*1024){setError('Choisissez un fichier CSV UTF-8 de 2 Mo maximum. Depuis Excel, utilisez Enregistrer sous → CSV UTF-8.');setReading(false);return;}
    setReading(true);
    try{const bytes=await file.arrayBuffer();const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);const table=parseCsv(text);const digest=await crypto.subtle.digest('SHA-256',bytes);if(request!==generation.current)return;
      setSource({name:file.name,hash:Array.from(new Uint8Array(digest)).map(v=>v.toString(16).padStart(2,'0')).join(''),table});setMapping(suggestMapping(table.headers));
    }catch(e){if(request===generation.current)setError(e instanceof Error?e.message:'Lecture du fichier impossible.');}
    finally{if(request===generation.current)setReading(false);}
  }
  async function save(){
    if(!source||!preview||preview.issues.length||!confirmed||!preview.declarations.length)return;
    setSaving(true);setError('');
    const serialized=JSON.stringify(preview.declarations);
    if(!submission.current||submission.current.payload!==serialized)submission.current={payload:serialized,id:crypto.randomUUID()};
    try{const {data,error}=await supabase.rpc('sirex_import_declarations',{p_batch_id:submission.current.id,p_source_name:source.name,p_source_sha256:source.hash,p_declarations:preview.declarations});
      if(error)throw error;if(!data)throw new Error('Le serveur n’a pas confirmé l’import. Réessayez sans modifier le fichier.');
      setResult({declarations:Number(data.declarations),articles:Number(data.articles)});
      try{await onChanged();}catch{setError('L’import est enregistré, mais la liste n’a pas pu être actualisée. Fermez puis rechargez le registre.');}
    }catch(e){setError(e&&typeof e==='object'&&'message' in e?String(e.message):'Import impossible. Aucune validation douanière automatique n’est effectuée.');}
    finally{setSaving(false);}
  }
  return <div className="modal-backdrop" onClick={()=>{if(!saving)onClose();}}><div className="modal-card import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">Import contrôlé depuis un export</p><h2 id="import-title">Importer les déclarations</h2></div><button className="icon-button" aria-label="Fermer l’import" disabled={saving} onClick={onClose}><X size={19}/></button></div>
    <div className="modal-form"><p>CSV UTF-8 : une ligne par article, jusqu’à 2 000 articles et 200 déclarations d’un même bénéficiaire. Aucun accès direct à SYDONIA n’est utilisé.</p>
      <button className="secondary-button" onClick={()=>downloadCsv('Modele_import_declarations_SIREX.csv','\uFEFF'+importTemplate)}>Télécharger le modèle CSV</button>
      <fieldset className="dossier-fields" disabled={saving||!!result}><div className="form-grid"><label>Bénéficiaire de toutes les déclarations<select value={operatorId} onChange={e=>{setOperatorId(e.target.value);setActId('');}}><option value="">Sélectionner un opérateur…</option>{operators.map(o=><option key={o.id} value={o.id}>{o.company_name} · {o.registration_number}</option>)}</select></label><label>Arrêté par défaut, si absent du fichier<select value={actId} onChange={e=>setActId(e.target.value)}><option value="">Aucun : rattachement ultérieur</option>{acts.filter(a=>a.operator_id===operatorId).map(a=><option key={a.id} value={a.id}>{a.reference}</option>)}</select></label></div>
      <label>Fichier exporté<input type="file" accept=".csv,text/csv" onChange={e=>void readFile(e.target.files?.[0])}/></label>
      <label>Format des nombres dans le fichier<select value={style} onChange={e=>setStyle(e.target.value as 'comma'|'point')}><option value="comma">Virgule décimale : 1 234,56</option><option value="point">Point décimal : 1,234.56</option></select></label>
      {reading&&<p>Lecture locale du fichier…</p>}{source&&<><h3>Correspondance des colonnes</h3><p>Vérifiez les associations proposées. Les colonnes non associées ne seront pas importées. Ne confondez pas quantité d’article et nombre de colis, ni valeur CIF d’article et total de déclaration.</p><div className="import-mapping">{importFields.map(f=><label key={f.key}>{f.label}{f.required?' *':''}<select value={mapping[f.key]??''} onChange={e=>setMapping(m=>({...m,[f.key]:e.target.value===''?undefined:Number(e.target.value)}))}><option value="">{f.required?'Associer une colonne…':'Non importé'}</option>{source.table.headers.map((h,i)=><option key={i} value={i}>{h}</option>)}</select></label>)}</div></>}
      {preview&&!result&&<><h3>Contrôle avant enregistrement</h3><p>{source?.table.rows.length} lignes · {preview.declarations.length} déclarations · {preview.issues.length} erreurs bloquantes</p>{preview.issues.length>0&&<div className="form-error import-errors" role="alert"><ul>{preview.issues.slice(0,100).map((i,n)=><li key={n}>Ligne {i.line} : {i.message}</li>)}</ul>{preview.issues.length>100&&<p>Et {preview.issues.length-100} autres erreurs.</p>}</div>}<div className="table-wrap"><table><thead><tr><th>Déclaration</th><th>Bureau</th><th>Date</th><th>Articles</th><th>Total CIF</th><th>Rattachement</th></tr></thead><tbody>{preview.declarations.slice(0,20).map(d=><tr key={d.declaration_number}><td>{d.declaration_number}</td><td>{d.office}</td><td>{d.declared_date}</td><td>{d.items.length}</td><td>{money(d.declared_value,d.currency)}</td><td>{acts.find(a=>a.id===d.act_id)?.reference||'À rattacher'}</td></tr>)}</tbody></table></div>{preview.declarations.length>20&&<p>Aperçu limité aux 20 premières déclarations.</p>}<details><summary>Vérifier les premières lignes d’articles</summary><div className="table-wrap"><table><thead><tr><th>Ligne source</th><th>Désignation</th><th>Code SH</th><th>Quantité</th><th>Unité</th><th>CIF</th></tr></thead><tbody>{preview.declarations.flatMap(d=>d.items).slice(0,30).map((i,n)=><tr key={n}><td>{i.source_line}</td><td>{i.description}</td><td>{i.hs_code||'Non fourni'}</td><td>{i.quantity}</td><td>{i.unit}</td><td>{money(i.cif_value,i.currency)}</td></tr>)}</tbody></table></div></details><label className="import-confirm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>J’ai vérifié le bénéficiaire, les colonnes, les montants et les références de l’arrêté. Les déclarations seront enregistrées en attente de contrôle.</label></>}
      </fieldset>
      {result&&<div className="import-success" role="status">Import enregistré : {result.declarations} déclarations et {result.articles} articles. Retrouvez-les dans le registre, puis contrôlez-les dans Apurement.</div>}
      {error&&<div className="form-error" role="alert">{error}</div>}
      <div className="modal-actions"><button className="secondary-button" disabled={saving} onClick={onClose}>{result?'Fermer':'Annuler'}</button>{!result&&<button className="primary-button" disabled={reading||saving||!confirmed||!preview||!!preview.issues.length||!preview.declarations.length} onClick={()=>void save()}>{saving?'Import en cours…':'Enregistrer l’import'}</button>}</div>
    </div></div></div>;
}
