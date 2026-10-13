import { useState } from 'react';
import { AlertCircle, ArrowUpRight, Check, FileCheck2, Search, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Declaration = {
  id: string;
  declaration_number: string;
  office: string;
  declared_date: string;
  hs_code: string | null;
  designation: string | null;
  declared_value: number;
  status: string;
  operator: { company_name: string } | null;
  act: { reference: string; id: string } | null;
};

type Act = { id: string; reference: string; operator_id: string; authorized_value: number; consumed_value: number };

type Props = {
  declarations: Declaration[];
  acts: Act[];
  search: string;
  onSearchChange: (value: string) => void;
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

function formatMoney(value: number) {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(value);
}

export default function ApurementWorkspace({ declarations, acts, search, onSearchChange }: Props) {
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

  async function updateStatus(declarationId: string, newStatus: string) {
    setUpdating(declarationId);
    setError('');
    const { error: updateError } = await supabase
      .from('sirex_declarations')
      .update({ status: newStatus })
      .eq('id', declarationId);
    if (updateError) {
      setError(updateError.message);
    } else {
      const row = document.querySelector(`[data-declaration-id="${declarationId}"] .status-pill`);
      if (row) {
        row.className = `status-pill ${newStatus}`;
        row.textContent = statusLabels[newStatus] ?? newStatus;
      }
    }
    setUpdating(null);
  }

  async function linkAct(declarationId: string, actId: string) {
    if (!actId) return;
    setUpdating(declarationId);
    setError('');
    const { error: updateError } = await supabase
      .from('sirex_declarations')
      .update({ act_id: actId, status: 'rapprochee' })
      .eq('id', declarationId);
    if (updateError) setError(updateError.message);
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
                      <select className="link-act-select" defaultValue="" onChange={(e) => linkAct(d.id, e.target.value)}>
                        <option value="">Rattacher…</option>
                        {acts.map((a) => <option key={a.id} value={a.id}>{a.reference}</option>)}
                      </select>
                    )}
                  </td>
                  <td>{formatMoney(Number(d.declared_value))} FC</td>
                  <td><span className={`status-pill ${d.status}`}>{statusLabels[d.status] ?? d.status}</span></td>
                  <td>
                    <div className="apurement-actions">
                      {d.status !== 'validee' && d.act && (
                        <button className="row-action apurement-validate" disabled={updating === d.id} onClick={() => updateStatus(d.id, 'validee')}>
                          <Check size={13} /> Valider
                        </button>
                      )}
                      {d.status === 'rapprochee' && (
                        <button className="row-action apurement-reject" disabled={updating === d.id} onClick={() => updateStatus(d.id, 'a_regulariser')}>
                          Régulariser
                        </button>
                      )}
                      {d.status === 'en_attente' && d.act && (
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
