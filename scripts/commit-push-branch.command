#!/bin/bash
# Commits the working tree and pushes the CURRENT branch (never main). Double-click in Finder.
set -uo pipefail
cd "$(dirname "$0")/.."
LOG="scripts/.commit-push.log"
pause() { read -r -p "Kapatmak için Enter…"; }
GH="$(command -v gh || true)"
for p in /opt/homebrew/bin/gh /usr/local/bin/gh "$HOME/.local/bin/gh"; do [ -z "$GH" ] && [ -x "$p" ] && GH="$p"; done
[ -n "$GH" ] && "$GH" auth setup-git --hostname github.com >/dev/null 2>&1
BRANCH="$(git branch --show-current)"
if [ -z "$BRANCH" ] || [ "$BRANCH" = "main" ]; then echo "❌ main'e doğrudan commit/push yok (dal: '$BRANCH')." | tee "$LOG"; pause; exit 1; fi
rm -f .git/index.lock 2>/dev/null || true
git add -A
git reset -q -- available_luxury_com_results.txt scripts/.prod-email.txt 2>/dev/null || true
if git diff --cached --quiet; then echo "Commit'lenecek değişiklik yok." | tee "$LOG"; else
git commit -q -F - <<'MSG' 2>&1 | tee "$LOG"
Backend hardening: anchor ownership, quotas, idempotent counters, rules and admin fixes

Issues #4 #6 #7 #8 #12 #13 #15 (cloud-claude scope): registerCloudAnchor ownership records,
surface-texture channel closed, race-safe post quota, server-derived placement fields,
idempotent trigger counters, content filter + reserved handles + 30-day handle cooldown,
deleteAccount hardening (recent auth, paging, Apple revoke), durable anchor delete queue,
Firestore/Storage rules tightening with tests, admin panel security fixes, CI additions.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SSUDQfZgDdaCiY8Xr3PyRo
MSG
fi
echo "==> origin/$BRANCH dalına gönderiliyor…"
git push -u origin "HEAD:$BRANCH" 2>&1 | tee -a "$LOG"
status=${PIPESTATUS[0]}
if [ "$status" -eq 0 ]; then echo "✅ Bitti."; else echo "❌ Gönderim başarısız (kod $status). Ayrıntı: $LOG"; fi
pause
