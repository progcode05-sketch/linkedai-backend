# Linkora Backend – Deployment Guide

## Step 1 — Supabase Schema

1. Go to [supabase.com](https://supabase.com) → your project → **SQL Editor → New Query**
2. Open `supabase_setup.sql` from this folder, paste the entire contents, click **Run**
3. You should see "Success. No rows returned" — that's correct.

---

## Step 2 — GitHub Repo

1. Go to [github.com](https://github.com) → click **+** → **New Repository**
   - Name: `linkedai-backend`
   - Private: yes
   - Don't add README
2. Open a terminal in `D:\Claude Code\linkedin-ai-backend\` and run:
   ```
   git init
   git add .
   git commit -m "Initial backend"
   git remote add origin https://github.com/YOUR_USERNAME/linkedai-backend.git
   git push -u origin main
   ```

---

## Step 3 — Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import from GitHub → select `linkedai-backend`
3. Framework Preset: **Other**
4. Click **Deploy** (it will fail the first time — that's fine, we add env vars next)

---

## Step 4 — Environment Variables

In Vercel → your project → **Settings → Environment Variables**, add ALL of these:

| Name | Value |
|------|-------|
| `SUPABASE_URL` | Your Supabase project URL (Settings → API) |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service_role key (Settings → API) |
| `JWT_SECRET` | Run this in any terminal: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` — paste the output |
| `ANTHROPIC_API_KEY` | Your Claude API key |
| `LINKEDIN_CLIENT_ID` | From LinkedIn Developer App → Auth tab |
| `LINKEDIN_CLIENT_SECRET` | From LinkedIn Developer App → Auth tab |
| `RAZORPAY_KEY_ID` | From Razorpay → Settings → API Keys |
| `RAZORPAY_KEY_SECRET` | From Razorpay → Settings → API Keys |
| `RAZORPAY_PLAN_PRO` | Plan ID from Razorpay → Subscriptions → Plans (e.g. `plan_XXXXXXXX`) |
| `RAZORPAY_PLAN_MAX` | Plan ID from Razorpay → Subscriptions → Plans |
| `RAZORPAY_WEBHOOK_SECRET` | You'll get this in Step 5 below |

After adding all vars → **Deployments → Redeploy**

---

## Step 5 — Razorpay Webhook

1. Go to [dashboard.razorpay.com](https://dashboard.razorpay.com) → **Settings → Webhooks → Add New Webhook**
2. URL: `https://YOUR-VERCEL-DOMAIN.vercel.app/api/billing/webhook`
3. Secret: create any random string (e.g. 32 random characters) — copy it
4. Enable these events:
   - `subscription.activated`
   - `subscription.charged`
   - `subscription.cancelled`
   - `subscription.halted`
   - `payment.failed`
5. Save — then add the secret as `RAZORPAY_WEBHOOK_SECRET` in Vercel and **Redeploy**

---

## Step 6 — Update the Extension

Open these two files and replace `YOUR_LINKEDIN_CLIENT_ID` and the backend URL:

**`popup.js`** (line 2 and 5):
```js
const BACKEND_URL = 'https://YOUR-VERCEL-DOMAIN.vercel.app';
const LINKEDIN_CLIENT_ID = 'YOUR_ACTUAL_LINKEDIN_CLIENT_ID';
```

**`background.js`** (line 2):
```js
const BACKEND_URL = 'https://YOUR-VERCEL-DOMAIN.vercel.app';
```

**`onboarding.js`** (line 3 and 4):
```js
const LINKEDIN_CLIENT_ID = 'YOUR_ACTUAL_LINKEDIN_CLIENT_ID';
const BACKEND_URL = 'https://YOUR-VERCEL-DOMAIN.vercel.app';
```

**`manifest.json`** — update `host_permissions`:
```json
"host_permissions": [
  "https://www.linkedin.com/*",
  "https://YOUR-VERCEL-DOMAIN.vercel.app/*"
]
```

---

## Step 7 — LinkedIn App Redirect URI

1. Go to [linkedin.com/developers/apps](https://www.linkedin.com/developers/apps) → your app → **Auth** tab
2. Load extension at `chrome://extensions/` → enable Developer Mode → copy the Extension ID
3. Add redirect URL: `https://YOUR_EXTENSION_ID.chromiumapp.org/`
4. Make sure **"Sign In with LinkedIn using OpenID Connect"** product is added to your app
