#!/bin/bash
# Fast-forwards the current branch to merge-3 (origin/main merge, #3) and pushes it. Double-click in Finder.
cd "$(dirname "$0")/.."
GH="$(command -v gh || true)"
for p in /opt/homebrew/bin/gh /usr/local/bin/gh; do [ -z "$GH" ] && [ -x "$p" ] && GH="$p"; done
[ -n "$GH" ] && "$GH" auth setup-git --hostname github.com >/dev/null 2>&1
rm -f .git/index.lock .git/objects/maintenance.lock 2>/dev/null
BRANCH="$(git branch --show-current)"
[ "$BRANCH" = "main" ] && { echo "main yasak"; read -r -p "Enter"; exit 1; }
git merge --ff-only merge-3 2>&1 | tee scripts/.merge-push.log
git push -u origin "HEAD:$BRANCH" 2>&1 | tee -a scripts/.merge-push.log
git log --oneline -3 | tee -a scripts/.merge-push.log
read -r -p "Kapatmak için Enter…"
