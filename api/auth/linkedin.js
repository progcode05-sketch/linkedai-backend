const jwt = require('jsonwebtoken');
const { supabase, setCors } = require('../_lib');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { code, redirectUri } = req.body || {};
  if (!code || !redirectUri) return res.status(400).json({ error: 'Missing code or redirectUri' });

  try {
    // 1. Exchange authorization code for LinkedIn access token
    const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET
      })
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('LinkedIn token error:', tokenData);
      return res.status(400).json({ error: 'Failed to get LinkedIn access token' });
    }

    // 2. Fetch profile via OIDC userinfo endpoint
    const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });

    const profile = await profileRes.json();
    if (!profileRes.ok || !profile.sub) {
      console.error('LinkedIn profile error:', profile);
      return res.status(400).json({ error: 'Failed to fetch LinkedIn profile' });
    }

    // 3. Upsert user in Supabase (only sets subscription_status on first insert)
    const { data: existingUsers } = await supabase
      .from('users')
      .select('id, subscription_status, razorpay_subscription_id')
      .eq('linkedin_id', profile.sub);

    let user;
    if (existingUsers && existingUsers.length > 0) {
      // Update profile info on each login
      const { data: updated } = await supabase
        .from('users')
        .update({
          name: profile.name || null,
          profile_pic: profile.picture || null,
          email: profile.email || null
        })
        .eq('linkedin_id', profile.sub)
        .select()
        .single();
      user = updated;
    } else {
      // New user — create with free plan
      const { data: created, error: createError } = await supabase
        .from('users')
        .insert({
          linkedin_id: profile.sub,
          email: profile.email || null,
          name: profile.name || null,
          profile_pic: profile.picture || null,
          subscription_status: 'free'
        })
        .select()
        .single();

      if (createError) {
        console.error('Create user error:', createError);
        return res.status(500).json({ error: 'Failed to create user' });
      }
      user = created;
    }

    // 4. Sign custom JWT (30-day expiry)
    const token = jwt.sign(
      { userId: user.id, linkedinId: user.linkedin_id },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    return res.status(200).json({
      token,
      user: {
        name: user.name,
        email: user.email,
        profile_pic: user.profile_pic,
        plan: user.subscription_status || 'free'
      }
    });

  } catch (err) {
    console.error('LinkedIn auth error:', err);
    return res.status(500).json({ error: 'Authentication failed' });
  }
};
