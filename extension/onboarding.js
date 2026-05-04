const LINKEDIN_CLIENT_ID = '86dn20hkn05b0o';
const BACKEND_URL = 'https://linkedai-backend-three.vercel.app';

let selectedTone = 'Thoughtful';

// ── Load saved values ──────────────────────────────────────────────────────
chrome.storage.local.get(['userName', 'userRole', 'userBio', 'userTone', 'session'], (data) => {
  if (data.userName) document.getElementById('userName').value = data.userName;
  if (data.userRole) document.getElementById('userRole').value = data.userRole;
  if (data.userBio) document.getElementById('userBio').value = data.userBio;
  if (data.userTone) {
    selectedTone = data.userTone;
    document.querySelectorAll('.tone-pill').forEach(p => {
      p.classList.toggle('active', p.dataset.tone === selectedTone);
    });
  }
  // Already logged in — show confirmation
  if (data.session?.access_token) {
    document.getElementById('saveSuccess').classList.add('show');
    document.getElementById('loginSection').classList.add('show');
    document.getElementById('loggedInMsg').classList.add('show');
    const saveBtn = document.getElementById('saveBtn');
    saveBtn.textContent = '✓ Profile Saved';
    saveBtn.classList.add('saved');
  }
});

// ── Tone pills ─────────────────────────────────────────────────────────────
document.querySelectorAll('.tone-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.tone-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    selectedTone = pill.dataset.tone;
  });
});

// ── Save profile ───────────────────────────────────────────────────────────
document.getElementById('saveBtn').addEventListener('click', () => {
  const name = document.getElementById('userName').value.trim();
  const role = document.getElementById('userRole').value.trim();
  const bio = document.getElementById('userBio').value.trim();
  const saveBtn = document.getElementById('saveBtn');

  saveBtn.classList.add('saving');
  saveBtn.textContent = 'Saving...';

  const userContext = [
    name ? `Name: ${name}` : '',
    role ? `Role: ${role}` : '',
    bio ? `About: ${bio}` : '',
    `Default tone: ${selectedTone}`
  ].filter(Boolean).join('\n');

  chrome.storage.local.set({ userName: name, userRole: role, userBio: bio, userTone: selectedTone, userContext }, () => {
    setTimeout(() => {
      saveBtn.classList.remove('saving');
      saveBtn.classList.add('saved');
      saveBtn.innerHTML = '✓ &nbsp;Profile Saved!';
      document.getElementById('saveSuccess').classList.add('show');
      setTimeout(() => {
        const loginSection = document.getElementById('loginSection');
        loginSection.classList.add('show');
        loginSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 400);
    }, 300);
  });
});

// ── LinkedIn Sign In ────────────────────────────────────────────────────────
document.getElementById('ob-linkedinBtn').addEventListener('click', async () => {
  const btn = document.getElementById('ob-linkedinBtn');
  btn.disabled = true;
  btn.innerHTML = '<span>Connecting to LinkedIn…</span>';
  document.getElementById('loginError').classList.remove('show');

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
    if (!code) throw new Error('LinkedIn did not return an authorization code.');

    const res = await fetch(`${BACKEND_URL}/api/auth/linkedin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, redirectUri })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Authentication failed');

    await chrome.storage.local.set({
      session: { access_token: data.token, user: data.user }
    });

    // Show logged-in state
    document.querySelectorAll('.login-tab').forEach(t => t.style.display = 'none');
    document.getElementById('loginError').classList.remove('show');
    document.getElementById('loggedInMsg').classList.add('show');
    document.getElementById('loggedInMsg').scrollIntoView({ behavior: 'smooth' });

  } catch (err) {
    const el = document.getElementById('loginError');
    el.textContent = err.message;
    el.classList.add('show');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
      </svg>
      <span>Continue with LinkedIn →</span>`;
  }
});
