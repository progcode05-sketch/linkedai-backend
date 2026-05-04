(function () {
  'use strict';
  let injectedBoxes = new WeakSet();

  function injectAIButton(commentBox) {
    if (injectedBoxes.has(commentBox)) return;
    injectedBoxes.add(commentBox);

    const btn = document.createElement('button');
    btn.className = 'linkedai-float-btn';
    btn.innerHTML = `<span>✦ AI</span>`;
    btn.title = 'Draft with LinkedAI';

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Get session
      const { session } = await chrome.runtime.sendMessage({ type: 'GET_SESSION' });
      if (!session) {
        showToast('Please sign in to LinkedAI first.');
        return;
      }

      // Get post text
      const postContainer = commentBox.closest('.feed-shared-update-v2, .occludable-update, article');
      let postText = '';
      if (postContainer) {
        const textEl = postContainer.querySelector('.feed-shared-text, .update-components-text');
        postText = textEl ? textEl.innerText.trim() : '';
      }
      if (!postText) {
        postText = prompt('Paste the post content:') || '';
        if (!postText) return;
      }

      btn.innerHTML = `<span>⏳</span>`;
      btn.disabled = true;

      try {
        const systemPrompt = `Generate 1 excellent, authentic LinkedIn comment. 2-3 sentences. No hashtags. No empty praise. No use of character"- or --" in the comments. Add real value. Return ONLY the comment text.`;
        const response = await chrome.runtime.sendMessage({
          type: 'CALL_BACKEND',
          session,
          systemPrompt,
          userMessage: `LinkedIn post:\n\n${postText.slice(0, 1500)}`
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
      } finally {
        btn.innerHTML = `<span>✦ AI</span>`;
        btn.disabled = false;
      }
    });

    const parent = commentBox.parentElement;
    if (parent) {
      parent.style.position = 'relative';
      parent.appendChild(btn);
    }
  }

  function showToast(msg) {
    const existing = document.getElementById('linkedai-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'linkedai-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  const observer = new MutationObserver(() => {
    document.querySelectorAll('.ql-editor[contenteditable="true"]').forEach(box => injectAIButton(box));
  });
  observer.observe(document.body, { childList: true, subtree: true });

  setTimeout(() => {
    document.querySelectorAll('.ql-editor[contenteditable="true"]').forEach(box => injectAIButton(box));
  }, 2000);
})();
