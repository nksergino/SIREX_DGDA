import { lazy, Suspense, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  Bell,
  BookOpen,
  Building2,
  Check,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  FileText,
  LayoutDashboard,
  MapPin,
  LogOut,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { supabase, isConfigured } from '@/lib/supabase';
import { loginIdentity, Member, money, provinces, relationOne, roleLabels, totalsByCurrency } from '@/lib/domain';
import UsageChart from '@/components/UsageChart';
import AdminWorkspace from '@/components/AdminWorkspace';
const ExemptionDossierModal = lazy(() => import('@/components/ExemptionDossierModal'));
import DeclarationsWorkspace from '@/components/DeclarationsWorkspace';
import ApurementWorkspace from '@/components/ApurementWorkspace';
import AnomaliesWorkspace from '@/components/AnomaliesWorkspace';

type Session = Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'];
type Operator = { id: string; company_name: string; registration_number: string; province: string; sector: string | null; status: string; tax_id?: string | null; created_at?: string };
type Act = { id: string; reference: string; act_type: string; province: string; start_date: string; end_date: string; status: string; authorized_value: number; consumed_value: number; currency: string; operator_id: string; operator: { company_name: string } | null; approval_number?: string | null; approval_date?: string | null; project_name?: string | null; project_description?: string | null; investment_amount?: number | null; project_location?: string | null; jobs_created?: number | null; customs_benefits?: string | null; tax_benefits?: string | null; investor_obligations?: string | null };
type ActWithOperator = Act & { operator: { company_name: string; id: string } | null };
type Declaration = { id: string; operator_id: string; declaration_number: string; office: string; declared_date: string; hs_code: string | null; designation: string | null; declared_value: number; status: string; exporter_name: string | null; exporter_address: string | null; declarant_name: string | null; customs_regime: string | null; destination_reference: string | null; financial_responsible: string | null; financial_responsible_address: string | null; shipment_country: string | null; origin_country: string | null; destination_country: string | null; preference_code: string | null; currency: string | null; invoice_value: number | null; exchange_rate: number | null; tax_base: number | null; total_taxes: number | null; taxes_detail: string | null; package_count: number | null; gross_weight: number | null; net_weight: number | null; transport_mode: string | null; vehicle_reference: string | null; operator: { company_name: string } | null; act: { reference: string; id: string } | null };
type AlertItem = { id: string; severity: 'critique' | 'attention' | 'information'; title: string; detail: string; province: string | null; created_at: string; status: string };

type NavItem = { label: string; icon: typeof LayoutDashboard; badge?: string };

const navItems: NavItem[] = [
  { label: 'Vue d’ensemble', icon: LayoutDashboard },
  { label: 'Opérateurs', icon: Building2 },
  { label: 'Arrêtés & décisions', icon: FileText },
  { label: 'Déclarations', icon: ClipboardCheck },
  { label: 'Apurement', icon: FileCheck2 },
  { label: 'Anomalies', icon: AlertCircle },
];

const secondaryNav: NavItem[] = [
  { label: 'Référentiels', icon: BookOpen },
  { label: 'Utilisateurs', icon: Users },
  { label: 'Journal d’audit', icon: ShieldCheck },
];

const statusLabels: Record<string, string> = {
  valide: 'Valide',
  expire: 'Expiré',
  suspendu: 'Suspendu',
  en_attente: 'En attente',
  rapprochee: 'Rapprochée',
  validee: 'Validée',
  rejetee: 'Rejetée',
  a_regulariser: 'À régulariser',
  brouillon: 'Brouillon',
  cloture: 'Clôturé',
  active: 'Actif',
  actif: 'Actif',
};

const actTypeLabels: Record<string, string> = {
  exoneration: 'Exonération',
  franchise: 'Franchise douanière',
  admission_temporaire: 'Admission temporaire',
  drawback: 'Drawback',
  regime_preferentiel: 'Régime préférentiel',
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value);
}

