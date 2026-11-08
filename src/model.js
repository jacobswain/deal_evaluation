/* Cedar Creek Deal Screen — valuation / RBL model. Works in browser (window.DSModel) and Node (module.exports). */
(function (root) {
  'use strict';

  const MONTHS = 360; // 30-year horizon
  const DAYS_PER_YEAR = 365.25;
  const DISCOUNT_RATES = [0.06, 0.08, 0.10, 0.12, 0.15, 0.17, 0.20, 0.25, 0.30];

  // ---------- Defaults (every one is editable in the UI) ----------
  const DEFAULT_ASSUMPTIONS = {
    // Production
    b: 1.0,
    terminalDecline: 0.06,
    pdnpDecline: 0.55,
    pdnpB: 1.0,
    nglPctDefault: 0.15,
    oilPctDefault: 0.50,
    declineDefault: 0.25,
    pdpShareDefault: 0.75,
    // Pricing: NYMEX settles (calendar-year averages of monthly contracts)
    stripAsOf: '2026-11-06',
    strip: [
      { year: 2026, oil: 90.83, gas: 2.998 },
      { year: 2027, oil: 81.81, gas: 2.907 },
      { year: 2028, oil: 72.13, gas: 3.519 },
      { year: 2029, oil: 68.53, gas: 3.612 },
      { year: 2030, oil: 65.67, gas: 3.622 },
      { year: 2031, oil: 62.97, gas: 3.588 }
    ],
    escalator: 0.0,
    oilDiff: -2.00,
    gasDiff: -0.60,
    nglPctWTI: 0.30,
    // Deductions (TX defaults)
    sevOil: 0.046,
    sevGas: 0.075,
    adValorem: 0.02,
    gasDeductPct: 0.15,
    interestType: 'mineral', // 'mineral' | 'wi'
    loePerBoe: 8.0,
    fixedPerMonth: 2500,
    // Bid build
    multPDP: 0.95,
    multPDNP: 0.60,
    multPUD: 0.15,
    multUpside: 0.0,
    // RBL (lender rules of thumb, not filed terms)
    deckOil: 0.80,
    deckGas: 0.80,
    bbRate: 0.09,
    advPDP: 0.60,
    advPDNP: 0.30,
    advPUD: 0.0,
    maxLeverage: 3.0,
    gaAnnual: 100000,
    targetDraw: 0.70,
    sofr: 0.0392,
    grid: [
      { upTo: 0.25, margin: 0.0250 },
      { upTo: 0.50, margin: 0.0275 },
      { upTo: 0.75, margin: 0.0300 },
      { upTo: 0.90, margin: 0.0325 },
      { upTo: 1.00, margin: 0.0350 }
    ],
    unusedFee: 0.005,
    // Scorecard
    tests: [
      { key: 'pdpPV', label: 'PDP share of PV10', dir: 'hi', pass: 0.65, warn: 0.45, w: 20, fmt: 'pct' },
      { key: 'decline', label: 'Year-1 decline', dir: 'lo', pass: 0.25, warn: 0.35, w: 15, fmt: 'pct' },
      { key: 'rp', label: 'R/P', dir: 'hi', pass: 10, warn: 7, w: 10, fmt: 'yrs' },
      { key: 'yield', label: 'NTM cash yield', dir: 'hi', pass: 0.11, warn: 0.09, w: 15, fmt: 'pct' },
      { key: 'rblCov', label: 'RBL capacity / price', dir: 'hi', pass: 0.35, warn: 0.20, w: 15, fmt: 'pct' },
      { key: 'size', label: 'Deal size', dir: 'hi', pass: 5e6, warn: 2e6, w: 5, fmt: 'money' },
      { key: 'payHistory', label: '12–24 mo pay history', dir: 'bool', w: 6 },
      { key: 'topOp', label: 'Top operator share', dir: 'lo', pass: 0.30, warn: 0.50, w: 6, fmt: 'pct' },
      { key: 'ig', label: 'Large / IG operators', dir: 'bool', w: 4 },
      { key: 'title', label: 'Clean title / division orders', dir: 'bool', w: 4 }
    ],
    verdictFinanceable: 0.75,
    verdictBorderline: 0.50,
    verdictDevStory: 0.40
  };

  const DEFAULT_DEAL = {
    name: '',
    ask: null,
    ntmCF: null,
    ltmCF: null,
    monthlyCF: null,
    pvPDP: null,
    pvPDNP: null,
    pvPUD: null,
    pvUpside: null,
    pvTotal: null,
    prodBoed: null,
    oilPct: null,
    gasPct: null,
    nglPct: null,
    decline: null,
    pdpShareNTM: null,
    calibMode: 'auto', // 'auto' | 'ntm' | 'production'
    pdnpOnline: 4, // first producing month (1 = next month)
    pdnpRisk: 0.80, // realization %
    pdpSource: 'modeled', // 'modeled' | 'teaser'
    pdnpSource: 'auto', // 'auto' | 'modeled' | 'teaser'
    payHistory: false,
    igOperators: false,
    cleanTitle: false,
    topOpShare: null,
    startYear: null,
    startMonth: null // 0-11
  };

  // ---------- helpers ----------
  const num = (v) => (v === null || v === undefined || v === '' || !isFinite(+v) ? null : +v);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const sum = (a, n) => { let s = 0; const m = n === undefined ? a.length : Math.min(n, a.length); for (let i = 0; i < m; i++) s += a[i]; return s; };

  // ---------- Arps decline ----------
  /** Nominal annual initial decline from a first-year effective (secant) decline. */
  function nominalFromEffective(De, b) {
    De = clamp(De, 1e-6, 0.999);
    if (b < 1e-6) return -Math.log(1 - De);
    return (Math.pow(1 - De, -b) - 1) / b;
  }

  /**
   * Build an Arps decline object. Rates in units/day, time in years.
   * Switches to exponential when instantaneous nominal decline falls below the terminal decline.
   */
  function arps(De, b, terminalEff) {
    const Di = nominalFromEffective(De, b);
    const Dlim = terminalEff > 0 ? -Math.log(1 - terminalEff) : 0;
    let tSwitch = Infinity;
    if (b > 1e-6 && Dlim > 0 && Di > Dlim) tSwitch = (Di / Dlim - 1) / (b * Di);
    if (b <= 1e-6) tSwitch = Infinity; // pure exponential throughout
    const hypRate = (t) => (b <= 1e-6 ? Math.exp(-Di * t) : Math.pow(1 + b * Di * t, -1 / b));
    const hypCum = (t) => {
      if (b <= 1e-6) return (1 - Math.exp(-Di * t)) / Di;
      if (Math.abs(b - 1) < 1e-9) return Math.log(1 + Di * t) / Di;
      return (1 - Math.pow(1 + b * Di * t, 1 - 1 / b)) / ((1 - b) * Di);
    };
    const qSw = isFinite(tSwitch) ? hypRate(tSwitch) : 0;
    const cSw = isFinite(tSwitch) ? hypCum(tSwitch) : 0;
    return {
      Di, Dlim, tSwitch,
      /** rate at t (years) for qi = 1 */
      rate(t) {
        if (t <= tSwitch) return hypRate(t);
        return qSw * Math.exp(-Dlim * (t - tSwitch));
      },
      /** instantaneous nominal decline at t */
      decline(t) {
        if (t > tSwitch) return Dlim;
        return b <= 1e-6 ? Di : Di / (1 + b * Di * t);
      },
      /** cumulative production to t (years) for qi = 1 unit/year */
      cum(t) {
        if (t <= tSwitch) return hypCum(t);
        return cSw + (Dlim > 0 ? qSw * (1 - Math.exp(-Dlim * (t - tSwitch))) / Dlim : qSw * (t - tSwitch));
      }
    };
  }

  /** Monthly volumes (units/month) for qi units/day, starting at month index `start`. */
  function monthlyVolumes(qi, De, b, terminal, start, n) {
    const out = new Array(n).fill(0);
    if (!(qi > 0)) return out;
    const a = arps(De, b, terminal);
    for (let i = Math.max(0, start); i < n; i++) {
      const t0 = (i - start) / 12, t1 = (i - start + 1) / 12;
      out[i] = qi * DAYS_PER_YEAR * (a.cum(t1) - a.cum(t0));
    }
    return out;
  }

  // ---------- discounting ----------
  /** Standard NPV with end-of-period discounting: cfs[0] at t=0. rate is per period. */
  function npv(rate, cfs) {
    let v = 0;
    for (let i = 0; i < cfs.length; i++) v += cfs[i] / Math.pow(1 + rate, i);
    return v;
  }

  /** IRR per period by bisection. Returns null if no sign change. */
  function irr(cfs, lo = -0.99, hi = 10) {
    let flo = npv(lo, cfs), fhi = npv(hi, cfs);
    if (!isFinite(flo) || !isFinite(fhi) || flo * fhi > 0) return null;
    for (let k = 0; k < 200; k++) {
      const mid = (lo + hi) / 2, fm = npv(mid, cfs);
      if (Math.abs(fm) < 1e-9 || hi - lo < 1e-12) return mid;
      if (fm * flo > 0) { lo = mid; flo = fm; } else { hi = mid; }
    }
    return (lo + hi) / 2;
  }

  /** PV of monthly cash flows at an annual effective rate, mid-month convention. */
  function pvMonthly(rate, cf) {
    let v = 0;
    for (let i = 0; i < cf.length; i++) if (cf[i]) v += cf[i] * Math.pow(1 + rate, -(i + 0.5) / 12);
    return v;
  }

  /** Annual rate r such that pvMonthly(r, cf) = price. */
  function impliedRate(cf, price) {
    if (!(price > 0)) return null;
    const f = (r) => pvMonthly(r, cf) - price;
    let lo = -0.95, hi = 20;
    if (f(lo) < 0) return null; // can't recover price even at -95%
    if (f(hi) > 0) return hi;
    for (let k = 0; k < 120; k++) {
      const mid = (lo + hi) / 2;
      if (f(mid) > 0) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  function paybackMonths(cf, price) {
    if (!(price > 0)) return null;
    let c = 0;
    for (let i = 0; i < cf.length; i++) {
      const prev = c; c += cf[i];
      if (c >= price) return i + (cf[i] > 0 ? (price - prev) / cf[i] : 1);
    }
    return null;
  }

  // ---------- pricing ----------
  function priceDeck(A, startYear, startMonth, n, mult = 1, deck = false) {
    const strip = (A.strip || []).filter((r) => isFinite(+r.year)).slice().sort((x, y) => x.year - y.year);
    const last = strip[strip.length - 1] || { year: startYear, oil: 70, gas: 3.5 };
    const first = strip[0] || last;
    const oil = new Array(n), gas = new Array(n), years = new Array(n);
    for (let i = 0; i < n; i++) {
      const m = startMonth + i, y = startYear + Math.floor(m / 12);
      years[i] = y;
      let row = strip.find((r) => r.year === y);
      let esc = 1;
      if (!row) {
        if (y < first.year) row = first;
        else { row = last; esc = Math.pow(1 + (A.escalator || 0), y - last.year); }
      }
      oil[i] = +row.oil * esc * mult * (deck ? A.deckOil : 1);
      gas[i] = +row.gas * esc * mult * (deck ? A.deckGas : 1);
    }
    return { oil, gas, years };
  }

  // ---------- cash flow ----------
  function mixOf(deal, A) {
    let oil = num(deal.oilPct), gas = num(deal.gasPct), ngl = num(deal.nglPct);
    if (oil === null && gas !== null) oil = ngl !== null ? 1 - gas - ngl : 1 - gas - A.nglPctDefault;
    if (oil === null) oil = A.oilPctDefault;
    if (ngl === null) ngl = gas !== null ? clamp(1 - oil - gas, 0, 1) : A.nglPctDefault;
    oil = clamp(oil, 0, 1); ngl = clamp(ngl, 0, 1 - oil);
    gas = clamp(1 - oil - ngl, 0, 1);
    return { oil, gas, ngl };
  }

  /** Cash flow for a Boe volume stream. Returns arrays and applies the 3-month economic limit. */
  function streamCashFlow(boe, mix, prices, A, fixedCost) {
    const n = boe.length;
    const net = new Array(n).fill(0), rev = new Array(n).fill(0), vol = boe.slice();
    const oilV = new Array(n), gasV = new Array(n), nglV = new Array(n);
    const wi = A.interestType === 'wi';
    for (let i = 0; i < n; i++) {
      const b = boe[i];
      const ov = b * mix.oil, nv = b * mix.ngl, gv = b * mix.gas * 6; // gas in mcf
      oilV[i] = ov; gasV[i] = gv; nglV[i] = nv;
      if (b <= 0) { net[i] = 0; continue; }
      const wti = prices.oil[i], hh = prices.gas[i];
      const oilRev = ov * Math.max(0, wti + A.oilDiff);
      const nglRev = nv * Math.max(0, wti * A.nglPctWTI);
      const gasRev = gv * Math.max(0, hh + A.gasDiff);
      const r = oilRev + nglRev + gasRev;
      const sev = oilRev * A.sevOil + (gasRev + nglRev) * A.sevGas;
      const ded = gasRev * A.gasDeductPct;
      const adv = r * A.adValorem;
      const costs = wi ? b * A.loePerBoe + (fixedCost || 0) : 0;
      rev[i] = r;
      net[i] = r - sev - ded - adv - costs;
    }
    // Economic limit: truncate when net cash flow is negative for 3 straight months.
    let limit = n;
    for (let i = 0; i + 2 < n; i++) {
      if (net[i] < 0 && net[i + 1] < 0 && net[i + 2] < 0) { limit = i; break; }
    }
    for (let i = limit; i < n; i++) { net[i] = 0; rev[i] = 0; vol[i] = 0; oilV[i] = 0; gasV[i] = 0; nglV[i] = 0; }
    return { net, rev, boe: vol, oil: oilV, gas: gasV, ngl: nglV, limit };
  }

  function startOf(deal) {
    if (deal.startYear && deal.startMonth !== null && deal.startMonth !== undefined) return { y: +deal.startYear, m: +deal.startMonth };
    const d = new Date();
    let m = d.getMonth() + 1, y = d.getFullYear();
    if (m > 11) { m = 0; y += 1; }
    return { y, m };
  }

  /** Effective inputs after defaults. */
  function resolve(deal, A) {
    const d = Object.assign({}, DEFAULT_DEAL, deal);
    const De = num(d.decline) !== null ? clamp(num(d.decline), 0.005, 0.95) : A.declineDefault;
    const share = num(d.pdpShareNTM) !== null ? clamp(num(d.pdpShareNTM), 0, 1) : A.pdpShareDefault;
    const ntm = num(d.ntmCF);
    const prod = num(d.prodBoed);
    let mode = d.calibMode;
    if (mode === 'auto') mode = prod > 0 ? 'production' : (ntm > 0 ? 'ntm' : 'none');
    if (mode === 'production' && !(prod > 0)) mode = ntm > 0 ? 'ntm' : 'none';
    if (mode === 'ntm' && !(ntm > 0)) mode = prod > 0 ? 'production' : 'none';
    const online = clamp(Math.round(num(d.pdnpOnline) || 1), 1, 60);
    const risk = num(d.pdnpRisk) !== null ? clamp(num(d.pdnpRisk), 0, 1) : 0.8;
    return { d, De, share, ntm, prod, mode, online, risk, mix: mixOf(d, A), start: startOf(d) };
  }

  /** Solve increasing f(x) = target on [lo, hi]. */
  function solveIncreasing(f, target, lo, hi) {
    let flo = f(lo) - target;
    let fhi = f(hi) - target;
    let guard = 0;
    while (fhi < 0 && guard++ < 40) { hi *= 4; fhi = f(hi) - target; }
    if (flo > 0 || fhi < 0) return null;
    for (let k = 0; k < 80; k++) {
      const mid = (lo + hi) / 2, fm = f(mid) - target;
      if (Math.abs(fm) < 1e-6 * Math.max(1, Math.abs(target))) return mid;
      if (fm < 0) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /** Build PDP + PDNP streams for given q's and scenario knobs. */
  function buildStreams(R, A, qPDP, qPDNP, opt) {
    const o = Object.assign({ priceMult: 1, declineDelta: 0, deck: false }, opt);
    const n = MONTHS;
    const prices = priceDeck(A, R.start.y, R.start.m, n, o.priceMult, o.deck);
    const deP = clamp(R.De + o.declineDelta, 0.005, 0.95);
    const deN = clamp(A.pdnpDecline + o.declineDelta, 0.005, 0.95);
    const fixed = A.interestType === 'wi' ? A.fixedPerMonth : 0;
    const pdpVol = monthlyVolumes(qPDP, deP, A.b, A.terminalDecline, 0, n);
    const pdnpVol = monthlyVolumes(qPDNP, deN, A.pdnpB, A.terminalDecline, R.online - 1, n);
    const pdp = streamCashFlow(pdpVol, R.mix, prices, A, qPDP > 0 ? fixed : 0);
    const pdnpRaw = streamCashFlow(pdnpVol, R.mix, prices, A, 0);
    const pdnp = {
      net: pdnpRaw.net.map((v) => v * R.risk),
      boe: pdnpRaw.boe.map((v) => v * R.risk),
      unriskedNet: pdnpRaw.net,
      limit: pdnpRaw.limit
    };
    const total = pdp.net.map((v, i) => v + pdnp.net[i]);
    return { prices, pdp, pdnp, total, deP, deN };
  }

  /** Calibrate initial rates (Boe/d) for PDP and PDNP. */
  function calibrate(deal, A) {
    const R = resolve(deal, A);
    const notes = [];
    let qPDP = 0, qPDNP = 0;
    const ntmOf = (q, which) => {
      const s = which === 'pdp' ? buildStreams(R, A, q, 0) : buildStreams(R, A, 0, q);
      return which === 'pdp' ? sum(s.pdp.net, 12) : sum(s.pdnp.unriskedNet, 12);
    };
    let pdnpTarget = 0;
    if (R.mode === 'production') {
      qPDP = R.prod;
      if (R.ntm > 0) {
        const pdpNTM = ntmOf(qPDP, 'pdp');
        pdnpTarget = Math.max(0, R.ntm - pdpNTM);
        if (R.ntm < pdpNTM) notes.push('Stated production implies more NTM cash flow than the teaser NTM CF; PDNP set to zero.');
      }
    } else if (R.mode === 'ntm') {
      const target = R.ntm * R.share;
      qPDP = target > 0 ? (solveIncreasing((q) => ntmOf(q, 'pdp'), target, 0, 100) || 0) : 0;
      pdnpTarget = R.ntm * (1 - R.share);
      if (num(R.d.pdpShareNTM) === null) notes.push(`PDP share of NTM CF not stated; assumed ${Math.round(R.share * 100)}%.`);
    } else {
      notes.push('No production or NTM cash flow found; enter one to model volumes.');
    }
    if (pdnpTarget > 0) {
      if (R.online > 12) notes.push('PDNP online month is after month 12, so it cannot be back-solved from NTM CF.');
      else qPDNP = solveIncreasing((q) => ntmOf(q, 'pdnp'), pdnpTarget, 0, 100) || 0;
    }
    return { qPDP, qPDNP, R, notes, pdnpTarget };
  }

  /** Fit PDP first-year decline so modeled PDP PV10 matches the teaser PDP PV10. */
  function fitDecline(deal, A) {
    const target = num(deal.pvPDP);
    if (!(target > 0)) return null;
    const f = (De) => {
      const d = Object.assign({}, deal, { decline: De });
      const c = calibrate(d, A);
      const s = buildStreams(c.R, A, c.qPDP, c.qPDNP);
      return pvMonthly(0.10, s.pdp.net);
    };
    // PV decreases with decline
    let lo = 0.01, hi = 0.90;
    const flo = f(lo), fhi = f(hi);
    if (target > flo) return lo;
    if (target < fhi) return hi;
    for (let k = 0; k < 50; k++) {
      const mid = (lo + hi) / 2;
      if (f(mid) > target) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  function marginFor(util, grid) {
    const g = (grid || []).slice().sort((a, b) => a.upTo - b.upTo);
    for (const row of g) if (util <= row.upTo + 1e-12) return row.margin;
    return g.length ? g[g.length - 1].margin : 0;
  }

  /** Borrowing base = MIN(reserves test, leverage test). */
  function borrowingBase(x, A) {
    const reserves = x.pdpPV9Deck * A.advPDP + x.pdnpPV9Deck * A.advPDNP + (x.pud || 0) * A.advPUD;
    const ebitdaDeck = x.ntmDeck - A.gaAnnual;
    const leverage = Math.max(0, ebitdaDeck) * A.maxLeverage;
    const base = Math.max(0, Math.min(reserves, leverage));
    return { reserves, leverage, ebitdaDeck, base, binding: reserves <= leverage ? 'Reserves' : 'Leverage' };
  }

  function rblStack(bb, price, ntmStrip, A) {
    const draw = Math.max(0, Math.min(bb.base * A.targetDraw, price));
    const util = bb.base > 0 ? draw / bb.base : 0;
    const margin = marginFor(util, A.grid);
    const rate = A.sofr + margin;
    const interest = draw * rate + Math.max(0, bb.base - draw) * A.unusedFee;
    const equity = Math.max(0, price - draw);
    const ebitda = ntmStrip - A.gaAnnual;
    return {
      draw, util, margin, rate, interest, equity, ebitda,
      unused: Math.max(0, bb.base - draw),
      leveredCoC: equity > 0 ? (ebitda - interest) / equity : null,
      dscr: interest > 0 ? ebitda / interest : null,
      debtEbitda: ebitda > 0 ? draw / ebitda : null
    };
  }

  function scoreTest(t, v) {
    if (t.dir === 'bool') return v ? 'pass' : 'fail';
    if (v === null || v === undefined || !isFinite(v)) return 'missing';
    if (t.dir === 'hi') return v >= t.pass ? 'pass' : v >= t.warn ? 'warn' : 'fail';
    return v <= t.pass ? 'pass' : v <= t.warn ? 'warn' : 'fail';
  }

  function scorecard(vals, A) {
    let got = 0, tot = 0;
    const rows = A.tests.map((t) => {
      const v = vals[t.key];
      const status = scoreTest(t, v);
      const pts = status === 'pass' ? t.w : status === 'warn' ? t.w / 2 : 0;
      got += pts; tot += t.w;
      return Object.assign({}, t, { value: v, status, pts });
    });
    return { rows, score: tot > 0 ? got / tot : 0, points: got, total: tot };
  }

  function verdictOf(x, A) {
    const fmtP = (v) => (v === null || !isFinite(v) ? 'n/a' : (v * 100).toFixed(0) + '%');
    const fails = x.score.rows.filter((r) => r.status === 'fail' || r.status === 'missing').sort((a, b) => b.w - a.w);
    const weak = fails.slice(0, 2).map((r) => r.label.toLowerCase()).join(' and ');
    const over = x.ask > 0 && x.ask > x.maxBid + 0.5;
    const s = x.score.score;
    if (x.pdpSharePV !== null && x.pdpSharePV < A.verdictDevStory) {
      return { verdict: 'Development story', tone: 'dev',
        reason: `PDP is only ${fmtP(x.pdpSharePV)} of PV10, so most of the value sits in DUCs, permits and locations that lenders advance little or nothing against.` };
    }
    if (s >= A.verdictFinanceable && !over) {
      return { verdict: 'Financeable', tone: 'good',
        reason: `Scores ${fmtP(s)} with PDP at ${fmtP(x.pdpSharePV)} of PV10, and an RBL covers ${fmtP(x.rblCov)} of the price at or below max bid.` };
    }
    if (s >= A.verdictBorderline) {
      const why = over && s >= A.verdictFinanceable
        ? `Scores ${fmtP(s)}, but the ask is ${fmtMoney(x.ask - x.maxBid)} above max bid, so it is capped at Borderline.`
        : `Scores ${fmtP(s)}${weak ? `; weakest on ${weak}` : ''}${over ? `, and the ask is ${fmtMoney(x.ask - x.maxBid)} above max bid` : ''}.`;
      return { verdict: 'Borderline', tone: 'warn', reason: why };
    }
    return { verdict: 'Pass', tone: 'bad',
      reason: `Scores only ${fmtP(s)}${weak ? `; fails on ${weak}` : ''}${over ? `, and the ask is ${fmtMoney(x.ask - x.maxBid)} above max bid` : ''}.` };
  }

  /** Value a scenario run (used for base case and sensitivities). */
  function valueRun(s, deal, A, R, base) {
    const pdpPV10m = pvMonthly(0.10, s.pdp.net);
    const pdnpPV10m = pvMonthly(0.10, s.pdnp.net);
    const tPDP = num(deal.pvPDP), tPDNP = num(deal.pvPDNP), tPUD = num(deal.pvPUD), tUp = num(deal.pvUpside);
    // Ratios for scaling teaser values in sensitivity scenarios
    const rPDP = base && base.pdpPV10m > 0 ? pdpPV10m / base.pdpPV10m : 1;
    const rPDNP = base && base.pdnpPV10m > 0 ? pdnpPV10m / base.pdnpPV10m : rPDP;
    const pdpSrc = deal.pdpSource === 'teaser' && tPDP > 0 ? 'teaser' : 'modeled';
    let pdnpSrc = deal.pdnpSource || 'auto';
    if (pdnpSrc === 'auto') pdnpSrc = tPDNP > 0 ? 'teaser' : 'modeled';
    if (pdnpSrc === 'teaser' && !(tPDNP > 0)) pdnpSrc = 'modeled';
    const vPDP = pdpSrc === 'teaser' ? tPDP * rPDP : pdpPV10m;
    const vPDNP = pdnpSrc === 'teaser' ? tPDNP * rPDNP : pdnpPV10m;
    const vPUD = (tPUD || 0) * rPDNP;
    const vUp = (tUp || 0) * rPDNP;
    const bid = {
      pdp: vPDP * A.multPDP, pdnp: vPDNP * A.multPDNP, pud: vPUD * A.multPUD, upside: vUp * A.multUpside
    };
    const maxBid = bid.pdp + bid.pdnp + bid.pud + bid.upside;
    return { pdpPV10m, pdnpPV10m, vPDP, vPDNP, vPUD, vUp, pdpSrc, pdnpSrc, bid, maxBid };
  }

  /** Full analysis. */
  function analyze(deal, A) {
    A = Object.assign({}, DEFAULT_ASSUMPTIONS, A || {});
    const cal = calibrate(deal, A);
    const R = cal.R;
    const s = buildStreams(R, A, cal.qPDP, cal.qPDNP);
    const deck = buildStreams(R, A, cal.qPDP, cal.qPDNP, { deck: true });
    const v = valueRun(s, deal, A, R, null);

    const pvTable = DISCOUNT_RATES.map((r) => ({ rate: r, pdp: pvMonthly(r, s.pdp.net), pdnp: pvMonthly(r, s.pdnp.net), total: pvMonthly(r, s.total) }));
    const pvCurve = [];
    for (let r = 0; r <= 0.401; r += 0.01) pvCurve.push({ rate: r, total: pvMonthly(r, s.total), pdp: pvMonthly(r, s.pdp.net) });

    const ask = num(deal.ask) > 0 ? num(deal.ask) : null;
    const price = ask || v.maxBid;
    const ntmPDP = sum(s.pdp.net, 12), ntmPDNP = sum(s.pdnp.net, 12), ntmTotal = ntmPDP + ntmPDNP;
    const ltm = num(deal.ltmCF);
    const reservesPDP = sum(s.pdp.boe);
    const reservesPDNP = sum(s.pdnp.boe);
    const curBoed = cal.qPDP;
    const rp = curBoed > 0 ? reservesPDP / (curBoed * DAYS_PER_YEAR) : null;

    // Bank deck values
    const pdpPV9Deck = pvMonthly(A.bbRate, deck.pdp.net);
    const pdnpPV9DeckModeled = pvMonthly(A.bbRate, deck.pdnp.net);
    let pdnpPV9Deck = pdnpPV9DeckModeled;
    if (v.pdnpSrc === 'teaser') pdnpPV9Deck = v.pdnpPV10m > 0 ? v.vPDNP * (pdnpPV9DeckModeled / v.pdnpPV10m) : v.vPDNP * A.deckOil;
    let pdpPV9DeckUsed = pdpPV9Deck;
    if (v.pdpSrc === 'teaser') pdpPV9DeckUsed = v.pdpPV10m > 0 ? v.vPDP * (pdpPV9Deck / v.pdpPV10m) : v.vPDP * A.deckOil;
    const ntmDeck = sum(deck.total, 12);
    const bb = borrowingBase({ pdpPV9Deck: pdpPV9DeckUsed, pdnpPV9Deck, ntmDeck, pud: v.vPUD }, A);
    const stack = rblStack(bb, price, ntmTotal, A);

    const pvDen = v.vPDP + v.vPDNP + v.vPUD + v.vUp;
    const pdpSharePV = pvDen > 0 ? v.vPDP / pvDen : null;

    const metrics = {
      price, ask, maxBid: v.maxBid,
      ntmTotal, ntmPDP, ntmPDNP, ltm,
      yieldNTM: price > 0 ? ntmTotal / price : null,
      yieldPDP: price > 0 ? ntmPDP / price : null,
      irrTotal: impliedRate(s.total, price),
      irrPDP: impliedRate(s.pdp.net, price),
      payback: paybackMonths(s.total, price),
      multiple: ntmTotal > 0 ? price / ntmTotal : null,
      perFlowing: curBoed > 0 ? price / curBoed : null,
      reservesPDP, reservesPDNP, rp, curBoed,
      oilWeight: R.mix.oil,
      oilRevWeight: (() => { // share of year-1 PDP revenue from oil
        let o = 0, t = 0;
        for (let i = 0; i < 12; i++) { const ov = s.pdp.oil[i] * Math.max(0, s.prices.oil[i] + A.oilDiff); o += ov; t += s.pdp.rev[i]; }
        return t > 0 ? o / t : null;
      })(),
      pdpSharePV,
      rblCov: price > 0 ? bb.base / price : null
    };

    const vals = {
      pdpPV: pdpSharePV,
      decline: R.De,
      rp,
      yield: metrics.yieldNTM,
      rblCov: metrics.rblCov,
      size: price,
      payHistory: !!R.d.payHistory,
      topOp: num(R.d.topOpShare),
      ig: !!R.d.igOperators,
      title: !!R.d.cleanTitle
    };
    const score = scorecard(vals, A);
    const verdict = verdictOf({ score, pdpSharePV, ask: ask || 0, maxBid: v.maxBid, rblCov: metrics.rblCov }, A);

    // Annual rollup (model years)
    const annual = [];
    for (let y = 0; y < MONTHS / 12; y++) {
      const a = y * 12, b = a + 12;
      const sl = (arr) => sum(arr.slice(a, b));
      annual.push({
        year: y + 1,
        calYear: R.start.y + Math.floor((R.start.m + a) / 12),
        boedPDP: sl(s.pdp.boe) / DAYS_PER_YEAR,
        boedPDNP: sl(s.pdnp.boe) / DAYS_PER_YEAR,
        pdpCF: sl(s.pdp.net),
        pdnpCF: sl(s.pdnp.net),
        totalCF: sl(s.total),
        deckCF: sl(deck.total),
        oil: s.prices.oil[a], gas: s.prices.gas[a]
      });
    }

    return {
      A, R, cal, streams: s, deck, valuation: v, pvTable, pvCurve, metrics, bb, stack, score, verdict, annual,
      notes: cal.notes.slice()
    };
  }

  /** Sensitivity grid: strip multiplier × decline delta → max bid & NTM yield at a fixed price. */
  function sensitivity(deal, A, base) {
    A = Object.assign({}, DEFAULT_ASSUMPTIONS, A || {});
    base = base || analyze(deal, A);
    const mults = [0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3];
    const deltas = [-0.10, -0.05, 0, 0.05, 0.10];
    const price = base.metrics.price;
    const rows = deltas.map((dd) => ({
      delta: dd,
      cells: mults.map((pm) => {
        const s = buildStreams(base.R, A, base.cal.qPDP, base.cal.qPDNP, { priceMult: pm, declineDelta: dd });
        const v = valueRun(s, deal, A, base.R, base.valuation);
        const ntm = sum(s.total, 12);
        return { mult: pm, maxBid: v.maxBid, yield: price > 0 ? ntm / price : null };
      })
    }));
    return { mults, deltas, rows, price };
  }

  // ---------- formatting ----------
  function fmtMoney(v, dp) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    const neg = v < 0, a = Math.abs(v);
    let s;
    if (a >= 1e9) s = '$' + (a / 1e9).toFixed(dp ?? 2) + 'B';
    else if (a >= 1e6) s = '$' + (a / 1e6).toFixed(dp ?? (a >= 1e8 ? 0 : 1)) + 'MM';
    else if (a >= 1e3) s = '$' + (a / 1e3).toFixed(dp ?? 0) + 'K';
    else s = '$' + a.toFixed(0);
    return (neg ? '−' : '') + s;
  }
  function fmtPct(v, dp = 1) { return v === null || v === undefined || !isFinite(v) ? '—' : (v * 100).toFixed(dp) + '%'; }
  function fmtNum(v, dp = 0) { return v === null || v === undefined || !isFinite(v) ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }); }
  function fmtYrs(v) { return v === null || v === undefined || !isFinite(v) ? '—' : v.toFixed(1) + ' yrs'; }
  function fmtX(v) { return v === null || v === undefined || !isFinite(v) ? '—' : v.toFixed(1) + 'x'; }
  function fmtBoe(v) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    if (v >= 1e6) return (v / 1e6).toFixed(2) + 'MMBoe';
    if (v >= 1e3) return (v / 1e3).toFixed(0) + 'MBoe';
    return v.toFixed(0) + ' Boe';
  }

  const api = {
    MONTHS, DISCOUNT_RATES, DEFAULT_ASSUMPTIONS, DEFAULT_DEAL,
    nominalFromEffective, arps, monthlyVolumes, npv, irr, pvMonthly, impliedRate, paybackMonths,
    priceDeck, mixOf, streamCashFlow, resolve, calibrate, buildStreams, fitDecline,
    borrowingBase, rblStack, marginFor, scorecard, scoreTest, verdictOf, analyze, sensitivity,
    fmtMoney, fmtPct, fmtNum, fmtYrs, fmtX, fmtBoe, sum
  };
  root.DSModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
