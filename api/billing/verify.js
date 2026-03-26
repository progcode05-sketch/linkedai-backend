const crypto = require('crypto');
const { setCors, verifyToken, supabase } = require('../_lib');

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

  const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature } = req.body || {};
  if (!razorpay_payment_id || !razorpay_subscription_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment fields' });
  }

  try {
    // Verify Razorpay payment signature
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_payment_id}|${razorpay_subscription_id}`)
      .digest('hex');

    if (expected !== razorpay_signature) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    // Determine which plan this subscription belongs to
    // (webhook will also do this, but this is belt-and-suspenders)
    const { data: userRow } = await supabase
      .from('users')
      .select('razorpay_subscription_id')
      .eq('id', user.id)
      .single();

    // Read plan from the Razorpay subscription notes if needed
    // For now trust the user's current pending subscription
    // The webhook event will set the actual plan — but we can optimistically set it here too
    // by reading the subscription from Razorpay
    const Razorpay = require('razorpay');
    const rzp = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });

    const subscription = await rzp.subscriptions.fetch(razorpay_subscription_id);
    const plan = subscription.notes?.plan;

    if (plan && ['pro', 'max'].includes(plan)) {
      await supabase
        .from('users')
        .update({ subscription_status: plan })
        .eq('id', user.id);
    }

    return res.status(200).json({ success: true, plan: plan || 'pro' });

  } catch (err) {
    console.error('Verify error:', err);
    return res.status(500).json({ error: err.message || 'Verification failed' });
  }
};
