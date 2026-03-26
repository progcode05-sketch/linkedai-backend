const Razorpay = require('razorpay');
const { setCors, verifyToken, supabase } = require('../_lib');

const rzp = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let user;
  try {
    user = await verifyToken(req);
  } catch (err) {
    return res.status(401).json({ error: err.message });
  }

  const { plan } = req.body || {};
  if (!plan || !['pro', 'max'].includes(plan)) {
    return res.status(400).json({ error: 'Invalid plan. Must be "pro" or "max".' });
  }

  const planId = plan === 'pro' ? process.env.RAZORPAY_PLAN_PRO : process.env.RAZORPAY_PLAN_MAX;
  if (!planId) return res.status(500).json({ error: 'Plan not configured on server' });

  try {
    // Cancel any existing subscription first
    if (user.razorpay_subscription_id) {
      try {
        await rzp.subscriptions.cancel(user.razorpay_subscription_id, true);
      } catch {
        // Ignore — might already be cancelled
      }
    }

    // Create new Razorpay subscription
    const subscription = await rzp.subscriptions.create({
      plan_id: planId,
      customer_notify: 1,
      total_count: 120, // 10 years — effectively indefinite
      notes: {
        user_id: user.id,
        plan
      }
    });

    // Store subscription ID on user row
    await supabase
      .from('users')
      .update({ razorpay_subscription_id: subscription.id })
      .eq('id', user.id);

    return res.status(200).json({
      subscription_id: subscription.id,
      key_id: process.env.RAZORPAY_KEY_ID,
      plan
    });

  } catch (err) {
    console.error('Subscribe error:', err);
    return res.status(500).json({ error: err.message || 'Failed to create subscription' });
  }
};
