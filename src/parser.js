/* Cedar Creek Deal Screen — teaser text parser (regex + heuristics). */
(function (root) {
  'use strict';

  const BASINS = [
    ['Delaware', /\bDelaware\s+Basin\b/i], ['Midland', /\bMidland\s+Basin\b/i],
    ['Permian', /\bPermian(?:\s+Basin)?\b/i], ['Central Basin Platform', /\bCentral\s+Basin\s+Platform\b/i],
    ['Eagle Ford', /\bEagle\s*Ford\b/i], ['Haynesville', /\bHaynesville\b/i], ['Marcellus', /\bMarcellus\b/i],
    ['Utica', /\bUtica\b/i], ['Bakken', /\bBakken\b/i], ['Williston', /\bWilliston(?:\s+Basin)?\b/i],
    ['DJ', /\b(?:DJ|D-J|Denver[- ]Julesburg)\s+Basin\b/i], ['Powder River', /\bPowder\s+River(?:\s+Basin)?\b/i],
    ['Anadarko', /\bAnadarko\s+Basin\b/i], ['SCOOP', /\bSCOOP\b/], ['STACK', /\bSTACK\b/],
    ['Arkoma', /\bArkoma\b/i], ['Uinta', /\bUinta\b/i], ['San Juan', /\bSan\s+Juan\s+Basin\b/i],
    ['Barnett', /\bBarnett\b/i], ['Austin Chalk', /\bAustin\s+Chalk\b/i], ['Fort Worth', /\bFort\s+Worth\s+Basin\b/i],
    ['Granite Wash', /\bGranite\s+Wash\b/i], ['Niobrara', /\bNiobrara\b/i], ['Green River', /\bGreen\s+River\s+Basin\b/i],
    ['Appalachian', /\bAppalachia(?:n)?(?:\s+Basin)?\b/i], ['Cotton Valley', /\bCotton\s+Valley\b/i],
    ['East Texas', /\bEast\s+Texas\s+Basin\b/i], ['Gulf Coast', /\bGulf\s+Coast\b/i]
  ];
  const BASIN_STATES = {
    Delaware: ['Texas', 'New Mexico'], Midland: ['Texas'], Permian: ['Texas', 'New Mexico'], 'Central Basin Platform': ['Texas'],
    'Eagle Ford': ['Texas'], Haynesville: ['Louisiana', 'Texas'], Marcellus: ['Pennsylvania', 'West Virginia'],
    Utica: ['Ohio'], Bakken: ['North Dakota', 'Montana'], Williston: ['North Dakota', 'Montana'], DJ: ['Colorado'],
    'Powder River': ['Wyoming'], Anadarko: ['Oklahoma'], SCOOP: ['Oklahoma'], STACK: ['Oklahoma'], Arkoma: ['Oklahoma', 'Arkansas'],
    Uinta: ['Utah'], 'San Juan': ['New Mexico', 'Colorado'], Barnett: ['Texas'], 'Fort Worth': ['Texas'], 'Austin Chalk': ['Texas', 'Louisiana'],
    'Granite Wash': ['Oklahoma', 'Texas'], Niobrara: ['Colorado', 'Wyoming'], 'Green River': ['Wyoming'], Appalachian: ['Pennsylvania', 'West Virginia', 'Ohio'],
    'Cotton Valley': ['Texas', 'Louisiana'], 'East Texas': ['Texas']
  };
  const COUNTY_BASIN = {
    Converse: 'Powder River', Campbell: 'Powder River', Johnson: 'Powder River', Niobrara: 'Powder River',
    Reeves: 'Delaware', Loving: 'Delaware', Ward: 'Delaware', Winkler: 'Delaware', Culberson: 'Delaware', Pecos: 'Delaware', Lea: 'Delaware', Eddy: 'Delaware',
    Midland: 'Midland', Martin: 'Midland', Howard: 'Midland', Glasscock: 'Midland', Upton: 'Midland', Reagan: 'Midland', Andrews: 'Midland', Ector: 'Midland',
    McKenzie: 'Williston', Williams: 'Williston', Mountrail: 'Williston', Dunn: 'Williston', Divide: 'Williston',
    Karnes: 'Eagle Ford', DeWitt: 'Eagle Ford', Gonzales: 'Eagle Ford', 'La Salle': 'Eagle Ford', McMullen: 'Eagle Ford', Webb: 'Eagle Ford', Dimmit: 'Eagle Ford',
    Weld: 'DJ', Grady: 'SCOOP', Garvin: 'SCOOP', McClain: 'SCOOP', Stephens: 'SCOOP', Kingfisher: 'STACK', Canadian: 'STACK', Blaine: 'STACK',
    Caddo: 'Haynesville', DeSoto: 'Haynesville', Bossier: 'Haynesville', 'Red River': 'Haynesville', Panola: 'Haynesville',
    Washington: 'Marcellus', Greene: 'Marcellus', Susquehanna: 'Marcellus', Bradford: 'Marcellus', Belmont: 'Utica', Monroe: 'Utica', Uintah: 'Uinta', Duchesne: 'Uinta'
  };
  const STATES = ['Texas', 'New Mexico', 'Oklahoma', 'Wyoming', 'North Dakota', 'South Dakota', 'Colorado', 'Louisiana', 'Pennsylvania',
    'Ohio', 'West Virginia', 'Utah', 'Montana', 'Kansas', 'Arkansas', 'Alabama', 'Mississippi', 'California', 'Alaska', 'Michigan',
    'Nebraska', 'Kentucky', 'Virginia', 'New York', 'Illinois', 'Indiana'];
  const ABBR = { TX: 'Texas', NM: 'New Mexico', OK: 'Oklahoma', WY: 'Wyoming', ND: 'North Dakota', CO: 'Colorado', LA: 'Louisiana',
    PA: 'Pennsylvania', OH: 'Ohio', WV: 'West Virginia', UT: 'Utah', MT: 'Montana', KS: 'Kansas', AR: 'Arkansas' };

  // [display, regex, investment grade / large-cap]
  const OPERATORS = [
    ['ExxonMobil', /\b(?:Exxon(?:\s*Mobil)?|XTO)\b/i, true], ['Chevron', /\bChevron\b/i, true], ['Diamondback', /\bDiamondback\b/i, true],
    ['Occidental', /\b(?:Occidental|OXY)\b/, true], ['ConocoPhillips', /\bConoco(?:Phillips)?\b/i, true], ['EOG', /\bEOG\b/, true],
    ['Devon', /\bDevon\b/i, true], ['Continental', /\bContinental(?:\s+Resources)?\b/i, true], ['Pioneer', /\bPioneer(?:\s+Natural)?\b/i, true],
    ['Coterra', /\bCoterra\b/i, true], ['Ovintiv', /\bOvintiv\b/i, true], ['APA', /\b(?:APA|Apache)\b/, true], ['Hess', /\bHess\b/, true],
    ['EQT', /\bEQT\b/, true], ['Expand Energy', /\b(?:Expand\s+Energy|Chesapeake)\b/i, true], ['BPX', /\bBPX\b/, true], ['Shell', /\bShell\b/, true],
    ['Marathon', /\bMarathon\b/i, true], ['Permian Resources', /\bPermian\s+Resources\b/i, false], ['Matador', /\bMatador\b/i, false],
    ['Mewbourne', /\bMewbourne\b/i, false], ['Civitas', /\bCivitas\b/i, false], ['SM Energy', /\bSM\s+Energy\b/i, false],
    ['Vital', /\bVital\s+Energy\b/i, false], ['Endeavor', /\bEndeavor\b/i, false], ['Fasken', /\bFasken\b/i, false],
    ['Chord', /\bChord\b/i, false], ['Crescent', /\bCrescent\s+Energy\b/i, false], ['Murphy', /\bMurphy\b/i, false],
    ['Antero', /\bAntero\b/i, false], ['Range', /\bRange\s+Resources\b/i, false], ['CNX', /\bCNX\b/, false],
    ['Comstock', /\bComstock\b/i, false], ['Aethon', /\bAethon\b/i, false], ['Coterra', /\bCabot\b/i, true],
    ['Callon', /\bCallon\b/i, false], ['Laredo', /\bLaredo\b/i, false], ['Mach', /\bMach\s+Natural\b/i, false],
    ['Northern O&G', /\bNorthern\s+Oil\b/i, false], ['Grayson Mill', /\bGrayson\s+Mill\b/i, false], ['Ascent', /\bAscent\s+Resources\b/i, false],
    ['Riley', /\bRiley\s+Permian\b/i, false], ['Earthstone', /\bEarthstone\b/i, false], ['Franklin Mountain', /\bFranklin\s+Mountain\b/i, false],
    ['Tap Rock', /\bTap\s+Rock\b/i, false], ['Double Eagle', /\bDouble\s+Eagle\b/i, false], ['Ameredev', /\bAmeredev\b/i, false]
  ];

  const MONEY = String.raw`~?\$?\s*\d[\d,]*(?:\.\d+)?\s*(?:MM\b|mm\b|million\b|mil\b|M\b|K\b|k\b|thousand\b|B\b|billion\b|bn\b)?`;

  /** Find the nearest unit header like "($MM)", "($M)", "($000s)", "(in thousands)" before position. */
  function unitHeaderBefore(text, pos) {
    const win = text.slice(Math.max(0, pos - 400), pos);
    const re = /\(\s*(?:in\s+)?(\$\s*MM|\$\s*mm|\$\s*M|\$\s*000s?|\$\s*K|\$\s*B|millions|thousands)\s*\)/gi;
    let m, last = null;
    while ((m = re.exec(win))) last = m[1].replace(/\s+/g, '').toUpperCase();
    if (!last) return null;
    if (last === '$MM' || last === 'MILLIONS') return 1e6;
    if (last === '$M' || last === '$000' || last === '$000S' || last === '$K' || last === 'THOUSANDS') return 1e3;
    if (last === '$B') return 1e9;
    return null;
  }

  /**
   * Parse a money string. Handles "$8.1MM", "$450K", "3,012", "$1.2 million".
   * ctxMult: multiplier from a unit header when the value has no unit.
   * Returns { value, conf } where conf drops when the unit was ambiguous or assumed.
   */
  function parseMoney(str, ctxMult) {
    if (str === null || str === undefined) return null;
    const s = String(str).trim();
    const m = s.match(/(-|\()?\s*~?\$?\s*(\d[\d,]*(?:\.\d+)?)\s*(MM|mm|million|mil|M|K|k|thousand|B|billion|bn)?\b/);
    if (!m) return null;
    let v = parseFloat(m[2].replace(/,/g, ''));
    if (!isFinite(v)) return null;
    const u = m[3] || '';
    let conf = 'high';
    if (/^(MM|mm|million|mil)$/.test(u)) v *= 1e6;
    else if (/^(K|k|thousand)$/.test(u)) v *= 1e3;
    else if (/^(B|billion|bn)$/.test(u)) v *= 1e9;
    else if (u === 'M') {
      if (ctxMult === 1e3) v *= 1e3; // "($M)" table convention = thousands
      else { v *= v < 1000 ? 1e6 : 1e3; conf = 'medium'; } // prose "$1.2M": treat small values as millions
    } else if (ctxMult) v *= ctxMult;
    else { conf = v < 1000 ? 'low' : 'medium'; if (v < 1000) v *= 1e6; }
    if (m[1]) v = -v;
    return { value: v, conf };
  }

  function parseNumber(str) {
    if (str === null || str === undefined) return null;
    const m = String(str).match(/-?\d[\d,]*(?:\.\d+)?/);
    return m ? parseFloat(m[0].replace(/,/g, '')) : null;
  }

  function snippet(text, idx, len) {
    const a = Math.max(0, idx - 70), b = Math.min(text.length, idx + len + 70);
    return {
      before: (a > 0 ? '…' : '') + text.slice(a, idx).replace(/\s+/g, ' '),
      match: text.slice(idx, idx + len).replace(/\s+/g, ' '),
      after: text.slice(idx + len, b).replace(/\s+/g, ' ') + (b < text.length ? '…' : '')
    };
  }

  function normalize(text) {
    return String(text || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[ \t]+/g, ' ')
      .replace(/\r/g, '');
  }

  function first(text, re) {
    re.lastIndex = 0;
    const m = re.exec(text);
    return m ? { m, idx: m.index, len: m[0].length } : null;
  }

  function moneyField(text, patterns, conf = 'high') {
    for (const re of patterns) {
      const f = first(text, re);
      if (!f) continue;
      const raw = f.m.groups && f.m.groups.v ? f.m.groups.v : f.m[1];
      const vIdx = f.idx + f.m[0].indexOf(raw);
      const p = parseMoney(raw, unitHeaderBefore(text, vIdx));
      if (!p) continue;
      return { value: p.value, raw: raw.trim(), conf: worst(conf, p.conf), src: snippet(text, f.idx, f.len) };
    }
    return null;
  }

  function worst(a, b) { const r = { high: 3, medium: 2, low: 1 }; return (r[a] || 0) <= (r[b] || 0) ? a : b; }

  function countField(text, patterns, conf = 'high') {
    for (const re of patterns) {
      const f = first(text, re);
      if (!f) continue;
      const v = parseNumber(f.m[1]);
      if (v === null) continue;
      return { value: v, raw: f.m[1], conf, src: snippet(text, f.idx, f.len) };
    }
    return null;
  }

  function pctField(text, patterns, conf = 'high') {
    for (const re of patterns) {
      const f = first(text, re);
      if (!f) continue;
      const v = parseNumber(f.m[1]);
      if (v === null) continue;
      return { value: v / 100, raw: f.m[1] + '%', conf, src: snippet(text, f.idx, f.len) };
    }
    return null;
  }

  // ---------- field extractors ----------
  function seller(text) {
    const suffix = String.raw`(?:LLC|L\.L\.C\.|LP|L\.P\.|Inc\.?|Ltd\.?|Corp\.?|Company|Partners|Holdings)`;
    const pats = [
      new RegExp(String.raw`((?:[A-Z][\w&'.-]*\s+){0,6}?[A-Z][\w&'.-]*,?\s+${suffix})\s*(?:\([^)]*\)\s*)?,?\s*(?:is|are|has)\s+(?:offering|selling|marketing|retained|engaged|seeking)`),
      new RegExp(String.raw`on\s+behalf\s+of\s+((?:[A-Z][\w&'.-]*\s+){0,6}?[A-Z][\w&'.-]*,?\s+${suffix})`),
      /((?:[A-Z][\w&'.-]*\s+){0,5}[A-Z][\w&'.-]*)\s+(?:is|are)\s+offering\s+for\s+sale/
    ];
    for (let i = 0; i < pats.length; i++) {
      const f = first(text, pats[i]);
      if (f) {
        const v = f.m[1].replace(/^(?:The|An?)\s+/, '').trim();
        return { value: v, raw: v, conf: i < 2 ? 'high' : 'medium', src: snippet(text, f.idx + f.m[0].indexOf(f.m[1]), f.m[1].length) };
      }
    }
    return null;
  }

  function basins(text) {
    const found = [];
    for (const [name, re] of BASINS) {
      const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
      const m = g.exec(text);
      if (!m) continue;
      if (name === 'Permian' && found.some((f) => f.name === 'Delaware' || f.name === 'Midland') && !/Permian\s+Basin/i.test(m[0])) continue;
      // Optional share like "Delaware Basin (51%)"
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 14);
      const pm = after.match(/^\s*\(\s*(\d{1,3}(?:\.\d+)?)\s*%\s*\)/);
      found.push({ name, idx: m.index, len: m[0].length + (pm ? pm[0].length : 0), pct: pm ? +pm[1] / 100 : null });
    }
    if (!found.length) return null;
    found.sort((a, b) => a.idx - b.idx);
    const value = found.map((f) => f.name + (f.pct !== null ? ` (${Math.round(f.pct * 100)}%)` : '')).join(', ');
    return { value, list: found.map((f) => f.name), shares: found, conf: 'high', src: snippet(text, found[0].idx, found[0].len) };
  }

  function counties(text) {
    const out = [];
    let srcIdx = -1, srcLen = 0;
    const name = String.raw`[A-Z][a-z]+(?:\s[A-Z][a-z]+)?`;
    const multi = new RegExp(String.raw`((?:${name}(?:,\s*|\s+and\s+|\s*&\s*))+${name})\s+(?:Counties|Parishes)`, 'g');
    let m;
    while ((m = multi.exec(text))) {
      m[1].split(/,\s*|\s+and\s+|\s*&\s*/).forEach((c) => c && out.push(c.trim()));
      if (srcIdx < 0) { srcIdx = m.index; srcLen = m[0].length; }
    }
    const single = new RegExp(String.raw`(${name})\s+(County|Parish)\b`, 'g');
    while ((m = single.exec(text))) {
      const c = m[1].replace(/^(?:In|The|Of|And|Across|Located)\s+/, '');
      if (/^(?:Basin|Each|Per|Top|Every)$/.test(c)) continue;
      out.push(c);
      if (srcIdx < 0) { srcIdx = m.index; srcLen = m[0].length; }
    }
    const uniq = [...new Set(out.filter((c) => !/^(?:In|The|Of|And)$/.test(c)))];
    if (!uniq.length) return null;
    return { value: uniq.join(', '), list: uniq, conf: 'high', src: snippet(text, srcIdx, srcLen) };
  }

  function states(text, basinList) {
    const found = [];
    let srcIdx = -1, srcLen = 0;
    for (const s of STATES) {
      const re = new RegExp(String.raw`\b${s.replace(' ', '\\s+')}\b`);
      const m = re.exec(text);
      if (!m) continue;
      // "New Mexico" contains "Mexico", "West Virginia" contains "Virginia"
      if (s === 'Virginia' && /West\s+Virginia/.test(text.slice(Math.max(0, m.index - 5), m.index + 9))) continue;
      if (s === 'Kansas' && /Arkansas/.test(text.slice(Math.max(0, m.index - 2), m.index + 6))) continue;
      found.push(s);
      if (srcIdx < 0 || m.index < srcIdx) { srcIdx = m.index; srcLen = m[0].length; }
    }
    const re2 = /(?:,\s*|\(\s*)(TX|NM|OK|WY|ND|CO|LA|PA|OH|WV|UT|MT|KS|AR)\b/g;
    let m;
    while ((m = re2.exec(text))) { found.push(ABBR[m[1]]); if (srcIdx < 0) { srcIdx = m.index; srcLen = m[0].length; } }
    let uniq = [...new Set(found)];
    if (uniq.length) return { value: uniq.join(', '), list: uniq, conf: 'high', src: snippet(text, srcIdx, srcLen) };
    if (basinList && basinList.length) {
      uniq = [...new Set(basinList.flatMap((b) => BASIN_STATES[b] || []))];
      if (uniq.length) return { value: uniq.join(', '), list: uniq, conf: 'medium', inferred: true, src: { before: 'Inferred from basin: ', match: basinList.join(', '), after: '' } };
    }
    return null;
  }

  function operators(text) {
    const found = [];
    for (const [name, re, ig] of OPERATORS) {
      const m = re.exec(text);
      if (m && !found.some((f) => f.name === name)) found.push({ name, ig, idx: m.index, len: m[0].length });
    }
    // "operators include A, B and C" for names not in the dictionary
    const lm = /\b(?:operators?|operated by)\b[^.]{0,40}?(?:include|including|such as|are|:)\s+([^.;\n]{3,160})/i.exec(text);
    if (lm) {
      lm[1].split(/,\s*(?:and\s+)?|\s+and\s+|\s*&\s*/).map((x) => x.trim()).filter((x) => /^[A-Z]/.test(x) && x.length < 40)
        .forEach((x) => { const nm = x.replace(/\s+(?:Inc|LLC|Corp|Company|Co)\.?$/, ''); if (!found.some((f) => nm.includes(f.name) || f.name.includes(nm.split(' ')[0]))) found.push({ name: nm, ig: false, idx: lm.index, len: lm[0].length }); });
    }
    if (!found.length) return null;
    found.sort((a, b) => a.idx - b.idx);
    const igCount = found.filter((f) => f.ig).length;
    return { value: found.map((f) => f.name).join(', '), list: found.map((f) => f.name), igCount, igShare: igCount / found.length,
      conf: lm ? 'high' : 'medium', src: snippet(text, found[0].idx, Math.min(140, (found[found.length - 1].idx + found[found.length - 1].len) - found[0].idx)) };
  }

  function nra(text) {
    const f = countField(text, [
      /(\d[\d,]*(?:\.\d+)?)\s*\+?\s*(?:net\s+royalty\s+acres|NRAs?)\b/i,
      /(?:NRA|net\s+royalty\s+acres)\s*[:=]?\s*(?:of\s+)?(\d[\d,]*(?:\.\d+)?)/i
    ]);
    if (f) return Object.assign(f, { unit: 'NRA' });
    const g = countField(text, [
      /(\d[\d,]*(?:\.\d+)?)\s*\+?\s*(?:net\s+mineral\s+acres|NMAs?|net\s+acres)\b/i,
      /(?:NMA|net\s+(?:mineral\s+)?acres)\s*[:=]?\s*(\d[\d,]*(?:\.\d+)?)/i
    ], 'medium');
    return g ? Object.assign(g, { unit: 'NMA' }) : null;
  }

  const cf = (lbl) => [
    new RegExp(String.raw`(?:${lbl})\s*(?:net\s+)?(?:cash\s*flows?|CF|net\s+revenue|income)?\s*(?:\(\s*\$\s*MM?\s*\))?\s*(?:[:=-]|of|is|was|~|≈|approx(?:imately)?\.?)?\s*(?<v>${MONEY})`, 'i'),
    new RegExp(String.raw`(?<v>${MONEY})\s+(?:of\s+)?(?:projected\s+|estimated\s+|forecasted\s+)?(?:${lbl})\s*(?:net\s+)?(?:cash\s*flows?|CF)`, 'i')
  ];
  const NTM = String.raw`NTM|N12M|next\s+twelve\s+months?|next\s+12\s+months?|forward\s+12[- ]months?|forward\s+twelve\s+months?`;
  const LTM = String.raw`LTM|TTM|L12M|last\s+twelve\s+months?|last\s+12\s+months?|trailing\s+twelve\s+months?|trailing\s+12[- ]months?`;

  function guardMoney(r) { return r && r.raw && /\d/.test(r.raw) && !/^\d{4}$/.test(r.raw.replace(/[^\d]/g, '')) ? r : r; }

  function monthlyCF(text) {
    return moneyField(text, [
      new RegExp(String.raw`(?:average\s+|avg\.?\s+)?monthly\s+(?:net\s+)?(?:cash\s*flows?|CF|revenue|income)\s*(?:[:=-]|of|is|~)?\s*(?<v>${MONEY})`, 'i'),
      new RegExp(String.raw`(?<v>\$\s*\d[\d,]*(?:\.\d+)?\s*(?:MM|M|K|k)?)\s*(?:\/|per\s+)\s*(?:mo\b|month)`, 'i')
    ]);
  }

  /** PV10 by category. Looks inside "PV10" segments and for "PDP PV10 $X" constructs. */
  function pv10(text) {
    const cats = {
      pvPDP: String.raw`PDP`,
      pvPDNP: String.raw`PDNP(?:\s*\/\s*DUCs?)?|PNP|DUCs?(?:\s*(?:&|and|\/)\s*permits?)?|permits?`,
      pvPUD: String.raw`PUDs?|undeveloped(?:\s+locations)?|undrilled(?:\s+locations)?`,
      pvUpside: String.raw`upside|unbooked|probable|possible|3P`,
      pvTotal: String.raw`total(?:\s+PV-?10)?`
    };
    const out = {};
    const PV = String.raw`PV[-\s]?10`;
    // Segment pattern: "PV10: PDP $3MM, DUCs & permits $9MM, ..." or "PV10 ($MM): PDP 3.0 ..."
    const seg = new RegExp(String.raw`${PV}\b[^.\n]{0,12}?[:(]?([\s\S]{0,320}?)(?:\.\s|\n\n|$)`, 'gi');
    let m;
    while ((m = seg.exec(text))) {
      const body = m[1], bodyIdx = m.index + m[0].indexOf(body);
      for (const [k, lbl] of Object.entries(cats)) {
        if (out[k]) continue;
        const re = new RegExp(String.raw`(?:^|[\s,;(])(${lbl})\s*(?:${PV})?\s*(?:[:=-]|of)?\s*(${MONEY})`, 'i');
        const mm = re.exec(body);
        if (!mm || !/\d/.test(mm[2])) continue;
        const vi = bodyIdx + mm.index + mm[0].indexOf(mm[2]);
        const p = parseMoney(mm[2], unitHeaderBefore(text, vi) || unitHeaderBefore(text.slice(0, bodyIdx + mm.index + mm[0].length), bodyIdx + mm.index + mm[0].length));
        if (!p) continue;
        out[k] = { value: p.value, raw: mm[2].trim(), conf: p.conf, src: snippet(text, bodyIdx + mm.index, mm[0].length) };
      }
    }
    // "PDP PV10 of $X" / "PDP PV-10: $X" / "$X PDP PV10"
    for (const [k, lbl] of Object.entries(cats)) {
      if (out[k]) continue;
      const r = moneyField(text, [
        new RegExp(String.raw`(?:${lbl})\s+${PV}\s*(?:[:=-]|of)?\s*(?<v>${MONEY})`, 'i'),
        new RegExp(String.raw`(?<v>\$\s*\d[\d,]*(?:\.\d+)?\s*(?:MM|M|K|B)?)\s+(?:of\s+)?(?:${lbl})\s+${PV}`, 'i')
      ]);
      if (r) out[k] = r;
    }
    if (!out.pvTotal) {
      const r = moneyField(text, [new RegExp(String.raw`(?:total\s+)?${PV}\s*(?:value\s+)?(?:of|[:=])\s*(?<v>\$\s*\d[\d,]*(?:\.\d+)?\s*(?:MM|M|K|B)?)`, 'i')], 'medium');
      if (r && !Object.values(out).some((o) => o.raw === r.raw)) out.pvTotal = r;
    }
    return out;
  }

  function production(text) {
    const re = /(\d[\d,]*(?:\.\d+)?)\s*(?:net\s+)?(Boe\/d|BOE\/D|Boepd|BOEPD|Boe\s+per\s+day|Boe\/day|MMcfe\/d|Mcfe\/d|MMcfed|Mcfed|Mcfe\s+per\s+day|bbl\/d|bopd|BOPD)\b/i;
    const f = first(text, re);
    if (!f) return null;
    let v = parseNumber(f.m[1]);
    const u = f.m[2].toLowerCase();
    let conf = 'high';
    if (u.startsWith('mmcfe')) v = v * 1000 / 6;
    else if (u.startsWith('mcfe')) v = v / 6;
    else if (u.startsWith('bbl') || u.startsWith('bopd')) conf = 'medium'; // oil only
    return { value: v, raw: f.m[0], conf, src: snippet(text, f.idx, f.len) };
  }

  function decline(text) {
    return pctField(text, [
      /(\d{1,2}(?:\.\d+)?)\s*%\s*(?:annual|first[- ]year|1st[- ]year|year[- ]1|yr[- ]1|NTM|PDP|base|forward)?\s*decline/i,
      /decline(?:\s+rate)?\s*(?:of|:|~|is)?\s*(?:approximately\s+|~)?(\d{1,2}(?:\.\d+)?)\s*%/i
    ]);
  }

  function bidDate(text) {
    const mon = String.raw`(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?`;
    const re = new RegExp(String.raw`(?:bids?\s+(?:are\s+)?due|bid\s+(?:date|deadline)|offers?\s+(?:are\s+)?due|bids?\s+must\s+be\s+received(?:\s+by)?)\s*[:\-]?\s*(?:on\s+|by\s+)?((?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,?\s+)?(?:${mon}\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)(?:,?\s*(?:@|at)?\s*(?:noon|\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.))(?:\s*(?:CT|CST|CDT|Central|ET|EST|EDT|MT|MST|PT))?)?)`, 'i');
    const f = first(text, re);
    if (!f) return null;
    return { value: f.m[1].trim().replace(/\s+/g, ' '), raw: f.m[1], conf: 'high', src: snippet(text, f.idx, f.len) };
  }

  function pdpShareNTM(text) {
    // "NTM CF $4.0MM, 16% PDP" or "PDP represents 16% of NTM CF"
    const a = first(text, new RegExp(String.raw`(?:${NTM})(?:[^.\n]|\.\d){0,60}?(\d{1,3}(?:\.\d+)?)\s*%\s*PDP\b`, 'i'));
    if (a) return { value: +a.m[1] / 100, raw: a.m[1] + '%', conf: 'high', src: snippet(text, a.idx, a.len) };
    const b = first(text, /PDP\s*(?:represents|is|=|:|comprises|makes\s+up)?\s*(?:~|approximately\s+)?(\d{1,3}(?:\.\d+)?)\s*%\s*of\s*(?:the\s+)?(?:NTM|next|forward|projected)/i);
    if (b) return { value: +b.m[1] / 100, raw: b.m[1] + '%', conf: 'high', src: snippet(text, b.idx, b.len) };
    const c = first(text, /(\d{1,3}(?:\.\d+)?)\s*%\s*(?:of\s+(?:NTM\s+)?(?:cash\s+flow|CF)\s+(?:from|is)\s+)?PDP\b/i);
    if (c) return { value: +c.m[1] / 100, raw: c.m[1] + '%', conf: 'low', src: snippet(text, c.idx, c.len) };
    return null;
  }

  function mixFields(text) {
    const oil = pctField(text, [/(\d{1,3}(?:\.\d+)?)\s*%\s*oil\b/i, /oil\s*(?:weight(?:ed)?|cut|mix)?\s*[:(]?\s*(\d{1,3}(?:\.\d+)?)\s*%/i]);
    const gas = pctField(text, [/(\d{1,3}(?:\.\d+)?)\s*%\s*(?:natural\s+)?gas\b/i, /\bgas\s*[:(]\s*(\d{1,3}(?:\.\d+)?)\s*%/i]);
    const ngl = pctField(text, [/(\d{1,3}(?:\.\d+)?)\s*%\s*NGLs?\b/i, /NGLs?\s*[:(]\s*(\d{1,3}(?:\.\d+)?)\s*%/i]);
    const liquids = pctField(text, [/(\d{1,3}(?:\.\d+)?)\s*%\s*liquids\b/i]);
    return { oil: oil || (liquids && !ngl ? Object.assign({}, liquids, { conf: 'medium' }) : null), gas, ngl };
  }

  function counts(text) {
    const n = String.raw`(\d[\d,]*(?:\.\d+)?)\s*\+?`;
    const ducsPermits = countField(text, [new RegExp(String.raw`${n}\s+(?:gross\s+)?DUCs?\s*(?:&|and|\/|\+)\s*permits?\b`, 'i')]);
    const ducs = countField(text, [new RegExp(String.raw`${n}\s+(?:gross\s+)?(?:DUCs?|drilled\s+(?:but\s+)?uncompleted(?:\s+wells)?)\b(?!\s*(?:&|and|\/|\+)\s*permits?)`, 'i')]);
    const permits = countField(text, [new RegExp(String.raw`${n}\s+(?:gross\s+)?(?:active\s+|approved\s+)?permits?\b`, 'i')]);
    const rigs = countField(text, [new RegExp(String.raw`${n}\s+(?:active\s+)?rigs?\b`, 'i')]);
    const wells = countField(text, [new RegExp(String.raw`${n}\s+(?:gross\s+)?(?:producing\s+|horizontal\s+|PDP\s+)*wells\b`, 'i')]);
    let locations = null, netLocations = null;
    const gl = first(text, /(\d[\d,]*)\s*\+?\s*gross\s*(?:\/|and|,|\()\s*(\d[\d,]*(?:\.\d+)?)\s*net\s+(?:(?:undeveloped|upside|drilling|remaining|horizontal)\s+)*locations/i);
    if (gl) {
      locations = { value: parseNumber(gl.m[1]), raw: gl.m[1], conf: 'high', src: snippet(text, gl.idx, gl.len), label: 'gross' };
      netLocations = { value: parseNumber(gl.m[2]), raw: gl.m[2], conf: 'high', src: snippet(text, gl.idx, gl.len) };
    } else {
      const l = first(text, /(\d[\d,]*)\s*(\+)?\s*(?:gross\s+)?((?:undeveloped|upside|drilling|remaining|horizontal|future)\s+)*locations/i);
      if (l) locations = { value: parseNumber(l.m[1]), raw: l.m[0], conf: l.m[2] ? 'medium' : 'high', src: snippet(text, l.idx, l.len), label: (l.m[3] || '').trim() };
    }
    return { ducsPermits, ducs, permits, rigs, wells, locations, netLocations };
  }

  /** Main entry: returns { fields: {key: {value, conf, src, ...}}, missing: [...] } */
  function parseTeaser(input) {
    const text = normalize(input);
    const f = {};
    f.seller = seller(text);
    f.basins = basins(text);
    f.counties = counties(text);
    if (!f.basins && f.counties) {
      const inf = [...new Set(f.counties.list.map((c) => COUNTY_BASIN[c]).filter(Boolean))];
      if (inf.length) f.basins = { value: inf.join(', '), list: inf, conf: 'medium', inferred: true, src: { before: 'Inferred from county: ', match: f.counties.value, after: '' } };
    }
    f.states = states(text, f.basins && f.basins.list);
    f.operators = operators(text);
    f.nra = nra(text);
    f.ntmCF = guardMoney(moneyField(text, cf(NTM)));
    f.ltmCF = guardMoney(moneyField(text, cf(LTM)));
    f.monthlyCF = monthlyCF(text);
    Object.assign(f, pv10(text));
    f.prodBoed = production(text);
    const mix = mixFields(text);
    f.oilPct = mix.oil; f.gasPct = mix.gas; f.nglPct = mix.ngl;
    f.decline = decline(text);
    f.pdpShareNTM = pdpShareNTM(text);
    Object.assign(f, counts(text));
    f.bidDate = bidDate(text);
    // Clean up: drop empty
    Object.keys(f).forEach((k) => { if (!f[k]) delete f[k]; });
    // Derived: PV10 upside as unallocated total if components fall short
    const core = ['pvPDP', 'pvPDNP', 'pvPUD'].map((k) => (f[k] ? f[k].value : 0));
    if (f.pvTotal && !f.pvUpside && f.pvPDP) {
      const gap = f.pvTotal.value - core.reduce((a, b) => a + b, 0);
      if (gap > f.pvTotal.value * 0.02) f.pvUpside = { value: gap, raw: 'total − components', conf: 'low', derived: true, src: { before: 'Derived: total PV10 less PDP, PDNP and PUD', match: '', after: '' } };
    }
    const KEY_FIELDS = ['seller', 'basins', 'counties', 'states', 'operators', 'nra', 'ntmCF', 'pvPDP', 'pvPDNP', 'pvPUD', 'pvTotal', 'prodBoed', 'oilPct', 'decline', 'bidDate'];
    const missing = KEY_FIELDS.filter((k) => !f[k]);
    return { fields: f, missing, text };
  }

  const api = { COUNTY_BASIN, parseTeaser, parseMoney, parseNumber, unitHeaderBefore, normalize, OPERATORS, BASINS };
  root.DSParser = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
