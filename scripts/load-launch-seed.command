#!/bin/bash
# LociAR: load the launch seed notes (docs/release/LAUNCH_SEED.md) into the live Firebase project.
# Double-click in Finder or run in Terminal on a Mac. Needs Google Cloud CLI (gcloud), git and Node.js 22.
# Works in a separate checkout (~/.lociar-seed) of the published branch, so local edits stay untouched.
# Safe to re-run: the content user and every note have fixed keys, loaded items are skipped.
# Strict preflight stops on unreviewed pins, identity plans or existing-text mismatches.
# SEED_LIST chooses batches (default: the world capitals and the business notes; the A/B Turkey drafts wait
# for coordinate review). Field-only AR drafts stay held whatever is passed.
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="$(pwd)"
PROJECT="lociar-2f38c"
BRANCH="${SEED_BRANCH:-codex/fix-anonymous-location-audit}"
WORK="$HOME/.lociar-seed"
LOG="$REPO/.git/lociar-seed-load.log"
exec > >(tee "$LOG") 2>&1
step() { echo ""; echo "==> $*"; }
finish() { echo ""; echo "Log: $LOG"; read -r -p "Kapatmak için Enter…" || true; }
trap finish EXIT

export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"
for tool in gcloud git python3; do
  command -v "$tool" >/dev/null 2>&1 || { echo "❌ $tool bulunamadı."; exit 1; }
done

# The first Node.js 22+ that actually starts (a Homebrew node can break after a partial upgrade).
pick_node() {
  local candidate
  for candidate in "$(command -v node 2>/dev/null)" /opt/homebrew/opt/node@22/bin/node /opt/homebrew/opt/node@24/bin/node \
      /usr/local/bin/node /usr/local/opt/node@22/bin/node "$HOME"/.nvm/versions/node/v2*/bin/node \
      "$HOME/.volta/bin/node" "$HOME"/.local/share/fnm/node-versions/v2*/installation/bin/node; do
    [ -n "$candidate" ] && [ -x "$candidate" ] || continue
    if "$candidate" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' >/dev/null 2>&1; then
      echo "$candidate"; return 0
    fi
    echo "  (çalışmayan veya eski Node atlandı: $candidate)" >&2
  done
  return 1
}
if ! NODE="$(pick_node)"; then
  echo "❌ Çalışan Node.js 22+ bulunamadı. Homebrew Node bozuksa: brew reinstall simdjson node   (veya brew install node@22)"
  exit 1
fi
export PATH="$(dirname "$NODE"):$PATH"
echo "Node: $NODE ($(node -v))"
command -v npm >/dev/null 2>&1 || { echo "❌ npm bulunamadı ($NODE yanında)."; exit 1; }

step "En güncel seed dosyaları alınıyor ($BRANCH)"
git fetch --quiet origin "$BRANCH"
if [ -d "$WORK/.git" ] || [ -f "$WORK/.git" ]; then
  git -C "$WORK" checkout --quiet --detach --force FETCH_HEAD 2>/dev/null || git -C "$WORK" checkout --quiet --detach --force "$(git rev-parse FETCH_HEAD)"
else
  git worktree prune
  git worktree add --quiet --detach "$WORK" FETCH_HEAD
fi
echo "Commit: $(git -C "$WORK" log -1 --format='%h %s')"
cd "$WORK"
python3 scripts/seed/world_capitals.py --check
python3 scripts/seed/landmark_businesses.py --check
python3 scripts/seed/turkey_launch.py --check

step "Admin bağımlılıkları kuruluyor"
npm ci --prefix admin --no-audit --no-fund --loglevel=error

step "Google girişi (Application Default Credentials). Gerekirse tarayıcı açılır; projenin sahibi olan hesapla gir."
if ! gcloud auth application-default print-access-token >/dev/null 2>&1; then
  gcloud auth application-default login
fi
gcloud auth application-default set-quota-project "$PROJECT" >/dev/null 2>&1 || true

cd admin
run() { GOOGLE_CLOUD_PROJECT="$PROJECT" node --conditions=react-server --import ./tests/register-typescript.mjs "$@"; }

step "Süper admin ve @loci.guide içerik hesabı"
ACTOR="$(run scripts/seed-prepare.mjs ${SEED_ACTOR_EMAIL:+--actor-email "$SEED_ACTOR_EMAIL"} | tail -n 1)"

for SEED in ${SEED_LIST:-world-capitals landmark-businesses}; do
  step "Kontrol: $SEED (yalnız okur)"
  run scripts/seed-notes.mjs --seed "$SEED" --actor "$ACTOR" --require-complete
  step "Yükleme: $SEED"
  run scripts/seed-notes.mjs --seed "$SEED" --actor "$ACTOR" --apply --require-complete
done

echo ""
echo "✅ Sıkı kontrol ve yükleme işlemleri bitti. Eklenen ve önceden bulunan kayıt sayılarını logdan kontrol et."
