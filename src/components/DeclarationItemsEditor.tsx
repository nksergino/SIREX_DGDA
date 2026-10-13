import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Item = { description: string; hs_code: string; quantity: string; unit: string; cif_value: string; currency: string };
const empty = (currency: string): Item => ({ description:'', hs_code:'', quantity:'', unit:'PCS', cif_value:'', currency });
export default function DeclarationItemsEditor({ declarationId, currency, validated, canWrite, onChanged }: { declarationId: string; currency: string; validated: boolean; canWrite: boolean; onChanged: () => Promise<void> }) {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let alive = true;
    void supabase.from('sirex_declaration_items').select('description, hs_code, quantity, unit, cif_value, currency').eq('declaration_id', declarationId).order('created_at').then(({data, error}) => {
      if (!alive) return;
      if (error) setError(error.message);
      else setItems((data || []).map(i => ({...i, hs_code: i.hs_code || '', quantity: String(i.quantity), cif_value: String(i.cif_value)})));
      setLoading(false);
    });
    return () => { alive = false; };
  }, [declarationId]);
  const disabled = !canWrite || validated || loading || saving;
  function update(index: number, key: keyof Item, value: string) { setItems(current => current.map((i,n) => n === index ? {...i,[key]:value} : i)); }
  async function save() {
    setSaving(true); setError('');
    if (!items.length || items.some(i => !i.description.trim() || !Number.isFinite(Number(i.quantity)) || Number(i.quantity) <= 0 || !Number.isFinite(Number(i.cif_value)) || Number(i.cif_value) < 0 || i.quantity === '' || i.cif_value === '')) {
      setError('Chaque article doit avoir une désignation, une quantité positive et une valeur CIF valide.'); setSaving(false); return;
    }
    const {error} = await supabase.rpc('sirex_save_declaration_items', { p_declaration_id: declarationId, p_items: items.map(i => ({ ...i, description:i.description.trim(), quantity:Number(i.quantity), cif_value:Number(i.cif_value) })) });
    if (error) setError(error.message); else await onChanged();
    setSaving(false);
  }
  return <div className="detail-section"><p className="eyebrow">Articles déclarés pour le contrôle</p><p>Reprenez chaque article de la déclaration. La somme des valeurs CIF doit correspondre au montant déclaré, dans la même devise.</p>{validated && <p>Annulez la validation avant de modifier les articles.</p>}{items.map((i,n) => <fieldset key={n} disabled={disabled} className="line-editor"><label>Désignation<input value={i.description} onChange={e=>update(n,'description',e.target.value)} /></label><div className="form-grid"><label>Code SH<input value={i.hs_code} onChange={e=>update(n,'hs_code',e.target.value)} /></label><label>Quantité<input type="number" min="0.001" step="0.001" value={i.quantity} onChange={e=>update(n,'quantity',e.target.value)} /></label><label>Unité<select value={i.unit} onChange={e=>update(n,'unit',e.target.value)}>{['PCS','UN','KG','TONNE','LOT'].map(u=><option key={u}>{u}</option>)}</select></label><label>Valeur CIF ({i.currency})<input type="number" min="0" step="0.01" value={i.cif_value} onChange={e=>update(n,'cif_value',e.target.value)} /></label></div><button type="button" className="text-button" onClick={()=>setItems(c=>c.filter((_,j)=>j!==n))}>Supprimer l’article</button></fieldset>)}{loading ? <p>Chargement…</p> : !items.length && <p>Aucun article enregistré. L’apurement sera bloqué.</p>}{canWrite && !validated && <div className="modal-actions"><button disabled={disabled} className="secondary-button" onClick={()=>setItems(c=>[...c,empty(currency)])}>Ajouter un article</button><button disabled={disabled} className="primary-button" onClick={()=>void save()}>{saving?'Enregistrement…':'Enregistrer les articles'}</button></div>}{error && <div className="form-error">{error}</div>}</div>;
}
