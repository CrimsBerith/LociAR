# CODEX EXECUTION HANDOVER — FIX-12 (LociAR)

**Tarih:** 24 Ekim 2026  
**Dal:** `codex/fix-anonymous-location-audit` (HEAD: `60afbca`)  
**Ana Plan:** `docs/release/TWELVE_AGENT_FIX_PLAN_2026-10-24.md` (Tek Kaynak)  
**Denetim Referansları:** `docs/release/SIX_SPECIALIST_AUDIT_2026-10-24.md` (S1–S13), `MULTI_AGENT_AUDIT_2026-10-24.md` (F1–F8)  

---

## 1. MEVCUT DURUM VE TAMAMLANANLAR (DOKUNMA)

Aşağıdaki işler çalışma ağacında halihazırda uygulanmış ve testleri geçmiştir. `git checkout`, `git stash` veya HEAD'e döndürme **kesinlikle yasaktır**.

### Tamamlanan ve Test Edilen Görevler:
1. **F01 (S1 & S2):**
   - `functions/src/publicContent.ts`: Başkası profil sorguladığında `is_anonymous == false` filtresi uygulandı. İmleç `anchor` ile anonim gönderiden izole edildi (sayfa boşsa `next: null`).
   - `firestore.indexes.json`: `posts` için bileşik indeks eklendi (`creator_id`, `is_anonymous`, `status`, `visibility`, `created_at` DESC, `__name__` DESC).
   - `functions/src/triggers.ts`: `emitActivity` beğeni ve takiplerde dışarı `act_${randomUUID()}` döner. Tekillik `activity_keys` hash tablosunda tutulur.
   - `functions/src/activity.ts`: `markActivityRead` yabancı id ile var olmayan id'ye farksız yanıt verir (sızıntı yok, batch bozulmaz).
   - `functions/src/anonymousAccess.ts`: `readActivity` dışarı `act_` id döner; eski hash'leri `publishActivityIds` ile eşler.
2. **F02 (S3):**
   - `firestore.rules`: `likes`, `post_saves`, `follows`, `user_blocks` üzerinde `resource == null` iken yabancı yollar reddedildi (`.*_${me()}` ve `${me()}_.*` kontrolleri).
   - `functions/test/rules/firestore.rules.test.mjs`: Testler eklendi (90/90 yeşil).
3. **F03 (S4):**
   - `admin/app/api/admin/v1/users/invite/route.ts`: Rol içeren davetler `admin_users.write` (AAL2) ister.
   - `admin/lib/admin-invite.ts`: Davet edenin rolü kabulden önce kalkmışsa bekleyen rol atanmaz (`invite_grantor_revoked`).
   - `admin/tests/integration/invitations.test.mjs`: Testler eklendi (8/8 yeşil).
4. **F04 (S11):**
   - `functions/src/triggers.ts`: `onCommentCreated` yorum belgesi ile profili aynı transaction'da okur; rename yarışı engellendi. Fanout anonim postları atlar.

---

## 2. CODEX'İN SIRAYLA YAPACAĞI İŞLER (DALGA 2 - DALGA 5)

### DALGA 2: F05 & F06 (ÖNCELİKLİ ADIM)

#### F05 — 25 m Kanonik Spot Gruplaması (Bulgu S5)
* **Amaç:** Spotların çember kenarından zincirlenerek 153 metreye kadar uzamasını ve uzaktaki kilitli notların açılmasını engellemek.
* **Mekanizma & Yama:**
  - `functions/src/denseSpots.ts`: Noktanın spot merkezine uzaklığı `<= SPOT_JOIN_RADIUS_M` (25 m) olmalıdır. Kenar mesafesi katılım sayılmaz (`distanceToSpot` yarıçap düşmesi iptal). `MAX_SPOT_RADIUS_M` üyelik genişletmez.
  - `functions/src/mapNoteGroups.ts`: Aynı `spotId` altında olsa bile merkezden 25 m dışındaki noktaları ayrı gruplara böl.
  - `functions/src/publicContent.ts`: `readMapGroup` içindeki `readArea` özetine yalnız o kanonik 25 m grubun üyelerini koy.
  - `LociAR/Domain/LocationNotePolicy.swift`: 25 m sabiti sunucu ile birebir eşit tutulur.
