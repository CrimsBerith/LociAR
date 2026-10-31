# Crash ve hata izleme

LociAR, iOS çökmeleri için Firebase Crashlytics, sunucu hataları için mevcut Cloud Logging kayıtları ve
Cloud Monitoring e-posta uyarılarını kullanır. Harici ücretli SDK, yeni zamanlayıcı veya özel metrik gerekmez.
iOS crash e-postası için Crashlytics'in Cloud Logging bağlantısı ayrıca açılır; alarm politikasının varlığı
bu bağlantının açık olduğunu kanıtlamaz.

## iOS

- `AppContainer`, Firebase yapılandırıldıktan sonra `CrashReportingPreference` uygular. Varsayılan açık;
  Profil → Ayarlar → Çökme raporları kapatılabilir. Başlangıçta Info.plist otomatik toplamayı kapalı tutar.
  Tercih SDK'ya iletilir ve kapalıyken bekleyen raporlar için silme istenir. SDK'nın toplama tercihi sonraki
  açılışta tam uygulanır; hâlihazırda gönderilmiş veriler bu ayarla geri alınmaz.
- Fatal çökmeler SDK tarafından yakalanır. Yükleme için uygulamanın yeniden açılması ve internet gerekir.
- `DiagnosticsReporter` callable servis hataları/bozuk yanıtlar, push, bölge izleme ve ARCore oturum başlangıcı
  için kontrollü nonfatal kayıtları toplar. Her kategori 5 dakikada en fazla bir, süreç başına toplam 8 kayıt.
  Bu sınır fatal çökmelere uygulanmaz. Çevrimdışı kullanım, iptal, yetki/validasyon/kota retleri ve bilinen
  servis-duraklatma/işlem-devam-ediyor yanıtları nonfatal kayıt oluşturmaz.
- Eklenen nonfatal kayıtlarda yalnız sabit bileşen/hata sınıfı vardır. Ham error/userInfo, hesap kimliği,
  e-posta, koordinat, not/yorum metni, URL, token veya istek gövdesi aktarılmaz. Crashlytics'in kendi cihaz,
  uygulama sürümü, stack ve rastgele kurulum kimliği verileri gizlilik metninde açıklanır.
- Firebase Analytics breadcrumbs, kullanıcı kimliği ataması, oturum kaydı/video veya BigQuery export eklenmez.

## Semboller ve dağıtım

`scripts/upload-crashlytics-symbols.sh` Firebase'in sabitlenmiş Swift paketindeki resmi yükleyiciyi kullanır.
Normal Release cihaz/simülatör build'i ağ hatasında uyarı verir. **Arşivde (`ACTION=install`) eksik/yüklenemeyen
sembol build'i başarısız yapar**. Harici paket klasörü kullanılırsa aynı yolu build ayarı olarak geçir:

```sh
xcodebuild ... -clonedSourcePackagesDirPath "$packages" \
  LOCIAR_SOURCE_PACKAGES_DIR="$packages" archive
```

Süre sınırı 120 saniyedir; hata sonrası dSYM korunur. El ile yeniden yüklerken `CONFIGURATION=Release`,
`LOCIAR_FIREBASE_GOOGLE_APP_ID`, `LOCIAR_SOURCE_PACKAGES_DIR`, `DWARF_DSYM_FOLDER_PATH`,
`DWARF_DSYM_FILE_NAME` ve `LOCIAR_CRASHLYTICS_REQUIRE_UPLOAD=1` ayarlarıyla aynı betiği çalıştır.
Yeni kaynak kodu eski IPA'yı değiştirmez; yeni arşiv/export gerekir.

## Sunucu e-postası

`scripts/setup-diagnostics-monitoring.py --email ADRES` yalnız plan gösterir. `--apply` mevcut gcloud
oturumuyla bir e-posta kanalı ve üç log eşleşmesi politikası kurar; sonra API'den yeniden okuyup doğrular.
Yalnız `lociar_diagnostics=v1` politikalarını değiştirir; diğer alıcı/politika/bütçe/yetkilere dokunmaz.

