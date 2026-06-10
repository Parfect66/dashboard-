// ------------------------------
// CONFIG
// ------------------------------
const SYMBOLS = ['GLD', 'GDX', 'TIP', 'UUP', 'VIXY', 'XLE', 'DBC', 'CPER', 'SPY'];

const SNAPSHOT_KEY = 'goldDash_snapshot';
const SCORES_KEY = 'goldDash_scores';
const LOG_KEY = 'goldDash_log';

// % move (since last check-in) needed before a driver is treated as
// "rising" / "falling" rather than "stable"
const THRESH = {
  TIP: 1.5,
  UUP: 1.5,
  VIXY: 8,
  RATIO: 2,
  DBC: 2,
  XLE: 2,
  CPER: 2,
  SPY: 2
};

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

function setBadge(id, kind, text) {
  const badge = document.getElementById(id);
  badge.textContent = text;
  badge.className = 'status status-' + kind;
}

function setScoreMarker(id, score) {
  const marker = document.getElementById(id);
  marker.style.left = `${Math.max(0, Math.min(100, score))}%`;
}

function fmtPct(pct) {
  if (pct === null || pct === undefined) return 'n/a';
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
}

function fmtPP(pct) {
  if (pct === null || pct === undefined) return 'n/a';
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}pp`;
}

function fmtPrice(price, pct) {
  const pctStr = pct === null || pct === undefined ? '' : ` (${fmtPct(pct)})`;
  return `${price.toFixed(2)}${pctStr}`;
}

function pctChange(current, previous) {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

function scoreFromChange(pct, threshold, risingScore, fallingScore, stableScore = 50) {
  if (pct > threshold) return risingScore;
  if (pct < -threshold) return fallingScore;
  return stableScore;
}

// ------------------------------
// QUOTES (via /api/quote proxy)
// ------------------------------
async function fetchQuote(symbol) {
  try {
    const res = await fetch(`/api/quote?symbol=${symbol}`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data || typeof data.c !== 'number' || data.c === 0) throw new Error('Invalid quote');
    return data.c;
  } catch {
    return null;
  }
}

// ------------------------------
// REFRESH ALL
// ------------------------------
async function refreshAll() {
  setError('');

  const prices = {};
  const missing = [];

  await Promise.all(SYMBOLS.map(async sym => {
    const price = await fetchQuote(sym);
    if (price === null) missing.push(sym);
    else prices[sym] = price;
  }));

  if (missing.length > 0) {
    setError('Missing data for: ' + missing.join(', '));
    return;
  }

  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || 'null');
  } catch {
    stored = null;
  }

  const prev = stored ? stored.prices : null;
  const changes = {};
  SYMBOLS.forEach(sym => {
    changes[sym] = prev ? pctChange(prices[sym], prev[sym]) : null;
  });

  document.getElementById('gldValue').textContent = fmtPrice(prices.GLD, changes.GLD);
  document.getElementById('gdxValue').textContent = fmtPrice(prices.GDX, changes.GDX);
  document.getElementById('tipValue').textContent = fmtPrice(prices.TIP, changes.TIP);
  document.getElementById('uupValue').textContent = fmtPrice(prices.UUP, changes.UUP);
  document.getElementById('vixyValue').textContent = fmtPrice(prices.VIXY, changes.VIXY);
  document.getElementById('dbcValue').textContent = fmtPrice(prices.DBC, changes.DBC);
  document.getElementById('xleValue').textContent = fmtPrice(prices.XLE, changes.XLE);
  document.getElementById('cperValue').textContent = fmtPrice(prices.CPER, changes.CPER);
  document.getElementById('spyValue').textContent = fmtPrice(prices.SPY, changes.SPY);

  document.getElementById('lastChecked').textContent =
    'Last checked: ' + new Date().toLocaleString();
  document.getElementById('comparedTo').textContent = stored
    ? 'Comparing to: ' + new Date(stored.date).toLocaleString()
    : 'First check-in — baseline set. Refresh again later to see trend signals.';

  if (!stored) {
    setBaselineUI();
  } else {
    evaluateGold(changes);
    evaluateNR(changes);
  }

  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ date: new Date().toISOString(), prices }));
}

function setBaselineUI() {
  document.getElementById('goldScore').textContent = '–';
  document.getElementById('goldDrift').textContent = '–';
  setBadge('goldRegimeBadge', 'neutral', 'BASELINE');
  setScoreMarker('goldScoreMarker', 50);
  document.getElementById('goldAdvice').textContent =
    'Baseline set — refresh again later (e.g. next month) to see directional signals.';
  document.getElementById('goldExplainer').innerHTML = '';

  document.getElementById('nrScore').textContent = '–';
  document.getElementById('nrDrift').textContent = '–';
  setBadge('nrRegimeBadge', 'neutral', 'BASELINE');
  setScoreMarker('nrScoreMarker', 50);
  document.getElementById('nrAdvice').textContent =
    'Baseline set — refresh again later (e.g. next month) to see directional signals.';
  document.getElementById('nrExplainer').innerHTML = '';
}

// ------------------------------
// GOLD / MINING SIGNAL (BlackRock Gold & General)
// ------------------------------
function evaluateGold(changes) {
  // Real yields proxy: TIP rising = real yields falling = bullish gold
  const realYieldScore = scoreFromChange(changes.TIP, THRESH.TIP, 100, 0);
  const realYieldLabel = changes.TIP > THRESH.TIP
    ? 'Real yields likely falling (bullish for gold)'
    : changes.TIP < -THRESH.TIP
      ? 'Real yields likely rising (bearish for gold)'
      : 'Real yields broadly stable';

  // USD: UUP falling = USD weakening = bullish gold
  const usdScore = scoreFromChange(changes.UUP, THRESH.UUP, 0, 100);
  const usdLabel = changes.UUP > THRESH.UUP
    ? 'USD strengthening (headwind for gold)'
    : changes.UUP < -THRESH.UUP
      ? 'USD weakening (tailwind for gold)'
      : 'USD broadly stable';

  // Risk sentiment: VIXY rising = risk-off = safe-haven bid for gold
  const riskScore = scoreFromChange(changes.VIXY, THRESH.VIXY, 100, 30);
  const riskLabel = changes.VIXY > THRESH.VIXY
    ? 'Risk-off move — safe-haven demand likely supportive of gold'
    : changes.VIXY < -THRESH.VIXY
      ? 'Risk-on move — less safe-haven demand for gold'
      : 'Risk sentiment broadly stable';

  // Mining leverage: GDX outperforming GLD + falling energy costs = favourable operating leverage
  const ratioDiff = changes.GDX - changes.GLD;
  let miningScore = 50;
  let miningLabel = 'Mining equity leverage mixed vs gold price';
  if (ratioDiff > THRESH.RATIO && changes.XLE < 0) {
    miningScore = 100;
    miningLabel = 'Miners outperforming gold with falling energy costs (favourable operating leverage)';
  } else if (ratioDiff < -THRESH.RATIO && changes.XLE > 0) {
    miningScore = 0;
    miningLabel = 'Miners lagging gold with rising energy costs (unfavourable operating leverage)';
  }

  const goldScore = Math.round(
    realYieldScore * 0.30 +
    usdScore * 0.25 +
    riskScore * 0.15 +
    miningScore * 0.30
  );

  document.getElementById('goldScore').textContent = goldScore + '/100';
  setScoreMarker('goldScoreMarker', goldScore);

  let regimeKind, regimeText, advice;
  if (goldScore >= 65) {
    regimeKind = 'fired';
    regimeText = 'ADD';
    advice = 'Tailwinds favourable — consider increasing allocation to BlackRock Gold & General.';
  } else if (goldScore >= 35) {
    regimeKind = 'neutral';
    regimeText = 'HOLD';
    advice = 'Mixed signals — hold current allocation.';
  } else {
    regimeKind = 'risk';
    regimeText = 'TRIM';
    advice = 'Headwinds dominant — consider trimming allocation to BlackRock Gold & General.';
  }

  setBadge('goldRegimeBadge', regimeKind, regimeText);
  document.getElementById('goldAdvice').textContent = advice;

  document.getElementById('goldExplainer').innerHTML = `
    <div><strong>Real yields (TIP):</strong> ${fmtPct(changes.TIP)} — ${realYieldLabel}</div>
    <div><strong>USD (UUP):</strong> ${fmtPct(changes.UUP)} — ${usdLabel}</div>
    <div><strong>Risk sentiment (VIXY):</strong> ${fmtPct(changes.VIXY)} — ${riskLabel}</div>
    <div><strong>Mining leverage (GDX vs GLD):</strong> ${fmtPP(ratioDiff)}, energy ${fmtPct(changes.XLE)} — ${miningLabel}</div>
  `;

  renderDrift('goldDrift', goldScore, 'goldScore');
}

// ------------------------------
// NATURAL RESOURCES SIGNAL (JPM Natural Resources)
// ------------------------------
function evaluateNR(changes) {
  const commodityScore = scoreFromChange(changes.DBC, THRESH.DBC, 100, 0);
  const commodityLabel = changes.DBC > THRESH.DBC
    ? 'Broad commodities rising (tailwind)'
    : changes.DBC < -THRESH.DBC
      ? 'Broad commodities falling (headwind)'
      : 'Broad commodities broadly stable';

  const energyScore = scoreFromChange(changes.XLE, THRESH.XLE, 100, 0);
  const energyLabel = changes.XLE > THRESH.XLE
    ? 'Energy prices rising (tailwind)'
    : changes.XLE < -THRESH.XLE
      ? 'Energy prices falling (headwind)'
      : 'Energy prices broadly stable';

  const metalsScore = scoreFromChange(changes.CPER, THRESH.CPER, 100, 0);
  const metalsLabel = changes.CPER > THRESH.CPER
    ? 'Industrial metals rising — demand/growth picking up (tailwind)'
    : changes.CPER < -THRESH.CPER
      ? 'Industrial metals falling — demand/growth softening (headwind)'
      : 'Industrial metals broadly stable';

  const equityScore = scoreFromChange(changes.SPY, THRESH.SPY, 100, 0);
  const equityLabel = changes.SPY > THRESH.SPY
    ? 'Broad equities rising — supportive risk appetite'
    : changes.SPY < -THRESH.SPY
      ? 'Broad equities falling — risk appetite weak'
      : 'Broad equities broadly stable';

  const nrScore = Math.round(
    commodityScore * 0.35 +
    energyScore * 0.25 +
    metalsScore * 0.20 +
    equityScore * 0.20
  );

  document.getElementById('nrScore').textContent = nrScore + '/100';
  setScoreMarker('nrScoreMarker', nrScore);

  let regimeKind, regimeText, advice;
  if (nrScore >= 65) {
    regimeKind = 'fired';
    regimeText = 'ADD';
    advice = 'Commodity cycle tailwinds favourable — consider increasing allocation to JPM Natural Resources.';
  } else if (nrScore >= 35) {
    regimeKind = 'neutral';
    regimeText = 'HOLD';
    advice = 'Mixed signals — hold current allocation.';
  } else {
    regimeKind = 'risk';
    regimeText = 'TRIM';
    advice = 'Commodity cycle headwinds dominant — consider trimming allocation to JPM Natural Resources.';
  }

  setBadge('nrRegimeBadge', regimeKind, regimeText);
  document.getElementById('nrAdvice').textContent = advice;

  document.getElementById('nrExplainer').innerHTML = `
    <div><strong>Broad commodities (DBC):</strong> ${fmtPct(changes.DBC)} — ${commodityLabel}</div>
    <div><strong>Energy (XLE):</strong> ${fmtPct(changes.XLE)} — ${energyLabel}</div>
    <div><strong>Industrial metals (CPER):</strong> ${fmtPct(changes.CPER)} — ${metalsLabel}</div>
    <div><strong>Equity market (SPY):</strong> ${fmtPct(changes.SPY)} — ${equityLabel}</div>
  `;

  renderDrift('nrDrift', nrScore, 'nrScore');
}

// ------------------------------
// SCORE DRIFT (vs previous check-in)
// ------------------------------
function renderDrift(elementId, currentScore, key) {
  let prevScores = {};
  try {
    prevScores = JSON.parse(localStorage.getItem(SCORES_KEY) || '{}');
  } catch {
    prevScores = {};
  }

  const el = document.getElementById(elementId);
  if (typeof prevScores[key] !== 'number') {
    el.innerHTML = '<span style="color:#888;">No previous score yet</span>';
  } else {
    const diff = currentScore - prevScores[key];
    if (diff > 0) {
      el.innerHTML = `<span style="color:#00c853;">+${diff}</span>`;
    } else if (diff < 0) {
      el.innerHTML = `<span style="color:#d50000;">${diff}</span>`;
    } else {
      el.innerHTML = '<span style="color:#888;">No change</span>';
    }
  }

  prevScores[key] = currentScore;
  localStorage.setItem(SCORES_KEY, JSON.stringify(prevScores));
}

// ------------------------------
// POSITION LOG
// ------------------------------
function getLog() {
  try {
    return JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
  } catch {
    return [];
  }
}

function logAction(action) {
  const log = getLog();
  log.push({ action, time: new Date().toLocaleString() });
  localStorage.setItem(LOG_KEY, JSON.stringify(log));
  renderLog();
}

function resetLog() {
  localStorage.removeItem(LOG_KEY);
  renderLog();
}

function renderLog() {
  const log = getLog();
  const box = document.getElementById('logBox');

  if (log.length === 0) {
    box.innerHTML = '<div style="color:#7c82a0;">No actions recorded yet.</div>';
    return;
  }

  box.innerHTML = log.map(entry =>
    `<div class="log-entry">${entry.action} on <strong>${entry.time}</strong></div>`
  ).join('');
}

// ------------------------------
// TEST API KEYS
// ------------------------------
async function testApiKeys() {
  const statusEl = document.getElementById('apiStatus');
  statusEl.textContent = 'Testing…';

  const results = await Promise.all(SYMBOLS.map(async sym => {
    try {
      const res = await fetch(`/api/quote?symbol=${sym}`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (typeof data.c !== 'number') throw new Error('Invalid quote');
      return { name: sym, ok: true };
    } catch (e) {
      return { name: sym, ok: false, err: e.message };
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

window.refreshAll = refreshAll;
window.testApiKeys = testApiKeys;
window.logAction = logAction;
window.resetLog = resetLog;
window.toggleExplainer = toggleExplainer;
