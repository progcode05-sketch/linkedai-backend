// ─── Config ───────────────────────────────────────────────────────────────────
const BACKEND_URL = 'https://linkedai-backend-three.vercel.app';
const LINKEDIN_CLIENT_ID = '86dn20hkn05b0o';

const PLAN_LIMITS = { free: 10, pro: 250, max: null }; // null = unlimited
const PLAN_LABELS = { free: 'Free Plan', pro: 'Pro Plan', max: 'Max Plan' };

// ─── State ────────────────────────────────────────────────────────────────────
let currentSession = null;
let currentUser = null;
let currentUsage = 0;
let currentPlan = 'free';
let selectedCommentTone = 'Thoughtful';
let selectedMessageType = 'Connection Request';
let selectedReplyTone = 'Keep the conversation going';

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const stored = await chrome.storage.local.get(['session']);
  if (stored.session?.access_token) {
    currentSession = stored.session;
    currentUser = stored.session.user || null;
    await showApp();
  } else {
    showAuth();
  }
  initAuthUI();
  initAppUI();
});

// ─── Auth UI ──────────────────────────────────────────────────────────────────
function initAuthUI() {
  document.getElementById('linkedinSignInBtn').addEventListener('click', handleLinkedInLogin);
}

async function handleLinkedInLogin() {
  const btn = document.getElementById('linkedinSignInBtn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="border-color:rgba(255,255,255,0.3);border-top-color:#fff;width:16px;height:16px;border-width:2px;border-radius:50%;animation:spin 0.7s linear infinite;display:inline-block;margin-right:8px;"></div>Connecting…';
  hideAuthError();

  try {
    const redirectUri = `https://${chrome.runtime.id}.chromiumapp.org/`;
    const state = Math.random().toString(36).slice(2);

    const authUrl =
      `https://www.linkedin.com/oauth/v2/authorization` +
      `?response_type=code` +
      `&client_id=${LINKEDIN_CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=openid%20profile%20email` +
      `&state=${state}`;

    const responseUrl = await new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, (url) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!url) return reject(new Error('Sign in was cancelled.'));
        resolve(url);
      });
    });

    const params = new URL(responseUrl).searchParams;
    const code = params.get('code');
    const returnedState = params.get('state');

    if (!code) throw new Error('LinkedIn did not return an authorization code.');
    if (returnedState !== state) throw new Error('State mismatch — possible CSRF. Please try again.');

    // Exchange code for JWT via backend
    const res = await fetch(`${BACKEND_URL}/api/auth/linkedin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, redirectUri })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Authentication failed');

    currentSession = { access_token: data.token, user: data.user };
    currentUser = data.user;
    await chrome.storage.local.set({ session: currentSession });
    await showApp();

  } catch (err) {
    showAuthError(err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
      </svg>
      Continue with LinkedIn`;
  }
}

function showAuth() {
  document.getElementById('appScreen').classList.remove('active');
  document.getElementById('authScreen').classList.add('active');
}

function showAuthError(msg) {
  const el = document.getElementById('authError');
  el.textContent = msg;
  el.classList.add('show');
}

function hideAuthError() {
  document.getElementById('authError').classList.remove('show');
}

// ─── App UI ───────────────────────────────────────────────────────────────────
function initAppUI() {
  // Tab switching
  document.querySelectorAll('.app-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.app-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
    });
  });

  // Profile btn → go to profile tab
  document.getElementById('profileBtn').addEventListener('click', () => {
    document.querySelectorAll('.app-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.querySelector('[data-tab="profile"]').classList.add('active');
    document.getElementById('panel-profile').classList.add('active');
  });

  // Sign out
  document.getElementById('signOutBtn').addEventListener('click', async () => {
    await chrome.storage.local.remove(['session']);
    currentSession = null;
    currentUser = null;
    showAuth();
  });

  // Tone pills — comment
  document.querySelectorAll('#commentTones .tone-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#commentTones .tone-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      selectedCommentTone = pill.dataset.tone;
    });
  });

  // Tone pills — message type
  document.querySelectorAll('#messageTones .tone-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#messageTones .tone-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      selectedMessageType = pill.dataset.tone;
    });
  });

  // Tone pills — reply
  document.querySelectorAll('#replyTones .tone-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#replyTones .tone-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      selectedReplyTone = pill.dataset.tone;
    });
  });

  // Char counter
  document.getElementById('postContent').addEventListener('input', e => {
    document.getElementById('postCharCount').textContent = e.target.value.length;
  });

  // Generators
  document.getElementById('generateComment').addEventListener('click', generateComments);
  document.getElementById('generateMessage').addEventListener('click', generateMessages);
  document.getElementById('generateReply').addEventListener('click', generateReplies);
}

