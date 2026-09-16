export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return res.status(500).json({ error: 'Stripe is not configured yet. Add STRIPE_SECRET_KEY in Vercel.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const amount = Number(body.amount || 1800);
    const product = String(body.product || 'Mermaids Signature Experience');
    const currency = String(body.currency || 'eur').toLowerCase();

    if (!Number.isInteger(amount) || amount < 50) {
      return res.status(400).json({ error: 'Invalid amount.' });
    }

    const origin = req.headers.origin || `https://${req.headers.host}`;
    const params = new URLSearchParams();
    params.set('mode', 'payment');
    params.set('success_url', `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`);
    params.set('cancel_url', `${origin}/shop.html`);
    params.set('line_items[0][quantity]', '1');
    params.set('line_items[0][price_data][currency]', currency);
    params.set('line_items[0][price_data][unit_amount]', String(amount));
    params.set('line_items[0][price_data][product_data][name]', product);
    params.set('line_items[0][price_data][product_data][description]', 'Mermaids Restaurant & Wine online purchase');
    params.set('billing_address_collection', 'auto');

    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const session = await stripeResponse.json();
    if (!stripeResponse.ok) {
      console.error('Stripe error:', session);
      return res.status(500).json({ error: session.error?.message || 'Stripe could not create the checkout session.' });
    }

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to create checkout session.' });
  }
}
