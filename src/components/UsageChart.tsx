import { useMemo, useState } from 'react';
import { money } from '@/lib/domain';
type Act = {start_date:string; authorized_value:number; currency:string};
type Declaration = {declared_date:string; declared_value:number; currency:string|null; status:string};
export default function UsageChart({acts, declarations}: {acts:Act[]; declarations:Declaration[]}) {
  const [currency, setCurrency] = useState('USD');
  const currencies = Array.from(new Set(['USD', ...acts.map(a=>a.currency), ...declarations.map(d=>d.currency || 'USD')]));
  const months = useMemo(()=>Array.from({length:12},(_,i)=>{
    const date = new Date(); date.setDate(1); date.setMonth(date.getMonth()-11+i);
    const key = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
    return {label:date.toLocaleDateString('fr-FR',{month:'short',year:'2-digit'}),authorized:acts.filter(a=>a.currency===currency && a.start_date.startsWith(key)).reduce((n,a)=>n+Number(a.authorized_value),0), imported:declarations.filter(d=>d.currency===currency && d.status==='validee' && d.declared_date.startsWith(key)).reduce((n,d)=>n+Number(d.declared_value),0)};
  }),[acts,declarations,currency]);
  const max = Math.max(1,...months.flatMap(m=>[m.authorized,m.imported]));
  return <div className="panel chart-panel"><div className="panel-head"><div><p className="eyebrow">12 derniers mois</p><h2>Valeurs par mois</h2></div><select aria-label="Devise du graphique" value={currency} onChange={e=>setCurrency(e.target.value)}>{currencies.map(c=><option key={c}>{c}</option>)}</select></div><p className="chart-legend">Arrêtés par date de début · Déclarations validées par date de déclaration</p><div className="monthly-chart">{months.map(m=><div className="month-column" key={m.label}><div className="month-bars"><div style={{height:`${m.authorized/max*100}%`,background:'#253b55'}} title={`Autorisé : ${money(m.authorized,currency)}`} /><div style={{height:`${m.imported/max*100}%`,background:'#27958e'}} title={`Importé : ${money(m.imported,currency)}`} /></div><small>{m.label}</small></div>)}</div><p className="chart-legend">Bleu : autorisé · Vert : importé ({currency})</p>{max===1 && months.every(m=>!m.authorized&&!m.imported) && <p>Aucune donnée pour cette période et cette devise.</p>}</div>;
}