async function showApp() {
  document.getElementById('authScreen').classList.remove('active');
  document.getElementById('appScreen').classList.add('active');

  // Populate user info from stored session
  if (currentUser) {
    const name = currentUser.name || '';
    const email = currentUser.email || '';
    const initial = (name || email || '?')[0].toUpperCase();
    document.getElementById('profileAvatar').textContent = initial;
    document.getElementById('profileName').textContent = name || '—';
    document.getElementById('profileEmail').textContent = email || '—';
  }

  // Load user writing context from onboarding
  const stored = await chrome.storage.local.get(['userContext']);
  if (stored.userContext) window._userContext = stored.userContext;

  await loadUsage();
}

// ─── Usage & Plan ─────────────────────────────────────────────────────────────
async function loadUsage() {
  if (!currentSession) return;
  try {
    const res = await fetch(`${BACKEND_URL}/api/usage`, {
      headers: { 'Authorization': `Bearer ${currentSession.access_token}` }
    });
    if (res.status === 401) {
      await chrome.storage.local.remove(['session']);
      currentSession = null;
      showAuth();
      return;
    }
    const data = await res.json();
    if (res.ok) {
      currentUsage = data.usage || 0;
      currentPlan = data.plan || 'free';
      updateUsageUI(data.usage, data.limit, data.plan, data.razorpay_subscription_id);
    }
  } catch (e) {
    console.error('Usage load error:', e);
  }
}

function updateUsageUI(usage, limit, plan, subscriptionId) {
  const isUnlimited = limit === null;
  const pct = isUnlimited ? 0 : Math.min(100, (usage / limit) * 100);

  // Header badge
  const badge = document.getElementById('usageBadge');
  badge.textContent = isUnlimited ? `${usage} / ∞` : `${usage} / ${limit}`;
  badge.classList.toggle('warning', !isUnlimited && pct > 80);

  // Profile panel usage bar
  document.getElementById('usageText').textContent = isUnlimited ? `${usage} / ∞` : `${usage} / ${limit}`;
  const fill = document.getElementById('usageBarFill');
  fill.style.width = pct + '%';
  fill.classList.toggle('danger', !isUnlimited && pct > 80);

  // Plan status dot
  const dot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  dot.className = 'status-dot ' + plan;
  if (plan === 'pro') statusText.textContent = 'Pro Plan · Active';
  else if (plan === 'max') statusText.textContent = 'Max Plan · Active';
  else statusText.textContent = 'Free Plan';

  // Upgrade banner — show when free and used > 8
  const banner = document.getElementById('upgradeBanner');
  if (plan === 'free' && usage >= 8) {
    banner.style.display = 'block';
  } else {
    banner.style.display = 'none';
  }

  // Render plan cards
  renderPlanCards(plan, subscriptionId);
}

