export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Keep the orders API pointed at the same Supabase project used by the
  // Mermaids frontend/database. The URL is public; the service-role key stays
  // server-side in Vercel environment variables.
  const supabaseUrl = 'https://kkucvaolsagjzhfkfypt.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const authHeader = req.headers.authorization || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!serviceKey || !accessToken) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  try {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!userResponse.ok) {
      return res.status(401).json({ error: 'Invalid authentication session.' });
    }

    const user = await userResponse.json();
    if (!user?.id) {
      return res.status(401).json({ error: 'Invalid authentication session.' });
    }

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
