#!/bin/bash
# LociAR — production monitoring: log-based metrics, alert policies (email) and a billing budget.
# Double-click in Finder or run in Terminal on a Mac. Needs: Google Cloud CLI (gcloud), logged in as
# a project owner. Safe to re-run: metrics are updated in place, existing channels/policies/budgets
# (matched by display name) are left alone.
#
# What gets an email:
#   - Cloud Functions / App Hosting errors (more than 10 ERROR log lines in 10 minutes)
#   - any Apple token revocation failure or Cloud Anchor deletion failure
#   - ARCore token / avatar screening outages, repeated push send failures
#   - kill switch on (service_paused answers), so a forgotten switch is noticed
#   - monthly billing budget at 50 / 90 / 100 %
set -euo pipefail
cd "$(dirname "$0")/.."
PROJECT="lociar-2f38c"

pause() { read -r -p "${1:-Devam etmek için Enter…}"; }
step() { echo ""; echo "==> $*"; }

if ! command -v gcloud >/dev/null 2>&1; then
  echo "Google Cloud CLI (gcloud) bulunamadı."
  echo "Kurulum: brew install --cask google-cloud-sdk   (veya https://cloud.google.com/sdk/docs/install)"
  pause "Kurduktan sonra bu dosyayı tekrar aç. Kapatmak için Enter…"; exit 1
fi

# `gcloud monitoring` is GA on recent SDKs; older ones only have the beta/alpha track.
monitoring() {
  if gcloud monitoring "$1" --help >/dev/null 2>&1; then gcloud monitoring "$@"
  elif gcloud beta monitoring "$1" --help >/dev/null 2>&1; then gcloud beta monitoring "$@"
  else gcloud alpha monitoring "$@"; fi
}

step "Google hesabıyla giriş (projenin sahibi olan hesap)"
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
  gcloud auth login
fi
gcloud config set project "$PROJECT" >/dev/null
echo "Hesap: $(gcloud config get-value account 2>/dev/null) · Proje: $PROJECT"

step "Gerekli API'ler (Monitoring, Logging, Billing Budgets)"
gcloud services enable monitoring.googleapis.com logging.googleapis.com billingbudgets.googleapis.com \
  cloudbilling.googleapis.com --project "$PROJECT"

