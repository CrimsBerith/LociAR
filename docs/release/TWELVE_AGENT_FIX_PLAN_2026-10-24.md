# FIX-12 — LociAR on iki ajanlı düzeltme planı

**Ad:** FIX-12. **Tarih:** 24 Ekim 2026. **Yürüten:** Gemini. **Tek kaynak bu dosyadır.**

`docs/release/TEN_AGENT_FIX_PLAN_2026-10-24.md` ve `docs/release/TWO_AGENT_ADDON_2026-10-24.md` yürürlükten kalktı. Onları yürütme.

Denetim kodu düzeltmedi. Bağlam: `docs/release/SIX_SPECIALIST_AUDIT_2026-10-24.md` (S1–S13), `docs/release/MULTI_AGENT_AUDIT_2026-10-24.md` (F1–F8). Dal `codex/fix-anonymous-location-audit`, HEAD `60afbca`. Uzak dal 5 commit ileride (`5c37118`). O commitler bu tura alınmaz.

Satır numarası ipucudur. Çalışmaya başlarken sembolü yeniden bul. Satır kaydıysa kusur kapanmış sayılmaz. Yorumda “S1 fix” yazması da kapanış değildir.

## Önce oku

Aynı anda en fazla Gemini + 3 ajan. Beş dalga. Dalga bitmeden sonraki dalga aynı bölgeye girmez. Her işçiye yalnız kendi `F0x` bölümü ve bu blok verilir.

**Yasak.** Deploy, merge, rebase, seed import, mağaza gönderimi ve `post_support.enabled` açmak yok. `git checkout`, `git stash` ve dosyayı HEAD’e döndürmek yok. `audit fix --force` yok. Spark’a geçmek yok. Blaze kalır. Kota doldu diye rules gevşetilmez. `minInstances` 0 kalır. `posts` üzerinde kalıcı dinleyici açılmaz. İstemci `posts` ve sayaç yazmaz. Callable düşünce doğrudan Firestore yazılmaz. Anonim yazar profil, beğeni, aktivite, storage veya geometri ile bulunamaz. `user_blocks` ile `anonymous_blocks` bağımsız kalır. Başkasının not metni uzaktan kilitli kalır. Not ve çeviri diske yazılmaz. Misafir yayınlayamaz. Yalnız metin ve bir GIPHY GIF. 18+ ve korumalı bölge gevşemez. Bildirim testini geçirmek için kilitli not açılmaz. Teşhis aracı exit 0 ise kusur duruyordur. Functions bölgesi `us-central1`. Supabase, Expo, Android yok.

**S6 açık yayın engelidir. On iki ajanın hiçbiri S6’yı almaz.** Eksik olanlar: `beginApplePostSupport`, `beginCryptoPostSupport`, `beginExternalPostSupport`, `confirmApplePostSupport`, `readMyPostSupport`, `readMySupportEarnings`, `readSupportCatalog`, `refreshStripePostSupport`, `supportAppleNotifications`, `supportCryptoWebhook`, `map_group_sessions.expires_at` TTL. `supportcheckoutreturn` ve `supportstripewebhook` Ready değil. Kimse deploy etmez.

**Maliyet tavanı bağlayıcıdır.** 100 ve 1.000 DAU bu sözün içindedir. 10.000 DAU bu sözün dışındadır. Para birimi yazılmaz. 1.000 DAU’da kararlı gün, proje toplamı, en fazla 50.000 Firestore okuma, 20.000 yazma, 20.000 silme. Kullanıcı başına ortalama tavan 50 okuma, 20 yazma, 20 silme. Tetikleyici, sayaç ve activity yazısı dahildir. 100 DAU aynı kodla bunun altında kalır. Kararlı gün saymaz: bir kerelik spot bölme, indeks oluşturma, deploy, mevcut depolama. Depolama 1 GiB’i aşıyorsa o satır bu sözün dışındadır.

**Kirli ağaç korunur.** Codex işi silinmez: `publicContent.ts` içinde `fingerprint` scope, `own_receipt`, `eligible_authors`, nearby, map-group session. `anonymousAccess.ts` içinde yer notu gövdesini `denseLocks` ile boşaltma. `triggers.ts` içinde `indexNotificationLike`, `autoApproveNote` çağrısı, anonim postta `creator_handle` fan-out atlaması. `push.ts` içinde `deliverActivityPush` bildirim kapalıyken hesap ve post okumadan döner (şu an 83–86). Bu dönüş silinmez. `deliverPostApprovedPush` (şu an 163–165) post, profil ve deletion belgelerini tercih kontrolünden önce okur. O okuma F10’un işidir. `PlaceNoteComposer` içinde `publishStatus == .active` ise `focusMap`. `firestore.indexes.json` içindeki mevcut indeks kayıtları, `likes` üzerinde `notification_eligible_at` dahil.

**Dosya el değişimi.**

| Dosya | Bölge | Sahip | Sıra |
|---|---|---|---|
| `functions/src/publicContent.ts` | `readFeed` | F01 | Dalga 1 |
| `functions/src/publicContent.ts` | `readMapGroup` üyelik ve `readArea` | F05 | Dalga 2, F01 `readFeed` bittikten sonra |
| `functions/src/publicContent.ts` | `readMapGroup` sayfa başına okunan belge sayısı | F10 | Dalga 4, F05 bittikten sonra. Üyelik ve kilit predicate’i değişmez. |
| `functions/src/publicContent.ts` | `exclusions` çağrısının ilgisiz modda atlanması | F10 | Dalga 4. Blok sonucu değişen modda tarama kalır. |
| `functions/src/triggers.ts` | `onLikeCreated` dış id, `emitActivity` like/follow id’si | F01 | Dalga 1 |
| `functions/src/triggers.ts` | `onCommentCreated` handle yazısı, `onProfileUpdated` fan-out sırası | F04 | Dalga 2, F01 bittikten sonra. Like/follow id şeması değişmez. |
| `functions/src/push.ts` | `data.activity_id` değeri | F01 | Dalga 1 |
| `functions/src/push.ts` | `deliverPostApprovedPush` tercih okuması, post/profil/deletion okumasından önce | F10 | Dalga 4. `deliverActivityPush` erken dönüşü ve `activity_id` kalır. |
| `firestore.indexes.json` | Tek yazıcı F01 | F01 | Dalga 1. Yalnız bir bileşik indeks ekler. Mevcut kayıt silinmez. Deploy yok. |

