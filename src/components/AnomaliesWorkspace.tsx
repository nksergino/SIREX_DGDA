import { useState } from 'react';
import { AlertCircle, Check, Clock3, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type AlertItem = {
  id: string;
  severity: 'critique' | 'attention' | 'information';
  title: string;
  detail: string;
  province: string | null;
  status: string;
  created_at: string;
};

type Props = {
  alerts: AlertItem[];
  search: string;
  onSearchChange: (value: string) => void;
  onChanged: () => Promise<void>;
  canWrite: boolean;
};

const statusLabels: Record<string, string> = {
  ouverte: 'Ouverte',
  en_cours: 'En cours',
  resolue: 'Résolue',
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

export default function AnomaliesWorkspace({ alerts, search, onSearchChange, onChanged, canWrite }: Props) {
  const [severityFilter, setSeverityFilter] = useState('Toutes les gravités');
  const [statusFilter, setStatusFilter] = useState('ouverte');
  const [updating, setUpdating] = useState<string | null>(null);
  const [error, setError] = useState('');

  const filtered = alerts.filter((a) => {
    const q = search.toLowerCase();
    const matchesSearch = `${a.title} ${a.detail} ${a.province ?? ''}`.toLowerCase().includes(q);
    const matchesSeverity = severityFilter === 'Toutes les gravités' || a.severity === severityFilter;
    const matchesStatus = statusFilter === 'Toutes' || a.status === statusFilter;
    return matchesSearch && matchesSeverity && matchesStatus;
  });

  const critiqueCount = alerts.filter((a) => a.severity === 'critique' && a.status !== 'resolue').length;
  const attentionCount = alerts.filter((a) => a.severity === 'attention' && a.status !== 'resolue').length;
  const openCount = alerts.filter((a) => a.status === 'ouverte').length;
  const resolvedCount = alerts.filter((a) => a.status === 'resolue').length;

  async function updateAlertStatus(alertId: string, newStatus: string) {
    setUpdating(alertId);
    setError('');
    const { error: updateError } = await supabase
      .from('sirex_alerts')
      .update({ status: newStatus })
      .eq('id', alertId).select('id').single();
    if (updateError) setError(updateError.message);
    else await onChanged();
    setUpdating(null);
  }

  return (
    <section className="workspace-page">
      <div className="workspace-title">
        <div>
          <p className="eyebrow">Contrôle & conformité</p>
          <h1>Anomalies</h1>
          <p className="page-subtitle">Suivez et traitez les alertes détectées sur les régimes préférentiels.</p>
        </div>
      </div>
      <div className="operator-summary">
        <div><span>Alertes critiques</span><strong>{critiqueCount}</strong></div>
        <div><span>En attention</span><strong>{attentionCount}</strong></div>
        <div><span>Ouvertes</span><strong>{openCount}</strong></div>
        <div><span>Résolues</span><strong>{resolvedCount}</strong></div>
      </div>
      <div className="panel operator-registry">
        <div className="registry-toolbar">
          <div className="registry-search">
            <Search size={17} />
            <input value={search} onChange={(e) => onSearchChange(e.target.value)} placeholder="Rechercher par titre, détail ou province" />
          </div>
          <div className="registry-filters">
            <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
              <option>Toutes les gravités</option>
              <option value="critique">Critique</option>
              <option value="attention">Attention</option>
              <option value="information">Information</option>
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="ouverte">Ouvertes</option>
              <option value="en_cours">En cours</option>
              <option value="resolue">Résolues</option>
              <option value="Toutes">Toutes</option>
            </select>
          </div>
        </div>
        <div className="alert-list">
          {filtered.length ? filtered.map((alert) => (
            <div className="alert-row alert-row-full" key={alert.id}>
              <div className={`alert-symbol ${alert.severity}`}>
                {alert.severity === 'critique' ? <AlertCircle size={16} /> : alert.severity === 'attention' ? <Clock3 size={16} /> : <Check size={16} />}
              </div>
              <div className="alert-copy">
                <strong>{alert.title}</strong>
                <span>{alert.detail}</span>
                <small>{formatDate(alert.created_at)}{alert.province ? ` · ${alert.province}` : ''}</small>
              </div>
              <div className="anomaly-actions">
                <span className={`status-pill anomaly-status-${alert.status}`}>{statusLabels[alert.status] ?? alert.status}</span>
                {canWrite && alert.status === 'ouverte' && (
                  <button className="row-action" disabled={updating === alert.id} onClick={() => updateAlertStatus(alert.id, 'en_cours')}>Prendre en charge</button>
                )}
                {canWrite && alert.status === 'en_cours' && (
                  <button className="row-action apurement-validate" disabled={updating === alert.id} onClick={() => updateAlertStatus(alert.id, 'resolue')}><Check size={13} /> Résoudre</button>
                )}
                {canWrite && alert.status !== 'resolue' && (
                  <button className="row-action apurement-reject" disabled={updating === alert.id} onClick={() => updateAlertStatus(alert.id, 'resolue')}>Clôturer</button>
                )}
              </div>
            </div>
          )) : (
            <div className="empty-state"><Check size={18} /> Aucune anomalie ne correspond à ces critères</div>
          )}
        </div>
      </div>
      {error && <div className="data-error"><AlertCircle size={17} />{error}</div>}
    </section>
  );
}
