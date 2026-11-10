#!/usr/bin/env python3
"""Read a sender key interactively or through stdin; never put it in argv or temporary files."""
from __future__ import annotations

import getpass
from pathlib import Path
import shutil
import subprocess
import sys

PROJECT = 'lociar-2f38c'
SECRET = 'ADMIN_EMAIL_API_KEY'


def main(*, read_stdin: bool = False) -> None:
    gcloud, firebase = shutil.which('gcloud'), shutil.which('firebase')
    if not gcloud or not firebase:
        raise SystemExit('gcloud ve Firebase CLI gerekli.')
    if not read_stdin and not sys.stdin.isatty():
        raise SystemExit('Anahtar yalnızca etkileşimli terminalden okunur.')
    key = sys.stdin.read(4097).strip() if read_stdin else getpass.getpass('Resend API anahtarı (gizli): ').strip()
    if not key.startswith('re_') or not 16 <= len(key) <= 4096 or any(c.isspace() for c in key):
        raise SystemExit('Geçerli bir Resend API anahtarı gerekli.')
    base = [gcloud, '--configuration=default', f'--project={PROJECT}', '--quiet']
    found = subprocess.run([*base, 'secrets', 'describe', SECRET, '--format=value(name)'], capture_output=True)
    if found.returncode:
        # A permission/network failure must not be treated as a missing secret.
        if b'NOT_FOUND' not in found.stderr:
            raise SystemExit('Secret Manager erişimi doğrulanamadı; değişiklik yapılmadı.')
        subprocess.run([*base, 'secrets', 'create', SECRET, '--replication-policy=automatic'], check=True)
    subprocess.run([*base, 'secrets', 'versions', 'add', SECRET, '--data-file=-'], input=key.encode(), stdout=subprocess.DEVNULL, check=True)
    del key
    root = Path(__file__).resolve().parents[1]
    subprocess.run([firebase, 'apphosting:secrets:grantaccess', SECRET, '--backend', 'lociar-admin',
                    '--location', 'us-central1', '--project', PROJECT, '--non-interactive'], cwd=root, check=True)
    print('Anahtar Secret Manager’da; yalnızca App Hosting backend erişimi ayarlandı. Kaynak dağıtımı ve gerçek e-posta teslim testi sonraki adım.')


if __name__ == '__main__':
    try:
        if sys.argv[1:] not in ([], ['--stdin']):
            raise SystemExit('Kullanım: configure-admin-email.py [--stdin]')
        main(read_stdin=sys.argv[1:] == ['--stdin'])
    except (subprocess.CalledProcessError, KeyboardInterrupt):
        raise SystemExit('Kurulum tamamlanamadı. Anahtar yazdırılmadı.') from None
