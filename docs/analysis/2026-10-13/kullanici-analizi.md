# LociAR - Kullanıcı tarafından ayrıntılı analiz

13 Ekim 2026 | Güncel native iOS uygulaması | Kaynak: 6052dcd

## 1. Uygulama kullanıcıya ne sunuyor?

LociAR, gerçek bir yere dijital not bırakma ve o yerdeki notları keşfetme uygulamasıdır. İki ana deneyim vardır: haritaya konum notu bırakmak ve kamerada gerçek bir yüzeye AR paylaşımı sabitlemek. Bunlara beğeni, yorum, kaydetme, koleksiyon, profil, engelleme, raporlama ve izinli bildirimler eşlik eder.

Konum notu için mağaza kataloğundan işletme seçmek gerekmez. Kullanıcı o anda bulunduğu yeri ölçer, kısa metnini yazar ve orada yayınlar. AR paylaşımında ise kameranın orta hedefiyle bir yüzey seçilir; metin ve/veya bir GIPHY GIF'i o yüzeye yerleştirilir. Bu iki deneyim aynı şey değildir: GPS notu fiziksel duvara kilitli AR nesnesi sayılmaz.

![Kullanıcı özellik haritası](../../../output/pdf/images/01-kullanici-deneyimi.png)

Şema güncel özellikleri gösterir; uygulamanın gerçek ekran görüntüsü değildir. Mobil uygulama iOS içindir. Android sürümü, özel mesajlaşma, ödeme/ürün satın alma ve işletmelere açık ayrı bir marka portalı bu sürümde bulunmaz.

## 2. İlk girişten günlük kullanıma

İlk açılışta tanıtım ve kullanım koşullarıyla karşılaşılır. Kullanım koşullarını kabul etmek girişin bir parçasıdır. Giriş seçenekleri Apple, e-posta/şifre ve anonim devam etmektir. SMS girişi kapalıdır. Eski belgelerde geçen Google, e-posta magic link veya OTP seçenekleri güncel mobil özellik olarak sunulmamalıdır; mevcut Firebase adaptöründe magic link ve e-posta OTP desteklenmiyor.

Anonim devam etmek, gerçek bir Firebase anonim oturumu açar. Bu hesap uygulama içinde bir kimlik taşır; sunucuda kullanıcı profili ve sahiplik bilgisi vardır. Anonim hesabı Apple veya e-posta hesabına bağlama yolu mevcut kimliği korumayı amaçlar. Hesabı bağlamadan uygulama verilerini silmek veya yeni anonim oturum açmak eski hesaba geri dönüşü zorlaştırabilir; anonim hesap bir şifreli kurtarma hesabı gibi değerlendirilmemelidir.

Girişten sonra varsayılan açılış Harita'dır. Alt menüde AR, Harita, Paylaş, Keşfet ve Profil vardır. Kamera yalnız AR görüntüleme veya üretim için gerekir; giriş yapmak otomatik olarak kamerayı kullanmak anlamına gelmez.

| Alan | Kullanıcının yapabildiği | Dikkat edilmesi gereken |
|---|---|---|
| Harita | Yakındaki paylaşımları, konum notlarını ve yoğun noktaları görmek; not bırakmak | Konum doğruluğu ve internet sonuçları etkiler |
| AR | Yakındaki paylaşımı kamerada aramak ve görmek | Fiziksel yüzeyin tanınması cihaz, ışık ve çevreye bağlıdır |
| Paylaş | Yüzey seçip metin ve/veya tek GIPHY GIF'i yayınlamak | Normal AR yayınları varsayılan olarak moderasyona girer |
| Keşfet | Yerel konumdan bağımsız yayın listesini ve post önizlemesini açmak | Önizleme ile fiziksel AR kilidini çözmek farklı işlemlerdir |
| Profil | Kendi postları, aktivite, koleksiyonlar, kaydedilenler, davet, ayarlar ve engeller | Anonim postlar başkasının profilinde yazarı açığa çıkaracak şekilde listelenmez |

## 3. Konum notu bırakma deneyimi