function AuthScreen() {
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError('');
    try {
      const {error} = await supabase.auth.signInWithPassword({email:loginIdentity(identity),password});
      if (error) setError('Connexion impossible. Vérifiez vos identifiants et votre accès auprès de l’administrateur.');
    } catch { setError('Connexion indisponible. Réessayez.'); }
    finally {setLoading(false);}
  }
  return <main className="auth-shell"><div className="auth-panel"><div className="brand-lockup large"><div className="brand-mark">S</div><div><strong>SIREX</strong><span>DGDA · DRF</span></div></div><div className="auth-copy"><p className="eyebrow">Espace DGDA</p><h1>Suivi des régimes préférentiels</h1><p>Contrôlez les biens autorisés, les déclarations et les apurements.</p></div></div><div className="auth-card-wrap"><div className="auth-card"><h2>Connexion à SIREX</h2><p>Utilisez l’adresse de votre compte habilité ou votre matricule si votre compte a été créé avec cet identifiant.</p><form className="auth-form" onSubmit={submit}><label>Adresse du compte ou matricule<input autoComplete="username" required value={identity} onChange={e=>setIdentity(e.target.value)} /></label><label>Mot de passe<input autoComplete="current-password" type="password" required value={password} onChange={e=>setPassword(e.target.value)} /></label>{error&&<div className="form-error">{error}</div>}<button disabled={loading} className="primary-button full">{loading?'Connexion…':'Se connecter'}</button></form><p>Pour activer un accès ou réinitialiser un mot de passe, contactez votre administrateur.</p></div></div></main>;
}

function StatCard({ label, value, detail, trend, icon: Icon, tone }: { label: string; value: string; detail: string; trend?: string; icon: typeof Building2; tone: string }) {
  return <div className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={19} /></div><div className="stat-body"><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-detail">{trend && <span className={trend.startsWith('+') ? 'positive' : 'negative'}>{trend} </span>}{detail}</div></div><MoreHorizontal className="stat-more" size={18} /></div>;
}