function renderPlanCards(currentPlanName, subscriptionId) {
  const container = document.getElementById('planCards');
  container.innerHTML = '';

  const plans = [
    {
      id: 'free',
      name: 'Free',
      price: '$0',
      period: '',
      limit: '10 generations/month',
      features: ['Comments, messages & replies', 'Inline AI button'],
      color: 'free'
    },
    {
      id: 'pro',
      name: 'Pro',
      price: '$9',
      period: '/month',
      limit: '250 generations/month',
      features: ['Everything in Free', '250 generations/month', 'Priority support'],
      color: 'pro'
    },
    {
      id: 'max',
      name: 'Max',
      price: '$20',
      period: '/month',
      limit: 'Unlimited generations',
      features: ['Everything in Pro', 'Unlimited generations', 'Priority support'],
      color: 'max'
    }
  ];

  plans.forEach(plan => {
    const isCurrentPlan = plan.id === currentPlanName;
    const card = document.createElement('div');
    card.className = `plan-card ${plan.color} ${isCurrentPlan ? 'current' : ''}`;

    let actionBtn = '';
    if (isCurrentPlan) {
      actionBtn = `<div class="plan-current-badge">Current Plan</div>`;
      if (plan.id !== 'free' && subscriptionId) {
        actionBtn += `<button class="btn-cancel-plan" data-plan="${plan.id}">Cancel subscription</button>`;
      }
    } else if (plan.id !== 'free') {
      actionBtn = `<button class="btn-upgrade" data-plan="${plan.id}">Upgrade to ${plan.name}</button>`;
    }

    card.innerHTML = `
      <div class="plan-card-header">
        <div class="plan-card-name">${plan.name}</div>
        <div class="plan-card-price">${plan.price}<span class="plan-period">${plan.period}</span></div>
      </div>
      <div class="plan-card-limit">${plan.limit}</div>
      ${actionBtn}
    `;

    container.appendChild(card);
  });

  // Bind upgrade buttons
  container.querySelectorAll('.btn-upgrade').forEach(btn => {
    btn.addEventListener('click', () => handleUpgrade(btn.dataset.plan));
  });

  // Bind cancel buttons
  container.querySelectorAll('.btn-cancel-plan').forEach(btn => {
    btn.addEventListener('click', () => handleCancel(btn));
  });
}

// ─── Billing ──────────────────────────────────────────────────────────────────
async function handleUpgrade(plan) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/billing/subscribe`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${currentSession.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ plan })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create subscription');

    const name = encodeURIComponent(currentUser?.name || '');
    const email = encodeURIComponent(currentUser?.email || '');
    const payUrl =
      `https://linko-ra.onrender.com/pay.html` +
      `?sub=${data.subscription_id}` +
      `&key=${data.key_id}` +
      `&plan=${plan}` +
      `&name=${name}` +
      `&email=${email}` +
      `&token=${currentSession.access_token}`;

    chrome.tabs.create({ url: payUrl });

  } catch (err) {
    alert('Could not start upgrade: ' + err.message);
  }
}

