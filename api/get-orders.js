export default async function handler(req, res) {
  const allowedOrigin = 'https://papastergiouueodwra-hash.github.io';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = 'https://kkucvaolsagjzhfkfypt.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return res.status(500).json({ error: 'Order service is not configured.' });
  }

  try {
    const ordersResponse = await fetch(
      `${supabaseUrl}/rest/v1/orders?select=id,created_at,customer_email,items,total_amount,currency,payment_status,stripe_session_id&order=created_at.desc&limit=200`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`
        }
      }
    );

    if (!ordersResponse.ok) {
      const error = await ordersResponse.text();
      console.error('Supabase orders read error:', error);
      return res.status(500).json({ error: 'Unable to load orders.' });
    }

    const orders = await ordersResponse.json();
    return res.status(200).json({ orders: Array.isArray(orders) ? orders : [] });
  } catch (error) {
    console.error('Get orders error:', error);
    return res.status(500).json({ error: 'Unable to load orders.' });
  }
}
