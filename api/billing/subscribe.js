const { setCors, verifyToken, supabase } = require('../_lib');

const CASHFREE_BASE = process.env.CASHFREE_ENV === 'production'
  ? 'https://api.cashfree.com/pg'
  : 'https://sandbox.cashfree.com/pg';

const PLAN_IDS = {
  pro: process.env.CASHFREE_PLAN_PRO,
  max: process.env.CASHFREE_PLAN_MAX
};

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

  const { plan } = req.body || {};
  if (!plan || !['pro', 'max'].includes(plan)) {
    return res.status(400).json({ error: 'Invalid plan. Must be "pro" or "max".' });
  }

  const planId = PLAN_IDS[plan];
  if (!planId) {
    return res.status(500).json({ error: 'Plan not configured on server.' });
  }

  // Unique subscription ID — embed plan + user so webhook can recover context
  const subscriptionId = `lnk_${plan}_${user.id}_${Date.now()}`;

  try {
    const cfRes = await fetch(`${CASHFREE_BASE}/subscriptions`, {
      method: 'POST',
      headers: cfHeaders(),
      body: JSON.stringify({
        subscription_id:      subscriptionId,
        plan_id:              planId,
        authorization_amount: 0,  // ₹0 auth — no charge during mandate setup
        customer_details: {
          customer_id:    user.id,
          customer_phone: user.phone || '9999999999',
          customer_name:  user.name  || '',
          customer_email: user.email || ''
        },
        subscription_meta: {
          // {subscription_id} is replaced by Cashfree automatically
          return_url:  `${process.env.APP_URL}/pay.html?sub_id={subscription_id}&plan=${plan}`,
          notify_url:  `${process.env.APP_URL}/api/billing/webhook`
        },
        subscription_tags: {
          plan,
          user_id: user.id  // webhook uses this to find the user
        }
      })
    });

    const cfData = await cfRes.json();
    if (!cfRes.ok) throw new Error(cfData.message || 'Failed to create subscription');

    // Store pending subscription ID so webhook can locate this user
    await supabase
      .from('users')
      .update({ razorpay_subscription_id: subscriptionId })
      .eq('id', user.id);

    return res.status(200).json({
      subscription_id:    cfData.subscription_id,
      payment_session_id: cfData.payment_session_id,  // frontend passes to Cashfree.checkout()
      plan
    });

  } catch (err) {
    console.error('Subscribe error:', err);
    return res.status(500).json({ error: err.message || 'Failed to create subscription' });
  }
};
