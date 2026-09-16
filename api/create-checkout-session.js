export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return res.status(500).json({ error: 'Stripe is not configured yet. Add STRIPE_SECRET_KEY in Vercel.' });
  }

  const catalog = {
    'Greek Mezze Selection': { amount: 18, description: 'A selection of Greek mezze to share.' },
    'Grilled Octopus': { amount: 16, description: 'Charcoal grilled octopus with olive oil and lemon.' },
    'Sea Bass Fillet': { amount: 24, description: 'Fresh sea bass fillet with seasonal vegetables.' },
    'Truffle Orzo': { amount: 19, description: 'Creamy orzo with truffle and parmesan.' },
    'Mermaids Cheesecake': { amount: 9, description: 'Signature cheesecake dessert.' },
    'Chocolate Tart': { amount: 8, description: 'Dark chocolate tart with sea salt.' },
    'House Rosé Bottle': { amount: 28, description: 'Mermaids house rosé wine.' },
    'Signature Experience': { amount: 18, description: 'Mermaids Signature Experience.' }
  };

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const items = Array.isArray(body.items) ? body.items : [];

    if (!items.length) {
      return res.status(400).json({ error: 'Your cart is empty.' });
    }

    const safeItems = items.map((item) => {
      const name = String(item.name || '');
      const quantity = Number(item.quantity || 0);
      const product = catalog[name];

      if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
        throw new Error('Invalid cart item.');
      }

      return { name, quantity, ...product };
    });

    const origin = req.headers.origin || `https://${req.headers.host}`;
    const params = new URLSearchParams();
    params.set('mode', 'payment');
    params.set('success_url', `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`);
    params.set('cancel_url', `${origin}/shop.html`);
    params.set('billing_address_collection', 'auto');
    params.set('shipping_address_collection[allowed_countries][0]', 'GR');

    safeItems.forEach((item, index) => {
      params.set(`line_items[${index}][quantity]`, String(item.quantity));
      params.set(`line_items[${index}][price_data][currency]`, 'eur');
      params.set(`line_items[${index}][price_data][unit_amount]`, String(item.amount * 100));
      params.set(`line_items[${index}][price_data][product_data][name]`, item.name);
      params.set(`line_items[${index}][price_data][product_data][description]`, item.description);
    });

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
    return res.status(400).json({ error: error.message || 'Unable to create checkout session.' });
  }
}
