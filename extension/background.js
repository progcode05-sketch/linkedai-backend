// Linkora Background Service Worker v3
const BACKEND_URL = 'https://linkedai-backend-kappa.vercel.app';

// Cache TTL: 4 minutes (refresh before popup opens)
const CACHE_TTL_MS = 4 * 60 * 1000;

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_SESSION') {
    chrome.storage.local.get(['session'], (data) => {
      sendResponse({ session: data.session || null });
    });
    return true;
  }

  if (request.type === 'CALL_BACKEND') {
    callBackend(request.session, request.systemPrompt, request.userMessage)
      .then(result => sendResponse({ success: true, result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Content script signals LinkedIn page loaded — pre-warm usage cache
  if (request.type === 'LINKEDIN_LOADED') {
    prewarmCache();
    sendResponse({ ok: true });
    return true;
  }
});

// Pre-fetch usage data and store in local cache so popup opens instantly
async function prewarmCache() {
  try {
    const data = await chrome.storage.local.get(['session', 'cachedUsageAt']);

    // Skip if no session
    if (!data.session?.access_token) return;

    // Skip if cache is still fresh
    const age = Date.now() - (data.cachedUsageAt || 0);
    if (age < CACHE_TTL_MS) return;

    const res = await fetch(`${BACKEND_URL}/api/usage`, {
      headers: { 'Authorization': `Bearer ${data.session.access_token}` }
    });

    if (res.status === 401) {
      // Token expired — clear session so popup shows login
      await chrome.storage.local.remove(['session', 'cachedUsage', 'cachedUsageAt']);
      return;
    }

    if (res.ok) {
      const usage = await res.json();
      await chrome.storage.local.set({
        cachedUsage: usage,
        cachedUsageAt: Date.now()
      });
    }
  } catch (_) {
    // Silent — network unavailable, popup will fetch fresh
  }
}

async function callBackend(session, systemPrompt, userMessage) {
  const res = await fetch(`${BACKEND_URL}/api/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify({ systemPrompt, userMessage })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || `Error ${res.status}`);
  return data.result;
}
