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
    fetchVolBlock()
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
    return { price: data.c, previousClose: data.pc };
  } catch {
    return null;
  }
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
  const primary = 'https://api.exchangerate.host/latest?base=USD&symbols=JPY&places=6';
  const fallback1 = 'https://api.exchangerate.host/ecb?base=USD&symbols=JPY';

  try {
    let res = await fetch(primary);
    if (res.ok) {
      let data = await res.json();
      if (data?.rates?.JPY) return { price: data.rates.JPY, source: 'exchangerate.host' };
    }

    res = await fetch(fallback1);
    if (res.ok) {
      let data = await res.json();
      if (data?.rates?.JPY) return { price: data.rates.JPY, source: 'ECB' };
    }

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

    if (diff > 0.3) usdJpyTrend = 'usdSurging';
    else if (diff < -0.3) usdJpyTrend = 'usdFalling';
    else usdJpyTrend = 'stable';

    prevFxPrice = fx.price;
    localStorage.setItem('prevFxPrice', String(prevFxPrice));

    document.getElementById('usdJpyText').textContent = fx.price.toFixed(3);
    document.getElementById('fxSource').textContent = `Source: ${fx.source}`;
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
// BREADTH BLOCK (strict)
// ------------------------------
async function fetchBreadthBlock() {
  const soxx = await getQuote('SOXX');
  const xsd = await getQuote('XSD');
  const kweb = await getQuote('KWEB');

  let semisBreadth = 'neutral';
  if (soxx && xsd && soxx.previousClose && xsd.previousClose) {
    const soxxRet = (soxx.price - soxx.previousClose) / soxx.previousClose;
    const xsdRet = (xsd.price - xsd.previousClose) / xsd.previousClose;
    const diff = xsdRet - soxxRet;

    if (diff > 0.005) semisBreadth = 'equalOutperform';
    else if (diff < -0.005) semisBreadth = 'equalUnderperform';
  } else {
    missingSymbols.push('SOXX/XSD');
  }

  document.getElementById('semisBreadthText').textContent = semisBreadth;
  document.getElementById('semisSource').textContent = 'Source: Finnhub';

  let chinaTech = 'sideways';
  if (kweb && kweb.previousClose) {
    const ret = (kweb.price - kweb.previousClose) / kweb.previousClose;
    if (ret > 0.01) chinaTech = 'recovering';
    else if (ret < -0.01) chinaTech = 'weak';
  } else {
    missingSymbols.push('KWEB');
  }

  document.getElementById('chinaTechText').textContent = chinaTech;
  document.getElementById('kwebSource').textContent = 'Source: Finnhub';

  state.breadth = { semisBreadth, chinaTech };

  document.getElementById('breadthExplainer').innerHTML = `
    <div><strong>Semis breadth:</strong> ${semisBreadth}</div>
    <div><strong>China tech:</strong> ${chinaTech}</div>
  `;
}

// ------------------------------
// VOL BLOCK (strict)
// ------------------------------
async function fetchVolBlock() {
  const vixy = await getQuote('VIXY');
  const eem = await getQuote('EEM');

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

  let eemTrend = 'flat';
  if (eem && eem.previousClose) {
    const ret = (eem.price - eem.previousClose) / eem.previousClose;
    if (ret > 0.007) eemTrend = 'rising';
    else if (ret < -0.007) eemTrend = 'falling';
  } else {
    missingSymbols.push('EEM');
  }

  document.getElementById('eemText').textContent = eemTrend;
  document.getElementById('eemSource').textContent = 'Source: Finnhub';

  state.vol = { vixRegime, eemTrend };

  document.getElementById('volExplainer').innerHTML = `
    <div><strong>VIXY trend:</strong> ${vixRegime}</div>
    <div><strong>EEM trend:</strong> ${eemTrend}</div>
  `;
}

// ------------------------------
// EVALUATE SIGNALS (strict + scoring + drift)
// ------------------------------
function evaluateSignals() {
  const coreMissing = missingSymbols.filter(s =>
    ['IEF', 'SOXX/XSD', 'KWEB', 'VIXY', 'EEM'].includes(s)
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
    breadth.semisBreadth === 'equalOutperform' &&
    breadth.chinaTech === 'recovering';

  const volFired =
    vol.vixRegime === 'falling' &&
    vol.eemTrend === 'rising';

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
  else if (breadth.semisBreadth === 'equalOutperform' || breadth.chinaTech === 'recovering')
    breadthScore = 50;

  let volScore = 0;
  if (volFired) volScore = 100;
  else if (vol.vixRegime === 'falling' && vol.eemTrend === 'flat') volScore = 50;

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
    advice.textContent = 'No tranche unlocked – stay defensive';
    advice.className = 'pill pill-wait';
  } else if (macroFired && !breadthFired && !volFired) {
    advice.textContent = 'Tranche 1 unlocked – £150–200k into Asia';
    advice.className = 'pill pill-ok';
  } else if (macroFired && breadthFired && !volFired) {
    advice.textContent = 'Tranche 1 + 2 unlocked – up to ~£400k deployed';
    advice.className = 'pill pill-ok';
  } else if (macroFired && breadthFired && volFired) {
    advice.textContent = 'All 3 tranches unlocked – up to £550k growth sleeve available';
    advice.className = 'pill pill-ok';
  } else {
    advice.textContent = 'Signals mixed – size smaller than usual';
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
    `<div class="log-entry">Tranche ${entry.tranche} deployed on <strong>${entry.time}</strong></div>`
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
      name: 'FX (USD/JPY via exchangerate.host)',
      fn: () => fetch('https://api.exchangerate.host/latest?base=USD&symbols=JPY&places=6')
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