Paylaşılan dosyaların yazıcıları yalnız bu tablodaki bölgelerdir. `publicContent.ts` yazıcıları F01 (`readFeed`), F05 (`readMapGroup` üyelik ve `readArea`) ve F10 (sayfa başına belge sayısı ve ilgisiz modda `exclusions`) olur. `triggers.ts` yazıcıları F01 (like/follow dış id) ve F04 (`onCommentCreated` handle yazısı ve `onProfileUpdated` fan-out sırası) olur. `push.ts` yalnız iki bölgedir: F01 `activity_id` değerini yazar. F10 `deliverPostApprovedPush` içinde `user_data_preferences` okumasını post, profil ve deletion okumasından önce yapar. `firestore.indexes.json` tek yazıcısı F01’dir: bir yeni bileşik indeks, mevcut kayıtlar durur, deploy yok. F02, F03, F06, F07, F08, F09, F11 ve F12 `publicContent.ts`, `triggers.ts`, `push.ts` ve `firestore.indexes.json` dosyalarını yazmaz.

## Dalga ve kilit

| Dalga | Ajanlar |
|---|---|
| 1 | F01, F02, F03 |
| 2 | F04, F05, F06 |
| 3 | F07, F08, F09 |
| 4 | F10, F11 |
| 5 | F12 |

F09, F01’in dış id sözleşmesi yazılmadan başlamaz. F10, F08’in S1–S5 ve S9–S11 testleri repoda durmadan başlamaz. F11 ürün kodu yazmaz. F12 herkesten sonra koşar.

## F01 — Profil imleci ve activity dış kimliği

**Dalga:** 1. **Bulgu:** S1, S2. Önce oku bloğu bağlayıcıdır.

**Mekanizma.** Sembol `readFeed`. Şu an `functions/src/publicContent.ts` 357–367. `creator_id` sorgusu anonim kayıtları da okur. Sayfa 51 belgedir. Görünür küme sonra elenir. Satır 363 yorumu “S1 fix” der. Bu sahte S1 düzeltmesidir. Satır 365, görünür küme boşsa `cursor(documents.at(-1))` çağırır. 51 anonim gönderide gövde boş kalır. `next`, 50. anonim belgenin id’sini ve zamanını base64url JSON içinde taşır. İmleci yeniden encode etmek sızıntıyı kapatmaz. Başkasının anonim gönderisini okuyup atmak da yasaktır. O yol hem id sızdırır hem her anonim belgeyi faturalar.

Sembol `onLikeCreated` ve `emitActivity`. Şu an `functions/src/triggers.ts` 26–44 ve 54–66. Like olayının belge id’si `sha256("like_"+postId+"_"+userId)` olur. İstemcinin kamuya açık `luid` listesinden yeniden hesaplayabildiği activity id yasaktır. `readActivity` (`functions/src/anonymousAccess.ts`, dönüş nesnesi `id: doc.id`, şu an satır 180) bu id’yi döner. `actor_id` null olsa da üç aday tek eşleşmeye iner. Follow id `follow_${follower}_${following}` (`triggers.ts`, `onFollowCreated` içindeki `emitActivity` çağrısı, şu an satır 146) aynı sınıftır. `push.ts` veri yükündeki `activity_id` aynı değeri taşır.

Sembol `markActivityRead`. Şu an `functions/src/activity.ts` 16–33. Eksik belge atlanır ve başarı döner. Belge varsa ve `recipient_id` başkasına aitse tüm batch `permission-denied` olur. Yabancı activity id ile eksik activity id, `markActivityRead` çağıran için ayırt edilemez olmalıdır. Şu an ayırt ediliyor.

**Yama.** Başkasının creator sayfasında sorgu, anonim belgeyi okumadan ilerler. `is_anonymous == false` eşitlik filtresi, sahip olmayan görünüme uygulanır. Sahip kendi anonim gönderisini görmeye devam eder. `next` yalnız gerçekten dönen son belgeden üretilir. Görünür liste boşsa `next` null olur. Anonim post id’si imleçte yer almaz.

Dış activity id `act_` artı bir UUID’dir ve `^[A-Za-z0-9_-]{1,200}$` ile eşleşir. Belge id’si bu dönen id’dir. `activity_keys` hash girdisi like için sabit kimliktir: post id + beğenen. Follow için follower + following çiftidir. Hash girdisi `act_` id değildir ve istemciye dönen id değildir. Aynı transaction’da bu anahtar varsa ikinci olay yazılmaz. `activity_keys` like başına bir yazmadır. İkinci activity taraması değildir. Eski hash okuma cevabında dönmez. Alıcının eski belgesinde `public_ref` yoksa sunucu bir kez yazar ve onu döner. Yorum id’si `comment_${snap.id}` kalır. `deliverActivityPush` bildirim kapalıyken hesap ve post okumasından önce döner.

`readActivity` alıcıya döndürdüğü id ile `markActivityRead`, o alıcının satırını işaretler. Yabancı id ve eksik id aynı sonucu verir. Id atlanır, hata fırlatılmaz, cevapta yer almaz. İkinci çağrı `read_at` zamanını ezmez. Eski kendi hash’i yalnız gerçek alıcı için işaretlenir. Başkası o hash’i gönderirse cevap, hiç var olmamış id ile aynıdır.

