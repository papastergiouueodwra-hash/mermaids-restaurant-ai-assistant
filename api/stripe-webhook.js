import crypto from 'crypto';

export const config = {
  api: { bodyParser: false }
};

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function verifyStripeSignature(payload, signature, secret) {
  if (!signature) return false;
  const parts = Object.fromEntries(
    signature.split(',').map((part) => {
      const [key, value] = part.split('=');
      return [key, value];
    })
  );
  if (!parts.t || !parts.v1) return false;

  const signedPayload = `${parts.t}.${payload}`;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!stripeSecret || !webhookSecret || !supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Webhook environment variables are not configured.' });
  }

  try {
    const rawBody = await getRawBody(req);
    const signature = req.headers['stripe-signature'];

    if (!verifyStripeSignature(rawBody.toString('utf8'), signature, webhookSecret)) {
      return res.status(400).json({ error: 'Invalid Stripe signature.' });
    }

    const event = JSON.parse(rawBody.toString('utf8'));

    if (event.type !== 'checkout.session.completed') {
      return res.status(200).json({ received: true });
    }

    const session = event.data.object;
    const sessionId = session.id;

    const existingResponse = await fetch(
      `${supabaseUrl}/rest/v1/orders?stripe_session_id=eq.${encodeURIComponent(sessionId)}&select=id`,
      {
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`
        }
      }
    );

    const existing = await existingResponse.json();
    if (Array.isArray(existing) && existing.length > 0) {
      return res.status(200).json({ received: true, duplicate: true });
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
      return res.status(500).json({ error: 'Unable to retrieve Stripe line items.' });
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
      payment_status: session.payment_status === 'paid' ? 'paid' : 'pending',
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
      return res.status(500).json({ error: 'Unable to save order to Supabase.' });
    }

    return res.status(200).json({ received: true, order_saved: true });
  } catch (error) {
    console.error('Stripe webhook error:', error);
    return res.status(500).json({ error: 'Webhook processing failed.' });
  }
}
