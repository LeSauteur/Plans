import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../2026.html', import.meta.url), 'utf8');
const script = html.match(/<script>(.*?)<\/script>/s)?.[1];
assert.ok(script, 'Sales report script must exist');
const elements = new Map();
function element(key) {
  if (!elements.has(key)) elements.set(key, {
    innerHTML: '', children: [],
    appendChild(child) { this.children.push(child); }
  });
  return elements.get(key);
}
const context = vm.createContext({
  Intl,
  document: {
    getElementById: element, querySelector: element,
    createElement: () => ({ innerHTML: '' }),
    addEventListener: (_event, callback) => callback()
  }
});
vm.runInContext(script, context, { timeout: 5000 });
const rows = JSON.parse(vm.runInContext('JSON.stringify(rows)', context));
const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
assert.equal(rows.length, 26);
assert.equal(new Set(rows.map(row => row.id)).size, rows.length);
for (const row of rows) {
  for (const month of months) {
    assert.ok(Number.isFinite(row[month]) && row[month] >= 0, `${row.name}: invalid ${month} turnover`);
  }
  const actual = row.jul + row.aug + row.sep;
  assert.equal(row.q3Total, actual, `${row.name}: Q3 total`);
  assert.ok(Math.abs(row.yearTotal - months.reduce((sum, month) => sum + row[month], 0)) < 0.01);
  if (row.q3Plan > 0) {
    assert.ok(Math.abs(row.q3Percent - actual / row.q3Plan * 100) < 1e-10);
  } else {
    assert.equal(row.q3Percent, null, `${row.name}: missing plan must remain unavailable`);
  }
}
const sum = field => rows.reduce((total, row) => total + row[field], 0);
// Independent controls reconciled to the July, August and September royalty files.
assert.deepEqual(['jul','aug','sep','q3Total'].map(sum), [39051237,42876635,44077104,126004976]);
const planned = rows.filter(row => row.q3Plan > 0);
assert.equal(planned.reduce((total, row) => total + row.q3Plan, 0), 84735183);
assert.equal(planned.reduce((total, row) => total + row.q3Total, 0), 121085124);
assert.equal(planned.filter(row => row.q3Total >= row.q3Plan).length, 15);
assert.equal(planned.filter(row => row.q3Total < row.q3Plan).length, 9);
assert.equal(rows.length - planned.length, 2);
assert.equal(rows.find(row => row.name === 'Немченко').jul, 671620);
assert.equal(rows.find(row => row.name === 'Немченко').q3Plan, 1100000);
assert.equal(element('#salesTable tbody').children.length, rows.length);
assert.ok(element('report').innerHTML.includes('142,90%'));
assert.ok(element('report').innerHTML.includes('Итоги III квартала: июль — сентябрь'));
assert.ok(!element('report').innerHTML.includes('после июля'));

function footerQ3() {
  return [...element('#salesTable tfoot').innerHTML.matchAll(/<td class="q3"[^>]*>(.*?)<\/td>/g)].map(match => match[1]);
}
assert.equal(footerQ3().length, 6);
assert.equal(footerQ3()[5], '—', 'Overall percentage requires all plans');

// Exercise incomplete and complete populations without modifying the saved report.
vm.runInContext(`
  const sample = {...owners[0], jul:100, aug:0, sep:0};
  rows = [enrich({...sample, q3Plan:100}), enrich({...sample, id:99, q3Plan:null})];
  renderReport(); renderTable();
`, context);
assert.equal(footerQ3()[5], '—');
assert.ok(element('report').innerHTML.includes('100,00%'), 'Confirmed performance excludes a missing-plan row');
vm.runInContext('rows = rows.map(row => enrich({...row, q3Plan:100})); renderReport(); renderTable();', context);
assert.equal(footerQ3()[5], '100,00%');
assert.ok(!element('report').innerHTML.includes('не рассчитан: есть неустановленные планы'));
console.log('PASS: monthly source controls, Q3 and annual sums, individual percentages, report output and missing-plan boundaries');
