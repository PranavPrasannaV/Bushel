#!/usr/bin/env bash
# Build the static web app and publish it to the gh-pages branch (GitHub Pages, "deploy from a branch").
# The deployed site has no backend: it serves the pre-built fires in web/public/data.
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
repo_url="$(git -C "$repo_root" remote get-url origin)"
name="$(basename -s .git "$repo_url")"
work="$(mktemp -d)"

cd "$repo_root/web"
# MSYS_NO_PATHCONV stops Git Bash on Windows rewriting "/Bushel/" as a filesystem path.
MSYS_NO_PATHCONV=1 VITE_BASE="/$name/" npm run build
cp -r dist/. "$work/"
touch "$work/.nojekyll"   # serve files as-is, including any starting with an underscore
cp "$work/index.html" "$work/404.html"   # unknown paths fall back to the app

cd "$work"
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C "$repo_root" config user.name)" \
    -c user.email="$(git -C "$repo_root" config user.email)" \
    commit -q -m "Deploy $(git -C "$repo_root" rev-parse --short HEAD)"
git push -q --force "$repo_url" gh-pages
echo "Deployed $(git -C "$repo_root" rev-parse --short HEAD) to gh-pages"