* **Kabul:** 17 notluk zincir testinde hiçbir grup merkezden 25 m dışına üye almaz. Uzak üye grup izniyle açılmaz. Tarih çizgisi `meanLongitude` bozulmaz.

#### F06 — AR Tazelik & İstemci İdempotency (Bulgu S9, S10)
* **Amaç:** Bayat veya belirsiz GPS ile AR açılmasını engellemek; ağ kopmalarında mükerrer not basılmasını durdurmak. Emülatör / sahte GPS engellerini sağlamlaştırmak.
* **Mekanizma & Yama:**
  - `LociAR/Domain/ProximityPolicy.swift` & `LociAR/Features/AR/ARPostViewerView.swift`:
    - Karar anında GPS fix'i 10 saniyeden eskiyse (`now.timeIntervalSince(viewer.timestamp) > 10`) veya yatay doğruluk 35 metreden büyükse (`viewer.horizontalAccuracy > 35`) AR açılışına izin verilmez.
    - Resolver dönüşünde kullanıcı 60 m dışına çıktıysa veya izin gittiyse `proximityVerified` düşürülür.
    - `location.sourceInformation?.isSimulatedBySoftware == true` olan sahte/simüle konumlar kesinlikle reddedilir.
  - `LociAR/Features/Map/PlaceNoteComposer.swift`:
    - `@State` içindeki `clientMutationId` ağ hatasında kaybolursa retry sırasında aynı ID'yi korur. Kullanıcı metni değiştirirse veya bilerek yeni nota geçerse yeni UUID üretir.
    - Not metni ve caption diske yazılmaz.
* **Kabul:** 1 saat eski fix ve 3 km accuracy AR açmaz. Ağ kopmasında aynı mutation ID tek not açar.

---

### DALGA 3: F07, F08, F09

#### F07 — Bağımlılık ve Gizlilik Metni (Bulgu S7, S8)
* `admin/package.json` ve `functions/package.json`: Kör `npm audit fix --force` yapmadan, uyumlu yamalarla security advisory'leri temizle.
* `admin/app/privacy/page.tsx` ve `admin/app/privacy/en/page.tsx`:
  - "30'dan fazla notta kilitlenir" ifadesini düzelt: Başkalarının tekil konumsal notları da uzaktan kilitlidir; okumak için yerinde taze GPS gerekir. 30 eşiği yalnızca bildirim/yoğunluk eşiğidir.

#### F08 — Kabul Testleri ve Fixture Düzeltmesi (Bulgu S13)
* `LociARUITests/AuthGateUITests.swift`: `testProfileSupportsAccessibilityXXXL` testine kaydırma önkoşulu (`scrollUntilHittable`) ekle.
* `scripts/simulator-note-fixture.mjs`: `newAnonymousUser` yerine doğrulanmış `newUser` kullan (misafirlerin not yayınlama yetkisi yoktur).

#### F09 — iOS Activity Sözleşmesi (Bulgu S2 İstemci)
* `LociAR/Data/SocialRepository.swift`, `LociAR/Features/Social/ActivityView.swift`, `LociAR/AppCore/NotificationService.swift`:
  - İstemci `like_` veya `follow_` hash'i üretmez. Sunucunun döndürdüğü `act_${UUID}` stringini doğrudan decode eder ve `markActivityRead`'e taşır. Bozuk ID'de uygulama çökmez.

---

### DALGA 4: F10 & F11 (MALİYET VE DİFERANSİYEL TEST)

