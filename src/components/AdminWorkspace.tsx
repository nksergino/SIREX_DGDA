import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Member, provinces, roleLabels } from '@/lib/domain';
export default function AdminWorkspace({ section, member }: {section:string; member:Member}) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({user_id:'',full_name:'',matricule:'',role:'agent',province:'Kinshasa',active:true});
  const isAdmin = ['admin','super_admin'].includes(member.role);
  const load = useCallback(async () => {
    if (section==='Référentiels') return;
    setLoading(true); setError('');
    const result = section==='Utilisateurs'
      ? await supabase.from('sirex_members').select('user_id,full_name,matricule,role,province,active').order('full_name')
      : await supabase.from('sirex_audit_logs').select('id,action,entity_type,entity_id,actor_id,created_at,details').order('created_at',{ascending:false}).limit(200);
    if (result.error) setError(result.error.message); else setRows(result.data||[]);
    setLoading(false);
  },[section]);
  useEffect(()=>{void load();},[load]);
  async function save() {
    setSaving(true); setError('');
    if (!/^[0-9a-f-]{36}$/i.test(form.user_id) || !form.full_name.trim()) {setError('Renseignez l’UUID du compte Auth existant et son nom.'); setSaving(false); return;}
    const {error}=await supabase.from('sirex_members').upsert({...form, full_name:form.full_name.trim(), matricule:form.matricule||null, province:['admin','super_admin'].includes(form.role)?null:form.province}).select('user_id').single();
    if (error) setError(error.message); else await load();
    setSaving(false);
  }
  return <section className="workspace-page"><div className="workspace-title"><div><p className="eyebrow">Administration</p><h1>{section}</h1></div>{section!=='Référentiels'&&<button className="secondary-button" onClick={()=>void load()}>Actualiser</button>}</div>{section==='Référentiels'?<div className="panel admin-panel"><h2>Provinces de la RDC</h2><p>{provinces.join(' · ')}</p><h2>Devises et unités</h2><p>USD · CDF · EUR · JPY</p><p>PCS · UN · KG · TONNE · LOT</p><p>Les comparaisons exigent la même devise et la même unité. Les codes SH doivent être repris depuis les documents source.</p></div>:<><div className="panel admin-panel">{loading?<p>Chargement…</p>:<div className="table-wrap"><table><thead><tr>{(section==='Utilisateurs'?['Nom','Matricule','Rôle','Province','Accès','Action']:['Date','Action','Entité','Auteur','Détail']).map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r,n)=><tr key={String(r.id||r.user_id||n)}>{section==='Utilisateurs'?<><td>{String(r.full_name)}</td><td>{String(r.matricule||'—')}</td><td>{roleLabels[String(r.role)]}</td><td>{String(r.province||'National')}</td><td>{r.active?'Actif':'Suspendu'}</td><td>{isAdmin&&<button className="row-action" onClick={()=>setForm({user_id:String(r.user_id),full_name:String(r.full_name),matricule:String(r.matricule||''),role:String(r.role),province:String(r.province||'Kinshasa'),active:!!r.active})}>Modifier</button>}</td></>:<><td>{new Date(String(r.created_at)).toLocaleString('fr-FR')}</td><td>{String(r.action)}</td><td>{String(r.entity_type)}<small> {String(r.entity_id||'')}</small></td><td>{String(r.actor_id||'Système')}</td><td><details><summary>Consulter</summary><pre>{JSON.stringify(r.details,null,2)}</pre></details></td></>}</tr>)}</tbody></table>{!rows.length&&<p>Aucun enregistrement visible.</p>}</div>}{section==='Journal d’audit'&&<p>Les 200 événements les plus récents visibles pour votre habilitation. Journal en lecture seule.</p>}</div>{section==='Utilisateurs'&&isAdmin&&<div className="panel admin-panel"><h2>Habiliter un compte existant</h2><p>Le compte doit d’abord être créé ou invité par l’administrateur dans Supabase Auth. Aucun accès n’est attribué automatiquement.</p><div className="form-grid"><label>UUID du compte<input value={form.user_id} onChange={e=>setForm({...form,user_id:e.target.value})}/></label><label>Nom<input value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})}/></label><label>Matricule<input value={form.matricule} onChange={e=>setForm({...form,matricule:e.target.value})}/></label><label>Rôle<select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>{Object.entries(roleLabels).filter(([r])=>r!=='super_admin'||member.role==='super_admin').map(([r,l])=><option key={r} value={r}>{l}</option>)}</select></label><label>Province<select value={form.province} onChange={e=>setForm({...form,province:e.target.value})}>{provinces.map(p=><option key={p}>{p}</option>)}</select></label><label>Accès<select value={String(form.active)} onChange={e=>setForm({...form,active:e.target.value==='true'})}><option value="true">Actif</option><option value="false">Suspendu</option></select></label></div><button disabled={saving} className="primary-button" onClick={()=>void save()}>{saving?'Enregistrement…':'Enregistrer l’habilitation'}</button></div>}</>}{error&&<div className="form-error">{error}</div>}</section>;
}
