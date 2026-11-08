const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/model.js');
const A = M.DEFAULT_ASSUMPTIONS;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b}, got ${a}`);

test('Arps: first-year effective decline is honored (hyperbolic and exponential)', () => {
  for (const b of [0, 0.5, 1.0, 1.4]) {
    const a = M.arps(0.30, b, 0); // no terminal switch
    near(a.rate(1), 0.70, 1e-9, `b=${b}`);
  }
});

test('Arps: cumulative equals integral of rate', () => {
  const a = M.arps(0.40, 1.2, 0.06);
  let s = 0; const n = 200000, T = 10;
  for (let i = 0; i < n; i++) s += a.rate((i + 0.5) * T / n) * T / n;
  near(a.cum(T), s, 1e-6, 'cum(10)');
});

test('Arps: switches to exponential at terminal decline', () => {
  const a = M.arps(0.35, 1.0, 0.06);
  const Dlim = -Math.log(0.94);
  assert.ok(isFinite(a.tSwitch) && a.tSwitch > 0);
  near(a.decline(a.tSwitch - 1e-9), Dlim, 1e-6, 'decline at switch');
  near(a.decline(a.tSwitch + 5), Dlim, 1e-12, 'decline after switch');
  // continuity of rate at switch
  near(a.rate(a.tSwitch - 1e-9), a.rate(a.tSwitch + 1e-9), 1e-8, 'rate continuity');
  // after switch, year-over-year rate ratio equals 1 - 6%
  near(a.rate(a.tSwitch + 2) / a.rate(a.tSwitch + 1), 0.94, 1e-9, 'terminal effective');
});

test('monthlyVolumes: first 12 months sum to qi*365.25*cum(1)', () => {
  const v = M.monthlyVolumes(100, 0.25, 1, 0.06, 0, 360);
  const a = M.arps(0.25, 1, 0.06);
  near(M.sum(v, 12), 100 * 365.25 * a.cum(1), 1e-6);
  const delayed = M.monthlyVolumes(100, 0.25, 1, 0.06, 3, 360);
  assert.equal(delayed[2], 0); assert.ok(delayed[3] > 0);
  near(delayed[3], v[0], 1e-9, 'delayed stream starts at qi');
});

test('NPV and IRR', () => {
  near(M.npv(0.1, [-100, 110]), 0, 1e-9);
  near(M.npv(0.05, [0, 105, 110.25]), 200, 1e-9);
  near(M.irr([-100, 110]), 0.10, 1e-9);
  near(M.irr([-1000, 300, 400, 500]), 0.0889633947, 1e-8);
  assert.equal(M.irr([100, 100]), null);
});

test('impliedRate is consistent with pvMonthly (curve intersection)', () => {
  const cf = new Array(120).fill(10000);
  const r = M.impliedRate(cf, 700000);
  near(M.pvMonthly(r, cf), 700000, 1e-3);
  assert.equal(M.impliedRate(cf, 0), null);
});

test('payback months', () => {
  near(M.paybackMonths([50, 50, 50], 100), 2, 1e-12);
  near(M.paybackMonths([40, 40, 40], 100), 2.5, 1e-12);
  assert.equal(M.paybackMonths([10, 10], 100), null);
});

test('borrowing base takes the MIN of reserves and leverage tests', () => {
  const r1 = M.borrowingBase({ pdpPV9Deck: 10e6, pdnpPV9Deck: 4e6, ntmDeck: 1.1e6, pud: 5e6 }, A);
  near(r1.reserves, 10e6 * 0.6 + 4e6 * 0.3 + 0, 1e-6);
  near(r1.leverage, (1.1e6 - A.gaAnnual) * 3, 1e-6);
  assert.equal(r1.base, Math.min(r1.reserves, r1.leverage));
  assert.equal(r1.binding, 'Leverage');
  const r2 = M.borrowingBase({ pdpPV9Deck: 2e6, pdnpPV9Deck: 0, ntmDeck: 3e6, pud: 0 }, A);
  assert.equal(r2.binding, 'Reserves');
  near(r2.base, 1.2e6, 1e-6);
});

test('margin grid by utilization, draw capped at price', () => {
  assert.equal(M.marginFor(0.2, A.grid), 0.025);
  assert.equal(M.marginFor(0.5, A.grid), 0.0275);
  assert.equal(M.marginFor(0.7, A.grid), 0.03);
  assert.equal(M.marginFor(0.9, A.grid), 0.0325);
  assert.equal(M.marginFor(0.95, A.grid), 0.035);
  const st = M.rblStack({ base: 10e6 }, 5e6, 1e6, A);
  assert.equal(st.draw, 5e6); // capped at price
  near(st.util, 0.5, 1e-12);
  near(st.interest, 5e6 * (A.sofr + 0.0275) + 5e6 * A.unusedFee, 1e-6);
  assert.equal(st.equity, 0);
});

test('calibration hits stated NTM CF (back-solve, MSR)', () => {
  const deal = { ntmCF: 4.0e6, pdpShareNTM: 0.16, pvPDP: 3e6, pvPDNP: 9e6, pvPUD: 13e6, pvTotal: 25e6 };
  const r = M.analyze(deal, A);
  assert.equal(r.cal.R.mode, 'ntm');
  near(r.metrics.ntmPDP, 0.64e6, 1, 'PDP NTM = 16% of NTM');
  near(r.metrics.ntmPDP + M.sum(r.streams.pdnp.unriskedNet, 12), 4.0e6, 2, 'unrisked NTM total');
  near(r.metrics.ntmPDNP, 3.36e6 * 0.8, 2, 'risked PDNP NTM');
  assert.equal(r.verdict.verdict, 'Development story');
});

test('calibration hits NTM CF for a non-op WI with fixed costs', () => {
  const deal = { ntmCF: 2e6, pdpShareNTM: 1 };
  const r = M.analyze(deal, Object.assign({}, A, { interestType: 'wi' }));
  near(r.metrics.ntmPDP, 2e6, 2);
});

test('production mode backs PDNP out of NTM CF', () => {
  const deal = { prodBoed: 500, oilPct: 0.6, ntmCF: 9e6 };
  const r = M.analyze(deal, A);
  assert.equal(r.cal.R.mode, 'production');
  assert.equal(r.cal.qPDP, 500);
  near(r.metrics.ntmPDP + M.sum(r.streams.pdnp.unriskedNet, 12), 9e6, 2);
});

test('economic limit truncates after 3 negative months', () => {
  const prices = M.priceDeck(A, 2027, 0, 12);
  const boe = new Array(12).fill(1);
  const res = M.streamCashFlow(boe, { oil: 1, gas: 0, ngl: 0 }, prices, Object.assign({}, A, { interestType: 'wi', loePerBoe: 0 }), 1e6);
  assert.equal(res.limit, 0);
  assert.ok(res.net.every((v) => v === 0));
});

test('bid build uses multipliers', () => {
  const deal = { ntmCF: 4e6, pdpShareNTM: 0.16, pvPDP: 3e6, pvPDNP: 9e6, pvPUD: 13e6, pdpSource: 'teaser' };
  const r = M.analyze(deal, A);
  near(r.metrics.maxBid, 3e6 * 0.95 + 9e6 * 0.6 + 13e6 * 0.15, 1);
});

test('verdict: ask above max bid caps at Borderline', () => {
  const sc = { score: 0.9, rows: [] };
  assert.equal(M.verdictOf({ score: sc, pdpSharePV: 0.8, ask: 12e6, maxBid: 10e6, rblCov: 0.5 }, A).verdict, 'Borderline');
  assert.equal(M.verdictOf({ score: sc, pdpSharePV: 0.8, ask: 9e6, maxBid: 10e6, rblCov: 0.5 }, A).verdict, 'Financeable');
  assert.equal(M.verdictOf({ score: { score: 0.4, rows: [] }, pdpSharePV: 0.8, ask: 9e6, maxBid: 10e6 }, A).verdict, 'Pass');
  assert.equal(M.verdictOf({ score: sc, pdpSharePV: 0.3, ask: 0, maxBid: 10e6 }, A).verdict, 'Development story');
});

test('scorecard weights total 100 and statuses follow thresholds', () => {
  assert.equal(A.tests.reduce((s, t) => s + t.w, 0), 100);
  const t = A.tests.find((x) => x.key === 'decline');
  assert.equal(M.scoreTest(t, 0.2), 'pass');
  assert.equal(M.scoreTest(t, 0.3), 'warn');
  assert.equal(M.scoreTest(t, 0.4), 'fail');
});

test('fitDecline reproduces teaser PDP PV10', () => {
  const deal = { ntmCF: 4e6, pdpShareNTM: 0.16, pvPDP: 3e6 };
  const De = M.fitDecline(deal, A);
  const r = M.analyze(Object.assign({}, deal, { decline: De }), A);
  near(r.valuation.pdpPV10m, 3e6, 3e3);
});

test('formatting', () => {
  assert.equal(M.fmtMoney(8.1e6), '$8.1MM');
  assert.equal(M.fmtMoney(450e3), '$450K');
  assert.equal(M.fmtPct(0.114), '11.4%');
  assert.equal(M.fmtYrs(9.2), '9.2 yrs');
});

test('strip default covers model start and escalates after last year', () => {
  const p = M.priceDeck(Object.assign({}, A, { escalator: 0.02 }), 2031, 0, 24);
  near(p.oil[12], A.strip[A.strip.length - 1].oil * 1.02, 1e-9);
});

// ---------- bid ladder / levered returns ----------
const MSR = { ntmCF: 4.0e6, pdpShareNTM: 0.16, pvPDP: 3e6, pvPDNP: 9e6, pvPUD: 13e6 };

test('bid ladder: price is PV at each rate and unlevered return equals that rate', () => {
  const r = M.analyze(MSR, A);
  const L = M.bidLadder(r, MSR, A, 'total');
  assert.deepEqual(L.map((x) => x.rate), A.ladderRates);
  for (const x of L) {
    near(x.price, M.pvMonthly(x.rate, r.streams.total), 1e-6);
    if (x.rate > 0) near(x.unleveredIRR, x.rate, 1e-6, `PV${x.rate * 100}`);
    near(x.lev.equity + x.lev.draw, x.price, 1e-6);
    assert.ok(x.lev.draw <= x.price + 1e-9);
  }
  const pdp = M.bidLadder(r, MSR, A, 'pdp');
  near(pdp[3].price, M.pvMonthly(0.10, r.streams.pdp.net), 1e-6);
});

test('levered IRR equals unlevered with no debt and no G&A', () => {
  const r = M.analyze(MSR, A);
  const cf = r.streams.total, p = M.pvMonthly(0.12, cf);
  const l = M.leveredCase(cf, p, r.bb.base, Object.assign({}, A, { targetDraw: 0, gaAnnual: 0, unusedFee: 0 }));
  near(l.leveredIRR, 0.12, 1e-6);
});

test('positive leverage: cheap debt lifts equity IRR above the unlevered rate', () => {
  const r = M.analyze(MSR, A);
  const cf = r.streams.total, p = M.pvMonthly(0.15, cf);
  const l = M.leveredCase(cf, p, r.bb.base, Object.assign({}, A, { gaAnnual: 0 }));
  assert.ok(l.draw > 0 && l.leveredIRR > 0.15, `levered ${l.leveredIRR}`);
});

test('RBL is fully repaid by maturity', () => {
  const r = M.analyze(MSR, A);
  const cf = r.streams.total, p = M.pvMonthly(0.10, cf);
  const l = M.leveredCase(cf, p, r.bb.base, A);
  // equity outflow + all equity distributions = asset cash - interest - fees - G&A - principal; principal must equal the draw
  const totalCF = M.sum(cf), eq = M.sum(l.equityFlows);
  assert.ok(totalCF - eq > l.draw, 'debt service exceeds principal');
});

test('solver returns the bid that hits the target levered IRR', () => {
  const r = M.analyze(MSR, A);
  const p = M.bidForLeveredIRR(r, A, 0.15);
  const l = M.leveredCase(r.streams.total, p, r.bb.base, A);
  near(l.leveredIRR, 0.15, 1e-4);
});

test('scenario matrix: strip column matches the ladder, lower prices lower returns', () => {
  const r = M.analyze(MSR, A);
  const L = M.bidLadder(r, MSR, A, 'total');
  const X = M.scenarioMatrix(r, MSR, A, 'total');
  const si = X.mults.indexOf(1);
  X.rows.forEach((row, i) => {
    near(row.price, L[i].price, 1e-6);
    near(row.cells[si].leveredIRR, L[i].lev.leveredIRR, 1e-9);
    assert.ok(row.cells[0].unleveredIRR < row.cells[si].unleveredIRR);
  });
});