`firestore.indexes.json` tek yazıcısı F01’dir. Mevcut indeksleri silmez. Başkasının creator sorgusu için tek bileşik indeks ekler: eşitlik alanları `creator_id`, `is_anonymous`, `status`, `visibility`, sıralama `created_at` DESC ve `__name__` DESC. İndeks deploy edilmez.

**Korunacak.** `fingerprint` cursor scope. `own_receipt`, `eligible_authors`, nearby, map-group session. `indexNotificationLike` ve `autoApproveNote` çağrısı. Yer notu `denseLocks` gövde kilidi. `anonymous: kind === 'like'`. Push ret yolunun hesap/post okumadan dönmesi. `data.activity_id` alanının adı. F04’ün yorum handle bölgesine girilmez. `readMapGroup` bölgesine girilmez.

**Dosyalar.** `functions/src/publicContent.ts` yalnız `readFeed`. `functions/src/anonymousAccess.ts` yalnız activity dönüş id’si. `functions/src/activity.ts` yalnız `markActivityRead`. `functions/src/triggers.ts` yalnız like/follow dış id. `functions/src/push.ts` yalnız `activity_id` değeri. `firestore.indexes.json` yalnız bir ek indeks. Bu dosyalar dışında yazma yok.

**Kabul.** 0, 1, 50, 51 anonim. Karışık atıflı ilk ve ikinci sayfa. Sahip kendi anonimini görür. Anonim mute imleci değiştirmez. Profil engeli akışı kapatır. Çözülen imleçte başkasının anonim post id’si yoktur. Başkasının anonim belgesi o sayfa sorgusunda okunmaz. Üç aday `luid` like veya follow id’sini tek eşleşmeye indirmez. `activity_keys` girdisi post id + beğenen, ya da follower + following çiftidir. `act_` id ve dönen id hash girdisi değildir. Dönen id `act_` artı UUID’dir. Eski hash listede görünmez. `readActivity`’nin alıcıya döndürdüğü id, `markActivityRead` ile o alıcının satırını işaretler. Yabancı ve eksik `markActivityRead` cevapları eşittir. Push `activity_id` hash veya `follow_a_b` değildir. `actor_id` anonim like’ta null kalır. Yorum id’si `comment_${snap.id}` kalır.

## F02 — Rules varlık farkı

**Dalga:** 1. **Bulgu:** S3. Önce oku bloğu bağlayıcıdır. `publicContent.ts`, `triggers.ts`, `push.ts` ve `firestore.indexes.json` yok.

**Mekanizma.** Sembol `match /likes`, `match /post_saves`, `match /follows`, `match /user_blocks`. Şu an `firestore.rules` 102–163. `get`, `resource == null` iken yabancı yolda da başarılıdır. Belge varsa yabancı `permission-denied` alır. Misafir, listelenebilen profil ve bilinen post id ile `likes/{post}_{candidate}` ve `post_saves/{candidate}_{post}` üretir. Alan okunamasa da ilişkinin varlığı çıkar.

**Yama.** Eksik yabancı belge de reddedilir. Kendi eksik belgesi okunabilir. Kendi var belgesi okunur. Yabancı var ve yok aynı `permission-denied` olur. Silme, `resource == null` iken kendi kaydı için idempotent kalır. Şu anki silme satırları 114, 129, 148, 163.

**Korunacak.** Kendi eksik get ve kendi idempotent silme. Liste kuralları kendi kenarında kalır. `collection_items` bu turda kanıtlı sömürü değildir. O koleksiyona genişleme yok. Codex’in başka rules değişikliği yok. Dosya temizdir. Tüm dosyayı yeniden yazma.

**Dosyalar.** `firestore.rules`. `functions/test/rules/firestore.rules.test.mjs`. Başka dosya yok.

**Kabul.** Misafir, normal hesap, engelli hesap. Dört koleksiyon. Kendi eksik get başarılı. Kendi silme ikinci kez başarılı. Yabancı var ve yok ayırt edilemez. Mevcut rules testleri durur. Yeni dört yol onların üstüne eklenir.

## F03 — Rol daveti AAL2

**Dalga:** 1. **Bulgu:** S4. Önce oku bloğu bağlayıcıdır. `publicContent.ts`, `triggers.ts`, `push.ts`, `firestore.indexes.json` ve ödeme dosyası yok.

**Mekanizma.** Sembol `POST` in `admin/app/api/admin/v1/users/invite/route.ts`. Şu an satır 16 `requireAdminApi('users.invite')` çağırır. `roleKey` varken `admin_users.write` ve AAL2 yoktur. `admin/lib/rbac.ts` `STEP_UP_PERMISSIONS` email-code oturumundan `admin_users.write` siler. Şu an satır 32–43. Aynı email-code super_admin oturumu rol revoke’ta 403, `trust_safety_admin` davetinde 201 alır. Kabul, `admin/lib/admin-invite.ts` içinde rol atar. Şu an yaklaşık satır 103–107.

**Yama.** `roleKey` null değilse route `requireAdminApi('admin_users.write')` kullanır. Email-code bu izni geçemez. `roleKey` null kullanıcı daveti `users.invite` ile kalır. Accept, davet edenin rolü kalkmışsa bekleyen rolü yazmaz. `super_admin` daveti `invalid_invite_role` olarak kalır. `rbac.ts` yazılmaz. Step-up kümesi zaten doğrudur. Delik, davet yolunun o kümeyi çağırmamasıdır.

**Korunacak.** Origin, rate limit, idempotency anahtarı, bilinen rol listesi, `super_admin` reddi. Normal kullanıcı daveti. Gerçek e-posta gönderilmez.

