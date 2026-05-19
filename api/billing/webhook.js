const crypto = require('crypto');
const { supabase } = require('../_lib');

// Raw body required for Cashfree signature verification
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

  const rawBody   = await getRawBody(req);
  const timestamp = req.headers['x-webhook-timestamp'];
  const signature = req.headers['x-webhook-signature'];

  // ── Cashfree signature: HMAC-SHA256(timestamp + rawBody) → base64 ──────────
  const signedPayload = timestamp + rawBody;
  const expected = crypto
    .createHmac('sha256', process.env.CASHFREE_SECRET_KEY)
    .update(signedPayload)
    .digest('base64');  // base64, NOT hex

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

  // ── Helper: get subscription ID from event data ────────────────────────────
  const getSubId = () =>
    data?.subscription?.subscription_id ||
    data?.subscription_id ||
    data?.order?.order_id;

  // ── Helper: get plan from subscription tags ────────────────────────────────
  const getPlan = () =>
    data?.subscription?.subscription_tags?.plan ||
    data?.subscription_tags?.plan;

  try {
    switch (type) {

      // ── Mandate authorized + first payment done → activate plan ────────────
      case 'SUBSCRIPTION_ACTIVATED':
      case 'SUBSCRIPTION_PAYMENT_SUCCESS':
      case 'subscription.activated':
      case 'subscription.payment_success': {
        const subId = getSubId();
        const plan  = getPlan();
        if (subId && plan && ['pro', 'max'].includes(plan)) {
          await supabase
            .from('users')
            .update({ subscription_status: plan })
            .eq('razorpay_subscription_id', subId);
        }
        break;
      }

      // ── Subscription cancelled / failed / completed → revert to free ───────
      case 'SUBSCRIPTION_CANCELLED':
      case 'SUBSCRIPTION_PAYMENT_FAILED':
      case 'SUBSCRIPTION_COMPLETED':
      case 'subscription.cancelled':
      case 'subscription.payment_failed':
      case 'subscription.completed': {
        const subId = getSubId();
        if (subId) {
          await supabase
            .from('users')
            .update({
              subscription_status:      'free',
              razorpay_subscription_id: null
            })
            .eq('razorpay_subscription_id', subId);
        }
        break;
      }

      // ── New subscription created / authorized — no plan change yet ─────────
      case 'SUBSCRIPTION_NEW':
      case 'SUBSCRIPTION_AUTHORIZED':
      case 'subscription.new':
      case 'subscription.authorized':
        // Handled by verify.js when user returns to pay.html
        break;

      default:
        // Unknown event — log and ignore
        console.log('Unhandled Cashfree webhook event:', type);
    }

    // Always return 200 — Cashfree retries on non-200
    return res.status(200).json({ received: true });

  } catch (err) {
    console.error('Webhook handler error:', err);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
};
