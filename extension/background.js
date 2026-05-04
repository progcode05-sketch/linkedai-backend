// LinkedAI Background Service Worker v3
const BACKEND_URL = 'https://linkedai-backend-three.vercel.app';

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
});

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