async function handleCancel(btn) {
  if (!confirm('Cancel your subscription? You\'ll revert to the free plan (10/month) immediately.')) return;

  btn.disabled = true;
  btn.textContent = 'Cancelling…';

  try {
    const res = await fetch(`${BACKEND_URL}/api/billing/cancel`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${currentSession.access_token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to cancel');
    await loadUsage();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Cancel subscription';
    alert('Could not cancel: ' + err.message);
  }
}

// ─── Limit check helper ───────────────────────────────────────────────────────
function checkLimit() {
  const limit = PLAN_LIMITS[currentPlan];
  if (limit !== null && currentUsage >= limit) {
    // Switch to Account tab to show upgrade options
    document.querySelectorAll('.app-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.querySelector('[data-tab="profile"]').classList.add('active');
    document.getElementById('panel-profile').classList.add('active');
    document.getElementById('upgradeBanner').style.display = 'block';
    return false;
  }
  return true;
}

// ─── Generators ───────────────────────────────────────────────────────────────
async function generateComments() {
  if (!checkLimit()) return;
  const post = document.getElementById('postContent').value.trim();
  if (!post) return showError('commentResults', 'Please paste a LinkedIn post first.');
  if (!currentSession) return showError('commentResults', 'Please sign in first.');

  const btn = document.getElementById('generateComment');
  setLoading(btn, true);

  const { userContext: uctx } = await chrome.storage.local.get(['userContext']);
  const systemPrompt = `You are a LinkedIn engagement expert. Generate 3 genuinely helpful, human-sounding LinkedIn comments.
${uctx ? `\nAbout the person commenting:\n${uctx}\n` : ''}
Rules:
- Each comment must feel authentic, NOT AI-generated
- Add real value: insights, questions, or experiences
- No empty praise like "Great post!" or "Totally agree!"
- No use of character"- or --" in the comments
- Vary the length: short (1-2 lines), medium (2-3 lines), longer (3-4 lines)
- Tone: ${selectedCommentTone}
- No hashtags, no emojis unless very natural

Return ONLY a JSON array with 3 strings. No markdown, no explanation.
["comment 1 here","comment 2 here","comment 3 here"]`;

  try {
    const result = await callBackend(systemPrompt, `LinkedIn Post:\n\n${post}`);
    const comments = safeParseJSON(result);
    renderResults('commentResults', comments);
    currentUsage++;
    updateUsageBadge();
  } catch (e) {
    if (e.message === 'limit_reached') return;
    showError('commentResults', 'Error: ' + e.message);
  } finally {
    setLoading(btn, false, 'Generate Comments');
  }
}

async function generateMessages() {
  if (!checkLimit()) return;
  const recipient = document.getElementById('recipientInfo').value.trim();
  const context = document.getElementById('msgContext').value.trim();
  if (!recipient && !context) return showError('messageResults', 'Please add recipient info and context.');
  if (!currentSession) return showError('messageResults', 'Please sign in first.');

  const btn = document.getElementById('generateMessage');
  setLoading(btn, true);

  const { userContext: uctx2 } = await chrome.storage.local.get(['userContext']);
  const recipientUrl = document.getElementById('recipientUrl').value.trim();

  const systemPrompt = `You are an expert at crafting personalized LinkedIn messages that get responses.
${uctx2 ? `\nAbout the sender:\n${uctx2}\n` : ''}
Message type: ${selectedMessageType}

Rules:
- Sound human, warm, and genuine — NOT salesy or robotic
- Be specific and reference real context given
- Keep it concise (under 150 words each)
- No use of character"- or --" in the messages  
- No generic openers like "I hope this finds you well"
- Each of the 3 variants should take a meaningfully different angle/approach
- For connection requests: even shorter (under 80 words)
- For Job/Hire: be respectful of their time, get to the point fast

Return ONLY a JSON array with 3 strings. No markdown, no explanation.
["message 1","message 2","message 3"]`;

  const userContext2 = [
    recipient ? `Recipient: ${recipient}` : '',
    recipientUrl ? `Their LinkedIn: ${recipientUrl}` : '',
    context ? `Purpose: ${context}` : ''
  ].filter(Boolean).join('\n');

  try {
    const result = await callBackend(systemPrompt, userContext2 || 'No context provided');
    const messages = safeParseJSON(result);
    renderResults('messageResults', messages);
    currentUsage++;
    updateUsageBadge();
  } catch (e) {
    if (e.message === 'limit_reached') return;
    showError('messageResults', 'Error: ' + e.message);
  } finally {
    setLoading(btn, false, 'Generate Messages');
  }
}

async function generateReplies() {
  if (!checkLimit()) return;
  const replyInput = document.getElementById('replyInput').value.trim();
  const replyContext = document.getElementById('replyContext').value.trim();
  if (!replyInput) return showError('replyResults', 'Please paste the message or comment you want to reply to.');
  if (!currentSession) return showError('replyResults', 'Please sign in first.');

  const btn = document.getElementById('generateReply');
  setLoading(btn, true);

  const { userContext: uctx } = await chrome.storage.local.get(['userContext']);
  const systemPrompt = `You are an expert at crafting sharp, human LinkedIn replies that get great responses.
${uctx ? `\nAbout the person replying:\n${uctx}\n` : ''}
Reply goal: ${selectedReplyTone}

Rules:
- Sound completely human and natural — NOT like AI wrote it
- Be specific to what they actually said — don't be generic
- Keep it concise: 1-3 sentences for comments, up to 5 for DMs
- Match the energy of the original message
- No use of character"- or --" in the replies
- No filler phrases like "Great point!" or "Thanks for reaching out!"
- Generate exactly 2 different reply options with different angles

Return ONLY a JSON array with exactly 2 strings. No markdown, no explanation.
["reply 1 here", "reply 2 here"]`;

  const replySender = document.getElementById('replySender').value.trim();
  const userMsg = `Message/comment to reply to:\n"${replyInput}"${replySender ? `\n\nSent by: ${replySender}` : ''}${replyContext ? `\n\nExtra context: ${replyContext}` : ''}`;

  try {
    const result = await callBackend(systemPrompt, userMsg);
    const replies = safeParseJSON(result);
    renderResults('replyResults', replies);
    currentUsage++;
    updateUsageBadge();
  } catch (e) {
    if (e.message === 'limit_reached') return;
    showError('replyResults', 'Error: ' + e.message);
  } finally {
    setLoading(btn, false, 'Generate Replies');
  }
}

// ─── Safe JSON parser (strips AI markdown code fences) ──────────────────────
function safeParseJSON(raw) {
  if (!raw || typeof raw !== 'string') throw new Error('Empty response from server.');

  // Strip markdown code fences: ```json ... ``` or ``` ... ```
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

  // If there's still no array bracket, try to extract one
  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    cleaned = cleaned.slice(firstBracket, lastBracket + 1);
  }

  return JSON.parse(cleaned);
}

// ─── Backend call ─────────────────────────────────────────────────────────────
async function callBackend(systemPrompt, userMessage) {
  const res = await fetch(`${BACKEND_URL}/api/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${currentSession.access_token}`
    },
    body: JSON.stringify({ systemPrompt, userMessage })
  });

  const data = await res.json();

  if (res.status === 401) {
    await chrome.storage.local.remove(['session']);
    currentSession = null;
    showAuth();
    throw new Error('Session expired. Please sign in again.');
  }

  if (res.status === 429 && data.error === 'limit_reached') {
    // Redirect to Account tab to show upgrade options
    document.querySelectorAll('.app-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.querySelector('[data-tab="profile"]').classList.add('active');
    document.getElementById('panel-profile').classList.add('active');
    document.getElementById('upgradeBanner').style.display = 'block';
    throw new Error('limit_reached');
  }

  if (!res.ok) throw new Error(data.message || data.error || `Server error ${res.status}`);
  return data.result;
}

// ─── UI helpers ───────────────────────────────────────────────────────────────
function updateUsageBadge() {
  const limit = PLAN_LIMITS[currentPlan];
  const badge = document.getElementById('usageBadge');
  badge.textContent = limit === null ? `${currentUsage} / ∞` : `${currentUsage} / ${limit}`;
  const pct = limit === null ? 0 : (currentUsage / limit) * 100;
  badge.classList.toggle('warning', limit !== null && pct > 80);
}

function setLoading(btn, loading, label) {
  btn.disabled = loading;
  if (loading) {
    btn.innerHTML = '<div class="spinner"></div><span>Generating...</span>';
  } else {
    btn.innerHTML = `<span>${label || 'Generate'}</span>`;
  }
}

function renderResults(containerId, items) {
  const container = document.getElementById(containerId);
  container.innerHTML = `<div style="font-size:10px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:var(--muted);margin-bottom:8px;">Generated Options</div>`;
  items.forEach((text, i) => {
    const card = document.createElement('div');
    card.className = 'result-card';
    card.style.animationDelay = `${i * 0.07}s`;
    card.innerHTML = `
      <div class="result-num">Option ${i + 1}</div>
      <p>${escapeHtml(text)}</p>
      <button class="copy-btn" title="Copy">
        <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      </button>`;
    card.querySelector('.copy-btn').addEventListener('click', async (e) => {
      await navigator.clipboard.writeText(text);
      const b = e.currentTarget;
      b.classList.add('copied');
      b.innerHTML = `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`;
      setTimeout(() => {
        b.classList.remove('copied');
        b.innerHTML = `<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
      }, 2000);
    });
    container.appendChild(card);
  });
}

function showError(containerId, msg) {
  document.getElementById(containerId).innerHTML = `<div class="error-msg">${msg}</div>`;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
