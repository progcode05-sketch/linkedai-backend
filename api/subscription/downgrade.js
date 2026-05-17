const { setCors, verifyToken, supabase } = require('../_lib');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await verifyToken(req);

    if (!user.subscription_status || user.subscription_status === 'free') {
      return res.status(400).json({ error: 'Already on Free plan.' });
    }

    // ── Cancel Razorpay subscription immediately ──────────────────
    if (user.razorpay_subscription_id) {
      try {
        const auth = Buffer.from(
          `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`
        ).toString('base64');

        await fetch(
          `https://api.razorpay.com/v1/subscriptions/${user.razorpay_subscription_id}/cancel`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${auth}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ cancel_at_cycle_end: 0 }) // 0 = cancel immediately
          }
        );
      } catch (_) {
        // Razorpay call failed — still downgrade in DB so user isn't stuck
      }
    }

    // ── Update user to Free plan in Supabase ──────────────────────
    const { error } = await supabase
      .from('users')
      .update({
       subscription_status: 'free',
       razorpay_subscription_id: null
      })
      .eq('id', user.id);

    if (error) throw new Error('Failed to update plan: ' + error.message);

    return res.status(200).json({ success: true, plan: 'free' });

  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};