Harita'daki Konum notu bırak eylemi ölçümü başlatır. Kullanıcı metnini yazarken konum hassaslaşır. Metin en fazla 220 karakterdir; bağlantı eklemek kabul edilmez. Not bir işletme veritabanına bağlanmak yerine ölçülen koordinatta tutulur.

Konum iyi ve tutarlıysa yayın yapılabilir. GPS belirsizliği 15 metreyi aşınca uygulama açıkça manuel pin onayı ister; kullanıcı ölçülen konumundan en fazla 50 metre uzağa pin taşıyabilir. Belirsizlik 50 metreyi aşarsa yayın reddedilir. Eski, tekrar gelen veya çelişen ölçümler daha hassas GPS varmış gibi sunulmaz. Kamerayla konum düzeltme seçeneği uygunsa Geospatial ölçümü kullanılabilir.

Konum notu metin filtresi, korumalı bölge ve yayın sınırlarını geçerse hemen görünür. Kapalı beta davet kapısı sunucu konfigürasyonunda açılmışsa yayın için davet kodu da gerekir; bu analiz bu isteğe bağlı flag'in canlı aktifliğini ayrıca sorgulamadı. Kullanıcının yeni notları sunucuda anonim üretilir. Notların kendiliğinden sona erme tarihi yoktur; admin ayrıca bitiş tarihi koyabilir veya notu kaldırabilir.

Ancak yayınlanmak ile bildirim için onaylanmak farklıdır. Varsayılan otomatik bildirim onayı, bir günden eski üç farklı uygun hesabın beğenisiyle oluşur; yazarın kendi beğenisi sayılmaz. Admin doğrudan bildirim onayı verebilir. Üç farklı açık rapor, varsayılan eşikte içeriği gizleyebilir ve bildirim onayını geri alabilir. Bu eşikler yönetilebilir ürün ayarlarıdır.

## 4. Mağaza örneği: ne zaman bildirim gelir?

Örnek: A kullanıcısı mağazadayken bir ürün için "Bu ürünün kalitesi düşük" diye anonim not bırakır. Not bildirim için onaylandıktan sonra B kullanıcısının yakınındaki bölge listesine girebilir. B'nin uygulama içi bildirim tercihi ve gerekli iOS izinleri açık olmalıdır.

Telefon yaklaşık 300-400 metrelik uyanma alanına girdiğinde uygulama hassas GPS kontrolünü başlatabilir. Bu mesafe bildirim mesafesi değildir. Asıl not alanı 15-100 metre yarıçaplıdır. Son konum ölçümünün belirsizliği kontrollü bir toleransla değerlendirilir.

B, notun GPS alanında geçerli ölçümlerle 10 saniye kaldığında sunucu en çok beğenilen, uygun ve bu hesaba daha önce bildirilmemiş notu seçer. Ölçümler arasındaki kesinti 5 saniyeyi aşarsa, kişi dışarı çıkarsa veya ölçüm geçersizleşirse teyit baştan başlar. Aynı not/hesap için kalıcı alındı kaydı oluşturulur; sonraki ziyaret aynı notu tekrar tetiklemez.

![Mağaza notu ve GPS teyidi](../../../output/pdf/images/02-magaza-notu.png)

Bu örnekte 10 saniye, mağazanın kapısından fiziksel giriş anından değil, ilk kabul edilmiş GPS ölçümünden başlar. Bildirime kadar ayrıca iOS çalışma izni, GPS'in hazır olması ve ağ/sunucu süresi vardır. Mağazanın kaldırımında veya komşu dükkanda bulunan kişi de aynı GPS alanında olabilir. GPS tek başına bina içini, kapıyı veya katı kesin olarak ayıramaz.

Bu nedenle mevcut uygulama için "her mağazaya girdikten 10-15 saniye sonra kesin bildirim" veya "2-5 metre nokta atışı" sözü verilemez. Böyle bir mağaza içi varlık kanıtı için ayrıca doğrulanmış bir yakınlık sinyali ve saha testi gerekir; bu sürümde beacon veya mağazaya kurulmuş başka donanım eklenmemiştir.