**Dosyalar.** `admin/app/api/admin/v1/users/invite/route.ts`. `admin/lib/admin-invite.ts` yalnız accept sırasında rol yazma koşulu. Başka dosya yok.

**Kabul.** Email-code super_admin rol daveti 403. AAL2 super_admin aynı davet 201, kabul 200, tek rol kaydı. Normal kullanıcı daveti 201. Aynı idempotency anahtarı ikinci rol açmaz. Davet edenin rolü kabul öncesi kalkınca bekleyen rol daveti rol vermez.

## F04 — Yorum kullanıcı adı yarışı

**Dalga:** 2. **Bulgu:** S11. F01 `triggers.ts` işi bitmeden başlama. Önce oku bloğu bağlayıcıdır.

**Mekanizma.** Sembol `onCommentCreated`. Şu an `functions/src/triggers.ts` 114–117. Profil transaction dışında okunur. `safeUpdate` eski handle’ı yazar. Sembol `onProfileUpdated`. Şu an 262–266. Yeni handle fan-out edilir. Geciken yorum handler’ı eski handle’ı, fan-out’tan sonra geri yazar. Tek rename yeter. 30 gün cooldown yarışı engellemez.

**Yama.** Handle yazısı, yorum belgesi ile güncel profili aynı transaction’da okur. Profil handle’ı artık eski değer değilse eski değer yazılmaz. Redelivery ikinci yazı açmaz. Hesap siliniyorsa yazı durur.

**Korunacak.** Filtreli yorumun silinme transaction’ı. Şu an yaklaşık 79–111. F01’in like/follow dış id’si ve `emitActivity` id şeması. `indexNotificationLike`, `autoApproveNote`. Anonim postta `creator_handle` fan-out atlaması. Şu an `fanOut` içinde `is_anonymous` kontrolü, yaklaşık satır 206. iOS yorum oluştururken `username` yazmıyor. Sunucu doldurur. Bu kalır.

**Dosyalar.** `functions/src/triggers.ts` yalnız `onCommentCreated` handle yazısı ve `onProfileUpdated` fan-out sırası. Like, follow ve `emitActivity` id üretimine girme. Başka dosya yok.

**Kabul.** Kontrollü gecikme: profil `new_handle`, yorum `new_handle`. Ters sıra da `new_handle` ile biter. Redelivery ve deletion fence geçer. Like activity id’si F01 sözleşmesinde kalır.

## F05 — 25 m kanonik grup

**Dalga:** 2. **Bulgu:** S5. F01 `readFeed` bitmeden `publicContent.ts` içine girme. Önce oku bloğu bağlayıcıdır.

**Mekanizma.** Üyelik, merkeze 25 m’dir. Çember kenarından zincirlemek yasaktır. Sembol `spotsNear` ve `distanceToSpot`. `distanceToSpot` yarıçapı düşer. `spotsNear` katılımı bu kenar mesafesiyle seçer. `denseSpots.ts` şu an yaklaşık 37–39. `placeNoteRules.ts` `distanceToSpot` şu an 136–138. `joinSpot` merkezi kaydırır ve yarıçapı `MAX_SPOT_RADIUS_M` 40 m’de keser. Şu an 147–152. `stillInside` üyeyi merkeze 40 m ise tutar. `denseSpots.ts` şu an 54. Zincir 153 m’ye uzar. `mapNoteGroups` aynı `spotId` altındaki her noktayı mesafeye bakmadan tek gruba koyar. `mapNoteGroups.ts` şu an 18–24. `readMapGroup` bu grubun özetini `readArea` diye verir. `publicContent.ts` şu an yaklaşık 324–332. `locationNoteLock` `readArea` ile açınca uzak üye de açılır. `denseSpots.ts` şu an 157–164. Ölçülen karşı örnek: 17 üye, uçlar 153 m, en uzak üye 91 m, 17 gövde açık. Yarıçap sabitini küçültmek üyeyi dışarı atmaz.

**Yama.** Katılım ve kalma, noktanın spot merkezine uzaklığı `<= SPOT_JOIN_RADIUS_M` (25) olur. Kenar mesafesi katılım sayılmaz. `MAX_SPOT_RADIUS_M` üyelik genişletmez. `mapNoteGroups` aynı spot id altında 25 m dışındaki noktayı ayrı gruba böler. `mapGroupSummary` erişim dairesi, 40 m’de kesilmiş yarıçapla uzak üyeyi açık saymaz. `readArea` yalnız o 25 m grubun üyelerini taşır. Eski geniş spot bir kerelik ve kayıpsız bölünür. Bu bölme harita açılışında ve `readMapGroup` isteğinde çalışmaz. İkinci koşu post silmez ve merkezine 25 m içindeki üyeyi düşürmez. Bölme deploy edilmez. Post silinmez. Her post bir gruba düşer. Aynı koordinat tek grupta kalır. Tarih çizgisi `meanLongitude` bozulmaz. Eski grup cursor’u yeni sürümde uzak üyeyi açmaz. `LocationNotePolicy.swift` ile `placeNoteRules.ts` aynı 25 m sayısını taşır. Kampanya yarıçapı değişmez.

**Korunacak.** `readFeed` ve F01 imleci. `fingerprint`, `own_receipt`, nearby. Tarih çizgisi ortalaması. Kampanya giriş yarıçapı. Codex map-group session belgesi. Sayfa başına okunan belge sayısını F10 değiştirir. F05 onu şişirmez ve F10’un bölgesini, üyelik bahanesiyle 300 üye okumaya çevirmez.

