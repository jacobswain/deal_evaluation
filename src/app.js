/* Cedar Creek Deal Screen — UI */
(function () {
  'use strict';
  const M = window.DSModel, P = window.DSParser;
  const { fmtMoney, fmtPct, fmtNum, fmtYrs, fmtX, fmtBoe } = M;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = (o) => JSON.parse(JSON.stringify(o));

  const LS = { A: 'ccds.v1.assumptions', cur: 'ccds.v1.current', deals: 'ccds.v1.deals', ui: 'ccds.v1.ui' };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  };

  const SAMPLES = {
    'Piper (RedOaks)': 'Piper Royalties, LLC is offering for sale certain mineral & royalty properties located in the Delaware and Midland Basins. ... 3,296 NRA across the Delaware Basin (51%), Midland Basin (49%) ... 18 rigs drilling on position | 243 DUCs & permits ... NTM CF: $8.1MM ... 5,325 gross / 4.2 net undeveloped locations ... Exxon, Diamondback, and Occidental',
    'Lincoln (Detring)': 'Lincoln Energy Partners, LLC is offering for sale certain mineral and royalty properties located in Converse County, Wyoming. ... 2,444 NRA ... Projected NTM CF: $3.5MM ... 650+ upside locations ... Continental, Devon, and Occidental',
    'MSR summary': 'NTM CF $4.0MM, 16% PDP. PV10: PDP $3MM, DUCs & permits $9MM, undeveloped locations $13MM, total $25MM. 14 DUCs. Bids due Dec 2, noon CT.'
  };

  // ---------- field definitions ----------
  const REVIEW = [
    { g: 'Deal', items: [
      { k: 'seller', l: 'Seller', t: 'text' }, { k: 'basins', l: 'Basins', t: 'text' }, { k: 'counties', l: 'Counties', t: 'text' },
      { k: 'states', l: 'States', t: 'text' }, { k: 'operators', l: 'Operators', t: 'text' }, { k: 'nra', l: 'Net royalty acres', t: 'num' },
      { k: 'bidDate', l: 'Bid date', t: 'text' }] },
    { g: 'Cash flow', items: [
      { k: 'ntmCF', l: 'NTM cash flow', t: 'money', model: true }, { k: 'ltmCF', l: 'LTM cash flow', t: 'money', model: true },
      { k: 'monthlyCF', l: 'Monthly cash flow', t: 'money', model: true }, { k: 'pdpShareNTM', l: 'PDP share of NTM CF', t: 'pct', model: true, assumeKey: 'pdpShareDefault' }] },
    { g: 'PV10 (teaser)', items: [
      { k: 'pvPDP', l: 'PDP', t: 'money', model: true }, { k: 'pvPDNP', l: 'PDNP / DUCs & permits', t: 'money', model: true },
      { k: 'pvPUD', l: 'PUD / undeveloped', t: 'money', model: true }, { k: 'pvUpside', l: 'Upside', t: 'money', model: true },
      { k: 'pvTotal', l: 'Total', t: 'money', model: true }] },
    { g: 'Production', items: [
      { k: 'prodBoed', l: 'Net production (Boe/d)', t: 'num', model: true }, { k: 'oilPct', l: 'Oil %', t: 'pct', model: true, assumeKey: 'oilPctDefault' },
      { k: 'gasPct', l: 'Gas %', t: 'pct', model: true }, { k: 'nglPct', l: 'NGL %', t: 'pct', model: true, assumeKey: 'nglPctDefault' },
      { k: 'decline', l: 'First-year decline (PDP)', t: 'pct', model: true, assumeKey: 'declineDefault' }] },
    { g: 'Development', items: [
      { k: 'ducs', l: 'DUCs', t: 'num' }, { k: 'ducsPermits', l: 'DUCs & permits', t: 'num' }, { k: 'permits', l: 'Permits', t: 'num' },
      { k: 'rigs', l: 'Rigs on position', t: 'num' }, { k: 'wells', l: 'Wells', t: 'num' }, { k: 'locations', l: 'Locations (gross)', t: 'num' },
      { k: 'netLocations', l: 'Net locations', t: 'num', dp: 1 }] }
  ];
  const KEY_FIELDS = ['seller', 'basins', 'operators', 'nra', 'ntmCF', 'pvPDP', 'pvPDNP', 'pvPUD', 'pvTotal', 'prodBoed', 'oilPct', 'decline', 'bidDate'];

  const INPUTS = [
    { g: 'Production', keys: [
      ['b', 'b-factor (PDP)', 'num', 2], ['terminalDecline', 'Terminal decline', 'pct'], ['pdnpDecline', 'PDNP first-year decline', 'pct'],
      ['pdnpB', 'b-factor (PDNP)', 'num', 2], ['declineDefault', 'Default PDP decline (if not in teaser)', 'pct'],
      ['pdpShareDefault', 'Default PDP share of NTM CF', 'pct'], ['oilPctDefault', 'Default oil %', 'pct'], ['nglPctDefault', 'Default NGL %', 'pct']] },
    { g: 'Pricing', strip: true, keys: [
      ['escalator', 'Escalator after last strip year', 'pct'], ['oilDiff', 'Oil differential ($/bbl)', 'usd', 2],
      ['gasDiff', 'Gas differential ($/mcf)', 'usd', 2], ['nglPctWTI', 'NGL price (% of WTI)', 'pct']] },
    { g: 'Deductions & costs', keys: [
      ['interestType', 'Interest type', 'select', [['mineral', 'Mineral / royalty (no costs)'], ['wi', 'Non-op WI (LOE + fixed)']]],
      ['sevOil', 'Severance, oil', 'pct'], ['sevGas', 'Severance, gas & NGL', 'pct'], ['adValorem', 'Ad valorem', 'pct'],
      ['gasDeductPct', 'Post-production deducts (% of gas rev)', 'pct'], ['loePerBoe', 'LOE ($/Boe, WI only)', 'usd', 2],
      ['fixedPerMonth', 'Fixed cost ($/month, WI only)', 'usd', 0]] },
    { g: 'Bid build multipliers', keys: [
      ['multPDP', 'PDP PV10 ×', 'num', 2], ['multPDNP', 'PDNP PV10 ×', 'num', 2], ['multPUD', 'PUD PV10 ×', 'num', 2], ['multUpside', 'Upside PV10 ×', 'num', 2]] },
    { g: 'RBL borrowing base', grid: true, keys: [
      ['deckOil', 'Bank deck, oil (% of strip)', 'pct'], ['deckGas', 'Bank deck, gas (% of strip)', 'pct'], ['bbRate', 'Reserves discount rate', 'pct'],
      ['advPDP', 'Advance rate, PDP', 'pct'], ['advPDNP', 'Advance rate, PDNP', 'pct'], ['advPUD', 'Advance rate, PUD', 'pct'],
      ['maxLeverage', 'Max leverage (x NTM EBITDA)', 'num', 2], ['gaAnnual', 'G&A ($/yr, while RBL is outstanding)', 'usd', 0], ['targetDraw', 'Target draw (% of base)', 'pct'],
      ['sofr', 'SOFR', 'pct', 2], ['unusedFee', 'Unused fee', 'pct', 2],
      ['sweepPct', 'Cash sweep to principal', 'pct'], ['maturityYears', 'RBL maturity (years)', 'num', 1]] },
    { g: 'Scorecard', tests: true, keys: [
      ['verdictFinanceable', 'Financeable at score ≥', 'pct', 0], ['verdictBorderline', 'Borderline at score ≥', 'pct', 0],
      ['verdictDevStory', 'Development story if PDP share of PV10 <', 'pct', 0]] }
  ];

  // ---------- state ----------
  const blankDeal = () => Object.assign(clone(M.DEFAULT_DEAL), { seller: '', basins: '', counties: '', states: '', operators: '', nra: null, bidDate: '', ducs: null, ducsPermits: null, permits: null, rigs: null, wells: null, locations: null, netLocations: null });
  const S = {
    A: Object.assign(clone(M.DEFAULT_ASSUMPTIONS), store.get(LS.A, {})),
    deal: blankDeal(),
    parsed: null, // { fields, missing }
    edited: {},
    text: '',
    view: 'ingest', leftTab: 'ingest',
    cfRange: 120, logProd: false, heat: 'maxBid', basis: 'total', scen: 'leveredIRR', targetLev: 0.15,
    result: null, sens: null,
    currentId: null
  };
  const cur = store.get(LS.cur, null);
  if (cur && cur.deal) { Object.assign(S.deal, cur.deal); S.parsed = cur.parsed || null; S.edited = cur.edited || {}; S.text = cur.text || ''; S.currentId = cur.id || null; }
  const ui = store.get(LS.ui, {});
  if (ui.view) { S.view = ui.view; S.leftTab = ui.leftTab || 'ingest'; }
  if (ui.cfRange) S.cfRange = ui.cfRange;
  if (ui.heat) S.heat = ui.heat;
  if (ui.basis) S.basis = ui.basis;
  if (ui.scen) S.scen = ui.scen;
  if (ui.targetLev) S.targetLev = ui.targetLev;
  S.logProd = !!ui.logProd;

  const persist = () => {
    store.set(LS.cur, { deal: S.deal, parsed: S.parsed, edited: S.edited, text: S.text, id: S.currentId });
    store.set(LS.A, S.A);
    store.set(LS.ui, { view: S.view, leftTab: S.leftTab, cfRange: S.cfRange, logProd: S.logProd, heat: S.heat, basis: S.basis, scen: S.scen, targetLev: S.targetLev });
  };

  // ---------- value parsing / display ----------
  function parseInput(t, raw) {
    const s = String(raw ?? '').trim();
    if (s === '') return null;
    if (t === 'money') { const p = P.parseMoney(s, null); return p ? p.value : null; }
    if (t === 'pct') { const v = parseFloat(s.replace(/[%,\s]/g, '')); if (!isFinite(v)) return null; return /%/.test(s) || Math.abs(v) > 1 ? v / 100 : v; }
    const v = parseFloat(s.replace(/[$,\s]/g, ''));
    return isFinite(v) ? v : null;
  }
  function show(t, v, dp) {
    if (v === null || v === undefined || v === '') return '';
    if (t === 'money') {
      const a = Math.abs(v);
      if (a >= 1e6 && a < 1e9) return (v < 0 ? '−' : '') + '$' + (a / 1e6).toFixed(2).replace(/(\.\d)0$/, '$1') + 'MM';
      return fmtMoney(v);
    }
    if (t === 'pct') { const x = v * 100; return (Math.abs(x - Math.round(x)) < 1e-9 ? x.toFixed(dp ?? 0) : x.toFixed(dp ?? 1)) + '%'; }
    if (t === 'usd') return (v < 0 ? '−$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: dp ?? 2, maximumFractionDigits: dp ?? 2 });
    if (t === 'num') return (+v).toLocaleString('en-US', { maximumFractionDigits: dp ?? 2 });
    return String(v);
  }

  // ---------- recompute & render ----------
  let raf = 0;
  function schedule() { clearTimeout(raf); raf = setTimeout(recompute, 70); }
  function recompute() {
    const deal = Object.assign({}, S.deal);
    // Feed numeric deal fields as numbers to the model
    S.result = M.analyze(deal, S.A);
    S.sens = M.sensitivity(deal, S.A, S.result);
    S.ladder = M.bidLadder(S.result, deal, S.A, S.basis);
    S.matrix = M.scenarioMatrix(S.result, deal, S.A, S.basis);
    persist();
    renderHero();
    renderAnalysis();
    renderReviewBadges();
  }

  const hasData = () => S.result && S.result.cal.R.mode !== 'none';

  function renderHero() {
    const r = S.result, m = r.metrics;
    const ok = hasData();
    $('#dealName').value = S.deal.name || '';
    const v = $('#verdict');
    v.className = 'badge tone-' + (ok ? r.verdict.tone : 'none');
    v.textContent = ok ? r.verdict.verdict : 'Awaiting data';
    $('#reason').textContent = ok ? r.verdict.reason : 'Drop a broker PDF or paste teaser text to start.';
    const score = ok ? r.score.score : 0;
    const C = 2 * Math.PI * 36;
    const ring = $('#ringVal');
    ring.setAttribute('stroke-dashoffset', String(C * (1 - score)));
    ring.setAttribute('stroke', !ok ? '#5b6779' : score >= S.A.verdictFinanceable ? '#34d399' : score >= S.A.verdictBorderline ? '#fbbf24' : '#f87171');
    $('#scoreTxt').textContent = ok ? Math.round(score * 100) : '—';
    const over = m.ask && m.ask > m.maxBid;
    const tiles = [
      ['Max bid', fmtMoney(m.maxBid), ok ? `${fmtX(m.maxBid / (m.ntmTotal || NaN))} NTM` : '', 'hl'],
      ['Your bid', fmtMoney(m.price), (m.irrTotal !== null ? `≈ PV${(m.irrTotal * 100).toFixed(1)} · ` : '') + (m.ask ? (over ? `${fmtMoney(m.ask - m.maxBid)} over max` : `${fmtMoney(m.maxBid - m.ask)} under max`) : 'using max bid'), over ? 'neg' : ''],
      ['NTM yield', fmtPct(m.yieldNTM), `PDP-only ${fmtPct(m.yieldPDP)}`],
      ['Implied PV rate', fmtPct(m.irrTotal), `PDP-only ${fmtPct(m.irrPDP)}`],
      ['Borrowing base', fmtMoney(r.bb.base), `${r.bb.binding} test binds`],
      ['Equity check', fmtMoney(r.stack.equity), `RBL draw ${fmtMoney(r.stack.draw)}`],
      ['Levered IRR', r.lev.fullyFinanced ? 'n/m' : fmtPct(r.lev.leveredIRR), `Yr-1 equity yield ${fmtPct(r.lev.leveredYieldY1)}`]
    ];
    $('#kpis').innerHTML = tiles.map(([k, val, s, cls]) =>
      `<div class="kpi ${cls === 'hl' ? 'hl' : ''}"><div class="k">${k}</div><div class="v ${cls === 'neg' ? 'neg' : ''}">${ok ? val : '—'}</div><div class="s">${ok ? esc(s) : '&nbsp;'}</div></div>`).join('');
  }

  // ---------- views ----------
  const mq = window.matchMedia('(max-width: 900px)');
  function setView(v) {
    S.view = v;
    if (v !== 'analysis') S.leftTab = v;
    applyView();
    persist();
  }
  function applyView() {
    const mobile = mq.matches;
    $$('.side .pane').forEach((p) => p.classList.toggle('on', mobile ? p.dataset.pane === S.view : p.dataset.pane === S.leftTab));
    $$('#sideTabs button').forEach((b) => b.classList.toggle('on', b.dataset.view === S.leftTab));
    $$('#tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.view === S.view));
    const an = $('#analysis');
    an.classList.toggle('on', !mobile || S.view === 'analysis');
    if (mobile) window.scrollTo({ top: 0 });
    requestAnimationFrame(() => Object.values(charts).forEach((c) => c.resize()));
  }

  // ---------- ingest ----------
  function renderIngest() {
    $('#paneIngest').innerHTML = `
      <div class="drop" id="drop" tabindex="0" role="button" aria-label="Upload broker PDF">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M12 11v6m0-6l-2.5 2.5M12 11l2.5 2.5"/></svg>
        <div class="big">Drop a broker PDF</div>
        <div class="small">Executive summary or teaser · or tap to choose a file</div>
      </div>
      <div class="status" id="ingestStatus"></div>
      <div class="section-title">Or paste teaser / email text</div>
      <textarea id="pasteText" placeholder="Paste the teaser or broker email here…">${esc(S.text)}</textarea>
      <div class="row" style="margin-top:8px">
        <button class="btn primary" id="btnParse">Parse text</button>
        <span class="sp" style="flex:1"></span>
        <span class="small muted">Samples:</span>
        ${Object.keys(SAMPLES).map((k) => `<button class="btn sm" data-sample="${esc(k)}">${esc(k.split(' ')[0])}</button>`).join('')}
      </div>
      <div class="foot">Text is parsed locally in your browser. Nothing is uploaded. Units like ($MM), ($M), $8.1MM, $450K and 3,012 are understood.</div>`;
    const drop = $('#drop'), fi = $('#fileInput');
    drop.onclick = () => fi.click();
    drop.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); } };
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) handleFile(f); });
    fi.onchange = () => { if (fi.files[0]) handleFile(fi.files[0]); fi.value = ''; };
    $('#btnParse').onclick = () => ingestText($('#pasteText').value, 'pasted text');
    $$('[data-sample]').forEach((b) => (b.onclick = () => { $('#pasteText').value = SAMPLES[b.dataset.sample]; ingestText(SAMPLES[b.dataset.sample], b.dataset.sample + ' sample'); }));
  }
  // Prevent the browser from opening files dropped outside the zone
  ['dragover', 'drop'].forEach((ev) => window.addEventListener(ev, (e) => { if (!e.target.closest || !e.target.closest('#drop')) e.preventDefault(); }));

  function status(msg, cls) { const el = $('#ingestStatus'); if (el) { el.textContent = msg; el.className = 'status ' + (cls || ''); } }

  async function handleFile(file) {
    try {
      if (/\.txt$/i.test(file.name) || file.type === 'text/plain') { ingestText(await file.text(), file.name); return; }
      if (!window.pdfjsLib) throw new Error('PDF engine did not load (check your connection).');
      status(`Reading ${file.name}…`);
      const text = await pdfText(await file.arrayBuffer());
      if (!text.trim()) throw new Error('No text layer found (scanned PDF?). Paste the text instead.');
      $('#pasteText').value = text;
      ingestText(text, file.name);
    } catch (e) { status(e.message || String(e), 'err'); }
  }

  async function pdfText(buf) {
    const lib = window.pdfjsLib;
    lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const doc = await lib.getDocument({ data: new Uint8Array(buf) }).promise;
    const out = [];
    for (let p = 1; p <= Math.min(doc.numPages, 40); p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      let line = [], lastY = null;
      const lines = [];
      for (const it of tc.items) {
        const y = it.transform ? Math.round(it.transform[5]) : null;
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 2 && line.length) { lines.push(line.join(' ')); line = []; }
        if (it.str) line.push(it.str);
        if (it.hasEOL && line.length) { lines.push(line.join(' ')); line = []; }
        lastY = y;
      }
      if (line.length) lines.push(line.join(' '));
      out.push(lines.join('\n'));
    }
    return out.join('\n\n').replace(/[ \t]+/g, ' ');
  }

  function ingestText(text, label) {
    if (!text || !text.trim()) { status('Nothing to parse.', 'err'); return; }
    const res = P.parseTeaser(text);
    const f = res.fields;
    const d = blankDeal();
    // Keep deal-level controls from the previous deal? No: a new package starts clean.
    for (const [k, v] of Object.entries(f)) if (k in d) d[k] = v.value;
    if (f.operators && f.operators.igShare >= 0.5) d.igOperators = true;
    d.name = (f.seller && f.seller.value.replace(/,?\s+(LLC|L\.L\.C\.|LP|L\.P\.|Inc\.?)$/i, '')) ||
      (f.basins ? f.basins.list.join(' / ') + ' package' : '') || ('Package ' + new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    S.deal = d; S.parsed = { fields: f, missing: res.missing }; S.edited = {}; S.text = text; S.currentId = null;
    const n = Object.keys(f).length;
    status(`Parsed ${label}: ${n} fields found, ${res.missing.length} key fields missing.`, 'ok');
    renderReview();
    schedule();
    setView('review');
  }

  // ---------- review ----------
  function fieldConf(k) {
    if (S.edited[k]) return ['edited', 'Edited'];
    const pf = S.parsed && S.parsed.fields[k];
    if (pf) return [pf.conf, pf.inferred ? 'Inferred' : pf.derived ? 'Derived' : pf.conf === 'high' ? 'High' : pf.conf === 'medium' ? 'Med' : 'Low'];
    return ['missing', 'Missing'];
  }
  function srcHtml(k) {
    const pf = S.parsed && S.parsed.fields[k];
    if (!pf || !pf.src) return '';
    return `<div class="src">${esc(pf.src.before)}<mark>${esc(pf.src.match)}</mark>${esc(pf.src.after)}</div>`;
  }

  function renderReview() {
    const d = S.deal;
    const missing = KEY_FIELDS.filter((k) => d[k] === null || d[k] === undefined || d[k] === '');
    const mc = $('#missingCount');
    mc.hidden = !missing.length || !S.parsed; mc.textContent = missing.length;
    const notes = (S.result && S.result.notes) || [];
    let h = '';
    if (!S.parsed && !hasData()) h += `<div class="flag info">Nothing parsed yet. Use Ingest, or type values below.</div>`;
    if (S.parsed && missing.length) h += `<div class="flag">⚠ Missing: ${missing.map((k) => labelOf(k)).join(', ')}. Defaults are used where needed; type a value to override.</div>`;
    h += `<div id="calNotes">${notes.map((n) => `<div class="flag info">${esc(n)}</div>`).join('')}</div>`;
    h += `<div class="section-title">Model controls</div>
      ${row('ask', 'Your bid (or seller ask)', 'money', 'Blank = use max bid. Click a row in the Bid ladder to set it.')}
      ${selRow('calibMode', 'Volumes from', [['auto', 'Auto'], ['ntm', 'Back-solve from NTM CF'], ['production', 'Stated production']])}
      ${row('pdnpOnline', 'PDNP online month', 'num', 'Month 1 = next month')}
      ${row('pdnpRisk', 'PDNP risk (realization)', 'pct')}
      ${selRow('pdpSource', 'PDP value', [['modeled', 'Modeled PV10'], ['teaser', 'Teaser PV10']])}
      ${selRow('pdnpSource', 'PDNP value', [['auto', 'Teaser if given, else modeled'], ['modeled', 'Modeled PV10'], ['teaser', 'Teaser PV10']])}
      ${row('topOpShare', 'Top operator share', 'pct', 'Share of NTM CF from the largest operator')}
      <div class="field"><label class="chk"><input type="checkbox" data-k="payHistory" ${d.payHistory ? 'checked' : ''}> 12–24 months of pay history</label></div>
      <div class="field"><label class="chk"><input type="checkbox" data-k="igOperators" ${d.igOperators ? 'checked' : ''}> Large / IG operators${S.parsed && S.parsed.fields.operators && S.parsed.fields.operators.igShare >= 0.5 && !S.edited.igOperators ? ' <span class="conf medium">suggested</span>' : ''}</label></div>
      <div class="field"><label class="chk"><input type="checkbox" data-k="cleanTitle" ${d.cleanTitle ? 'checked' : ''}> Clean title / division orders in place</label></div>
      <div class="row" style="margin:10px 0 4px"><button class="btn sm" id="btnFit" ${d.pvPDP > 0 ? '' : 'disabled'}>Fit PDP decline to teaser PDP PV10</button><span class="small muted" id="fitMsg"></span></div>`;
    for (const grp of REVIEW) {
      h += `<div class="section-title">${grp.g}</div>`;
      for (const it of grp.items) h += reviewRow(it);
    }
    $('#paneReview').innerHTML = h;
    bindDealInputs($('#paneReview'));
    const fit = $('#btnFit');
    if (fit) fit.onclick = () => {
      const De = M.fitDecline(S.deal, S.A);
      if (De === null) return;
      S.deal.decline = De; S.edited.decline = true;
      renderReview(); schedule();
      $('#fitMsg').textContent = `Decline set to ${fmtPct(De)}`;
    };
  }
  function labelOf(k) { for (const g of REVIEW) for (const it of g.items) if (it.k === k) return it.l; return k; }

  function reviewRow(it) {
    const v = S.deal[it.k];
    const [c, cl] = fieldConf(it.k);
    const empty = v === null || v === undefined || v === '';
    const assumed = empty && it.assumeKey ? `<span class="conf assumed">Default ${show('pct', S.A[it.assumeKey])}</span>` : '';
    const badge = empty && assumed ? assumed : `<span class="conf ${c}">${cl}</span>`;
    if (it.t === 'text') {
      return `<div class="field text ${empty ? 'missing' : ''}" data-row="${it.k}"><label>${esc(it.l)} ${badge}</label>
        <input type="text" data-k="${it.k}" data-t="text" value="${esc(v ?? '')}" placeholder="—">${srcHtml(it.k)}</div>`;
    }
    return `<div class="field ${empty ? 'missing' : ''}" data-row="${it.k}"><label>${esc(it.l)} ${badge}</label>
      <input class="num" type="text" inputmode="decimal" data-k="${it.k}" data-t="${it.t}" ${it.dp !== undefined ? `data-dp="${it.dp}"` : ''} value="${esc(show(it.t, v, it.dp))}" placeholder="—">${srcHtml(it.k)}</div>`;
  }
  function row(k, l, t, hint) {
    return `<div class="field"><label>${esc(l)}</label><input class="num" type="text" inputmode="decimal" data-k="${k}" data-t="${t}" value="${esc(show(t, S.deal[k]))}" placeholder="—">${hint ? `<div class="hint">${esc(hint)}</div>` : ''}</div>`;
  }
  function selRow(k, l, opts) {
    return `<div class="field"><label>${esc(l)}</label><select data-k="${k}" data-t="select">${opts.map(([v, t]) => `<option value="${v}" ${S.deal[k] === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>`;
  }

  function bindDealInputs(root) {
    $$('[data-k]', root).forEach((el) => {
      const k = el.dataset.k, t = el.dataset.t;
      if (el.type === 'checkbox') { el.onchange = () => { S.deal[k] = el.checked; S.edited[k] = true; schedule(); }; return; }
      if (t === 'select') { el.onchange = () => { S.deal[k] = el.value; schedule(); }; return; }
      el.oninput = () => {
        S.deal[k] = t === 'text' ? el.value : parseInput(t, el.value);
        S.edited[k] = true;
        schedule();
      };
      el.onblur = () => { if (t !== 'text') el.value = show(t, S.deal[k], el.dataset.dp ? +el.dataset.dp : undefined); renderReviewBadgesFor(k); };
    });
  }
  function renderReviewBadgesFor(k) {
    const rowEl = $(`#paneReview [data-row="${k}"]`);
    if (!rowEl) return;
    const it = REVIEW.flatMap((g) => g.items).find((x) => x.k === k);
    const tmp = document.createElement('div');
    tmp.innerHTML = reviewRow(it);
    const lbl = $('label', rowEl), nl = $('label', tmp.firstElementChild);
    if (lbl && nl) lbl.innerHTML = nl.innerHTML;
    rowEl.classList.toggle('missing', S.deal[k] === null || S.deal[k] === '');
  }
  function renderReviewBadges() {
    const notes = (S.result && S.result.notes) || [];
    const el = $('#calNotes');
    if (el) el.innerHTML = notes.map((n) => `<div class="flag info">${esc(n)}</div>`).join('');
    const fit = $('#btnFit');
    if (fit) fit.disabled = !(S.deal.pvPDP > 0);
  }

  // ---------- inputs (assumptions) ----------
  function renderInputs() {
    const A = S.A, D = M.DEFAULT_ASSUMPTIONS;
    let h = `<div class="row" style="justify-content:space-between;margin-bottom:6px"><span class="small muted">Saved in this browser. Blue = changed from default.</span><button class="btn sm danger" id="resetAll">Reset all</button></div>`;
    INPUTS.forEach((grp, gi) => {
      h += `<div class="section-title">${grp.g}<span class="sp"></span><button class="btn sm ghost" data-reset="${gi}">Reset</button></div>`;
      if (grp.strip) {
        h += `<div class="small muted" style="margin-bottom:6px">NYMEX strip, calendar-year average · as of <input type="text" data-a="stripAsOf" value="${esc(A.stripAsOf)}" style="width:110px;display:inline-block;padding:3px 6px"></div>
          <table class="t" id="stripTbl"><thead><tr><th>Year</th><th>WTI $/bbl</th><th>HH $/mcf</th><th></th></tr></thead><tbody>
          ${A.strip.map((r, i) => `<tr><td><input type="text" class="num" data-strip="${i}" data-f="year" value="${r.year}" style="width:64px;text-align:left"></td>
            <td><input type="text" class="num ${chg(r.oil, D.strip[i] && D.strip[i].oil)}" data-strip="${i}" data-f="oil" value="${r.oil.toFixed(2)}"></td>
            <td><input type="text" class="num ${chg(r.gas, D.strip[i] && D.strip[i].gas)}" data-strip="${i}" data-f="gas" value="${r.gas.toFixed(3)}"></td>
            <td><button class="btn sm ghost" data-strip-del="${i}" title="Remove year">×</button></td></tr>`).join('')}
          </tbody></table><div class="row" style="margin:6px 0 4px"><button class="btn sm" id="stripAdd">+ Add year</button></div>`;
      }
      for (const [k, l, t, extra] of grp.keys) {
        const changed = JSON.stringify(A[k]) !== JSON.stringify(D[k]);
        if (t === 'select') {
          h += `<div class="field"><label>${changed ? '<span class="dot"></span>' : ''}${esc(l)}</label><select data-a="${k}" class="${changed ? 'changed' : ''}">${extra.map(([v, tt]) => `<option value="${v}" ${A[k] === v ? 'selected' : ''}>${esc(tt)}</option>`).join('')}</select></div>`;
        } else {
          h += `<div class="field"><label>${changed ? '<span class="dot"></span>' : ''}${esc(l)}</label><input class="num ${changed ? 'changed' : ''}" type="text" inputmode="decimal" data-a="${k}" data-t="${t}" data-dp="${extra ?? ''}" value="${esc(show(t, A[k], extra))}"></div>`;
        }
      }
      if (grp.grid) {
        h += `<div class="small muted" style="margin:10px 0 6px">Margin grid (over SOFR) by utilization</div><table class="t"><thead><tr><th>Utilization ≤</th><th>Margin</th></tr></thead><tbody>
          ${A.grid.map((r, i) => `<tr><td><input type="text" class="num" data-grid="${i}" data-f="upTo" value="${show('pct', r.upTo)}" style="text-align:left;width:80px"></td><td><input type="text" class="num" data-grid="${i}" data-f="margin" value="${show('pct', r.margin, 2)}"></td></tr>`).join('')}
          </tbody></table>`;
      }
      if (grp.tests) {
        h += `<table class="t" style="margin-top:8px"><thead><tr><th>Test</th><th>Pass</th><th>Warn</th><th>Wt</th></tr></thead><tbody>
          ${A.tests.map((t, i) => `<tr><td class="txt">${esc(t.label)}</td>${t.dir === 'bool' ? '<td class="txt" colspan="2" style="text-align:center;color:var(--dim)">checkbox</td>' :
            `<td><input type="text" class="num" data-test="${i}" data-f="pass" value="${esc(testShow(t, t.pass))}" style="width:64px"></td><td><input type="text" class="num" data-test="${i}" data-f="warn" value="${esc(testShow(t, t.warn))}" style="width:64px"></td>`}
            <td><input type="text" class="num" data-test="${i}" data-f="w" value="${t.w}" style="width:44px"></td></tr>`).join('')}
          </tbody></table><div class="foot">Pass = full weight, warn = half, fail or missing = zero. ≥ for higher-is-better tests, ≤ for decline and operator concentration.</div>`;
      }
    });
    $('#paneInputs').innerHTML = h;
    const root = $('#paneInputs');
    $$('[data-a]', root).forEach((el) => {
      const k = el.dataset.a, t = el.dataset.t;
      const apply = () => {
        if (el.tagName === 'SELECT' || k === 'stripAsOf') S.A[k] = el.value;
        else { const v = parseInput(t === 'usd' ? 'num' : t, el.value); if (v !== null) S.A[k] = v; }
        schedule();
      };
      el.oninput = apply; el.onchange = () => { apply(); renderInputs(); };
    });
    $$('[data-strip]', root).forEach((el) => {
      el.oninput = () => { const v = parseFloat(el.value); if (isFinite(v)) { S.A.strip[+el.dataset.strip][el.dataset.f] = v; schedule(); } };
      el.onchange = () => renderInputs();
    });
    $$('[data-strip-del]', root).forEach((b) => (b.onclick = () => { if (S.A.strip.length > 1) { S.A.strip.splice(+b.dataset.stripDel, 1); renderInputs(); schedule(); } }));
    const add = $('#stripAdd');
    if (add) add.onclick = () => { const l = S.A.strip[S.A.strip.length - 1]; S.A.strip.push({ year: l.year + 1, oil: l.oil, gas: l.gas }); renderInputs(); schedule(); };
    $$('[data-grid]', root).forEach((el) => {
      el.oninput = () => { const v = parseInput('pct', el.value); if (v !== null) { S.A.grid[+el.dataset.grid][el.dataset.f] = v; schedule(); } };
    });
    $$('[data-test]', root).forEach((el) => {
      el.oninput = () => {
        const t = S.A.tests[+el.dataset.test], f = el.dataset.f;
        const v = f === 'w' ? parseFloat(el.value) : testParse(t, el.value);
        if (v !== null && isFinite(v)) { t[f] = v; schedule(); }
      };
    });
    $$('[data-reset]', root).forEach((b) => (b.onclick = () => {
      const grp = INPUTS[+b.dataset.reset];
      grp.keys.forEach(([k]) => (S.A[k] = clone(M.DEFAULT_ASSUMPTIONS[k])));
      if (grp.strip) { S.A.strip = clone(M.DEFAULT_ASSUMPTIONS.strip); S.A.stripAsOf = M.DEFAULT_ASSUMPTIONS.stripAsOf; }
      if (grp.grid) S.A.grid = clone(M.DEFAULT_ASSUMPTIONS.grid);
      if (grp.tests) S.A.tests = clone(M.DEFAULT_ASSUMPTIONS.tests);
      renderInputs(); schedule();
    }));
    $('#resetAll').onclick = () => { if (confirm('Reset every assumption to its default?')) { S.A = clone(M.DEFAULT_ASSUMPTIONS); renderInputs(); renderReview(); schedule(); } };
  }
  const chg = (a, b) => (b !== undefined && Math.abs(a - b) > 1e-9 ? 'changed' : '');
  function testShow(t, v) { return t.fmt === 'pct' ? show('pct', v) : t.fmt === 'money' ? fmtMoney(v) : String(v); }
  function testParse(t, s) { return t.fmt === 'pct' ? parseInput('pct', s) : t.fmt === 'money' ? parseInput('money', s) : parseFloat(s); }

  // ---------- deals ----------
  function deals() { return store.get(LS.deals, []); }
  function saveDeal() {
    if (!hasData()) { alert('Nothing to save yet. Ingest a teaser first.'); return; }
    const r = S.result, list = deals();
    const id = S.currentId || ('d' + Date.now().toString(36));
    const rec = {
      id, name: S.deal.name || 'Untitled deal', date: new Date().toISOString(),
      verdict: r.verdict.verdict, score: r.score.score, maxBid: r.metrics.maxBid, ask: r.metrics.ask,
      ntmCF: S.deal.ntmCF, yieldNTM: r.metrics.yieldNTM, irr: r.metrics.irrTotal, bb: r.bb.base, equity: r.stack.equity,
      deal: clone(S.deal), A: clone(S.A), parsed: S.parsed, edited: S.edited, text: S.text
    };
    const i = list.findIndex((x) => x.id === id);
    if (i >= 0) list[i] = rec; else list.unshift(rec);
    store.set(LS.deals, list);
    S.currentId = id; persist();
    renderDeals();
    flash('#btnSave', 'Saved ✓');
  }
  function flash(sel, txt) { const b = $(sel); const o = b.textContent; b.textContent = txt; setTimeout(() => (b.textContent = o), 1200); }
  function renderDeals() {
    const list = deals();
    const toneOf = (v) => ({ Financeable: 'good', Borderline: 'warn', Pass: 'bad', 'Development story': 'dev' }[v] || 'none');
    $('#paneDeals').innerHTML = `
      <div class="row" style="margin-bottom:10px"><button class="btn sm" id="expCsv">Export CSV</button><button class="btn sm" id="expJson">Export JSON</button>
      <button class="btn sm" id="impJson">Import JSON</button><span style="flex:1"></span><button class="btn sm" id="btnPrint2">Print summary</button></div>
      ${list.length ? `<div class="tscroll"><table class="t deal-list"><thead><tr><th>Deal</th><th>Date</th><th>Verdict</th><th>Max bid</th><th></th></tr></thead><tbody>
        ${list.map((d) => `<tr data-id="${d.id}" ${d.id === S.currentId ? 'style="background:rgba(52,211,153,.05)"' : ''}><td class="txt" style="max-width:130px;overflow:hidden;text-overflow:ellipsis">${esc(d.name)}</td>
          <td>${new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
          <td class="txt"><span class="pill ${{ good: 'pass', warn: 'warn', bad: 'fail', dev: 'missing' }[toneOf(d.verdict)]}" style="${toneOf(d.verdict) === 'dev' ? 'color:var(--violet);background:var(--dev-bg)' : ''}">${esc(d.verdict)}</span></td>
          <td>${fmtMoney(d.maxBid)}</td>
          <td><div class="acts"><button class="btn sm" data-load="${d.id}">Open</button><button class="btn sm ghost danger" data-del="${d.id}" title="Delete">×</button></div></td></tr>`).join('')}
        </tbody></table></div>` : '<div class="empty">No saved deals yet.<br><span class="small">Hit Save in the top bar to add the current deal.</span></div>'}
      <input type="file" id="impFile" accept="application/json,.json" hidden>`;
    $$('[data-load]').forEach((b) => (b.onclick = () => loadDeal(b.dataset.load)));
    $$('[data-del]').forEach((b) => (b.onclick = () => {
      if (!confirm('Delete this deal?')) return;
      store.set(LS.deals, deals().filter((x) => x.id !== b.dataset.del));
      if (S.currentId === b.dataset.del) S.currentId = null;
      renderDeals();
    }));
    $('#expCsv').onclick = exportCsv;
    $('#expJson').onclick = () => download('cedar-creek-deals.json', JSON.stringify(deals(), null, 2), 'application/json');
    $('#impJson').onclick = () => $('#impFile').click();
    $('#impFile').onchange = async (e) => {
      try {
        const arr = JSON.parse(await e.target.files[0].text());
        if (!Array.isArray(arr)) throw new Error('Expected a JSON array of deals.');
        const list = deals(); arr.forEach((d) => { if (d && d.id && !list.some((x) => x.id === d.id)) list.push(d); });
        store.set(LS.deals, list); renderDeals();
      } catch (err) { alert('Import failed: ' + err.message); }
    };
    $('#btnPrint2').onclick = doPrint;
  }
  function loadDeal(id) {
    const d = deals().find((x) => x.id === id);
    if (!d) return;
    S.deal = Object.assign(blankDeal(), d.deal); S.parsed = d.parsed || null; S.edited = d.edited || {}; S.text = d.text || ''; S.currentId = d.id;
    if (d.A && confirm('Also load the assumptions saved with this deal? (Cancel keeps your current assumptions.)')) S.A = Object.assign(clone(M.DEFAULT_ASSUMPTIONS), d.A);
    renderAll(); setView(mq.matches ? 'analysis' : 'review');
  }
  function exportCsv() {
    const cols = ['name', 'date', 'verdict', 'score', 'maxBid', 'ask', 'ntmCF', 'yieldNTM', 'irr', 'bb', 'equity'];
    const q = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const lines = [cols.join(',')].concat(deals().map((d) => cols.map((c) => q(c === 'score' || c === 'yieldNTM' || c === 'irr' ? (d[c] === null || d[c] === undefined ? '' : (+d[c]).toFixed(4)) : c === 'date' ? d.date.slice(0, 10) : (typeof d[c] === 'number' ? Math.round(d[c]) : d[c]))).join(',')));
    download('cedar-creek-deals.csv', lines.join('\n'), 'text/csv');
  }
  function download(name, content, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ---------- analysis ----------
  const charts = {};
  const C = { pdp: '#34d399', pdnp: '#22d3ee', deck: '#fbbf24', ask: '#f87171', pud: '#60a5fa', up: '#a78bfa', grid: 'rgba(255,255,255,.05)', text: '#8592a6' };

  function analysisSkeleton() {
    $('#analysis').innerHTML = `
      <div class="card wide" id="cardSummary"></div>
      <div class="card wide"><h3>Bid ladder · what you pay at each PV rate, and what you earn<span class="sp"></span><span class="seg" id="basisTog"><button data-b="total">PDP + PDNP</button><button data-b="pdp">PDP only</button></span></h3>
        <div id="ladderLead" class="lead"></div><div class="tscroll" id="ladder"></div>
        <div class="row solver"><span class="small muted">Bid that earns a</span><input id="targetLev" class="num" type="text" inputmode="decimal" style="width:70px"><span class="small muted">levered IRR:</span><b class="mono" id="solveOut">—</b><button class="btn sm" id="solveUse">Use as bid</button></div>
        <div class="foot" id="ladderFoot"></div></div>
      <div class="card wide"><h3>Scenarios · bid at strip PV, outcome if prices move<span class="sp"></span><span class="seg" id="scenTog"><button data-s="leveredIRR">Levered IRR</button><button data-s="unleveredIRR">Unlevered</button><button data-s="yieldY1">Yr-1 yield</button><button data-s="leveredYieldY1">Equity CoC</button></span></h3>
        <div class="tscroll" id="matrix"></div><div class="foot" id="matrixFoot"></div></div>
      <div class="card"><h3>Unlevered returns at your bid</h3><div id="returns"></div></div>
      <div class="card"><h3>RBL borrowing base</h3><div id="rbl"></div></div>
      <div class="card wide"><h3>Monthly net cash flow<span class="sp"></span><span class="seg" id="cfRange"><button data-r="60">5y</button><button data-r="120">10y</button><button data-r="360">30y</button></span></h3><div class="chart-box tall"><canvas id="chCF"></canvas></div></div>
      <div class="card"><h3>Production (Boe/d)<span class="sp"></span><span class="seg" id="logTog"><button data-l="0">Linear</button><button data-l="1">Log</button></span></h3><div class="chart-box"><canvas id="chProd"></canvas></div></div>
      <div class="card"><h3>PV vs. discount rate</h3><div class="chart-box"><canvas id="chPV"></canvas></div></div>
      <div class="card"><h3>Bid build</h3><div class="chart-box"><canvas id="chWF"></canvas></div></div>
      <div class="card"><h3>Capital stack</h3><div class="chart-box short"><canvas id="chStack"></canvas></div><div id="stackLegend" class="small" style="margin-top:8px"></div></div>
      <div class="card"><h3>Financeability scorecard</h3><div id="score"></div></div>
      <div class="card"><h3>Valuation</h3><div id="valuation"></div></div>
      <div class="card wide"><h3>Sensitivity · strip × decline<span class="sp"></span><span class="seg" id="heatTog"><button data-h="maxBid">Max bid</button><button data-h="yield">NTM yield</button></span></h3><div class="tscroll" id="heat"></div></div>
      <div class="card wide"><details id="annualWrap"><summary>Annual table</summary><div class="tscroll" id="annual" style="margin-top:10px"></div></details></div>`;
    $$('#cfRange button').forEach((b) => (b.onclick = () => { S.cfRange = +b.dataset.r; renderAnalysis(); persist(); }));
    $$('#logTog button').forEach((b) => (b.onclick = () => { S.logProd = b.dataset.l === '1'; renderAnalysis(); persist(); }));
    $$('#heatTog button').forEach((b) => (b.onclick = () => { S.heat = b.dataset.h; renderAnalysis(); persist(); }));
    $$('#basisTog button').forEach((b) => (b.onclick = () => { S.basis = b.dataset.b; recompute(); }));
    $$('#scenTog button').forEach((b) => (b.onclick = () => { S.scen = b.dataset.s; renderMatrix(); persist(); }));
    const tl = $('#targetLev');
    tl.value = show('pct', S.targetLev);
    tl.oninput = () => { const v = parseInput('pct', tl.value); if (v !== null) { S.targetLev = v; renderSolver(); persist(); } };
    tl.onblur = () => { tl.value = show('pct', S.targetLev); };
    $('#solveUse').onclick = () => { if (S.solved) setBid(S.solved); };
  }

  function renderAnalysis() {
    if (!$('#chCF')) analysisSkeleton();
    const r = S.result, m = r.metrics, v = r.valuation, ok = hasData();
    $$('#cfRange button').forEach((b) => b.classList.toggle('on', +b.dataset.r === S.cfRange));
    $$('#logTog button').forEach((b) => b.classList.toggle('on', (b.dataset.l === '1') === S.logProd));
    $$('#heatTog button').forEach((b) => b.classList.toggle('on', b.dataset.h === S.heat));

    // Summary bar with ask input
    const sum = $('#cardSummary');
    if (!$('#askMain')) {
      sum.innerHTML = `<div class="ask-row" style="flex-wrap:wrap;gap:14px">
        <div><div class="small muted" style="margin-bottom:4px">YOUR BID <span style="color:var(--dim)">(or seller's ask)</span></div><input id="askMain" class="num" type="text" inputmode="decimal" placeholder="blank = max bid">
          <div class="row quick" style="margin-top:6px"><button class="btn sm" data-q="0.10">PV10</button><button class="btn sm" data-q="0.12">PV12</button><button class="btn sm" data-q="0.15">PV15</button><button class="btn sm" data-q="max">Max bid</button><button class="btn sm ghost" data-q="clear">Clear</button></div></div>
        <div id="sumLine" class="small" style="flex:1;min-width:220px;color:var(--muted)"></div></div>`;
      const a = $('#askMain');
      a.oninput = () => { S.deal.ask = parseInput('money', a.value); S.edited.ask = true; schedule(); const ra = $('#paneReview [data-k="ask"]'); if (ra) ra.value = a.value; };
      a.onblur = () => { a.value = show('money', S.deal.ask); };
      $$('#cardSummary [data-q]').forEach((b) => (b.onclick = () => {
        const q = b.dataset.q, r0 = S.result;
        if (q === 'clear') setBid(null);
        else if (q === 'max') setBid(r0.metrics.maxBid);
        else setBid(M.pvMonthly(+q, S.basis === 'pdp' ? r0.streams.pdp.net : r0.streams.total));
      }));
    }
    const a = $('#askMain');
    if (document.activeElement !== a) a.value = show('money', S.deal.ask);
    $('#sumLine').innerHTML = ok
      ? `<span class="mono" style="color:var(--text)">${esc(S.deal.name || 'Untitled')}</span> · ${esc([S.deal.basins, S.deal.states].filter(Boolean).join(' · ') || 'basin n/a')}${S.deal.nra ? ` · <span class="mono">${fmtNum(S.deal.nra)}</span> NRA` : ''}${S.deal.bidDate ? ` · bids due ${esc(S.deal.bidDate)}` : ''}<br>
         Volumes: ${r.cal.R.mode === 'ntm' ? `back-solved from NTM CF ${fmtMoney(S.deal.ntmCF)} (PDP ${fmtPct(r.cal.R.share, 0)})` : `stated production ${fmtNum(S.deal.prodBoed)} Boe/d`} · PDP <span class="mono">${fmtNum(r.cal.qPDP, 0)}</span> Boe/d, PDNP <span class="mono">${fmtNum(r.cal.qPDNP, 0)}</span> Boe/d at month ${r.cal.R.online}, risked ${fmtPct(r.cal.R.risk, 0)} · decline ${fmtPct(r.cal.R.De, 0)}`
      : 'Ingest a teaser to see the analysis.';

    // Returns
    $('#returns').innerHTML = kv([
      ['Price used', (m.ask ? 'Your bid ' : 'Max bid ') + fmtMoney(m.price), true],
      ['NTM cash flow (risked)', fmtMoney(m.ntmTotal)],
      ['NTM cash yield', fmtPct(m.yieldNTM), true],
      ['PDP-only yield', fmtPct(m.yieldPDP)],
      ['Implied PV rate (total)', fmtPct(m.irrTotal), true],
      ['Implied PV rate (PDP only)', fmtPct(m.irrPDP)],
      ['Payback', m.payback ? `${Math.round(m.payback)} mo` : 'not reached'],
      ['Price / NTM CF', fmtX(m.multiple)],
      ['$ / flowing Boe/d', m.perFlowing ? '$' + fmtNum(m.perFlowing) : '—'],
      ['PDP reserves', fmtBoe(m.reservesPDP)],
      ['R/P (PDP)', fmtYrs(m.rp)],
      ['Oil weight (Boe / revenue)', `${fmtPct(m.oilWeight, 0)} / ${fmtPct(m.oilRevWeight, 0)}`],
      ...(m.ltm ? [['LTM CF (teaser)', fmtMoney(m.ltm)]] : [])
    ]) + `<div class="foot">Yields and implied rates use modeled PDP + risked PDNP cash flow; PUD and upside carry no modeled cash flow.</div>`;

    // RBL
    const bb = r.bb, st = r.stack;
    $('#rbl').innerHTML = kv([
      ['Reserves test', `${fmtMoney(bb.reserves)}${bb.binding === 'Reserves' ? ' ◂' : ''}`, bb.binding === 'Reserves'],
      ['Leverage test', `${fmtMoney(bb.leverage)}${bb.binding === 'Leverage' ? ' ◂' : ''}`, bb.binding === 'Leverage'],
      ['Borrowing base', fmtMoney(bb.base), true],
      ['Draw (' + fmtPct(S.A.targetDraw, 0) + ' target)', fmtMoney(st.draw)],
      ['Utilization → margin', `${fmtPct(st.util, 0)} → ${fmtPct(st.margin, 2)}`],
      ['All-in rate', fmtPct(st.rate, 2)],
      ['Year-1 interest + fees', fmtMoney(st.interest)],
      ['Equity check', fmtMoney(st.equity), true],
      ['Loan-to-price', fmtPct(r.lev.ltv, 0)],
      ['Levered IRR (' + fmtPct(S.A.sweepPct, 0) + ' sweep, ' + S.A.maturityYears + '-yr term)', r.lev.fullyFinanced ? 'n/m' : fmtPct(r.lev.leveredIRR), true],
      ['Levered cash-on-cash', fmtPct(st.leveredCoC)],
      ['DSCR (EBITDA / interest)', fmtX(st.dscr)],
      ['Debt / EBITDA', fmtX(st.debtEbitda)]
    ]) + `<div class="foot">Reserves test: PDP PV${Math.round(S.A.bbRate * 100)} at bank deck × ${fmtPct(S.A.advPDP, 0)} + PDNP × ${fmtPct(S.A.advPDNP, 0)} + PUD × ${fmtPct(S.A.advPUD, 0)}. Leverage test: NTM EBITDA at deck (${fmtMoney(bb.ebitdaDeck)}, after G&A) × ${S.A.maxLeverage.toFixed(1)}x. Bank deck = ${fmtPct(S.A.deckOil, 0)} / ${fmtPct(S.A.deckGas, 0)} of strip.
      Advance rates and bank decks are lender-internal rules of thumb informed by 2026 filings (Kimbell, WhiteHawk, Presidio, Black Stone), not filed terms.</div>`;

    // Scorecard
    $('#score').innerHTML = `<table class="t score-t"><tbody>${r.score.rows.map((t) => `<tr><td class="txt">${esc(t.label)}</td><td>${t.dir === 'bool' ? (t.value ? 'yes' : 'no') : fmtTest(t, t.value)}</td>
      <td class="thr" style="color:var(--dim)">${t.dir === 'bool' ? '' : (t.dir === 'hi' ? '≥' : '≤') + fmtTest(t, t.pass)}</td><td><span class="pill ${t.status}">${t.status}</span></td><td class="pts" style="color:var(--dim)">${t.pts % 1 ? t.pts.toFixed(1) : t.pts}/${t.w}</td></tr>`).join('')}
      <tr><td class="txt" style="font-weight:600">Score</td><td colspan="4" style="font-weight:700;color:var(--text)">${fmtPct(r.score.score, 0)} · ${r.score.points.toFixed(1)}/${r.score.total}</td></tr></tbody></table>`;

    // Valuation
    $('#valuation').innerHTML = `<div class="tscroll"><table class="t"><thead><tr><th>Rate</th><th>PDP</th><th>PDNP (risked)</th><th>Total</th></tr></thead><tbody>
      ${r.pvTable.map((x) => `<tr ${Math.abs(x.rate - 0.1) < 1e-9 ? 'style="color:var(--text);font-weight:600"' : ''}><td class="txt">PV${Math.round(x.rate * 100)}</td><td>${fmtMoney(x.pdp)}</td><td>${fmtMoney(x.pdnp)}</td><td>${fmtMoney(x.total)}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="kv" style="margin-top:10px">
        <div>PDP PV10 used</div><div>${fmtMoney(v.vPDP)} <span class="muted small">${v.pdpSrc}</span></div>
        <div>PDNP PV10 used</div><div>${fmtMoney(v.vPDNP)} <span class="muted small">${v.pdnpSrc}</span></div>
        <div>PUD / upside PV10 (teaser)</div><div>${fmtMoney(v.vPUD)} / ${fmtMoney(v.vUp)}</div>
        <div>PDP share of PV10</div><div class="em">${fmtPct(m.pdpSharePV, 0)}</div>
        ${S.deal.pvPDP ? `<div>Teaser PDP PV10 vs modeled</div><div>${fmtMoney(S.deal.pvPDP)} vs ${fmtMoney(v.pdpPV10m)}</div>` : ''}
      </div>`;

    renderLadder();
    renderMatrix();
    renderCharts();
    renderHeat();
    renderAnnual();
  }
  function fmtTest(t, v) { return t.fmt === 'pct' ? fmtPct(v, 0) : t.fmt === 'yrs' ? fmtYrs(v) : t.fmt === 'money' ? fmtMoney(v) : String(v ?? '—'); }
  function kv(rows) { return `<div class="kv">${rows.map(([k, v, em]) => `<div>${esc(k)}</div><div class="${em ? 'em' : ''}">${v}</div>`).join('')}</div>`; }

  // ---------- bid ladder & scenarios ----------
  function setBid(v) {
    S.deal.ask = v === null ? null : Math.round(v / 1e4) * 1e4;
    S.edited.ask = true;
    const a = $('#askMain'); if (a) a.value = show('money', S.deal.ask);
    const ra = $('#paneReview [data-k="ask"]'); if (ra) ra.value = show('money', S.deal.ask);
    recompute();
  }
  const pvLbl = (r) => 'PV' + Math.round(r * 100);
  const levTxt = (l) => (l.fullyFinanced ? 'n/m' : fmtPct(l.leveredIRR));
  function renderLadder() {
    const L = S.ladder, r = S.result, m = r.metrics;
    $$('#basisTog button').forEach((b) => b.classList.toggle('on', b.dataset.b === S.basis));
    if (!hasData()) { $('#ladder').innerHTML = '<div class="empty">Ingest a teaser to see the bid ladder.</div>'; $('#ladderLead').textContent = ''; $('#ladderFoot').textContent = ''; renderSolver(); return; }
    const near = (x) => Math.abs(x.price - m.price) <= Math.max(1e4, m.price * 0.004);
    const sel = L.find(near) || L.find((x) => Math.abs(x.rate - 0.10) < 1e-9);
    const x = sel, l = x.lev;
    $('#ladderLead').innerHTML = `At <b>${pvLbl(x.rate)}</b> you'd bid <b class="mono">${fmtMoney(x.price)}</b>: a <b>${fmtPct(x.unleveredIRR)}</b> unlevered return and <b>${fmtPct(x.yieldY1)}</b> year-1 cash yield.
      The RBL lends <b class="mono">${fmtMoney(l.draw)}</b> (${fmtPct(l.ltv, 0)} of price), so your equity is <b class="mono">${fmtMoney(l.equity)}</b>,
      earning <b>${fmtPct(l.leveredYieldY1)}</b> cash-on-cash in year 1 and a <b>${levTxt(l)}</b> levered IRR. Verdict at that price: <b>${esc(x.verdict)}</b>.`;
    const tone = { good: 'pass', warn: 'warn', bad: 'fail', dev: 'dev' };
    $('#ladder').innerHTML = `<table class="t ladder"><thead><tr><th>Bid at</th><th>Price</th><th class="hm">vs max bid</th><th>Yr-1 yield</th><th class="hm">Payback</th><th class="hm">RBL debt</th><th>Equity</th><th class="hm">Equity CoC yr 1</th><th>Lev. IRR</th><th class="hm">Verdict</th></tr></thead><tbody>
      ${L.map((x) => `<tr class="pick ${near(x) ? 'sel' : ''}" data-price="${x.price}" title="Click to bid ${fmtMoney(x.price)}"><td class="txt"><b>${pvLbl(x.rate)}</b></td><td><b>${fmtMoney(x.price)}</b></td>
        <td class="hm" style="color:${x.vsMaxBid > 0 ? 'var(--red)' : 'var(--accent)'}">${x.vsMaxBid > 0 ? '+' : '−'}${fmtMoney(Math.abs(x.vsMaxBid))}</td>
        <td>${fmtPct(x.yieldY1)}</td><td class="hm">${x.payback ? Math.round(x.payback) + ' mo' : '—'}</td><td class="hm">${fmtMoney(x.lev.draw)} <span class="muted small">${fmtPct(x.lev.ltv, 0)}</span></td>
        <td>${fmtMoney(x.lev.equity)}</td><td class="hm">${fmtPct(x.lev.leveredYieldY1)}</td><td><b>${levTxt(x.lev)}</b></td>
        <td class="txt hm"><span class="pill ${tone[x.tone]}">${esc(x.verdict)}</span></td></tr>`).join('')}
      </tbody></table>`;
    $$('#ladder tr.pick').forEach((tr) => (tr.onclick = () => setBid(+tr.dataset.price)));
    $('#ladderFoot').innerHTML = `Price = PV of ${S.basis === 'pdp' ? 'PDP' : 'PDP + risked PDNP'} cash flow at strip (mid-month), so the unlevered return equals the PV rate. PUD and upside carry no cash flow here, so at these prices they're free optionality.
      Debt = ${fmtPct(S.A.targetDraw, 0)} of the ${fmtMoney(r.bb.base)} borrowing base, capped at price. Levered IRR: interest at SOFR + grid, G&A ${fmtMoney(S.A.gaAnnual)}/yr while the loan is out, ${fmtPct(S.A.sweepPct, 0)} of remaining cash sweeps principal, balance repaid at year ${S.A.maturityYears}. Click a row to make it your bid.`;
    renderSolver();
  }
  function renderSolver() {
    const out = $('#solveOut');
    if (!out) return;
    if (!hasData()) { out.textContent = '—'; S.solved = null; return; }
    const p = M.bidForLeveredIRR(S.result, S.A, S.targetLev);
    S.solved = p;
    out.innerHTML = p ? `${fmtMoney(p)} <span class="muted small">≈ PV${(M.impliedRate(S.result.streams.total, p) * 100).toFixed(1)}</span>` : 'not reachable';
    $('#solveUse').disabled = !p;
  }
  function renderMatrix() {
    const X = S.matrix, k = S.scen, r = S.result;
    $$('#scenTog button').forEach((b) => b.classList.toggle('on', b.dataset.s === k));
    if (!hasData()) { $('#matrix').innerHTML = '<div class="empty">Ingest a teaser to see scenarios.</div>'; $('#matrixFoot').textContent = ''; return; }
    const hurdle = k === 'leveredIRR' ? S.targetLev : k === 'unleveredIRR' ? 0.10 : S.A.tests.find((t) => t.key === 'yield').pass;
    const all = X.rows.flatMap((row) => row.cells.map((c) => c[k])).filter((v) => v !== null && isFinite(v));
    const lo = Math.min(...all), hi = Math.max(...all);
    const color = (v) => {
      if (v === null || !isFinite(v)) return 'transparent';
      const good = v >= hurdle, span = good ? (hi - hurdle) || 1 : (hurdle - lo) || 1;
      const a = 0.08 + 0.42 * Math.min(1, Math.abs(v - hurdle) / span);
      return good ? `rgba(52,211,153,${a})` : `rgba(248,113,113,${a})`;
    };
    const m = r.metrics;
    const wti12 = M.sum(r.streams.prices.oil, 12) / 12;
    const near = (p) => Math.abs(p - m.price) <= Math.max(1e4, m.price * 0.004);
    $('#matrix').innerHTML = `<table class="t heat"><thead><tr><th style="text-align:left!important">Bid \\ Prices</th>${X.mults.map((x) => `<th>${x === 1 ? 'Strip' : (x < 1 ? '−' : '+') + Math.round(Math.abs(x - 1) * 100) + '%'}</th>`).join('')}</tr></thead><tbody>
      ${X.rows.map((row) => `<tr class="${near(row.price) ? 'selrow' : ''}"><th style="text-align:left!important;white-space:nowrap">${pvLbl(row.rate)} <span class="muted small mono">${fmtMoney(row.price)}</span></th>
        ${row.cells.map((c) => `<td class="${c.mult === 1 && near(row.price) ? 'base' : ''}" style="background:${color(c[k])}">${c[k] === null ? 'n/m' : fmtPct(c[k])}</td>`).join('')}</tr>`).join('')}
      </tbody></table>`;
    const label = { leveredIRR: 'levered IRR', unleveredIRR: 'unlevered return', yieldY1: 'year-1 cash yield on price', leveredYieldY1: 'year-1 cash-on-cash on equity' }[k];
    $('#matrixFoot').innerHTML = `Each row fixes the bid at that PV of the strip case; columns show the ${label} if realized oil and gas prices land at strip ±%. Green = at or above ${fmtPct(hurdle, 0)}${k === 'leveredIRR' ? ' (your target above)' : ''}.
      Volumes and the closing borrowing base stay at the base case. Next-12-month WTI at strip averages $${wti12.toFixed(2)}, so −20% ≈ $${(wti12 * 0.8).toFixed(0)}.`;
  }

  // ---------- charts ----------
  function baseOpts(extra) {
    return Object.assign({
      responsive: true, maintainAspectRatio: false, animation: { duration: 450, easing: 'easeOutQuart' },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: C.text, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'rectRounded', font: { family: 'Inter', size: 11 } } },
        tooltip: { backgroundColor: '#0c1016', borderColor: '#273141', borderWidth: 1, titleColor: '#e6edf5', bodyColor: '#c9d3e0', titleFont: { family: 'Inter', weight: '600' }, bodyFont: { family: 'JetBrains Mono', size: 11 }, padding: 10 }
      },
      scales: {}
    }, extra);
  }
  const axis = (cb, extra) => Object.assign({ grid: { color: C.grid, drawTicks: false }, border: { display: false }, ticks: { color: C.text, padding: 6, font: { family: 'JetBrains Mono', size: 10 }, callback: cb } }, extra);
  const mmTick = (v) => fmtMoney(v);
  function upsert(id, cfg) {
    const el = document.getElementById(id);
    if (!el || !window.Chart) return;
    let ch = charts[id];
    if (ch && ch.config.type !== cfg.type) { ch.destroy(); ch = null; }
    if (!ch) { charts[id] = new Chart(el.getContext('2d'), cfg); return; }
    ch.data.labels = cfg.data.labels;
    cfg.data.datasets.forEach((ds, i) => {
      if (ch.data.datasets[i]) { Object.assign(ch.data.datasets[i], ds); } else ch.data.datasets.push(ds);
    });
    ch.data.datasets.length = cfg.data.datasets.length;
    ch.options = cfg.options;
    ch.update();
  }

  function renderCharts() {
    if (!window.Chart) return;
    Chart.defaults.font.family = 'Inter';
    Chart.defaults.color = C.text;
    const r = S.result, s = r.streams, n = S.cfRange;
    const start = r.R.start;
    const lbl = [];
    for (let i = 0; i < n; i++) { const mm = (start.m + i) % 12, yy = start.y + Math.floor((start.m + i) / 12); lbl.push(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][mm] + ' ' + String(yy).slice(2)); }
    upsert('chCF', {
      type: 'bar',
      data: {
        labels: lbl,
        datasets: [
          { type: 'bar', label: 'PDP', data: s.pdp.net.slice(0, n), backgroundColor: 'rgba(52,211,153,.75)', stack: 'cf', barPercentage: 1, categoryPercentage: 0.92, order: 2 },
          { type: 'bar', label: 'PDNP (risked)', data: s.pdnp.net.slice(0, n), backgroundColor: 'rgba(34,211,238,.55)', stack: 'cf', barPercentage: 1, categoryPercentage: 0.92, order: 2 },
          { type: 'line', label: 'Bank deck (total)', data: r.deck.total.slice(0, n), borderColor: C.deck, borderWidth: 1.6, pointRadius: 0, tension: 0.25, order: 1 }
        ]
      },
      options: baseOpts({
        scales: { x: axis(undefined, { stacked: true, grid: { display: false }, ticks: { color: C.text, autoSkip: false, maxRotation: 0, font: { family: 'JetBrains Mono', size: 10 }, callback: function (v, i) { const step = mq.matches ? (n <= 60 ? 12 : n <= 120 ? 24 : 72) : (n <= 60 ? 6 : n <= 120 ? 12 : 36); return i % step === 0 ? this.getLabelForValue(v) : ''; } } }), y: axis(mmTick, { stacked: true }) },
        plugins: Object.assign(baseOpts().plugins, { tooltip: Object.assign(baseOpts().plugins.tooltip, { callbacks: { label: (c) => ` ${c.dataset.label}: ${fmtMoney(c.parsed.y)}` } }) })
      })
    });

    const yrs = r.annual.slice(0, 30);
    const logOn = S.logProd;
    const clampLog = (x) => (logOn ? (x > 0.5 ? x : null) : x);
    upsert('chProd', {
      type: 'line',
      data: {
        labels: yrs.map((a) => 'Y' + a.year),
        datasets: [
          { label: 'Total', data: yrs.map((a) => clampLog(a.boedPDP + a.boedPDNP)), borderColor: '#e6edf5', borderWidth: 1.8, pointRadius: 0, tension: 0.3, fill: false },
          { label: 'PDP', data: yrs.map((a) => clampLog(a.boedPDP)), borderColor: C.pdp, backgroundColor: 'rgba(52,211,153,.12)', borderWidth: 1.8, pointRadius: 0, tension: 0.3, fill: !logOn },
          { label: 'PDNP (risked)', data: yrs.map((a) => clampLog(a.boedPDNP)), borderColor: C.pdnp, borderWidth: 1.6, pointRadius: 0, tension: 0.3, borderDash: [4, 3], fill: false }
        ]
      },
      options: baseOpts({
        scales: { x: axis(undefined, { grid: { display: false }, ticks: { color: C.text, autoSkip: false, maxRotation: 0, font: { family: 'JetBrains Mono', size: 10 }, callback: function (v, i) { return i % 5 === 0 ? this.getLabelForValue(v) : ''; } } }), y: axis((v) => fmtNum(v), { type: logOn ? 'logarithmic' : 'linear', beginAtZero: !logOn }) },
        plugins: Object.assign(baseOpts().plugins, { tooltip: Object.assign(baseOpts().plugins.tooltip, { callbacks: { label: (c) => ` ${c.dataset.label}: ${fmtNum(c.parsed.y)} Boe/d` } }) })
      })
    });

    const m = r.metrics;
    const curve = r.pvCurve;
    const askLine = m.price;
    const pts = [];
    if (m.irrTotal !== null && m.irrTotal <= 0.4 && m.irrTotal >= 0) pts.push({ x: m.irrTotal * 100, y: askLine });
    upsert('chPV', {
      type: 'line',
      data: {
        datasets: [
          { label: 'Total PV', data: curve.map((c) => ({ x: c.rate * 100, y: c.total })), borderColor: '#e6edf5', borderWidth: 1.8, pointRadius: 0, tension: 0.3 },
          { label: 'PDP PV', data: curve.map((c) => ({ x: c.rate * 100, y: c.pdp })), borderColor: C.pdp, borderWidth: 1.6, pointRadius: 0, tension: 0.3 },
          { label: (m.ask ? 'Ask ' : 'Max bid ') + fmtMoney(askLine), data: [{ x: 0, y: askLine }, { x: 40, y: askLine }], borderColor: C.ask, borderDash: [5, 4], borderWidth: 1.4, pointRadius: 0 },
          { label: 'Implied rate', data: pts, borderColor: C.ask, backgroundColor: C.ask, pointRadius: 5, pointHoverRadius: 6, showLine: false }
        ]
      },
      options: baseOpts({
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        scales: { x: axis((v) => v + '%', { type: 'linear', min: 0, max: 40, grid: { display: false } }), y: axis(mmTick, { beginAtZero: true }) },
        plugins: Object.assign(baseOpts().plugins, { tooltip: Object.assign(baseOpts().plugins.tooltip, { callbacks: { title: (c) => (c[0] ? c[0].parsed.x.toFixed(1) + '% discount' : ''), label: (c) => ` ${c.dataset.label.split(' $')[0]}: ${fmtMoney(c.parsed.y)}` } }) })
      })
    });

    const v = r.valuation, b = v.bid;
    let run = 0;
    const steps = [['PDP', b.pdp, C.pdp], ['PDNP', b.pdnp, C.pdnp], ['PUD', b.pud, C.pud], ['Upside', b.upside, C.up]];
    const wf = steps.map(([l, val, col]) => { const s0 = run; run += val; return { l, d: [s0, run], col }; });
    wf.push({ l: 'Max bid', d: [0, v.maxBid], col: '#e6edf5' });
    if (m.ask) wf.push({ l: 'Ask', d: [0, m.ask], col: m.ask > v.maxBid ? C.ask : 'rgba(52,211,153,.9)' });
    const mults = [S.A.multPDP, S.A.multPDNP, S.A.multPUD, S.A.multUpside];
    upsert('chWF', {
      type: 'bar',
      data: { labels: wf.map((x) => x.l), datasets: [{ label: 'Bid build', data: wf.map((x) => x.d), backgroundColor: wf.map((x) => x.col), borderRadius: 4, borderSkipped: false, barPercentage: 0.7 }] },
      options: baseOpts({
        plugins: Object.assign(baseOpts().plugins, { legend: { display: false }, tooltip: Object.assign(baseOpts().plugins.tooltip, { callbacks: { label: (c) => { const d = c.raw; const i = c.dataIndex; return i < 4 ? ` ${fmtMoney(d[1] - d[0])}  (${[v.vPDP, v.vPDNP, v.vPUD, v.vUp].map((x) => fmtMoney(x))[i]} × ${mults[i]})` : ` ${fmtMoney(d[1])}`; } } }) }),
        scales: { x: axis(undefined, { grid: { display: false }, ticks: { color: C.text, maxRotation: 0, autoSkip: false, font: { family: 'Inter', size: mq.matches ? 10 : 11 } } }), y: axis(mmTick, { beginAtZero: true }) }
      })
    });

    const st = r.stack;
    upsert('chStack', {
      type: 'doughnut',
      data: { labels: ['RBL draw', 'Equity'], datasets: [{ data: [st.draw, st.equity], backgroundColor: ['#22d3ee', '#34d399'], borderColor: '#10151d', borderWidth: 3, hoverOffset: 4 }] },
      options: baseOpts({ cutout: '68%', interaction: { mode: 'nearest', intersect: true }, plugins: Object.assign(baseOpts().plugins, { legend: { display: false }, tooltip: Object.assign(baseOpts().plugins.tooltip, { callbacks: { label: (c) => ` ${c.label}: ${fmtMoney(c.raw)} (${fmtPct(c.raw / (st.draw + st.equity || 1), 0)})` } }) }) })
    });
    const tot = st.draw + st.equity || 1;
    $('#stackLegend').innerHTML = `<div class="kv"><div><span style="color:#22d3ee">●</span> RBL draw</div><div>${fmtMoney(st.draw)} · ${fmtPct(st.draw / tot, 0)}</div>
      <div><span style="color:#34d399">●</span> Equity</div><div>${fmtMoney(st.equity)} · ${fmtPct(st.equity / tot, 0)}</div>
      <div>Undrawn capacity</div><div>${fmtMoney(st.unused)}</div></div>`;
  }

  function renderHeat() {
    const sens = S.sens, mode = S.heat, A = S.A;
    const price = sens.price;
    const vals = sens.rows.flatMap((r) => r.cells.map((c) => (mode === 'maxBid' ? c.maxBid : c.yield)));
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const pivot = mode === 'maxBid' ? (S.result.metrics.ask || S.result.metrics.maxBid) : A.tests.find((t) => t.key === 'yield').pass;
    const color = (x) => {
      if (!isFinite(x)) return 'transparent';
      const good = x >= pivot;
      const span = good ? (hi - pivot) || 1 : (pivot - lo) || 1;
      const t = Math.min(1, Math.abs(x - pivot) / span);
      const a = 0.08 + 0.42 * t;
      return good ? `rgba(52,211,153,${a})` : `rgba(248,113,113,${a})`;
    };
    $('#heat').innerHTML = `<table class="t heat"><thead><tr><th>Decline Δ \\ Strip</th>${sens.mults.map((m) => `<th>×${m.toFixed(1)}</th>`).join('')}</tr></thead><tbody>
      ${sens.rows.map((r) => `<tr><th style="text-align:left!important">${r.delta === 0 ? 'Base' : (r.delta > 0 ? '+' : '−') + Math.abs(Math.round(r.delta * 100)) + ' pts'}</th>
        ${r.cells.map((c) => { const x = mode === 'maxBid' ? c.maxBid : c.yield; return `<td class="${r.delta === 0 && c.mult === 1 ? 'base' : ''}" style="background:${color(x)}">${mode === 'maxBid' ? fmtMoney(x) : fmtPct(x)}</td>`; }).join('')}</tr>`).join('')}
      </tbody></table><div class="foot">${mode === 'maxBid' ? `Green = max bid at or above ${S.result.metrics.ask ? 'the ask' : 'base max bid'} (${fmtMoney(pivot)}).` : `NTM yield at a fixed price of ${fmtMoney(price)}; green = at or above the ${fmtPct(pivot, 0)} pass line.`} Decline shifts apply to PDP and PDNP first-year declines. Volumes stay at the base calibration.</div>`;
  }

  function renderAnnual() {
    const r = S.result;
    $('#annual').innerHTML = `<table class="t"><thead><tr><th>Year</th><th>Boe/d</th><th>PDP CF</th><th>PDNP CF</th><th>Total CF</th><th>Bank-deck CF</th><th>WTI</th><th>HH</th></tr></thead><tbody>
      ${r.annual.filter((a) => a.totalCF > 0 || a.year <= 5).map((a) => `<tr><td class="txt">${a.year} <span class="muted small">${a.calYear}</span></td><td>${fmtNum(a.boedPDP + a.boedPDNP)}</td><td>${fmtMoney(a.pdpCF)}</td><td>${fmtMoney(a.pdnpCF)}</td><td>${fmtMoney(a.totalCF)}</td><td>${fmtMoney(a.deckCF)}</td><td>$${a.oil.toFixed(2)}</td><td>$${a.gas.toFixed(2)}</td></tr>`).join('')}
      </tbody></table>`;
  }

  // ---------- print ----------
  function doPrint() {
    buildPrint();
    setTimeout(() => window.print(), 60);
  }
  function buildPrint() {
    const r = S.result, m = r.metrics, st = r.stack, bb = r.bb;
    const img = (id) => (charts[id] ? `<img src="${charts[id].toBase64Image('image/png', 1)}" alt="">` : '');
    $('#print-sheet').innerHTML = `
      <h1>${esc(S.deal.name || 'Untitled deal')}</h1>
      <div class="sub">${esc([S.deal.seller, S.deal.basins, S.deal.counties, S.deal.states].filter(Boolean).join(' · '))}${S.deal.bidDate ? ' · Bids due ' + esc(S.deal.bidDate) : ''} · Cedar Creek Deal Screen · ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</div>
      <div class="vrow"><span class="vb">${esc(r.verdict.verdict)}</span><span><b>${fmtPct(r.score.score, 0)}</b> score · ${esc(r.verdict.reason)}</span></div>
      <div class="grid">
        ${[['Max bid', fmtMoney(m.maxBid)], ['Your bid', fmtMoney(m.price)], ['NTM yield', fmtPct(m.yieldNTM)], ['Implied PV rate', fmtPct(m.irrTotal)],
          ['Borrowing base', fmtMoney(bb.base) + ' (' + bb.binding.toLowerCase() + ')'], ['Equity check', fmtMoney(st.equity)], ['Levered IRR', levTxt(r.lev)], ['PDP share of PV10', fmtPct(m.pdpSharePV, 0)]]
          .map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('')}
      </div>
      <div class="cols">
        <div>
          <h4>Returns</h4><table><tbody>
          ${[['NTM CF (risked)', fmtMoney(m.ntmTotal)], ['PDP-only yield', fmtPct(m.yieldPDP)], ['Implied rate, PDP only', fmtPct(m.irrPDP)], ['Price / NTM CF', fmtX(m.multiple)],
            ['$/flowing Boe/d', m.perFlowing ? '$' + fmtNum(m.perFlowing) : '—'], ['PDP reserves', fmtBoe(m.reservesPDP)], ['R/P', fmtYrs(m.rp)], ['Oil weight', fmtPct(m.oilWeight, 0)]].map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}
          </tbody></table>
          <h4>Bid build</h4><table><tbody>
          ${[['PDP', r.valuation.vPDP, S.A.multPDP], ['PDNP', r.valuation.vPDNP, S.A.multPDNP], ['PUD', r.valuation.vPUD, S.A.multPUD], ['Upside', r.valuation.vUp, S.A.multUpside]].map(([k, v, x]) => `<tr><td>${k} PV10 ${fmtMoney(v)} × ${x}</td><td>${fmtMoney(v * x)}</td></tr>`).join('')}
          <tr><td><b>Max bid</b></td><td><b>${fmtMoney(m.maxBid)}</b></td></tr></tbody></table>
          <h4>RBL</h4><table><tbody>
          ${[['Reserves test', fmtMoney(bb.reserves)], ['Leverage test', fmtMoney(bb.leverage)], ['Draw / utilization', fmtMoney(st.draw) + ' / ' + fmtPct(st.util, 0)], ['All-in rate', fmtPct(st.rate, 2)],
            ['Interest + fees', fmtMoney(st.interest)], ['Levered cash-on-cash', fmtPct(st.leveredCoC)], ['DSCR / Debt÷EBITDA', fmtX(st.dscr) + ' / ' + fmtX(st.debtEbitda)]].map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}
          </tbody></table>
        </div>
        <div>
          <h4>Bid ladder</h4><table><thead><tr><th>Bid at</th><th>Price</th><th>Yr-1 yld</th><th>Equity</th><th>Lev IRR</th></tr></thead><tbody>
          ${(S.ladder || []).map((x) => `<tr><td>${pvLbl(x.rate)}</td><td>${fmtMoney(x.price)}</td><td>${fmtPct(x.yieldY1)}</td><td>${fmtMoney(x.lev.equity)}</td><td>${levTxt(x.lev)}</td></tr>`).join('')}</tbody></table>
          <h4>Scorecard</h4><table><tbody>${r.score.rows.map((t) => `<tr><td>${esc(t.label)}</td><td>${t.dir === 'bool' ? (t.value ? 'yes' : 'no') : fmtTest(t, t.value)}</td><td>${t.status}</td></tr>`).join('')}</tbody></table>
          <h4>Monthly net cash flow</h4>${img('chCF')}
          <h4>Bid build</h4>${img('chWF')}
        </div>
      </div>
      <div class="fn">Strip as of ${esc(S.A.stripAsOf)}. Bank deck ${fmtPct(S.A.deckOil, 0)}/${fmtPct(S.A.deckGas, 0)} of strip. Advance rates and bank decks are lender-internal rules of thumb, not filed terms. Screening tool only; not an offer or a lender commitment.</div>`;
  }
  window.addEventListener('beforeprint', buildPrint);

  // ---------- wiring ----------
  function renderAll() { renderIngest(); renderReview(); renderInputs(); renderDeals(); recompute(); }
  function init() {
    $$('#sideTabs button, #tabbar button').forEach((b) => (b.onclick = () => setView(b.dataset.view)));
    $('#dealName').oninput = (e) => { S.deal.name = e.target.value; persist(); };
    $('#btnSave').onclick = saveDeal;
    $('#btnPrint').onclick = doPrint;
    $('#btnNew').onclick = () => {
      if (!confirm('Start a new deal? Unsaved changes to the current deal are lost.')) return;
      S.deal = blankDeal(); S.parsed = null; S.edited = {}; S.text = ''; S.currentId = null;
      renderAll(); setView('ingest');
    };
    (mq.addEventListener ? mq.addEventListener('change', applyView) : mq.addListener(applyView));
    analysisSkeleton();
    renderAll();
    applyView();
  }
  window.DSApp = { S, ingestText, recompute, charts };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
