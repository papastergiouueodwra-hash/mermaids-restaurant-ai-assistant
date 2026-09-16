export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sessionId = String(req.query?.session_id || '');
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!stripeSecret || !supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Payment verification is not configured.' });
  }

  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
    return res.status(400).json({ error: 'Invalid checkout session.' });
  }

  try {
    const sessionResponse = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${stripeSecret}:`).toString('base64')}`
        }
      }
    );

    const session = await sessionResponse.json();
    if (!sessionResponse.ok) {
      console.error('Stripe session lookup error:', session);
      return res.status(400).json({ error: 'Unable to verify the payment session.' });
    }

    if (session.payment_status !== 'paid') {
      return res.status(200).json({ paid: false, status: session.payment_status || 'unpaid' });
    }

    const existingResponse = await fetch(
      `${supabaseUrl}/rest/v1/orders?stripe_session_id=eq.${encodeURIComponent(sessionId)}&select=id`,
      {
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`
        }
      }
    );

    if (!existingResponse.ok) {
      const error = await existingResponse.text();
      console.error('Supabase duplicate check error:', error);
      return res.status(500).json({ error: 'Unable to check the order.' });
    }

    const existing = await existingResponse.json();
    if (Array.isArray(existing) && existing.length > 0) {
      return res.status(200).json({ paid: true, order_saved: true, duplicate: true });
    }

    const lineItemsResponse = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}/line_items?limit=100`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${stripeSecret}:`).toString('base64')}`
        }
      }
    );

    if (!lineItemsResponse.ok) {
      const error = await lineItemsResponse.text();
      console.error('Stripe line items error:', error);
      return res.status(500).json({ error: 'Unable to retrieve the order items.' });
    }

    const lineItems = await lineItemsResponse.json();
    const items = (lineItems.data || []).map((item) => ({
      name: item.description || item.price?.product || 'Item',
      quantity: item.quantity || 1,
      unit_amount: item.price?.unit_amount || 0,
      amount: (item.amount_total || 0) / 100,
      currency: item.currency || 'eur'
    }));

    const order = {
      customer_email: session.customer_details?.email || session.customer_email || null,
      items,
      total_amount: (session.amount_total || 0) / 100,
      currency: session.currency || 'eur',
      payment_status: 'paid',
      stripe_session_id: sessionId
    };

    const insertResponse = await fetch(`${supabaseUrl}/rest/v1/orders`, {
      method: 'POST',
      headers: {
        apikey: supabaseServiceKey,
        Authorization: `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(order)
    });

    if (!insertResponse.ok) {
      const error = await insertResponse.text();
      console.error('Supabase order insert error:', error);
      return res.status(500).json({ error: 'Unable to save the paid order.' });
    }

    return res.status(200).json({ paid: true, order_saved: true });
  } catch (error) {
    console.error('Checkout verification error:', error);
    return res.status(500).json({ error: 'Payment verification failed.' });
  }
}
