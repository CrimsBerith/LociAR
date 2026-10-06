# Bağımlılık güvenliği

Node.js 22 ve Java 21 kullanın. `admin/` ve `functions/` içinde `npm ci` lockfile'ı ve bildirilen overrides kurallarını uygular. Kurulum, emülatör ve dağıtım betikleri `functions/node_modules/.bin/firebase` kullanır; farklı bir `npx firebase-tools@...` kurulumu bu overrides kurallarını içermez.

## 4 Ekim 2026 güncellemesi

| Paket | Önce | Sonra | Neden |
|---|---|---|---|
| Next.js | 16.3.0 | 16.3.8 | `GHSA-p293-qw3h-jr36`, `GHSA-2xp9-vwfh-vxw4`, `GHSA-vcvr-r3jv-pc5j` RCE yamaları |
| sharp | 0.35.3 | 0.35.5 | `GHSA-rgj7-g3m4-5g8c` libheif yamaları; Next.js üzerinden çözülür |
| Firebase CLI | 14.27.0 | 15.32.1 | tar, stream-json ve csv-parse yamalarını içeren güncel CLI; Node 22 / Java 21 ile test edilir |
| baseline-browser-mapping | 2.10.42 | 2.11.27 | `GHSA-w5vr-8v7q-w6rv` DoS yaması; kilitli bağımlılık ağacında güncellenir |

## Geçişli overrides

Upstream paketler hâlâ eski aralıkları istediği için aşağıdaki kurallar manifestlerde tutulur:

- `@firebase/firestore` → `@grpc/grpc-js ^1.14.5`: SDK'nın `~1.9.0` sınırı `GHSA-m9gg-hp2v-232j` ve `GHSA-f596-whhp-79r4` düzeltmelerini almıyor. Düzeltmeler 1.13.6 ve sonrasında; aynı 1.x API'si kullanılır. Gerçek Firebase istemcileriyle Firestore/Storage ve callable emülatör testleri doğrulanır.
- `gaxios`, `google-gax`, `teeny-request` → `uuid ^11.1.1`: `GHSA-w5hq-g745-h8pq` için eski 9.x aralığı aşılır. Bu tüketiciler CommonJS üzerinden `v4()` kullanır; UUID 11 bu API'yi destekler. Functions'ın doğrudan `uuid` alt sınırı da 11.1.1'dir; deterministik v5 LUID birim testleri korunur. Diğer modern UUID tüketicileri bu kurallardan etkilenmez.
- Yalnızca Functions geliştirme ağacında `get-uri` → `basic-ftp ^6.2.1`: `GHSA-c475-qrg2-pj4r` DoS yaması. `get-uri` tüketicisinin kullandığı CommonJS `Client` API'si korunur. Üretim Functions paketine dahil değildir.
- Yalnızca Functions geliştirme ağacında `@google-cloud/pubsub` → `@opentelemetry/core ^2.8.0` (5 Ekim lockfile: **2.11.0**): `GHSA-8988-4f7v-96qf` için baggage bellek sınırı yaması. CLI'ın kilitli Pub/Sub 5.3.1 sürümü core'dan yalnız `W3CTraceContextPropagator` tüketir. 1.30.1 ve 2.11.0'ın bu modülünde yalnız lisans başlığı değişmiştir; CommonJS ve `@opentelemetry/api` peer aralığı korunur. Override yalnız bu tüketiciye uygulanır; Pub/Sub veya CLI major sürümü değiştirilmez. `functions/test/firebase-cli-dependencies.test.mjs` gerçek CLI çözümlemesiyle trace/tracestate aktarımını, bozuk parent reddini, kapalı telemetry davranışını ve baggage sınırlarını doğrular.

Upstream aralıkları yamalı sürümlere geçtiğinde bu overrides kaldırılabilir; ardından `npm ci`, audit, tip kontrolleri, birim/emülatör testleri ve admin build çalıştırılmalıdır. `npm audit fix --force` önerdiği major değişimi veya eski sürüme dönüşü doğrulamadan uygulamayın.

## 5 Ekim 2026 kontrolü

CI, iki projede de `npm audit --omit=dev --audit-level=moderate` komutunu zorunlu çalıştırır; orta ve üzeri üretim açıkları işi başarısız kılar. Admin'deki önceki `continue-on-error` kaldırıldı. 5 Ekim'de OpenTelemetry güncellemesi iki moderate bulguyu kapattı.

## 6 Ekim 2026: CLI dosya izleyicisi (braces) kapatıldı

Functions geliştirme ağacında kalan son kaynak `firebase-tools 15.32.1` → `chokidar 3.6.0` → `braces 3.0.3` zinciriydi ([GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), 3 high bulgu). Yamalı braces yayımlanmadı ve güncel CLI hâlâ chokidar 3 istiyor. Çözüm yalnız CLI'a uygulanan override:

- `firebase-tools` → `chokidar ^4.0.3` (lockfile: 4.0.3; tek bağımlılığı `readdirp`). braces, anymatch, glob-parent ve fsevents ağaçtan çıktı.
- CLI chokidar'ı yalnız emülatörlerde kullanır: Firestore/Storage/Database rules dosyası izleyicileri ve functions emülatörünün kaynak izleyicisi. Deploy paketlemesi chokidar kullanmaz.
- Bilinen fark: chokidar 4 glob desteklemez. CLI'ın `firebase.json` `functions.ignore` girdilerinden ürettiği `**/src`, `**/test`, `**/*.local` dizgileri birebir yol olarak okunur. Sonuç yalnız fazladan yeniden yüklemedir: yerel emülatör `src/`, `test/` veya `tsconfig.json` değişince de tetikleyicileri yeniden yükler (yüklenen kod yine `lib/`). Hiçbir değişiklik kaçırılmaz.
- CLI'ın regex kuralları aynen çalışır: `node_modules`, nokta dosyaları (`.secret.local`, `.env.*`) ve `*.log` izlenmez. `functions/test/firebase-cli-dependencies.test.mjs` bunu CLI'ın çözdüğü chokidar ile, CLI'daki ignore biçimiyle doğrular. CI'daki emülatör işleri (`test:rules`, `test:emulator`) izleyicileri gerçek CLI ile çalıştırır.
- Upstream CLI chokidar 4'e geçtiğinde bu override kaldırılır; ardından `npm ci`, audit ve emülatör testleri çalıştırılır.

`scripts/check-dependency-audit.mjs` artık istisna içermez: iki projede de tam ağaçta (üretim ve geliştirme) herhangi bir bulgu, bozuk registry yanıtı veya audit hatası CI'ı durdurur. `.github/workflows/dependency-audit.yml` her gün 05:23 UTC'de ve `workflow_dispatch` ile iki kilitli ağacı yeniden kurup üretim/tam audit kapılarını çalıştırır; yeni advisory, yeni commit olmasa da yakalanır. İş yalnız `contents: read` kullanır; canlı kimlik/deploy yoktur.

```sh
node scripts/check-dependency-audit.mjs functions
node scripts/check-dependency-audit.mjs admin
```

Güncel yayın kapıları: [RELEASE_READINESS.md](release/RELEASE_READINESS.md).
