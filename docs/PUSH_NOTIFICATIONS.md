# Push bildirimleri

Uygulama APNs ve Firebase Messaging kullanır. Profil → Gizlilik ve güvenlik →
**Bildirimleri etkinleştir** açık izin isteğini başlatır. Açılışta sistem izin penceresi
gösterilmez. İzin verilmiş/reddedilmişse aynı satır iOS Ayarlar'a gider. Firebase
Messaging otomatik token üretimi varsayılan olarak kapalıdır; doğrulanmış oturum ve
bildirim izni mevcutken açılır. Önizleme oturumları Firebase Messaging'i başlatmaz.
Firebase iOS SDK 12.19'un Installation ID üzerinden teslim seçeneği kapalı tutulur
(`FirebaseMessagingInstallationIdEnabled=false`); sunucu sözleşmesi FCM token'ları
kullanır. Bu SDK'da token API'leri deprecated olsa da bu modda desteklenmektedir;
Installation ID moduna geçiş istemci ve sunucu sözleşmesinin birlikte göçünü gerektirir.

## Sunucu sözleşmesi

- `registerPushToken({token, installationId, userId, locale})` ve
  `unregisterPushToken({installationId, userId})` callable'ları `us-central1` içindedir.
  Üretimde App Check zorunludur. Sahip kimliği Auth UID'den hesaplanır; `userId` yalnız
  gecikmiş bir isteğin farklı oturuma bağlanmasını önleyen eşleşme kontrolüdür.
- Token kaydı doğrulanmış kimlik ve aktif profil gerektirir. Kurulum kimliği cihazda
  saklanan rastgele UUID'dir. Token SHA-256 belge kimliğiyle `push_tokens` içinde,
  sunucu yetkisiyle tutulur; istemciler bu koleksiyonu okuyamaz/yazamaz.
- Bir kullanıcı en fazla 10 cihaz kaydına sahiptir. Aynı kurulumdaki token rotasyonu
  eski kaydı siler; aynı token farklı hesaba kaydedilince sahiplik atomik değişir.
  Eski hesabın gecikmiş çıkış isteği yeni hesabın kaydını silemez.
- Token kayıtları 30 gün sonra sona erer. İstemci başarılı kaydı 24 saat içinde
  tekrarlamaz; oturum açılışı, uygulamaya dönüş, bağlantının geri gelmesi, token ve
  dil değişimi kayıt/yenileme fırsatlarıdır. Başarısız kayıt yeniden denenebilir.
- Çıkış, sürmekte olan kayıt isteğini bekler ve Firebase Auth oturumu kapanmadan
  sunucudaki bu kuruluma ait kayıtları kaldırır; ardından FCM token'ı ve cihazdaki
  bildirimler temizlenir. Hesap silme token/teslimat kayıtlarını sunucuda da siler.
  Apple iptali başarısızsa hesap silme ve profilin siliniyor durumuna alınması başlamaz.

`onActivityCreated` beğeni, yorum ve takip aktivitelerini kayıtlı cihazlara gönderir.
Alıcı/aktör profil durumu, iki yönlü engelleme, okunma/sona erme ve ilgili postun
aktif durumu gönderim öncesinde transaction içinde kontrol edilir. Kilit ekranında
12 dilde genel metin kullanılır; kullanıcı adı, yorum metni ve konum gönderilmez.
Veri alanları `activity_id`, `recipient_id` ve varsa `post_id` içerir. Dokunma aynı
oturumdaki posta, takip veya erişilemeyen post için Aktivite ekranına gider.
Hedef açıldığında `activity_id` için okundu callable'ı çağrılır; uygulama doğrudan
aktivite belgesine yazmaz. Akış: [ACTIVITY_AND_ACCOUNT_DELETION.md](ACTIVITY_AND_ACCOUNT_DELETION.md).

`push_delivery_receipts` bir aktivite/token için FCM çağrısından **önce** oluşturulur;
eşzamanlı/redelivered trigger ikinci gönderim girişimi yapamaz. Bu en fazla bir
girişim modelidir: FCM transaction'a katılamaz; çökme/ağ hatasında push kaybolabilir.
Aktivite akışı kalıcıdır. Başarısız FCM çağrısı otomatik tekrar gönderilmez. Bilinen
geçersiz token kodları kaydı siler; genel payload/izin hataları token'ı silmez.
APNs collapse ID aynı aktiviteyi birleştirir, teslim için son süre bir saattir.
Teslimat kayıtları 180 gün sonra TTL ile kaldırılır; bu süre sonrasında dedup
kanıtı saklanmaz. Normal trigger yeniden teslimi bu pencerenin içindedir.

