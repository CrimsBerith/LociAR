# Gemini devam — son açık Codex

Son açık Codex, masaüstündeki `adsız klasör` not/persona işidir. FIX-12 dalgası değildir. 31 Ekim 2026 civarında “kontrolleri yap” denince kullanım limitine takıldı. Yeni doğrulama turu bitmedi. Veritabanına bu son turda yazılmadı.

Hazır paket: `~/Desktop/adsız klasör/yuklemeye-hazirlik-1680-2026-10-30/`. Rapor saati `2026-10-31T00:14:14+03:00`. Mühür kontrolü o anda geçti. `post_writes` 0. 1.680 metin (1.634 konum notu + 46 mevcut AR). 1.260 yeni not, 391 mevcut metin düzeltmesi. Pilot 18 not: Madrid, Nairobi, Tokyo. Yükleme yapılmadı.

Sonraki adım paket mühürünü ve canlı ön kontrolü yeniden koşmak. Yayın yok. Pilot, harita doğrulamasından önce tam yükleme yok.

FIX-12 ayrı iştir. Aşağısı o dalın elidir. Bu not paketini FIX-12 ajanlarına bölme.

## Yükleme durumu

Dal `codex/fix-anonymous-location-audit`. HEAD `efbab76`. `origin/codex/fix-anonymous-location-audit` ile aynı. İleri 0, geri 0. Commit edilmiş Codex işi yüklü ve uzak dalda.

Çalışma ağacı ayrıca kirli: yaklaşık 116 değişmiş dosya ve 29 izlenmeyen dosya. Bu yerel Codex işi diske yüklü. Commit edilmedi. Push edilmedi. `git checkout`, `git stash`, `git reset` ve dosyayı HEAD’e döndürmek yasak.

Deploy, merge, rebase, seed import, mağaza gönderimi ve `post_support.enabled` yok. `minInstances` 0. Spark yok. S6 hiçbir ajana verilmez.

## Bitmiş, yeniden yazma

HEAD içinde duran iş:

- F01. Başkasının creator sorgusu `is_anonymous == false`. İmleç anonim belgeye düşmez. Like ve follow dış id `act_` + UUID. Dedup `activity_keys`. Eski hash okuma cevabında dönmez.
- F02. Like, save, follow ve block için eksik yabancı belge reddedilir.
- F03. Rol daveti `admin_users.write`. Davet edenin rolü kalkmışsa `invite_grantor_revoked`.
- F04. Yorum handle’ı güncel profil ile aynı transaction’da yazılır.
- F07. `2759223` Next ve Functions advisory yaması. `audit fix --force` yok. Major zıplama yok.
- `deliverPostApprovedPush` tercih okumasını post, profil ve deletion okumasından önce yapar.

Bu dosyaları “baştan düzeltmek” için yeniden yazma.

## Yüklü ama commit edilmemiş

Bunlar çalışma ağacında var. Origin’de yok. Silme.

| Dosya | Yerel fark |
|---|---|
| `functions/src/placeNoteRules.ts` | `SPOT_JOIN_RADIUS_M` ve `CLUSTER_RADIUS_M` 25’ten 6’ya. `MAX_PIN_DRAG_M` 50’den 12’ye. `SPOT_MEMBERSHIP_VERSION` 3. |
| `LociAR/Domain/LocationNotePolicy.swift` | `spotJoinRadius` 6. HEAD hâlâ 25. |
| `functions/src/denseSpots.ts` | Bölme günlüğü `membership_radius_m` tutar. Eski yarıçaplı jurnal yeni yarıçapla uygulanmaz. |
| `functions/src/publicContent.ts` | `readMapGroup` paylaşılmış `readArea` yalnız `spot:` grubuna verilir. |
| `LociAR/Domain/ProximityPolicy.swift` | Simülatör konumu `LocationProvenancePolicy.accepts` ile süzülür. |
| `LociAR/Features/Map/PlaceNoteComposer.swift` | Pending kayıt mutation id ve anonim bayrağı tutar. Not metni yok. |

`AGENTS.md` hâlâ 25 m der. 6 m yalnız bu kirli ağaçtadır. Ürün kararı kapanmış sayılmaz. Gizlilik metnine, mağaza metnine ve yeni bir yarıçapa yayma. İki dosyayı farklı sayıda bırakma. Swift 6 ise sunucu 6 kalır. Birini 25’e çekip diğerini bırakma.

Not metni, çeviri ve caption diske yazılmaz.

## Kalan iş

Sırayla. Aynı anda en fazla 3 alt ajan.

1. Kirli geometri testlerini çalışma ağacındaki `SPOT_JOIN_RADIUS_M` ile geçir. Sabiti testin içine 25 diye yazma. Sabiti geri 25 yapma.
2. F09. `SocialActivity` id’sini istemci üretmez. `like_` + post + `luid` hash’i yok. Sunucunun verdiği `act_` id okundu işaretine gider.
3. F10. Ölç, sonra yama. 1.000 DAU kararlı gün 50.000 okuma, 20.000 yazma, 20.000 silme. `autoApproveNote` kalan eşikte durur, tarama genişlemez. 10 post silmede 169 boş sorgu atılmaz. Aynı GIF için tek in-flight indirme. Yetki ve anonimlik aynı kalır.
4. F11. `functions/test/integration/anonymity-differential-fix.test.mjs` duruyorsa onu koş. `user_blocks` ile `anonymous_blocks` yeni bir fark üretmesin. Ürün kilidini gevşetme.
5. F12. Kanıt `build/fix12-20261024/`. Ürün kodu yazmaz. S6’yı açık bırakır.

Fiziksel cihaz, sandbox ödeme ve mağaza bu turun dışında.

## Gemini’ye yapıştır

```
docs/release/GEMINI_CONTINUE_2026-10-24.md tek güncel el. TWELVE, TEN ve TWO planlarını baştan yürütme.
Dal codex/fix-anonymous-location-audit. HEAD efbab76 origin ile aynı. Commit edilmiş Codex işi yüklü.
Çalışma ağacı kirli. git checkout, stash, reset ve dosyayı HEAD’e döndürme.
Deploy, merge, rebase, seed, mağaza ve post_support.enabled yok.
F01 F02 F03 F04 F07 ve deliverPostApprovedPush tercih-önce sırası HEAD’de bitti. Onları yeniden yazma.
Yerel fark: SPOT_JOIN_RADIUS_M ve spotJoinRadius 6, MAX_PIN_DRAG_M 12, SPOT_MEMBERSHIP_VERSION 3.
Bu 6 m commit edilmedi. AGENTS.md hâlâ 25 m der. Yarıçapı yayma, bir dosyayı 25 diğerini 6 bırakma, not metnini diske yazma.
Kalan sıra: geometri testleri çalışma ağacındaki sabitle, F09 istemci activity id, F10 ölçülü maliyet, F11 diferansiyel test, F12 kanıt.
S6’yı açık yayın engeli bırak. minInstances 0. Spark yok.
1.000 DAU kararlı gün en fazla 50.000 okuma, 20.000 yazma, 20.000 silme.
```
