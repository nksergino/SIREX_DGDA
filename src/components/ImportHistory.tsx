import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
type Batch={id:string;source_name:string;created_at:string;province:string;declarations:number;articles:number};
export default function ImportHistory({refresh}:{refresh:number}) {
  const [rows,setRows]=useState<Batch[]>([]);const [error,setError]=useState('');const [loading,setLoading]=useState(false);const request=useState({generation:0})[0];
  const load=useCallback(async()=>{const generation=++request.generation;setLoading(true);setError('');const {data,error}=await supabase.rpc('sirex_import_history');if(generation!==request.generation)return;if(error)setError('Historique indisponible : '+error.message);else setRows(data||[]);setLoading(false);},[request]);
  useEffect(()=>{void load();return()=>{request.generation++;};},[load,refresh,request]);
  return <div className="panel import-history"><div className="panel-head"><div><p className="eyebrow">Traçabilité</p><h2>Derniers imports</h2></div><button className="text-button" onClick={()=>void load()}>Actualiser</button></div>{loading?<p>Chargement…</p>:error?<div className="form-error">{error}</div>:rows.length?<div className="table-wrap"><table><thead><tr><th>Fichier source</th><th>Date</th><th>Province</th><th>Déclarations</th><th>Articles</th></tr></thead><tbody>{rows.map(b=><tr key={b.id}><td>{b.source_name}</td><td>{new Date(b.created_at).toLocaleString('fr-FR')}</td><td>{b.province}</td><td>{b.declarations}</td><td>{b.articles}</td></tr>)}</tbody></table></div>:<p>Aucun import enregistré.</p>}<p className="page-subtitle">Les 50 derniers imports visibles dans votre périmètre. Les compteurs représentent les lignes actuellement présentes dans SIREX.</p></div>;
}
