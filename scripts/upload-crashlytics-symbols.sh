#!/bin/sh
# Release archives must not silently ship without symbols. Ordinary simulator/device
# builds remain usable offline; an archive (ACTION=install) fails if upload fails.
[ "${CONFIGURATION:-}" = "Release" ] || exit 0
symbol_required="${LOCIAR_CRASHLYTICS_REQUIRE_UPLOAD:-0}"
[ "${ACTION:-}" != "install" ] || symbol_required=1
symbol_failure() {
  echo "warning: $*; dSYMs remain in the archive."
  if [ "$symbol_required" = "1" ]; then
    echo "error: Crashlytics symbols are required for distribution. Set LOCIAR_SOURCE_PACKAGES_DIR to the cloned SourcePackages directory and retry."
    exit 1
  fi
  exit 0
}
if [ -z "${LOCIAR_FIREBASE_GOOGLE_APP_ID:-}" ]; then
  symbol_failure "LOCIAR_FIREBASE_GOOGLE_APP_ID is empty"
fi
symbol_packages="${LOCIAR_SOURCE_PACKAGES_DIR:-${BUILD_DIR%/Build/*}/SourcePackages}"
symbol_uploader="${symbol_packages}/checkouts/firebase-ios-sdk/Crashlytics/upload-symbols"
# The repository's CI deliberately clones packages outside DerivedData. Never scan
# arbitrary build folders or download an uploader. An explicit override stays authoritative.
if [ ! -x "$symbol_uploader" ] && [ -z "${LOCIAR_SOURCE_PACKAGES_DIR:-}" ] && [ -n "${SRCROOT:-}" ]; then
  symbol_uploader="${SRCROOT}/build/ci-ios/SourcePackages/checkouts/firebase-ios-sdk/Crashlytics/upload-symbols"
fi
if [ ! -x "${symbol_uploader}" ]; then
  symbol_failure "Crashlytics upload-symbols not found"
fi
symbol_upload_timeout="${LOCIAR_CRASHLYTICS_UPLOAD_TIMEOUT_SECONDS:-120}"
case "$symbol_upload_timeout" in
  ''|*[!0-9]*) symbol_upload_timeout=120 ;;
  *) : ;; # Valid numeric timeout.
esac
[ "$symbol_upload_timeout" -gt 0 ] 2>/dev/null || symbol_upload_timeout=120

"$symbol_uploader" -ai "$LOCIAR_FIREBASE_GOOGLE_APP_ID" -p ios "${DWARF_DSYM_FOLDER_PATH}/${DWARF_DSYM_FILE_NAME}" &
symbol_upload_pid=$!
(
  deadline_sleep_pid=
  trap '[ -z "$deadline_sleep_pid" ] || kill "$deadline_sleep_pid" 2>/dev/null; exit 0' HUP INT TERM
  sleep "$symbol_upload_timeout" &
  deadline_sleep_pid=$!
  wait "$deadline_sleep_pid" || exit 0
  deadline_sleep_pid=
  if kill -0 "$symbol_upload_pid" 2>/dev/null; then
    echo "warning: Crashlytics dSYM upload timed out after ${symbol_upload_timeout}s; upload symbols later from the archive."
    kill -TERM "$symbol_upload_pid" 2>/dev/null || exit 0
    sleep 5 &
    deadline_sleep_pid=$!
    wait "$deadline_sleep_pid" || exit 0
    deadline_sleep_pid=
    kill -KILL "$symbol_upload_pid" 2>/dev/null || true
  fi
) &
symbol_watchdog_pid=$!
stop_symbol_watchdog() {
  kill -TERM "$symbol_watchdog_pid" 2>/dev/null || true
  wait "$symbol_watchdog_pid" 2>/dev/null || true
  return 0
}
trap 'kill -TERM "$symbol_upload_pid" 2>/dev/null; stop_symbol_watchdog; exit 143' HUP INT TERM
if wait "$symbol_upload_pid"; then symbol_upload_status=0; else symbol_upload_status=$?; fi
stop_symbol_watchdog
trap - HUP INT TERM
if [ "$symbol_upload_status" -ne 0 ]; then
  symbol_failure "Crashlytics dSYM upload failed (status $symbol_upload_status)"
fi
exit 0
