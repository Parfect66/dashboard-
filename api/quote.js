export default async function handler(req, res) {
  const { symbol } = req.query;

  const allowed = ['GLD', 'GDX', 'TIP', 'UUP', 'VIXY', 'XLE', 'DBC', 'CPER', 'SPY'];
  if (!allowed.includes(symbol)) {
    return res.status(400).json({ error: 'Invalid symbol' });
  }

  const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${process.env.FINNHUB_KEY}`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    res.setHeader('Cache-Control', 's-maxage=30');
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