## 5. Yoğun bir yerde neden notun metni görünmeyebilir?

Bir noktada çok sayıda not varsa yoğun nokta mekanizması devreye girer. Varsayılan eşik 30 nottur. Kilitli yoğun noktadaki başka kişilere ait metin/GIF uzaktan açık verilmez; konum, sayı ve bazı özet bilgiler görünür. Bildirim "burada çok not var" şeklinde metinsiz olabilir.

Kullanıcı o konuma yaklaşır, Harita'da Burada aç veya Kamerayla aç eylemini kullanır. Varsayılan açma mesafesi 15 metredir; admin 2-50 metre arasında ayarlayabilir. Bu değer, normal konum notunun bildirim yarıçapı değildir. Başarılı açma 30 dakikalık erişim sağlar. Yazar kendi içeriğini okuyabilir. Küçük bir açma mesafesi seçmek telefon GPS'ini kendiliğinden daha hassas yapmaz.

## 6. AR paylaşımı nasıl çalışır?

Kullanıcı Paylaş veya AR üretim akışında kamerayı açar, uygun yüzeyi tarar ve orta hedefle Yüzeye sabitle eylemini kullanır. Normal sabitleme algılanmış düzlem geometrisini kullanır. Yaklaşık yerleştirme ayrıca seçilir ve yaklaşık olarak etiketlenir.

Editörde metin ve/veya bir GIPHY GIF'i kullanılır. Yeni fotoğraf, kendi videosu, çizim, sosyal medya bağlantısı veya başka URL ekleme yoktur. Profil fotoğrafı yüklemek ayrı bir özelliktir; bu yasak profil avatarını kapsamıyor. GIF anahtarı telefonda bulunmaz; arama ve doğrulama sunucudan yapılır.

Yayın önce yerel taslak/kuyruğa kaydedilir. Sunucu kabulü sonrası yayın durumu görünür. Normal AR paylaşımının varsayılan durumu pending_review'dur; yetkili moderasyon sonrasında active olur. Konum notunun hemen yayınlanma kuralı AR gönderilerine otomatik olarak uygulanmaz.

Başka bir cihaz aynı yere geldiğinde uygulama sırasıyla Cloud Anchor, Geospatial, eski ARKit dünya haritası ve son olarak yönlendirilmiş yaklaşık gösterimi dener. Kesin yüzeyi bulma ile yaklaşık göstermek kullanıcıya aynı başarı gibi sunulmaz. Gerçek AR sabitleme doğruluğu simülatör testiyle kanıtlanamaz.

## 7. Sosyal etkileşimler ve kişisel arşiv

Kullanıcı içeriği beğenebilir, yorum yazabilir, kaydedebilir, kendi koleksiyonuna ekleyebilir, normal profilleri takip edebilir ve aktivitesini okuyabilir. Yorum veya kullanıcı bildirilebilir; kendi yorumu ve uygun durumlarda kendi postundaki yorum kaldırılabilir. Anonim notun yazarını engelleme seçeneği, gerçek yazar kimliğini kullanıcıya göstermeden sunucuda engeli kurar.

Anonim içerikte yazar profil bağlantısı gösterilmez ve gerçek yazarın profil listesinden bu içerik üzerinden kimlik çıkarılması engellenir. Bununla birlikte anonim post yayınlamak tüm yorumları, takip ilişkilerini veya hesabı otomatik olarak anonim yapmaz. Yorum akışı kullanıcı kimliği/profil alanlarını kullanır; bu özellik ayrı bir anonim sohbet sistemi değildir.

Koleksiyonlar şu an kişisel arşivdir. Veride public alanı bulunabilse de Firestore kuralları koleksiyonu yalnız sahibine açar; herkese açık koleksiyon paylaşımı tamamlanmış özellik sayılmaz.

## 8. Anonimlik ve veri paylaşımı sınırı

Anonimlik diğer kullanıcılara karşı sunum ve erişim kuralıdır. Sunucu, sahiplik, moderasyon, engelleme ve hesap silme için gerçek creator_id bilgisini tutar. Herkese açık yanıtta bu alan gerçek yazar yerine post kapsamlı bir kimlik olarak verilir; handle gizlenir. Dünya haritasının kullanıcı klasörünü açığa çıkaran yol da herkese aktarılmaz.

