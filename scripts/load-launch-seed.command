#!/bin/bash
# LociAR: load the launch seed notes (docs/release/LAUNCH_SEED.md) into the live Firebase project.
# Double-click in Finder or run in Terminal on a Mac. Needs Google Cloud CLI (gcloud), git and Node.js 22.
# Works in a separate checkout (~/.lociar-seed) of the published branch, so local edits stay untouched.
# Safe to re-run: the content user and every note have fixed keys, loaded items are skipped.
# Approximate pins are loaded too (--allow-approx); retire a batch with seed-notes.mjs --retire.
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

for tool in gcloud git node npm python3; do
  command -v "$tool" >/dev/null 2>&1 || { echo "❌ $tool bulunamadı."; exit 1; }
done

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
  run scripts/seed-notes.mjs --seed "$SEED" --actor "$ACTOR" --allow-approx || true
  step "Yükleme: $SEED"
  run scripts/seed-notes.mjs --seed "$SEED" --actor "$ACTOR" --apply --allow-approx
done

echo ""
echo "✅ Notlar yüklendi. Uygulamada haritayı uzaklaştır: başkentler parlamalı."
