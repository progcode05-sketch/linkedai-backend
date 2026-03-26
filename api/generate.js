const Anthropic = require('@anthropic-ai/sdk');
const { setCors, verifyToken, PLAN_LIMITS, getUsage, incrementUsage } = require('./_lib');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 1. Verify auth
  let user;
  try {
    user = await verifyToken(req);
  } catch (err) {
    return res.status(401).json({ error: err.message });
  }

  // 2. Check plan limit
  const plan = user.subscription_status || 'free';
  const limit = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
  const usage = await getUsage(user.id);

  if (limit !== Infinity && usage >= limit) {
    return res.status(429).json({
      error: 'limit_reached',
      plan,
      usage,
      limit
    });
  }

  // 3. Validate request body
  const { systemPrompt, userMessage } = req.body || {};
  if (!systemPrompt || !userMessage) {
    return res.status(400).json({ error: 'Missing systemPrompt or userMessage' });
  }

  // 4. Call Claude
  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    });

    const result = message.content[0]?.text;
    if (!result) throw new Error('Empty response from AI');

    // 5. Increment usage (after successful generation)
    await incrementUsage(user.id);

    return res.status(200).json({ result });

  } catch (err) {
    console.error('Generate error:', err);
    return res.status(500).json({ error: err.message || 'Generation failed' });
  }
};
