# Medivoyage Health — Landing Page

AI-powered concierge for dental care in Mexico. Launching summer 2026.

## Local preview

```bash
# From the medivoyage-site directory:
npx serve public
# Or open public/index.html directly in a browser
```

## Deploy to Firebase Hosting

Prereqs: you need the Firebase CLI (`npm install -g firebase-tools`) and you need to be logged in (`firebase login`).

### First-time setup

```bash
# 1. From inside medivoyage-site/:
firebase use --add
# Pick your Firebase project when prompted, then alias it as "default".
# This writes your project ID into .firebaserc.

# 2. Deploy:
firebase deploy --only hosting
```

You'll get a URL like `https://your-project-id.web.app`. Point your custom domain at it from the Firebase console (Hosting → Add custom domain).

### Subsequent deploys

```bash
firebase deploy --only hosting
```

## Push to GitHub

If you don't have the GitHub CLI installed locally, install it: `brew install gh` then `gh auth login`.

### First-time push

```bash
# From inside medivoyage-site/:
gh repo create medivoyage-site --public --source=. --push

# OR without gh CLI:
# 1. Create an empty repo at https://github.com/new (don't add README or .gitignore — we have them)
# 2. Then:
git remote add origin https://github.com/YOUR_USERNAME/medivoyage-site.git
git branch -M main
git push -u origin main
```

### Subsequent pushes

```bash
git add .
git commit -m "Update landing page"
git push
```

## Optional: continuous deployment

Once the GitHub repo is up and the Firebase project is linked:

```bash
firebase init hosting:github
```

This sets up a GitHub Actions workflow that auto-deploys on every push to main. Takes 2 minutes.

## Project structure

```
medivoyage-site/
├── public/
│   └── index.html        # The landing page
├── firebase.json          # Firebase Hosting config (caching headers, clean URLs)
├── .firebaserc            # Firebase project alias (fill in your project ID)
├── .gitignore
└── README.md
```

## Waitlist form

The form currently shows a success message in-browser only — emails are NOT being collected.

To start collecting emails, open `public/index.html` and look for the `submitWaitlist` function near the bottom. Swap the in-memory handler for a real endpoint. Easiest options:

- **Formspree** (https://formspree.io) — free tier, 50 submissions/month, takes 5 minutes to set up
- **ConvertKit / Kit** (https://kit.com) — proper email list, free under 10k subscribers
- **Mailchimp embedded form** — classic, but heavier

The commented-out code in the HTML shows the Formspree wiring.
