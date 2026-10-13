import { FormEvent, useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { AlertCircle, ArrowUpRight, Plus, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { extractItemRows, extractSuggestions, provinces } from '@/lib/domain';

type Operator = { id: string; company_name: string; province?: string };
type ActWithOperator = { id: string; reference: string; act_type: string; province: string; start_date: string; end_date: string; status: string; authorized_value: number; consumed_value: number; currency: string; operator_id: string; operator: { company_name: string; id: string } | null };
type ActItem = { quantity: string; unit: string; description: string; cif_value: string; hs_code?: string };

type Props = { operators: Operator[]; onClose: () => void; onCreated: (act: ActWithOperator) => void };

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

async function extractPdfText(file: File, onProgress: (message: string) => void): Promise<{ text: string; usedOcr: boolean }> {
  const pdf = await getDocument({ data:await file.arrayBuffer() }).promise;
  const pages: string[] = [];
  let worker: Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>> | undefined;
  let usedOcr = false;
  try {
    for (let n=1;n<=pdf.numPages;n++) {
      onProgress(`Analyse : page ${n}/${pdf.numPages}…`);
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      const rows = new Map<number, {x:number; text:string}[]>();
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue;
        const y = Math.round(item.transform[5]/3)*3;
        rows.set(y,[...(rows.get(y)||[]),{x:item.transform[4],text:item.str}]);
      }
      let text = [...rows.entries()].sort(([a],[b])=>b-a).map(([,cells])=>cells.sort((a,b)=>a.x-b.x).map(c=>c.text).join('\t')).join('\n');
      if (text.trim().length < 80) {
        if (!worker) {const {createWorker} = await import('tesseract.js'); worker = await createWorker('fra');}
        onProgress(`Reconnaissance OCR : page ${n}/${pdf.numPages}…`);
        const viewport = page.getViewport({scale:1.5});
        const canvas=document.createElement('canvas'); canvas.width=Math.ceil(viewport.width); canvas.height=Math.ceil(viewport.height);
        const context=canvas.getContext('2d'); if (!context) throw new Error('Rendu PDF indisponible');
        await page.render({canvasContext:context,viewport}).promise;
        text=(await worker.recognize(canvas)).data.text; usedOcr=true;
        canvas.width=canvas.height=0;
      }
      pages.push(text); page.cleanup();
    }
    return {text:pages.join('\n').trim(),usedOcr};
  } finally {await worker?.terminate(); await pdf.destroy();}
}

const emptyItem = (): ActItem => ({ quantity: '', unit: 'PCS', description: '', cif_value: '', hs_code: '' });

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
  const [createdAct, setCreatedAct] = useState<ActWithOperator | null>(null);
  const [saving, setSaving] = useState(false);
  const analysisId = useRef(0);
  useEffect(()=>()=>{analysisId.current += 1;},[]);
  const [error, setError] = useState('');

  function updateItem(index: number, field: keyof ActItem, value: string) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  }

  function applyPdfSuggestions(text: string) {
    const suggestions = extractSuggestions(text);
    if (suggestions.reference && !reference) setReference(suggestions.reference);
    if (suggestions.dates[0] && !approvalDate) setApprovalDate(suggestions.dates[0]);
    const rows = extractItemRows(text);
    if (rows.length) setItems(rows);
    setPdfAnalysis(rows.length ? `${rows.length} lignes proposées : comparez-les avec le PDF, complétez les lignes manquantes et vérifiez les dates de validité.` : 'Aucune ligne de biens reconnue avec certitude. Reprenez la liste manuellement et vérifiez les champs proposés.');
  }

  async function handlePdfChange(file: File | undefined) {
    const currentAnalysis = ++analysisId.current;
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
      const result = await extractPdfText(file, message=>{if(currentAnalysis===analysisId.current)setPdfAnalysis(message);});
      if(currentAnalysis!==analysisId.current)return;
      setPdfText(result.text);
      setPdfAnalysis(result.text.length >= 40 ? result.usedOcr ? 'Texte reconnu par OCR : vérifiez les champs avant l’enregistrement.' : 'Texte détecté : vérifiez les champs avant l’enregistrement.' : 'Aucun texte lisible détecté : complétez les champs manuellement.');
    } catch {
      if(currentAnalysis!==analysisId.current)return;
      setPdfAnalysis('Le PDF sera conservé comme pièce jointe, mais son contenu ne peut pas être lu automatiquement.');
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError('');
    try {
      if (pdfFile && (pdfFile.type !== 'application/pdf' || pdfFile.size > 10*1024*1024)) throw new Error('Le PDF doit faire 10 Mo maximum.');
      let act = createdAct;
      if (!act) {
        const validItems=items.filter(i=>i.description.trim());
        if (startDate > endDate) throw new Error('La date d’échéance doit suivre la date de début.');
        if (validItems.length!==items.length || !validItems.length || validItems.some(i=>i.quantity==='' || i.cif_value==='' || Number(i.quantity)<=0 || !Number.isFinite(Number(i.quantity)) || Number(i.cif_value)<0 || !Number.isFinite(Number(i.cif_value)))) throw new Error('Complétez chaque ligne de biens avec une quantité positive et une valeur CIF valide.');
        const {data,error}=await supabase.rpc('sirex_create_dossier', {p_act:{operator_id:operatorId,reference,approval_number:approvalNumber||null,approval_date:approvalDate||null,act_type:actType,province,start_date:startDate,end_date:endDate,project_name:projectName,project_description:projectDescription||null,project_location:projectLocation||null,investment_amount:investmentAmount===''?null:Number(investmentAmount),jobs_created:jobsCreated===''?null:Number(jobsCreated),customs_benefits:customsBenefits||null,tax_benefits:taxBenefits||null,investor_obligations:obligations||null,currency:'USD'},p_items:validItems.map(i=>({quantity:Number(i.quantity),unit:i.unit,description:i.description.trim(),cif_value:Number(i.cif_value),currency:'USD',hs_code:i.hs_code || null}))});
        if (error) throw error;
        act=data as ActWithOperator; setCreatedAct(act);
      }
      if (pdfFile) {
        const path=`acts/${act.id}/${crypto.randomUUID()}.pdf`;
        const {error:uploadError}=await supabase.storage.from('sirex-documents').upload(path,pdfFile,{contentType:'application/pdf',upsert:false});
        if (uploadError) throw new Error('Le dossier et ses biens sont enregistrés. Le PDF n’a pas pu être ajouté : réessayez avec le bouton ci-dessous.');
        const {error:documentError}=await supabase.from('sirex_act_documents').insert({act_id:act.id,file_name:pdfFile.name,storage_path:path,mime_type:'application/pdf',file_size:pdfFile.size});
        if (documentError) {
          const {error:cleanupError}=await supabase.storage.from('sirex-documents').remove([path]);
          throw new Error(`Le dossier est enregistré, mais le PDF n’a pas pu être associé. Réessayez.${cleanupError ? ' Le fichier isolé doit être supprimé du stockage par un administrateur.' : ''}`);
        }
      }
      onCreated(act); onClose();
    } catch (error) {setError(error && typeof error==='object' && 'message' in error ? String(error.message) : 'Enregistrement impossible.');}
    finally {setSaving(false);}
  }

  return <div className="modal-backdrop" onClick={onClose}><div className="modal-card dossier-modal" onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">Dossier d’exonération</p><h2>Nouvel arrêté d’agrément</h2><span className="modal-intro">Reprenez les informations du projet, des avantages et des biens autorisés.</span></div><button type="button" className="icon-button" onClick={onClose}><X size={19} /></button></div><form className="modal-form dossier-form" onSubmit={save}><fieldset className="dossier-fields" disabled={saving || !!createdAct}><div className="form-section"><div className="form-section-title"><span>01</span><div><strong>Identification de l’agrément</strong><small>Référence administrative et bénéficiaire</small></div></div><label>Opérateur bénéficiaire<select value={operatorId} onChange={(event) => {setOperatorId(event.target.value); const op=operators.find(o=>o.id===event.target.value); if(op?.province)setProvince(op.province);}} required><option value="">Sélectionner…</option>{operators.map((operator) => <option key={operator.id} value={operator.id}>{operator.company_name}</option>)}</select></label><label className="file-field">Document PDF de l’agrément<span className="file-input-wrap"><input type="file" accept="application/pdf,.pdf" onChange={(event) => { void handlePdfChange(event.target.files?.[0]); }} /><span>{pdfFile ? pdfFile.name : 'Choisir le PDF du projet'}</span></span><small>PDF uniquement, 10 Mo maximum</small>{pdfAnalysis && <em className="file-analysis">{pdfAnalysis}</em>}{pdfText.length >= 40 && <button type="button" className="apply-suggestions" onClick={() => applyPdfSuggestions(pdfText)}>Appliquer les suggestions reconnues</button>}</label><div className="form-grid"><label>Référence de l’arrêté<input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Ex. 01/CAB/MIN/FIN/2020" required /></label><label>Numéro d’agrément<input value={approvalNumber} onChange={(event) => setApprovalNumber(event.target.value)} placeholder="Ex. ANAPI/…" /></label></div><div className="form-grid"><label>Type de régime<select value={actType} onChange={(event) => setActType(event.target.value)}><option value="exoneration">Exonération</option><option value="franchise">Franchise douanière</option><option value="admission_temporaire">Admission temporaire</option><option value="drawback">Drawback</option><option value="regime_preferentiel">Régime préférentiel</option></select></label><label>Date de signature<input type="date" value={approvalDate} onChange={(event) => setApprovalDate(event.target.value)} /></label></div></div><div className="form-section"><div className="form-section-title"><span>02</span><div><strong>Projet d’investissement</strong><small>Activité, implantation et retombées prévues</small></div></div><label>Nom du projet<input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Ex. Extension de l’hôtel CHIC Kinshasa" required /></label><label>Description du projet<textarea value={projectDescription} onChange={(event) => setProjectDescription(event.target.value)} placeholder="Décrivez l’activité, les équipements et l’objectif du projet." rows={3} /></label><div className="form-grid"><label>Localisation du projet<input value={projectLocation} onChange={(event) => setProjectLocation(event.target.value)} placeholder="Ville, commune, site" /></label><label>Province douanière<select value={province} onChange={(event) => setProvince(event.target.value)}>{provinces.map(p=><option key={p}>{p}</option>)}</select></label></div><div className="form-grid"><label>Investissement prévu (USD)<input type="number" min="0" step="0.01" value={investmentAmount} onChange={(event) => setInvestmentAmount(event.target.value)} placeholder="Montant total" /></label><label>Emplois créés<input type="number" min="0" value={jobsCreated} onChange={(event) => setJobsCreated(event.target.value)} placeholder="Nombre d’emplois" /></label></div></div><div className="form-section"><div className="form-section-title"><span>03</span><div><strong>Durée et avantages</strong><small>Paramètres repris dans les articles de l’arrêté</small></div></div><div className="form-grid"><label>Date de début<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required /></label><label>Date d’échéance<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} required /></label></div><label>Avantages douaniers<textarea value={customsBenefits} onChange={(event) => setCustomsBenefits(event.target.value)} rows={3} /></label><label>Avantages fiscaux<textarea value={taxBenefits} onChange={(event) => setTaxBenefits(event.target.value)} placeholder="Exonération d’impôt, taxe sur la valeur ajoutée, durée et conditions…" rows={3} /></label><label>Obligations de l’investisseur<textarea value={obligations} onChange={(event) => setObligations(event.target.value)} rows={3} /></label></div><div className="form-section"><div className="form-section-title"><span>04</span><div><strong>Biens à importer</strong><small>Chaque ligne correspond à une ligne de la liste annexée au PDF</small></div><button type="button" className="add-line-button" onClick={() => setItems((current) => [...current, emptyItem()])}><Plus size={14} /> Ajouter</button></div><div className="items-header"><span>Qté</span><span>Unité</span><span>Désignation</span><span>Code SH</span><span>Valeur CIF (USD)</span><span /></div>{items.map((item, index) => <div className="item-row" key={index}><input type="number" min="0.001" step="0.001" value={item.quantity} onChange={(event) => updateItem(index, 'quantity', event.target.value)} placeholder="0" required={index === 0} /><select value={item.unit} onChange={(event) => updateItem(index, 'unit', event.target.value)}><option>PCS</option><option>UN</option><option>KG</option><option>TONNE</option><option>LOT</option></select><input value={item.description} onChange={(event) => updateItem(index, 'description', event.target.value)} placeholder="Désignation du bien" required={index === 0} /><input value={item.hs_code || ''} onChange={(event) => updateItem(index, 'hs_code', event.target.value)} placeholder="Code SH" /><input type="number" min="0" step="0.01" value={item.cif_value} onChange={(event) => updateItem(index, 'cif_value', event.target.value)} placeholder="0" required={index === 0} /><button type="button" className="remove-line-button" aria-label="Supprimer la ligne" disabled={items.length === 1} onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={14} /></button></div>)}</div></fieldset>{error && <div className="form-error"><AlertCircle size={16} />{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Annuler</button><button className="primary-button" disabled={saving}>{saving ? 'Enregistrement…' : createdAct ? 'Réessayer le PDF' : 'Créer le dossier'}<ArrowUpRight size={17} /></button></div></form></div></div>;
}