#### F10 — 1.000 DAU Maliyet Tavanı (Bulgu S12)
**Kural:** 1.000 DAU kararlı gün senaryosunda proje toplamı **50.000 okuma, 20.000 yazma, 20.000 silme** tavanını aşamaz.
1. `functions/src/publicContent.ts`: `readMapGroup` sayfa başına sadece talep edilen kadar belge okur (300 üyeyi her sayfada okuma).
2. `functions/src/publicContent.ts`: İlgisiz modlarda `exclusions` (blok taraması) atlanır.
3. `functions/src/noteAutomation.ts`: `autoApproveNote` onay eşiği dolduğunda taramayı durdurur (300 liker'ın tamamını taramaz).
4. `functions/src/push.ts`: `deliverPostApprovedPush` içinde `user_data_preferences` okuması post/profil/deletion okumasından **önce** yapılır; bildirim kapalıysa hemen döner.
5. `functions/src/accountDeletion.ts`: Boş koleksiyonları tekrar tekrar tarayan 169 boş sorgu engellenir.
6. `LociAR/DesignSystem/AnimatedGIFView.swift` & `LociAR/ARCore/SpatialContentRenderer.swift`: Aynı GIF URL'si için uçuşta olan (in-flight) istekleri tek indirmede birleştir.

#### F11 — Anonimlik Diferansiyel Testi
* `functions/test/integration/anonymity-differential-fix.test.mjs` dosyasını oluştur:
  - Anonim susturmanın (`anonymous_blocks`) ve profil engelinin (`user_blocks`) bağımsız çalıştığını ve birbirini açığa çıkarmadığını doğrula.

---

### DALGA 5: F12 (BAĞIMSIZ DOĞRULAMA)

* Ürün kodu yazılmaz.
* Tüm testler çalıştırılır:
  - `npm test` (functions unit & integration)
  - `npm run test:rules`
  - `node scripts/check-localization.mjs --release`
  - Admin integration tests
  - iOS XCTest
* Rapor `build/fix12-20261024/summary.md` içine kaydedilir.

---

## 3. BAĞLAYICI KISITLAR VE GÜVENLİK SÖZLEŞMESİ

1. **S6 Açık Yayın Engelidir:** Ödeme ve Post Support fonksiyonları (`supportStripe`, `supportApple`, vb.) tamamlanana kadar deploy edilmez, `post_support.enabled` açılmaz.
2. **Server-Authoritative Writes:** İstemciler asla doğrudan Firestore'a post/sayaç yazamaz.
3. **Emülatör & Sahte Konum Koruması:**
   - Firebase App Check (App Attest) zorunludur.
   - CoreLocation `sourceInformation?.isSimulatedBySoftware` reddedilir.
   - GPS fix yaşı <= 10s, yatay sapma <= 35m.
   - Misafirler (`is_anonymous == true`) not yayınlayamaz.
4. **Maliyet:** Spark sınırlarına düşmek için kurallar gevşetilmez; Blaze kalır, `minInstances: 0`.

---

## 4. CODEX İÇİN BAŞLANGIÇ KOMUTU / PROMPT

Codex'e verilecek talimat:
```text
docs/release/CODEX_EXECUTION_HANDOVER_2026-10-24.md ve docs/release/TWELVE_AGENT_FIX_PLAN_2026-10-24.md tek kaynaklarımızdır.
F01, F02, F03 ve F04 çalışma ağacında tamamlandı ve test edildi.
Mevcut kirli ağacı bozmadan (git checkout/stash yasak), doğrudan DALGA 2 ile başla:
1. F05: functions/src/denseSpots.ts, placeNoteRules.ts, mapNoteGroups.ts, publicContent.ts ve LocationNotePolicy.swift üzerinde 25 m katı merkez kuralını uygula.
2. F06: LociAR/Domain/ProximityPolicy.swift, ARPostViewerView.swift ve PlaceNoteComposer.swift üzerinde GPS tazelik (<10s, <35m), sahte GPS reddi ve mutation idempotency uygula.
Dalga 2 bitince testleri çalıştır ve Dalga 3'e geç.
```
