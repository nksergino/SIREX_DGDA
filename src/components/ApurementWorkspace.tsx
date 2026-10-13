import { useState } from 'react';
import { AlertCircle, Check, FileCheck2, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { money } from '@/lib/domain';

type Declaration = {
  id: string;
  declaration_number: string;
  office: string;
  declared_date: string;
  hs_code: string | null;
  designation: string | null;
  declared_value: number;
  status: string;
  operator_id: string;
  currency: string | null;
  operator: { company_name: string } | null;
  act: { reference: string; id: string } | null;
};

type Act = { id: string; reference: string; operator_id: string; authorized_value: number; consumed_value: number; status: string };

type Props = {
  declarations: Declaration[];
  acts: Act[];
  search: string;
  onSearchChange: (value: string) => void;
  onChanged: () => Promise<void>;
  canWrite: boolean;
};

const statusLabels: Record<string, string> = {
  en_attente: 'En attente',
  rapprochee: 'Rapprochée',
  validee: 'Validée',
  a_regulariser: 'À régulariser',
  rejetee: 'Rejetée',
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

export default function ApurementWorkspace({ declarations, acts, search, onSearchChange, onChanged, canWrite }: Props) {
  const [statusFilter, setStatusFilter] = useState('Tous les statuts');
  const [updating, setUpdating] = useState<string | null>(null);
  const [error, setError] = useState('');

  const filtered = declarations.filter((d) => {
    const q = search.toLowerCase();
    const matchesSearch = `${d.declaration_number} ${d.operator?.company_name ?? ''} ${d.act?.reference ?? ''}`.toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'Tous les statuts' || d.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const pendingCount = declarations.filter((d) => d.status === 'en_attente').length;
  const rapprocheeCount = declarations.filter((d) => d.status === 'rapprochee').length;
  const validatedCount = declarations.filter((d) => d.status === 'validee').length;
  const regularizeCount = declarations.filter((d) => d.status === 'a_regulariser').length;

  async function checkDeclaration(id: string) {
    setUpdating(id); setError('');
    const {data, error} = await supabase.rpc('sirex_check_declaration', {p_declaration_id:id});
    setError(error?.message || (data?.length ? data.map((r: {detail:string}) => r.detail).join(' · ') : 'Contrôle terminé : aucun écart détecté.'));
    setUpdating(null);
  }
  async function updateStatus(declarationId: string, newStatus: string) {
    setUpdating(declarationId); setError('');
    const { error } = await supabase.from('sirex_declarations').update({ status:newStatus }).eq('id',declarationId).select('id').single();
    if (error) setError(error.message); else await onChanged();
    setUpdating(null);
  }
  async function linkAct(declarationId: string, actId: string) {
    if (!actId) return;
    setUpdating(declarationId); setError('');
    const {error} = await supabase.from('sirex_declarations').update({act_id:actId,status:'rapprochee'}).eq('id',declarationId).select('id').single();
    if (error) setError(error.message); else await onChanged();
    setUpdating(null);
  }

  return (
    <section className="workspace-page">
      <div className="workspace-title">
        <div>
          <p className="eyebrow">Rapprochement</p>
          <h1>Apurement</h1>
          <p className="page-subtitle">Rapprochez les déclarations avec les arrêtés et validez l'apurement.</p>
        </div>
      </div>
      <div className="operator-summary">
        <div><span>En attente</span><strong>{pendingCount}</strong></div>
        <div><span>Rapprochées</span><strong>{rapprocheeCount}</strong></div>
        <div><span>Validées</span><strong>{validatedCount}</strong></div>
        <div><span>À régulariser</span><strong>{regularizeCount}</strong></div>
      </div>
      <div className="panel operator-registry">
        <div className="registry-toolbar">
          <div className="registry-search">
            <Search size={17} />
            <input value={search} onChange={(e) => onSearchChange(e.target.value)} placeholder="Rechercher par numéro, opérateur ou arrêté" />
          </div>
          <div className="registry-filters">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option>Tous les statuts</option>
              <option value="en_attente">En attente</option>
              <option value="rapprochee">Rapprochée</option>
              <option value="validee">Validée</option>
              <option value="a_regulariser">À régulariser</option>
              <option value="rejetee">Rejetée</option>
            </select>
          </div>
        </div>
        <div className="table-wrap">
          <table className="operator-table apurement-table">
            <thead>
              <tr>
                <th>Déclaration</th>
                <th>Opérateur</th>
                <th>Arrêté rattaché</th>
                <th>Montant</th>
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length ? filtered.map((d) => (
                <tr key={d.id} data-declaration-id={d.id}>
                  <td><strong>{d.declaration_number}</strong><span>{formatDate(d.declared_date)}</span></td>
                  <td>{d.operator?.company_name ?? '—'}</td>
                  <td>
                    {d.act ? (
                      <strong className="act-ref-cell">{d.act.reference}</strong>
                    ) : (
                      <select className="link-act-select" disabled={!canWrite || updating === d.id} defaultValue="" onChange={(e) => linkAct(d.id, e.target.value)}>
                        <option value="">Rattacher…</option>
                        {acts.filter(a => a.operator_id === d.operator_id && a.status === 'valide').map((a) => <option key={a.id} value={a.id}>{a.reference}</option>)}
                      </select>
                    )}
                  </td>
                  <td>{money(Number(d.declared_value), d.currency || 'USD')}</td>
                  <td><span className={`status-pill ${d.status}`}>{statusLabels[d.status] ?? d.status}</span></td>
                  <td>
                    <div className="apurement-actions"><button className="row-action" disabled={updating === d.id} onClick={() => void checkDeclaration(d.id)}>Contrôler</button>{canWrite && d.status === 'validee' && <button className="row-action" disabled={updating === d.id} onClick={() => void updateStatus(d.id, 'en_attente')}>Annuler la validation</button>}
                      {canWrite && d.status !== 'validee' && d.act && (
                        <button className="row-action apurement-validate" disabled={updating === d.id} onClick={() => updateStatus(d.id, 'validee')}>
                          <Check size={13} /> Valider
                        </button>
                      )}
                      {canWrite && d.status === 'rapprochee' && (
                        <button className="row-action apurement-reject" disabled={updating === d.id} onClick={() => updateStatus(d.id, 'a_regulariser')}>
                          Régulariser
                        </button>
                      )}
                      {canWrite && d.status === 'en_attente' && d.act && (
                        <button className="row-action apurement-reject" disabled={updating === d.id} onClick={() => updateStatus(d.id, 'rejetee')}>
                          Rejeter
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={6}><div className="empty-state"><FileCheck2 size={17} /> Aucune déclaration à rapprocher</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {error && <div className="data-error"><AlertCircle size={17} />{error}</div>}
    </section>
  );
}
