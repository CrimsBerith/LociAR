# Aktivite okundu durumu ve hesap silme

## Aktivite davranışı

Aktivite ekranı açılınca yüklenen sayfadaki en fazla 50 okunmamış kayıt okundu
işaretlenir. Push'a dokunmak, mevcut hesaba ait hedef açıldığında o aktivite için
aynı işlemi başlatır. APNs'ye önceden aktarılmış bildirimler geri çekilmez.

Gerçek Firestore belge kimliği korunur: örneğin `like_<post>_<luid>` bir UUID'ye
dönüştürülmez. `markActivityRead({activityIds, userId})` callable'ı `us-central1`
bölgesinde, üretimde App Check ve Firebase Auth ile çalışır. `userId` Auth UID'den
hesaplanan luid ile eşleşmelidir; kimliğin kaynağı istemci alanı değildir.

Sunucu 1–50 geçerli belge kimliğini kabul eder, tekrarları ayıklar, tüm mevcut
belgelerin alıcılarını transaction içinde doğrular. Bir belge başka kullanıcıya
aitse bütün işlem reddedilir; hiçbir kayıt kısmen güncellenmez. TTL/hesap silme
nedeniyle yok olmuş belge oluşturulmaz ve kalan sayfanın işaretlenmesini bozmaz.
Yalnız `read_at` yazılır; ilk okuma zamanı tekrar/eşzamanlı çağrılarda korunur.

İstemci yalnız sunucunun döndürdüğü zaman damgalarıyla okunmamış göstergesini
kaldırır. Hata durumunda gösterge korunur ve tekrar deneme sunulur. Eski oturum
veya daha eski yükleme isteğinin yanıtı yeni ekran state'ine uygulanmaz. Push
dokunmasındaki kayıt başarısızsa sonraki Aktivite yüklemesi yeniden deneyebilir.

`activity_events` istemciden yalnız alıcısına okunabilir; **tüm doğrudan yazmalar
reddedilir**. Okundu bilgisi dahil tüm yazılar sunucudan yapılır. Dağıtımda yeni
callable ve güncel kurallar birlikte alınmalıdır. Yeni iOS sürümü callable'ı
bulamadığında doğrudan Firestore yazmasına geçmez.

## Silme öncesi kimlik doğrulama

Profil → Hesabı kalıcı olarak sil → Devam et ayrı bir doğrulama ekranı açar.
Önizleme oturumlarında silme kapalıdır. Seçilen yöntem mevcut Firebase kullanıcısının
provider bilgisine göre belirlenir:

- E-posta/parola: SecureField mevcut parolayı ister. Firebase
  `User.reauthenticate(with:)` aynı kullanıcının e-posta credential'ı ile çağrılır.
  Parola uygulama state'i/istek belleği dışına kaydedilmez; gönderimde ve ekran
  kapanışında alan temizlenir. `deleteAccount` payload'ına parola gönderilmez.
- Apple: tek Apple authorization isteği yeni rastgele nonce'un SHA-256 özetini
  kullanır. Yanıttaki identity token + raw nonce ile **Firebase yeniden doğrulaması**
  yapılır. Aynı yanıttaki authorization code sunucuya iptal için iletilir. Apple
  bağlantılı parola hesapları da Apple yolunu izler.
- Diğer provider'lara örtük geçiş yapılmaz; uygulamanın mevcut desteklenen
  yöntemleri Apple ve e-posta/paroladır.

Başarılı yeniden doğrulamadan sonra ID token zorla yenilenir ve `deleteAccount`
çağrılır. Her aşamada aynı kullanıcının oturumu kontrol edilir; yeni istemci
payload'ında beklenen `userId` de bulunur. Sunucu uyuşmazlığı `session_changed`
ile, eski `auth_time` değerini `reauth_required` ile reddeder. `userId` alanı
eskiden gönderilmediğinden sunucu eski istemciler için yokluğunu kabul eder;
mevcut iOS akışı daima gönderir. Kimlik hâlâ Auth UID'den türetilir.

Sunucunun **son 5 dakika** şartı korunur. Yeni Apple code almak tek başına bu
şartı sağlamaz; ID token yenilemek de yeniden doğrulamanın yerine geçmez.
Apple token iptali başarılı olmadan profil siliniyor olarak işaretlenmez veya
hesap verileri silinmez. Yanlış parola, Apple sheet iptali/geçersiz yanıtı,
token yenileme hatası ve oturum değişiminde silme çağrısı başlatılmaz.
Apple revocation hatası sunucudan dönerse hesap korunur.

İstemcinin delete callable zaman aşımı sunucudaki 300 saniyeyle uyumludur.
Sunucuya silme isteği gönderildikten sonra ekranı kapatmak işlemi geri alamaz;
doğrulama/silme sürerken ekran kapatma devre dışıdır. Ağ zaman aşımı veya silme
sırasındaki genel backend hatası tam geri alma garantisi vermez; sonucu oturum
ve sunucu verisiyle kontrol etmek gerekir.