**Dosyalar.** `functions/src/denseSpots.ts`. `functions/src/placeNoteRules.ts` yalnız üyelik ölçüsü. `functions/src/mapNoteGroups.ts`. `functions/src/publicContent.ts` yalnız `readMapGroup` üyelik ve `readArea`. `LociAR/Domain/LocationNotePolicy.swift` yalnız 25 m sabitinin sunucu ile aynı kalması. Kampanya dosyası yok. `firestore.indexes.json` yok.

**Kabul.** 17 not, uçlar 153 m. Hiçbir grup, merkezden 25 m dışına üye almaz. 17 notun her biri bir grupta durur. Uzak üye o grup izniyle açılmaz. Aynı koordinatta 10 not tek grup. Tarih çizgisi bozulmaz. Gizleme ve silme üyeliği düşürür. Eski cursor uzak gövde açmaz.

## F06 — AR tazelik ve yayın niyeti

**Dalga:** 2. **Bulgu:** S9, S10. Önce oku bloğu bağlayıcıdır. `publicContent.ts`, `triggers.ts`, `push.ts` ve `firestore.indexes.json` yok.

**Mekanizma.** S9. `LocationController` yeni fix’i `maxFixAge` 10 sn ile süzer. Şu an `LocationController.swift` 105–111. Accuracy tavanı yoktur. `LocationSample.isUsable` `accuracy >= 0` kabul eder. `LocationNotePolicy.swift` şu an 74–77. 3 km geçer. `ARPostViewerView.verifyAndOpen` `location.location` kullanır. `freshLocation(at:)` kullanmaz. Şu an 276’dan itibaren, karar yaklaşık 288–301. `ProximityPolicy.evaluate` yaş ve accuracy bakmaz. Şu an 30–46. `proximityVerified = true` sonra resolver dönüşünde konum geri alınmaz. Not yoğunluğu `maxEntryAccuracy` 35 m kullanır. AR yolu kullanmaz.

S10. `PlaceNoteComposer` `mutation` değeri `@State` içindedir. Şu an satır 155. Metin değişince yeni UUID olur. Şu an satır 192. `submit` cevabı kaybolursa hata gösterilir. Ekran yeniden açılınca yeni UUID ikinci not açar. Sunucu aynı UUID’yi tek nota bağlar.

**Yama.** Karar anında fix 10 sn’den eskiyse veya accuracy 35 m’den büyükse açılış olmaz. `proximityVerified` her resolver dönüşünde aynı kuralla yeniden kurulur. İzin veya konum gidince içerik ve bayrak düşer. Belirsiz yayın sonucunda aynı kullanıcı için metinsiz pending id saklanır. Retry aynı id’yi yollar. Kullanıcı metni değiştirirse veya bilerek yeni not isterse yeni id olur. Yeni yayın taze GPS ister. Not metni, çeviri ve caption diske yazılmaz.

**Korunacak.** `distanceMeters` 60 ve heading eşikleri. Backend not kilidi. `publishStatus == .active` ise `focusMap`. Şu an `PlaceNoteComposer.swift` 367–369. Misafir yayın yasağı.

**Dosyalar.** `LociAR/Domain/ProximityPolicy.swift`. `LociAR/Features/AR/ARPostViewerView.swift` yalnız doğrulama kararı. `LociAR/Features/Map/PlaceNoteComposer.swift` yalnız mutation kimliği. Başka dosya yok.

**Kabul.** Bir saat eski yakın fix açılış vermez. 3 km accuracy açılış vermez. Taze ve 35 m içindeki yakın fix açılış verir. Resolver dönüşünde kullanıcı 60 m dışına çıktıysa içerik düşer. İzin gidince içerik düşer. Kayıp cevap aynı mutation id ile tek not olur. Metin değişince yeni id yeni not açabilir. Diskte not metni yoktur.

## F07 — Bağımlılık ve gizlilik metni

**Dalga:** 3. **Bulgu:** S7, S8. Önce oku bloğu bağlayıcıdır. `publicContent.ts`, `triggers.ts`, `push.ts` ve `firestore.indexes.json` yok.

**Mekanizma.** Admin `package.json` içinde `next` `^16.3.8`. Bu sürüm, image, cache ve Server Actions advisory aralığındadır. Functions production ağacında `body-parser` high ve `fast-uri` moderate kayıtlıdır. Sharp 0.35.5 ve kapalı Cache Components bu kurulumda kanıtlanmış RCE değildir. Kapı yine kırmızıdır. Gizlilik metni `admin/app/privacy/page.tsx` 141–143 ve `admin/app/privacy/en/page.tsx` 134–136. Metin, 30’dan fazla notta kilit ve tek kontrol sonrası 30 dakika açık der. Sözleşme başkadır. Başkasının tekil notu da uzaktan kilitlidir. Grup metni taze yerinde fix ister. 30 eşiği yalnız yoğunluk bildirimine aittir.

**Yama.** Kilitli uyumlu yama. Major zıplama yok. `npm audit fix --force` yok. Sonra production `npm audit` ve ilgili admin ile functions testleri. TR ve EN aynı sözleşmeyi söyler. Store metnine yeni iddia eklenmez. Katalog elle düzenlenmez.

**Korunacak.** Cache Components kapalı kalır. Server Actions bu iş için açılmaz. GIPHY anahtarı uygulamaya girmez. Ödeme bayrakları değişmez.

**Dosyalar.** `admin/package.json`, `admin/package-lock.json`, `functions/package.json`, `functions/package-lock.json`. `admin/app/privacy/page.tsx`, `admin/app/privacy/en/page.tsx`. Başka dosya yok.

**Kabul.** Production `npm audit` sonrası kalan her kayıt paket adı ve severity ile yazılır. Kalan kayıt yoksa kapı geçer. Şu aralıkların içinde kalan bir kayıt geçiş değildir: `next` image advisory, `next` cache advisory, `next` Server Actions advisory, `body-parser` high, `fast-uri` moderate. `npm audit fix --force` yok. Major sürüm zıplaması yok. Adsız “aralığın dışında” geçiş değildir. TR ve EN, tekil notun uzaktan kilitli olduğunu ve grup metninin taze yerinde fix istediğini söyler. 30 eşiği yalnız yoğunluk bildirimine bağlıdır.