function NewOperatorModal({ onClose, onCreated }: { onClose: () => void; onCreated: (operator: Operator) => void }) {
  const [name, setName] = useState('');
  const [registration, setRegistration] = useState('');
  const [province, setProvince] = useState('Kinshasa');
  const [sector, setSector] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError('');
    const { data, error: saveError } = await supabase.from('sirex_operators').insert({ company_name: name, registration_number: registration, province, sector }).select('id, company_name, registration_number, province, sector, status, tax_id, created_at').maybeSingle();
    if (saveError || !data) setError(saveError?.message ?? 'Impossible d’enregistrer cet opérateur.');
    else { onCreated(data as Operator); onClose(); }
    setSaving(false);
  }

  return <div className="modal-backdrop" onClick={onClose}><div className="modal-card" onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">Référentiel opérateurs</p><h2>Ajouter un opérateur</h2></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div><form className="modal-form" onSubmit={save}><label>Raison sociale<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nom de l’entreprise" required /></label><div className="form-grid"><label>RCCM / identifiant<input value={registration} onChange={(event) => setRegistration(event.target.value)} placeholder="CD/KIN/RCCM/…" required /></label><label>Province<select value={province} onChange={(event) => setProvince(event.target.value)}>{provinces.map(p => <option key={p}>{p}</option>)}</select></label></div><label>Secteur d’activité<input value={sector} onChange={(event) => setSector(event.target.value)} placeholder="Agro-industrie, énergie…" /></label>{error && <div className="form-error"><AlertCircle size={16} />{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Annuler</button><button className="primary-button" disabled={saving}>{saving ? 'Enregistrement…' : 'Créer le dossier'}<ArrowUpRight size={17} /></button></div></form></div></div>;
}

function OperatorsWorkspace({ operators, search, onSearchChange, onCreate, onSelect }: { operators: Operator[]; search: string; onSearchChange: (value: string) => void; onCreate: () => void; onSelect: (operator: Operator) => void }) {
  const [province, setProvince] = useState('Toutes les provinces');
  const [status, setStatus] = useState('Tous les statuts');
  const provinces = Array.from(new Set(operators.map((operator) => operator.province))).sort();
  const filtered = operators.filter((operator) => {
    const matchesSearch = `${operator.company_name} ${operator.registration_number} ${operator.province} ${operator.sector ?? ''}`.toLowerCase().includes(search.toLowerCase());
    const matchesProvince = province === 'Toutes les provinces' || operator.province === province;
    const matchesStatus = status === 'Tous les statuts' || operator.status === status;
    return matchesSearch && matchesProvince && matchesStatus;
  });

  return <section className="workspace-page"><div className="workspace-title"><div><p className="eyebrow">Référentiel opérateurs</p><h1>Opérateurs économiques</h1><p className="page-subtitle">Gérez les entreprises bénéficiaires et leur rattachement territorial.</p></div><button className="primary-button" onClick={onCreate}><Plus size={18} /> Nouvel opérateur</button></div><div className="operator-summary"><div><span>Total référencé</span><strong>{operators.length}</strong></div><div><span>Opérateurs actifs</span><strong>{operators.filter((operator) => operator.status === 'actif').length}</strong></div><div><span>Provinces couvertes</span><strong>{provinces.length}</strong></div><div><span>Résultats affichés</span><strong>{filtered.length}</strong></div></div><div className="panel operator-registry"><div className="registry-toolbar"><div className="registry-search"><Search size={17} /><input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Rechercher par raison sociale, RCCM ou province" /></div><div className="registry-filters"><select value={province} onChange={(event) => setProvince(event.target.value)}><option>Toutes les provinces</option>{provinces.map((item) => <option key={item}>{item}</option>)}</select><select value={status} onChange={(event) => setStatus(event.target.value)}><option>Tous les statuts</option><option value="actif">Actif</option><option value="suspendu">Suspendu</option><option value="cloture">Clôturé</option></select></div></div><div className="table-wrap"><table className="operator-table"><thead><tr><th>Opérateur</th><th>Identifiant RCCM</th><th>Province douanière</th><th>Secteur</th><th>Statut</th><th /></tr></thead><tbody>{filtered.length ? filtered.map((operator) => <tr key={operator.id} onClick={() => onSelect(operator)}><td><div className="table-operator"><div className="operator-logo">{operator.company_name.slice(0, 2).toUpperCase()}</div><div><strong>{operator.company_name}</strong><span>Créé dans SIREX</span></div></div></td><td>{operator.registration_number}</td><td><span className="province-cell"><MapPin size={14} />{operator.province}</span></td><td>{operator.sector || 'Non renseigné'}</td><td><span className={`registry-status ${operator.status}`}><i />{statusLabels[operator.status] ?? operator.status}</span></td><td><button className="row-action" onClick={(event) => { event.stopPropagation(); onSelect(operator); }}>Voir</button></td></tr>) : <tr><td colSpan={6}><div className="empty-state"><Building2 size={17} /> Aucun opérateur ne correspond à ces critères</div></td></tr>}</tbody></table></div></div></section>;
}

function OperatorDetail({ operator, onClose }: { operator: Operator; onClose: () => void }) {
  return <div className="modal-backdrop" onClick={onClose}><aside className="detail-drawer" onClick={(event) => event.stopPropagation()}><div className="drawer-head"><div><p className="eyebrow">Fiche opérateur</p><h2>{operator.company_name}</h2></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div><div className="drawer-identity"><div className="drawer-logo">{operator.company_name.slice(0, 2).toUpperCase()}</div><div><strong>{operator.registration_number}</strong><span>Identifiant RCCM / dossier</span></div></div><div className="drawer-status"><span className={`registry-status ${operator.status}`}><i />{statusLabels[operator.status] ?? operator.status}</span><span className="province-cell"><MapPin size={14} />{operator.province}</span></div><div className="detail-section"><p className="eyebrow">Informations déclarées</p><div className="detail-grid"><div><span>Raison sociale</span><strong>{operator.company_name}</strong></div><div><span>Secteur d’activité</span><strong>{operator.sector || 'Non renseigné'}</strong></div><div><span>Identifiant fiscal</span><strong>{operator.tax_id || 'Non renseigné'}</strong></div><div><span>Rattachement</span><strong>Province de {operator.province}</strong></div></div></div><div className="drawer-callout"><FileText size={18} /><div><strong>Suivi des régimes</strong><span>Les arrêtés et déclarations liés à cet opérateur seront regroupés dans sa fiche.</span></div></div><button className="primary-button full" onClick={onClose}>Fermer la fiche</button></aside></div>;
}

function NewActModal({ operators, onClose, onCreated }: { operators: Operator[]; onClose: () => void; onCreated: (act: ActWithOperator) => void }) {
  return <Suspense fallback={<div className="sync-indicator">Chargement du formulaire…</div>}><ExemptionDossierModal operators={operators} onClose={onClose} onCreated={onCreated} /></Suspense>;
}

function ConsumptionBar({ authorized, consumed }: { authorized: number; consumed: number }) {
  const pct = authorized > 0 ? Math.min(100, Math.round((consumed / authorized) * 100)) : 0;
  const tone = pct >= 90 ? 'critical' : pct >= 70 ? 'warning' : 'healthy';
  return <div className="consumption-wrap"><div className="consumption-bar"><div className={`consumption-fill ${tone}`} style={{ width: `${pct}%` }} /></div><span className={`consumption-pct ${tone}`}>{pct}%</span></div>;
}

function ActsWorkspace({ acts, operators, search, onSearchChange, onCreate, onSelect }: { acts: ActWithOperator[]; operators: Operator[]; search: string; onSearchChange: (value: string) => void; onCreate: () => void; onSelect: (act: ActWithOperator) => void }) {
  const [statusFilter, setStatusFilter] = useState('Tous les statuts');
  const [typeFilter, setTypeFilter] = useState('Tous les types');
  const filtered = acts.filter((act) => {
    const q = search.toLowerCase();
    const matchesSearch = `${act.reference} ${act.act_type} ${act.operator?.company_name ?? ''} ${act.province}`.toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'Tous les statuts' || act.status === statusFilter;
    const matchesType = typeFilter === 'Tous les types' || act.act_type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });
  const totalAuthorized = totalsByCurrency(acts, 'authorized_value');
  const totalConsumed = totalsByCurrency(acts, 'consumed_value');
  const expiringCount = acts.filter((act) => act.status === 'valide' && new Date(act.end_date).getTime() >= new Date(new Date().toISOString().slice(0,10)).getTime() && new Date(act.end_date).getTime() - Date.now() < 1000 * 60 * 60 * 24 * 90).length;

  return <section className="workspace-page"><div className="workspace-title"><div><p className="eyebrow">Régimes préférentiels</p><h1>Arrêtés & décisions</h1><p className="page-subtitle">Suivez les décisions d'exonération et leur taux de consommation.</p></div><button className="primary-button" onClick={onCreate} disabled={!operators.length}><Plus size={18} /> Nouvel arrêté</button></div><div className="operator-summary"><div><span>Arrêtés actifs</span><strong>{acts.filter((act) => act.status === 'valide').length}</strong></div><div><span>À échéance 90j</span><strong>{expiringCount}</strong></div><div><span>Valeur autorisée</span><strong>{totalAuthorized}</strong></div><div><span>Valeur consommée</span><strong>{totalConsumed}</strong></div></div><div className="panel operator-registry"><div className="registry-toolbar"><div className="registry-search"><Search size={17} /><input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Rechercher par référence, opérateur ou province" /></div><div className="registry-filters"><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option>Tous les types</option><option value="exoneration">Exonération</option><option value="franchise">Franchise douanière</option><option value="admission_temporaire">Admission temporaire</option><option value="drawback">Drawback</option><option value="regime_preferentiel">Régime préférentiel</option></select><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>Tous les statuts</option><option value="valide">Valide</option><option value="expire">Expiré</option><option value="suspendu">Suspendu</option><option value="en_attente">En attente</option><option value="brouillon">Brouillon</option></select></div></div><div className="table-wrap"><table className="operator-table"><thead><tr><th>Référence</th><th>Opérateur</th><th>Type</th><th>Échéance</th><th>Consommation</th><th>Statut</th><th /></tr></thead><tbody>{filtered.length ? filtered.map((act) => <tr key={act.id} onClick={() => onSelect(act)}><td><strong>{act.reference}</strong><span className="act-province">{act.province}</span></td><td>{act.operator?.company_name ?? '—'}</td><td><span className="act-type-badge">{actTypeLabels[act.act_type] ?? act.act_type}</span></td><td>{formatDate(act.end_date)}</td><td><div className="consumption-cell"><ConsumptionBar authorized={Number(act.authorized_value)} consumed={Number(act.consumed_value)} /><span className="consumption-values">{formatMoney(Number(act.consumed_value))} / {formatMoney(Number(act.authorized_value))}</span></div></td><td><span className={`registry-status ${act.status}`}><i />{statusLabels[act.status] ?? act.status}</span></td><td><button className="row-action" onClick={(event) => { event.stopPropagation(); onSelect(act); }}>Voir</button></td></tr>) : <tr><td colSpan={7}><div className="empty-state"><FileText size={17} /> Aucun arrêté ne correspond à ces critères</div></td></tr>}</tbody></table></div></div></section>;
}

function ActDetail({ act, onClose }: { act: ActWithOperator; onClose: () => void }) {
  const [items, setItems] = useState<Array<{ id: string; quantity: number; unit: string; description: string; cif_value: number }>>([]);
  const [documents, setDocuments] = useState<Array<{ id: string; file_name: string; storage_path: string; file_size: number }>>([]);
  useEffect(() => {
    supabase.from('sirex_act_items').select('id, quantity, unit, description, cif_value').eq('act_id', act.id).order('created_at', { ascending: true }).then(({ data }) => setItems((data ?? []) as Array<{ id: string; quantity: number; unit: string; description: string; cif_value: number }>));
  }, [act.id]);
  useEffect(() => {
    supabase.from('sirex_act_documents').select('id, file_name, storage_path, file_size').eq('act_id', act.id).order('created_at', { ascending: false }).then(({ data }) => setDocuments((data ?? []) as Array<{ id: string; file_name: string; storage_path: string; file_size: number }>));
  }, [act.id]);
  async function openDocument(path: string) {
    const { data } = await supabase.storage.from('sirex-documents').createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }
  const remaining = Number(act.authorized_value) - Number(act.consumed_value);
  const daysLeft = Math.ceil((new Date(act.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return <div className="modal-backdrop" onClick={onClose}><aside className="detail-drawer" onClick={(event) => event.stopPropagation()}><div className="drawer-head"><div><p className="eyebrow">Arrêté {act.reference}</p><h2>{actTypeLabels[act.act_type] ?? act.act_type}</h2></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div><div className="drawer-status"><span className={`registry-status ${act.status}`}><i />{statusLabels[act.status] ?? act.status}</span><span className="province-cell"><MapPin size={14} />{act.province}</span></div><div className="detail-section"><p className="eyebrow">Opérateur bénéficiaire</p><div className="drawer-identity"><div className="drawer-logo">{(act.operator?.company_name ?? '??').slice(0, 2).toUpperCase()}</div><div><strong>{act.operator?.company_name ?? 'Non associé'}</strong><span>Régime préférentiel</span></div></div></div><div className="detail-section"><p className="eyebrow">Période de validité</p><div className="detail-grid"><div><span>Du</span><strong>{formatDate(act.start_date)}</strong></div><div><span>Au</span><strong>{formatDate(act.end_date)}</strong></div><div><span>Jours restants</span><strong style={{ color: daysLeft < 0 ? '#bd3939' : daysLeft < 90 ? '#a66d00' : '#3a5872' }}>{daysLeft < 0 ? 'Expiré' : `${daysLeft} jours`}</strong></div></div></div><div className="detail-section"><p className="eyebrow">Projet d’investissement</p><div className="detail-grid"><div><span>Projet</span><strong>{act.project_name || 'Non renseigné'}</strong></div><div><span>Localisation</span><strong>{act.project_location || act.province}</strong></div><div><span>Investissement prévu</span><strong>{act.investment_amount ? `${formatMoney(Number(act.investment_amount))} USD` : 'Non renseigné'}</strong></div><div><span>Emplois prévus</span><strong>{act.jobs_created ? `${act.jobs_created} emplois` : 'Non renseigné'}</strong></div></div>{act.project_description && <p className="detail-copy">{act.project_description}</p>}</div><div className="detail-section"><p className="eyebrow">Avantages accordés</p><div className="benefit-stack">{act.customs_benefits && <div><strong>Douaniers</strong><span>{act.customs_benefits}</span></div>}{act.tax_benefits && <div><strong>Fiscaux</strong><span>{act.tax_benefits}</span></div>}{act.investor_obligations && <div><strong>Obligations</strong><span>{act.investor_obligations}</span></div>}</div></div>{items.length > 0 && <div className="detail-section"><p className="eyebrow">Biens autorisés à l’importation</p><div className="items-detail-list">{items.map((item) => <div className="items-detail-row" key={item.id}><span>{item.quantity} {item.unit}</span><strong>{item.description}</strong><em>{formatMoney(Number(item.cif_value))} USD</em></div>)}</div></div>}<div className="detail-section"><p className="eyebrow">Consommation du régime</p><div className="consumption-detail"><ConsumptionBar authorized={Number(act.authorized_value)} consumed={Number(act.consumed_value)} /><div className="consumption-breakdown"><div><span>Autorisé</span><strong>{money(Number(act.authorized_value),act.currency)}</strong></div><div><span>Consommé</span><strong>{money(Number(act.consumed_value),act.currency)}</strong></div><div><span>Solde disponible</span><strong>{money(remaining,act.currency)}</strong></div></div></div></div>{documents.length > 0 && <div className="detail-section"><p className="eyebrow">Documents du dossier</p><div className="document-list">{documents.map((document) => <button type="button" className="document-row" key={document.id} onClick={() => openDocument(document.storage_path)}><FileText size={16} /><span><strong>{document.file_name}</strong><small>{Math.round(Number(document.file_size) / 1024)} Ko · PDF sécurisé</small></span><ArrowUpRight size={15} /></button>)}</div></div>}<div className="drawer-callout"><FileText size={18} /><div><strong>Traçabilité</strong><span>Cet arrêté est rattaché aux déclarations d'importation associées à l'opérateur.</span></div></div><button className="primary-button full" onClick={onClose}>Fermer</button></aside></div>;
}

function App() {
  const [session, setSession] = useState<Session>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [member, setMember] = useState<Member | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const generation = useRef(0);
  const currentUser = useRef<string | null>(null);
  const [activeNav, setActiveNav] = useState('Vue d’ensemble');
  const [mobileNav, setMobileNav] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedOperator, setSelectedOperator] = useState<Operator | null>(null);
  const [showActModal, setShowActModal] = useState(false);
  const [selectedAct, setSelectedAct] = useState<ActWithOperator | null>(null);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [acts, setActs] = useState<Act[]>([]);
  const [declarations, setDeclarations] = useState<Declaration[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [search, setSearch] = useState('');
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState('');

  useEffect(() => {
    if (!isConfigured) {setAuthLoading(false);return;}
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const nextUser = nextSession?.user.id || null;
      if (currentUser.current !== nextUser) {
        generation.current += 1; currentUser.current=nextUser;
        setMember(null); setOperators([]); setActs([]); setDeclarations([]); setAlerts([]);
        setSelectedAct(null); setSelectedOperator(null); setShowModal(false); setShowActModal(false);
        setLastSync(null); setDataError('');
      }
      setSession(nextSession); setAuthLoading(false);
    });
    return () => {generation.current += 1; listener.subscription.unsubscribe();};
  }, []);

  const loadData = useCallback(async () => {
    if (!session) return;
    const token = ++generation.current;
    setDataLoading(true); setDataError('');
    try {
      const membership = await supabase.from('sirex_members').select('user_id, full_name, matricule, role, province, active').eq('user_id',session.user.id).maybeSingle();
      if (token !== generation.current) return;
      if (membership.error) throw membership.error;
      if (!membership.data?.active) {setMember(null);setDataError('Votre compte ne dispose pas d’une habilitation SIREX active. Contactez l’administrateur.');return;}
      setMember(membership.data as Member);
      async function all(table: string, columns: string, order: string) {
        const rows: Record<string,unknown>[] = [];
        for (let offset=0;;offset+=500) {
          const {data,error} = await supabase.from(table).select(columns).order(order,{ascending:table==='sirex_acts'}).order('id').range(offset,offset+499);
          if (error) throw error;
          rows.push(...(data || []) as unknown as Record<string,unknown>[]);
          if ((data || []).length < 500) return rows;
        }
      }
      const [ops, actsData, decs, alertsData] = await Promise.all([
        all('sirex_operators','id,company_name,registration_number,province,sector,status,tax_id,created_at','created_at'),
        all('sirex_acts','*,operator:sirex_operators(company_name,id)','end_date'),
        all('sirex_declarations','*,operator:sirex_operators(company_name),act:sirex_acts(reference,id)','declared_date'),
        all('sirex_alerts','id,severity,title,detail,province,created_at,status','created_at'),
      ]);
      if (token !== generation.current) return;
      setOperators(ops as Operator[]);
      setActs(actsData.map(item=>({...item,operator:relationOne(item.operator)})) as Act[]);
      setDeclarations(decs.map(item=>({...item,operator:relationOne(item.operator),act:relationOne(item.act)})) as Declaration[]);
      setAlerts(alertsData as AlertItem[]); setLastSync(new Date().toLocaleString('fr-FR'));
    } catch (error) {
      if (token === generation.current) {setDataError(error instanceof Error ? error.message : 'Chargement impossible. Vérifiez la configuration et les migrations SIREX.');setMember(null);setOperators([]);setActs([]);setDeclarations([]);setAlerts([]);}
    } finally {if (token === generation.current) setDataLoading(false);}
  }, [session]);
  useEffect(()=>{void loadData();},[loadData]);

  const filteredOperators = useMemo(() => operators.filter((operator) => `${operator.company_name} ${operator.registration_number} ${operator.province}`.toLowerCase().includes(search.toLowerCase())), [operators, search]);
  const validActs = acts.filter((act) => act.status === 'valide').length;
  const expiringActs = acts.filter((act) => act.status === 'valide' && new Date(act.end_date).getTime() >= new Date(new Date().toISOString().slice(0,10)).getTime() && new Date(act.end_date).getTime() - Date.now() < 1000 * 60 * 60 * 24 * 90).length;
  const totalConsumed = totalsByCurrency(acts, 'consumed_value');

  if (!isConfigured) return <div className="auth-card"><h1>Configuration SIREX manquante</h1><p>Renseignez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans les paramètres du projet.</p></div>;
  if (authLoading) return <div className="loading-screen"><div className="brand-mark">S</div><span>Chargement de SIREX…</span></div>;
  if (!session) return <AuthScreen />;
  if (!member) return <div className="auth-card"><h1>Accès SIREX</h1><p>{dataLoading ? 'Vérification de votre habilitation…' : dataError || 'Vérification de votre accès…'}</p><button className="secondary-button" onClick={()=>void loadData()}>Réessayer</button><button className="secondary-button" onClick={()=>void supabase.auth.signOut()}>Se déconnecter</button></div>;
  const canWrite = member.role !== 'lecteur';

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
      <div className="sidebar-top"><div className="brand-lockup"><div className="brand-mark">S</div><div><strong>SIREX</strong><span>DGDA · DRF</span></div></div><button className="mobile-close icon-button" onClick={() => setMobileNav(false)}><X size={19} /></button></div>
      <div className="workspace-switcher"><div className="workspace-avatar">DR</div><div><strong>Direction des Recettes</strong><span>{member.province || 'Vue nationale'}</span></div><ChevronDown size={16} /></div>
      <nav className="main-nav"><span className="nav-heading">PILOTAGE</span>{navItems.map(({ label, icon: Icon, badge }) => <button key={label} className={`nav-item ${activeNav === label ? 'active' : ''}`} onClick={() => { setActiveNav(label); setMobileNav(false); }}><Icon size={18} /><span>{label}</span>{badge && <em>{badge}</em>}</button>)}<span className="nav-heading second">ADMINISTRATION</span>{secondaryNav.map(({ label, icon: Icon }) => <button key={label} className={`nav-item ${activeNav === label ? 'active' : ''}`} onClick={() => { setActiveNav(label); setMobileNav(false); }}><Icon size={18} /><span>{label}</span></button>)}</nav>
      <div className="sidebar-bottom"><div className="help-card"><CircleHelp size={18} /><div><strong>Besoin d’aide ?</strong><span>Consulter le guide SIREX</span></div><ArrowUpRight size={15} /></div><button className="nav-item" onClick={() => supabase.auth.signOut()}><LogOut size={18} /><span>Se déconnecter</span></button></div>
    </aside>
    <main className="main-content">
      <header className="topbar"><button className="mobile-menu icon-button" onClick={() => setMobileNav(true)}><Menu size={21} /></button><div className="breadcrumbs"><span>SIREX</span><span>/</span><strong>{activeNav}</strong></div><div className="topbar-actions"><div className="global-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher dans SIREX" /><kbd>⌘ K</kbd></div><button className="icon-button notification"><Bell size={19} /><i /></button><div className="user-menu"><div className="user-avatar">AD</div><div className="user-info"><strong>{member.full_name}</strong><span>{roleLabels[member.role]}</span></div><ChevronDown size={16} /></div></div></header>
      {activeNav === 'Vue d’ensemble' ? <>
        <section className="page-header"><div><p className="eyebrow">{new Date().toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</p><h1>Bonjour, {member.full_name}.</h1><p className="page-subtitle">Voici l’état de vos régimes préférentiels pour l’ensemble du territoire.</p></div><button className="primary-button" disabled={!canWrite || !operators.length} onClick={() => setShowActModal(true)}><Plus size={18} /> Nouveau dossier</button></section>
        {dataError && <div className="data-error"><AlertCircle size={17} />{dataError}<button onClick={loadData}>Réessayer</button></div>}
        <section className="stat-grid"><StatCard label="Opérateurs actifs" value={String(operators.filter((operator) => operator.status === 'actif').length)} detail="référencés dans SIREX" icon={Building2} tone="blue" /><StatCard label="Arrêtés valides" value={String(validActs)} detail="sur le territoire" icon={FileText} tone="teal" /><StatCard label="À échéance < 90 jours" value={String(expiringActs)} detail="nécessitent votre attention" icon={Clock3} tone="amber" /><StatCard label="Valeur consommée" value={totalConsumed} detail="déclarations validées" icon={ArrowUpRight} tone="green" /></section>
        <section className="content-grid"><UsageChart acts={acts} declarations={declarations} /><div className="panel alerts-panel"><div className="panel-head"><div><p className="eyebrow">À traiter</p><h2>Alertes récentes</h2></div><button className="text-button" onClick={() => setActiveNav('Anomalies')}>Tout voir <ArrowUpRight size={15} /></button></div><div className="alert-list">{alerts.length ? alerts.filter(a=>a.status !== 'resolue').slice(0,5).map((alert) => <div className="alert-row" key={alert.id}><div className={`alert-symbol ${alert.severity}`}><AlertCircle size={16} /></div><div className="alert-copy"><strong>{alert.title}</strong><span>{alert.detail}</span><small>{formatDate(alert.created_at)}</small></div><MoreHorizontal size={17} className="row-more" /></div>) : <div className="empty-state"><Check size={18} /><span>Aucune alerte ouverte</span></div>}</div></div></section>
        <section className="lower-grid"><div className="panel table-panel"><div className="panel-head"><div><p className="eyebrow">Derniers mouvements</p><h2>Déclarations récentes</h2></div><button className="text-button" onClick={() => setActiveNav('Déclarations')}>Voir le registre <ArrowUpRight size={15} /></button></div><div className="table-wrap"><table><thead><tr><th>Déclaration</th><th>Opérateur</th><th>Bureau</th><th>Montant déclaré</th><th>Statut</th></tr></thead><tbody>{declarations.length ? declarations.map((declaration) => <tr key={declaration.id}><td><strong>{declaration.declaration_number}</strong><span>{formatDate(declaration.declared_date)}</span></td><td>{declaration.operator?.company_name ?? '—'}</td><td>{declaration.office}</td><td>{money(Number(declaration.declared_value),declaration.currency || 'USD')}</td><td><span className={`status-pill ${declaration.status}`}>{statusLabels[declaration.status] ?? declaration.status}</span></td></tr>) : <tr><td colSpan={5}><div className="empty-state">Aucune déclaration enregistrée</div></td></tr>}</tbody></table></div></div><div className="panel operators-panel"><div className="panel-head"><div><p className="eyebrow">Référentiel</p><h2>Opérateurs suivis</h2></div><button className="icon-button" onClick={() => setShowModal(true)}><Plus size={18} /></button></div><div className="operator-list">{filteredOperators.slice(0, 5).map((operator) => <div className="operator-row" key={operator.id}><div className="operator-logo">{operator.company_name.slice(0, 2).toUpperCase()}</div><div className="operator-copy"><strong>{operator.company_name}</strong><span>{operator.province} · {operator.registration_number}</span></div><span className={`status-dot ${operator.status}`} /> </div>)}{!filteredOperators.length && <div className="empty-state">Aucun opérateur correspondant</div>}</div></div></section>
      </> : activeNav === 'Opérateurs' ? <OperatorsWorkspace operators={operators} search={search} onSearchChange={setSearch} onCreate={() => { if (canWrite) setShowModal(true); }} onSelect={setSelectedOperator} /> : activeNav === 'Arrêtés & décisions' ? <ActsWorkspace acts={acts as ActWithOperator[]} operators={operators} search={search} onSearchChange={setSearch} onCreate={() => { if (canWrite) setShowActModal(true); }} onSelect={setSelectedAct} /> : activeNav === 'Déclarations' ? <DeclarationsWorkspace declarations={declarations as unknown as Declaration[]} operators={operators} acts={acts as Act[]} search={search} onSearchChange={setSearch} onChanged={loadData} canWrite={canWrite} /> : activeNav === 'Apurement' ? <ApurementWorkspace declarations={declarations as unknown as Declaration[]} acts={acts as Act[]} search={search} onSearchChange={setSearch} onChanged={loadData} canWrite={canWrite} /> : activeNav === 'Anomalies' ? <AnomaliesWorkspace alerts={alerts} search={search} onSearchChange={setSearch} onChanged={loadData} canWrite={canWrite} /> : <AdminWorkspace section={activeNav} member={member} />}
      <footer className="page-footer"><span>SIREX v1.0 · Direction des Recettes & Facilitation</span><span>Dernière synchronisation : {lastSync || '—'}</span></footer>
    </main>
    {showModal && <NewOperatorModal onClose={() => setShowModal(false)} onCreated={(operator) => setOperators((current) => [operator, ...current])} />}
    {selectedOperator && <OperatorDetail operator={selectedOperator} onClose={() => setSelectedOperator(null)} />}
    {showActModal && <NewActModal operators={operators} onClose={() => {setShowActModal(false); void loadData();}} onCreated={(act) => setActs((current) => [act, ...current])} />}
    {selectedAct && <ActDetail act={selectedAct} onClose={() => setSelectedAct(null)} />}
    {dataLoading && <div className="sync-indicator"><span className="pulse" /> Synchronisation des données…</div>}
  </div>;
}

export default App;
