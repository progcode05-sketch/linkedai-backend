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

  const { order_id } = req.body || {};
  if (!order_id) return res.status(400).json({ error: 'Missing order_id' });

  try {
    // Fetch order from Cashfree to confirm PAID status
    const cfRes = await fetch(`${CASHFREE_BASE}/orders/${order_id}`, {
      headers: cfHeaders()
    });

    const order = await cfRes.json();
    if (!cfRes.ok) throw new Error(order.message || 'Failed to fetch order from Cashfree');

    if (order.order_status !== 'PAID') {
      return res.status(400).json({
        error: `Payment not complete. Status: ${order.order_status}`
      });
    }

    // Plan is stored in order_tags when order was created
    const plan = order.order_tags?.plan;
    if (!plan || !['pro', 'max'].includes(plan)) {
      return res.status(400).json({ error: 'Could not determine plan from order' });
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
