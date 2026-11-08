const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/parser.js');
const S = require('./fixtures/samples.js');
const v = (r, k) => (r.fields[k] ? r.fields[k].value : undefined);

test('Piper (RedOaks format)', () => {
  const r = P.parseTeaser(S.piper);
  assert.equal(v(r, 'seller'), 'Piper Royalties, LLC');
  assert.equal(v(r, 'basins'), 'Delaware (51%), Midland (49%)');
  assert.equal(v(r, 'nra'), 3296);
  assert.equal(v(r, 'ntmCF'), 8.1e6);
  assert.equal(v(r, 'rigs'), 18);
  assert.equal(v(r, 'ducsPermits'), 243);
  assert.equal(v(r, 'locations'), 5325);
  assert.equal(v(r, 'netLocations'), 4.2);
  assert.deepEqual(r.fields.operators.list, ['ExxonMobil', 'Diamondback', 'Occidental']);
  assert.ok(r.fields.states.list.includes('Texas'));
});

test('Lincoln (Detring format)', () => {
  const r = P.parseTeaser(S.lincoln);
  assert.equal(v(r, 'seller'), 'Lincoln Energy Partners, LLC');
  assert.equal(v(r, 'counties'), 'Converse');
  assert.equal(v(r, 'states'), 'Wyoming');
  assert.equal(v(r, 'basins'), 'Powder River');
  assert.equal(v(r, 'nra'), 2444);
  assert.equal(v(r, 'ntmCF'), 3.5e6);
  assert.equal(v(r, 'locations'), 650);
  assert.deepEqual(r.fields.operators.list, ['Continental', 'Devon', 'Occidental']);
});

test('MSR summary format', () => {
  const r = P.parseTeaser(S.msr);
  assert.equal(v(r, 'ntmCF'), 4.0e6);
  assert.equal(v(r, 'pdpShareNTM'), 0.16);
  assert.equal(v(r, 'pvPDP'), 3e6);
  assert.equal(v(r, 'pvPDNP'), 9e6);
  assert.equal(v(r, 'pvPUD'), 13e6);
  assert.equal(v(r, 'pvTotal'), 25e6);
  assert.equal(v(r, 'ducs'), 14);
  assert.equal(v(r, 'bidDate'), 'Dec 2, noon CT');
  assert.equal(r.fields.pvUpside, undefined);
  assert.ok(r.missing.includes('seller'));
});

test('unit headers and value formats', () => {
  assert.equal(P.parseMoney('$8.1MM').value, 8.1e6);
  assert.equal(P.parseMoney('$450K').value, 450e3);
  assert.equal(P.parseMoney('3,012', 1e3).value, 3.012e6);
  assert.equal(P.parseMoney('2.4', 1e6).value, 2.4e6);
  assert.equal(P.parseMoney('$1.2 million').value, 1.2e6);
  assert.equal(v(P.parseTeaser('PV10 ($M): PDP 3,012 PDNP 1,200 Total 4,212'), 'pvPDP'), 3.012e6);
  assert.equal(v(P.parseTeaser('PV10 ($MM): PDP 3.0, PUD 7.5'), 'pvPUD'), 7.5e6);
  assert.equal(v(P.parseTeaser('LTM CF ($MM): 2.4'), 'ltmCF'), 2.4e6);
  assert.equal(v(P.parseTeaser('Production: 6.0 MMcfe/d'), 'prodBoed'), 1000);
  const r = P.parseTeaser('Net production of 1,250 Boe/d (62% oil), 28% annual decline');
  assert.equal(v(r, 'prodBoed'), 1250); assert.equal(v(r, 'oilPct'), 0.62); assert.equal(v(r, 'decline'), 0.28);
});

test('every extracted field carries a source snippet and confidence', () => {
  for (const t of Object.values(S)) {
    const r = P.parseTeaser(t);
    for (const [k, f] of Object.entries(r.fields)) {
      assert.ok(f.src, `${k} has src`);
      assert.ok(['high', 'medium', 'low'].includes(f.conf), `${k} conf`);
    }
  }
});
