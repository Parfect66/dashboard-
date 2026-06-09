// FINNHUB KEY
const FINNHUB_KEY = 'd8k39o9r01qjgd6qtjvgd8k39o9r01qjgd6qtk00';

const state = { macro: null, breadth: null, vol: null };
let missingSymbols = [];

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
  const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_KEY}`;
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
// FX (exchangerate.host)
// ------------------------------
async function getFx() {
  const url = `https://api.exchangerate.host/latest?base=USD&symbols=JPY`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data || !data.rates || !data.rates.JPY) throw new Error('Invalid FX data');

    return { price: data.rates.JPY };
  } catch (e) {
    console.error('FX error:', e);
    return null;
  }
}

// ------------------------------
// MACRO BLOCK
// ------------------------------
async function fetchMacroBlock() {
  const ief = await getQuote('IEF');
  const fx = await getFx();

  if (!ief) {
    missingSymbols.push('IEF');
    state.macro = null;
    return;
  }

  const current = ief.price;
  const prev = ief.previousClose;
  const change = current - prev;
  const pct = (change / prev) * 100;

  let yieldTrend = 'flat';
  if (change > 0.15) yieldTrend = 'rising';
  if (change < -0.15) yieldTrend = 'falling';

  document.getElementById('iefValue').textContent = current.toFixed(2);
  document.getElementById('iefChange').textContent =
    `${change >= 0 ? '+' : ''}${change.toFixed(2)} (${pct.toFixed(2)}%)`;
  document.getElementById('yieldTrendText').textContent = yieldTrend;
  document.getElementById('iefSource').textContent = 'Source: Finnhub';

  if (fx) {
    document.getElementById('usdJpyText').textContent = fx.price.toFixed(3);
    document.getElementById('fxSource').textContent = 'Source: exchangerate.host';
  } else {
    document.getElementById('usdJpyText').textContent = 'n/a';
    document.getElementById('fxSource').textContent = 'Source: n/a';
  }

  state.macro = { yieldTrend };
}

// ------------------------------
// BREADTH BLOCK
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
// VOL BLOCK
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
    if (change > 0.5) vixRegime = 'rising';

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
// EVALUATE SIGNALS
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

  const macroFired =
    (macro.yieldTrend === 'flat' || macro.yieldTrend === 'falling');

  const breadthFired =
    breadth.semisBreadth === 'equalOutperform' &&
    breadth.chinaTech !== 'weak';

  const volFired =
    (vol.vixRegime === 'falling' || vol.vixRegime === 'near') &&
    vol.eemTrend !== 'falling';

  setStatus('macro', macroFired);
  setStatus('breadth', breadthFired);
  setStatus('vol', volFired);

  document.getElementById('macroStatusText').textContent = macroFired ? 'FIRED' : 'WAIT';
  document.getElementById('breadthStatusText').textContent = breadthFired ? 'FIRED' : 'WAIT';
  document.getElementById('volStatusText').textContent = volFired ? 'FIRED' : 'WAIT';

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
    advice.class