## F08 — Kabul testleri ve fixture

**Dalga:** 3. **Bulgu:** S13 ve F01–F06 regresyonu. Önce oku bloğu bağlayıcıdır. Ürün kilidini gevşetmez. `publicContent.ts`, `triggers.ts`, `push.ts` ve `firestore.indexes.json` yok.

**Mekanizma.** Mevcut teşhisler kusuru yeniden üretir. Exit 0 kabul değildir. `testProfileSupportsAccessibilityXXXL` (`LociARUITests/AuthGateUITests.swift`, şu an satır 98) kaydırmadan Kaydedilenler ve silme uyarısını arar. `scripts/simulator-note-fixture.mjs` şu an satır 152 `newAnonymousUser` ile konum notu açmaya çalışır. Misafir yayınlayamaz. Bu yüzden fixture HTTP 500 alır. Bu, yayın kuralının hatası değildir.

**Yama.** Sağlıklı sonucu zorunlu tutan test yaz. `git checkout`, `git stash` ve dosyayı HEAD’e döndürmek, testin kırmızı olduğunu kanıtlamak için yasaktır. Kapsam: 51 anonim imleç ve anonim belgenin okunmaması, activity id’nin üç `luid` ile bulunamaması, `markActivityRead` yabancı ve eksik cevabının aynı olması, dört rules koleksiyonu, email-code rol daveti 403, 17 notun merkeze 25 m bölünmesi, yorum handle yarışının `new_handle` ile bitmesi. XXXL testine kaydırma önkoşulu ekle. Ürün hücresini erişilebilir diye değiştirme. Fixture doğrulanmış `newUser` kullanır. Bildirim gövdesi kilitli notu açık metin diye beklemez.

**Korunacak.** Misafir yayın yasağı. Tekil notun konumsuz kilitli gösterilmesi. `MainTabView` bu kilidi açmaz. Anonimlik diferansiyel dosyası F11’indir. Bu ajan o dosyayı yazmaz.

**Dosyalar.** `functions/test` altında yeni regresyon dosyaları. `LociARUITests/AuthGateUITests.swift` yalnız XXXL kaydırma önkoşulu. `scripts/simulator-note-fixture.mjs` yalnız doğrulanmış yazar. Ürün kaynak dosyası yok.

**Kabul.** `git checkout`, `git stash` ve dosyayı HEAD’e döndürmek, testin kırmızı olduğunu kanıtlamak için yasaktır. Kapı, çalışma ağacındaki şu gözlemlerdir. 51 anonim gönderi id sızdırmaz ve okunup atılmaz. Activity id üç kamuya açık `luid` ile yeniden hesaplanamaz. Yabancı ve eksik `markActivityRead` cevapları aynıdır. Dört rules koleksiyonunda yabancı var ve yok ayırt edilmez. Email-code rol daveti 403 döner. 17 not merkezden 25 m içinde kalır. Yorum handle yarışı `new_handle` ile biter. Bu davranış çalışma ağacında zaten varsa, o ağaçta yeşil geçiş sayılır. XXXL testi kaydırma önkoşulu ile Kaydedilenler hücresini görür. Simülatör fixture doğrulanmış `newUser` kullanır. Kilitli not gövdesi kilitli kalır.

## F09 — iOS activity sözleşmesi

**Dalga:** 3. F01’in dış id sözleşmesi yazılmadan başlama. Önce oku bloğu bağlayıcıdır. `publicContent.ts`, `triggers.ts`, `push.ts` ve `firestore.indexes.json` yok.

**Mekanizma.** `SocialActivity.id` (`LociAR/Data/SocialRepository.swift`, şu an satır 4–21) sunucunun verdiği stringdir. `ActivityView` ve `NotificationService.markActivityRead` bu stringi geri yollar. Şu an `ActivityView.swift` yaklaşık 100 ve 146, `NotificationService.swift` yaklaşık 371. İstemci id’yi `like_`, post id ve `luid` ile kendisi üretirse S2 telefonda kalır.

**Yama.** İstemci hash hesaplamaz. Eski opak id ve `act_` id decode olur. Bozuk id uygulamayı düşürmez. Okundu işareti yalnız listeden veya push yükünden gelen id ile gider. Push yükünden yazar, profil veya not metni çıkarılmaz.

**Korunacak.** `actor_id` null kalabilir. Not ve çeviri diske yazılmaz. `PlaceNoteComposer.swift` ve `ProximityPolicy.swift` F06’nın dosyalarıdır. F09 bu dosyaları yazmaz.

**Dosyalar.** `LociAR/Data/SocialRepository.swift`. `LociAR/Features/Social/ActivityView.swift`. `LociAR/AppCore/NotificationService.swift`. İlgili XCTest. Sunucu dosyası yok.

**Kabul.** İstemci kaynakında `like_` + post + `luid` hash’i yoktur. Sunucudan gelen `act_` id okundu işaretine gider. Bozuk id çökertmez.

## F10 — Maliyet, 1.000 kullanıcı kotası

**Dalga:** 4. **Bulgu:** S12. F08’in S1–S5 ve S9–S11 testleri repoda durmadan başlama. F05 `readMapGroup` üyelik işi bitmeden sayfa genişliğine girme. Önce oku bloğu bağlayıcıdır. “Düşür” kabul değildir.

**Mekanizma.** Aşağıdaki yollar 1.000 DAU’da 50.000 okuma, 20.000 yazma ve 20.000 silme kotasını deler.

