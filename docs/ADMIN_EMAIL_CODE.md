# Yönetici e-posta koduyla giriş

16 Ekim 2026 ürün sahibi kararı: varsayılan admin girişi e-posta ve 6 haneli tek kullanımlık kod olur. Bu yol QR/TOTP istemez. E-posta tek faktördür; `email_code` oturumu MFA/AAL2 olarak gösterilmez. Eski Firebase e-posta bağlantısı ve TOTP yolu alternatif olarak korunur.

## Güvenlik ve veri

- Hesap ve mevcut yönetici rolü Firebase Auth/Firestore'dan doğrulanır; yeni hesap veya rol yaratılmaz. Bilinmeyen ve yetkisiz adreslere kod gönderilmez; HTTP başarı yanıtının biçimi aynıdır.
- Kriptografik rastgele 6 hane, 10 dakika süre, 5 yanlış deneme, 60 saniye yeniden gönderim aralığı; adres başına UTC saatte en fazla 5 istek. Kaynak ve genel gönderim limitleri de vardır.
- Kodun HMAC doğrulayıcısı Firestore'da, rastgele doğrulayıcı anahtar yalnız HttpOnly/Secure/SameSite Strict tarayıcı çerezindedir. Bu nedenle kod aynı tarayıcıdaki açık giriş ekranında kullanılır. Kod ve çerez birlikte tek kez tüketilir; eşzamanlı tekrar tek oturum yaratır. Yeni istek önceki kodu geçersiz kılar.
- Gönderici isteği kabul etmeden kod etkinleşmez; gönderim hatası giriş açmaz. Kabul, posta kutusuna teslim kanıtı değildir.
- 8 saatlik rastgele oturumun yalnız SHA-256 özeti Firestore'da tutulur. Aktif roller, Firebase hesabının silinmesi/devre dışı bırakılması, e-posta değişikliği, hesap silme çiti ve token iptal zamanı kontrol edilir. Çıkış yakalanmış çerezi de iptal eder.
- İzin, kullanıcı rızası, işlem nedeni, idempotency, oran sınırı ve audit kontrolleri korunur. Oturum oluşturma ve audit aynı transaction içindedir. İstemci SDK'ları üç yeni koleksiyona erişemez. TTL kayıtları ve hesap silme temizliği dahildir.
- Resend, yalnız giriş e-postasını gönderir. Kod ve alıcı bu hizmete iletilir; API anahtarı yalnız sunucuda kalır. API anahtarı/kod/alıcı sağlayıcı hata günlüklerine veya hata yanıtına yazılmaz.

## Canlı kurulum

1. Resend hesabını yönetici e-postasıyla aç. Hesap koşulları ve yeni API anahtarı oluşturma adımlarını hesap sahibi tamamlar. İlk testte `LociAR <onboarding@resend.dev>` yalnız Resend hesap sahibine gönderebilir. Diğer yöneticiler için kendi gönderici alan adını Resend'de doğrula ve `ADMIN_EMAIL_FROM` değerini güncelle.
2. Resend'de yalnız gönderim yetkili bir API anahtarı oluştur. Anahtarı sohbet mesajına veya kaynak dosyasına koyma. Mac terminalinde `python3 scripts/configure-admin-email.py` çalıştırıp gizli isteme yapıştır. Betik anahtarı stdin üzerinden `lociar-2f38c` Secret Manager'a kaydeder ve `lociar-admin` backend erişimini ayarlar; dağıtım yapmaz.
3. `admin/apphosting.yaml` içindeki `ADMIN_EMAIL_API_KEY` runtime Secret Manager referansıdır. Anahtar oluşturulmadan bu yapılandırmayla canlı dağıtım yapma.
4. Üç `expires_at` TTL politikası için Firestore indekslerini ve hesap silme temizliği için güncel Functions adayını yayımla. Ardından App Hosting adayını yayımla. Yerel test sonucu bu dağıtımların yapılmış olduğunu kanıtlamaz.
5. İzinli gerçek admin adresine kod iste, gelen kutusunda teslimi doğrula, kodla `/admin/dashboard` açıldığını ve QR istenmediğini kontrol et. Yanlış kod, tekrar kullanılan kod, çıkış ve rol sınırlarını da canlı kabulde gözle. Sonrasında Kağan iPhone'a gerçek admin push testine dön.

Hazır Firebase e-posta servisi sayısal kod yerine bağlantı gönderir: [Firebase email links](https://firebase.google.com/docs/auth/web/email-link-auth). Gönderici API'si: [Resend send email](https://resend.com/docs/api-reference/emails/send-email). Deneme alan adı sınırı: [Resend resend.dev restriction](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).

## 16 Ekim yerel kabul

**187 test geçti, sıfır başarısız/atlanan:** admin birim 35, admin entegrasyon 58, Firestore/Storage kuralları 84, hesap silme 10. Admin tip kontrolü ve production derlemesi başarılı. Gizli kurulum betiğinin mevcut/yeni Secret Manager kaydı yolları, gerçek bulut değişikliği yapmadan taklit alt süreçlerle sınandı; anahtar yalnız stdin'e verildi, argv'ye alınmadı.

HTTP kabulü yeni e-posta oturumuyla QR yönlendirmesi olmadan dashboard açılmasını ve yetkili adminin bildirim kuyruğu oluşturmasını doğruladı. Sağlayıcı çağrıları testte taklittir; gerçek posta kutusuna teslim, Resend hesap açılışı, canlı anahtar kaydı, dağıtım ve fiziksel iPhone push teslimi bu kabulün parçası değildir.

Toplu yerel kanıt: `build/admin-email-code-20261016/verification-final.json`. Resend hesabını açma/koşul kabulü ve yeni gönderim anahtarı oluşturma kullanıcı adımıdır; anahtar sohbet yoluyla istenmez.

## 16 Ekim canlı kabul

- Kullanıcının oluşturduğu yalnız gönderim yetkili anahtar, gizli stdin aktarımıyla Secret Manager'a kaydedildi; App Hosting çalışma hesabına erişim verildi. Kurulum betiğinin `--stdin` yolu da anahtarı argv veya normal geçici dosyaya yazmaz.
- Firestore indeksleri, `onAdminNotificationQueued`, `deleteAccount`, `retryAccountDeletions` ve App Hosting yayımlandı. `build-2026-10-16-001` READY, rollout SUCCEEDED. Üç e-posta koleksiyonunun TTL politikası ACTIVE olarak doğrulandı.
- Ürün sahibinin açık onayıyla kendi hesabına `super_admin` rolü verildi; rol ve audit aynı transaction içinde yazıldı. Giriş akışı kendiliğinden rol oluşturmaz.
- Gerçek giriş e-postası için Resend **Delivered** gösterdi. Kullanıcı posta kutusundaki kodla giriş yaptı; production `/admin/dashboard` sayfası **Super Admin / Email Code Verified** gösterdi. QR/TOTP istenmedi. Canlı audit kaydında `admin_sign_in` görüldü.
- Bu kabul, canlı yanlış kod/çıkış/tekrar kullanım testlerinin veya fiziksel APNs tesliminin yapıldığı anlamına gelmez; bunların yerel emülatör kanıtı ayrıdır. İlk gönderici `onboarding@resend.dev` hâlâ yalnız Resend hesap sahibine gönderebilir; başka yöneticiler için doğrulanmış alan adı gerekir.

Canlı ekran kanıtı: `build/admin-email-code-20261016/admin-live-dashboard.png`. API anahtarı, giriş kodu ve oturum çerezleri raporlara alınmadı.
