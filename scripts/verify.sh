#!/usr/bin/env bash
# Medivoyage Health — pre-commit verification.
# Runs static checks for common bug classes: broken anchors, missing alt text,
# leftover placeholders, mixed content, missing Firebase wiring, etc.
#
# Usage:  ./scripts/verify.sh
# Exits 0 if all checks pass, 1 if any fail.

set -u
PUBLIC_DIR="${PUBLIC_DIR:-public}"
FAIL=0

red()    { printf "\033[0;31m%s\033[0m\n" "$1"; }
green()  { printf "\033[0;32m%s\033[0m\n" "$1"; }
yellow() { printf "\033[0;33m%s\033[0m\n" "$1"; }
cyan()   { printf "\033[0;36m%s\033[0m\n" "$1"; }

cyan "Medivoyage verify.sh — running static checks on $PUBLIC_DIR/"
echo

ALL_HTML="$(find "$PUBLIC_DIR" -name '*.html' -type f 2>/dev/null)"
[ -z "$ALL_HTML" ] && { red "No HTML files found under $PUBLIC_DIR"; exit 1; }

# --------------------------------------------------------------------------
# 1. Same-page anchor targets exist
#    For every <a href="#x">, some element must have id="x" in the same file.
# --------------------------------------------------------------------------
echo "[1/9] Anchor targets resolve..."
LOCAL_FAIL=0
for file in $ALL_HTML; do
  # Extract all #anchor refs in this file (excluding `#` alone or pure hash links).
  hrefs="$(grep -oE 'href="#[A-Za-z0-9_-]+"' "$file" | sed 's/href="#//;s/"$//' | sort -u || true)"
  for href in $hrefs; do
    if ! grep -qE "id=\"$href\"" "$file"; then
      red "  FAIL: $file references #$href but no element in $file has id=\"$href\""
      LOCAL_FAIL=1
    fi
  done
done
[ $LOCAL_FAIL -eq 0 ] && green "  OK" || FAIL=1

# --------------------------------------------------------------------------
# 2. Cross-page links resolve
#    For every <a href="/something" or "/something#x">, the file must exist.
#    cleanUrls is on (firebase.json), so /xxx maps to public/xxx.html.
# --------------------------------------------------------------------------
echo "[2/9] Cross-page links resolve..."
LOCAL_FAIL=0
for file in $ALL_HTML; do
  links="$(grep -oE 'href="/[A-Za-z0-9/_-]+(\.html)?(#[A-Za-z0-9_-]+)?"' "$file" \
          | sed 's/href="//;s/"$//' \
          | grep -vE '^/(\#|__/)' \
          | sed 's/#.*$//' \
          | sort -u || true)"
  for link in $links; do
    [ "$link" = "/" ] && continue  # root is index.html
    target="$PUBLIC_DIR$link"
    if [ ! -f "$target" ] && [ ! -f "${target}.html" ] && [ ! -f "$target/index.html" ]; then
      red "  FAIL: $file links to $link but $target(.html) does not exist"
      LOCAL_FAIL=1
    fi
  done
done
[ $LOCAL_FAIL -eq 0 ] && green "  OK" || FAIL=1

# --------------------------------------------------------------------------
# 3. No leftover placeholders (NEEDS YOUR INPUT, TBD, TODO:, [YOUR XXX])
# --------------------------------------------------------------------------
echo "[3/9] No leftover placeholders..."
HITS="$(grep -rEnH '\[NEEDS YOUR INPUT\]|\bTBD\b|TODO:|\[YOUR [A-Z]' $ALL_HTML 2>/dev/null || true)"
if [ -n "$HITS" ]; then
  red "  FAIL: placeholder text in HTML:"
  echo "$HITS" | sed 's/^/    /'
  FAIL=1
else
  green "  OK"
fi

# --------------------------------------------------------------------------
# 4. No http:// resource references (mixed content risk)
#    Allowed: xmlns="http://www.w3.org/..." (XML namespace, not a network call)
# --------------------------------------------------------------------------
echo "[4/9] No http:// resource references..."
HITS="$(grep -rEnH '(href|src|action)="http://' $ALL_HTML 2>/dev/null || true)"
if [ -n "$HITS" ]; then
  red "  FAIL: http:// resource references (mixed content risk):"
  echo "$HITS" | sed 's/^/    /'
  FAIL=1
