const { setCors, verifyToken, supabase } = require('../_lib');

const CASHFREE_BASE = process.env.CASHFREE_ENV === 'production'
  ? 'https://api.cashfree.com/pg'
  : 'https://sandbox.cashfree.com/pg';

function cfHeaders() {
  return {
    'x-api-version':   '2025-01-01',
    'x-client-id':     process.env.CASHFREE_APP_ID,
    'x-client-secret': process.env.CASHFREE_SECRET_KEY,
    'Content-Type':    'application/json'
  };
}

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

  const subscriptionId = user.razorpay_subscription_id;

  try {
    // Cancel on Cashfree if subscription ID exists
    if (subscriptionId) {
      const cfRes = await fetch(
        `${CASHFREE_BASE}/subscriptions/${subscriptionId}/cancel`,
        { method: 'POST', headers: cfHeaders() }
      );

      if (!cfRes.ok) {
        const cfData = await cfRes.json().catch(() => ({}));
        // Log but don't block — still revoke access in DB below
        console.error('Cashfree cancel failed:', cfData.message);
      }
    }

    // Revoke plan in Supabase regardless of Cashfree response
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
