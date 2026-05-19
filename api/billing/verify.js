const { setCors, verifyToken, supabase } = require('../_lib');

const CASHFREE_BASE = process.env.CASHFREE_ENV === 'production'
  ? 'https://api.cashfree.com/pg'
  : 'https://sandbox.cashfree.com/pg';

function cfHeaders() {
  return {
    'x-api-version':   '2025-01-01',
    'x-client-id':     process.env.CASHFREE_APP_ID,
    'x-client-secret': process.env.CASHFREE_SECRET_KEY
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

  const { subscription_id } = req.body || {};
  if (!subscription_id) return res.status(400).json({ error: 'Missing subscription_id' });

  try {
    // Fetch subscription from Cashfree to confirm active status
    const cfRes = await fetch(`${CASHFREE_BASE}/subscriptions/${subscription_id}`, {
      headers: cfHeaders()
    });

    const sub = await cfRes.json();
    if (!cfRes.ok) throw new Error(sub.message || 'Failed to fetch subscription');

    // ACTIVE = mandate authorized and first charge done
    // ON_HOLD = mandate authorized, charge pending (also treat as active)
    const activeStatuses = ['ACTIVE', 'ON_HOLD'];
    if (!activeStatuses.includes(sub.status)) {
      return res.status(400).json({
        error: `Subscription not active. Status: ${sub.status}`
      });
    }

    const plan = sub.subscription_tags?.plan;
    if (!plan || !['pro', 'max'].includes(plan)) {
      return res.status(400).json({ error: 'Could not determine plan from subscription' });
    }

    // Activate plan in Supabase
    await supabase
      .from('users')
      .update({ subscription_status: plan })
      .eq('id', user.id);

    return res.status(200).json({ success: true, plan });

  } catch (err) {
    console.error('Verify error:', err);
    return res.status(500).json({ error: err.message || 'Verification failed' });
  }
};
