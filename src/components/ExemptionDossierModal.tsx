import { FormEvent, useState } from 'react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { AlertCircle, ArrowUpRight, Plus, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Operator = { id: string; company_name: string };
type ActWithOperator = { id: string; reference: string; act_type: string; province: string; start_date: string; end_date: string; status: string; authorized_value: number; consumed_value: number; currency: string; operator_id: string; operator: { company_name: string; id: string } | null };
type ActItem = { quantity: string; unit: string; description: string; cif_value: string };

type Props = { operators: Operator[]; onClose: () => void; onCreated: (act: ActWithOperator) => void };

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

async function extractPdfText(file: File, onProgress: (message: string) => void): Promise<{ text: string; usedOcr: boolean }> {
  const buffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: buffer }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => 'str' in item ? item.str : '').join(' '));
  }
  const text = pages.join('\\n').trim();
  if (text.length >= 40) return { text, usedOcr: false };

  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('fra');
  const ocrPages: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      onProgress(`Reconnaissance OCR : page ${pageNumber}/${pdf.numPages}…`);
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.35 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d');
      if (!context) continue;
      await page.render({ canvasContext: context, viewport }).promise;
      const result = await worker.recognize(canvas);
      ocrPages.push(result.data.text);
    }
  } finally {
    await worker.terminate();
  }
  return { text: ocrPages.join('\\n').trim(), usedOcr: true };
}

const emptyItem = (): ActItem => ({ quantity: '', unit: 'PCS', description: '', cif_value: '' });

