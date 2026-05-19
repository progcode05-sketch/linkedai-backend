const { setCors, verifyToken, supabase } = require('../_lib');

// Cashfree doesn't have recurring subscriptions in this integration —
// cancellation is handled by clearing the user's plan in Supabase.
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

  if (!user.subscription_status || user.subscription_status === 'free') {
    return res.status(400).json({ error: 'No active subscription to cancel.' });
  }

  try {
    await supabase
      .from('users')
      .update({
        subscription_status:      'free',
        razorpay_subscription_id: null
      })
      .eq('id', user.id);

    return res.status(200).json({ success: true, status: 'cancelled' });

  } catch (err) {
    console.error('Cancel error:', err);
    return res.status(500).json({ error: err.message || 'Cancellation failed' });
  }
};
