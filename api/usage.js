const { setCors, verifyToken, PLAN_LIMITS, getUsage } = require('./_lib');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  let user;
  try {
    user = await verifyToken(req);
  } catch (err) {
    return res.status(401).json({ error: err.message });
  }

  const plan = user.subscription_status || 'free';
  const limit = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
  const usage = await getUsage(user.id);

  return res.status(200).json({
    usage,
    limit: limit === Infinity ? null : limit,
    plan,
    subscription_status: plan,
    razorpay_subscription_id: user.razorpay_subscription_id || null
  });
};
