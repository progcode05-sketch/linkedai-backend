const { setCors, verifyToken, supabase } = require('../_lib');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await verifyToken(req);

    if (!user.subscription_status || user.subscription_status === 'free') {
      return res.status(400).json({ error: 'No active subscription to cancel.' });
    }

    if (!user.razorpay_subscription_id) {
      return res.status(400).json({ error: 'No Razorpay subscription found.' });
    }

    // ── Tell Razorpay to cancel at end of billing period ──────────
    const auth = Buffer.from(
      `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`
    ).toString('base64');

    const rzpRes = await fetch(
      `https://api.razorpay.com/v1/subscriptions/${user.razorpay_subscription_id}/cancel`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ cancel_at_cycle_end: 1 }) // 1 = cancel at period end
      }
    );

    if (!rzpRes.ok) {
      const rzpData = await rzpRes.json().catch(() => ({}));
      throw new Error(rzpData.error?.description || 'Razorpay cancellation failed.');
    }

    // ── Mark subscription as cancelling in Supabase ───────────────
    // Plan stays active until Razorpay webhook fires at period end
    const { error } = await supabase
      .from('users')
      .update({ subscription_status: 'cancelling' })
      .eq('id', user.id);

    if (error) throw new Error('Failed to update status: ' + error.message);

    return res.status(200).json({ success: true, status: 'cancelling' });

  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};