Çevrimdışı çıkışta sunucu temizliği/FCM iptali tamamlanamayabilir. APNs'ye önceden
aktarılmış bildirim geri çekilemez; işletim sistemi arka planda genel uyarıyı
gösterebilir. Uygulama ön planda ve bildirim dokunmasında `recipient_id` ile mevcut
hesabı eşleştirir. Bu nedenle cihaz testi çevrimdışı çıkışı ayrıca kapsar.

## Firebase / Apple yapılandırması

1. Apple Developer'da `com.khankartal.lociar` App ID'sinde Push Notifications
   capability ve uygun provisioning profile bulunmalı. Firebase Console → Project
   Settings → Cloud Messaging → iOS uygulamasına APNs authentication key, Key ID
   ve Team ID güvenli şekilde girilmeli. `.p8` dosyası depoya eklenmez.
2. Firebase iOS app bundle ID ve `GoogleService-Info.plist` eşleşmeli. Firebase Cloud
   Messaging API açık olmalı. Functions runtime servis hesabının
   `cloudmessaging.messages.create` yetkisi bulunmalı; hata varsa IAM'de kontrol et.
3. `functions/src/index.ts` yeni callable/trigger'ları dışa aktarır.
   `./functions/node_modules/.bin/firebase deploy --only functions,firestore:indexes --project lociar-2f38c`
   öncesi mevcut deploy rehberindeki kimlik/secret kontrollerini uygula.
   `push_tokens.expires_at` ve `push_delivery_receipts.expires_at` TTL alanlarının
   etkinleştiğini kontrol et. İstemci erişimi mevcut default-deny kurallarında kalır.
4. Kaynak entitlement `aps-environment=development` içerir. İmzalanmış geliştirme
   uygulamasında `development`, dağıtım/TestFlight arşivinde `production` bulunmalı:
   Xcode signing/provisioning çıktısını kontrol et. Kaynak değeri tek başına arşiv
   doğrulaması değildir. Üretim App Check attestation da cihazda çalışmalı.

## Testler ve cihaz kabulü

`cd functions && npm run typecheck && npm test && npm run test:emulator` token
kaydı, Auth/App Check yapılandırması, cihaz sınırı, hesap değişimi, gönderim
girişimi dedup'ı, engelleme, geçersiz token ve hesap silme sözleşmelerini test eder.
`npm run test:rules` istemcinin token/teslimat belgelerine erişemediğini kontrol eder.
Emülatörde gerçek FCM gönderimi kapalıdır: FCM emülatörü bulunmadığı için testler
gerçek gönderim fonksiyonuna kontrollü bir gönderici enjekte eder. Üretim App Check
attestation ve gerçek APNs teslimi bu testlerle kanıtlanmaz.

Mac'te `LociARTests/BackendAndPolicyTests.swift` içindeki push testleri oturumdan
önce gelen token, kayıt dedup'ı, rotasyon/dil değişimi, hata sonrası yeniden deneme,
kayıt sırasında çıkış, gecikmiş oturum ve dokunma hedeflerini kapsar:

```sh
xcodebuild -project LociAR.xcodeproj -scheme LociAR \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  -only-testing:LociARTests/BackendAndPolicyTests test
```

Fiziksel iPhone'da iki doğrulanmış hesapla aşağıdaki sonuçları kaydet:

| Durum | Beklenen sonuç |
|---|---|
| Yeni kurulum / izin reddi | Açılışta izin istemez; profil CTA'sı ister; reddedince Ayarlar'a gider; sunucuda kayıt oluşmaz |
| İzin kabulü / token rotasyonu | Özel sunucu kaydı oluşur; aynı kurulumdaki eski token kaldırılır |
| Başka hesap beğeni / yorum / takip | Ön plan, arka plan ve soğuk açılışta APNs ulaşır; doğru hesaba ait post/aktivite açılır |
| Aynı olayın tekrar teslimi | Her token için tek FCM girişimi; okunmuş aktivite yeniden bildirim üretmez |
| Engelleme / hesap askıya alma / post kaldırma | Yeni aktivite bildirimi bastırılır |
| Çevrimiçi çıkış / hesap değişimi | Eski kayıt silinir; yeni token yeni hesaba bağlıdır; eski hedef uygulamada açılmaz |
| Çevrimdışı çıkış / daha önce kuyruğa alınmış APNs | Temizlik hatası ve genel OS uyarısı sınırı gözlemlenir; eski hesabın içeriğine yönlendirme olmaz |
| Ayarlar'dan izin kapatma / yeniden açma | Uygulamaya dönüşte kayıt temizlenir/yenilenir |
| Hesap silme / Apple iptal hatası | Başarıda kayıtlar silinir; iptal hatasında profil/token/hesap korunur |
| TestFlight | İmzalanmış `production` APNs entitlement ve gerçek teslim doğrulanır |

Linux bulut ortamı iOS derlemesi, Swift XCTest ve APNs cihaz kabulünü çalıştıramaz.
