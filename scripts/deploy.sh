#!/usr/bin/env bash
# Rebuild, re-encrypt and publish the Deal Screen to GitHub Pages.
# Usage: DEAL_SCREEN_PASSWORD=... npm run deploy
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${DEAL_SCREEN_PASSWORD:-}" ]; then
  echo "DEAL_SCREEN_PASSWORD is not set. Export it in your shell first (never commit it)." >&2
  exit 1
fi
OWNER="${DEAL_SCREEN_OWNER:-jacobswain}"
REPO="${DEAL_SCREEN_REPO:-deal-screen}"
DEPLOY_DIR=".deploy"

echo "▸ Unit tests"; npm test --silent
echo "▸ Build";      node build.js
echo "▸ Encrypt";    npx pagecrypt dist/plain.html dist/index.html "$DEAL_SCREEN_PASSWORD"
if grep -q -e 'DSModel' -e 'Cedar Creek Deal Screen' dist/index.html; then
  echo "Encrypted output contains plaintext. Aborting." >&2; exit 1
fi

if [ ! -d "$DEPLOY_DIR/.git" ]; then
  rm -rf "$DEPLOY_DIR"
  if ! gh repo view "$OWNER/$REPO" >/dev/null 2>&1; then
    echo "▸ Creating public repo $OWNER/$REPO"
    gh repo create "$OWNER/$REPO" --public --description "Cedar Creek Deal Screen (encrypted build)" >/dev/null
  fi
  git clone "https://github.com/$OWNER/$REPO.git" "$DEPLOY_DIR" 2>/dev/null || { mkdir -p "$DEPLOY_DIR"; git -C "$DEPLOY_DIR" init -q; git -C "$DEPLOY_DIR" remote add origin "https://github.com/$OWNER/$REPO.git"; }
fi
git -C "$DEPLOY_DIR" checkout -q -B main
git -C "$DEPLOY_DIR" pull -q --ff-only origin main 2>/dev/null || true

# The public repo holds ONLY the encrypted page (+ .nojekyll).
find "$DEPLOY_DIR" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp dist/index.html "$DEPLOY_DIR/index.html"
touch "$DEPLOY_DIR/.nojekyll"
git -C "$DEPLOY_DIR" add -A
if git -C "$DEPLOY_DIR" diff --cached --quiet; then
  echo "▸ No changes to publish"
else
  git -C "$DEPLOY_DIR" commit -q -m "Deploy $(date -u +%Y-%m-%dT%H:%MZ)"
  git -C "$DEPLOY_DIR" push -q -u origin main
  echo "▸ Pushed"
fi

if ! gh api "repos/$OWNER/$REPO/pages" >/dev/null 2>&1; then
  echo "▸ Enabling GitHub Pages"
  gh api -X POST "repos/$OWNER/$REPO/pages" -f 'source[branch]=main' -f 'source[path]=/' >/dev/null
fi

echo -n "▸ Waiting for Pages build"
for i in $(seq 1 60); do
  STATUS=$(gh api "repos/$OWNER/$REPO/pages/builds/latest" --jq .status 2>/dev/null || echo pending)
  [ "$STATUS" = "built" ] && break
  [ "$STATUS" = "errored" ] && { echo; echo "Pages build errored" >&2; exit 1; }
  echo -n "."; sleep 5
done
echo
URL=$(gh api "repos/$OWNER/$REPO/pages" --jq .html_url)
echo "✓ Live: $URL"
