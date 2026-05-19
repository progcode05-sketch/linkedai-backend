const crypto = require('crypto');
const { supabase } = require('../_lib');

// Raw body required for signature verification
module.exports.config = {
  api: { bodyParser: false }
};

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody  = await getRawBody(req);
  const timestamp = req.headers['x-webhook-timestamp'];
  const signature = req.headers['x-webhook-signature'];

  // ── Cashfree signature: HMAC-SHA256(timestamp + rawBody) → base64 ──
  const signedPayload = timestamp + rawBody;
  const expected = crypto
    .createHmac('sha256', process.env.CASHFREE_SECRET_KEY)
    .update(signedPayload)
    .digest('base64');  // base64, NOT hex (different from Razorpay)

  if (expected !== signature) {
    console.error('Cashfree webhook signature mismatch');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const { type, data } = event;

  try {
    if (type === 'PAYMENT_SUCCESS_WEBHOOK') {
      const orderId = data?.order?.order_id;
      const plan    = data?.order?.order_tags?.plan;

      if (orderId && plan && ['pro', 'max'].includes(plan)) {
        await supabase
          .from('users')
          .update({ subscription_status: plan })
          .eq('razorpay_subscription_id', orderId);  // column reused for order_id
      }

    } else if (type === 'PAYMENT_FAILED_WEBHOOK') {
      const orderId = data?.order?.order_id;
      if (orderId) {
        // Clear pending order so user can retry
        await supabase
          .from('users')
          .update({ razorpay_subscription_id: null })
          .eq('razorpay_subscription_id', orderId);
      }

    } else if (type === 'REFUND_STATUS_WEBHOOK') {
      // Refund confirmed — revert plan to free
      const orderId = data?.refund?.order_id;
      if (orderId) {
        await supabase
          .from('users')
          .update({ subscription_status: 'free', razorpay_subscription_id: null })
          .eq('razorpay_subscription_id', orderId);
      }
    }

    // Always return 200 — Cashfree will retry on non-200
    return res.status(200).json({ received: true });

  } catch (err) {
    console.error('Webhook handler error:', err);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
};