- `account_cleanup`: Apple iptali, hesap/medya/anchor silme hataları veya ertelemeleri ve kill switch.
- `server_errors`: kalan `cloud_run_revision` `severity>=ERROR` kayıtları; ayrıca Cloud Run'ın `WARNING`
  seviyesinde yazdığı `httpRequest.status=429` + `no available instance` kapasite hatası. Sıradan uygulama
  kota/validasyon retleri bu ek koşulla kapsanmaz.
- `ios_fatal`: `firebasecrashlytics.googleapis.com/events` logunda yalnız `com.khankartal.lociar`, `IOS`,
  `jsonPayload.issue.errorType=FATAL`. Veri kaynağı Firebase → Project settings → Integrations → Cloud Logging
  → Link ile açılır. Yalnız LociAR iOS seçilir, **Include sessions kapatılır**; her açılış yerine crash/diagnostic
  verisi aktarılır. Bağlantı açılıp gerçek kayıt görülmeden iOS e-posta hattı tamamlandı sayılmaz.
  [Resmi kurulum](https://firebase.google.com/docs/crashlytics/cloud-logging-export).

Tek eşleşme incident açar. Politika başına bildirimler 3600 saniye ile sınırlı; otomatik kapanma 24 saat.
Özel kullanıcı/içerik etiketi çıkarılmaz. E-posta teslimi ayrı doğrulanır; API'de kanal/politika bulunması
gelen kutusuna teslim kanıtı değildir. Spam klasörü ve Google'ın olası kanal doğrulama isteği kontrol edilir.

Teslim sorunu olduğunda önce Monitoring API `projects/{project}/alerts` ile yönetilen politikanın gerçekten
alarm açtığı doğrulanır. Sonra `stackdriver_notification_channel` / `notification_channel_events` hata
kayıtlarına bakılır. Alarm var ve hata kaydı yoksa bu yine SMTP teslim kanıtı değildir. Posta sağlayıcının
gelen teslim kayıtlarında alıcı, olay saati ve Google'ın belgelenmiş göndereni `alerting-noreply@google.com`
aranır. Hostinger için Email Logs → Delivery → Inbound kullanılır. Genel spam koruması kapatılmaz.

Crashlytics'in **yerleşik e-postaları ayrıdır**: Firebase → Project settings → Alerts → Crashlytics.
Yeni fatal, regressed ve velocity uyarıları seçilir; her nonfatal için e-posta açmak gürültü oluşturabilir.
Firebase bu tercihleri proje üyesinin Google hesabına bağlar; sırf e-posta almak için destek adresine geniş
proje yetkisi verilmez. Destek adresine doğrudan gönderim için yukarıdaki `ios_fatal` politikası ve
Cloud Logging bağlantısı kullanılır. Google 2 Adımlı Doğrulama panel erişimi için zorunludur.

## Maliyet sınırları (27 Ekim 2026)

- [Firebase Crashlytics ücretsizdir](https://firebase.google.com/pricing).
- [Cloud Logging](https://cloud.google.com/products/observability/pricing): proje başına aylık ilk 50 GiB
  ücretsiz, 30 güne kadar saklama dahil; aşan kayıt hacmi $0.50/GiB. 30 gün üzeri saklama ayrıca ücretlenir.
- Cloud Monitoring alarm ücretlendirmesinin ilan edilen başlangıcı en erken 1 Eylül 2027'dir. Fiyatları
  o tarihten önce tekrar kontrol et. Bu kurulum metrik üretmez. Crashlytics bağlantısı açılırsa onun kayıtları
  da aynı 50 GiB ücretsiz proje kotasını tüketir; sessions export açılmamalıdır. BigQuery export gerekmez.
- Bu yalnız izleme maliyetidir. Firebase Functions, Firestore, App Hosting, Storage ve diğer servislerin
  uygulama kullanım maliyetini sıfırlamaz; bütçe uyarısı da harcamayı durduran bir üst sınır değildir.

## Kabul kanıtları

Yerel sınıflandırma/redaksiyon/opt-out/tekrar sınırı testleri, dSYM yükleme ve canlı politika read-back ayrı
kaydedilir. Gerçek crash teslimi için Debug deneme build'inde Xcode debugger bağlantısını kesip kontrollü
test crash oluştur, uygulamayı yeniden aç, Firebase panelinde doğru build + çözümlenmiş stack'i gör.
E-postanın alındığını ayrıca doğrula. Test için gerçek kullanıcı hesabı, not veya konum ekleme.
