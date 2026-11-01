#!/usr/bin/env python3
"""Validate real 12-language App Store metadata; fail if limits or generated files are invalid."""
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
raise SystemExit(subprocess.call(
    [sys.executable, str(ROOT / "scripts" / "store-metadata" / "build.py"), "--check"],
    cwd=ROOT,
))
