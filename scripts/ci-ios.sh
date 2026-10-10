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
  -resultBundlePath "$output_dir/native-tests.xcresult" -only-testing:LociARTests -parallel-testing-enabled NO \
  -testLanguage tr -testRegion TR CODE_SIGNING_ALLOWED=NO test 2>&1 | tee "$output_dir/native-tests.log"
# Every string the Swift compiler extracted must be in the generated catalog (scripts/l10n).
python3 scripts/l10n/check_stringsdata.py "$output_dir/DerivedData"
# Keep every simulator-safe UI test in CI. Physical/live/emulator suites are separate.
ui_tests=()
while IFS= read -r target; do
  ui_tests+=("-only-testing:LociARUITests/$target")
done < <(python3 - <<'PY'
from pathlib import Path
import re
for name in ['AuthGateUITests.swift', 'AuthGateUserFlowUITests.swift', 'EnglishSmokeUITests.swift']:
    suite = 'EnglishSmokeUITests' if name.startswith('English') else 'AuthGateUITests'
    for test in re.findall(r'func (test\w+)\(', Path('LociARUITests', name).read_text()):
        print(f'{suite}/{test}')
PY
)
if [ "${#ui_tests[@]}" -eq 0 ]; then
  echo 'No simulator UI tests selected.' >&2
  exit 2
fi
xcodebuild -project LociAR.xcodeproj -scheme LociAR \
  -configuration Debug -destination "platform=iOS Simulator,id=$simulator_id" \
  -derivedDataPath "$output_dir/DerivedData" -clonedSourcePackagesDirPath "$output_dir/SourcePackages" \
  -disableAutomaticPackageResolution -onlyUsePackageVersionsFromResolvedFile \
  -resultBundlePath "$output_dir/simulator-ui.xcresult" \
  -parallel-testing-enabled NO "${ui_tests[@]}" \
  CODE_SIGNING_ALLOWED=NO test 2>&1 | tee "$output_dir/simulator-ui.log"
