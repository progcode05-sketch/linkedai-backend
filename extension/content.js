(function () {
  'use strict';
  let injectedBoxes = new WeakSet();

  // LinkedIn now uses TipTap/ProseMirror with fully hashed class names.
  // We target by role/attribute only — no class names.
  const EDITOR_SELECTOR = [
    '.ProseMirror[contenteditable="true"]',
    '.ql-editor[contenteditable="true"]',
    'div[contenteditable="true"][role="textbox"]',
  ].join(', ');

  // ── Toast ────────────────────────────────────────────────────────────────
  function showToast(msg) {
    const existing = document.getElementById('linkedai-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'linkedai-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  // ── Walk up to find the comment form wrapper ─────────────────────────────
  function findCommentForm(el) {
    let node = el.parentElement;
    for (let i = 0; i < 10 && node; i++) {
      if (
        node.tagName === 'FORM' ||
        (node.classList && (
          node.classList.contains('comments-comment-box') ||
          node.classList.contains('comments-comment-texteditor') ||
          node.classList.contains('comment-box')
        ))
      ) return node;
      node = node.parentElement;
    }
    return el.parentElement;
  }

  // ── Strip noise from a cloned node ──────────────────────────────
  const STRIP_SELECTORS = [
    '[contenteditable]', 'button', '[role="button"]', '[role="textbox"]',
    'svg', 'img', 'video', 'input', 'textarea', 'form',
    '[aria-label="Add a comment…"]', '[aria-label="Add a comment"]',
    '.comments-comment-box', '.comments-comment-texteditor',
    'code', 'style', 'script',
  ].join(', ');

  function cleanNode(node) {
    const clone = node.cloneNode(true);
    clone.querySelectorAll(STRIP_SELECTORS).forEach(el => el.remove());
    let text = (clone.innerText || '').replace(/^Feed\s+post\s*/i, '').trim();
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    // Skip short header lines (name, headline, "1st", timestamps etc.)
    let startIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].length > 60) { startIdx = i; break; }
      if (/[.!?]$/.test(lines[i]) && lines[i].length > 30) { startIdx = i; break; }
    }
    return lines.slice(startIdx).join(' ').replace(/\s+/g, ' ').trim();
  }

  // ── Extract post text — 3 strategies ────────────────────────────
  function extractPostContext(commentBox) {

    // ── Strategy 1: LinkedIn semantic containers ─────────────────
    // Walk up and look for known LinkedIn post wrapper attributes
    const CONTAINER_ATTRS = [
      '[data-urn]', '[data-id]',
      '.feed-shared-update-v2', '.occludable-update',
      'article', '[data-finite-scroll-hotkey-item]',
    ];
    let node = commentBox.parentElement;
    for (let i = 0; i < 20 && node && node !== document.body; i++) {
      for (const selector of CONTAINER_ATTRS) {
        if (node.matches && node.matches(selector)) {
          const text = cleanNode(node);
          if (text.length >= 80) {
            return { postText: text.slice(0, 3000), authorName: '', authorHeadline: '', postType: 'text' };
          }
        }
      }
      node = node.parentElement;
    }

    // ── Strategy 2: Depth walk — wider range than before ─────────
    const results = [];
    for (let depth = 6; depth <= 18; depth++) {
      try {
        let n = commentBox;
        for (let i = 0; i < depth; i++) {
          n = n.parentElement;
          if (!n) break;
        }
        if (!n || n === document.body || n === document.documentElement) continue;
        const text = cleanNode(n);
        if (text.length >= 80) results.push({ depth, text });
      } catch (_) {}
    }

    if (results.length) {
      // Prefer focused results (80–8000 chars), pick smallest that has enough content
      const good = results.filter(r => r.text.length >= 80 && r.text.length <= 8000);
      const pool = good.length ? good : results;
      pool.sort((a, b) => a.text.length - b.text.length);
      return { postText: pool[0].text.slice(0, 3000), authorName: '', authorHeadline: '', postType: 'text' };
    }

    // ── Strategy 3: Grab all visible text near the comment box ────
    try {
      const parent = commentBox.closest('main') || document.body;
      const text = cleanNode(parent);
      if (text.length >= 80) {
        return { postText: text.slice(0, 3000), authorName: '', authorHeadline: '', postType: 'text' };
      }
    } catch (_) {}

    return null;
  }

  // ── Build prompt ─────────────────────────────────────────────────────────
  function buildPrompt(ctx, userProfile) {
    const { postText, authorName, authorHeadline, postType } = ctx;

    // userProfile.context is the pre-built string from onboarding
    // e.g. "Name: John\nRole: Engineer\nAbout: I build SaaS products\nDefault tone: Thoughtful"
    let profileBlock = '';
    if (userProfile && userProfile.context) {
      profileBlock =
        `\n\nAbout the person writing this comment (use this to shape perspective and voice — ` +
        `never introduce yourself or mention your name in the comment):\n` +
        userProfile.context;
    }

    const systemPrompt =
      `You are a LinkedIn expert who writes comments that sound like a real, thoughtful professional — not an AI.` +
      `${profileBlock}\n\n` +
      `Rules:\n` +
      `- Write exactly 1 comment, 2-3 sentences max\n` +
      `- Be SPECIFIC to this exact post — reference the actual topic, insight, statistic, or question raised\n` +
      `- Never open with "Great post", "This is so true", "Absolutely", or any hollow opener\n` +
      `- Never use hashtags, em dashes (— or --), or bullet points\n` +
      `- No use of character"- or -- or — " in the comments\n` +
      `- Sound like a smart human colleague leaving a quick thought, not a corporate press release\n` +
      `- Add one of: a genuine perspective, a relevant personal experience, a probing follow-up question, or a concrete real-world example\n` +
      `- Vary sentence structure — do not start multiple sentences the same way\n` +
      `- Return ONLY the comment text, no quotes, no preamble, nothing else`;

    const contextLines = [];
    if (authorName)          contextLines.push(`Post author: ${authorName}`);
    if (authorHeadline)      contextLines.push(`Author's role/headline: ${authorHeadline}`);
    if (postType !== 'text') contextLines.push(`Post format: ${postType}`);
    contextLines.push(`\nPost content:\n${postText}`);

    return { systemPrompt, userMessage: contextLines.join('\n') };
  }

  // ── Inject button ────────────────────────────────────────────────────────
  function injectAIButton(commentBox) {
    if (injectedBoxes.has(commentBox)) return;
    injectedBoxes.add(commentBox);

    const btn = document.createElement('button');
    btn.className = 'linkedai-float-btn';
    btn.innerHTML = `✦ AI`;
    btn.title = 'Draft with LinkedAI';

    function syncButtonVisibility() {
      const isEmpty = !commentBox.innerText.trim() || commentBox.innerText.trim() === '\n';
      btn.classList.toggle('linkedai-btn-hidden', !isEmpty);
    }

    commentBox.addEventListener('input', syncButtonVisibility);
    new MutationObserver(syncButtonVisibility)
      .observe(commentBox, { childList: true, subtree: true, characterData: true });

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const storageData = await new Promise(resolve =>
        chrome.storage.local.get(['session', 'userContext'], resolve)
      );

      if (!storageData.session) {
        showToast('Please sign in to LinkedAI first.');
        return;
      }

      const session = storageData.session;
      const userContext = storageData.userContext || null; // pre-built by onboarding
      const userProfile = (userContext)
        ? { context: userContext }
        : null;

      const ctx = extractPostContext(commentBox);
      if (!ctx || !ctx.postText) {
        showToast('Could not read post content. Try again.');
        return;
      }

      btn.innerHTML = `⏳`;
      btn.disabled = true;

      try {
        const { systemPrompt, userMessage } = buildPrompt(ctx, userProfile);
        const response = await chrome.runtime.sendMessage({
          type: 'CALL_BACKEND',
          session,
          systemPrompt,
          userMessage
        });

        if (!response.success) throw new Error(response.error);

        commentBox.focus();
        document.execCommand('insertText', false, response.result);
        if (!commentBox.innerText.includes(response.result.slice(0, 20))) {
          commentBox.innerText = response.result;
          commentBox.dispatchEvent(new Event('input', { bubbles: true }));
        }
        showToast('✦ Comment drafted! Review before posting.');
      } catch (err) {
        showToast('Error: ' + err.message);
        btn.classList.remove('linkedai-btn-hidden');
      } finally {
        btn.innerHTML = `✦ AI`;
        btn.disabled = false;
      }
    });

    const form = findCommentForm(commentBox);
    if (form) {
      form.style.position = 'relative';
      form.appendChild(btn);
    }
    syncButtonVisibility();
  }

  // ── DOM scanning ─────────────────────────────────────────────────────────
  function scanAndInject() {
    document.querySelectorAll(EDITOR_SELECTOR).forEach(box => injectAIButton(box));
  }

  document.addEventListener('focusin', (e) => {
    if (e.target && e.target.matches(EDITOR_SELECTOR)) injectAIButton(e.target);
  }, true);

  new MutationObserver(scanAndInject).observe(document.body, { childList: true, subtree: true });

  // Staggered scans — catches editors at every stage of LinkedIn's lazy render
  setTimeout(scanAndInject, 500);
  setTimeout(scanAndInject, 1500);
  setTimeout(scanAndInject, 3500);

  // Signal background to pre-warm usage cache while user browses LinkedIn
  chrome.runtime.sendMessage({ type: 'LINKEDIN_LOADED' }).catch(() => {});
})();