else
  green "  OK"
fi

# --------------------------------------------------------------------------
# 5. Every <img> has alt= (accessibility + SEO)
# --------------------------------------------------------------------------
echo "[5/9] All <img> tags have alt..."
LOCAL_FAIL=0
for file in $ALL_HTML; do
  # Find <img tags that span possibly multiple lines, check for alt=
  bad="$(perl -0777 -ne 'while(/<img\b[^>]*>/g){ my $tag=$&; print "$tag\n" unless $tag =~ /\balt\s*=/i; }' "$file" || true)"
  if [ -n "$bad" ]; then
    red "  FAIL: $file has <img> without alt:"
    echo "$bad" | sed 's/^/    /'
    LOCAL_FAIL=1
  fi
done
[ $LOCAL_FAIL -eq 0 ] && green "  OK" || FAIL=1

# --------------------------------------------------------------------------
# 6. Pages with submitWaitlist must include Firebase SDK init
# --------------------------------------------------------------------------
echo "[6/9] Pages with waitlist include Firebase init..."
LOCAL_FAIL=0
for file in $(grep -lE 'submitWaitlist|firestore\(\)' $ALL_HTML 2>/dev/null || true); do
  if ! grep -q '/__/firebase/.*firebase-app-compat' "$file"; then
    red "  FAIL: $file uses Firestore but missing /__/firebase/.../firebase-app-compat.js"
    LOCAL_FAIL=1
  fi
  if ! grep -q '/__/firebase/.*firebase-firestore-compat' "$file"; then
    red "  FAIL: $file uses Firestore but missing /__/firebase/.../firebase-firestore-compat.js"
    LOCAL_FAIL=1
  fi
  if ! grep -q '/__/firebase/init.js' "$file"; then
    red "  FAIL: $file uses Firestore but missing /__/firebase/init.js"
    LOCAL_FAIL=1
  fi
done
[ $LOCAL_FAIL -eq 0 ] && green "  OK" || FAIL=1

# --------------------------------------------------------------------------
# 7. Every page has favicon, manifest, theme-color
# --------------------------------------------------------------------------
echo "[7/9] Favicon, manifest, theme-color on every page..."
LOCAL_FAIL=0
for file in $ALL_HTML; do
  for needle in 'rel="icon"' 'rel="apple-touch-icon"' 'rel="manifest"' 'name="theme-color"'; do
    if ! grep -qF "$needle" "$file"; then
      red "  FAIL: $file missing $needle"
      LOCAL_FAIL=1
    fi
  done
done
[ $LOCAL_FAIL -eq 0 ] && green "  OK" || FAIL=1

# --------------------------------------------------------------------------
# 8. Every page has meta description and non-empty <title>
# --------------------------------------------------------------------------
echo "[8/9] Meta description + page title on every page..."
LOCAL_FAIL=0
for file in $ALL_HTML; do
  if ! grep -qE '<meta[^>]+name="description"[^>]+content="[^"]+' "$file"; then
    red "  FAIL: $file missing meta description (or content empty)"
    LOCAL_FAIL=1
  fi
  if ! grep -qE '<title>[^<]+</title>' "$file"; then
    red "  FAIL: $file missing or empty <title>"
    LOCAL_FAIL=1
  fi
done
[ $LOCAL_FAIL -eq 0 ] && green "  OK" || FAIL=1

# --------------------------------------------------------------------------
# 9. Fixed-header offset CSS rule present (prevents anchor-target hide-behind-nav bug)
#    Every page uses a fixed h-20 header. Anchor targets need scroll-margin-top.
# --------------------------------------------------------------------------
echo "[9/9] scroll-margin-top rule present (fixed-header offset)..."
LOCAL_FAIL=0
for file in $ALL_HTML; do
  if ! grep -q 'scroll-margin-top' "$file"; then
    red "  FAIL: $file missing scroll-margin-top — anchor targets may render behind fixed header"
    LOCAL_FAIL=1
  fi
done
[ $LOCAL_FAIL -eq 0 ] && green "  OK" || FAIL=1

# --------------------------------------------------------------------------
echo
if [ $FAIL -eq 0 ]; then
  green "All 9 checks passed."
  exit 0
else
  red "Some checks failed. Fix above before committing."
  exit 1
fi
