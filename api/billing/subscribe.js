const { setCors, verifyToken, supabase } = require('../_lib');

const CASHFREE_BASE = process.env.CASHFREE_ENV === 'production'
  ? 'https://api.cashfree.com/pg'
  : 'https://sandbox.cashfree.com/pg';

const PLAN_AMOUNTS = { pro: 9.00, max: 20.00 };

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

  // Unique order ID — embed plan + user so webhook can recover context
  const orderId = `lnk_${plan}_${user.id}_${Date.now()}`;

  try {
    const cfRes = await fetch(`${CASHFREE_BASE}/orders`, {
      method: 'POST',
      headers: cfHeaders(),
      body: JSON.stringify({
        order_id:       orderId,
        order_amount:   PLAN_AMOUNTS[plan],  // float INR, NOT paise
        order_currency: 'INR',
        customer_details: {
          customer_id:    user.id,
          customer_phone: user.phone || '9999999999', // Cashfree requires phone
          customer_name:  user.name  || '',
          customer_email: user.email || ''
        },
        order_meta: {
          return_url:  `${process.env.APP_URL}/pay.html?order_id=${orderId}&plan=${plan}`,
          notify_url:  `${process.env.APP_URL}/api/billing/webhook`
        },
        order_tags: {
          plan,
          user_id: user.id   // webhook uses this to find the user
        }
      })
    });

    const cfData = await cfRes.json();
    if (!cfRes.ok) throw new Error(cfData.message || 'Cashfree order creation failed');

    // Store pending order_id so webhook can locate this user
    await supabase
      .from('users')
      .update({ razorpay_subscription_id: orderId })
      .eq('id', user.id);

    return res.status(200).json({
      order_id:          cfData.order_id,
      payment_session_id: cfData.payment_session_id,  // frontend passes this to Cashfree.checkout()
      key_id:            process.env.CASHFREE_APP_ID, // kept for backward-compat with pay.html
      plan
    });

  } catch (err) {
    console.error('Subscribe error:', err);
    return res.status(500).json({ error: err.message || 'Failed to create order' });
  }
};
