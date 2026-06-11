const state = { macro: null, breadth: null, vol: null };
let missingSymbols = [];
let prevFxPrice = parseFloat(localStorage.getItem('prevFxPrice')) || null;

// ------------------------------
// UI HELPERS
// ------------------------------
function toggleExplainer(id) {
  const el = document.getElementById(id);
  el.style.display = el.style.display === 'block' ? 'none' : 'block';
}

function setError(msg) {
  document.getElementById('errorBox').textContent = msg || '';
}

// ------------------------------
// REFRESH ALL
// ------------------------------
async function refreshAll() {
  setError('');
  missingSymbols = [];
  state.macro = null;
  state.breadth = null;
  state.vol = null;

  await Promise.all([
    fetchMacroBlock(),
    fetchBreadthBlock(),
    fetchVolBlock(),
    fetchEarningsBlock()
  ]);

  evaluateSignals();
  document.getElementById('lastUpdated').textContent =
    'Last updated: ' + new Date().toLocaleString();
}

// ------------------------------
// FINNHUB QUOTES
// ------------------------------
async function fetchFinnhubQuote(symbol) {
  const url = `/api/quote?symbol=${symbol}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data || typeof data.c !== 'number') throw new Error('Invalid quote');
    return { price: data.c, previousClose: data.pc, timestamp: data.t };
  } catch {
    return null;
  }
}

// Returns a human-readable freshness label for a Finnhub quote timestamp.
function freshnessLabel(timestamp) {
  if (!timestamp) return 'unknown';
  const ageMs = Date.now() - timestamp * 1000;
  const ageMin = ageMs / 60000;

  if (ageMin < 30) return 'live (US session)';

  const ageHrs = ageMin / 60;
  if (ageHrs < 24) return `${ageHrs.toFixed(1)}h ago (last US close)`;

  const ageDays = ageHrs / 24;
  return `${ageDays.toFixed(1)}d ago (stale)`;
}

async function getQuote(symbol) {
  const q = await fetchFinnhubQuote(symbol);
  if (q) return q;
  missingSymbols.push(symbol);
  return null;
}

// ------------------------------
// FX (2‑source fallback)
// ------------------------------
async function getFx() {
  try {
    const res = await fetch('/api/fx');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (data?.price) return { price: data.price, source: data.source };
    throw new Error('All FX sources failed');
  } catch (e) {
    console.error('FX error:', e);
    return null;
  }
}

// ------------------------------
// MACRO BLOCK (strict)
// ------------------------------
async function fetchMacroBlock() {
  const ief = await getQuote('IEF');
  const fx = await getFx();

  if (!ief) {
    state.macro = null;
    return;
  }

  const current = ief.price;
  const prev = ief.previousClose;
  const change = current - prev;
  const pct = (change / prev) * 100;

  let yieldTrend = 'flat';
  if (change > 0.15) yieldTrend = 'rising';
  else if (change < -0.15) yieldTrend = 'falling';

  document.getElementById('iefValue').textContent = current.toFixed(2);
  document.getElementById('iefChange').textContent =
    `${change >= 0 ? '+' : ''}${change.toFixed(2)} (${pct.toFixed(2)}%)`;
  document.getElementById('yieldTrendText').textContent = yieldTrend;
  document.getElementById('iefSource').textContent = 'Source: Finnhub';

  let usdJpyTrend = 'missing';

  if (fx && fx.price) {
    if (prevFxPrice === null) prevFxPrice = fx.price;

    const diff = fx.price - prevFxPrice;
    const fxPct = (diff / prevFxPrice) * 100;

    if (diff > 0.3) usdJpyTrend = 'usdSurging';
    else if (diff < -0.3) usdJpyTrend = 'usdFalling';
    else usdJpyTrend = 'stable';

    document.getElementById('usdJpyText').textContent =
      `${fx.price.toFixed(3)} (${diff >= 0 ? '+' : ''}${diff.toFixed(3)}, ${fxPct >= 0 ? '+' : ''}${fxPct.toFixed(2)}%)`;
    document.getElementById('fxSource').textContent =
      `Source: ${fx.source} – change since last check`;

    prevFxPrice = fx.price;
    localStorage.setItem('prevFxPrice', String(prevFxPrice));
  } else {
    document.getElementById('usdJpyText').textContent = 'n/a';
    document.getElementById('fxSource').textContent = 'Source: unavailable';
  }

  state.macro = { yieldTrend, usdJpyTrend };

  document.getElementById('macroExplainer').innerHTML = `
    <div><strong>Yield trend:</strong> ${yieldTrend}</div>
    <div><strong>USD/JPY trend:</strong> ${usdJpyTrend}</div>
  `;
}

// ------------------------------
// BREADTH BLOCK (strict) – Taiwan + Korea (Veritas Asian core, ~62.5% of fund)
// ------------------------------
async function fetchBreadthBlock() {
  const ewt = await getQuote('EWT'); // iShares Taiwan
  const ewy = await getQuote('EWY'); // iShares Korea

  let ewtTrend = 'flat';
  let ewtPct = null;
  if (ewt && ewt.previousClose) {
    const ret = (ewt.price - ewt.previousClose) / ewt.previousClose;
    ewtPct = ret * 100;
    if (ret > 0.003) ewtTrend = 'rising';
    else if (ret < -0.003) ewtTrend = 'falling';
  } else {
    missingSymbols.push('EWT');
  }

  document.getElementById('ewtTrendText').textContent =
    ewtPct !== null ? `${ewtTrend} (${ewtPct >= 0 ? '+' : ''}${ewtPct.toFixed(2)}%)` : ewtTrend;
  document.getElementById('ewtSource').textContent =
    `Source: Finnhub – ${freshnessLabel(ewt?.timestamp)}`;

  let ewyTrend = 'flat';
  let ewyPct = null;
  if (ewy && ewy.previousClose) {
    const ret = (ewy.price - ewy.previousClose) / ewy.previousClose;
    ewyPct = ret * 100;
    if (ret > 0.003) ewyTrend = 'rising';
    else if (ret < -0.003) ewyTrend = 'falling';
  } else {
    missingSymbols.push('EWY');
  }

  document.getElementById('ewyTrendText').textContent =
    ewyPct !== null ? `${ewyTrend} (${ewyPct >= 0 ? '+' : ''}${ewyPct.toFixed(2)}%)` : ewyTrend;
  document.getElementById('ewySource').textContent =
    `Source: Finnhub – ${freshnessLabel(ewy?.timestamp)}`;

  state.breadth = { ewtTrend, ewyTrend };

  document.getElementById('breadthExplainer').innerHTML = `
    <div><strong>Taiwan (EWT) trend:</strong> ${ewtTrend}${ewtPct !== null ? ` (${ewtPct >= 0 ? '+' : ''}${ewtPct.toFixed(2)}%)` : ''}</div>
    <div><strong>Korea (EWY) trend:</strong> ${ewyTrend}${ewyPct !== null ? ` (${ewyPct >= 0 ? '+' : ''}${ewyPct.toFixed(2)}%)` : ''}</div>
  `;
}

// ------------------------------
// VOL BLOCK (strict) – vol regime + TSMC (fund's largest single holding)
// ------------------------------
async function fetchVolBlock() {
  const vixy = await getQuote('VIXY');
  const tsm = await getQuote('TSM');

  let vixRegime = 'near';

  if (vixy && vixy.previousClose) {
    const current = vixy.price;
    const prev = vixy.previousClose;
    const change = current - prev;

    if (change < -0.5) vixRegime = 'falling';
    else if (change > 0.5) vixRegime = 'rising';

    document.getElementById('vixyValue').textContent = current.toFixed(2);
    document.getElementById('vixyChange').textContent =
      `${change >= 0 ? '+' : ''}${change.toFixed(2)}`;
    document.getElementById('vixRegimeText').textContent = vixRegime;
  } else {
    document.getElementById('vixyValue').textContent = 'n/a';
    document.getElementById('vixyChange').textContent = 'n/a';
    document.getElementById('vixRegimeText').textContent = 'unknown';
    missingSymbols.push('VIXY');
  }

  document.getElementById('vixySource').textContent = 'Source: Finnhub';

  let tsmTrend = 'flat';
  let tsmPct = null;
  if (tsm && tsm.previousClose) {
    const ret = (tsm.price - tsm.previousClose) / tsm.previousClose;
    tsmPct = ret * 100;
    if (ret > 0.007) tsmTrend = 'rising';
    else if (ret < -0.007) tsmTrend = 'falling';
  } else {
    missingSymbols.push('TSM');
  }

  document.getElementById('tsmText').textContent =
    tsmPct !== null ? `${tsmTrend} (${tsmPct >= 0 ? '+' : ''}${tsmPct.toFixed(2)}%)` : tsmTrend;
  document.getElementById('tsmSource').textContent =
    `Source: Finnhub – ${freshnessLabel(tsm?.timestamp)}`;

  state.vol = { vixRegime, tsmTrend };

  document.getElementById('volExplainer').innerHTML = `
    <div><strong>VIXY trend:</strong> ${vixRegime}</div>
    <div><strong>TSMC (TSM) trend:</strong> ${tsmTrend}${tsmPct !== null ? ` (${tsmPct >= 0 ? '+' : ''}${tsmPct.toFixed(2)}%)` : ''}</div>
  `;
}

// ------------------------------
// EARNINGS CALENDAR – top holdings (TSMC, Samsung, SK Hynix)
// ------------------------------
async function fetchEarningsBlock() {
  const watchlist = [
    { symbol: 'TSM', name: 'TSMC' },
    { symbol: '005930.KS', name: 'Samsung Electronics' },
    { symbol: '000660.KS', name: 'SK Hynix' }
  ];

  const today = new Date();
  const from = today.toISOString().slice(0, 10);
  const toDate = new Date(today);
  toDate.setDate(toDate.getDate() + 60);
  const to = toDate.toISOString().slice(0, 10);

  const results = await Promise.all(watchlist.map(async ({ symbol, name }) => {
    try {
      const res = await fetch(`/api/earnings?symbol=${symbol}&from=${from}&to=${to}`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const events = (data.earningsCalendar || [])
        .filter(e => e.date >= from)
        .sort((a, b) => a.date.localeCompare(b.date));
      return { name, symbol, date: events[0]?.date || null };
    } catch {
      return { name, symbol, date: null, error: true };
    }
  }));

  const box = document.getElementById('earningsBox');
  if (!box) return;

  box.innerHTML = results.map(r => {
    if (!r.date) {
      const label = r.error ? 'unavailable' : 'no upcoming date found';
      return `<div class="earnings-row">${r.name} (${r.symbol}): <span style="color:#888;">${label}</span></div>`;
    }
    const days = Math.ceil((new Date(r.date) - today) / (1000 * 60 * 60 * 24));
    const soon = days <= 7;
    const style = soon ? 'color:#d50000;font-weight:bold;' : 'color:#00c853;';
    const warning = soon ? ' ⚠ within 7 days – consider waiting before re-entry' : '';
    return `<div class="earnings-row">${r.name} (${r.symbol}): <span style="${style}">${r.date} (${days}d)${warning}</span></div>`;
  }).join('');
}

// ------------------------------
// EVALUATE SIGNALS (strict + scoring + drift)
// ------------------------------
function evaluateSignals() {
  const coreMissing = missingSymbols.filter(s =>
    ['IEF', 'EWT', 'EWY', 'VIXY', 'TSM'].includes(s)
  );

  if (!state.macro || !state.breadth || !state.vol || coreMissing.length > 0) {
    setStatus('macro', false);
    setStatus('breadth', false);
    setStatus('vol', false);

    document.getElementById('macroStatusText').textContent = 'WAIT';
    document.getElementById('breadthStatusText').textContent = 'WAIT';
    document.getElementById('volStatusText').textContent = 'WAIT';

    const advice = document.getElementById('trancheAdvice');
    advice.textContent = 'Data incomplete — no signals today';
    advice.className = 'pill pill-wait';

    if (coreMissing.length > 0) {
      setError('Missing data for: ' + [...new Set(coreMissing)].join(', '));
    } else {
      setError('Some data did not load — signals disabled.');
    }
    return;
  }

  const macro = state.macro;
  const breadth = state.breadth;
  const vol = state.vol;

  // STRICT SIGNALS
  const macroFired =
    macro.yieldTrend === 'falling' &&
    (macro.usdJpyTrend === 'stable' || macro.usdJpyTrend === 'usdFalling');

  const breadthFired =
    breadth.ewtTrend === 'rising' &&
    breadth.ewyTrend === 'rising';

  const volFired =
    vol.vixRegime === 'falling' &&
    vol.tsmTrend === 'rising';

  setStatus('macro', macroFired);
  setStatus('breadth', breadthFired);
  setStatus('vol', volFired);

  document.getElementById('macroStatusText').textContent = macroFired ? 'FIRED' : 'WAIT';
  document.getElementById('breadthStatusText').textContent = breadthFired ? 'FIRED' : 'WAIT';
  document.getElementById('volStatusText').textContent = volFired ? 'FIRED' : 'WAIT';

  // ------------------------------
  // CONFIDENCE SCORING
  // ------------------------------
  let macroScore = 0;
  if (macroFired) macroScore = 100;
  else if (macro.yieldTrend === 'falling') macroScore = 60;
  else if (macro.yieldTrend === 'flat' && macro.usdJpyTrend === 'stable') macroScore = 30;

  let breadthScore = 0;
  if (breadthFired) breadthScore = 100;
  else if (breadth.ewtTrend === 'rising' || breadth.ewyTrend === 'rising')
    breadthScore = 50;

  let volScore = 0;
  if (volFired) volScore = 100;
  else if (vol.vixRegime === 'falling' && vol.tsmTrend === 'flat') volScore = 50;

  const confidenceScore = Math.round((macroScore + breadthScore + volScore) / 3);

  document.getElementById('confidenceScore').textContent = confidenceScore + '%';

  // ------------------------------
  // REGIME CLASSIFICATION
  // ------------------------------
  let regime = 'Risk-Off';
  if (confidenceScore >= 70) regime = 'Risk-On';
  else if (confidenceScore >= 40) regime = 'Neutral';

  document.getElementById('regimeText').textContent = regime;

  // ------------------------------
  // SIGNAL DRIFT (with colour coding)
// ------------------------------
  let prev = {};
  try {
    prev = JSON.parse(localStorage.getItem('signalScores') || '{}');
  } catch {
    prev = {};
  }

  const drift = {
    macro: macroScore - (prev.macroScore || 0),
    breadth: breadthScore - (prev.breadthScore || 0),
    vol: volScore - (prev.volScore || 0)
  };

  let driftLeader = 'None';
  let driftValue = 0;

  for (const key of ['macro', 'breadth', 'vol']) {
    if (drift[key] > driftValue) {
      driftLeader = key;
      driftValue = drift[key];
    }
  }

  let driftHtml = '';

  if (driftLeader === 'None') {
    driftHtml = '<span style="color:#888;">None (cooling)</span>';
  } else if (driftValue > 0) {
    driftHtml = `<span style="color:#00c853;">${driftLeader} (+${driftValue})</span>`;
  } else {
    driftHtml = `<span style="color:#d50000;">${driftLeader} (${driftValue})</span>`;
  }

  document.getElementById('signalDrift').innerHTML = driftHtml;

  localStorage.setItem('signalScores', JSON.stringify({
    macroScore,
    breadthScore,
    volScore
  }));

  // ------------------------------
  // TRANCHE ADVICE
  // ------------------------------
  const advice = document.getElementById('trancheAdvice');

  if (!macroFired && !breadthFired && !volFired) {
    advice.textContent = 'Stay out – no re-entry signal yet';
    advice.className = 'pill pill-wait';
  } else if (macroFired && !breadthFired && !volFired) {
    advice.textContent = 'Tranche 1 – macro stabilising, watch closely';
    advice.className = 'pill pill-ok';
  } else if (macroFired && breadthFired && !volFired) {
    advice.textContent = 'Tranche 1 + 2 – Taiwan & Korea both recovering, consider partial re-entry';
    advice.className = 'pill pill-ok';
  } else if (macroFired && breadthFired && volFired) {
    advice.textContent = 'All 3 confirmed – broad-based recovery, full re-entry into Veritas Asian';
    advice.className = 'pill pill-ok';
  } else {
    advice.textContent = 'Signals mixed – wait for confirmation before re-entering';
    advice.className = 'pill pill-risk';
  }

  setError('');
}

function setStatus(prefix, fired) {
  const badge = document.getElementById(prefix + 'StatusBadge');
  badge.textContent = fired ? 'FIRED' : 'WAIT';
  badge.className = fired ? 'status status-fired' : 'status status-wait';
}

// ------------------------------
// LOGGING
// ------------------------------
function getTrancheLog() {
  try {
    return JSON.parse(localStorage.getItem('trancheLog') || '[]');
  } catch {
    return [];
  }
}

function logTranche(n) {
  const log = getTrancheLog();
  log.push({ tranche: n, time: new Date().toLocaleString() });
  localStorage.setItem('trancheLog', JSON.stringify(log));
  renderLog();
}

function resetLog() {
  localStorage.removeItem('trancheLog');
  renderLog();
}

function renderLog() {
  const log = getTrancheLog();
  const box = document.getElementById('logBox');

  if (log.length === 0) {
    box.innerHTML = '<div style="color:#7c82a0;">No tranches recorded yet.</div>';
    return;
  }

  box.innerHTML = log.map(entry =>
    `<div class="log-entry">Tranche ${entry.tranche} re-entry recorded on <strong>${entry.time}</strong></div>`
  ).join('');
}

// ------------------------------
// TEST API KEYS
// ------------------------------
async function testApiKeys() {
  const statusEl = document.getElementById('apiStatus');
  statusEl.textContent = 'Testing…';

  const tests = [
    {
      name: 'Finnhub quote (IEF)',
      fn: () => fetch('/api/quote?symbol=IEF')
    },
    {
      name: 'Finnhub quote (VIXY)',
      fn: () => fetch('/api/quote?symbol=VIXY')
    },
    {
      name: 'Finnhub quote (EWT)',
      fn: () => fetch('/api/quote?symbol=EWT')
    },
    {
      name: 'Finnhub quote (EWY)',
      fn: () => fetch('/api/quote?symbol=EWY')
    },
    {
      name: 'Finnhub quote (TSM)',
      fn: () => fetch('/api/quote?symbol=TSM')
    },
    {
      name: 'FX (USD/JPY via open.er-api.com)',
      fn: () => fetch('https://open.er-api.com/v6/latest/USD')
    }
  ];

  const results = await Promise.all(tests.map(async t => {
    try {
      const res = await t.fn();
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return { name: t.name, ok: true };
    } catch (e) {
      return { name: t.name, ok: false, err: e.message };
    }
  }));

  const lines = results.map(r =>
    `${r.ok ? '✅' : '❌'} ${r.name}${r.ok ? '' : ' – ' + r.err}`
  );

  statusEl.innerHTML = lines
    .map(l => l.includes('✅')
      ? `<span class="ok">${l}</span>`
      : `<span class="fail">${l}</span>`
    )
    .join('<br>');
}

// ------------------------------
// INIT + EXPOSE FUNCTIONS
// ------------------------------
renderLog();
refreshAll();

window.testApiKeys = testApiKeys;
window.refreshAll = refreshAll;
window.logTranche = logTranche;
window.resetLog = resetLog;
window.toggleExplainer = toggleExplainer;

// ------------------------------
// AUTO‑REFRESH EVERY 15 MINUTES
// ------------------------------
setInterval(() => {
  console.log('Auto-refresh triggered');
  refreshAll();
}, 15 * 60 * 1000);
