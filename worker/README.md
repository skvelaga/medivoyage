# Medivoyage AI Worker

Cloudflare Worker that powers the live AI demo at `/demo`.
Receives intake (text or structured) → calls Anthropic Claude → returns treatment plan + cost comparison.

## What it is

- Entry: `src/index.js`
- Rate card (deterministic costs): `src/rate-card.js`
- Procedure scope: **single-tooth dental implant + crown only** (v1 prototype)
- Model: `claude-sonnet-4-5-20250929`
- Average cost per intake: ~$0.008–$0.012 USD

## Endpoints

- `POST /api/intake` — accepts JSON `{mode, description?, structured?}`, returns plan
- `GET /api/health` — sanity check

## Local development

```bash
cd worker
npm install
# Make sure .dev.vars has ANTHROPIC_API_KEY=sk-ant-... (gitignored)
npx wrangler dev
```

The worker listens on `http://127.0.0.1:8787`. The demo page (`public/demo.html`) auto-detects localhost and points to that URL when running locally.

## Production deployment

### One-time setup

1. **Create a Cloudflare account** at https://dash.cloudflare.com/sign-up (free tier is sufficient — Workers free tier = 100K requests/day).

2. **Authenticate the wrangler CLI:**
   ```bash
   cd worker
   npx wrangler login
   ```
   This opens a browser to authenticate. Approve the requested permissions.

3. **Set the production API key as a secret** (do NOT use the key currently in `.dev.vars` — rotate it first by creating a fresh key at https://console.anthropic.com/settings/keys, then revoking the old one):
   ```bash
   npx wrangler secret put ANTHROPIC_API_KEY
   # Paste the new key when prompted. It's encrypted in Cloudflare's vault — never visible in code or logs again.
   ```

4. **Deploy:**
   ```bash
   npx wrangler deploy
   ```
   Output will give you a URL like:
   ```
   https://medivoyage-ai.<your-subdomain>.workers.dev
   ```

5. **Update `public/demo.html`** — find the line near the bottom of the AI demo `<script>`:
   ```js
   : 'https://medivoyage-ai.medivoyage-health.workers.dev');  // Placeholder — update after deploy
   ```
   Replace the placeholder URL with the real one from step 4.

6. **Push to GitHub.** The existing GitHub Actions workflow auto-deploys to Firebase Hosting.

### Verify

After deploy, test the production worker:
```bash
curl -i https://medivoyage-ai.<your-subdomain>.workers.dev/api/health
```

Should return `{"status":"ok",...,"anthropic_key_configured":true}`.

Then open https://medivoyage.health/demo and click "Generate AI plan" with one of the example cases. You should get a real Claude-generated plan in ~5–10 seconds.

## Custom domain (optional, recommended later)

To serve the worker at `api.medivoyage.health` instead of `*.workers.dev`:

1. Add medivoyage.health to Cloudflare (change DNS nameservers at your registrar).
2. In Cloudflare dashboard → Workers Routes → add `api.medivoyage.health/*` → `medivoyage-ai`.
3. Update `public/demo.html` worker URL to `https://api.medivoyage.health`.

This step is non-essential — `*.workers.dev` is perfectly fine for the demo.

## Cost monitoring

- Anthropic console → Usage: hard $-cap can be set so it can never run away.
- Cloudflare Workers free tier: 100,000 requests/day. Way more than the demo will hit.
- Recommendation: cap Anthropic at $20/month while testing.

## Security checklist

- [x] API key never in source control (`.dev.vars` in `.gitignore`).
- [x] API key never sent to the browser — worker holds it server-side.
- [x] CORS restricted to known origins.
- [x] Input length bounds (10–2000 chars for text, age 16–100 for structured).
- [ ] **TODO after deploy**: rotate the dev key currently in `.dev.vars` — it was shared in chat. Generate a new key, update `.dev.vars` locally, set the new one as the Cloudflare secret, then revoke the old one at console.anthropic.com.
- [ ] **Optional**: add Cloudflare Turnstile (CAPTCHA) on the demo form if abuse becomes a problem.
- [ ] **Optional**: add per-IP rate limiting via Cloudflare's free rate-limiting rules.

## Files

```
worker/
├── README.md           ← this file
├── package.json        ← wrangler dev dependency
├── wrangler.toml       ← worker config + non-secret env vars
├── .dev.vars           ← gitignored; ANTHROPIC_API_KEY for local dev
└── src/
    ├── index.js        ← worker entry, request handling, prompt building
    └── rate-card.js    ← deterministic cost computation, pulled from /savings
```
