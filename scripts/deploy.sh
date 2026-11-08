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
REPO="${DEAL_SCREEN_REPO:-deal_evaluation}"
BRANCH="${DEAL_SCREEN_BRANCH:-gh-pages}"
DEPLOY_DIR=".deploy"
REMOTE="https://github.com/$OWNER/$REPO.git"

echo "▸ Unit tests"; npm test --silent
echo "▸ Build";      node build.js
echo "▸ Encrypt";    npx pagecrypt dist/plain.html dist/index.html "$DEAL_SCREEN_PASSWORD"
if grep -q -e 'DSModel' -e 'Cedar Creek Deal Screen' dist/index.html; then
  echo "Encrypted output contains plaintext. Aborting." >&2; exit 1
fi

# The Pages branch holds ONLY the encrypted page (+ .nojekyll). Source stays on main.
rm -rf "$DEPLOY_DIR"
if git ls-remote --exit-code --heads "$REMOTE" "$BRANCH" >/dev/null 2>&1; then
  git clone -q --depth 1 --branch "$BRANCH" "$REMOTE" "$DEPLOY_DIR"
else
  mkdir -p "$DEPLOY_DIR"; git -C "$DEPLOY_DIR" init -q -b "$BRANCH"; git -C "$DEPLOY_DIR" remote add origin "$REMOTE"
fi
find "$DEPLOY_DIR" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp dist/index.html "$DEPLOY_DIR/index.html"
touch "$DEPLOY_DIR/.nojekyll"
git -C "$DEPLOY_DIR" add -A
if git -C "$DEPLOY_DIR" diff --cached --quiet; then
  echo "▸ No changes to publish"
else
  git -C "$DEPLOY_DIR" commit -q -m "Deploy $(date -u +%Y-%m-%dT%H:%MZ)"
  git -C "$DEPLOY_DIR" push -q -u origin "$BRANCH"
  echo "▸ Pushed encrypted page to $BRANCH"
fi

if ! gh api "repos/$OWNER/$REPO/pages" >/dev/null 2>&1; then
  echo "▸ Enabling GitHub Pages from $BRANCH"
  gh api -X POST "repos/$OWNER/$REPO/pages" -f "source[branch]=$BRANCH" -f 'source[path]=/' >/dev/null 2>&1 \
    || echo "  (could not enable via API; if the site 404s, set Settings → Pages → Branch: $BRANCH / root)"
fi

URL="https://$OWNER.github.io/$REPO/"
DEPLOYED=$(md5sum < dist/index.html | cut -d' ' -f1)
echo -n "▸ Waiting for Pages to serve the new build"
for i in $(seq 1 60); do
  LIVE=$(curl -fsS "$URL?nocache=$RANDOM" 2>/dev/null | md5sum | cut -d' ' -f1 || true)
  [ "$LIVE" = "$DEPLOYED" ] && { echo; echo "✓ Live: $URL"; exit 0; }
  echo -n "."; sleep 10
done
echo; echo "Pushed, but the site isn't serving the new build yet (CDN can lag a few minutes): $URL"