## Kalıcı silme işi ve hatadan sonra devam

Yeni backend, fresh-auth ve Apple iptali başarılı olduktan sonra tek transaction
içinde `account_deletion_jobs/{luid}` işini oluşturur ve mevcut profili siliniyor
olarak işaretler. Apple reddi, eski oturum veya yanlış `userId` bu işi oluşturmaz.
İş profilden bağımsızdır: Storage/Auth hatasından sonra profil kaldırılmış olsa
bile `ensureProfile` hesabı yeniden oluşturamaz. Firestore yazma yolları kalıcı
iş kaydını kontrol eder; callables ve ilgili trigger'lar da aynı transaction
içinde bu engeli okur. Storage, iki Firestore belge okuma sınırı nedeniyle,
aynı işlemlerle güncellenen server-only `account_access/{luid}.state` kaydını
okur. `active` yükleme/silme izni verir; `suspended`, `deleting`, `done` veya
eksik kayıt yazmayı reddeder. İkinci belge okuması avatar slotuna veya süresi
dolmuş AR taslağının reclamation kaydına ayrılır. `ensureProfile`, silme kabulü
ve bitişi erişim kaydını atomik günceller; askıya alma işlemi de aynı transaction
içinde günceller. Profil trigger'ı eski backend profil değişikliklerini mevcut
profil + silme işi kontrolüyle eşitler.

Firestore silmeleri 300 kayıtlık, sonucu mutlaka beklenen atomik batch'lerdir.
Kalıcı bir yazma hatasında Storage/Auth aşamasına geçilmez. Başarılı sayfalar
tekrarlandığında güvenle boş bulunur; kalan sayfalar sonraki denemede temizlenir.
Moderasyon raporları kimliksizleştirilir, yöneticilik rolleri ve kişiye ait
davet kayıtları kaldırılır; değişmez yönetim denetim kayıtları korunur.
Google anchor silme hataları mevcut kalıcı anchor kuyruğuna aktarılır.

Tek worker 10 dakikalık bir lease alır; ikinci worker aynı işi yürütmez. İş
240 saniyelik bütçeye ulaştığında lease'i bırakıp devam etmek üzere kaydeder.
Çökme durumunda lease süresi dolduktan sonra alınabilir. `retryAccountDeletions`
beş dakikada bir, oturum gerektirmeden, en fazla iki işi çalıştırır; geçici
hatalar 2–60 dakika aralığında geri çekilir. Storage temizlenmeden Auth
kaldırılmaz ve Auth kaldırıldıktan sonra Storage ikinci kez taranır.

İki taramadan sonra tamamlanan, önceden yetkilendirilmiş bir yükleme veya avatar
kopyası için `onDeletedAccountObjectFinalized` Storage finalization trigger'ı
kalıcı silme işi/erişim engelini yeniden kontrol eder. Bilinen LociAR klasörlerinde
silinen hesaba ait nesneyi yalnız event'in tam generation değeriyle siler. Eski
generation için 404/412 zararsızdır; Firestore/Storage geçici hataları retry
edilir. Aktif/askıya alınmış hesaplar ve bilinmeyen klasörler korunur. Tamamlanmış
işte `next_at` olmaması geç gelen nesneyi temizleme fırsatını kaybettirmez.

Başarıda callable yine `{ok: true}` döndürür. İş kabul edilip tamamlanamazsa
`unavailable` + `details.reason: deletion_pending` döner; sunucu otomatik devam
eder. Native ekran isteğin alındığını ve arka planda süreceğini 12 dilde gösterir,
aynı ekranda yeniden credential istemeyi kapatır ve Kapat eylemini sunar. Apple kullanıcıları için
kabul edilmiş bir iş tekrarında tek kullanımlık Apple code yeniden iptal
edilmez; yeni bir silme kabulünde beş dakikalık yeniden doğrulama şartı korunur.
Admin rol/davet ve MFA gözlem state kayıtları da silinir.
Tamamlanan işte Firebase UID silinir, `status: done` ve minimal çalışma
zamanları/sayaçları kalır. `account_access` yalnız `{state: done}` tutar.
Kalıcı LUID belge kimliği eski token'ın profil oluşturmasını engeller; istemci
iki koleksiyonu da okuyamaz veya değiştiremez. Bu operasyonel engellerde TTL
kullanılmaz; silinen kamu/özel profil veya Auth kaydı tutulmaz.

Bu davranışın canlıya geçmesi için `deleteAccount`, `retryAccountDeletions`,
`onDeletedAccountObjectFinalized`, diğer guard kullanan Functions ve iki güvenlik
kuralı birlikte dağıtılmalıdır.
Scheduler oluşturma/çalıştırma IAM ve Blaze gereksinimleri yayında doğrulanır;
emülatör testleri zamanlanmış mantığı doğrudan çağırır.