| Yol | Sembol | Ölçülen taşma | Kabul |
|---|---|---|---|
| Grup sayfası | `readMapGroup` | 15+50 gövde için 600 post satırı | Sayfa kadar belge. 300 üye her sayfada okunmaz. |
| Blok taraması | `exclusions` | 400 ilgisiz blok, `own_saved` ve geçersiz mod dahil | İlgisiz mod taramaz. Blok sonucu değişen mod tarama yapar. |
| Beğeni onayı | `autoApproveNote` | 300 olgun beğenide 602 mantıksal belge (`noteAutomation.ts` 87–94) | Sayfa, kalan eşik dolunca durur. 300 beğenenin tamamı okunmaz. Tarama genişlemez. |
| Bildirim kapalı, activity | `deliverActivityPush` | 10 cihazda 31 okuma | Hesap ve post okuması bildirim kapalıyken zaten yok (`push.ts` 83–86). Bu dönüş kalır. F10 hidrasyonu geri getirmez. |
| Bildirim kapalı, onay | `deliverPostApprovedPush` | 10 cihazda 61 okuma | `push.ts` 163–165 önce post, profil ve deletion okur. Bildirim kapalıysa `user_data_preferences` okuması bu üçünden önce gelir ve fonksiyon döner. |
| Silme | `accountDeletion` | 10 postluk fixture, 171 sorgu, 169’u boş | Bu 169 boş sorgu atılmaz. Storage, Auth ve grant temizliği kalır. |
| GIF | `GifDataCache.data` | 8 eşzamanlı tüketici, 8 indirme | Aynı URL için tek in-flight indirme. Firestore okuması artmaz. |

`GifDataCache` (`LociAR/DesignSystem/AnimatedGIFView.swift`) bitmiş cevabı saklar. Uçuştaki isteği paylaşmaz. `SpatialContentRenderer.loadAsset` aynı URL’yi ayrı indirir.

**Yama.** Her yol için önce aynı fixture ölçülür, sonra yama, sonra aynı ölçü. 1.000 DAU kararlı gün modeli 50.000 okuma, 20.000 yazma veya 20.000 silmeyi aşarsa yama reddedilir. Model sentetiktir. Canlı fatura yazılmaz. `minInstances` 0 kalır. Yeni sürekli servis ve `posts` dinleyicisi yok. Spark yok.

**Korunacak.** F01 imleci ve anonim belgenin okunmaması. F05 üyelik ve kilit predicate’i. `activity_id` F01 değerinde kalır. Hash geri gelmez. `indexNotificationLike` çağrısı silinmez. `autoApproveNote` onayı kalkmaz. Tarama, kalan eşik dolunca durur ve genişlemez. `deliverActivityPush` içindeki bildirim kapalı dönüşü (`push.ts` 83–86) silinmez. Map single-flight, `ClientRequestCache`, `MapRequestCoordinator` silinmez. Silinen hesabın Storage, Auth ve grant temizliği kalır.

**Dosyalar.** `functions/src/publicContent.ts` yalnız sayfa başına okunan belge sayısı ve ilgisiz modda `exclusions` atlaması. `functions/src/noteAutomation.ts` yalnız `autoApproveNote` içinde eşiğe ulaşınca duran okuma. `functions/src/push.ts` yalnız `deliverPostApprovedPush`: bildirim kapalıysa tercih okuması post, profil ve deletion okumasından önce gelir. `functions/src/accountDeletion.ts` yalnız 10 postluk fixture’da 169 boş sorgunun atılmaması. Storage, Auth ve grant temizliği kalır. `LociAR/DesignSystem/AnimatedGIFView.swift` yalnız `GifDataCache` in-flight paylaşımı. `LociAR/ARCore/SpatialContentRenderer.swift` yalnız `loadAsset` in-flight paylaşımı. Rules, privacy, indeks ve ödeme yok.

**Kabul.** Tablodaki her yolun sonrası ölçüsü kabul sütununu tutar. `deliverPostApprovedPush` bildirim kapalıyken post, profil ve deletion okumaz. `autoApproveNote` 300 beğeneni baştan sona taramaz. 1.000 DAU modeli 50.000 / 20.000 / 20.000 içindedir. 100 DAU daha altındadır. Üyelik, kilit, anonimlik ve silme temizliği testleri yeşil kalır.

## F11 — Anonimlik diferansiyeli

**Dalga:** 4. F10 ile paralel. Önce oku bloğu bağlayıcıdır. Ürün kodu yok. `publicContent.ts`, `triggers.ts`, `push.ts` ve `firestore.indexes.json` yok.

**Mekanizma.** `functions/test/integration/anonymous.test.mjs` tek notta profil, arama ve nearby’yi ölçer. 51 anonim imleci ölçmez. F01, F02 ve F05 yeni bir fark üretebilir. Profil engeli atıflı içeriği etkiler. Anonim susturma yalnız o izleyicide, yalnız o yazarın anonim notlarını etkiler. İki yolun hata kodu, imleç veya var/yok cevabı yazar çıkaramaz.

**Yama.** Yeni test dosyası yaz. Mevcut `anonymous.test.mjs` dosyasını yeniden yazma.

**Korunacak.** Mevcut diferansiyel test. Ürün kaynağı, rules, admin ve Swift.

**Dosyalar.** Yalnız `functions/test/integration/anonymity-differential-fix.test.mjs`.

**Kabul.** Sentetik demo emülatörde şunlar geçer. Anonim susturma profil, uygun yazar, arama ve atıflı gönderiyi değiştirmez. Profil engeli anonim notu nearby, single ve creator imlecinden düşürmez. 51 anonim yabancı profilde susturan ve susturmayan aynı boş gövdeyi alır. `next` anonim id taşımaz. Like, save, follow ve block için yabancı var ve yok cevabı iki blok türünde ayrışmaz. Activity `actor_id` anonim like’ta null kalır. Id üç aday `luid` ile tek eşleşmeye inmez.

