from pathlib import Path
import re
# Every UI test file except the suites that need a live emulator or a physical device.
excluded = {'AuthGateEmulatorUITests.swift', 'AuthGatePhysicalDeviceUITests.swift'}
for path in sorted(Path('LociARUITests').glob('*.swift')):
    if path.name in excluded:
        continue
    source = path.read_text()
    suite = re.search(r'(?:final class|extension) (\w+UITests)\b', source)
    if not suite:
        continue
    for test in re.findall(r'func (test\w+)\(', source):
        print(f'{suite.group(1)}/{test}')
