#!/usr/bin/env python3
"""Compares a device performance run (build/claude-run/perf/testPerf0*.metrics.json, written by
build/claude-run/a-perf-run.command) with docs/qa/perf/baseline.json. A metric fails when it is more
than 10 % worse than the baseline (lower is better, except frame rates). Hitch ratios under 5 ms/s
pass regardless (Apple's "good" range). Exit code 1 when any metric fails."""
import glob, json, os, sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..'))
RUN = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'build', 'claude-run', 'perf')
KEYS = {'Duration (ApplicationFirstFramePresentationResponsive)': 'launch_s', 'Hitch Time Ratio (Scroll_DraggingAndDeceleration)': 'scroll_hitch_ms_per_s',
        'Frame Rate (Scroll_DraggingAndDeceleration)': 'scroll_fps', 'Hitch Time Ratio (NavigationTransition)': 'open_post_hitch_ms_per_s',
        'Frame Rate (NavigationTransition)': 'open_post_fps', 'Absolute Memory Physical (lociar)': 'memory_kb',
        'Memory Peak Physical (lociar)': 'memory_peak_kb', 'CPU Time (lociar)': 'cpu_s', 'Clock Monotonic Time': 'clock_s'}
TOLERANCE = 0.10

def current():
    out = {}
    for path in sorted(glob.glob(os.path.join(RUN, 'testPerf0*.metrics.json'))):
        test = os.path.basename(path).split('.')[0]
        try: runs = json.load(open(path))[0]['testRuns'][0]['metrics']
        except (ValueError, LookupError): continue
        for metric in runs:
            if metric['displayName'] in KEYS and metric['measurements']:
                values = metric['measurements']
                out.setdefault(test, {})[KEYS[metric['displayName']]] = sum(values) / len(values)
    return out

def verdict(name, base, now):
    if name.endswith('hitch_ms_per_s') and now < 5: return True
    if name.endswith('fps'): return now >= base * (1 - TOLERANCE)
    return now <= base * (1 + TOLERANCE)

def main():
    baseline = json.load(open(os.path.join(ROOT, 'docs', 'qa', 'perf', 'baseline.json')))
    now, failed = current(), 0
    if not now: sys.exit('no run results in ' + RUN)
    for test, metrics in sorted(baseline.items()):
        for name, base in sorted(metrics.items()):
            value = now.get(test, {}).get(name)
            if value is None: print(f'MISSING {test} {name}'); failed += 1; continue
            ok = verdict(name, base, value); failed += not ok
            print(f"{'PASS' if ok else 'FAIL'} {test:26} {name:26} {base:>12.3f} -> {value:>12.3f}")
    print('ok' if not failed else f'{failed} metric(s) worse than baseline')
    sys.exit(1 if failed else 0)

if __name__ == '__main__':
    main()
