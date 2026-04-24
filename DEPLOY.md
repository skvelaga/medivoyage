# Medivoyage — Deploy runbook

**Goal:** push this repo to `github.com/skvelaga/medivoyage` and auto-deploy to Firebase project `medivoy-1ff3b` on every merge to `main`. PRs get preview URLs.

Total time: ~10 minutes.

---

## Prereqs (one-time)

On your Mac:

```bash
# Firebase CLI (you said you're already logged in)
firebase --version

# GitHub CLI — if not installed
brew install gh
gh auth login   # choose GitHub.com, HTTPS, authenticate via browser
```

---

## Step 1 — get this folder onto your laptop

The project lives at `/sessions/sweet-bold-dirac/mnt/outputs/medivoyage/` inside this session. Copy it to a folder on your Mac (e.g. `~/code/medivoyage/`).

---

## Step 2 — create the GitHub repo and push

```bash
cd ~/code/medivoyage

# Create private repo under skvelaga and push everything
gh repo create skvelaga/medivoyage --private --source=. --remote=origin --push
```

That's it. The repo now exists at `github.com/skvelaga/medivoyage` and the initial commit is on `main`.

---

## Step 3 — generate the Firebase service account JSON

In your browser (you're already logged in):

1. Open https://console.firebase.google.com/project/medivoy-1ff3b/settings/serviceaccounts/adminsdk
2. Click **Generate new private key** → confirm. A JSON file downloads.
3. Open it in your editor. You need the whole JSON (starts with `{`, ends with `}`).

---

## Step 4 — add the JSON as a GitHub secret

Still in the terminal, from `~/code/medivoyage`:

```bash
# Paste the JSON when prompted (or pipe a file)
gh secret set FIREBASE_SERVICE_ACCOUNT_MEDIVOY_1FF3B < ~/Downloads/medivoy-1ff3b-firebase-adminsdk-*.json
```

(Adjust the filename to whatever Firebase downloaded.)

Verify:

```bash
gh secret list
# Should show FIREBASE_SERVICE_ACCOUNT_MEDIVOY_1FF3B
```

---

## Step 5 — trigger the first deploy

Push any change (or just retrigger the workflow):

```bash
git commit --allow-empty -m "Trigger first deploy"
git push
```

Open https://github.com/skvelaga/medivoyage/actions — you'll see the workflow running. Takes ~1 minute.

When green, your site is live at `https://medivoy-1ff3b.web.app`.

---

## Step 6 — connect medivoyage.health

1. Open https://console.firebase.google.com/project/medivoy-1ff3b/hosting/main
2. Click **Add custom domain** → enter `medivoyage.health` → follow Firebase's prompts.
3. Firebase gives you a TXT record and two A records. Add them at **Porkbun → DNS**:
   - TXT: hostname `@`, value from Firebase (for domain verification)
   - After verification, two A records: hostname `@`, values Firebase gives you
   - CNAME: hostname `www`, value `medivoy-1ff3b.web.app`
4. DNS usually propagates in 10–30 min. SSL auto-provisions once verified.

Also add `www.medivoyage.health` as a redirect → `medivoyage.health` in Firebase Hosting UI.

---

## Step 7 — done. Future deploys are automatic.

After this, any time you push to `main`, the site redeploys. Open a PR to get a preview URL.

```bash
# Edit something
vim public/index.html
git add public/index.html
git commit -m "Update hero copy"
git push
# ~60 seconds later, medivoyage.health reflects the change
```

---

## Troubleshooting

- **Workflow fails with "HTTP 403: The caller does not have permission"** → the service account JSON wasn't generated for the right project, or the secret name is wrong. Verify secret is named exactly `FIREBASE_SERVICE_ACCOUNT_MEDIVOY_1FF3B` (all caps, underscores match project ID).
- **Workflow fails with "Hosting not enabled"** → in Firebase Console, Hosting → Get started (one click).
- **Custom domain stuck on "Needs setup"** → DNS hasn't propagated. Wait 10 more minutes, or check Porkbun DNS has no conflicting records (delete Porkbun's default parking entries).
- **Need to change project ID later** → update `.firebaserc`, the two workflow files' `projectId`, and rename the secret. Then re-run Step 5.
