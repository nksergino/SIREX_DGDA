import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDomain } from '../scripts/checks.mjs';
const d = await loadDomain();
test('PDF reference and valid dates extracted; invalid dates rejected', () => {
  assert.deepEqual(d.extractSuggestions('Arrêté n° 01/CAB/MIN/FIN/2020 du 13/10/2026 au 13/10/2027'), { reference: '01/CAB/MIN/FIN/2020', dates: ['2026-10-13', '2027-10-13'] });
  assert.deepEqual(d.extractSuggestions('31/02/2026').dates, []);
});
test('conservative OCR table parsing supports French amounts and rejects ambiguity', () => {
  assert.deepEqual(d.extractItemRows('2;PCS;Pompe à eau;1 250,50 USD'), [{ quantity:'2', unit:'PCS', description:'Pompe à eau', cif_value:'1250.5' }]);
  assert.deepEqual(d.extractItemRows('deux;PCS;Pompe;1 250\n2;XYZ;Pompe;100'), []);
});
test('both login identities and Supabase to-one relation forms', () => {
  assert.equal(d.loginIdentity(' dgda@example.cd '), 'dgda@example.cd');
  assert.equal(d.loginIdentity('012345'), '012345@sirex.dgda.local');
  assert.deepEqual(d.relationOne({company_name:'A'}), {company_name:'A'});
  assert.equal(d.relationOne([]), null);
});
test('currency aggregation never adds USD to CDF', () => {
  const result = d.totalsByCurrency([{currency:'USD', amount:100}, {currency:'CDF', amount:250000}], 'amount');
  assert.match(result, /100/); assert.match(result, /250/); assert.match(result, /CDF|FC/);
});
