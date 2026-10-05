#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v xcodebuild >/dev/null || { echo 'Xcode on macOS is required.' >&2; exit 2; }
output_dir="${LOCIAR_IOS_CI_OUTPUT:-build/ci-ios}"
mkdir -p "$output_dir"
xcodebuild -version > "$output_dir/xcode-version.txt"
# Select an installed simulator instead of relying on a device name that images can rename.
xcrun simctl list devices available -j > "$output_dir/simulators.json"
simulator_id="$(python3 - "$output_dir/simulators.json" <<'PY'
import json,sys
devices=json.load(open(sys.argv[1]))['devices']
for runtime in sorted(devices,reverse=True):
    if 'iOS' not in runtime: continue
    candidates=[d for d in devices[runtime] if d.get('isAvailable') and d['name'].startswith('iPhone')]
    if candidates:
        print(candidates[0]['udid']);sys.exit(0)
sys.exit('No available iPhone simulator found')
PY
)"
printf '%s\n' "$simulator_id" > "$output_dir/simulator-id.txt"
xcodebuild -resolvePackageDependencies -project LociAR.xcodeproj -scheme LociAR \
  -clonedSourcePackagesDirPath "$output_dir/SourcePackages" \
  -onlyUsePackageVersionsFromResolvedFile 2>&1 | tee "$output_dir/packages.log"
xcodebuild -project LociAR.xcodeproj -scheme LociAR \
  -configuration Debug -destination "platform=iOS Simulator,id=$simulator_id" \
  -derivedDataPath "$output_dir/DerivedData" -clonedSourcePackagesDirPath "$output_dir/SourcePackages" \
  -disableAutomaticPackageResolution -onlyUsePackageVersionsFromResolvedFile \
  -resultBundlePath "$output_dir/native-tests.xcresult" -only-testing:LociARTests \
  -testLanguage tr -testRegion TR CODE_SIGNING_ALLOWED=NO test 2>&1 | tee "$output_dir/native-tests.log"
xcodebuild -project LociAR.xcodeproj -scheme LociAR \
  -configuration Debug -destination "platform=iOS Simulator,id=$simulator_id" \
  -derivedDataPath "$output_dir/DerivedData" -clonedSourcePackagesDirPath "$output_dir/SourcePackages" \
  -disableAutomaticPackageResolution -onlyUsePackageVersionsFromResolvedFile \
  -resultBundlePath "$output_dir/localization-ui.xcresult" \
  -only-testing:LociARUITests/AuthGateUITests/testAuthGateEnglishLocalization \
  -only-testing:LociARUITests/AuthGateUITests/testAuthGateArabicLocalizationAndRTL \
  CODE_SIGNING_ALLOWED=NO test 2>&1 | tee "$output_dir/localization-ui.log"
