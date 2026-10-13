import { FormEvent, useState } from 'react';
import { AlertCircle, ArrowUpRight, ClipboardCheck, Plus, Search, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { money, totalsByCurrency } from '@/lib/domain';
import DeclarationItemsEditor from '@/components/DeclarationItemsEditor';

type Operator = { id: string; company_name: string };
type Act = { id: string; reference: string; operator_id: string };
type Declaration = {
  id: string;
  declaration_number: string;
  office: string;
  declared_date: string;
  hs_code: string | null;
  designation: string | null;
  declared_value: number;
  status: string;
  exporter_name: string | null;
  exporter_address: string | null;
  declarant_name: string | null;
  customs_regime: string | null;
  destination_reference: string | null;
  financial_responsible: string | null;
  financial_responsible_address: string | null;
  shipment_country: string | null;
  origin_country: string | null;
  destination_country: string | null;
  preference_code: string | null;
  currency: string | null;
  invoice_value: number | null;
  exchange_rate: number | null;
  tax_base: number | null;
  total_taxes: number | null;
  taxes_detail: string | null;
  package_count: number | null;
  gross_weight: number | null;
  net_weight: number | null;
  transport_mode: string | null;
  vehicle_reference: string | null;
  operator: { company_name: string } | null;
  act: { reference: string } | null;
};

type Props = {
  declarations: Declaration[];
  operators: Operator[];
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

function formatMoney(value: number) {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value);
}

export default function DeclarationsWorkspace({ declarations, operators, acts, search, onSearchChange, onChanged, canWrite }: Props) {
  const [statusFilter, setStatusFilter] = useState('Tous les statuts');
  const [officeFilter, setOfficeFilter] = useState('Tous les bureaux');
  const [showModal, setShowModal] = useState(false);
  const [selectedDeclaration, setSelectedDeclaration] = useState<Declaration | null>(null);

  const offices = Array.from(new Set(declarations.map((d) => d.office))).sort();
  const filtered = declarations.filter((d) => {
    const q = search.toLowerCase();
    const matchesSearch = `${d.declaration_number} ${d.operator?.company_name ?? ''} ${d.designation ?? ''} ${d.hs_code ?? ''}`.toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'Tous les statuts' || d.status === statusFilter;
    const matchesOffice = officeFilter === 'Tous les bureaux' || d.office === officeFilter;
    return matchesSearch && matchesStatus && matchesOffice;
  });

  const totalDeclared = totalsByCurrency(declarations, 'declared_value');
  const pendingCount = declarations.filter((d) => d.status === 'en_attente').length;
  const validatedCount = declarations.filter((d) => d.status === 'validee').length;

  return (
    <section className="workspace-page">
      <div className="workspace-title">
        <div>
          <p className="eyebrow">Régimes préférentiels</p>
          <h1>Déclarations</h1>
          <p className="page-subtitle">Suivez les déclarations d'importation et leur rapprochement avec les arrêtés.</p>
        </div>
        <button className="primary-button" onClick={() => setShowModal(true)} disabled={!operators.length || !canWrite}>
          <Plus size={18} /> Nouvelle déclaration
        </button>
      </div>
      <div className="operator-summary">
        <div><span>Total déclarations</span><strong>{declarations.length}</strong></div>
        <div><span>En attente</span><strong>{pendingCount}</strong></div>
        <div><span>Validées</span><strong>{validatedCount}</strong></div>
        <div><span>Valeur déclarée</span><strong>{totalDeclared}</strong></div>
      </div>
      <div className="panel operator-registry">
        <div className="registry-toolbar">
          <div className="registry-search">
            <Search size={17} />
            <input value={search} onChange={(e) => onSearchChange(e.target.value)} placeholder="Rechercher par numéro, opérateur, désignation" />
          </div>
          <div className="registry-filters">
            <select value={officeFilter} onChange={(e) => setOfficeFilter(e.target.value)}>
              <option>Tous les bureaux</option>
              {offices.map((o) => <option key={o}>{o}</option>)}
            </select>
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
          <table className="operator-table">
            <thead>
              <tr>
                <th>Déclaration</th>
                <th>Opérateur</th>
                <th>Bureau</th>
                <th>Désignation</th>
                <th>Montant</th>
                <th>Statut</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.length ? filtered.map((d) => (
                <tr key={d.id} onClick={() => setSelectedDeclaration(d)}>
                  <td><strong>{d.declaration_number}</strong><span>{formatDate(d.declared_date)}</span></td>
                  <td>{d.operator?.company_name ?? '—'}</td>
                  <td>{d.office}</td>
                  <td>{d.designation || '—'}</td>
                  <td>{money(Number(d.declared_value), d.currency || 'USD')}</td>
                  <td><span className={`status-pill ${d.status}`}>{statusLabels[d.status] ?? d.status}</span></td>
                  <td><button className="row-action" onClick={(e) => { e.stopPropagation(); setSelectedDeclaration(d); }}>Voir</button></td>
                </tr>
              )) : (
                <tr><td colSpan={7}><div className="empty-state"><ClipboardCheck size={17} /> Aucune déclaration ne correspond à ces critères</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <NewDeclarationModal
          operators={operators}
          acts={acts}
          onClose={() => setShowModal(false)}
          onCreated={() => { setShowModal(false); void onChanged(); }}
        />
      )}

      {selectedDeclaration && (
        <DeclarationDetail declaration={selectedDeclaration} onClose={() => setSelectedDeclaration(null)} onChanged={onChanged} canWrite={canWrite} />
      )}

    </section>
  );
}

