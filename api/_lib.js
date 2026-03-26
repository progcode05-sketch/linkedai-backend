const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

// ── Supabase client (service role — bypasses RLS) ─────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Plan limits ───────────────────────────────────────────────────────────────
const PLAN_LIMITS = { free: 10, pro: 250, max: Infinity };

// ── CORS headers ──────────────────────────────────────────────────────────────
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// ── Verify JWT and return the user row from Supabase ─────────────────────────
async function verifyToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) throw new Error('Missing token');

  const token = authHeader.slice(7);
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new Error('Invalid or expired token');
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', decoded.userId)
    .single();

  if (error || !user) throw new Error('User not found');
  return user;
}

// ── Get current month string ──────────────────────────────────────────────────
function currentMonth() {
  return new Date().toISOString().slice(0, 7); // 'YYYY-MM'
}

// ── Get usage count for this month ───────────────────────────────────────────
async function getUsage(userId) {
  const { data } = await supabase
    .from('usage')
    .select('count')
    .eq('user_id', userId)
    .eq('month', currentMonth())
    .single();
  return data?.count || 0;
}

// ── Increment usage by 1 (atomic via Postgres function) ──────────────────────
async function incrementUsage(userId) {
  const { data, error } = await supabase.rpc('increment_usage', {
    p_user_id: userId,
    p_month: currentMonth()
  });
  if (error) throw new Error('Failed to increment usage: ' + error.message);
  return data;
}

module.exports = { supabase, PLAN_LIMITS, setCors, verifyToken, currentMonth, getUsage, incrementUsage };
