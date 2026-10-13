export const provinces = ['Kinshasa', 'Kongo-Central', 'Kwango', 'Kwilu', 'Mai-Ndombe', 'Équateur', 'Mongala', 'Nord-Ubangi', 'Sud-Ubangi', 'Tshuapa', 'Tshopo', 'Bas-Uele', 'Haut-Uele', 'Ituri', 'Nord-Kivu', 'Sud-Kivu', 'Maniema', 'Tanganyika', 'Haut-Lomami', 'Haut-Katanga', 'Lualaba', 'Lomami', 'Kasaï', 'Kasaï-Central', 'Kasaï-Oriental', 'Sankuru'];
export const roleLabels: Record<string, string> = { super_admin: 'Super-administrateur', admin: 'Administrateur', agent: 'Agent', lecteur: 'Consultation' };
export type Member = { user_id: string; full_name: string; matricule: string | null; role: string; province: string | null; active: boolean };
export function relationOne<T>(value: T | T[] | null | undefined): T | null { return Array.isArray(value) ? value[0] ?? null : value ?? null; }
export function money(value: number, currency: string) { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value); }
export function totalsByCurrency(rows: { currency?: string | null; [key: string]: unknown }[], field: string) {
  const totals: Record<string, number> = {};
  rows.forEach(row => { const currency = row.currency || 'USD'; totals[currency] = (totals[currency] || 0) + Number(row[field] || 0); });
  return Object.entries(totals).map(([currency, value]) => money(value, currency)).join(' · ') || '—';
}
export function loginIdentity(value: string) { const input = value.trim(); return input.includes('@') ? input : `${input}@sirex.dgda.local`; }
export function normalizeDescription(value: string) { return value.trim().toLocaleLowerCase('fr').replace(/\s+/g, ' '); }
export type ImportedItem = { quantity: string; unit: string; description: string; cif_value: string };
export function parseNumber(value: string): number | null {
  let text = value.trim().replace(/[\s\u00a0\u202f]/g, '');
  if (!text) return null;
  if (text.includes(',') && text.includes('.')) {
    text = text.lastIndexOf(',') > text.lastIndexOf('.') ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  } else if (text.includes(',')) text = text.replace(',', '.');
  return /^\d+(?:\.\d+)?$/.test(text) ? Number(text) : null;
}
export function extractSuggestions(text: string) {
  const reference = text.replace(/\s+/g, ' ').match(/(?:arr[êe]t[ée]|d[ée]cision)\s*(?:n[°o]|no)?\s*[:.-]?\s*([A-Z0-9][A-Z0-9./-]{4,})/i)?.[1];
  const dates = Array.from(text.matchAll(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/g)).flatMap(m => {
    const value = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? [value] : [];
  });
  return { reference, dates };
}
// Strict row formats only. Ambiguous/OCR-damaged rows remain for human review.
export function extractItemRows(text: string): ImportedItem[] {
  return text.split(/\r?\n/).flatMap(line => {
    const cells = line.trim().split(/\s*[;\t|]\s*|\s{2,}/).filter(Boolean);
    if (cells.length < 4) return [];
    const quantity = parseNumber(cells[0]);
    const unit = cells[1].toUpperCase();
    const cif = parseNumber(cells[cells.length - 1].replace(/\s*(USD|\$)$/i, ''));
    const description = cells.slice(2, -1).join(' ').trim();
    return quantity !== null && quantity > 0 && ['PCS', 'UN', 'KG', 'TONNE', 'LOT'].includes(unit) && cif !== null && description
      ? [{ quantity: String(quantity), unit, description, cif_value: String(cif) }] : [];
  });
}