Admin'in belirli bir kullanıcı adına oluşturduğu içerik farklıdır: görünen yazar seçilen kullanıcı olabilir; işlemi yapan admin ayrı denetim kaydındadır. Kullanıcının anonim not akışı ile bu yetkili içerik üretimini aynı anonimlik sözü altında toplamak doğru olmaz.

![Veri ve izin ayrımı](../../../output/pdf/images/03-gizlilik-ve-izinler.png)

| Veri/izin | Ne için kullanılır? | Admin ile paylaşım |
|---|---|---|
| Notun konumu | İçeriğin hangi yerde olduğunu göstermek | İçerik ve moderasyon kaydıyla ilişkili |
| Geçici giriş ölçümü | Yakındaki not/kampanya alanına giriş kontrolü | Admin'in son konum ekranını güncellemez |
| Konumumu yöneticilerle paylaş | Ön planda son ölçülmüş konum raporu | Ayrı, varsayılan kapalı tercih |
| Teknik ve kullanım verileri | Cihaz/uygulama sürümü, dil, kurulum ve kullanım bağlamı | Ayrı, varsayılan kapalı tercih |
| Bildirimler | Sosyal, konum notu ve yönetici uyarıları | İzinli gönderim; iOS izni ayrıca gerekir |
| Kampanyalar ve teklifler | Pazarlama/teklif deneyimi | Bildirimlerden ayrı, varsayılan kapalı tercih |

Son admin konumu kesintisiz takip değildir; ölçüm zamanı ve doğrulukla gösterilen son rapordur. Konum raporu 24 saat, teknik bağlam 30 gün sonunda erişimden düşer. Süre dolunca erişim reddedilir; fiziksel TTL temizliği daha sonra olabilir. Kullanıcı tercihini kapatınca ilgili paylaşım durur ve sunucu kayıtları temizlenir. Çevrimdışı tercih değişikliği sunucuyla eşleşene kadar paylaşım kapalı tutulur.

## 9. Kampanyalarda neler yapılabiliyor?

İzin veren kullanıcıya seçilmiş özel teklif atanabilir. Teklif haritada/AR'da gösterilebilir, hemen push ile gönderilebilir veya konuma geliş/gidiş için hatırlatılabilir. Kupon, şartlar, bitiş ve yol tarifi özel teklif kartında bulunabilir; kilit ekranına hassas kupon veya koordinat taşımak varsayılan tasarım değildir.

Bölge kampanyaları en fazla beş adımlı yolculuk kurabilir: alışılmış yerden çıkış, bölgeye giriş, bölgede kalma ve çıkış. Bölgeler daire veya çizilmiş sokak geometrisi olabilir; gün/saat, önceki adım, tekrar sıklığı ve kod kuralları vardır. Her kullanıcıya özel kod veya ortak kod verilebilir; kodu kullanılmış işaretleme admin işlemidir, otomatik satın alma kanıtı değildir.

Alışılmış yer cihaz üzerinde öğrenilir, sunucuya ev adresi etiketi olarak yüklenmez. Kampanyaları kapatmak bu yerel öğrenimi ve ilgili izlemeyi temizler. Bu bir işletmeye açık ayrı self-servis portalı değildir; taslak gönderme sunucu altyapısı vardır, ayrı marka istemcisi henüz yoktur.

## 10. Uygulama arka plandayken ve çevrimdışıyken

Normal arka plan veya kilit ekranı senaryosu için Her Zaman konum, Kesin Konum, iOS bildirim izni, uygulama bildirim tercihi ve uygun sistem çalışma koşulları gerekir. Konum notları için erken uyanma sonrası hassas ölçüm penceresi normalde en fazla 10 dakikadır; kişi alandan çıkınca veya işlem bitince sonlanır. iOS tarafından sonlandırılmış süreç, kullanıcı tarafından zorla kapatılmış uygulama ve sadece ana ekrana dönülmüş uygulama aynı durum değildir.