export default function ExemptionDossierModal({ operators, onClose, onCreated }: Props) {
  const [operatorId, setOperatorId] = useState('');
  const [reference, setReference] = useState('');
  const [approvalNumber, setApprovalNumber] = useState('');
  const [approvalDate, setApprovalDate] = useState('');
  const [actType, setActType] = useState('exoneration');
  const [province, setProvince] = useState('Kinshasa');
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [projectLocation, setProjectLocation] = useState('');
  const [investmentAmount, setInvestmentAmount] = useState('');
  const [jobsCreated, setJobsCreated] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [customsBenefits, setCustomsBenefits] = useState('Exonération des droits et taxes à l’importation sur les équipements, machines et outillages autorisés.');
  const [taxBenefits, setTaxBenefits] = useState('');
  const [obligations, setObligations] = useState('Réaliser le programme d’investissement et respecter les obligations prévues par le Code des investissements.');
  const [items, setItems] = useState<ActItem[]>([emptyItem()]);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfAnalysis, setPdfAnalysis] = useState('');
  const [pdfText, setPdfText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function updateItem(index: number, field: keyof ActItem, value: string) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  }

  function applyPdfSuggestions(text: string) {
    const normalizedText = text.replace(/\\s+/g, ' ');
    const referenceMatch = normalizedText.match(/(?:arr[êe]t[ée]|d[ée]cision)\\s*(?:n[°o]|no)?\\s*[:.-]?\\s*([A-Z0-9][A-Z0-9./-]{4,})/i);
    if (referenceMatch && !reference) setReference(referenceMatch[1]);
    const dates = Array.from(normalizedText.matchAll(/\\b(\\d{1,2})[\\/-](\\d{1,2})[\\/-](\\d{4})\\b/g)).map((match) => `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`);
    if (dates[0] && !approvalDate) setApprovalDate(dates[0]);
    if (dates[0] && !startDate) setStartDate(dates[0]);
    if (dates[1] && !endDate) setEndDate(dates[1]);
  }

  async function handlePdfChange(file: File | undefined) {
    setPdfFile(file ?? null);
    setPdfAnalysis('');
    setPdfText('');
    if (!file) return;
    if (file.type !== 'application/pdf' || file.size > 10 * 1024 * 1024) {
      setPdfAnalysis('Le fichier doit être un PDF de 10 Mo maximum.');
      return;
    }
    setPdfAnalysis('Analyse du document…');
    try {
      const result = await extractPdfText(file, setPdfAnalysis);
      setPdfText(result.text);
      setPdfAnalysis(result.text.length >= 40 ? result.usedOcr ? 'Texte reconnu par OCR : vérifiez les champs avant l’enregistrement.' : 'Texte détecté : vérifiez les champs avant l’enregistrement.' : 'Aucun texte lisible détecté : complétez les champs manuellement.');
    } catch {
      setPdfAnalysis('Le PDF sera conservé comme pièce jointe, mais son contenu ne peut pas être lu automatiquement.');
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    if (pdfFile && (pdfFile.type !== 'application/pdf' || pdfFile.size > 10 * 1024 * 1024)) {
      setError('Le document doit être un PDF de 10 Mo maximum.');
      setSaving(false);
      return;
    }
    const selectedOperator = operators.find((operator) => operator.id === operatorId);
    const authorizedValue = items.reduce((sum, item) => sum + (Number(item.cif_value) || 0), 0);
    const { data, error: actError } = await supabase.from('sirex_acts').insert({
      operator_id: operatorId,
      reference,
      approval_number: approvalNumber || null,
      approval_date: approvalDate || null,
      act_type: actType,
      province,
      start_date: startDate,
      end_date: endDate,
      project_name: projectName,
      project_description: projectDescription || null,
      project_location: projectLocation || null,
      investment_amount: Number(investmentAmount) || null,
      jobs_created: Number(jobsCreated) || null,
      authorized_value: authorizedValue,
      consumed_value: 0,
      customs_benefits: customsBenefits || null,
      tax_benefits: taxBenefits || null,
      investor_obligations: obligations || null,
    }).select('id, reference, act_type, province, start_date, end_date, status, authorized_value, consumed_value, currency, operator_id, operator:sirex_operators(company_name, id)').maybeSingle();

    if (actError || !data) {
      setError(actError?.message ?? 'Impossible d’enregistrer ce dossier.');
      setSaving(false);
      return;
    }

    const validItems = items.filter((item) => item.description.trim());
    if (validItems.length) {
      const { error: itemsError } = await supabase.from('sirex_act_items').insert(validItems.map((item) => ({
        act_id: data.id,
        quantity: Number(item.quantity) || 0,
        unit: item.unit,
        description: item.description.trim(),
        cif_value: Number(item.cif_value) || 0,
      })));
      if (itemsError) {
        setError('Le dossier est créé, mais la liste des biens n’a pas pu être enregistrée.');
        setSaving(false);
        return;
      }
    }

    if (pdfFile) {
      const safeName = pdfFile.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'document';
      const storagePath = `acts/${data.id}/${Date.now()}-${safeName}.pdf`;
      const { error: uploadError } = await supabase.storage.from('sirex-documents').upload(storagePath, pdfFile, { contentType: 'application/pdf', upsert: false });
      if (uploadError) {
        setError('Le dossier est créé, mais le PDF n’a pas pu être importé.');
        setSaving(false);
        return;
      }
      const { error: documentError } = await supabase.from('sirex_act_documents').insert({ act_id: data.id, file_name: pdfFile.name, storage_path: storagePath, mime_type: 'application/pdf', file_size: pdfFile.size });
      if (documentError) {
        setError('Le dossier est créé, mais le document n’a pas pu être associé.');
        setSaving(false);
        return;
      }
    }

    const raw = data as unknown as Record<string, unknown>;
    const operatorRelation = raw.operator as { company_name: string; id: string }[] | null;
    onCreated({ ...raw, operator: operatorRelation?.[0] ?? { company_name: selectedOperator?.company_name ?? '', id: operatorId } } as ActWithOperator);
    onClose();
    setSaving(false);
  }

  return <div className="modal-backdrop" onClick={onClose}><div className="modal-card dossier-modal" onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">Dossier d’exonération</p><h2>Nouvel arrêté d’agrément</h2><span className="modal-intro">Reprenez les informations du projet, des avantages et des biens autorisés.</span></div><button type="button" className="icon-button" onClick={onClose}><X size={19} /></button></div><form className="modal-form dossier-form" onSubmit={save}><div className="form-section"><div className="form-section-title"><span>01</span><div><strong>Identification de l’agrément</strong><small>Référence administrative et bénéficiaire</small></div></div><label>Opérateur bénéficiaire<select value={operatorId} onChange={(event) => setOperatorId(event.target.value)} required><option value="">Sélectionner…</option>{operators.map((operator) => <option key={operator.id} value={operator.id}>{operator.company_name}</option>)}</select></label><label className="file-field">Document PDF de l’agrément<span className="file-input-wrap"><input type="file" accept="application/pdf,.pdf" onChange={(event) => { void handlePdfChange(event.target.files?.[0]); }} /><span>{pdfFile ? pdfFile.name : 'Choisir le PDF du projet'}</span></span><small>PDF uniquement, 10 Mo maximum</small>{pdfAnalysis && <em className="file-analysis">{pdfAnalysis}</em>}{pdfText.length >= 40 && <button type="button" className="apply-suggestions" onClick={() => applyPdfSuggestions(pdfText)}>Appliquer les suggestions reconnues</button>}</label><div className="form-grid"><label>Référence de l’arrêté<input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Ex. 01/CAB/MIN/FIN/2020" required /></label><label>Numéro d’agrément<input value={approvalNumber} onChange={(event) => setApprovalNumber(event.target.value)} placeholder="Ex. ANAPI/…" /></label></div><div className="form-grid"><label>Type de régime<select value={actType} onChange={(event) => setActType(event.target.value)}><option value="exoneration">Exonération</option><option value="franchise">Franchise douanière</option><option value="admission_temporaire">Admission temporaire</option><option value="drawback">Drawback</option><option value="regime_preferentiel">Régime préférentiel</option></select></label><label>Date de signature<input type="date" value={approvalDate} onChange={(event) => setApprovalDate(event.target.value)} /></label></div></div><div className="form-section"><div className="form-section-title"><span>02</span><div><strong>Projet d’investissement</strong><small>Activité, implantation et retombées prévues</small></div></div><label>Nom du projet<input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Ex. Extension de l’hôtel CHIC Kinshasa" required /></label><label>Description du projet<textarea value={projectDescription} onChange={(event) => setProjectDescription(event.target.value)} placeholder="Décrivez l’activité, les équipements et l’objectif du projet." rows={3} /></label><div className="form-grid"><label>Localisation du projet<input value={projectLocation} onChange={(event) => setProjectLocation(event.target.value)} placeholder="Ville, commune, site" /></label><label>Province douanière<select value={province} onChange={(event) => setProvince(event.target.value)}><option>Kinshasa</option><option>Haut-Katanga</option><option>Kongo-Central</option><option>Nord-Kivu</option><option>Lualaba</option></select></label></div><div className="form-grid"><label>Investissement prévu (USD)<input type="number" min="0" value={investmentAmount} onChange={(event) => setInvestmentAmount(event.target.value)} placeholder="Montant total" /></label><label>Emplois créés<input type="number" min="0" value={jobsCreated} onChange={(event) => setJobsCreated(event.target.value)} placeholder="Nombre d’emplois" /></label></div></div><div className="form-section"><div className="form-section-title"><span>03</span><div><strong>Durée et avantages</strong><small>Paramètres repris dans les articles de l’arrêté</small></div></div><div className="form-grid"><label>Date de début<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required /></label><label>Date d’échéance<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} required /></label></div><label>Avantages douaniers<textarea value={customsBenefits} onChange={(event) => setCustomsBenefits(event.target.value)} rows={3} /></label><label>Avantages fiscaux<textarea value={taxBenefits} onChange={(event) => setTaxBenefits(event.target.value)} placeholder="Exonération d’impôt, taxe sur la valeur ajoutée, durée et conditions…" rows={3} /></label><label>Obligations de l’investisseur<textarea value={obligations} onChange={(event) => setObligations(event.target.value)} rows={3} /></label></div><div className="form-section"><div className="form-section-title"><span>04</span><div><strong>Biens à importer</strong><small>Chaque ligne correspond à une ligne de la liste annexée au PDF</small></div><button type="button" className="add-line-button" onClick={() => setItems((current) => [...current, emptyItem()])}><Plus size={14} /> Ajouter</button></div><div className="items-header"><span>Qté</span><span>Unité</span><span>Désignation</span><span>Valeur CIF (USD)</span><span /></div>{items.map((item, index) => <div className="item-row" key={index}><input type="number" min="0" value={item.quantity} onChange={(event) => updateItem(index, 'quantity', event.target.value)} placeholder="0" required={index === 0} /><select value={item.unit} onChange={(event) => updateItem(index, 'unit', event.target.value)}><option>PCS</option><option>UN</option><option>KG</option><option>TONNE</option><option>LOT</option></select><input value={item.description} onChange={(event) => updateItem(index, 'description', event.target.value)} placeholder="Désignation du bien" required={index === 0} /><input type="number" min="0" value={item.cif_value} onChange={(event) => updateItem(index, 'cif_value', event.target.value)} placeholder="0" required={index === 0} /><button type="button" className="remove-line-button" aria-label="Supprimer la ligne" disabled={items.length === 1} onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={14} /></button></div>)}</div>{error && <div className="form-error"><AlertCircle size={16} />{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Annuler</button><button className="primary-button" disabled={saving}>{saving ? 'Enregistrement…' : 'Créer le dossier'}<ArrowUpRight size={17} /></button></div></form></div></div>;
}