## F12 — Bağımsız doğrulayıcı

**Dalga:** 5. Önce oku bloğu bağlayıcıdır. Ürün kodu yazmaz. `publicContent.ts`, `triggers.ts`, `push.ts` ve `firestore.indexes.json` yok. Kırmızı kapıyı yeşile çevirmek için ürün gevşetilmez.

**Mekanizma.** Önceki ajanların kendi testini geçmesi, iki blok türünün ve maliyet kotasının birlikte durduğunu göstermez.

**Yama.** Yok. Koşu ve rapor vardır.

**Korunacak.** Çalışma ağacı. S6 açık kalır. Deploy, merge, rebase, seed ve mağaza yok.

**Dosyalar.** Yalnız `build/fix12-20261024/` kanıtı. Ürün dosyası yok.

**Kabul.** Rapor şunları içerir. F08 ve F11 testleri. `anonymous.test.mjs`. Functions unit, rules ve ilgili entegrasyon. Admin davet testi, gerçek e-posta yok. Native XCTest, F06 ve F09 kapsamı. F07 sonrası production `npm audit`. F10 öncesi ve sonrası ölçü. 1.000 DAU modeli 50.000 okuma, 20.000 yazma veya 20.000 silmeyi aşıyorsa rapor kırmızıdır. Fiziksel iPhone, gerçek APNs, sandbox ödeme ve mağaza yoksa açık madde yazılır. S6 kapanmış sayılmaz.

## Bitiş

Gemini FIX-12’yi bitmiş sayar ancak F12 raporu S1–S5, S9–S11, S4, S7 ve S8 için sızıntının artık üretilmediğini ve 1.000 DAU kararlı gün modelinin 50.000 okuma, 20.000 yazma ve 20.000 silme içinde kaldığını gösterirse. S6, fiziksel cihaz, mevcut depolama ve uzak 5 commit açık kalır. 10.000 DAU bu sözün dışındadır.

## Gemini başlangıç metni

```
docs/release/TWELVE_AGENT_FIX_PLAN_2026-10-24.md tek kaynak. TEN ve TWO planlarını yürütme.
FIX-12. Dalga 1 F01 F02 F03. Dalga 2 F04 F05 F06. Dalga 3 F07 F08 F09. Dalga 4 F10 F11. Dalga 5 F12.
Aynı anda en fazla 3 alt ajan. Her ajana yalnız kendi F0x bölümünü ve «Önce oku» bloğunu ver.
Dosya kilidi: publicContent.ts readFeed F01, readMapGroup üyelik F05, sayfa genişliği F10.
triggers.ts like/follow id F01, yorum handle F04.
push.ts yalnız iki bölge: F01 activity_id değeri. F10 deliverPostApprovedPush içinde user_data_preferences okuması post, profil ve deletion okumasından önce.
firestore.indexes.json tek yazıcı F01: bir yeni bileşik indeks, mevcut kayıtlar durur. Deploy etme.
F02, F03, F06, F07, F08, F09, F11 ve F12 publicContent.ts, triggers.ts, push.ts ve firestore.indexes.json yazmaz.
readFeed içindeki cursor(documents.at(-1)) sahte S1 düzeltmesidir. Anonim belgeyi okuyup atma.
activity_keys hash girdisi like için post id + beğenen, follow için follower + following. act_ id ve istemciye dönen id hash girdisi değildir.
Dönen id act_ artı UUID’dir ve ^[A-Za-z0-9_-]{1,200}$ ile eşleşir. Eski hash dönmez.
readActivity’nin alıcıya döndürdüğü id, markActivityRead ile o alıcının satırını işaretler.
markActivityRead yabancı id ile eksik id’yi ayırt edemez. Yorum id’si comment_${snap.id} kalır.
activity_keys like başına bir yazmadır. İkinci activity taraması değildir.
deliverActivityPush bildirim kapalıyken hesap ve post okumasından önce döner.
Spot üyeliği merkeze 25 m’dir. Çember kenarından zincirlenmez.
Bir kerelik spot bölme harita açılışında ve readMapGroup isteğinde çalışmaz. İkinci koşu post silmez ve 25 m içindeki üyeyi düşürmez. Bölme deploy edilmez.
10 postluk silme fixture’ında 169 boş sorgu atılmaz. Storage, Auth ve grant temizliği kalır.
F07 kalan her production audit kaydını paket ve severity ile yazar. next image, next cache, next Server Actions, body-parser high ve fast-uri moderate geçiş değildir. audit fix --force yok. Major zıplama yok.
F08 git checkout, git stash ve HEAD’e döndürme ile kırmızı kanıt üretmez. Gözlemler çalışma ağacında duruyorsa yeşil geçiş sayılır.
Codex kirli ağacını HEAD’e döndürme.
Deploy, merge, rebase, seed import, mağaza gönderimi ve post_support.enabled yok.
S6 açık yayın engelidir. Hiçbir ajana verme.
minInstances 0. Spark yok.
Maliyet tavanı bağlayıcı: 1.000 DAU kararlı gün, proje toplamı 50.000 okuma, 20.000 yazma, 20.000 silme.
Grup sayfası 15+50 gövde için 600 post satırı okumaz. Sayfa kadar belge okur.
F10 «düşür» ile geçemez. autoApproveNote taraması kalan eşikte durur ve genişlemez.
deliverPostApprovedPush bildirim kapalıysa tercih okumasını post, profil ve deletion okumasından önce yapar.
10.000 DAU sözü yok. Para birimi yok.
Satır kayması kusurun kapandığı kanıtı değildir. Sembolü yeniden bul.
```