AR yayın taslaklarının kalıcı kuyruğu vardır. Oturum, bağlantı ve ön plan durumuna göre tekrar denenir. Buna karşılık konum notu oluşturma ve giriş bildirimi çevrimdışı garantili teslim sistemi değildir; sunucu kontrolü gerekir. Sunucu bir bildirimi kabul ettikten sonra süreç/ağ koparsa yerel uyarı kaybolabilir, aktivite kaydı kalır. Push göndericisinin kabulü de telefonun bildirimi gösterdiği veya kişinin okuduğu anlamına gelmez.

## 11. Kullanıcının güvenlik araçları

Raporlama, kimliği ifşa etmeden anonim yazar engelleme, engellenen hesap listesi, içerik moderasyonu, korumalı bölgeler ve 18+ engeli vardır. Kullanıcı kullanıcı adı ve profilini düzenleyebilir; kullanıcı adı değişimi sunucunun benzersizlik ve bekleme kuralına tabidir. Avatar ön ayarı seçilebilir veya profil fotoğrafı moderasyonla yayınlanabilir.

Hesap kalıcı silme akışı sunucudaki ilgili verileri, Storage nesnelerini ve Auth hesabını kaldırır. Apple ile bağlı hesapta Apple yetki iptali başarısızsa silme kabul edilmez. İşlem kabul edildikten sonra kesinti olursa sunucu işi kaldığı yerden sürdürebilir. Silme kabulü ile tüm fiziksel temizliğin anında bitmesi farklıdır.

Mobil metinler ve sunucu push metinleri 12 dili destekler. Admin arayüzünün tamamı için aynı 12 dil iddiası yoktur. Çökme raporlaması ayarlardan kapatılabilir. Gizlilik, koşullar ve destek sayfaları canlı admin alan adından sunulur.

## 12. Bugün doğrulananlar ve kalan sınır

| Kanıt | Sonuç | Neyi kanıtlamaz? |
|---|---|---|
| iOS native testleri | 156 geçti | Gerçek mağaza kapısı/GPS/AR doğruluğu |
| Functions entegrasyonu | 146 geçti | Gerçek cihazın APNs teslimi |
| Canlı anonim giriş | Firebase client SDK ile başarılı; geçici hesap silindi | Telefondaki App Attest uçtan uca akışı |
| Canlı servis envanteri | 58 aktif işlev, 32 aktif TTL, 23 hazır indeks, 6 açık görev; 0 eksik | Her gerçek kullanıcı yolunun fiziksel cihaz kabulü |
| Canlı web | App Hosting yayında, 24 masaüstü/mobil public test geçti | Gerçek sahibin TOTP ile tüm admin işlemlerini saha kabulü |
| iOS paket | İmzalı Release arşivi ve sembol yüklemesi başarılı | TestFlight/App Store yayını veya telefona kurulum |

Fiziksel iPhone testi kullanıcı isteğiyle sonraya bırakıldı. Mevcut telefona yeni yapı kurulmadı. 2-5 metre hassasiyet ve mağaza kapısından giriş sonrası her koşulda 10-15 saniyede bildirim iddiası doğrulanmış değildir.

## Kaynaklar

Analiz; MainTabView, AppRouter, AuthRepository, PlaceNoteComposer, LocationNotePolicy, PostPreviewView, ProfileView, AppSettingsView, SocialRepository, CampaignArrivalService, createPost/createPlaceNote, publicContent, anonymous, noteAutomation, counters, Firestore/Storage kuralları ve 13 Ekim dağıtım kanıtlarına dayanır. Ayrıntılı dosya/API eşleştirmeleri ayrı teknik rapordadır. Eski Expo/Supabase belgeleri güncel özellik kanıtı olarak kullanılmadı.

Platform davranış sınırı: https://developer.apple.com/documentation/corelocation/handling-location-updates-in-the-background

Son yayın ve test özeti: docs/release/LOCATION_ANONYMITY_FIXES_2026-10-13.md. Kaynak envanteri: docs/analysis/2026-10-13/source-inventory.json.
