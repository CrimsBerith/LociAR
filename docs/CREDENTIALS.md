# İnceleme ve test hesabı parolaları

Parolaları Git'e, App Review Notes'a veya CI loglarına yazmayın. Daha önce depoda bulunan inceleme ve üretim test parolaları açığa çıkmış kabul edilmeli; canlı Firebase hesabında değiştirilmeli ve kullanılan parola yöneticisi ile App Store Connect güncellenmelidir. Dosyalardan kaldırma, Git geçmişindeki değerleri geçersiz kılmaz.

## Apple inceleme hesabını oluşturma / parolasını yenileme

Bu komut canlı hesaptaki parolayı değiştirir. Yetkili Firebase erişimi olan makinede, inceleme sırasında hesabın kullanılmadığı bir zamanda çalıştırın. Application Default Credentials veya makineye güvenli biçimde bağlanmış kimlik gerekir; anahtar dosyası depoya girmez.

1. `functions/` içinde `npm ci` çalıştırın.
2. Depo dışında bir dizin oluşturun: `mkdir -p "$HOME/.lociar-private" && chmod 700 "$HOME/.lociar-private"`.
3. Daha önce kullanılmamış bir dosya adı seçerek çalıştırın:

   ```sh
   FIREBASE_PROJECT_ID=lociar-2f38c \
   REVIEW_CREDENTIALS_FILE="$HOME/.lociar-private/apple-review.credentials.json" \
   node scripts/provision-review-account.mjs
   ```

Betik 256 bit rastgele parola üretir; JSON dosyasını yalnızca sahibinin okuyup yazabileceği `0600` izinleriyle, mevcut dosyanın üzerine yazmadan oluşturur. Depo içindeki yollar ve depoya yönelen sembolik bağlantılar reddedilir. Parola konsola yazılmaz. Dosya, uzak hesap değiştirilmeden önce oluşturulur; daha sonraki bir işlem başarısız olsa bile saklayın ve hesabın girişini doğrulayın.

4. Dosyayı yerel, güvenilir bir düzenleyicide açın; parolayı parola yöneticisine ve App Store Connect → App Review Information → Sign-In Information alanına aktarın. İnceleme notları sadece bu alana referans verir.
5. Yeni parolayla giriş yapıldığını doğruladıktan sonra geçici JSON dosyasını silin. Betik yeniden çalıştırılırsa yeni bir dosya adı kullanın.

Mevcut review hesabının parolası değiştirildiğinde refresh tokenları da iptal edilir. Kısa süreli,
önceden alınmış ID tokenları, token süresi dolana veya sunucu `checkRevoked` kontrolü yapana kadar
geçerli olabilir; parola değişimini tüm açık oturumların anında kapandığı şeklinde yorumlamayın.

## Mevcut diğer test hesabının parolasını yenileme

Depoda geçmişte kullanılan diğer test hesapları da yenilenmelidir. Yetkili GCP kimliğiyle,
`functions/` dizininde mevcut hesabı açıkça seçin ve yeni bir özel çıktı dosyası kullanın:

```sh
FIREBASE_PROJECT_ID=lociar-2f38c \
ACCOUNT_EMAIL='<mevcut-test-hesabi>' \
REVIEW_CREDENTIALS_FILE="$HOME/.lociar-private/test-account-rotation.credentials.json" \
node scripts/rotate-account-password.mjs
```

Betik bulunamayan hesabı yeniden oluşturmaz; mevcut profil, roller ve custom claim'leri korur.
Parola değiştikten sonra refresh tokenlarını iptal eder. Özel dosya uzak değişiklikten önce oluşturulur;
eski bir dosya yoluyla tekrar çalışma hesabı değiştirmeden reddedilir.
Eski parolanın reddedildiğini ve yeni parolayla girişin çalıştığını doğrulayın, kullanılan parola
yöneticisini/test cihazlarını güncelleyin. Bu davranış emülatörde test edilmiştir; canlı rotasyon bu oturumda yapılmadı.

Bu yönetilen ortamda GCP bağlantısı tanımlı değilse önce güvenli ortam ayarlarından yetkili kimlik
bağlanmalıdır. Platform/bootstrap credential dosyası kullanıcıya ait Firebase yetkisi sayılmaz;
credential içeriğini sohbete veya Git'e taşımayın.

## Fiziksel cihazda üretim testleri

`scripts/.prod-email.txt` makineye özel e-posta adresini içerir ve Git tarafından yok sayılır. Üretim test betikleri `TEST_RUNNER_E2E_PASSWORD` yoksa yapılandırmayı ve önceki test çıktısını değiştirmeden durur. macOS Bash terminalinde parolayı gizli girişle alın:

```sh
read -r -s -p 'Test hesabı parolası: ' TEST_RUNNER_E2E_PASSWORD
printf '\n'
export TEST_RUNNER_E2E_PASSWORD
bash scripts/run-device-e2e-prod.command
unset TEST_RUNNER_E2E_PASSWORD
```

Devam testleri için aynı yöntemle `scripts/run-device-e2e-prod-rest.command` kullanılır. Betikler canlı veriyi oluşturabilir ve test hesabını silebilir; ayrılmış test hesabı ve bağlı iPhone gerekir. Parolayı komut satırına literal olarak yazmayın; shell tracing (`set -x`) kullanmayın. Emülatör cihaz betiği her çalıştırmada yeni test parolası üretir.

## Depo ve CI taraması

`bash scripts/qa-secret-scan.sh`, Git'in izlediği ve yeni, yok sayılmayan dosyaları tarar. Markdown ve test dosyaları dahildir. Kontroller inceleme parolası biçimi, literal parola/token atamaları, Markdown parola alanları, tam PEM özel anahtarları, service-account JSON işareti, GitHub tokenları, AWS erişim anahtarı kimlikleri ve izlenen credential dosyalarını kapsar. Bulgu çıktısı yalnızca dosya, satır ve kural adını içerir; değerleri yazmaz. Yer tutucular (`<...>`, `YOUR_...`, `ci-placeholder`, emülatörün `fake-api-key` değeri) ve ortam değişkeni referansları kabul edilir.

```sh
node --test scripts/test/*.test.mjs
bash scripts/qa-secret-scan.sh
```

CI aynı kontrolleri zorunlu olarak çalıştırır. Bu tarama çalışma ağacını kontrol eder; Git geçmişini taramaz ve her sağlayıcının tüm credential biçimlerini tanımaz. Daha önce yayınlanmış değerlerin geçersiz kılınması ayrıca gereklidir.
