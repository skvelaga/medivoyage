# CLAUDE.md — Working agreement for AI agents in this repo

This file is the contract any AI agent (Claude, Codex, Cursor, etc.) commits to
when modifying this codebase. It exists because the founder (Sampath) was
finding bugs the AI should have caught — broken anchor links, missing alt
text, anchor targets hidden behind the fixed nav, etc. Goal: never ship a
class of bug twice.

## The rule

**Before saying "done" on any change, you must:**

1. Run `./scripts/verify.sh` from the repo root.
   It must exit 0. No exceptions.

2. **For UI changes:** load the modified page in a real browser
   (Claude in Chrome MCP if available, or ask the user to test) and:
   - Hard-refresh (Cmd+Shift+R)
   - Click every link or button you touched, verify it lands cleanly under
     the fixed nav (not behind it)
   - If a form was modified, attempt a submit and verify the success state
     appears
   - Spot-check mobile viewport via DevTools

3. **For code changes only (no HTML):** confirm `verify.sh` passes — that's
   sufficient.

4. **Do NOT commit if verify.sh fails.** Fix the issue first.

## What `verify.sh` checks (automated)

| # | Check | Bug class it prevents |
|---|---|---|
| 1 | Same-page anchor targets resolve | `href="#x"` with no matching `id="x"` (silent broken link) |
| 2 | Cross-page links resolve | `href="/foo"` to a file that doesn't exist |
| 3 | No leftover placeholders | `[NEEDS YOUR INPUT]`, `TBD`, `TODO:`, `[YOUR XXX]` shipping in HTML |
| 4 | No `http://` resource references | Mixed-content warnings in browsers |
| 5 | All `<img>` tags have `alt` | Accessibility + SEO regression |
| 6 | Pages with waitlist include Firebase SDK | Form submits silently fail |
| 7 | Favicon + manifest + theme-color on every page | Missing branding on browser tabs / iOS home screen |
| 8 | Meta description + non-empty `<title>` | SEO regression |
| 9 | `scroll-margin-top` rule present | Anchor jumps land behind the fixed nav |

If you add a new bug class to this repo, **add a check to `verify.sh`** so
it never recurs.

## What `verify.sh` cannot check (manual, browser-required)

These require a live page load + interaction. Always do these manually
before saying "done" on UI work:

- Anchor jumps actually scroll the page and the target lands fully visible
- Forms actually write to Firestore (visible in Firebase console under `leads`)
- Mobile breakpoints render correctly (use DevTools device toolbar)
- Cross-browser issues (Safari vs Chrome vs Firefox)
- DNS / SSL on the live deploy is healthy
- Visual regressions
- Page weight / loading speed didn't regress

Use Claude in Chrome MCP if available. Otherwise ask the user to test.

## Repo conventions (don't break these)

### Branding
- **Forest green** `#1B3B36` is the primary
- **Cream** `#F7F2EA` is the background
- **Terracotta** `#C86B4A` is the accent
- **Brass** `#B08A5B` is the secondary accent
- Fonts: **Fraunces** (serif headings) + **Inter** (sans body)
- All four colors and both fonts are configured in every page's
  Tailwind config block. Don't introduce new ones.

### Layout
- Fixed nav header is `h-20` (80px tall).
- All anchor targets MUST have `scroll-margin-top: 96px` so they render
  below the fixed header. Enforced by the global rule
  `[id] { scroll-margin-top: 96px; }` in every page's `<style>`.
- `<html>` has `scroll-behavior: smooth` for nicer anchor jumps.

### Forms / Firestore
- All forms use `submitWaitlist(event, 'SourceName')` where `SourceName`
  identifies which page/CTA the lead came from (`Hero`, `Final`, `How`,
  `Savings`, `Clinics`, `Implants`, etc.). When you add a new form, pick
  a new unique source name and document it below.
- Every page with a form must include the three Firebase scripts:
  `firebase-app-compat.js`, `firebase-firestore-compat.js`,
  `init.js` (auto-initialized via Firebase Hosting reserved URLs).
- Success state uses `<div id="success{SourceName}" class="success-msg">`
  with `.success-msg.active` revealing it.

### Lead source registry
| Source name | Page | CTA location |
|---|---|---|
| `Hero` | `/` (home) | Hero waitlist form |
| `Final` | `/` (home) | Final CTA section |
| `How` | `/how-it-works` | Bottom CTA |
| `Savings` | `/savings` | Bottom quote-request CTA |
| `Clinics` | `/clinics` | Bottom CTA + per-card "Get matched" |
| `Implants` | `/procedures/dental-implants` | Bottom CTA |

### Routing
- Firebase Hosting `cleanUrls: true` is enabled → `/savings` resolves to
  `public/savings.html`. Always link without the `.html` extension.
- Apex `medivoyage.health` 301-redirects to `https://www.medivoyage.health/`.
- HTTP redirects to HTTPS automatically.

### Firestore
- Single collection: `leads`.
- Schema: `name`, `email`, `phone`, `source`, `page`, `referrer`,
  `userAgent`, `createdAt` (server timestamp).
- Security rules: only `create` on `leads` is allowed for unauthenticated
  users, requiring all the fields above. Rules live in `firestore.rules`.

### Deploy
- Push to `main` → GitHub Actions runs `firebase-hosting-merge.yml` →
  deploys to `medivoyage-1ff3b.web.app` and `www.medivoyage.health`.
- Takes ~1–2 minutes.

## Honest copy / no-fabrication rule

This site sells a real medical service. Never write:

- Made-up testimonials with named patients
- Statistics without a citable source
- Doctor credentials we haven't verified
- Procedure prices that aren't grounded in real partner-clinic rate cards
- Claims like "trusted by 10,000 patients" if it isn't true

If a piece of copy can't be defended to a partner clinic, an investor, or a
patient who decides to fly to Mexico based on it — don't write it.

## Honest scope rule

Only one launch partner is signed (PV Smile, Puerto Vallarta). The other
9 clinics are **in conversations**, not partners. Any UI must reflect this:

- PV Smile gets the "Launch partner" badge
- Other 9 are framed as "in conversations" or "additional clinics joining
  ahead of summer 2026"
- Don't let copy drift into implying confirmed partnerships that don't exist

## When you add a new feature

1. Implement it.
2. **Add a new check to `verify.sh`** if your feature introduces a new bug
   class that's worth catching automatically.
3. **Update this file** if you introduce a new repo convention.
4. Run `verify.sh`. Must pass.
5. Live browser smoke test if UI changed.
6. Then commit + push.
