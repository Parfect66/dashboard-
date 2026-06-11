export default async function handler(req, res) {
  try {
    let response = await fetch('https://open.er-api.com/v6/latest/USD');
    if (response.ok) {
      const data = await response.json();
      if (data?.rates?.JPY) {
        res.setHeader('Cache-Control', 's-maxage=60');
        return res.status(200).json({ price: data.rates.JPY, source: 'open.er-api.com' });
      }
    }

    response = await fetch('https://api.frankfurter.dev/v1/latest?from=USD&to=JPY');
    if (response.ok) {
      const data = await response.json();
      if (data?.rates?.JPY) {
        res.setHeader('Cache-Control', 's-maxage=60');
        return res.status(200).json({ price: data.rates.JPY, source: 'Frankfurter (ECB)' });
      }
    }

    return res.status(502).json({ error: 'All FX sources failed' });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