## Canlıya geçiş sırası

Storage kuralları açılmadan önce mevcut profillerin erişim kayıtları hazırlanır.
`functions/scripts/backfill-account-access.mjs` varsayılan olarak yalnız
okur ve toplamları gösterir; kullanıcı kimliği/e-posta/credential yazdırmaz:

```sh
node functions/scripts/backfill-account-access.mjs --gcloud-configuration=lociar-release
# Salt okunur rapor değerlendirildikten sonra, yetkili makinede:
node functions/scripts/backfill-account-access.mjs --gcloud-configuration=lociar-release --apply
```

Yönetilen ortamda belirtilen isim OIC metadata'sındaki tek bir GCP bağlantısıyla
eşleşmelidir; bootstrap ADC kimliği örtük olarak kullanılmaz. Yerel emülatör
modu yalnız açık `FIREBASE_PROJECT_ID=demo-*` ve loopback Firestore adresini
kabul eder. Her profil tekrar transaction içinde okunur: silme işi varsa aktif
erişim oluşturulmaz; askıya alınan/silinmiş profil yeniden etkinleştirilmez.
Geçişte Functions, backfill ve kurallar aynı bakım penceresinde tamamlanır;
silme işlemleri geçiş süresince başlatılmadan bütün bileşenler doğrulanır.
Canlı backfill veya dağıtım bu yerel çalışma sırasında çalıştırılmadı.
Storage finalize trigger'ının Eventarc/Cloud Storage service-agent ve Pub/Sub
izinleri de canlı geçişte doğrulanır. Emülatör handler testleri bu canlı IAM veya
Eventarc teslimatı/retry mekanizmasını doğrulamaz.

## Test ve yayın kabulü

```sh
cd functions
npm run typecheck
npm test
npm run test:emulator
npm run test:rules
```

Emülatörler okunma kalıcılığını, kimlik/sahiplik, toplu işlemin atomik reddi,
50 kayıt sınırını, tekrarda ilk zamanın korunmasını ve okunmuş aktivitenin yeni
push girişimini engellemesini test eder. Parola/Apple credential ile gerçek
Firebase Auth emülatörü yeniden doğrulaması `auth_time` yenilemesini kontrol eder;
Apple token/revoke endpoint'leri kontrollü yerel stub'dır. Bu gerçek Apple
servisine veya iOS credential/delegate çalışmasına dair kanıt değildir.

Mac'te native unit testler (eklenen 13 senaryo ve mevcut regresyonlar):

```sh
xcodebuild -project LociAR.xcodeproj -scheme LociAR \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  -only-testing:LociARTests/BackendAndPolicyTests test
```

Emülatörle iOS `testEmulator09DeleteAccount` artık parola alanına bilinen E2E
credential'ını girerek yeniden doğrulama ekranını kullanır. E2E ortamının özel
test hesabı dışında kullanılmamalıdır; canlı hesap silme bu çalışma kapsamında
çalıştırılmadı.

| Cihaz kabulü | Beklenen sonuç |
|---|---|
| Aktivite aç → kapat → tekrar yükle | Yüklenen kayıtların okunmamış göstergeleri sunucu onayından sonra kalkar ve geri gelmez |
| Çevrimdışı okundu kaydı → tekrar dene | Başarısız kayıt okunmuş gibi gösterilmez; bağlantı gelince kalıcı kaydedilir |
| Push'a dokunma / soğuk açılış | Doğru hesap/hedef açılır; gerçek aktivite kimliği okundu kaydına gider |
| Ekran yüklenirken hesap değişimi | Eski yanıt ve eski kayıt isteği yeni hesabın state/verisini değiştirmez |
| 5 dakikadan eski parola oturumu | Mevcut parola doğrulanır; oturumdan çıkmadan hesap silinir |
| Yanlış parola / doğrulamadan vazgeçme | Hesap ve veriler korunur |
| 5 dakikadan eski Apple oturumu | Nonce'lu Apple yanıtı Firebase reauth'a gider; token yenilenir, sunucu Apple iznini iptal eder ve hesabı siler |
| Apple sheet iptali / geçersiz yanıt / revocation hatası | Hesap korunur ve uygun yerel dilde hata/iptal durumu gösterilir |
| Arka plana geçiş / bağlantı kaybı / büyük hesap | İşlem sırası, hata ve 300 saniyelik timeout davranışı cihazda doğrulanır |
| Arapça, uzun Almanca, Dynamic Type, VoiceOver | Yeni ekran, parolanın gizliliği, butonlar ve okunmamış etiketi erişilebilir kalır |

Yeni aktivite/silme metinleri 12 dilde katalogdadır; tüm uygulamanın yerelleştirme
eksikleri bu iki akıştan ayrı olarak devam eder. `generate-translations.mjs` artık
depo içindeki katalog yolunu kullanır ve sonradan eklenen anahtarları korur.
