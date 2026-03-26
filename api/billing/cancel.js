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

  if (!user.razorpay_subscription_id) {
    return res.status(400).json({ error: 'No active subscription found' });
  }

  try {
    // Cancel at period end (cancel_at_cycle_end = true)
    await rzp.subscriptions.cancel(user.razorpay_subscription_id, true);

    // Immediately revert to free in our DB
    await supabase
      .from('users')
      .update({
        subscription_status: 'free',
        razorpay_subscription_id: null
      })
      .eq('id', user.id);

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Cancel error:', err);
    return res.status(500).json({ error: err.message || 'Cancellation failed' });
  }
};
