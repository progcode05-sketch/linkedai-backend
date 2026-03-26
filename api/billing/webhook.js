const crypto = require('crypto');
const { supabase } = require('../_lib');

// Disable body parser so we get the raw body for signature verification
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

  const rawBody = await getRawBody(req);
  const signature = req.headers['x-razorpay-signature'];

  // Verify webhook signature
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  if (expected !== signature) {
    console.error('Webhook signature mismatch');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const eventType = event.event;
  const subscriptionEntity = event.payload?.subscription?.entity;

  if (!subscriptionEntity) return res.status(200).json({ received: true });

  const subscriptionId = subscriptionEntity.id;
  const notes = subscriptionEntity.notes || {};
  const plan = notes.plan; // 'pro' or 'max'

  try {
    if (eventType === 'subscription.activated' || eventType === 'subscription.charged') {
      // Payment succeeded — activate the plan
      if (plan && ['pro', 'max'].includes(plan)) {
        await supabase
          .from('users')
          .update({ subscription_status: plan })
          .eq('razorpay_subscription_id', subscriptionId);
      }

    } else if (
      eventType === 'subscription.cancelled' ||
      eventType === 'subscription.halted' ||
      eventType === 'subscription.completed'
    ) {
      // Subscription ended — revert to free
      await supabase
        .from('users')
        .update({
          subscription_status: 'free',
          razorpay_subscription_id: null
        })
        .eq('razorpay_subscription_id', subscriptionId);

    } else if (eventType === 'payment.failed') {
      // Check if it's a subscription payment failure
      const paymentEntity = event.payload?.payment?.entity;
      if (paymentEntity?.description?.includes('subscription')) {
        await supabase
          .from('users')
          .update({ subscription_status: 'free', razorpay_subscription_id: null })
          .eq('razorpay_subscription_id', paymentEntity.subscription_id);
      }
    }

    return res.status(200).json({ received: true });

  } catch (err) {
    console.error('Webhook handler error:', err);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
};