step "Alarm e-postası"
read -r -p "Alarmlar hangi adrese gitsin? " ALERT_EMAIL
if [[ ! "$ALERT_EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]; then
  echo "Geçerli bir e-posta adresi gerekli."; pause "Kapatmak için Enter…"; exit 1
fi
CHANNEL_NAME="LociAR alarm ($ALERT_EMAIL)"
CHANNEL="$(monitoring channels list --project "$PROJECT" \
  --filter="displayName=\"$CHANNEL_NAME\"" --format="value(name)" | head -n1)"
if [ -z "$CHANNEL" ]; then
  CHANNEL="$(monitoring channels create --project "$PROJECT" --display-name="$CHANNEL_NAME" \
    --type=email --channel-labels="email_address=$ALERT_EMAIL" --format="value(name)")"
  echo "✅ Bildirim kanalı oluşturuldu. Google'dan gelen doğrulama e-postasını onayla."
else
  echo "✅ Bildirim kanalı zaten var."
fi

# Cloud Functions v2 and App Hosting both run on Cloud Run; the Firebase logger writes the event
# name as the log message (functions/src: logger.error('cloud_anchor_delete_failed', {...})).
RUN='resource.type="cloud_run_revision"'
event() { # event names → filter on the log message
  local clauses=() name
  for name in "$@"; do clauses+=("jsonPayload.message=\"$name\" OR textPayload:\"$name\""); done
  local joined; joined="$(printf ' OR %s' "${clauses[@]}")"
  echo "$RUN AND (${joined:4})"
}

metric() { # name, description, filter
  if gcloud logging metrics describe "$1" --project "$PROJECT" >/dev/null 2>&1; then
    gcloud logging metrics update "$1" --project "$PROJECT" --description="$2" --log-filter="$3" >/dev/null
    echo "  ↻ $1"
  else
    gcloud logging metrics create "$1" --project "$PROJECT" --description="$2" --log-filter="$3" >/dev/null
    echo "  ＋ $1"
  fi
}

step "Log tabanlı metrikler"
metric lociar_server_errors "ERROR log lines from Cloud Functions and App Hosting" "$RUN AND severity>=ERROR"
metric lociar_apple_revoke_failed "Apple sign-in token revocation failed (account deletion aborted)" \
  "$(event apple_revoke_failed apple_revoke_unavailable)"
metric lociar_cloud_anchor_cleanup_failed "Cloud Anchor deletion or deletion-queue failure" \
  "$(event cloud_anchor_delete_failed cloud_anchor_queue_failed cloud_anchor_cleanup_failed)"
metric lociar_arcore_token_failed "getArcoreToken could not sign an ARCore token (also when ARCORE_SIGNER_EMAIL is unset)" \
  "$(event arcore_token_failed)"
metric lociar_avatar_screening_failed "Cloud Vision avatar screening or pending avatar cleanup failed" \
  "$(event avatar_screening_failed pending_avatar_cleanup_failed)"
metric lociar_push_failed "FCM push send failures" "$(event push_send_failed)"
metric lociar_service_paused "Requests refused because the kill switch is on" \
  "$(event kill_switch_refused)"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
policy() { # metric, display name, threshold (count > N), window seconds, documentation
  local name="LociAR · $2"
  if [ -n "$(monitoring policies list --project "$PROJECT" --filter="displayName=\"$name\"" --format="value(name)")" ]; then
    echo "  = $name (zaten var)"; return
  fi
  cat > "$TMP/policy.json" <<JSON
{
  "displayName": "$name",
  "combiner": "OR",
  "documentation": { "content": "$5\n\nLogs: https://console.cloud.google.com/logs/query?project=$PROJECT", "mimeType": "text/markdown" },
  "conditions": [{
    "displayName": "$2",
    "conditionThreshold": {
      "filter": "metric.type=\"logging.googleapis.com/user/$1\" AND resource.type=\"cloud_run_revision\"",
      "comparison": "COMPARISON_GT",
      "thresholdValue": $3,
      "duration": "0s",
      "aggregations": [{ "alignmentPeriod": "${4}s", "perSeriesAligner": "ALIGN_SUM", "crossSeriesReducer": "REDUCE_SUM" }],
      "trigger": { "count": 1 }
    }
  }],
  "alertStrategy": { "autoClose": "86400s" },
  "notificationChannels": ["$CHANNEL"]
}
JSON
  monitoring policies create --project "$PROJECT" --policy-from-file="$TMP/policy.json" >/dev/null
  echo "  ＋ $name"
}

step "Alarm politikaları"
echo "(Yeni metrikler ilk log satırından sonra görünür; politika oluşturma bu yüzden bazen bir dakika bekletir.)"
policy lociar_server_errors "Sunucu hataları" 10 600 \
  "More than 10 ERROR log lines in 10 minutes from Cloud Functions / App Hosting. Open Logs and filter severity>=ERROR."
policy lociar_apple_revoke_failed "Apple token iptali başarısız" 0 300 \
  "Account deletion was aborted because Apple token revocation failed (guideline 5.1.1(v)). Check the Apple sign-in secrets."
policy lociar_cloud_anchor_cleanup_failed "Cloud Anchor silme hatası" 0 3600 \
  "Cloud Anchors were not deleted with their post/account. The cleanup job retries; check functions/src/arcoreManagement.ts logs."
policy lociar_arcore_token_failed "ARCore token hatası" 3 600 \
  "getArcoreToken failed repeatedly: AR re-localization falls back to world maps. Check the ARCore signer service account."
policy lociar_avatar_screening_failed "Avatar denetimi hatası" 3 3600 \
  "Cloud Vision SafeSearch screening failed repeatedly; new profile photos stay unpublished."
policy lociar_push_failed "Push gönderim hataları" 20 3600 \
  "More than 20 push send failures in an hour. Check the APNs key in Firebase Console → Cloud Messaging."
policy lociar_service_paused "Kill switch açık" 0 3600 \
  "Requests are being refused with service_paused. Turn system/flags.kill_switch off when the incident is over."

step "Aylık bütçe uyarısı"
BILLING="$(gcloud billing projects describe "$PROJECT" --format='value(billingAccountName)' 2>/dev/null | sed 's#billingAccounts/##')"
if [ -z "$BILLING" ]; then
  echo "⚠️  Faturalandırma hesabı okunamadı; bütçe adımı atlandı (Blaze açık mı?)."
else
  BUDGET_NAME="LociAR aylık bütçe"
  if gcloud billing budgets list --billing-account="$BILLING" --format="value(displayName)" 2>/dev/null | grep -qx "$BUDGET_NAME"; then
    echo "✅ Bütçe zaten var."
  else
    read -r -p "Aylık bütçe (USD, varsayılan 50): " AMOUNT
    AMOUNT="${AMOUNT:-50}"
    gcloud billing budgets create --billing-account="$BILLING" --display-name="$BUDGET_NAME" \
      --budget-amount="${AMOUNT}USD" --filter-projects="projects/$PROJECT" \
      --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0 \
      --notifications-rule-monitoring-notification-channels="$CHANNEL" >/dev/null
    echo "✅ Bütçe: ${AMOUNT} USD/ay, %50 / %90 / %100 uyarıları $ALERT_EMAIL adresine."
  fi
fi

step "Bitti"
echo "Alarmlar: https://console.cloud.google.com/monitoring/alerting?project=$PROJECT"
echo "Crashlytics çökme uyarıları Firebase Console'da ayrı açılır: Crashlytics → ⋮ → Alert settings."
pause "Kapatmak için Enter…"