function NewDeclarationModal({ operators, acts, onClose, onCreated }: {
  operators: Operator[];
  acts: Act[];
  onClose: () => void;
  onCreated: (declaration: Declaration) => void;
}) {
  const [operatorId, setOperatorId] = useState('');
  const [actId, setActId] = useState('');
  const [declarationNumber, setDeclarationNumber] = useState('');
  const [office, setOffice] = useState('Kinshasa');
  const [declaredDate, setDeclaredDate] = useState('');
  const [hsCode, setHsCode] = useState('');
  const [designation, setDesignation] = useState('');
  const [declaredValue, setDeclaredValue] = useState('');
  const [exporterName, setExporterName] = useState('');
  const [exporterAddress, setExporterAddress] = useState('');
  const [declarantName, setDeclarantName] = useState('');
  const [customsRegime, setCustomsRegime] = useState('IM 4');
  const [destinationReference, setDestinationReference] = useState('');
  const [financialResponsible, setFinancialResponsible] = useState('');
  const [financialResponsibleAddress, setFinancialResponsibleAddress] = useState('');
  const [shipmentCountry, setShipmentCountry] = useState('');
  const [originCountry, setOriginCountry] = useState('');
  const [destinationCountry, setDestinationCountry] = useState('République démocratique du Congo');
  const [preferenceCode, setPreferenceCode] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [invoiceValue, setInvoiceValue] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [taxBase, setTaxBase] = useState('');
  const [totalTaxes, setTotalTaxes] = useState('');
  const [taxesDetail, setTaxesDetail] = useState('');
  const [packageCount, setPackageCount] = useState('');
  const [grossWeight, setGrossWeight] = useState('');
  const [netWeight, setNetWeight] = useState('');
  const [transportMode, setTransportMode] = useState('');
  const [vehicleReference, setVehicleReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const operatorActs = acts.filter((a) => a.operator_id === operatorId);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const { data, error: saveError } = await supabase.from('sirex_declarations').insert({
      operator_id: operatorId,
      act_id: actId || null,
      declaration_number: declarationNumber,
      office,
      declared_date: declaredDate,
      hs_code: hsCode || null,
      designation: designation || null,
      declared_value: Number(declaredValue) || 0,
      status: 'en_attente',
      exporter_name: exporterName || null,
      exporter_address: exporterAddress || null,
      declarant_name: declarantName || null,
      customs_regime: customsRegime || null,
      destination_reference: destinationReference || null,
      financial_responsible: financialResponsible || null,
      financial_responsible_address: financialResponsibleAddress || null,
      shipment_country: shipmentCountry || null,
      origin_country: originCountry || null,
      destination_country: destinationCountry || null,
      preference_code: preferenceCode || null,
      currency,
      invoice_value: Number(invoiceValue) || null,
      exchange_rate: Number(exchangeRate) || null,
      tax_base: Number(taxBase) || null,
      total_taxes: Number(totalTaxes) || null,
      taxes_detail: taxesDetail || null,
      package_count: Number(packageCount) || null,
      gross_weight: Number(grossWeight) || null,
      net_weight: Number(netWeight) || null,
      transport_mode: transportMode || null,
      vehicle_reference: vehicleReference || null,
    }).select('id, declaration_number, office, declared_date, hs_code, designation, declared_value, status, exporter_name, exporter_address, declarant_name, customs_regime, destination_reference, financial_responsible, financial_responsible_address, shipment_country, origin_country, destination_country, preference_code, currency, invoice_value, exchange_rate, tax_base, total_taxes, taxes_detail, package_count, gross_weight, net_weight, transport_mode, vehicle_reference, operator:sirex_operators(company_name), act:sirex_acts(reference)').maybeSingle();

    if (saveError || !data) {
      setError(saveError?.message ?? 'Impossible d\u2019enregistrer cette déclaration.');
      setSaving(false);
      return;
    }
    onCreated(data as unknown as Declaration);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card dossier-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">Nouveau mouvement</p>
            <h2>Enregistrer une déclaration</h2>
            <span className="modal-intro">Rattachez la déclaration à un opérateur et, si possible, à un arrêté.</span>
          </div>
          <button type="button" className="icon-button" onClick={onClose}><X size={19} /></button>
        </div>
        <form className="modal-form dossier-form" onSubmit={save}>
          <div className="form-section">
            <div className="form-section-title"><span>01</span><div><strong>Identification</strong><small>Numéro et bureau douanier</small></div></div>
            <div className="form-grid">
              <label>Numéro de déclaration<input value={declarationNumber} onChange={(e) => setDeclarationNumber(e.target.value)} placeholder="Ex. CCK/2026/0001" required /></label>
              <label>Bureau douanier<select value={office} onChange={(e) => setOffice(e.target.value)}><option>Kinshasa</option><option>Lubumbashi</option><option>Matadi</option><option>Goma</option><option>Kolwezi</option></select></label>
            </div>
            <label>Date de déclaration<input type="date" value={declaredDate} onChange={(e) => setDeclaredDate(e.target.value)} required /></label>
          </div>
          <div className="form-section">
            <div className="form-section-title"><span>02</span><div><strong>Rattachement</strong><small>Opérateur et arrêté correspondant</small></div></div>
            <label>Opérateur<select value={operatorId} onChange={(e) => { setOperatorId(e.target.value); setActId(''); }} required><option value="">Sélectionner…</option>{operators.map((o) => <option key={o.id} value={o.id}>{o.company_name}</option>)}</select></label>
            {operatorActs.length > 0 && (
              <label>Arrêté rattaché (optionnel)<select value={actId} onChange={(e) => setActId(e.target.value)}><option value="">Aucun</option>{operatorActs.map((a) => <option key={a.id} value={a.id}>{a.reference}</option>)}</select></label>
            )}
          </div>
          <div className="form-section">
            <div className="form-section-title"><span>03</span><div><strong>Parties et régime Sydonia</strong><small>Exporter, procédure et responsable financier</small></div></div>
            <div className="form-grid">
              <label>Exportateur<input value={exporterName} onChange={(e) => setExporterName(e.target.value)} placeholder="Nom de l’exportateur" /></label>
              <label>Déclarant / représentant<input value={declarantName} onChange={(e) => setDeclarantName(e.target.value)} placeholder="Nom du déclarant" /></label>
            </div>
            <label>Adresse de l’exportateur<input value={exporterAddress} onChange={(e) => setExporterAddress(e.target.value)} placeholder="Adresse complète" /></label>
            <div className="form-grid">
              <label>Régime douanier<input value={customsRegime} onChange={(e) => setCustomsRegime(e.target.value)} placeholder="Ex. IM 4" /></label>
              <label>Référence dossier destination<input value={destinationReference} onChange={(e) => setDestinationReference(e.target.value)} placeholder="Ex. E 3746" /></label>
            </div>
            <div className="form-grid">
              <label>Responsable financier<input value={financialResponsible} onChange={(e) => setFinancialResponsible(e.target.value)} placeholder="Nom de l’entreprise" /></label>
              <label>Adresse du responsable<input value={financialResponsibleAddress} onChange={(e) => setFinancialResponsibleAddress(e.target.value)} placeholder="Adresse complète" /></label>
            </div>
          </div>
          <div className="form-section">
            <div className="form-section-title"><span>04</span><div><strong>Origine et transport</strong><small>Trajet, pays, colis et moyen de transport</small></div></div>
            <div className="form-grid">
              <label>Pays d’expédition<input value={shipmentCountry} onChange={(e) => setShipmentCountry(e.target.value)} placeholder="Ex. Belgique" /></label>
              <label>Pays d’origine<input value={originCountry} onChange={(e) => setOriginCountry(e.target.value)} placeholder="Ex. Japon" /></label>
            </div>
            <div className="form-grid">
              <label>Pays de destination<input value={destinationCountry} onChange={(e) => setDestinationCountry(e.target.value)} /></label>
              <label>Code préférence / quota<input value={preferenceCode} onChange={(e) => setPreferenceCode(e.target.value)} placeholder="Ex. PUK8" /></label>
            </div>
            <div className="form-grid">
              <label>Mode de transport<input value={transportMode} onChange={(e) => setTransportMode(e.target.value)} placeholder="Routier, maritime…" /></label>
              <label>Référence véhicule / transport<input value={vehicleReference} onChange={(e) => setVehicleReference(e.target.value)} placeholder="Immatriculation ou référence" /></label>
            </div>
          </div>
          <div className="form-section">
            <div className="form-section-title"><span>05</span><div><strong>Marchandises et valeurs</strong><small>Informations reprises du modèle Sydonia</small></div></div>
            <div className="form-grid">
              <label>Code HS<input value={hsCode} onChange={(e) => setHsCode(e.target.value)} placeholder="Ex. 8704.21.00" /></label>
              <label>Désignation<input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="Description de la marchandise" /></label>
            </div>
            <div className="form-grid">
              <label>Valeur déclarée<input type="number" min="0" step="0.01" value={declaredValue} onChange={(e) => setDeclaredValue(e.target.value)} placeholder="Montant" required /></label>
              <label>Devise<select value={currency} onChange={(e) => setCurrency(e.target.value)}><option>USD</option><option>EUR</option><option>CDF</option><option>JPY</option></select></label>
            </div>
            <div className="form-grid">
              <label>Valeur facture<input type="number" min="0" step="0.01" value={invoiceValue} onChange={(e) => setInvoiceValue(e.target.value)} placeholder="Total facture" /></label>
              <label>Taux de change<input type="number" min="0" step="0.000001" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} placeholder="Ex. 1901" /></label>
            </div>
            <div className="form-grid">
              <label>Nombre de colis<input type="number" min="0" step="0.001" value={packageCount} onChange={(e) => setPackageCount(e.target.value)} placeholder="Ex. 5" /></label>
              <label>Poids brut (kg)<input type="number" min="0" step="0.001" value={grossWeight} onChange={(e) => setGrossWeight(e.target.value)} placeholder="Ex. 12000" /></label>
            </div>
            <div className="form-grid">
              <label>Poids net (kg)<input type="number" min="0" step="0.001" value={netWeight} onChange={(e) => setNetWeight(e.target.value)} placeholder="Ex. 10000" /></label>
              <label>Base taxable<input type="number" min="0" step="0.01" value={taxBase} onChange={(e) => setTaxBase(e.target.value)} placeholder="Base de calcul" /></label>
            </div>
          </div>
          <div className="form-section">
            <div className="form-section-title"><span>06</span><div><strong>Droits et taxes</strong><small>Montants et ventilation Sydonia</small></div></div>
            <label>Total droits et taxes<input type="number" min="0" step="0.01" value={totalTaxes} onChange={(e) => setTotalTaxes(e.target.value)} placeholder="Montant total" /></label>
            <label>Détail des taxes<textarea value={taxesDetail} onChange={(e) => setTaxesDetail(e.target.value)} placeholder="DD, DCI, TVA, TPI, CPR…" rows={3} /></label>
          </div>
          {error && <div className="form-error"><AlertCircle size={16} />{error}</div>}
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose}>Annuler</button>
            <button className="primary-button" disabled={saving}>{saving ? 'Enregistrement…' : 'Créer la déclaration'}<ArrowUpRight size={17} /></button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeclarationDetail({ declaration, onClose, onChanged, canWrite }: { declaration: Declaration; onClose: () => void; onChanged: () => Promise<void>; canWrite: boolean }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <aside className="detail-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <p className="eyebrow">Déclaration {declaration.declaration_number}</p>
            <h2>{declaration.designation || 'Détails de la déclaration'}</h2>
          </div>
          <button className="icon-button" onClick={onClose}><X size={19} /></button>
        </div>
        <DeclarationItemsEditor declarationId={declaration.id} currency={declaration.currency || 'USD'} validated={declaration.status === 'validee'} canWrite={canWrite} onChanged={onChanged} />
        <div className="drawer-status">
          <span className={`status-pill ${declaration.status}`}>{statusLabels[declaration.status] ?? declaration.status}</span>
          <span className="province-cell">{declaration.office}</span>
        </div>
        <div className="detail-section">
          <p className="eyebrow">Informations générales</p>
          <div className="detail-grid">
            <div><span>Numéro</span><strong>{declaration.declaration_number}</strong></div>
            <div><span>Date</span><strong>{formatDate(declaration.declared_date)}</strong></div>
            <div><span>Opérateur</span><strong>{declaration.operator?.company_name ?? '—'}</strong></div>
            <div><span>Bureau</span><strong>{declaration.office}</strong></div>
            <div><span>Code HS</span><strong>{declaration.hs_code || 'Non renseigné'}</strong></div>
            <div><span>Régime douanier</span><strong>{declaration.customs_regime || 'Non renseigné'}</strong></div>
            <div><span>Exportateur</span><strong>{declaration.exporter_name || 'Non renseigné'}</strong></div>
            <div><span>Pays d’origine</span><strong>{declaration.origin_country || 'Non renseigné'}</strong></div>
            <div><span>Pays d’expédition</span><strong>{declaration.shipment_country || 'Non renseigné'}</strong></div>
            <div><span>Pays de destination</span><strong>{declaration.destination_country || 'Non renseigné'}</strong></div>
            <div><span>Arrêté rattaché</span><strong>{declaration.act?.reference ?? 'Non rattaché'}</strong></div>
          </div>
        </div>
        <div className="detail-section">
          <p className="eyebrow">Valeurs Sydonia</p>
          <div className="consumption-breakdown">
            <div><span>Valeur déclarée</span><strong>{formatMoney(Number(declaration.declared_value))} {declaration.currency || 'FC'}</strong></div>
            <div><span>Valeur facture</span><strong>{declaration.invoice_value ? `${formatMoney(Number(declaration.invoice_value))} ${declaration.currency || ''}` : 'Non renseignée'}</strong></div>
            <div><span>Base taxable</span><strong>{declaration.tax_base ? formatMoney(Number(declaration.tax_base)) : 'Non renseignée'}</strong></div>
          </div>
          <div className="detail-grid declaration-detail-grid">
            <div><span>Nombre de colis</span><strong>{declaration.package_count ?? 'Non renseigné'}</strong></div>
            <div><span>Poids brut</span><strong>{declaration.gross_weight ? `${declaration.gross_weight} kg` : 'Non renseigné'}</strong></div>
            <div><span>Poids net</span><strong>{declaration.net_weight ? `${declaration.net_weight} kg` : 'Non renseigné'}</strong></div>
            <div><span>Taux de change</span><strong>{declaration.exchange_rate ?? 'Non renseigné'}</strong></div>
            <div><span>Total taxes</span><strong>{declaration.total_taxes ? formatMoney(Number(declaration.total_taxes)) : 'Non renseigné'}</strong></div>
            <div><span>Préférence / quota</span><strong>{declaration.preference_code || 'Non renseigné'}</strong></div>
          </div>
          {declaration.taxes_detail && <p className="detail-copy">{declaration.taxes_detail}</p>}
        </div>
        <div className="detail-section">
          <p className="eyebrow">Transport et responsables</p>
          <div className="detail-grid">
            <div><span>Transport</span><strong>{declaration.transport_mode || 'Non renseigné'}</strong></div>
            <div><span>Référence véhicule</span><strong>{declaration.vehicle_reference || 'Non renseignée'}</strong></div>
            <div><span>Responsable financier</span><strong>{declaration.financial_responsible || 'Non renseigné'}</strong></div>
            <div><span>Référence destination</span><strong>{declaration.destination_reference || 'Non renseignée'}</strong></div>
          </div>
        </div>
        <button className="primary-button full" onClick={onClose}>Fermer</button>
      </aside>
    </div>
  );
}
