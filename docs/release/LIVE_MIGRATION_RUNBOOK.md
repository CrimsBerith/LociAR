# Canlı geçiş kontrol listesi (4f205b9 sürümü)

Bu liste `ADMIN_CONTENT_OPERATIONS.md` → "Canlı geçiş" ve `ACTIVITY_AND_ACCOUNT_DELETION.md` →
"Canlıya geçiş sırası" bölümlerini Mac'te çalıştırılacak sıraya dizer. Ayrıntı ve gerekçe o belgelerde.

**Neden sıra önemli:** Yeni kurallar eski uygulama sürümleriyle uyumsuzdur. Storage kuralları her
yüklemede `account_access/{luid}` kaydına bakar; kayıt yoksa avatar ve world map yüklemeleri reddedilir.
Bu yüzden backfill, kurallardan **önce** yapılır.

> `scripts/google-cloud-setup.command` sonunda otomatik deploy eder. İlk kurulum için çalıştırırsan
> "deploy için Enter" sorusunda **Ctrl-C** ile çık; deploy'u aşağıdaki 7. adımda yap.

## 0. Ön koşullar

- [ ] `main`'de CI yeşil (iOS dahil); `git pull origin main`
- [ ] Node 22, Java 21 (`brew install openjdk@21`), Google Cloud CLI (`brew install --cask google-cloud-sdk`), Xcode
- [ ] `cd functions && npm ci && cd ../admin && npm ci && npx playwright install chromium && cd ..`
- [ ] `Config/Local.xcconfig` dolu (`Config/Local.xcconfig.example`)

## 1. iOS adayı (canlıya dokunmadan)

- [ ] Xcode'da derle; simülatör ve cihazda emülatöre karşı uçtan uca test: `scripts/run-device-e2e.command`
      (public okuma/sayfalama, hesap değiştirme, hesap silme, avatar, world map).
- [ ] Bu build, geçişten sonra kullanıcılara dağıtılacak build olacak (TestFlight/App Store).

## 2. Kimlik (bir kez)

```sh
gcloud config configurations create lociar-release
gcloud auth login                       # proje sahibi hesap
gcloud config set project lociar-2f38c
gcloud auth application-default login   # world map betiği bu kimliği kullanır
./functions/node_modules/.bin/firebase login
./functions/node_modules/.bin/firebase apps:list --project lociar-2f38c   # bağlantı testi
```

## 3. Yerel kapılar

```sh
bash scripts/firebase-deploy.command --dry-run
```
Hepsi geçmeden devam etme. Canlıya hiçbir şey göndermez.

## 4. Mevcut durumu kaydet (geri dönüş için)

- [ ] `./functions/node_modules/.bin/firebase functions:list --project lociar-2f38c > before-functions.txt`
- [ ] Firebase Console → Firestore → Rules ve Storage → Rules: geçmişte şu anki sürümü not et
      (konsoldan tek tıkla geri alınabilir).
- [ ] Şu an canlıdaki commit'i biliyorsan not et (Functions geri dönüşü o commit'ten yeniden deploy ile yapılır).

## 5. Bakım penceresi başlar

- [ ] Test kullanıcılarına haber ver; bu süre içinde hesap silme başlatılmasın.
- [ ] Canlı sürümde kill switch varsa admin panel → Sistem'den aç (yoksa düşük trafikli bir saat seç).

## 6. Veri hazırlığı

**a) `account_access` backfill**: önce salt okunur rapor:
```sh
node functions/scripts/backfill-account-access.mjs --gcloud-configuration=lociar-release
```
Çıktıdaki `scanned / active / suspended / deleting / done / changed` sayıları beklentiyle uyuşuyorsa uygula:
```sh
node functions/scripts/backfill-account-access.mjs --gcloud-configuration=lociar-release --apply
```

**b) World map güvenlik geçişi**: önce inceleme (en fazla 20 sayfa):
```sh
node scripts/world-map-security-migration.mjs --project lociar-2f38c
```
`nextPost` / `nextObject` doluysa `--post-cursor <değer>` / `--object-cursor <değer>` ile devam et.
Cursor'lar dosya adı içerir, yalnız operasyon notunda tut. İnceleme uygunsa **aynı oturumda**
`--apply` ekleyerek baştan çalıştır ve cursor'lar `null` olana kadar devam et.
Bu adım eski kalıcı Storage token'larını kaldırır; **geri alınamaz**.

## 7. Deploy

```sh
bash scripts/firebase-deploy.command                     # Firestore rules + indexes + TTL, Storage rules, Functions
./functions/node_modules/.bin/firebase deploy --only apphosting --project lociar-2f38c   # admin + /privacy /terms /support
```

## 8. Doğrulama

- [ ] Backfill raporunu tekrar al: `changed` **0** olmalı (değilse `--apply` ile tekrar çalıştır).
- [ ] Yeni iOS build'i canlıya karşı cihazda: giriş, gönderi oluşturma (`pending_review`), keşfet, avatar, hesap silme
      (Apple hesabıyla token iptali dahil).
- [ ] Özel / silinmiş / 18+ post world map okumaları ve eski token'lı URL'ler reddediliyor.
- [ ] Cloud Scheduler işleri ve Storage finalize tetikleyicisi çalışıyor (Eventarc / Pub/Sub izinleri, Functions logları).
- [ ] Admin panel girişi (TOTP) ve `/privacy`, `/terms`, `/support` açılıyor.
- [ ] Kill switch açıldıysa kapat.

## 9. İzleme

```sh
bash scripts/monitoring-setup.command
```
E-posta kanalını Google'dan gelen e-postayla doğrula. Crashlytics uyarıları Firebase Console'da ayrıca açılır.

## Geri dönüş

- Kurallar: Firebase Console → Rules geçmişinden 4. adımda not edilen sürüme dön.
- Functions: önceki commit'i checkout edip `bash scripts/firebase-deploy.command`.
- `account_access` kayıtları eski sürüme zarar vermez, silinmeleri gerekmez.
- 6b'de kaldırılan Storage token'ları geri gelmez. Eski world map URL'leri geçersiz kalır.
