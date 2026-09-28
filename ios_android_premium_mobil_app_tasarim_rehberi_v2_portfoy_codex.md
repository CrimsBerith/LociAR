# iOS / Android Mobil Premium Uygulama Tasarım Rehberi

> **Sürüm:** 2.0 — Portföy / Codex Edition  
> **Güncelleme tarihi:** 21 Temmuz 2026  
> **Kapsam:** iPhone, iPad, Android telefon, tablet, katlanabilir cihazlar; native ve cross-platform uygulamalar; 16 uygulamalık ürün portföyü  
> **Amaç:** Görsel olarak güçlü, güven veren, hızlı, erişilebilir, ölçeklenebilir ve gelir üretmeye hazır mobil uygulamalar tasarlamak; aynı kaliteyi 16 uygulamada Codex ile tekrar üretmek  
> **Hedef kitle:** Kurucu, ürün yöneticisi, UI/UX tasarımcısı, mobil geliştirici, marka tasarımcısı ve Codex / yapay zekâ destekli geliştirme yapan ekipler

---

## İçindekiler

### Bölüm A — Temel ürün ve tasarım sistemi

0. [Bu rehberi 16 uygulamada kullanma modeli](#0-bu-rehberi-16-uygulamada-kullanma-modeli)
1. [Yönetici özeti](#1-yönetici-özeti)
2. [Premium uygulama ne demektir?](#2-premium-uygulama-ne-demektir)
3. [Tasarımdan önce cevaplanması gereken sorular](#3-tasarımdan-önce-cevaplanması-gereken-sorular)
4. [iOS ve Android için platform stratejisi](#4-ios-ve-android-için-platform-stratejisi)
5. [Bilgi mimarisi ve kullanıcı akışları](#5-bilgi-mimarisi-ve-kullanıcı-akışları)
6. [Premium tasarımın temel ilkeleri](#6-premium-tasarımın-temel-ilkeleri)
7. [Görsel tasarım sistemi](#7-görsel-tasarım-sistemi)
8. [iOS tasarım gereksinimleri](#8-ios-tasarım-gereksinimleri)
9. [Android tasarım gereksinimleri](#9-android-tasarım-gereksinimleri)
10. [Ortak bileşenler ve platform farklılıkları](#10-ortak-bileşenler-ve-platform-farklılıkları)
11. [Hareket, mikro etkileşim, haptik ve ses](#11-hareket-mikro-etkileşim-haptik-ve-ses)
12. [Onboarding, giriş ve hesap oluşturma](#12-onboarding-giriş-ve-hesap-oluşturma)
13. [İzin isteme deneyimi](#13-izin-isteme-deneyimi)
14. [Yükleniyor, boş, hata ve offline durumları](#14-yükleniyor-boş-hata-ve-offline-durumları)
15. [Formlar ve veri girişi](#15-formlar-ve-veri-girişi)
16. [Arama, keşif ve kişiselleştirme](#16-arama-keşif-ve-kişiselleştirme)
17. [Premium abonelik ve paywall tasarımı](#17-premium-abonelik-ve-paywall-tasarımı)
18. [Erişilebilirlik ve kapsayıcılık](#18-erişilebilirlik-ve-kapsayıcılık)
19. [Gizlilik, güvenlik ve güven tasarımı](#19-gizlilik-güvenlik-ve-güven-tasarımı)
20. [Performans ve algılanan hız](#20-performans-ve-algılanan-hız)
21. [Design system ve token mimarisi](#21-design-system-ve-token-mimarisi)
22. [Figma dosya yapısı](#22-figma-dosya-yapısı)
23. [Tasarım-geliştirme teslim süreci](#23-tasarım-geliştirme-teslim-süreci)
24. [Yerelleştirme ve küresel tasarım](#24-yerelleştirme-ve-küresel-tasarım)
25. [Analitik ve deney altyapısı](#25-analitik-ve-deney-altyapısı)
26. [App Store ve Google Play ürün sayfaları](#26-app-store-ve-google-play-ürün-sayfaları)
27. [Test stratejisi](#27-test-stratejisi)
28. [Proje aşamaları ve teslimatlar](#28-proje-aşamaları-ve-teslimatlar)
29. [Ekran spesifikasyon şablonu](#29-ekran-spesifikasyon-şablonu)
30. [Premium kalite puanlama sistemi](#30-premium-kalite-puanlama-sistemi)
31. [Yayın öncesi kontrol listeleri](#31-yayın-öncesi-kontrol-listeleri)
32. [Sık yapılan hatalar](#32-sık-yapılan-hatalar)
33. [AI/Codex için uygulanabilir promptlar](#33-aicodex-için-uygulanabilir-promptlar)
34. [30-60-90 günlük uygulama planı](#34-30-60-90-günlük-uygulama-planı)
35. [Resmî kaynaklar](#35-resmî-kaynaklar)

### Bölüm B — 16 uygulamalık portföy ve üretim sistemi

36. [Çoklu uygulama portföy mimarisi](#36-çoklu-uygulama-portföy-mimarisi)
37. [Premium bileşen sözleşmeleri](#37-premium-bileşen-sözleşmeleri)
38. [Ekran ve akış pattern kütüphanesi](#38-ekran-ve-akış-pattern-kütüphanesi)
39. [Adaptive tasarım: tablet, foldable ve yeniden boyutlandırma](#39-adaptive-tasarım-tablet-foldable-ve-yeniden-boyutlandırma)
40. [Premium görsel yön ve marka mimarisi](#40-premium-görsel-yön-ve-marka-mimarisi)
41. [Content design ve mikro metin sistemi](#41-content-design-ve-mikro-metin-sistemi)
42. [İleri motion, haptik ve ses sistemi](#42-ileri-motion-haptik-ve-ses-sistemi)
43. [Onboarding, kimlik ve hesap yaşam döngüsü](#43-onboarding-kimlik-ve-hesap-yaşam-döngüsü)
44. [Monetizasyon sistemi ve etik dönüşüm](#44-monetizasyon-sistemi-ve-etik-dönüşüm)
45. [AI özellikleri için premium UX](#45-ai-özellikleri-için-premium-ux)
46. [Bildirimler, widget’lar, canlı yüzeyler ve deep link](#46-bildirimler-widgetlar-canlı-yüzeyler-ve-deep-link)
47. [Offline, senkronizasyon ve veri bütünlüğü](#47-offline-senkronizasyon-ve-veri-bütünlüğü)
48. [Güven, gizlilik, güvenlik ve içerik güvenliği](#48-güven-gizlilik-güvenlik-ve-içerik-güvenliği)
49. [Premium performans mühendisliği](#49-premium-performans-mühendisliği)
50. [Erişilebilirlik kabul sistemi](#50-erişilebilirlik-kabul-sistemi)
51. [Portföy analitiği ve deney sistemi](#51-portföy-analitiği-ve-deney-sistemi)
52. [QA, görsel regresyon ve yayın otomasyonu](#52-qa-görsel-regresyon-ve-yayın-otomasyonu)
53. [16 mevcut uygulamayı dönüştürme programı](#53-16-mevcut-uygulamayı-dönüştürme-programı)
54. [Codex çalışma sistemi ve repo talimatları](#54-codex-çalışma-sistemi-ve-repo-talimatları)
55. [Master Codex prompt kütüphanesi](#55-master-codex-prompt-kütüphanesi)
56. [Stack bazlı uygulama rehberi](#56-stack-bazlı-uygulama-rehberi)
57. [Kopyalanabilir dosya ve şablonlar](#57-kopyalanabilir-dosya-ve-şablonlar)
58. [Portföy kalite kapıları ve puanlama](#58-portföy-kalite-kapıları-ve-puanlama)
59. [AI üretimi görünümü ele veren anti-pattern’ler](#59-ai-üretimi-görünümü-ele-veren-anti-patternler)
60. [Uygulama yol haritası ve nihai çalışma düzeni](#60-uygulama-yol-haritası-ve-nihai-çalışma-düzeni)

---


# 0. Bu rehberi 16 uygulamada kullanma modeli

Bu belge tek bir uygulama için “güzel ekranlar” üretme rehberi değildir. On altı uygulamada aynı kalite standardını korumak için bir **ürün portföyü işletim sistemi** olarak kullanılmalıdır.

## 0.1 Üç katmanlı model

Her uygulama aşağıdaki üç katmanın birleşimi olmalıdır:

```text
PORTFÖY CORE
Ortak kalite standardı, token sistemi, erişilebilirlik, analytics,
hata durumları, ödeme davranışı, güvenlik, test ve Codex kuralları

        +

APP PROFILE
Uygulamanın hedef kitlesi, marka kişiliği, değer önerisi,
özellikleri, içerik yoğunluğu, gelir modeli ve görsel yönü

        +

PLATFORM ADAPTER
SwiftUI / UIKit, Jetpack Compose / Views, Flutter veya React Native
üzerinde iOS ve Android'e doğal davranış kazandıran uyarlamalar
```

**Portföy core paylaşılır.** Marka karakteri ve ürün akışları uygulamaya göre değişir. Platform davranışı kopyalanmaz; native beklentilere çevrilir.

## 0.2 Her repoda bulunması gereken minimum dosyalar

```text
/AGENTS.md
/docs/APP_PROFILE.md
/docs/PRODUCT_BRIEF.md
/docs/DESIGN_SYSTEM.md
/docs/COMPONENT_CONTRACTS.md
/docs/SCREEN_SPECS.md
/docs/ACCESSIBILITY.md
/docs/ANALYTICS_PLAN.md
/docs/PRIVACY_AND_PERMISSIONS.md
/docs/PERFORMANCE_BUDGET.md
/docs/QA_MATRIX.md
/docs/RELEASE_CHECKLIST.md
/docs/DECISIONS/
/design/tokens/
/design/assets/
```

Bu dosyalar Codex’e yalnızca “ne yapacağını” değil, **hangi kalite sınırları içinde yapacağını** öğretir.

## 0.3 Tek kaynaktan doğruluk ilkesi

Aynı bilgi farklı dosyalarda farklı değerlerle tekrar edilmemelidir.

| Bilgi | Tek gerçek kaynak |
|---|---|
| Renk, spacing, radius, type scale | Design token dosyaları |
| Bileşen davranışı | `COMPONENT_CONTRACTS.md` |
| Ekran amaçları ve state’ler | `SCREEN_SPECS.md` |
| Ürün dili | `APP_PROFILE.md` |
| Event adları | `ANALYTICS_PLAN.md` |
| Kalite ve test | `QA_MATRIX.md` |
| Codex davranışı | `AGENTS.md` |

## 0.4 Rehberin kullanım sırası

1. Her uygulama için bir `APP_PROFILE.md` oluştur.
2. Bölüm 53’teki denetimle mevcut kaliteyi puanla.
3. Portföy core tokenlarını ve component contracts dosyasını repoya ekle.
4. Uygulamanın görsel yönünü Bölüm 40 ile seç.
5. Kritik kullanıcı akışlarını ve ekran state’lerini dokümante et.
6. Codex’e Bölüm 54’teki çalışma sözleşmesini ver.
7. Önce tek bir pilot akışı tamamen bitir; bütün uygulamayı aynı anda yeniden çizme.
8. Snapshot, erişilebilirlik, performans ve satın alma testlerini geçmeden ikinci dalgaya geçme.
9. Her uygulama sürümünde portföy kalite kapılarını çalıştır.

## 0.5 “Ortak” ile “aynı” arasındaki fark

On altı uygulamanın birbirinin klonu gibi görünmesi premium değildir. Doğru hedef şudur:

- Aynı spacing mantığı, ama farklı içerik yoğunluğu
- Aynı erişilebilirlik seviyesi, ama farklı görsel karakter
- Aynı hata kalitesi, ama bağlama özgü metin
- Aynı component API’si, ama farklı theme değerleri
- Aynı analytics sözlüğü, ama uygulamaya özgü event’ler
- Aynı QA standardı, ama farklı kritik kullanıcı yolculukları

## 0.6 Portföy düzeyinde altın kurallar

1. Her uygulama ilk 30 saniyede değerini göstermeli.
2. Her ekranda birincil amaç anlaşılmalı.
3. Kullanıcı verisi, ödeme ve izinlerde sürpriz olmamalı.
4. Tüm state’ler tasarlanmalı: loading, empty, error, offline, partial, success, permission denied, expired ve conflict.
5. iOS uygulaması Android kopyası, Android uygulaması iOS kopyası olmamalı.
6. Tasarım token dışı sabit renk, spacing ve radius kullanılmamalı.
7. UI değişiklikleri screenshot veya snapshot testi olmadan birleşmemeli.
8. Erişilebilirlik son kontrol değil, kabul kriteri olmalı.
9. Premium görünüm performans pahasına kurulamaz.
10. Codex’e belirsiz “daha premium yap” komutu tek başına verilmemeli; ölçülebilir sözleşme verilmelidir.

---
# 1. Yönetici özeti

Premium bir mobil uygulama, yalnızca güzel renkler, yuvarlatılmış kartlar veya pahalı görünen animasyonlardan oluşmaz. Kullanıcıda aşağıdaki beş algıyı aynı anda oluşturmalıdır:

1. **Kontrol:** Kullanıcı nerede olduğunu, ne yapabileceğini ve işlem sonucunu anlar.
2. **Güven:** Uygulamanın verisini, parasını ve zamanını boşa harcamayacağını hisseder.
3. **Akıcılık:** Dokunma, geçiş, yükleme ve geri bildirimler tutarlıdır.
4. **Değer:** İlk dakikalarda uygulamanın neden var olduğu anlaşılır.
5. **Özen:** Metinlerden boş durumlara, ikonlardan mağaza görsellerine kadar hiçbir bölüm yarım görünmez.

En iyi sonuç için tasarım şu sırayla ele alınmalıdır:

```text
Ürün stratejisi
→ Kullanıcı problemi
→ Bilgi mimarisi
→ Temel kullanıcı akışları
→ Wireframe
→ Görsel yön
→ Design system
→ Etkileşim prototipi
→ Erişilebilirlik
→ Geliştirici teslimi
→ Analitik
→ Test
→ Mağaza sunumu
→ Sürekli iyileştirme
```

## Minimum teslimat paketi

Premium seviyede bir mobil uygulama tasarımı için aşağıdaki teslimatlar bulunmalıdır:

- Ürün ve kullanıcı problemi özeti
- Hedef kitle ve ana kullanım senaryoları
- Bilgi mimarisi
- Ana kullanıcı akışları
- Düşük detaylı wireframe
- Yüksek detaylı iOS ekranları
- Yüksek detaylı Android ekranları
- Light ve dark mode
- Tasarım tokenları
- Bileşen kütüphanesi
- Etkileşim ve hareket spesifikasyonları
- Boş, yükleniyor, hata, offline ve başarı durumları
- Onboarding ve izin akışları
- Paywall ve abonelik yönetimi
- Erişilebilirlik kabul kriterleri
- Analitik event haritası
- App Store / Google Play görsel paketi
- QA kontrol listesi

---

# 2. Premium uygulama ne demektir?

## 2.1 Premium hissin bileşenleri

| Boyut | Premium yaklaşım | Ucuz/amatör görünen yaklaşım |
|---|---|---|
| Hiyerarşi | Her ekranda tek baskın amaç | Aynı önemde çok sayıda buton |
| Tipografi | Net ölçek, iyi satır uzunluğu | Rastgele font boyutları |
| Boşluk | Tutarlı ritim ve nefes alan düzen | Her alana içerik sıkıştırma |
| Renk | Az sayıda kontrollü rol | Her bileşende farklı renk |
| Hareket | Anlam taşıyan kısa geri bildirim | Sürekli ve dikkat dağıtan animasyon |
| Metin | Kısa, insani, net | Teknik ve belirsiz mesajlar |
| Hata yönetimi | Sorunu ve çözümü açıklar | “Bir hata oluştu” |
| Ödeme | Şeffaf fiyat ve şartlar | Gizli ücret, belirsiz deneme |
| Performans | Anında tepki ve kademeli yükleme | Donmuş ekran ve uzun spinner |
| Erişilebilirlik | Baştan tasarımın parçası | Yayın öncesi son dakika düzeltmesi |
| Platform uyumu | iOS ve Android davranışlarını gözetir | Aynı ekranı iki platforma kopyalar |
| Güven | Veri ve izin gerekçesi açıktır | Gereksiz izin ve manipülatif dil |

## 2.2 Premium tasarım formülü

```text
Premium deneyim =
Net ürün değeri
+ Tutarlı tasarım sistemi
+ Platforma özgü davranış
+ Yüksek algılanan hız
+ Güvenilir mikro metin
+ Erişilebilirlik
+ Detaylı durum tasarımı
- Gereksiz karmaşıklık
- Karanlık tasarım kalıpları
```

## 2.3 “Daha çok efekt” premium değildir

Aşağıdaki kullanım biçimleri çoğu uygulamada premium hissi azaltır:

- Her yüzeyde blur veya cam efekti
- Gereksiz gradient
- Çok fazla gölge
- Sürekli parlayan CTA
- Her dokunuşta büyük animasyon
- Aşırı yuvarlatılmış her bileşen
- Çok düşük kontrastlı gri metin
- İkon ve metnin aynı anda gereksiz kullanımı
- Her ekranın farklı görsel dile sahip olması
- Sırf farklı görünmek için alışılmış navigasyonu bozmak

Premium görünümün ana prensibi: **Az sayıda güçlü karar ve yüksek uygulama kalitesi.**

---

# 3. Tasarımdan önce cevaplanması gereken sorular

Tasarım başlamadan önce tek sayfalık bir ürün brifi hazırlanmalıdır.

## 3.1 Ürün brifi

```markdown
# Ürün Brifi

## Ürün adı
[Ad]

## Tek cümlelik değer önerisi
[Uygulama kim için, hangi problemi, nasıl çözüyor?]

## Ana hedef kullanıcı
[Yaş değil; ihtiyaç, davranış ve bağlam]

## Kullanıcının mevcut çözümü
[Notlar, Excel, rakip uygulama, WhatsApp, hiçbir şey vb.]

## En önemli kullanıcı görevi
[Kullanıcının uygulamada en sık tamamlayacağı sonuç]

## İlk oturum başarı anı
[Kullanıcı uygulamanın değerini ilk ne zaman hisseder?]

## Ana iş modeli
[Abonelik / tek seferlik / komisyon / reklam / freemium]

## Kritik güven konusu
[Ödeme / konum / sağlık / mesaj / fotoğraf / kimlik vb.]

## Başarı metriği
[Aktivasyon, D7 retention, ücretliye dönüşüm, görev tamamlama vb.]

## Kapsam dışı
[İlk sürümde yapılmayacaklar]
```

## 3.2 Zorunlu ürün soruları

- Uygulama tek bir ana problemi gerçekten iyi çözüyor mu?
- İlk açılışta kullanıcıdan ne istiyoruz?
- Kullanıcı hesap oluşturmadan değer görebilir mi?
- İlk değer anına kaç adımda ulaşılır?
- Premium paket hangi somut sonucu hızlandırıyor veya iyileştiriyor?
- Kullanıcı neden bu uygulamaya güvenmeli?
- Uygulamanın günlük, haftalık veya ihtiyaç anlık kullanım döngüsü nedir?
- Kullanıcı geri geldiğinde onu hangi ekran karşılamalı?
- Uygulama offline olduğunda ne çalışır?
- Veri senkronizasyonu gecikirse ne gösterilir?
- Bir ödeme başarısız olursa kullanıcı ne yapabilir?
- Hesap silme, veri dışa aktarma ve destek akışları hazır mı?

## 3.3 Başarı ölçümleri

Tasarım kararları ölçülebilir hedeflere bağlanmalıdır.

| Aşama | Örnek metrik |
|---|---|
| Edinme | Mağaza sayfası görüntüleme → indirme |
| Aktivasyon | İlk değer anını tamamlayan kullanıcı oranı |
| Kullanım | Ana görevin tamamlanma süresi |
| Tutundurma | D1, D7, D30 geri dönüş |
| Gelir | Paywall görüntüleme → satın alma |
| Güven | İzin kabulü, ödeme iadesi, destek talebi |
| Kalite | Crash-free session, ANR, donma, başarısız API |
| Memnuniyet | Değerlendirme, yorum, NPS/CSAT veya görev sonrası skor |

---

# 4. iOS ve Android için platform stratejisi

## 4.1 Tek marka, iki doğal deneyim

İki platformda şu öğeler ortak kalmalıdır:

- Marka kişiliği
- Ana renk ailesi
- Ürün terminolojisi
- İçerik hiyerarşisi
- İllüstrasyon dili
- Fotoğraf yönü
- Temel köşe ve boşluk karakteri
- Ana görevlerin mantığı
- Premium değer önerisi

Şu öğeler platforma göre uyarlanmalıdır:

- Navigasyon davranışı
- Geri hareketi
- Sistem çubukları
- Modal/sheet kullanımı
- Seçici ve tarih alanları
- İzin ekranları
- Klavye davranışı
- Haptik dili
- Sistem ikonları
- Paylaşım ve sistem menüleri
- Tablet/katlanabilir düzen
- Satın alma bileşenleri

## 4.2 Platform stratejisi seçenekleri

| Seçenek | Ne zaman uygun? | Risk |
|---|---|---|
| Tam native UI | En yüksek platform kalitesi ve uzun vadeli ürün | İki ayrı geliştirme maliyeti |
| Ortak ürün sistemi + native ekranlar | Premium uygulamalar için en dengeli yaklaşım | Güçlü design system gerekir |
| Cross-platform + platform adaptasyonu | Küçük ekip, hızlı geliştirme | “Tek UI her yerde” tuzağı |
| Tek tasarımın birebir kopyası | Basit iç araç veya çok erken MVP | Premium algı ve kullanılabilirlik düşebilir |

## 4.3 Önerilen yaklaşım

```text
Ortak:
- Renk rolleri
- Tipografi rolleri
- Spacing tokenları
- İçerik ve marka
- Domain bileşenleri
- Analitik isimleri

Platforma özgü:
- Navigation shell
- Sistem ikonları
- Sheet/dialog davranışı
- Back davranışı
- Form kontrolleri
- Bildirim/izin akışı
- Satın alma yüzeyleri
```

## 4.4 Native geliştirme yönü

- Apple tarafında SwiftUI, Apple platformları için modern native UI yaklaşımıdır.
- Android tarafında Jetpack Compose, Android’in önerilen modern native UI aracıdır.
- Cross-platform tercih edilse bile tasarım katmanı iOS ve Android davranışlarını ayırabilmelidir.
- “Bir kez çiz, iki platforma aynen uygula” premium ürünlerde önerilmez.

---

# 5. Bilgi mimarisi ve kullanıcı akışları

## 5.1 Ana navigasyon envanteri

Önce bütün içerik ve işlevler listelenir:

```text
Ana alanlar
├── Ana sayfa
├── Arama / Keşif
├── Oluştur / Ekle
├── Aktivite / Bildirimler
├── Profil
│   ├── Hesap
│   ├── Premium
│   ├── Gizlilik
│   ├── Bildirim ayarları
│   ├── Yardım
│   └── Hesabı sil
└── Sistem akışları
    ├── Giriş
    ├── Onboarding
    ├── İzinler
    ├── Paywall
    ├── Offline
    └── Hata
```

## 5.2 Navigasyon seçimi

### Alt sekme çubuğu uygundur, eğer:

- 3–5 ana hedef alan varsa
- Alanlar benzer öneme sahipse
- Kullanıcı sık sık aralarında geçiş yapıyorsa
- Her sekmenin durumu korunmalıysa

### Hiyerarşik navigasyon uygundur, eğer:

- Kullanıcı liste → detay → alt detay biçiminde ilerliyorsa
- Geri dönüş bağlamı önemliyse
- İçerik doğal bir ağaç yapısına sahipse

### Tek baskın görev uygundur, eğer:

- Uygulama kamera, tarama, kayıt veya üretim odaklıysa
- Kullanıcı her oturumda aynı temel işi yapıyorsa
- Ana CTA diğer alanlardan belirgin biçimde önemliyse

## 5.3 Akış dokümanı

Her kritik akış için aşağıdaki tablo hazırlanmalıdır:

| Alan | Açıklama |
|---|---|
| Akış adı | Örn. İlk proje oluşturma |
| Başlangıç | Ana sayfa, deep link, bildirim vb. |
| Kullanıcı amacı | Somut sonuç |
| Ön koşul | Giriş, internet, izin, premium vb. |
| Mutlu yol | Minimum adım |
| Alternatif yol | Farklı seçim |
| Hata yolu | API, ödeme, izin, veri yok |
| Çıkış | Başarı ekranı veya güncellenmiş durum |
| Ölçüm | Başlangıç, adım, başarı, hata eventleri |

## 5.4 İlk değer anı

İlk oturumda hedef:

- Kullanıcıyı ürünü anlatan uzun sunuma hapsetmemek
- İlk somut sonucu mümkün olduğunca erken göstermek
- Hesap ve izinleri yalnızca gerçekten gerektiği anda istemek
- Premium duvarını, kullanıcı değer görmeden önce zorunlu kılmamak
- Demo veri veya örnek içerik kullanarak boş uygulama hissini azaltmak

---

# 6. Premium tasarımın temel ilkeleri

## 6.1 Her ekranda tek baskın amaç

Her ekran için şu cümle tamamlanmalıdır:

> Kullanıcı bu ekranda öncelikle **_____** yapmalı.

Bu cümle iki veya daha fazla fiil gerektiriyorsa ekran hiyerarşisi zayıf olabilir.

## 6.2 Öncelik sırası

```text
1. Ana görev
2. Görevi anlamaya yarayan içerik
3. İkincil görev
4. Yardımcı bilgi
5. Seyrek kullanılan seçenekler
```

## 6.3 Görsel yoğunluk

Premium tasarım her zaman “çok boş” değildir. Yoğunluk ürüne göre seçilir:

| Ürün tipi | Uygun yoğunluk |
|---|---|
| Meditasyon, wellness | Düşük |
| Finans, analitik | Orta-yüksek ama düzenli |
| Sosyal içerik | Orta |
| Profesyonel araç | Yüksek fakat taranabilir |
| Lüks/perakende | Düşük-orta, güçlü görsel |
| Üretkenlik | Orta, görev odaklı |

## 6.4 Tutarlılık türleri

- **Görsel tutarlılık:** Aynı rol aynı görünür.
- **Davranış tutarlılığı:** Aynı etkileşim aynı sonuç verir.
- **Metin tutarlılığı:** Aynı kavram farklı isimlerle çağrılmaz.
- **Platform tutarlılığı:** Sistem beklentileri bozulmaz.
- **Durum tutarlılığı:** Loading, disabled, selected ve error durumları standarttır.

## 6.5 Tanıdıklık ve özgünlük dengesi

Özgünlük şu alanlarda kurulmalıdır:

- Marka rengi
- Tipografi kombinasyonu
- İçerik sunumu
- İllüstrasyon
- Fotoğraf
- Domain’e özel bileşen
- Mikro etkileşim
- Veri görselleştirme

Temel kullanılabilirlik kalıplarında aşırı özgünlükten kaçınılmalıdır:

- Geri butonu
- Kapatma
- Form hatası
- Şifre alanı
- Tarih seçici
- Ayarlar
- Satın alma
- Hesap silme
- Sistem paylaşımı

---

# 7. Görsel tasarım sistemi

## 7.1 Spacing sistemi

Önerilen temel ölçek:

```text
2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80
```

Kullanım örneği:

| Token | Değer | Kullanım |
|---|---:|---|
| space-0 | 0 | Sıfırlama |
| space-1 | 4 | İkon iç boşluğu |
| space-2 | 8 | Yakın öğeler |
| space-3 | 12 | Kompakt bileşen |
| space-4 | 16 | Standart içerik boşluğu |
| space-5 | 20 | Kart içi geniş boşluk |
| space-6 | 24 | Bölüm içi boşluk |
| space-8 | 32 | Bölümler arası |
| space-10 | 40 | Büyük ayırma |
| space-12 | 48 | Hero alanı |
| space-16 | 64 | Büyük ekran ritmi |

Kurallar:

- Aynı ilişki için aynı boşluğu kullan.
- Yakınlık, ilişkiyi göstermelidir.
- Dış kenar boşlukları iç boşluklardan genellikle daha güçlü olmalıdır.
- Tek seferlik rastgele değerleri azalt.
- Tasarım ve kod aynı token isimlerini kullanmalıdır.

## 7.2 Grid

### Telefon

- Kompakt ekranlarda çoğunlukla tek kolon içerik
- Yatay kenar boşluğu genellikle 16–24 birim aralığında
- Tam genişlik medya gerektiğinde güvenli alanları gözet
- Dokunma hedefleri arasında yeterli ayrım bırak

### Tablet ve geniş ekran

- Sadece telefon arayüzünü büyütme
- Liste + detay
- Navigasyon rail + içerik
- Destekleyici panel
- Sabit maksimum içerik genişliği
- Okuma içeriklerinde aşırı uzun satırları engelle

Android, düzenlerde 8 dp temelli ritmi ve window size class yaklaşımını destekler. Apple tarafında safe area, margins ve sistem rehberlerine uyum esastır.

## 7.3 Tipografi

### Tipografi rolleri

```text
Display
Title Large
Title
Headline
Body
Body Emphasis
Callout
Label
Caption
Numeric / Data
```

### Örnek mobil ölçek

| Rol | Önerilen başlangıç | Kullanım |
|---|---:|---|
| Display | 32–40 | Çok sınırlı hero başlık |
| Title Large | 28–32 | Ana ekran başlığı |
| Title | 22–24 | Bölüm veya detay |
| Headline | 17–20 | Kart başlığı |
| Body | 16–17 | Ana okuma |
| Callout | 14–16 | Yardımcı içerik |
| Label | 13–15 | Buton ve alan etiketi |
| Caption | 11–13 | Meta bilgi |

> Bunlar sabit platform kuralları değil, başlangıç aralıklarıdır. Dynamic Type ve font scaling test edilmelidir.

### Premium tipografi kuralları

- En fazla 1 marka fontu + sistem fontu kullan.
- Uzun metinde dekoratif font kullanma.
- Ağırlığı hiyerarşi için kullan; her şeyi bold yapma.
- Harf aralığını küçük gövdede aşırı daraltma.
- Tamamı büyük harfi kısa etiketlerle sınırla.
- Sayısal veriler için tabular figures gerekebilir.
- Para, tarih, ölçü ve yüzde biçimleri yerelleştirilmelidir.
- Metin büyüdüğünde kırpılmak yerine düzen adapte olmalıdır.

### Sistem fontları

- iOS: San Francisco ailesi ve Dynamic Type rolleri
- Android: Sistem/Material tipografi rolleri; ürün markasına göre dikkatli özelleştirme

## 7.4 Renk sistemi

Renkleri “hex listesi” olarak değil, **anlamsal roller** olarak tanımla.

```text
background
surface
surface-elevated
surface-muted
text-primary
text-secondary
text-tertiary
border
divider
accent
accent-on
success
warning
error
info
focus
scrim
```

### Marka rengi

Marka rengi:

- CTA için yeterli kontrasta sahip olmalı
- Light ve dark modda ayrı değerlendirilmeli
- Büyük yüzeylerde yorucu olmamalı
- Durum renkleriyle karışmamalı
- Android dynamic color kullanıldığında marka kimliği kaybolmamalı

### Dark mode

Dark mode sadece renkleri ters çevirmek değildir.

Kontrol listesi:

- Saf siyahı her yüzeyde zorunlu kullanma
- Yüzey katmanlarını ton farkıyla ayır
- Gölge yerine ton/elevation yaklaşımı kullan
- Fotoğraf ve illüstrasyon parlamasını kontrol et
- Brand accent’in karanlık zemindeki doygunluğunu azaltmayı düşün
- Disabled durumunu sadece opacity ile çözme
- OLED avantajı ile okunabilirlik arasında denge kur
- Sistem ayarını takip et; uygulama içi manuel seçim sunulabilir

## 7.5 Kontrast

Pratik hedefler:

- Normal metin: en az 4.5:1
- Büyük metin: en az 3:1
- Anlam taşıyan ikon ve kontrol sınırları: en az 3:1
- Renk tek başına durum göstergesi olmamalı

WCAG web standardı olsa da bu kontrast hedefleri mobil ürün tasarımında da güçlü bir kalite tabanıdır.

## 7.6 Köşe yarıçapı

Önerilen rol tabanlı sistem:

```text
radius-xs: 4
radius-sm: 8
radius-md: 12
radius-lg: 16
radius-xl: 24
radius-full: 999
```

Kurallar:

- Her bileşene farklı radius verme.
- İç içe yüzeylerde iç radius, dış radius ve padding ilişkisini koru.
- Platform sistem bileşenlerini gereksiz biçimde yeniden şekillendirme.
- Pill butonları sadece kısa eylemler için kullan.
- Büyük radius, içerik yoğun ürünlerde alan kaybına yol açabilir.

## 7.7 Gölge, elevation ve materyal

Premium gölge:

- Yumuşak
- Düşük kontrastlı
- Yüzey ayrımı için kullanılmış
- İçeriği “havada” göstermeye zorlamayan
- Dark mode’da yeniden değerlendirilmiş

Kötü gölge:

- Siyah ve yoğun
- Her kartta aynı büyük blur
- Scroll içinde katman karmaşası
- Border ile birlikte gereksiz ağır görünüm

## 7.8 İkonografi

- iOS’ta mümkün olduğunda SF Symbols
- Android’de Material Symbols veya tutarlı özel set
- Aynı ailede stroke ve doluluk uyumu
- 16/20/24 gibi sınırlı boyut rolleri
- Kritik ikonlarda metin etiketi
- Dekoratif ikonları erişilebilirlik ağacından çıkarma
- Seçili ve seçili olmayan durumların yalnızca renk değil şekil/dolulukla ayrılması
- Özel ikonların optik boyutunu sistem ikonlarıyla eşleştirme

## 7.9 Görsel ve illüstrasyon

- Ürünün ana değerini açıklamalı
- Rastgele stok görsel kullanmamalı
- Marka kişiliğiyle uyumlu olmalı
- Dark mode alternatifi bulunmalı
- Küçük ekranda ana mesajı kaybetmemeli
- Yerelleştirilmiş metni görselin içine gömmemeli
- Görsel sıkıştırma ve boyutlandırma planı yapılmalı
- Erişilebilir açıklama gerekip gerekmediği belirlenmeli

---

# 8. iOS tasarım gereksinimleri

## 8.1 Apple yaklaşımının özü

iOS deneyimi:

- İçeriği öne çıkarmalı
- Sistem davranışlarıyla uyumlu olmalı
- Doğrudan manipülasyon hissi vermeli
- Hiyerarşiyi net kurmalı
- Kişiselleştirme ve kullanıcı kontrolünü desteklemeli
- Erişilebilirlik ayarlarına saygı göstermeli

## 8.2 2026 görsel dil: Liquid Glass

Apple’ın güncel tasarım kaynaklarında Liquid Glass, platformlar arasında kullanılan dinamik materyal olarak konumlanır.

Doğru kullanım:

- Navigasyon ve kontrol katmanlarını içerikten ayırmak
- Arka planla bağ kurarken okunabilirliği korumak
- Sistem bileşenleriyle doğal görünmek
- Reduce Transparency ve Reduce Motion gibi erişilebilirlik ayarlarında bozulmamak
- İçerik ile kontrol katmanını birbirine karıştırmamak

Yanlış kullanım:

- Her kartı cam yapmak
- Düşük kontrastlı metni hareketli görsel üzerine koymak
- Arka planda çok fazla detay varken blur’a güvenmek
- Eski cihazlarda veya erişilebilirlik modunda alternatif üretmemek
- Marka kimliğini yalnızca materyal efektine bağlamak

## 8.3 Dokunma hedefi

Apple genel kural olarak butonların hit region alanının en az **44 × 44 pt** olmasını önerir.

Notlar:

- Görsel ikon 20–24 pt olabilir; dokunma alanı daha büyük olmalıdır.
- Yan yana küçük ikonlar arasında yeterli boşluk bırak.
- Metin linklerini kolay dokunulabilir yap.
- Swipe eylemlerinin buton alternatifi bulunmalıdır.
- Sadece gizli gesture’a bağlı kritik işlem tasarlama.

## 8.4 Navigasyon

### Navigation Stack

Uygun kullanım:

- Liste → detay
- Ayar → alt ayar
- Kategori → içerik
- Profil → düzenleme

Kurallar:

- Başlık bağlama göre doğru boyutta olmalı.
- Geri butonunu özel ikonla bozma.
- Kapanması gereken modal için geri yerine kapat kullan.
- Uzun süreçlerde “İptal” ve “Bitti” ayrımını netleştir.

### Tab Bar

- 3–5 ana alan
- Her tab kalıcı bir hedef
- İkon + kısa etiket
- Bir tabı sadece büyük CTA gibi kullanırken erişilebilirlik ve platform uyumu kontrol edilmeli
- Rozetler anlamlı ve sınırlı olmalı
- Tab değişince navigation stack davranışı önceden tanımlanmalı

### Sheet

Sheet uygundur:

- Kısa seçim
- Yardımcı görev
- Filtre
- Paylaşım
- Hızlı düzenleme
- İçeriği tamamen terk etmeden tamamlanan eylem

Tam ekran uygundur:

- Uzun form
- Yoğun odak
- Kamera
- Yaratıcı üretim
- Karmaşık çok adımlı işlem

## 8.5 Form kontrolleri

- Sistem klavye tipini alana göre seç.
- E-posta alanında uygun keyboard/content type kullan.
- Password AutoFill ve passkey desteğini değerlendir.
- Date picker için sistem davranışını tercih et.
- Toggle, segmented control ve picker’ı anlamına uygun kullan.
- Hata mesajını yalnızca ekranın üstünde değil, alan yakınında göster.
- Submit sonrası ilk hatalı alana erişilebilir odak taşınabilir.

## 8.6 Dynamic Type

- Metin stilleri semantic rollere bağlanmalı.
- Büyük metin boyutlarında yatay düzen dikeye dönebilmeli.
- Buton metni kırpılmamalı.
- Kritik metin tek satıra zorlanmamalı.
- Kart yükseklikleri sabitlenmemeli.
- Tablo ve grafikler alternatif okuma sunmalı.
- En büyük erişilebilirlik boyutlarında ana akış tamamlanabilmeli.

## 8.7 VoiceOver

Her öğe için:

- Doğru label
- Gerekirse hint
- Doğru role/trait
- Mantıklı okuma sırası
- State bilgisi
- Dekoratif öğelerin gizlenmesi
- Gruplandırılması gereken içeriğin tek anlamlı birim olması

Örnek:

```text
Kötü: "Kalp butonu"
İyi: "Favorilere ekle"
Seçili: "Favorilerde, kaldırmak için çift dokun"
```

## 8.8 Haptik

Haptik şu amaçlarla kullanılabilir:

- Başarılı tamamlanma
- Uyarı
- Hatalı giriş
- Seçim değişimi
- Snap noktası
- Önemli kontrol geri bildirimi

Kaçınılacaklar:

- Her dokunuşta titreşim
- Uzun ve rahatsız edici pattern
- Görsel geri bildirimin yerine yalnızca haptik
- Kullanıcının sistem tercihlerini yok saymak

## 8.9 iPad

iPad tasarımı:

- Telefon ekranının genişlemiş hali olmamalı
- Sidebar veya split view düşünülmeli
- Klavye kısayolları değerlendirilmeli
- Pointer hover ve focus durumları tanımlanmalı
- Multiwindow ve yeniden boyutlandırma test edilmeli
- İçerik maksimum genişliği belirlenmeli
- Drag and drop uygunsa desteklenmeli
- Formlar ekranın tamamına yayılmamalı

## 8.10 iOS özel kontrol listesi

- [ ] Safe area uyumu
- [ ] 44 × 44 pt minimum hit region
- [ ] Dynamic Type
- [ ] VoiceOver
- [ ] Reduce Motion
- [ ] Reduce Transparency
- [ ] Light/dark mode
- [ ] Klavye ve form otomatik doldurma
- [ ] Haptik amacı
- [ ] System share sheet
- [ ] App Store satın alma/restore
- [ ] Hesap silme
- [ ] iPad adaptasyonu
- [ ] Landscape gerekiyorsa test
- [ ] Sistem ikonlarıyla uyum

---

# 9. Android tasarım gereksinimleri

## 9.1 Material 3 ve Material 3 Expressive

Material 3:

- Renk rolleri
- Tipografi
- Shape
- Elevation
- Hareket
- Komponentler
- Adaptive layout
- Dynamic color

Material 3 Expressive, Android’in güncel görsel yönünü destekleyen daha belirgin şekil, hareket ve bileşen yaklaşımları sağlar. Ancak her ürünün maksimum “expressive” görünmesi gerekmez. Marka, kullanım bağlamı ve içerik yoğunluğu belirleyicidir.

## 9.2 Compose-first yönü

Google’ın güncel Android kaynakları Material tasarımın Compose odaklı ilerlediğini ve Jetpack Compose’un önerilen modern native UI aracı olduğunu belirtir.

Tasarım ekibi için sonucu:

- Compose bileşenleriyle eşleşen varyantlar tasarla.
- State’leri açıkça tanımla.
- Preview senaryoları için örnek veri üret.
- Design token → Compose theme eşlemesi yap.
- Standart bileşeni gereksiz yere baştan çizme.
- Semantics ve test tag planını teslim dokümanına ekle.

## 9.3 Dokunma hedefi

Android, etkileşimli öğeler için en az **48 × 48 dp** odaklanabilir/dokunulabilir alan önerir.

Kurallar:

- Küçük ikon görseli daha büyük tıklama alanı içinde olabilir.
- Checkbox ve label birlikte tıklanabilir olmalı.
- Liste satırının yalnızca ikonunu değil anlamlı alanını tıklanabilir yap.
- İki küçük hedefi birbirine yapıştırma.
- Gesture alternatifi sağla.

## 9.4 Edge-to-edge

Modern Android tasarımında içerik sistem barlarının arkasına uzanabilir; fakat:

- Status/navigation bar inset’leri uygulanmalı
- İçerik kesilmemeli
- Klavye açıldığında CTA görünür kalmalı
- Gesture navigation ile çakışma olmamalı
- Alt sheet ve bottom bar sistem alanını doğru hesaplamalı
- Kontrast koruyucu gradient/scrim gerektiğinde kullanılmalı

## 9.5 Navigation

### Navigation Bar

- Kompakt ekranlarda 3–5 üst seviye hedef
- İkon + etiket
- Seçili durum yalnızca renkle ayrılmamalı
- Badge kullanımı sınırlı olmalı

### Navigation Rail

- Orta/geniş ekran
- Tablet
- Katlanabilir
- Landscape
- Çoklu panel düzeni

### Navigation Drawer

- Çok sayıda üst seviye alan varsa
- Seyrek kullanılan yönetim alanları varsa
- Kurumsal/kompleks ürünlerde

Drawer, 3–5 sık hedef için alt navigasyonun yerine otomatik tercih edilmemelidir.

## 9.6 Sistem geri davranışı

- Android back gesture sistem beklentilerine uymalı.
- Geri, önceki bağlama dönmelidir.
- “Kapat”, “geri” ve “iptal” aynı şey değildir.
- Formda kaydedilmemiş değişiklik varsa açıklayıcı uyarı kullanılabilir.
- Predictive back uyumu ve geçiş animasyonu test edilmelidir.
- Uygulama içi özel geri butonu sistem back ile çelişmemelidir.

## 9.7 Dynamic Color

Dynamic color kullanılacaksa:

- Marka kimliği için sabit çekirdek renkler korunabilir.
- Kullanıcının duvar kâğıdı paletiyle kritik durum renkleri karışmamalı.
- Paywall, fiyat, hata ve başarı renkleri kontrol edilmeli.
- Light/dark mod ayrı test edilmeli.
- Renk kontrastı otomatik kabul edilmemeli.
- Ekran görüntüsü pazarlama materyaliyle uygulama arasındaki fark planlanmalı.

## 9.8 Adaptive layout ve window size class

Android yalnızca telefon değildir. Tasarım şunları kapsamalıdır:

- Telefon
- Büyük telefon
- Tablet
- Katlanabilir
- Masaüstü pencere modu
- Landscape
- Split-screen
- Haricî klavye ve pointer

Yaklaşım:

```text
Compact:
- Tek panel
- Bottom navigation
- Tam ekran detay

Medium:
- Navigation rail
- Genişletilmiş kartlar
- Kısmi iki panel

Expanded:
- Sidebar / rail
- Liste + detay
- Destekleyici panel
- Maksimum içerik genişliği
```

Sadece bileşenleri yatayda uzatmak yerine, mevcut alana göre layout bileşenleri değişmelidir.

## 9.9 Android özel kontrol listesi

- [ ] 48 × 48 dp minimum touch target
- [ ] Edge-to-edge ve inset yönetimi
- [ ] System back / predictive back
- [ ] TalkBack
- [ ] Font scaling
- [ ] Light/dark
- [ ] Dynamic color kararı
- [ ] Navigation bar/rail/drawer adaptasyonu
- [ ] Tablet ve foldable
- [ ] Klavye açılınca CTA
- [ ] Offline davranışı
- [ ] Android Vitals takibi
- [ ] Data Safety doğruluğu
- [ ] Google Play Billing yaşam döngüsü
- [ ] Hesap silme bağlantısı ve uygulama içi akış
- [ ] Farklı üretici cihazlarda test

---

# 10. Ortak bileşenler ve platform farklılıkları

| Bileşen | Ortak tasarım kararı | iOS uyarlaması | Android uyarlaması |
|---|---|---|---|
| Ana navigasyon | Hedef sayısı ve isimler | Tab Bar / sidebar | Navigation bar / rail |
| Üst başlık | Hiyerarşi ve eylemler | Navigation bar | Top app bar |
| Modal | Görev kapsamı | Sheet/full screen cover | Bottom sheet/dialog/full screen |
| Geri | Önceki bağlam | Sistem back button | System back gesture |
| Seçici | Veri tipi | Picker/menu | Dropdown/menu/dialog |
| Tarih | Alan formatı | Sistem date picker | Material date picker |
| Alert | Risk seviyesi | Alert/action sheet | Dialog/snackbar |
| Başarı mesajı | Sonucun görünürlüğü | Inline/toast benzeri veya haptik | Snackbar/inline |
| İkon | Semantik | SF Symbols | Material Symbols |
| Switch | İkili ayar | UISwitch davranışı | Material Switch |
| Satın alma | Ürün ve şartlar | StoreKit | Play Billing |
| Paylaşım | Paylaşılacak veri | Share sheet | Android Sharesheet |
| Metin ölçeği | Semantic text role | Dynamic Type | Font scaling |
| Touch target | Erişilebilir alan | 44 pt | 48 dp |

## 10.1 Ortak domain bileşenleri

Her uygulamanın kendine özel bileşenleri olabilir:

- Rota kartı
- Moda görünümü kartı
- Finans pozisyon satırı
- AR anchor kontrolü
- Tarif adımı
- Proje durumu
- Sağlık ölçüm özeti
- Görev zaman çizgisi

Bu bileşenler marka kimliğinin ana taşıyıcılarıdır. Sistem navigasyonunu özelleştirmek yerine özgünlüğü burada kurmak daha güvenlidir.

---

# 11. Hareket, mikro etkileşim, haptik ve ses

## 11.1 Hareketin görevleri

Animasyon şunlardan en az birini yapmalıdır:

- Durum değişimini açıklamak
- Nereden nereye geçildiğini göstermek
- Hiyerarşiyi anlatmak
- İşlemi onaylamak
- Kullanıcı dikkatini gerekli alana yöneltmek
- Sistemin çalıştığını göstermek
- Marka karakteri katmak

Hiçbirini yapmıyorsa kaldırılabilir.

## 11.2 Süre sistemi

Örnek ekip içi motion tokenları:

| Token | Süre | Kullanım |
|---|---:|---|
| instant | 80–120 ms | Press feedback |
| fast | 150–200 ms | Toggle, küçük state |
| standard | 220–300 ms | Sayfa içi geçiş |
| emphasized | 320–450 ms | Büyük dönüşüm |
| ambient | 800 ms+ | Sadece dekoratif/çok sınırlı |

> Süreler bağlama, mesafeye ve platform sistem animasyonlarına göre ayarlanmalıdır.

## 11.3 Easing

- Giriş ve çıkış için tek easing kullanmak zorunda değilsin.
- Fizik temelli hareket doğrudan manipülasyonda daha doğal olabilir.
- Büyük nesne daha ağır hissedebilir.
- Arka arkaya animasyonların toplam süresini kontrol et.
- Motion tokenları kod ile aynı isimleri kullanmalıdır.

## 11.4 Reduce Motion

Reduce Motion açıkken:

- Parallax kaldır
- Büyük zoom geçişini dissolve/fade ile değiştir
- Sonsuz dekoratif hareketi durdur
- Otomatik kayan carousel’i durdur
- Kritik bilgiyi animasyona bağımlı bırakma
- Süreyi kısalt veya hareket mesafesini azalt

## 11.5 Press feedback

Her etkileşimli öğe:

- Pressed
- Focused
- Hovered gerekiyorsa
- Disabled
- Loading
- Selected
- Error

durumlarını göstermelidir.

## 11.6 Ses

Ses:

- Varsayılan olarak sessiz ortamlara saygılı olmalı
- Kritik geri bildirimin tek taşıyıcısı olmamalı
- Kullanıcı tarafından kapatılabilmeli
- Marka sesi çok kısa ve seyrek kullanılmalı
- Bildirim sesi sistem beklentilerine uygun olmalı

---

# 12. Onboarding, giriş ve hesap oluşturma

## 12.1 Onboarding amacı

Onboarding şu üç işten birini yapmalıdır:

1. Ürünün değerini göstermek
2. Gerekli kişiselleştirmeyi almak
3. Kritik bir özelliğin kullanımını öğretmek

Bunların dışında kalan uzun tanıtım slaytları genellikle atlanır.

## 12.2 Önerilen onboarding yapısı

```text
Açılış
→ Değer önerisi
→ Hemen örnek deneyim veya ilk görev
→ Gerekli kişiselleştirme
→ Gerekli anda hesap
→ Gerekli anda izin
→ İlk başarı
```

## 12.3 Giriş ekranı

Zorunlu unsurlar:

- Ana giriş yöntemi
- Apple/Google veya uygun federated login
- E-posta seçeneği gerekiyorsa
- Şifre görünürlük kontrolü
- Şifre sıfırlama
- Kullanım koşulları ve gizlilik erişimi
- Yükleniyor durumu
- Hata mesajı
- Klavye yönetimi
- Hesapsız devam seçeneği mümkünse

## 12.4 Hesap oluşturmayı geciktirme

Hesap şu durumlarda erken istenebilir:

- Veri cihazlar arasında senkronize olacaksa
- Kullanıcıya özel güvenlik gerekiyorsa
- İçeriğe erişim yasal/yaş koşuluna bağlıysa
- İşbirliği veya mesajlaşma başlıyorsa

Bunun dışında önce değer gösterilmesi dönüşümü artırabilecek daha güvenli bir deneyimdir.

## 12.5 Onboarding metinleri

Kötü:

> Deneyiminizi kişiselleştirmek için bazı sorular soracağız.

Daha iyi:

> Sana uygun bir başlangıç planı hazırlayalım.

Kötü:

> Bildirimleri etkinleştir.

Daha iyi:

> Tamamlanması gereken görevleri zamanında hatırlatalım.

---

# 13. İzin isteme deneyimi

## 13.1 JIT: Tam gerektiği anda izin

İzinler uygulama açılır açılmaz topluca istenmemelidir.

Örnek:

```text
Kullanıcı “Konumumu kullan” seçer
→ Uygulama kısa açıklama gösterir
→ Sistem izin ekranı açılır
→ Reddedilirse alternatif manuel konum sunulur
```

## 13.2 Ön açıklama ekranı

Ön açıklama:

- Ne istendiğini
- Neden istendiğini
- Kullanıcıya faydasını
- Reddedilirse ne olacağını

kısa biçimde anlatmalıdır.

## 13.3 Reddedilme durumu

- Akışı tamamen kilitleme, mümkünse alternatif sun.
- “Ayarları Aç” CTA’sını yalnızca gerçekten gerekliyse göster.
- Kullanıcıyı tekrar tekrar isteme.
- İzin verilmediğini suçlayıcı dille anlatma.
- Ayarlar değiştiğinde ekranı güncelle.

## 13.4 Hassas izinler

Özellikle dikkat:

- Kamera
- Mikrofon
- Fotoğraflar
- Konum
- Kişiler
- Sağlık
- Bluetooth / yakın cihazlar
- Bildirim
- Takip
- Erişilebilirlik servisi
- Yerel ağ

Her izin için ürün gereksinimi, politika uygunluğu ve veri akışı belgelenmelidir.

---

# 14. Yükleniyor, boş, hata ve offline durumları

Premium ürün ile prototip arasındaki fark çoğunlukla bu ekranlarda görünür.

## 14.1 Durum matrisi

Her veri alanı için:

| Durum | Tasarım gerekli mi? |
|---|---|
| İlk yükleme | Evet |
| Yenileme | Evet |
| Sayfalama | Evet |
| Boş | Evet |
| Filtre sonucu yok | Evet |
| Arama sonucu yok | Evet |
| Kısmi veri | Evet |
| Offline | Evet |
| Sunucu hatası | Evet |
| Yetki hatası | Evet |
| Süre aşımı | Evet |
| Güncel olmayan cache | Evet |
| Silinmiş içerik | Evet |
| Premium kilitli | Evet |

## 14.2 Loading

Loading tipi içeriğe göre seçilir:

- Skeleton: Yapı tahmin edilebiliyorsa
- Spinner: Kısa ve bağımsız işlem
- Progress bar: İlerleme ölçülebiliyorsa
- Optimistic UI: Geri alınabilir düşük riskli işlem
- Background sync indicator: İçerik kullanılabilirken senkronizasyon

Kurallar:

- Buton tıklamasını anında görsel olarak onayla.
- Aynı işlemi iki kez başlatmayı engelle.
- Buton içinde loading varsa etiketi koru veya işlem durumunu açıkla.
- Belirsiz uzun işlemde iptal veya arka plana alma seçeneğini değerlendir.
- Skeleton gerçek layout’a yakın olmalı; dekoratif dalgalanma abartılmamalı.

## 14.3 Empty state

İyi bir boş durum:

1. Ne olduğunu söyler
2. Neden boş olduğunu açıklar
3. Sonraki en iyi eylemi sunar
4. Gerekirse örnek içerik gösterir

Örnek:

```text
Henüz kayıt yok
İlk kaydını eklediğinde burada tarih sırasıyla göreceksin.
[İlk Kaydı Ekle]
```

Filtre sonucu boşsa “ilk öğeyi ekle” değil, “filtreyi temizle” önerilmelidir.

## 14.4 Hata mesajı formülü

```text
Ne oldu?
+ Kullanıcı verisi güvende mi?
+ Ne yapabilir?
+ Gerekirse hata kodu / destek yolu
```

Örnek:

> Ödeme tamamlanamadı. Kartından ücret alınmadı. Bağlantını kontrol edip tekrar deneyebilir veya farklı bir ödeme yöntemi seçebilirsin.

## 14.5 Offline

Offline stratejisi:

- Hangi içerik cache’den okunur?
- Hangi eylem sıraya alınır?
- Hangi işlem internet gerektirir?
- Son senkronizasyon zamanı gösterilir mi?
- Çakışma nasıl çözülür?
- Kullanıcı verisi kaybolmadan yeniden denenir mi?

Premium yaklaşım:

- Uygulamanın tamamını anlamsız bir hata ekranına dönüştürme.
- Kullanılabilir cache’i göster.
- Offline banner’ı dikkat çekici ama engelleyici olmayan biçimde kullan.
- İnternet geldiğinde otomatik yeniden dene; sonucu bildir.
- Kullanıcının oluşturduğu içeriği yerel olarak güvenceye al.

---

# 15. Formlar ve veri girişi

## 15.1 Form tasarım ilkeleri

- Etiket alanın üstünde görünür kalmalı.
- Placeholder etikete dönüşmemeli.
- Zorunlu alanlar açıkça belirtilmeli.
- Yardım metni hata metniyle karışmamalı.
- Validasyon doğru zamanda yapılmalı.
- Kullanıcının girdiği veri hata sonrası kaybolmamalı.
- Klavye “Next/Done” akışını desteklemeli.
- Otomatik formatlama cursor davranışını bozmamalı.
- Tarih, telefon, para ve adres yerelleştirilmeli.

## 15.2 Validasyon zamanı

| Hata tipi | Önerilen zaman |
|---|---|
| Biçim açıkça yanlış | Alan terk edilince |
| Zorunlu alan boş | Submit sonrası veya alan terk edilince |
| Kullanıcı adı alınmış | Debounce sonrası sunucu kontrolü |
| Şifre gücü | Yazarken yardımcı geri bildirim |
| Kart/ödeme | Güvenli ödeme bileşeni içinde |
| İş kuralı | Seçim yapılır yapılmaz veya submit |

## 15.3 Hata dili

Kötü:

> Invalid input.

İyi:

> E-posta adresi `ad@ornek.com` biçiminde olmalı.

Kötü:

> İşlem başarısız.

İyi:

> Bu kullanıcı adı alınmış. Başka bir kullanıcı adı deneyebilirsin.

## 15.4 Destructive eylemler

- “Sil” ve “Kaldır” farkını doğru kullan.
- Sonuç geri alınabiliyorsa snackbar/undo tercih edilebilir.
- Geri alınamazsa sonuç açıkça yazılmalı.
- Onay dialog’unda genel “Evet/Hayır” yerine eylem adı kullanılmalı.
- Çok kritik işlemde ek doğrulama gerekebilir.
- Hesap silme ile abonelik iptalini aynı şeymiş gibi göstermemelisin.

---

# 16. Arama, keşif ve kişiselleştirme

## 16.1 Arama deneyimi

Arama durumları:

- İlk açılış
- Son aramalar
- Önerilen aramalar
- Yazarken öneri
- Sonuç
- Sonuç yok
- Hata
- Offline
- Filtreli sonuç
- Sesli/görsel arama varsa izin durumu

## 16.2 Arama sonuç kalitesi

- Sorguyu görünür tut.
- Sonuç sayısını dikkatli kullan.
- En alakalı içerik üstte.
- Eşleşen terimi vurgulama opsiyonu.
- Filtreleri geri dönüşte koru.
- Yanlış yazım veya benzer terim öner.
- Arama geçmişini silme kontrolü sun.
- Kişiselleştirmeyi şeffaflaştır.

## 16.3 Keşif

Premium keşif ekranı:

- Kullanıcıya sonsuz rastgele kart sunmaz.
- Bölümleri anlamlı başlıklarla gruplar.
- “Neden bunu görüyorum?” sorusuna cevap verebilir.
- İçeriği aynı kart şablonuyla monotonlaştırmaz.
- Yeni, popüler ve kişisel önerileri ayrıştırır.
- Kullanıcıya ilgi alanı kontrolü verir.

## 16.4 Kişiselleştirme

- İlk kullanımda aşırı soru sorma.
- Davranıştan öğren ama kontrol sun.
- Hassas çıkarımları açıklamasız kullanma.
- Kullanıcının öneriyi azaltma/gizleme seçeneği olsun.
- Reset veya tercihleri düzenleme yolu bulunmalı.
- Kişiselleştirme performansı ölçülmeli.

---

# 17. Premium abonelik ve paywall tasarımı

## 17.1 Premium değeri tanımla

Kullanıcı şunu anlayabilmeli:

- Ne açılıyor?
- Ne kadar daha iyi oluyor?
- Ne kadar ödüyor?
- Hangi sıklıkta ödüyor?
- Deneme ne zaman biter?
- İptal edince ne olur?
- Ücretsiz sürümde ne kalır?

## 17.2 Paywall anatomisi

```text
1. Sonuç odaklı başlık
2. Kısa değer açıklaması
3. 3–5 somut premium fayda
4. Plan seçimi
5. Fiyat ve faturalama sıklığı
6. Deneme/indirim şartları
7. Ana satın alma CTA
8. Restore Purchases
9. Kullanım koşulları
10. Gizlilik
11. Kapatma veya geri
12. Abonelik yönetimi bilgisi
```

## 17.3 İyi fayda yazımı

Kötü:

- Limitsiz kullanım
- Premium özellikler
- Daha fazla seçenek

İyi:

- Ayda 50 yerine sınırsız proje oluştur
- Tüm cihazlarında otomatik senkronize et
- Yüksek çözünürlüklü dışa aktar
- Reklamsız ve kesintisiz kullan
- Gelişmiş analizleri aç

## 17.4 Plan kartları

Plan kartında:

- Plan adı
- Toplam fiyat
- Faturalama dönemi
- Aylık eşdeğer gerekiyorsa
- Tasarruf oranı doğru hesapla
- Deneme süresi
- Yenileme bilgisi
- Seçili durum
- Erişilebilir label

bulunmalıdır.

## 17.5 Etik paywall

Kaçınılacak karanlık kalıplar:

- Kapatma butonunu gizlemek
- Ücretsiz seçeneği okunmaz yapmak
- Yıllık fiyatı aylıkmış gibi göstermek
- Deneme sonrası toplam ücreti saklamak
- Seçili planı fark edilmez biçimde değiştirmek
- Sahte geri sayım
- Sahte “sınırlı teklif”
- İptal yolunu karmaşıklaştırmak
- Restore Purchases’ı saklamak
- Satın alma butonunu “Devam” gibi belirsiz adlandırmak

## 17.6 Paywall ne zaman gösterilmeli?

Uygun anlar:

- Kullanıcı premium özelliğe dokunduğunda
- Ücretsiz limit anlamlı biçimde dolduğunda
- Kullanıcı ürünün değerini gördükten sonra
- Yüksek niyetli bir görevin hemen öncesi
- Başarı anı sonrasında, akışı kesmeden

Zayıf anlar:

- Uygulama ilk açılır açılmaz, ürün gösterilmeden
- Kullanıcı kritik hatayla uğraşırken
- İzin ekranlarının ortasında
- Her oturumda tekrar
- Satın almış kullanıcıya yanlışlıkla

## 17.7 iOS satın alma

- Dijital içerik ve hizmetlerde App Store kurallarını kontrol et.
- StoreKit görünümleri fiyat, süre ve yerelleştirme için güçlü bir temel sağlar.
- Restore Purchases görünür olmalı.
- Satın alma pending, canceled, failed ve succeeded durumları tasarlanmalı.
- Family Sharing, offer code veya uygun diğer modeller ürün gereksinimine göre değerlendirilmeli.
- App Review için satın alma akışı ve test bilgileri hazır olmalı.

## 17.8 Android satın alma

- Google Play Billing yaşam döngüsünü tasarla.
- Purchase doğrulaması için güvenli backend önerilir.
- Pending, grace period, account hold, canceled, expired, paused ve resubscribe durumları ele alınmalı.
- Gerçek zamanlı geliştirici bildirimleriyle abonelik durumu backend’de güncel tutulmalı.
- Kullanıcının Play subscription center’a erişimi kolaylaştırılmalı.
- Fiyat ve teklif metinleri Play’den gelen güncel bilgiyle gösterilmeli.

## 17.9 Abonelik yönetimi ekranı

Göster:

- Aktif plan
- Yenileme tarihi
- Fiyat
- Faturalama dönemi
- Kullanılan premium avantajlar
- Plan değiştir
- Aboneliği yönet
- Restore
- Destek
- Fatura/ödeme açıklaması gerekiyorsa

Not:

- Uygulama içi hesap silme, mağaza aboneliğini otomatik iptal etmeyebilir. Bu ilişki açıkça anlatılmalıdır.
- Kullanıcının sahip olduğu erişimi yanlışlıkla kilitleme.
- Server ve cihaz durumları çelişirse güvenli yeniden doğrulama yap.

## 17.10 Paywall deneyleri

Test edilebilecekler:

- Değer önerisi
- Fayda sırası
- Görsel
- Yıllık/aylık varsayılanı
- Deneme süresi
- Sosyal kanıt
- Paywall zamanı
- Soft vs hard paywall
- Metered paywall
- Tek plan vs çok plan

Test edilmemesi veya dikkat gerektirenler:

- Yanıltıcı fiyat sunumu
- Kapatma kontrolünü gizleme
- Kullanıcıya göre etik olmayan fiyat ayrımı
- Yasal metni görünmez yapma

---

# 18. Erişilebilirlik ve kapsayıcılık

Erişilebilirlik ayrı bir özellik değil, kabul kriteridir.

## 18.1 Temel gereksinimler

- VoiceOver ve TalkBack ile ana görev tamamlanabilmeli
- 44 pt / 48 dp dokunma hedefleri
- Metin büyütme
- Yeterli kontrast
- Renk dışı durum göstergesi
- Mantıklı focus/okuma sırası
- Klavye ve switch erişimi gereken cihazlarda
- Reduce Motion
- Reduce Transparency
- Caption/transcript
- Haptik/ses alternatifi
- Erişilebilir hata mesajı
- Form label’ları
- Grafikler için metin özeti

## 18.2 Screen reader kontrol listesi

- [ ] Ekran başlığı doğru okunuyor
- [ ] Geri/kapat eylemi doğru adlandırılmış
- [ ] İkon butonlarının label’ı var
- [ ] Seçili durum okunuyor
- [ ] Toggle state okunuyor
- [ ] Hata alanına odak taşınıyor
- [ ] Modal açıldığında odak modalda
- [ ] Modal kapandığında odak mantıklı yere dönüyor
- [ ] Dekoratif görseller okunmuyor
- [ ] Görsel içerik için anlamlı açıklama var
- [ ] Liste sırası mantıklı
- [ ] Gesture’ın erişilebilir alternatifi var

## 18.3 Metin büyütme

Test senaryoları:

- Standart
- Büyük
- En büyük erişilebilirlik boyutları
- Android %200 font scale veya ürünün destek hedefi
- Uzun Türkçe/Almanca metin
- Sağdan sola dil
- Büyük sayı ve para değerleri

Tasarım çözümü:

- Sabit yükseklikten kaçın
- Yatay buton grubunu dikeye çevir
- Metin + ikon ilişkisini esnek yap
- Truncation’ı yalnızca ikincil içerikte kullan
- Kritik metin için “devamını gör” veya wrap
- Scroll alanını doğru yerleştir

## 18.4 Renk körlüğü

- Başarı/hata yalnızca yeşil/kırmızı olmamalı
- Grafik serileri desen, label veya şekille ayrılmalı
- Seçili duruma check, border veya shape eklenmeli
- Harita işaretleri yalnızca renkle farklılaşmamalı

## 18.5 Otomatik ve manuel test

iOS:

- Accessibility Inspector
- Xcode accessibility audit
- VoiceOver
- Voice Control
- Switch Control
- Dynamic Type
- Reduce Motion/Transparency
- Differentiate Without Color
- Increase Contrast

Android:

- Accessibility Scanner
- TalkBack
- Switch Access
- Font scaling
- Display size
- Compose accessibility checks
- UI Check / Layout Inspector
- Renk kontrastı ve touch target testleri

Otomasyon tek başına yeterli değildir; gerçek yardımcı teknolojiyle manuel görev testi yapılmalıdır.

---

# 19. Gizlilik, güvenlik ve güven tasarımı

## 19.1 Güven tasarımı

Kullanıcı şu soruların cevabını bulabilmeli:

- Hangi veriyi topluyorsunuz?
- Neden topluyorsunuz?
- Kimle paylaşıyorsunuz?
- Veriyi nasıl silebilirim?
- Hesabımı nasıl silebilirim?
- Aboneliğimi nasıl yönetebilirim?
- Destek ekibine nasıl ulaşırım?
- Bu işlem geri alınabilir mi?
- Para çekildi mi?
- İçeriğim kaydedildi mi?

## 19.2 Veri minimizasyonu

- İhtiyacın olmayan veriyi isteme.
- Hassas veriyi loglama.
- Her SDK’nın veri davranışını denetle.
- İzin istemek yerine sistem picker kullanımı mümkünse değerlendir.
- Cihaz kimliği ve reklam kimliği kullanımını belgeleyin.
- Veri saklama süresi tanımlayın.
- Kullanıcıya veri silme ve tercihler sunun.

## 19.3 Apple App Privacy

App Store ürün sayfasındaki gizlilik bilgilerinin:

- Uygulamanın gerçek veri davranışıyla
- Entegre üçüncü taraf SDK’larla
- Analytics ve reklam kullanımıyla
- Tracking durumu ve veri bağlantısıyla

uyumlu olması gerekir.

Privacy policy:

- App Store Connect’te
- Uygulama içinde kolay erişilebilir yerde

bulunmalıdır.

## 19.4 Google Play Data Safety

Google Play’de yayınlanan uygulamalar için Data Safety bilgileri doğru ve güncel tutulmalıdır. Üçüncü taraf SDK’ların veri uygulamaları da geliştiricinin sorumluluğundadır.

Kontrol:

- Toplanan veri türleri
- Paylaşılan veri türleri
- Veri kullanım amaçları
- Şifreleme
- Silme talebi
- Hesap silme
- Çocuklara yönelik durum
- SDK envanteri
- İzinler
- Veri saklama

## 19.5 Hesap silme

Hesap oluşturulabiliyorsa:

- Uygulama içinden kolay erişim
- Sonucun açık açıklaması
- Silinecek ve saklanacak veriler
- Yasal saklama istisnaları
- İşlem süresi
- Geri dönüş imkânı varsa süre
- Abonelikle ilişkisi
- Web üzerinden ek silme yolu gerekiyorsa

tasarlanmalıdır.

## 19.6 Güvenli giriş

- Passkey değerlendirin
- Sistem credential manager kullanın
- Biyometriyi uygun riskte kullanın
- Oturum bitişini açıklayın
- Şüpheli giriş uyarısı
- Cihaz yönetimi gerekiyorsa
- Recovery akışı
- MFA gerekiyorsa erişilebilir ve yedekli yöntem

## 19.7 Güven göstergeleri

Sahte güven rozetleri yerine:

- Açık şirket/ürün bilgisi
- Güncel destek kanalı
- Net fiyat
- Kolay iptal
- İşlem makbuzu
- Son senkronizasyon zamanı
- Değişiklik geçmişi
- Gizlilik tercihleri
- Doğrulanmış kullanıcı/kurum ayrımı gerekiyorsa gerçek süreç

kullanılmalıdır.

---

# 20. Performans ve algılanan hız

Premium tasarım yavaş kodu gizlememelidir; fakat gecikmeyi yönetmelidir.

## 20.1 Algılanan hız ilkeleri

- Dokunuşa anında görsel tepki
- Önce kullanılabilir içerik
- Ağır içeriği kademeli yükleme
- Kullanıcıyı boş beyaz ekranda bekletmeme
- Cache ve optimistic UI
- Büyük görselleri doğru boyutta getirme
- Arka planda prefetch
- Gereksiz tam ekran spinner’dan kaçınma
- Liste scroll performansını koruma
- Ağ hatasında girdiyi kaybetmeme

## 20.2 Önerilen ekip içi hedefler

> Aşağıdaki değerler platform zorunluluğu değil, ekip başlangıç hedefleridir. Uygulamanın kategorisine ve cihaz kitlesine göre düzenlenmelidir.

| Alan | Başlangıç hedefi |
|---|---|
| Press feedback | ≤100 ms hissedilir geri bildirim |
| Basit state geçişi | 150–250 ms |
| Ekran geçişi | 200–350 ms |
| Ana içerik başlangıcı | Modern cihazda mümkün olduğunca <1 sn |
| Birincil API p95 | Tercihen <1.5 sn |
| Crash-free session | >%99.8 |
| ANR-free session | >%99.9 |
| Ana görev başarısı | >%95, ürün bağlamına göre |
| Kritik erişilebilirlik hatası | 0 |
| Kritik tasarım QA hatası | 0 |

## 20.3 Görsel performans

- Blur ve canlı materyalleri düşük güçlü cihazda test et
- Büyük shadow ve mask sayısını azalt
- Uzun listede karmaşık kart animasyonlarını sınırlı kullan
- Video autoplay için veri ve enerji maliyetini düşün
- Görsellerde thumbnail → full çözünürlük geçişi
- Lottie/Rive benzeri animasyonları ölçmeden ekleme
- 60/90/120 Hz cihazlarda jank testi
- Reduce Motion alternatifi
- Battery ve wake lock etkisi

## 20.4 Android Vitals

Takip edilmesi gerekenler:

- Crash
- ANR
- Startup
- Slow rendering
- Excessive wake locks
- Low memory davranışları
- Cihaz ve OS kırılımı

## 20.5 iOS kalite takibi

- Crash ve hang
- Launch süresi
- Main thread blokları
- Memory
- Energy
- Network
- Scroll ve animation hitch
- MetricKit/Xcode araçları veya uygun gözlemleme altyapısı

---

# 21. Design system ve token mimarisi

## 21.1 Token katmanları

```text
Primitive tokens
→ Semantic tokens
→ Component tokens
```

### Primitive

```text
blue-50
blue-500
gray-900
space-16
radius-12
font-size-17
```

### Semantic

```text
color-background
color-text-primary
color-action-primary
color-error
space-screen-horizontal
radius-card
type-body
```

### Component

```text
button-primary-background
button-primary-text
button-primary-height
card-padding
input-border-error
tab-selected-icon
```

## 21.2 Örnek token JSON

```json
{
  "color": {
    "background": {
      "light": "#F7F7F8",
      "dark": "#0C0C0E"
    },
    "surface": {
      "light": "#FFFFFF",
      "dark": "#17171A"
    },
    "textPrimary": {
      "light": "#151518",
      "dark": "#F7F7F8"
    },
    "accent": {
      "light": "#5B4BFF",
      "dark": "#8B82FF"
    },
    "error": {
      "light": "#C9342F",
      "dark": "#FF6B66"
    }
  },
  "space": {
    "xs": 4,
    "sm": 8,
    "md": 12,
    "lg": 16,
    "xl": 24,
    "2xl": 32
  },
  "radius": {
    "sm": 8,
    "md": 12,
    "lg": 16,
    "pill": 999
  },
  "motion": {
    "fast": 160,
    "standard": 240,
    "emphasized": 360
  }
}
```

## 21.3 Platform mapping

```text
semantic.color.background
├── iOS Color Asset / SwiftUI Color
└── Android Material ColorScheme / Compose Color

semantic.type.body
├── iOS Dynamic Type body
└── Android Material bodyLarge/bodyMedium

semantic.radius.card
├── iOS RoundedRectangle
└── Android RoundedCornerShape
```

## 21.4 Bileşen state matrisi

Her bileşen için:

| State | Görsel | Davranış | Erişilebilirlik |
|---|---|---|---|
| Default | Normal | Eyleme hazır | Label + role |
| Pressed | Press feedback | Eylem başlatır | State gerekmez |
| Focused | Focus ring | Klavye/AT | Focus görünür |
| Hover | Pointer geri bildirimi | Desktop/tablet | Yardımcı |
| Disabled | Düşük vurgu | Çalışmaz | Disabled okunur |
| Loading | Spinner/progress | Tekrar tıklanmaz | Busy |
| Selected | Renk + şekil | Durum değişir | Selected |
| Error | Error role | Düzeltme | Hata açıklaması |

## 21.5 Bileşen envanteri

Temel:

- Button
- Icon button
- Link
- Text field
- Search field
- Text area
- Checkbox
- Radio
- Switch
- Segmented control
- Chip
- Badge
- Avatar
- List item
- Card
- Top bar
- Tab/navigation item
- Bottom sheet
- Dialog
- Snackbar/inline alert
- Tooltip
- Progress
- Skeleton
- Empty state
- Error state
- Paywall plan card

Domain:

- Ürüne özgü ana kartlar
- Veri görselleri
- Üretim araçları
- Timeline
- AR kontrolü
- Medya kontrolü
- Harita işareti
- Durum göstergesi

## 21.6 Versioning

Design system değişiklikleri:

```text
Major: Kırıcı davranış veya token değişikliği
Minor: Yeni bileşen veya varyant
Patch: Görsel/erişilebilirlik düzeltmesi
```

Changelog içermeli:

- Ne değişti?
- Neden?
- Tasarım dosyası
- Kod sürümü
- Migration notu
- Etkilenen ekranlar
- Test gereksinimi

---

# 22. Figma dosya yapısı

## 22.1 Önerilen dosyalar

```text
00 — Product Foundations
01 — Brand
02 — Foundations
03 — Components
04 — Patterns
05 — iOS App
06 — Android App
07 — Tablet & Adaptive
08 — Prototypes
09 — Store Assets
10 — Archive
```

## 22.2 Sayfa yapısı

### Foundations

- Color
- Typography
- Spacing
- Grid
- Radius
- Elevation
- Iconography
- Motion
- Accessibility
- Content guidelines

### Components

Her component frame’i:

```text
Overview
Anatomy
Variants
States
Sizing
Content rules
Do / Don’t
Accessibility
Platform notes
Developer notes
Changelog
```

## 22.3 İsimlendirme

Örnek:

```text
Button/Primary/Medium/Default
Button/Primary/Medium/Loading
Input/Text/Default/Empty
Input/Text/Error/Filled
Card/Content/Compact
Navigation/Bottom/Item/Selected
```

Token:

```text
color/text/primary
color/surface/base
space/component/md
radius/card/default
motion/duration/standard
```

## 22.4 Auto Layout

- Bileşenleri içerik büyümesine dayanıklı kur
- Sabit yükseklikleri azalt
- Min/max width mantığını tanımla
- Uzun metin testleri ekle
- Icon slotlarını sabit, metni esnek yap
- Nested auto layout’ı gereksiz karmaşıklaştırma
- Component properties kullan
- Boolean properties ile ikon/alt metin görünürlüğünü yönet
- Text property ile gerçek içerik varyasyonlarını test et

## 22.5 Figma değişkenleri

Koleksiyonlar:

```text
Mode:
- Light
- Dark

Platform:
- iOS
- Android

Density/Size:
- Compact
- Regular
- Expanded

Brand:
- Default
- Campaign/Seasonal (gerekiyorsa)
```

Platform farklarını tek mega-component içinde aşırı koşullu hale getirmek yerine gerektiğinde ayrı component setleri kullan.

## 22.6 Prototip

En az şu akışlar tıklanabilir olmalı:

- İlk açılış
- Giriş
- Ana görev
- Hata düzeltme
- Premium satın alma
- Ayarlar
- Hesap silme
- Offline yeniden deneme
- Bildirim/deep link dönüşü

---

# 23. Tasarım-geliştirme teslim süreci

## 23.1 Ekran tesliminde bulunması gerekenler

- Ekran amacı
- Platform
- Giriş koşulu
- Çıkışlar
- Component isimleri
- Tokenlar
- State’ler
- API bağımlılığı
- Loading
- Empty
- Error
- Offline
- Erişilebilirlik
- Analytics event
- Animasyon
- Haptik
- Lokalizasyon notu
- Test ID önerisi
- Kabul kriterleri

## 23.2 Handoff toplantısı

Her önemli özellik için:

1. Kullanıcı amacı
2. Happy path
3. Edge cases
4. Component eşlemeleri
5. Platform farkları
6. Veri sözleşmesi
7. Analytics
8. Erişilebilirlik
9. QA senaryosu
10. Açık kararlar

## 23.3 Definition of Ready

Bir ekran geliştirmeye hazır sayılmaz, eğer:

- Loading yoksa
- Hata yoksa
- Empty yoksa
- Uzun metin test edilmediyse
- Dark mode yoksa
- Erişilebilirlik notu yoksa
- Platform farkı kararsızsa
- API verisi belli değilse
- Analytics event’i belirlenmediyse
- Kabul kriteri yoksa

## 23.4 Definition of Done

- Tasarım eşleşiyor
- Tüm state’ler çalışıyor
- Erişilebilirlik testi geçti
- Light/dark geçti
- Font scaling geçti
- Küçük/büyük ekran geçti
- Offline/hata geçti
- Analitik event doğrulandı
- Performans ölçüldü
- Ekran görüntüsü regresyon kontrolü yapıldı
- Ürün ve tasarım onayı alındı
- Kritik QA hatası sıfır

---

# 24. Yerelleştirme ve küresel tasarım

## 24.1 Tasarım gereksinimleri

- Metin genişlemesine %30–50 tolerans
- Sağdan sola düzen
- Tarih formatı
- Saat formatı
- Para birimi
- Ondalık ayırıcı
- Birim sistemi
- İsim ve adres biçimleri
- Telefon kodları
- Çoğul kuralları
- Cinsiyetli dil
- Kültürel görsel uygunluk
- Yerel ödeme/fiyat gösterimi
- Store listing yerelleştirmesi

## 24.2 Metin görsele gömülmemeli

Gerekmedikçe:

- Onboarding illüstrasyonuna metin yazma
- Store screenshot dışındaki ürün görseline sabit dil gömme
- SVG içinde çevrilemeyen label bırakma
- Marka sloganını raster görsele kilitleme

## 24.3 RTL

RTL testinde:

- Geri ikonu ve directional ikonlar
- Carousel yönü
- Progress yönü
- Tab sırası
- Timeline
- Grafik eksenleri
- Metin hizası
- Sayı ve Latin içerik karışımı
- Harita kontrolü

incelenmelidir.

## 24.4 Dil kalitesi

- Makine çevirisini doğrudan yayınlama
- Ana pazarlarda native review
- Ürün terminolojisi sözlüğü
- Kısa buton metni
- Değişken ve placeholder sırası
- Cümle parçalarını birleştirerek çeviri üretmeme

---

# 25. Analitik ve deney altyapısı

## 25.1 Event isimlendirme

Örnek yapı:

```text
screen_viewed
onboarding_started
onboarding_step_completed
account_created
permission_prompt_viewed
permission_granted
primary_action_started
primary_action_completed
primary_action_failed
paywall_viewed
plan_selected
purchase_started
purchase_completed
purchase_failed
subscription_restored
subscription_management_opened
account_deletion_started
account_deleted
```

## 25.2 Event özellikleri

- platform
- app_version
- screen
- entry_point
- user_state
- subscription_state
- plan_id
- experiment_variant
- error_type
- network_state
- locale
- device_class

Hassas veri, kullanıcı girdisi veya kişisel içerik event payload’una eklenmemelidir.

## 25.3 Funnel örneği

```text
Paywall viewed
→ Plan selected
→ Purchase started
→ Store sheet presented
→ Purchase completed
→ Entitlement activated
```

Her kayıp noktasında:

- Kullanıcı vazgeçti mi?
- Store hatası mı?
- Backend doğrulaması mı?
- Entitlement gecikmesi mi?
- Yanlış fiyat mı?
- UI bloklandı mı?

ayrıştırılmalıdır.

## 25.4 Tasarım deneyleri

İyi deney:

- Tek temel hipotez
- Önceden seçilmiş ana metrik
- Guardrail metrik
- Yeterli örneklem
- Platform ve ülke kırılımı
- Yeni ve mevcut kullanıcı ayrımı
- Sonuç sonrası kalıcılık kontrolü

Guardrail örnekleri:

- Refund
- Uninstall
- Support ticket
- Crash
- İzin reddi
- Retention düşüşü
- Abonelik iptali

---

# 26. App Store ve Google Play ürün sayfaları

Uygulama tasarımının mağaza sunumu ayrı ürün yüzeyidir.

## 26.1 App Store

Hazırlanması gerekenler:

- App icon
- Screenshots
- App previews
- Subtitle
- Promotional text
- Description
- Keywords
- Privacy details
- Support URL
- Privacy policy
- In-app purchase bilgileri
- Age rating
- Review notes
- Demo account gerekiyorsa

Apple ürün sayfasında 1–10 ekran görüntüsü yüklenebilir. App preview videoları 30 saniyeye kadar olabilir ve dil başına üç önizlemeye kadar desteklenir.

## 26.2 Google Play

Hazırlanması gerekenler:

- App icon
- Feature graphic
- Phone screenshots
- Tablet screenshots
- Kısa açıklama
- Uzun açıklama
- Video gerekiyorsa
- Data Safety
- Content rating
- Privacy policy
- App access/review credentials
- Account deletion bilgisi
- Ülke ve fiyatlandırma
- Test track

## 26.3 Screenshot hikâyesi

Önerilen sıra:

1. Ana değer önerisi
2. En güçlü özellik
3. Hız/kolaylık
4. Kişiselleştirme
5. Güven veya senkronizasyon
6. Premium fayda
7. Sosyal kanıt veya özel özellik

Kurallar:

- UI gerçek uygulamayla uyumlu olmalı
- Metin kısa
- Her görsel tek mesaj
- Küçük thumbnail’de okunabilir
- Yerelleştirme
- Farklı persona için custom product page/özel listing düşün
- Ekran görüntüsünde yalnızca dekor değil ürün kanıtı

## 26.4 App icon

- Küçük boyutta tanınabilir
- Tek güçlü fikir
- Çok küçük detay yok
- Metin yok veya çok istisnai
- Marka ile uyum
- Light/dark ve platform varyantları
- Sistem maskesini tasarım dosyasında elle kalıcı biçimde uygulamama
- Rakip ikonlarla yan yana test
- Ana ekran ve arama bağlamında test
- Apple’ın güncel ikon katmanı/materyal rehberini takip et

## 26.5 Mağaza optimizasyonu

- Apple Product Page Optimization ile ikon, screenshot ve preview varyantları test edilebilir.
- Custom Product Pages farklı özellik veya kitleleri farklı görsellerle anlatabilir.
- Google Play store listing deneyleri uygun pazarlarda kullanılabilir.
- Testte yalnızca tıklamayı değil, install sonrası aktivasyon ve retention’ı da izleyin.

---

# 27. Test stratejisi

## 27.1 Test katmanları

```text
1. Tasarım incelemesi
2. Prototip kullanılabilirlik testi
3. Component testleri
4. UI testleri
5. Erişilebilirlik testi
6. Görsel regresyon
7. Performans
8. Gerçek cihaz matrisi
9. Beta
10. Mağaza ve ödeme sandbox
```

## 27.2 Kullanılabilirlik testi

5–8 kullanıcıyla erken tur bile ciddi sorunları gösterebilir; ancak sayı hedef kitle çeşitliliğine göre artmalıdır.

Görev örnekleri:

- İlk hesabı oluştur
- Ana görevi tamamla
- Bir hatayı düzelt
- Premium planı karşılaştır
- Aboneliği yönet
- Bildirim ayarını değiştir
- Hesabı silme yolunu bul

Ölç:

- Tamamlama
- Süre
- Hata
- Geri dönüş
- Yardım ihtiyacı
- Güven düzeyi
- Beklenti ile gerçek davranış farkı

## 27.3 Cihaz matrisi

### iOS

- Küçük ekran iPhone
- Standart iPhone
- Büyük iPhone
- iPad
- Light/dark
- Büyük Dynamic Type
- Güncel iOS + desteklenen en eski sürüm
- Düşük güç modu
- Yavaş ağ/offline

### Android

- Küçük telefon
- Standart telefon
- Büyük telefon
- Düşük/orta segment cihaz
- Tablet
- Foldable
- Farklı üretici
- Gesture/3-button navigation
- Light/dark/dynamic color
- Büyük font/display size
- Güncel Android + minimum destek sürümü
- Yavaş ağ/offline

## 27.4 Ağ koşulları

- Offline
- Çok yavaş
- Yüksek latency
- Paket kaybı
- İstek ortasında bağlantı kaybı
- Yeniden bağlantı
- API 400/401/403/404/409/429/500
- Kısmi veri
- Bozuk görsel
- Timeout

## 27.5 Satın alma testleri

- Başarılı
- Kullanıcı iptal etti
- Pending
- Kart/ödeme reddi
- Store erişilemiyor
- Backend doğrulama gecikmesi
- Restore
- Zaten sahip
- Plan yükseltme
- Plan düşürme
- Yenileme
- Grace period
- Account hold
- Refund/revoke
- Entitlement cihazlar arası senkronizasyon

## 27.6 Görsel QA

- Spacing
- Font
- Weight
- Line height
- Radius
- Renk
- Shadow
- İkon
- Safe area
- Keyboard
- Scroll
- Sticky CTA
- Empty/error/loading
- Long text
- Dark mode
- Tablet
- Orientation
- Screenshot diff

---

# 28. Proje aşamaları ve teslimatlar

## Phase 0 — Ürün tanımı

Teslimatlar:

- Ürün brifi
- Hedef kullanıcı
- Rakip haritası
- Değer önerisi
- Başarı metriği
- MVP kapsamı
- Riskler

Çıkış kriteri:

- Tek cümlelik değer önerisi net
- Ana görev tanımlı
- İş modeli belirli

## Phase 1 — UX mimarisi

Teslimatlar:

- Site map
- User flows
- Wireframes
- State inventory
- İçerik gereksinimleri
- Analitik taslak

Çıkış kriteri:

- Ana görev düşük detay prototipte tamamlanıyor
- Edge case’ler görünür

## Phase 2 — Görsel yön

Teslimatlar:

- Moodboard
- 2–3 görsel yön
- Renk/typography önerisi
- Ana ekran konsepti
- Marka uyumu

Çıkış kriteri:

- Tek yön seçildi
- Kontrast ve platform uygulanabilirliği kontrol edildi

## Phase 3 — Design system

Teslimatlar:

- Foundations
- Tokens
- Components
- State’ler
- iOS/Android varyantları
- Erişilebilirlik kuralları

Çıkış kriteri:

- Ana ekranların %80’i sistem bileşenleriyle kurulabiliyor

## Phase 4 — High fidelity ekranlar

Teslimatlar:

- iOS
- Android
- Light/dark
- Tablet/adaptive
- Loading/empty/error/offline
- Paywall
- Ayarlar
- Gizlilik
- Store assets taslağı

## Phase 5 — Prototip ve test

Teslimatlar:

- Tıklanabilir prototip
- Kullanılabilirlik raporu
- Revizyon
- Motion prototipi
- Accessibility test planı

## Phase 6 — Geliştirici teslimi

Teslimatlar:

- Spec
- Assets
- Tokens
- Component mapping
- Analytics
- Acceptance criteria
- Handoff kaydı

## Phase 7 — QA ve yayın

Teslimatlar:

- Görsel QA
- A11y QA
- Payment QA
- Performance QA
- Store listing
- Review notes
- Release checklist

## Phase 8 — Optimizasyon

Teslimatlar:

- Funnel analizi
- Kullanıcı yorumları
- Paywall testleri
- Retention iyileştirme
- Design system changelog
- Roadmap

---

# 29. Ekran spesifikasyon şablonu

Bu şablon her ekran için kopyalanabilir.

```markdown
# Ekran: [Ad]

## Amaç
[Kullanıcı bu ekranda neyi tamamlar?]

## Platform
- [ ] iOS
- [ ] Android
- [ ] Tablet
- [ ] Foldable

## Giriş noktaları
- [Nereden gelir?]

## Çıkışlar
- [Nereye gider?]

## Ana CTA
[Ad ve davranış]

## İkincil eylemler
- [...]

## Veri gereksinimi
- API:
- Cache:
- Empty koşulu:
- Yetki:

## Durumlar
- [ ] Initial loading
- [ ] Refreshing
- [ ] Loaded
- [ ] Empty
- [ ] Error
- [ ] Offline
- [ ] Partial
- [ ] Disabled
- [ ] Premium locked

## Bileşenler
- [Design system component isimleri]

## Platform farkları
### iOS
- [...]

### Android
- [...]

## Erişilebilirlik
- Screen reader başlığı:
- Focus sırası:
- Dynamic Type/font scale:
- Touch targets:
- Renk dışı göstergeler:
- Reduce Motion:

## Motion
- Giriş:
- Çıkış:
- State transition:
- Haptik:

## Analytics
- screen_viewed
- primary_action_tapped
- success
- error

## Hata mesajları
- Ağ:
- Yetki:
- Validasyon:
- Sunucu:

## Lokalizasyon
- Uzun metin:
- RTL:
- Tarih/para:

## Kabul kriterleri
1. [...]
2. [...]
3. [...]
```

---

# 30. Premium kalite puanlama sistemi

Her alanı 0–5 puanla.

| Alan | 0 | 3 | 5 |
|---|---|---|---|
| Değer netliği | Anlaşılmıyor | Kısmen açık | İlk dakikada açık |
| Bilgi mimarisi | Kaotik | Kullanılabilir | Çok net ve ölçeklenebilir |
| Görsel hiyerarşi | Yok | Çoğunlukla iyi | Her ekranda tek odak |
| Tutarlılık | Rastgele | Bazı sistemler | Tam token/component sistemi |
| Platform uyumu | Kopya UI | Kısmi adaptasyon | Doğal iOS + Android |
| Erişilebilirlik | Yok | Temel | Ana akış tam erişilebilir |
| Performans hissi | Yavaş | Kabul edilebilir | Anında ve akıcı |
| Durum tasarımı | Eksik | Ana durumlar | Tüm edge case’ler |
| Metin kalitesi | Teknik | Anlaşılır | Kısa, insani, yönlendirici |
| Güven/gizlilik | Belirsiz | Temel açıklama | Şeffaf ve kontrol kullanıcıda |
| Monetizasyon | Manipülatif | Açık | Değer odaklı ve etik |
| Store sunumu | Zayıf | Uyumlu | Güçlü hikâye ve test planı |
| Tablet/adaptive | Yok | Esneyen | Gerçek adaptive layout |
| Test disiplini | Rastgele | Checklist | Otomasyon + gerçek cihaz |
| Ölçüm | Yok | Temel analytics | Funnel + deney + guardrail |

### Puan yorumu

- **0–30:** Prototip/MVP seviyesi
- **31–50:** İşlevsel fakat premium değil
- **51–60:** Güçlü ürün
- **61–69:** Premium seviyeye yakın
- **70–75:** Çok yüksek kalite; detay ve operasyon disiplini güçlü

---

# 31. Yayın öncesi kontrol listeleri

## 31.1 Ürün

- [ ] Değer önerisi ilk oturumda açık
- [ ] Ana görev minimum adımla tamamlanıyor
- [ ] İlk değer anı ölçülüyor
- [ ] Free/premium sınırı açık
- [ ] Destek akışı var
- [ ] Hesap silme var
- [ ] Gizlilik ve şartlar güncel

## 31.2 UI

- [ ] Light mode
- [ ] Dark mode
- [ ] Küçük ekran
- [ ] Büyük ekran
- [ ] Tablet
- [ ] Foldable gerekiyorsa
- [ ] Uzun metin
- [ ] RTL gerekiyorsa
- [ ] Boş durum
- [ ] Hata
- [ ] Offline
- [ ] Loading
- [ ] Partial
- [ ] Permission denied
- [ ] Premium locked

## 31.3 Erişilebilirlik

- [ ] VoiceOver
- [ ] TalkBack
- [ ] 44 pt / 48 dp
- [ ] Font scaling
- [ ] Kontrast
- [ ] Focus sırası
- [ ] Reduce Motion
- [ ] Renk dışı durum
- [ ] Klavye/pointer gerekiyorsa
- [ ] Caption/transcript
- [ ] Otomatik audit
- [ ] Manuel görev testi

## 31.4 Performans

- [ ] Cold start
- [ ] Warm start
- [ ] Scroll
- [ ] Görsel yükleme
- [ ] Yavaş ağ
- [ ] Offline
- [ ] Memory
- [ ] Battery
- [ ] Crash
- [ ] ANR/hang
- [ ] Background sync
- [ ] Büyük veri listesi

## 31.5 Abonelik

- [ ] Fiyat doğru
- [ ] Dönem açık
- [ ] Deneme şartı açık
- [ ] Restore
- [ ] Satın alma iptali
- [ ] Pending
- [ ] Başarısız ödeme
- [ ] Backend doğrulama
- [ ] Entitlement
- [ ] Plan değişikliği
- [ ] Grace/account hold
- [ ] Yönetim linki
- [ ] Hesap silme açıklaması
- [ ] Terms/privacy

## 31.6 App Store

- [ ] App icon
- [ ] Screenshots
- [ ] App preview gerekiyorsa
- [ ] Metadata
- [ ] Privacy details
- [ ] Support URL
- [ ] Privacy policy
- [ ] Demo account
- [ ] Review notes
- [ ] IAP review bilgisi
- [ ] TestFlight
- [ ] Tüm linkler çalışıyor
- [ ] Uygulama tamamlanmış ve bugsız

## 31.7 Google Play

- [ ] App icon
- [ ] Feature graphic
- [ ] Phone/tablet screenshots
- [ ] Store copy
- [ ] Data Safety
- [ ] Content rating
- [ ] App access
- [ ] Privacy policy
- [ ] Account deletion
- [ ] Billing testi
- [ ] Closed/open test
- [ ] Android Vitals
- [ ] İzin deklarasyonları
- [ ] Farklı cihaz testleri

---

# 32. Sık yapılan hatalar

## 32.1 Görsel

- Dribbble görünümünü gerçek ürüne aynen taşımak
- Kontrastı premium görünüm uğruna düşürmek
- Her şeyi kart içine koymak
- Her kartı blur yapmak
- Çok fazla font
- Çok fazla radius
- Rastgele spacing
- Aynı seviyede çok CTA
- İkon setlerini karıştırmak
- Dark mode’u otomatik ters çevirme

## 32.2 UX

- Onboarding’de uzun sunum
- Değer göstermeden üyelik
- İlk açılışta tüm izinler
- Kritik gesture için buton alternatifi yok
- Geri davranışı belirsiz
- Kapatma ve iptali karıştırmak
- Kullanıcı girdisini hata sonrası silmek
- Boş ekrana “No data”
- Hata mesajında çözüm vermemek
- Offline düşünmemek

## 32.3 Monetizasyon

- Paywall’ı gizli çıkışlı yapmak
- Fiyatı belirsiz göstermek
- Aylık eşdeğeri gerçek ücret gibi sunmak
- Restore’u unutmak
- Abonelik state’lerini yalnızca cihazda saklamak
- Satın alma sonrası entitlement gecikmesini tasarlamamak
- Mevcut aboneye paywall göstermek
- İptal/hesap silme ilişkisini açıklamamak

## 32.4 Teknik teslim

- Sadece happy path çizmek
- Component state’lerini çizmemek
- Token yerine hex/pixel notları
- Figma ve kod isimlerinin farklı olması
- Tablet ekranını son güne bırakmak
- Accessibility label vermemek
- Analytics event planlamamak
- Screenshot QA yapmamak

## 32.5 Ürün yönetimi

- Premium = daha fazla özellik sanmak
- Rakip ekranlarını kopyalamak
- Kullanıcı araştırması olmadan persona üretmek
- Tüm kullanıcıları tek onboarding’e zorlamak
- Ana metriği belirlemeden A/B test
- Tasarımı launch sonrası hiç güncellememek

---

# 33. AI/Codex için uygulanabilir promptlar

## 33.1 Tasarım sistemini koda aktarma promptu

```text
Bu mobil uygulama için platforma uyarlanmış bir design system oluştur.

Hedef:
- iOS: SwiftUI
- Android: Jetpack Compose
- Ortak semantic token isimleri
- Platforma özgü navigation ve native component davranışları

Kurallar:
1. Primitive, semantic ve component token katmanları oluştur.
2. Light ve dark mode destekle.
3. iOS Dynamic Type ve Android font scaling destekle.
4. iOS minimum hit region 44x44 pt, Android 48x48 dp olsun.
5. Renkler yalnızca semantic rollerle kullanılsın.
6. Button, input, card, list item, top bar, navigation, sheet/dialog,
   snackbar/inline alert, empty, error, skeleton ve paywall plan card oluştur.
7. Her bileşende default, pressed, focused, disabled, loading,
   selected ve error state’lerinden uygun olanları uygula.
8. Reduce Motion ve screen reader semantics ekle.
9. Tablet ve geniş ekran için adaptive layout yapısı kur.
10. Kodda magic number kullanma; tokenlardan besle.

Önce önerilen klasör yapısını ve token modelini göster, sonra kodu üret.
```

## 33.2 Mevcut uygulamayı premiumlaştırma promptu

```text
Mevcut mobil uygulamamın işlevini değiştirmeden UI/UX kalitesini
premium seviyeye çıkar.

Öncelik sırası:
1. Bilgi hiyerarşisi
2. Spacing tutarlılığı
3. Tipografi ölçeği
4. Renk ve kontrast
5. Component state’leri
6. Loading/empty/error/offline
7. Platforma özgü iOS/Android davranışları
8. Erişilebilirlik
9. Motion ve haptik
10. Performans

Yapma:
- Her yüzeye gradient koyma
- Her kartı cam/blur yapma
- Navigasyonu sırf farklı görünmek için değiştirme
- Düşük kontrastlı gri metin kullanma
- Sabit yükseklikte, metni kırpan bileşen kurma
- iOS ve Android’i birebir aynı yapma

Her ekran için:
- Ana amacı yaz
- Sorunları önem sırasıyla listele
- Yeni layout öner
- Kullanılacak design-system bileşenlerini belirt
- Tüm state’leri ekle
- Accessibility kabul kriteri yaz
```

## 33.3 Ekran üretme promptu

```text
[EKRAN ADI] ekranını üret.

Ürün:
[Ürün açıklaması]

Kullanıcı amacı:
[Somut görev]

Platform:
[iOS / Android]

Gereksinimler:
- Her ekranda tek baskın CTA
- Platform native navigation
- Light/dark mode
- Loading, empty, error, offline
- Uzun metin ve font scaling
- Screen reader semantics
- Minimum touch target
- Klavye ve safe-area/inset yönetimi
- Analytics eventleri
- Motion süresi ve Reduce Motion alternatifi
- API başarısızlığında veri kaybetmeme
- Design token dışında magic number kullanmama

Çıktı:
1. Ekran yapısı
2. Component ağacı
3. State modeli
4. Kod
5. Preview/test verileri
6. Accessibility testi
7. UI test senaryoları
```

## 33.4 Paywall promptu

```text
Etik, şeffaf ve premium bir mobil paywall tasarla.

Planlar:
[Plan bilgileri]

Premium faydalar:
[Faydalar]

Kurallar:
- Fiyat, dönem ve yenileme açık olsun.
- Deneme sonrası ücret açık olsun.
- Restore Purchases görünür olsun.
- Terms ve Privacy erişilebilir olsun.
- Kapatma kontrolü gizlenmesin.
- Yıllık fiyat aylıkmış gibi sunulmasın.
- Satın alma pending/canceled/failed/succeeded state’leri olsun.
- Mevcut aboneye paywall gösterilmesin.
- iOS StoreKit ve Android Play Billing davranışları ayrı ele alınsın.
- Screen reader ve büyük metin desteklensin.
- Paywall viewed → purchase completed funnel eventleri eklensin.
```

## 33.5 Tasarım QA promptu

```text
Bu ekran görüntülerini premium mobil ürün kalite kriterlerine göre denetle.

Her bulgu için:
- Platform
- Ekran
- Sorun
- Şiddet: Critical / High / Medium / Low
- Kullanıcı etkisi
- Tasarım düzeltmesi
- Geliştirici kabul kriteri
- Erişilebilirlik etkisi

Kontrol alanları:
- Hiyerarşi
- Spacing
- Tipografi
- Renk/kontrast
- Safe area/inset
- Touch target
- State’ler
- Klavye
- Dark mode
- Font scaling
- Loading/empty/error/offline
- Navigation/back
- Platform uyumu
- Motion
- Paywall şeffaflığı
```

---

# 34. 30-60-90 günlük uygulama planı

## İlk 30 gün — Temel

### Hafta 1

- Ürün brifi
- Ana kullanıcı
- Değer önerisi
- Rakip analizi
- Ana metrik
- MVP kapsamı

### Hafta 2

- Bilgi mimarisi
- Ana akışlar
- State envanteri
- Wireframe
- İlk prototip

### Hafta 3

- Kullanılabilirlik testi
- Görsel yön
- Renk/typography
- Platform kararı
- İlk ana ekranlar

### Hafta 4

- Foundation tokenları
- Temel componentler
- Light/dark
- iOS/Android shell
- Ana görev high fidelity

**30 gün çıktısı:** Test edilmiş ana akış ve temel design system.

## 31–60 gün — Sistem ve detay

### Hafta 5–6

- Tüm core ekranlar
- Loading/empty/error/offline
- Onboarding
- Permission
- Ayarlar
- Profil

### Hafta 7

- Paywall
- Abonelik yönetimi
- Satın alma state’leri
- Analytics planı

### Hafta 8

- Tablet/adaptive
- Accessibility
- Motion
- Handoff dokümanı
- Development başlangıcı

**60 gün çıktısı:** Geliştirmeye hazır, platforma uyarlanmış tam tasarım.

## 61–90 gün — Kalite ve yayın

### Hafta 9–10

- Gerçek uygulama görsel QA
- Cihaz matrisi
- Font scaling
- Screen reader
- Performance

### Hafta 11

- Store screenshot
- App icon final
- Metadata
- Privacy/Data Safety
- Review notes

### Hafta 12

- Beta
- Funnel doğrulama
- Kritik hata düzeltme
- Release checklist
- İlk deney roadmap’i

**90 gün çıktısı:** Yayına hazır premium mobil ürün ve ölçüm altyapısı.

---

# 35. Resmî kaynaklar

> Platform kuralları ve mağaza politikaları değişebilir. Yayın öncesinde aşağıdaki resmî sayfaların güncel sürümlerini yeniden kontrol edin.

## Apple

- Human Interface Guidelines  
  https://developer.apple.com/design/human-interface-guidelines/

- Designing for iOS  
  https://developer.apple.com/design/human-interface-guidelines/designing-for-ios

- Design Principles  
  https://developer.apple.com/design/human-interface-guidelines/design-principles

- Layout  
  https://developer.apple.com/design/human-interface-guidelines/layout

- Accessibility  
  https://developer.apple.com/design/human-interface-guidelines/accessibility

- Typography  
  https://developer.apple.com/design/human-interface-guidelines/typography

- Buttons  
  https://developer.apple.com/design/human-interface-guidelines/buttons

- Motion  
  https://developer.apple.com/design/human-interface-guidelines/motion

- Playing Haptics  
  https://developer.apple.com/design/human-interface-guidelines/playing-haptics

- Materials / Liquid Glass  
  https://developer.apple.com/design/human-interface-guidelines/materials

- Adopting Liquid Glass  
  https://developer.apple.com/documentation/TechnologyOverviews/adopting-liquid-glass

- Apple Design Resources  
  https://developer.apple.com/design/resources/

- SwiftUI  
  https://developer.apple.com/swiftui/

- App Review Guidelines  
  https://developer.apple.com/app-store/review/guidelines/

- App Review  
  https://developer.apple.com/distribute/app-review/

- In-App Purchase  
  https://developer.apple.com/in-app-purchase/

- Auto-renewable Subscriptions  
  https://developer.apple.com/app-store/subscriptions/

- App Privacy Details  
  https://developer.apple.com/app-store/app-privacy-details/

- Manage App Privacy  
  https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/

- Creating Your Product Page  
  https://developer.apple.com/app-store/product-page/

- Screenshot Specifications  
  https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/

- Product Page Optimization  
  https://developer.apple.com/app-store/product-page-optimization/

- Custom Product Pages  
  https://developer.apple.com/app-store/custom-product-pages/

- Accessibility Inspector  
  https://developer.apple.com/documentation/accessibility/accessibility-inspector

- Performing Accessibility Audits  
  https://developer.apple.com/documentation/accessibility/performing-accessibility-audits-for-your-app

## Android / Google Play

- Android Design  
  https://developer.android.com/design

- Material Design 3  
  https://m3.material.io/

- Material Components  
  https://m3.material.io/components

- Material 3 in Compose  
  https://developer.android.com/develop/ui/compose/designsystems/material3

- Jetpack Compose  
  https://developer.android.com/compose

- Adapt Layouts  
  https://developer.android.com/design/ui/mobile/guides/layout-and-content/adapt-layout

- Grids and Units  
  https://developer.android.com/design/ui/mobile/guides/layout-and-content/grids-and-units

- Adaptive Apps  
  https://developer.android.com/develop/adaptive-apps/guides/get-started-with-adaptive-apps

- Window Size Classes  
  https://developer.android.com/develop/adaptive-apps/guides/use-window-size-classes

- System Bars / Edge-to-edge  
  https://developer.android.com/design/ui/mobile/guides/foundations/system-bars

- Android Accessibility  
  https://developer.android.com/guide/topics/ui/accessibility

- Make Apps More Accessible  
  https://developer.android.com/guide/topics/ui/accessibility/apps

- Accessibility in Compose  
  https://developer.android.com/develop/ui/compose/accessibility

- Compose Accessibility Testing  
  https://developer.android.com/develop/ui/compose/accessibility/testing

- Android Vitals  
  https://developer.android.com/topic/performance/vitals

- Privacy Checklist  
  https://developer.android.com/privacy-and-security/about

- Security Checklist  
  https://developer.android.com/privacy-and-security/security-tips

- Google Play Billing  
  https://developer.android.com/google/play/billing

- Subscriptions  
  https://developer.android.com/google/play/billing/subscriptions

- Billing Backend  
  https://developer.android.com/google/play/billing/backend

- Data Safety Form  
  https://support.google.com/googleplay/android-developer/answer/10787469

- User Data Policy  
  https://support.google.com/googleplay/android-developer/answer/10144311

- Account Deletion Requirements  
  https://support.google.com/googleplay/android-developer/answer/13327111

- Store Listing Best Practices  
  https://developer.android.com/distribute/best-practices/launch/store-listing

## Erişilebilirlik

- WCAG 2.2  
  https://www.w3.org/TR/WCAG22/

- WCAG Contrast Technique 4.5:1  
  https://www.w3.org/WAI/WCAG22/Techniques/general/G18

- WCAG Non-text Contrast  
  https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast


## OpenAI Codex

- Codex documentation  
  https://developers.openai.com/codex

- Custom instructions with AGENTS.md  
  https://developers.openai.com/codex/agent-configuration/agents-md

- Build reusable Codex skills  
  https://developers.openai.com/codex/build-skills

- Using PLANS.md / execution plans  
  https://developers.openai.com/cookbook/articles/codex_exec_plans

- Codex product overview  
  https://openai.com/codex/

---

# 36. Çoklu uygulama portföy mimarisi

On altı uygulamayı ayrı ayrı tasarlamak, aynı hataları on altı kez üretir. Buna karşılık her şeyi tek bir UI kitine zorlamak da uygulamaları kimliksizleştirir. Doğru yaklaşım, **paylaşılan kalite altyapısı + kontrollü marka varyasyonu + platforma özgü uygulama** modelidir.

## 36.1 Portföy katmanları

| Katman | Paylaşım düzeyi | İçerik |
|---|---:|---|
| Quality foundation | %100 ortak | Erişilebilirlik, performans, güvenlik, test, state yönetimi, analytics kuralları |
| Primitive tokens | %80–100 ortak | Spacing, grid, temel type scale, motion süreleri, minimum touch target |
| Semantic tokens | %50–80 ortak | Surface, content, border, accent, success, warning, danger rolleri |
| Component contracts | %80–100 ortak | API, state, erişilebilirlik, loading/error davranışı |
| Component appearance | %30–70 ortak | Radius, stroke, elevation, tint, typography seçimi |
| App flows | %10–40 ortak | Onboarding, ödeme, ayarlar gibi tekrar eden iskeletler |
| Product content | Uygulamaya özel | Özellikler, bilgi mimarisi, veri modeli, metin ve görseller |
| Brand expression | Uygulamaya özel | Logo, art direction, illustration, hero motion, tonal voice |

## 36.2 Portföy design system yapısı

```text
portfolio-design-system/
├── foundations/
│   ├── color-primitives.json
│   ├── spacing.json
│   ├── typography.json
│   ├── motion.json
│   ├── elevation.json
│   └── accessibility.json
├── semantics/
│   ├── light.json
│   ├── dark.json
│   └── high-contrast.json
├── components/
│   ├── button.md
│   ├── text-field.md
│   ├── card.md
│   ├── navigation.md
│   ├── dialog.md
│   └── state-view.md
├── platforms/
│   ├── ios-mapping.md
│   ├── android-mapping.md
│   ├── flutter-mapping.md
│   └── react-native-mapping.md
├── themes/
│   ├── app-a.json
│   ├── app-b.json
│   └── ...
└── changelog.md
```

## 36.3 Theme manifest

Her uygulamanın tasarım karakteri bir tema manifestiyle tanımlanmalıdır. Bu dosya görsel tercihleri dağınık promptlardan çıkarıp sürümlenebilir hale getirir.

```yaml
app:
  id: example_app
  display_name: Example
  category: productivity
  audience: independent creators
  brand_traits:
    - calm
    - precise
    - optimistic
  avoid_traits:
    - childish
    - flashy
    - corporate

visual_direction:
  archetype: quiet_editorial
  density: comfortable
  corner_style: restrained
  imagery: documentary
  icon_style: rounded_monoline
  surface_style: mostly_flat
  glass_usage: navigation_only
  gradient_usage: hero_only

color:
  brand_seed: "#5A5FEF"
  accent_strategy: single_accent
  dynamic_color_android: opt_in
  dark_mode: true_black_optional

motion:
  personality: calm_precise
  intensity: low
  haptics: meaningful_only

content:
  voice: direct_supportive
  sentence_length: short
  emoji: never

platform:
  ios:
    prefer_system_components: true
    liquid_glass_scope: chrome
  android:
    material_expressive_level: moderate
    edge_to_edge: true
    adaptive_layout: required
```

## 36.4 Ne paylaşılmamalı?

Aşağıdaki unsurları bütün uygulamalarda birebir paylaşmak portföyün değerini düşürür:

- Aynı onboarding başlıkları
- Aynı hero illustration
- Aynı uygulama ikonu formülü
- Aynı ana ekran kompozisyonu
- Aynı gradient
- Aynı paywall görseli
- Aynı marka tonu
- Aynı içerik yoğunluğu
- Aynı animasyon kişiliği
- Ürün bağlamından kopuk aynı boş durum çizimleri

## 36.5 Portföy bileşen yönetişimi

Her paylaşılan bileşenin bir sahibi ve yaşam döngüsü olmalıdır.

```text
PROPOSED → EXPERIMENTAL → STABLE → DEPRECATED → REMOVED
```

### Stable olma kriterleri

- En az iki uygulamada kullanılmış olmalı.
- iOS ve Android platform farkları tanımlanmış olmalı.
- Light, dark, high contrast varyantları bulunmalı.
- Screen reader ve font scaling testi geçmeli.
- Loading, disabled, error ve pressed state’leri bulunmalı.
- Screenshot testleri bulunmalı.
- API’si ürün metnini veya domain mantığını içine gömmemeli.

## 36.6 Token sürümleme

Token değişiklikleri semantik sürümleme ile yönetilebilir:

```text
MAJOR: Token adı veya anlamı kırılıyor.
MINOR: Yeni token veya geriye uyumlu varyant ekleniyor.
PATCH: Değer iyileştirmesi, kontrast veya küçük görsel düzeltme.
```

Örnek:

```text
2.3.1
│ │ └─ Koyu mod border kontrast düzeltmesi
│ └── Yeni compact density seti
└──── Semantic color isimlerinin yeniden yapılandırılması
```

## 36.7 Portföyde deney paylaşımı

Bir uygulamadaki başarılı deney diğer uygulamaya otomatik kopyalanmamalıdır. Önce şu sorular sorulmalıdır:

- Kullanıcı motivasyonu aynı mı?
- Trafik kaynağı aynı mı?
- Ücretli değer önerisi aynı mı?
- Kullanım sıklığı aynı mı?
- Deneyin sonucu kısa dönem dönüşüm mü, uzun dönem retention mı?
- Başarı, marka güvenini azalttı mı?

Paylaşılabilecek şey çoğunlukla **sonuç değil, hipotez ve test yöntemi**dir.

## 36.8 Portföy bağımlılık kuralı

Uygulamalar birbirlerinin kaynak koduna doğrudan bağımlı olmamalıdır. Ortak tasarım ve altyapı paketleri ayrı sürümlenmelidir. Bir uygulama güncellenmediğinde diğerlerinin yayınını engelleyen merkezi bağımlılık yapısı kurmayın.

## 36.9 Portföy kalite panosu

Her uygulama için en az aşağıdaki sütunları tutun:

| Alan | Örnek |
|---|---|
| App | Uygulama adı |
| Platform | iOS / Android |
| Stack | SwiftUI / Compose / Flutter / RN |
| Design system version | 2.3.1 |
| Premium score | 78/100 |
| Critical flow pass rate | %94 |
| Accessibility status | Yellow |
| Crash / ANR status | Green |
| Startup status | Yellow |
| Paywall compliance | Green |
| Store assets freshness | 4 ay |
| Next action | Search redesign |
| Owner | Kişi / agent |

---

# 37. Premium bileşen sözleşmeleri

Premium kalite, ekran ekran çizimden çok bileşen davranışının eksiksiz tanımlanmasıyla korunur. Her bileşen bir **sözleşme** olarak ele alınmalıdır.

## 37.1 Her bileşen sözleşmesinde bulunması gerekenler

```markdown
# Component: [Ad]

## Purpose
Hangi problemi çözer?

## Do / Don't
Ne zaman kullanılmalı, ne zaman kullanılmamalı?

## Variants
Primary, secondary, destructive vb.

## Sizes
Compact, regular, large.

## States
Default, pressed, focused, hovered, selected, loading,
disabled, error, success, read-only.

## Anatomy
Label, icon, supporting text, badge, progress vb.

## Content rules
Karakter sınırı, satır sayısı, fiil kullanımı.

## Layout
Padding, minimum size, alignment, wrapping.

## Accessibility
Role, label, value, hint, focus order, contrast, touch target.

## Platform mapping
iOS ve Android davranış farkları.

## Motion and haptics
Geçiş, süre, reduce motion davranışı.

## Analytics
Hangi event component içinde değil, çağıran ekranda üretilir?

## Test matrix
Snapshot, interaction, accessibility ve localization testleri.
```

## 37.2 Button

### Variant’lar

- Primary
- Secondary
- Tertiary / text
- Destructive
- Icon-only
- Floating action — yalnızca bağlama uygunsa
- Split veya menu button — karmaşık aksiyonlarda

### Premium kurallar

- Bir görünümde bir baskın primary CTA tercih edilir.
- Label eylem fiiliyle başlamalı: “Kaydet”, “Devam et”, “Planı başlat”.
- “Tamam” yalnızca sonuç açık olduğunda kullanılmalı.
- Disabled button neden pasif olduğunu açıklamıyorsa genellikle kötü UX’tir.
- Ağ isteğinde buton anında feedback vermeli; çift gönderim engellenmeli.
- Loading state label genişliğini zıplatmamalı.
- Icon-only butonlar erişilebilir ada ve gerektiğinde tooltip’e sahip olmalı.
- Destructive eylem, primary marka rengiyle sunulmamalı.

### Button state matrisi

| State | Görsel | Davranış | Erişilebilirlik |
|---|---|---|---|
| Default | Normal emphasis | Tıklanabilir | Role=button |
| Pressed | Kısa opacity/scale veya native feedback | Tek işlem | State duyurusu gerekmez |
| Focused | Belirgin focus ring | Klavye/assistive input | Focus görünür |
| Loading | Progress + sabit ölçü | Tekrar tıklama kapalı | “İşleniyor” duyurusu |
| Disabled | Azaltılmış emphasis | İşlem yok | Neden yakında açıklanır |
| Success | Kısa onay | Gerekirse sonraki adıma geçer | Sonuç duyurulur |
| Error | Normal hale dönüş + hata | Retry mümkün | Hata metnine focus |

## 37.3 Text field

Premium text field sadece kutu değildir; label, veri biçimi, validasyon, yardımcı metin, hata ve klavye davranışının toplamıdır.

### Zorunlu davranışlar

- Placeholder kalıcı label yerine kullanılmamalı.
- Uygun keyboard type ve content type seçilmeli.
- Otomatik düzeltme, büyük harf ve güvenli giriş bağlama göre ayarlanmalı.
- Hata yalnızca renkle anlatılmamalı.
- Hata metni “Geçersiz” yerine düzeltme yolunu söylemeli.
- Uzun formlarda alanlar bölümlere ayrılmalı.
- Kaydedilmemiş değişikliklerde çıkış davranışı tanımlanmalı.
- Password alanında görünürlük kontrolü ve parola yöneticisi uyumu olmalı.
- OTP kodu otomatik doldurma desteklenmeli.

### Validation stratejisi

| Veri | Önerilen zaman |
|---|---|
| Zorunlu alan | Kullanıcı alanı terk ettiğinde veya submit’te |
| E-posta biçimi | Yazım bitince / blur |
| Kullanıcı adı uygunluğu | Debounce edilmiş sunucu kontrolü |
| Parola gücü | Yazarken, cezalandırıcı olmayan biçimde |
| Kupon | Kullanıcı açıkça “Uygula” dediğinde |
| Kart / ödeme | Alan bazlı erken uyarı + submit doğrulaması |

## 37.4 Selection controls

- Tek seçim: radio veya platforma uygun selection list.
- Açık/kapalı anlık ayar: switch.
- Bir form seçeneğini işaretleme: checkbox.
- Küçük filtre seti: chip.
- Büyük veya aranabilir set: ayrı seçim ekranı.

Switch ile “Kaydet” butonunu aynı anda kullanmak anlam belirsizliği yaratabilir. Switch genellikle anında uygulanır.

## 37.5 Card

Kart, premium tasarımın en fazla kötüye kullanılan bileşenidir.

### Kart kullan

- İçerik bağımsız bir nesneyse
- Bir bütün olarak açılabiliyorsa
- Farklı bilgi gruplarını ayırmak gerekiyorsa
- Grid veya feed düzeninde nesne tekrar ediyorsa

### Kart kullanma

- Her satırı ayrı kutuya dönüştürmek için
- Sadece gölge eklemek için
- Hiyerarşi kuramadığınız için
- İç içe üç kart üretmek için
- Liste ayırıcıları yeterliyken

Kartta tıklanabilir bölge bütün kart mı, belirli buton mu açık olmalıdır. İki davranış çakışıyorsa accessibility ve yanlış dokunma riski oluşur.

## 37.6 List row

Anatomi:

```text
[Leading] [Title                    ] [Trailing]
          [Supporting text          ] [Chevron ]
          [Metadata / status         ]
```

Kurallar:

- Satır yüksekliği içeriğe ve font scaling’e uyum sağlamalı.
- Tüm satır tıklanıyorsa ayrı küçük chevron hit target’ı yaratılmamalı.
- Kritik durum sadece küçük renkli noktayla anlatılmamalı.
- Swipe action keşfedilebilir tek yol olmamalı.
- Çoklu seçim modu görünür biçimde başlamalı ve bitmeli.

## 37.7 Navigation components

### Tab bar / navigation bar

- En sık kullanılan 3–5 üst seviye hedef.
- Bir sekme başka sekmenin modalı gibi davranmamalı.
- Sekme seçildiğinde beklenen root veya korunmuş state davranışı açık olmalı.
- Badge, yalnızca gerçek ve eyleme geçirilebilir yenilik için kullanılmalı.
- Kullanıcı badge’i temizlemenin yolunu anlayabilmeli.

### Top app bar / navigation bar

- Başlık, geri davranışı ve bağlamsal eylemler dengelenmeli.
- Aynı ekranda çok sayıda ikon yerine overflow menu kullanılabilir.
- Kritik eylem yalnızca anlaşılması zor bir simgeye bırakılmamalı.
- Scroll ile collapse davranışı içerik okunabilirliğini bozmamalı.

## 37.8 Sheet, dialog ve full-screen flow

| Pattern | Kullanım |
|---|---|
| Bottom sheet | Kısa bağlamsal seçenek veya yardımcı görev |
| Modal sheet | Orta uzunlukta bağımsız görev |
| Dialog | Kısa karar, onay veya kritik uyarı |
| Full screen | Odak gerektiren, çok adımlı veya karmaşık görev |

Kurallar:

- Dialog içinde uzun form kullanmayın.
- Sheet’in nasıl kapanacağı açık olmalı.
- Drag ile kapanma veri kaybı yaratıyorsa engellenmeli veya onay istenmeli.
- Modal üstüne modal yığılmamalı.
- Klavye açıldığında CTA görünmez hale gelmemeli.

## 37.9 Snackbar, toast ve banner

- Toast kritik bilgi için uygun değildir; kaybolur ve erişilebilirliği zayıftır.
- Snackbar kısa işlem sonucu ve geri alma için uygundur.
- Banner kalıcı veya kullanıcı eylemi gerektiren sistem durumu içindir.
- Form hatası formun yakınında gösterilmelidir.
- Ağ kesintisi bütün uygulamayı etkiliyorsa global status surface kullanılabilir.

## 37.10 Progress

- Süre biliniyorsa determinate progress.
- Süre belirsizse indeterminate progress.
- 300 ms’den kısa işlemlerde spinner göstermek titreşim yaratabilir.
- Uzun işlemlerde kullanıcı uygulamadan çıkabilir mi, işlem devam eder mi açıklanmalı.
- Upload ve export işlemlerinde iptal/retry davranışı tanımlanmalı.
- “%100” gösterildikten sonra uzun süre bekletmeyin.

## 37.11 State view

Her empty/error/offline bileşeni şu anatomiyi desteklemelidir:

```text
Optional visual
Clear title
One-sentence explanation
Primary recovery action
Optional secondary action
Optional diagnostics / support path
```

State view, ürünün gerçek bağlamına göre yazılmalı. “Henüz hiçbir şey yok” yerine “İlk koleksiyonunu oluştur” gibi sonraki adımı göstermelidir.

## 37.12 Search

- Son aramalar, öneriler ve filtreler için ayrı state’ler.
- Sonuç sayısı çoksa scope ve sort kontrolü.
- Yazım hatası toleransı ve yakın sonuç önerisi.
- Sıfır sonuçta query’yi kaybetmeden düzeltme seçenekleri.
- Search focus, cancel ve geri davranışı platforma doğal olmalı.
- Büyük ekranlarda arama sonuçları ve detay iki panel olabilir.

## 37.13 Image and media

- Aspect ratio önceden ayrılmalı; layout shift olmamalı.
- Placeholder, içeriğin baskın rengine veya nötr yüzeye uyabilir.
- Görsel başarısızlığında retry ve alternatif bilgi.
- Dekoratif görseller screen reader’dan gizlenmeli.
- Video otomatik oynatılıyorsa sessiz, kontrol edilebilir ve kullanıcı tercihine saygılı olmalı.
- Veri tasarrufu ve düşük güç modunda kalite düşürme stratejisi bulunmalı.

## 37.14 Component “done” kriteri

Bir bileşen aşağıdakiler olmadan bitmiş kabul edilmez:

- Light/dark
- Küçük/büyük ekran
- En uzun desteklenen dil
- Büyük font
- Screen reader
- Klavye/focus gerekiyorsa
- Loading/error/disabled
- Snapshot tests
- Platform mapping
- Dokümante edilmiş content constraints

---

# 38. Ekran ve akış pattern kütüphanesi

Bu bölüm ekranları kopyalamak için değil, her ekranın **amaç, hiyerarşi, state ve kabul kriterini** hızlı tanımlamak için kullanılmalıdır.

## 38.1 Launch / cold start

Amaç: Kullanıcıyı bekletmek değil, uygulamayı kararlı biçimde başlatmak.

- Splash, zorunlu minimum süreye bağlanmamalı.
- Ağ çağrıları splash’i sınırsız bloke etmemeli.
- Oturum, remote config ve migration işlemleri hata toleranslı olmalı.
- İlk çizilebilir ekran mümkün olduğunca erken gösterilmeli.
- Kritik olmayan SDK’lar sonradan başlatılmalı.
- Kullanıcı daha önce bir iş üzerinde kaldıysa bağlam korunmalı.

## 38.2 Home / dashboard

Ana ekran şu üç modelden biri olmalıdır:

| Model | Uygun ürün |
|---|---|
| Continue / resume | Eğitim, okuma, üretkenlik, medya |
| Overview / dashboard | Finans, sağlık, analitik, proje yönetimi |
| Discovery / feed | Sosyal, içerik, marketplace, moda |

Her home ekranında “her şeyi gösterme” hatasından kaçının. Üç katman yeterlidir:

1. Şu an en önemli durum
2. En olası sonraki eylem
3. İkincil keşif veya geçmiş

## 38.3 Detail

- Nesnenin adı ve temel kimliği
- Kullanıcının karar vermesi için kritik bilgi
- Primary action
- Secondary actions
- Durum, sahiplik ve güncellik
- İlişkili içerik
- Error / deleted / unavailable state
- Paylaşım veya dışa aktarma gerekiyorsa güvenli akış

Detail ekranı tüm veritabanı alanlarının dökümü değildir. Bilgi göreve göre sıralanır.

## 38.4 Create / edit

- Başlangıç state’i: boş, template veya duplicate
- Autosave davranışı
- Zorunlu ve opsiyonel alanlar
- Draft statüsü
- Kaydetme, iptal ve çıkış
- Upload progress
- Validation ve server conflict
- Başarı sonrası hedef

Uzun create akışlarında “tek dev form” yerine adımlar, bölümler veya progressive disclosure kullanın.

## 38.5 Feed

- Feed’in sıralama mantığı kullanıcıya zarar verecek kadar belirsiz olmamalı.
- Scroll pozisyonu geri dönüşte korunmalı.
- Skeleton’lar gerçek kart ölçülerini yansıtmalı.
- Infinite scroll sonu veya devam durumu olmalı.
- İçerik tekrarları ve duplicate yüklemeler önlenmeli.
- UGC ise report, mute, block ve moderation akışları erişilebilir olmalı.

## 38.6 Search results

State listesi:

```text
idle
focused_empty_query
recent_queries
suggestions_loading
suggestions_loaded
results_loading
results_partial
results_loaded
zero_results
network_error
permission_limited
```

## 38.7 Profile

Profil türünü netleştirin:

- Kullanıcının kendi hesabı
- Başka bir kullanıcı
- Creator / professional
- Organization / brand
- Public / private

Takip, mesaj, düzenle, paylaş ve report eylemleri aynı prominence düzeyinde olmamalıdır.

## 38.8 Settings

Önerilen bilgi mimarisi:

```text
Account
Subscription / Purchases
Notifications
Appearance
Accessibility
Privacy and Permissions
Data and Storage
Help and Support
Legal
About
Sign out / Delete account
```

Ayar ekranı ürünün çöplüğü değildir. Sık kullanılan tercihleri bağlama yakın sunmak daha iyidir.

## 38.9 Paywall

State’ler:

- Default offer
- Trial eligible
- Intro offer eligible
- Existing subscriber
- Grace period
- Billing issue
- Purchase pending
- Purchase success
- Purchase failed
- Restore in progress
- Restore success / nothing found
- Family/shared entitlement varsa ilgili durum

## 38.10 Camera / scanner

- Kamera izni öncesi bağlam
- Viewfinder ve çekim rehberi
- Düşük ışık / blur / uzaklık uyarısı
- Çekim sonrası review
- Retake
- Upload / processing
- Permission denied
- Camera unavailable
- Privacy göstergesi
- Gallery import alternatifi

## 38.11 Map

- Kullanıcı konumu ile seçili nokta ayrılmalı.
- Harita üstü kontrol sayısı sınırlı tutulmalı.
- Liste alternatifi bulunmalı.
- Marker clustering ve yoğunluk yönetimi olmalı.
- Konum izni reddedildiğinde şehir/arama ile devam edilebilmeli.
- Bottom sheet haritayı tamamen kapatmamalı.
- Screen reader için erişilebilir sonuç listesi sağlanmalı.

## 38.12 Chat / messaging

- Sending, sent, delivered, read, failed state’leri
- Retry
- Offline queue
- Attachment progress
- Message edit/delete policy
- Timestamp grouping
- New message indicator
- Block/report
- Spam güvenliği
- Empty conversation
- Conversation deleted / unavailable
- Large text ve VoiceOver sırası

## 38.13 AI chat / assistant

Bölüm 45’e ek olarak ekran pattern’i:

```text
empty suggestions
prompt composing
uploading context
queued
streaming
tool_running
partial answer
answer complete
answer with sources
answer uncertainty
recoverable failure
rate limited
cancelled
feedback submitted
```

## 38.14 Media player

- Play/pause, seek, speed, captions
- Lock-screen / background davranışı
- Audio route değişimi
- Network quality
- Resume position
- Mini player
- Error and retry
- Accessibility transcript
- Reduced motion
- Autoplay preference

## 38.15 Upload manager

Tekil progress göstergesi yerine işlem merkezi gerekebilir:

- Kuyruktaki öğeler
- Devam edenler
- Tamamlananlar
- Başarısızlar
- Retry all
- Wi-Fi only tercihi
- Background continuation
- Duplicate detection
- Dosya boyutu / format hatası

## 38.16 Notification center

- Okundu/okunmadı durumunun anlamı olmalı.
- Bildirimler action-oriented gruplandırılmalı.
- Tümünü okundu işaretle geri alınabilir olabilir.
- Eski veya artık geçersiz hedefler düzgün fallback vermeli.
- Sistem push bildirimi ile uygulama içi inbox aynı kaynak olabilir ama farklı görev çözer.

## 38.17 Support

Premium destek ekranı:

- Aranabilir yardım
- Sık kullanılan çözümler
- Tanılama bilgilerini kopyalama
- İletişim seçeneği
- Yanıt beklentisi
- Abonelik ve fatura yönlendirmesi
- Privacy / account deletion
- Uygulama sürümü ve cihaz bilgisi

## 38.18 Domain bazlı pattern seçimi

| Uygulama türü | Premium hissi en çok belirleyen alan |
|---|---|
| Productivity | Hız, klavye, autosave, undo, bilgi yoğunluğu |
| Social / community | İçerik kalitesi, moderation, feed kontrolü, trust |
| Marketplace | Arama, filtre, görsel kalite, güven, checkout |
| Finance | Doğruluk, tarih/saat, açıklanabilirlik, güvenlik, error prevention |
| Wellness | Sakinlik, gizlilik, progress, erişilebilir dil |
| Education | Devamlılık, feedback, mastery, offline içerik |
| Travel | Offline, harita, zaman dilimi, rezervasyon güveni |
| Media | Playback kalitesi, resume, download, discovery |
| Utility | İlk açılış hızı, tek göreve odak, sistem entegrasyonu |
| Camera / AR | İzin, rehberlik, tracking kararlılığı, gerçek zamanlı feedback |
| Creator tool | Undo, history, export, precision controls, draft safety |
| AI tool | Beklenti yönetimi, kontrol, kaynak, latency ve privacy |

## 38.19 Kritik kullanıcı yolculuğu şablonu

```markdown
# Critical User Journey: [Ad]

## User intent
Kullanıcı hangi sonucu elde etmek istiyor?

## Entry points
Push, deep link, home, search, widget vb.

## Preconditions
Oturum, izin, entitlement, network, veri.

## Happy path
1.
2.
3.

## Alternative paths
- Guest
- Offline
- Permission denied
- Existing data

## Failure paths
- Timeout
- Validation
- Server conflict
- Payment failure
- Partial upload

## Recovery
Kullanıcı nereden ve nasıl devam eder?

## Exit criteria
Başarı nasıl anlaşılır?

## Analytics
Start, step, complete, fail, abandon.

## Quality targets
Süre, adım sayısı, accessibility ve performance.
```

---

# 39. Adaptive tasarım: tablet, foldable ve yeniden boyutlandırma

Responsive tasarım yalnızca elemanların genişlemesi değildir. Ekran alanı arttıkça bilgi mimarisi, navigasyon ve görev paralelliği gelişmelidir.

## 39.1 Window-first yaklaşımı

Cihaz adına göre değil, mevcut pencere boyutuna göre tasarlayın. Aynı tablet split-screen’de telefon genişliğine düşebilir; foldable farklı postürlerde değişebilir.

```text
Compact: Tek panel, alt navigasyon, modal detay
Medium: Navigation rail veya genişletilmiş içerik
Expanded: İki/üç panel, kalıcı yan içerik, daha yüksek bilgi yoğunluğu
```

Breakpoint değerleri stack ve platform rehberine göre uygulanmalıdır; ürün mantığı yalnızca “tablet mi?” koşuluna bağlanmamalıdır.

## 39.2 Layout dönüşümleri

| Compact | Medium / Expanded |
|---|---|
| Bottom navigation | Navigation rail / sidebar |
| List → push detail | List + detail |
| Full-screen filter | Side panel / anchored popover |
| Single-column form | Grouped two-column form |
| Modal preview | Persistent inspector |
| Bottom sheet | Side sheet / panel |
| Carousel | Grid |
| Hidden metadata | Secondary column |

## 39.3 Maksimum içerik genişliği

Metin ve formlar geniş ekranın tamamına yayılmamalıdır.

- Uzun okuma: kontrollü satır uzunluğu
- Form: merkezi veya iki kolonlu yapı
- Dashboard: grid ve panel sistemi
- Görsel içerik: bağlama göre daha geniş olabilir
- Full-bleed medya ile okunabilir metin yüzeyi ayrılmalı

## 39.4 iPad premium beklentisi

- Split View ve Stage Manager senaryolarını test edin.
- Sidebar, toolbar ve keyboard shortcuts düşünün.
- Pointer hover ve context menu desteği sağlayın.
- Drag and drop ürün için anlamlıysa doğal davranmalı.
- Çoklu pencere, doküman veya çalışma alanı ürünlerinde değerlendirilmeli.
- Sheet ölçüleri iPhone kopyası gibi görünmemeli.
- Landscape yalnızca stretched portrait olmamalı.

## 39.5 Android tablet ve foldable beklentisi

- Adaptive quality tier hedefini belirleyin: ready, optimized, differentiated.
- Orientation ve resizability varsayımlarına güvenmeyin.
- Multi-window, keyboard, mouse, trackpad ve stylus test edin.
- List-detail ve supporting pane pattern’lerini kullanın.
- Fold posture, hinge ve occlusion bölgelerini dikkate alın.
- Büyük ekran mağaza görselleri sağlayın.
- Navigation rail/drawer seçimini pencere ve içerik yapısına göre yapın.

## 39.6 Foldable postürleri

| Postür | Tasarım fırsatı |
|---|---|
| Book | Sol navigasyon / liste, sağ detay |
| Tabletop | Üstte içerik, altta kontroller |
| Flat expanded | Tablet benzeri çok panel |
| Folded compact | Tek panel telefon akışı |

Hinge’in üzerine kritik kontrol, metin veya yüz yerleştirmeyin.

## 39.7 Keyboard ve pointer

Premium büyük ekran uygulaması yalnızca touch değildir.

- Focus sırası mantıklı olmalı.
- Focus ring görünür olmalı.
- Escape, Enter, Space ve ok tuşları doğru çalışmalı.
- Hover bilgi vermeli ama temel fonksiyon için zorunlu olmamalı.
- Context menu yalnızca gizli tek erişim yolu olmamalı.
- Klavye kısayolları keşfedilebilir olmalı.
- Tab ile tüm interaktif kontroller erişilebilir olmalı.

## 39.8 Adaptive component API

Koda “isTablet” boolean’ı yaymak yerine layout state kullanın.

```text
WindowClass
NavigationMode
ContentColumns
PaneStrategy
InputMode
Posture
SafeArea / Insets
```

Böylece aynı bileşen farklı cihazlarda kontrollü biçimde dönüşür.

## 39.9 Adaptive QA matrisi

En az şu kombinasyonları test edin:

- Küçük telefon / büyük font
- Büyük telefon / landscape
- Tablet / portrait
- Tablet / landscape
- Tablet / split 50–50
- Tablet / dar floating window
- Folded
- Unfolded book posture
- External keyboard
- Mouse/trackpad
- Screen reader + large screen
- RTL + expanded layout

## 39.10 Adaptive done kriteri

- Kritik akış hiçbir pencere boyutunda bloke olmuyor.
- İçerik gereksiz boşlukta kaybolmuyor.
- Navigasyon pencereye göre dönüşüyor.
- Dialog ve menu’ler doğru anchor’da açılıyor.
- Focus, keyboard ve pointer çalışıyor.
- State korunuyor; resize sonrası veri kaybolmuyor.
- Hinge/inset sistemleriyle çakışma yok.
- Store listing büyük ekran deneyimini doğru gösteriyor.

---

# 40. Premium görsel yön ve marka mimarisi

“Premium” tek bir stil değildir. Sessiz lüks, profesyonel araç, editoryal ürün veya expressive teknoloji birbirinden farklı premium yönlerdir. Önce karakter seçilmeli, sonra sistematik uygulanmalıdır.

## 40.1 Görsel arketipler

| Arketip | Özellik | Uygun ürün | Risk |
|---|---|---|---|
| Quiet luxury | Az renk, güçlü boşluk, rafine tipografi | Wellness, finance, membership | Fazla soğuk ve düşük kontrast |
| Editorial | Büyük tipografi, güçlü görsel ritim | Fashion, culture, reading | İçerik kalitesine bağımlı |
| Precision pro | Yoğun ama düzenli, veri odaklı | Creator, analytics, productivity | Fazla teknik ve sert |
| Expressive tech | Motion, güçlü shape, canlı vurgu | AI, social, genç ürün | Oyuncak veya geçici trend hissi |
| Human utility | Sade, sıcak, erişilebilir | Günlük araç, sağlık, eğitim | Fazla jenerik görünme |
| Cinematic | Tam ekran medya, derin tonlar | Travel, media, storytelling | Performans ve okunabilirlik |
| Playful premium | Karakterli shape, mikro animasyon | Consumer, learning | Çocuksu veya yorucu olma |
| Neo-minimal | Keskin grid, monokrom, net aksan | Tools, finance, design | Kimliksizleşme |

## 40.2 Visual direction brief

```markdown
# Visual Direction

## Three words
[örn. Calm / Exact / Human]

## One sentence
[Uygulama nasıl hissettirmeli?]

## Reference principles
- [Prensip]
- [Prensip]

## Avoid
- [Kaçınılacak görünüm]

## Typography character
[Editorial / neutral / technical / friendly]

## Color behavior
[Single accent / category colors / data palette]

## Surface behavior
[Flat / layered / material / selective glass]

## Shape language
[Restrained / soft / geometric / expressive]

## Motion personality
[Calm / energetic / precise]

## Photography / illustration
[Belgesel, soyut, 3D, line art vb.]
```

## 40.3 Premium tipografi seçimi

Tipografi seçerken yalnız görünüşe bakmayın:

- Türkçe karakter desteği
- Çok dil kapsamı
- Dynamic Type / font scaling
- Küçük boyutta okunabilirlik
- Numeral kalitesi
- Tabular figures gereksinimi
- Variable font performansı
- Lisans
- Android ve iOS rendering farkı
- Ağırlık sayısı
- Italic ve emphasis ihtiyacı

Sistem fontu kullanmak “tasarımsız” olmak değildir. Çoğu uygulamada platform fontu yüksek kalite, hız ve erişilebilirlik sağlar; marka karakteri display role veya görsel dil üzerinden eklenebilir.

## 40.4 Renk kişiliği

Renkleri ekran bazlı değil, görev bazlı tanımlayın.

```text
brand / accent
surface / elevated surface
content primary / secondary / tertiary
border subtle / strong
interactive / interactive pressed
success / warning / danger / info
selection / focus
scrim
chart categorical / sequential / diverging
```

### Premium renk disiplini

- Tek bir ekranda marka rengi her yerde kullanılmamalı.
- Nötr yüzeyler marka aksanını değerli kılar.
- Kırmızı yalnız hata değildir; marka kırmızıysa semantic danger ayrılmalı.
- Dark mode, light mode’un ters çevrilmiş hali değildir.
- OLED siyahı ürün karakterine ve okunabilirliğe göre opsiyonel olmalı.
- Dynamic Color kullanılırsa marka kritik kontrollerinin anlamı korunmalı.

## 40.5 Shape dili

Radius sayısını sınırlandırın:

```text
radius.none
radius.xs
radius.sm
radius.md
radius.lg
radius.full
```

Her şeyin 24–32 radius olması AI üretimi ve jenerik bir görünüm yaratır. Küçük kontrollerde küçük, büyük container’da daha büyük radius kullanılabilir. Platform sistem bileşenlerinin doğal shape’i gereksiz yere override edilmemelidir.

## 40.6 Depth ve material

Derinlik araçları:

- Z-order
- Ton farkı
- Border
- Scrim
- Blur/material
- Shadow
- Scale ve motion

Hepsini aynı anda kullanmayın. İçerik katmanında düz ve okunabilir yüzey; navigasyon veya geçici kontrollerde kontrollü material çoğu zaman daha premiumdır.

Apple’ın güncel Liquid Glass yaklaşımında malzeme, içerikten ayrılan etkileşim ve chrome katmanında daha anlamlıdır. İçerik kartlarını sırf trend olduğu için camlaştırmak hiyerarşiyi ve okunabilirliği bozar.

## 40.7 Icon sistemi

- Önce SF Symbols / Material Symbols veya platform kaynaklarını değerlendirin.
- Aynı ikon ailesinde stroke ve optical weight tutarlı olmalı.
- Filled/outlined state semantiği belirlenmeli.
- İkonlar sadece dekoratifse erişilebilirlik ağacından çıkarılmalı.
- Marka ikonları ile sistem eylem ikonları ayrılmalı.
- 16 uygulamanın icon setleri aynı görünmek zorunda değildir; fakat metaforlar tutarlı olmalıdır.

## 40.8 App icon stratejisi

İyi app icon:

- Küçük ölçekte tek bakışta tanınır.
- İnce detaylara dayanmaz.
- Uygulama içi logonun ekran görüntüsü değildir.
- Koyu/açık ve farklı sistem sunumlarında test edilir.
- Benzer portföy uygulamalarından ayrılır.
- Marka ailesi varsa akrabalık gösterir ama renk değiştirilmiş klon değildir.
- Apple’ın katmanlı ikon araçları ve güncel platform sunumu ile test edilir.

## 40.9 Görsel varlık bütçesi

Her uygulama için aşağıdaki minimum art direction paketi hazırlanabilir:

- App icon
- Wordmark / compact mark
- Hero visual rule
- Empty state illustration rule
- Photography treatment
- Thumbnail crop rule
- Chart palette
- Loading placeholder style
- Store screenshot art direction
- Social sharing card

## 40.10 Görsel kalite kabul soruları

- Ekran bulanıklaştırıldığında ana hiyerarşi hâlâ seçiliyor mu?
- Marka rengi kaldırıldığında düzen hâlâ güçlü mü?
- Dark mode’da bilgi önceliği korunuyor mu?
- Görseller gelmediğinde ürün hâlâ kullanılabilir mi?
- Büyük fontta premium karakter kayboluyor mu?
- Tüm kartlar, butonlar ve başlıklar aynı görsel ağırlıkta mı?
- Tasarım bir trend screenshot’ına mı benziyor, yoksa ürünün görevine mi hizmet ediyor?

---

# 41. Content design ve mikro metin sistemi

Premium deneyimin büyük bölümü kullanıcıya ne söylediğiniz ve ne zaman söylediğinizdir. Görsel olarak güçlü bir uygulama, belirsiz veya mekanik metinlerle amatör görünebilir.

## 41.1 Ürün dili ilkeleri

1. Kullanıcının diliyle konuş; veri modeliyle değil.
2. Önce sonucu, sonra ayrıntıyı söyle.
3. Butonlarda ne olacağını belirt.
4. Hata mesajında suçlama yapma.
5. Kullanıcıdan daha fazla dikkat istemeden önce nedenini açıkla.
6. Teknik ayrıntıyı gerektiğinde açılabilir ikinci katmana taşı.
7. Pazarlama iddiasını ölçülebilir faydaya çevir.
8. Bir terim için tek ad kullan.
9. Çeviride kırılmayacak kısa ve açık cümleler kur.
10. Ekran okuyucunun bağlamını hesaba kat.

## 41.2 Voice profile

Her uygulama için aşağıdaki ölçekleri tanımlayın:

```text
formal         1 2 3 4 5  casual
reserved       1 2 3 4 5  expressive
technical      1 2 3 4 5  everyday
concise        1 2 3 4 5  explanatory
neutral        1 2 3 4 5  encouraging
```

Tone bağlama göre değişebilir:

| Durum | Ton |
|---|---|
| Onboarding | Açık, motive edici |
| Başarı | Kısa, sıcak, abartısız |
| Hata | Sakin, çözüm odaklı |
| Ödeme | Net, şeffaf, ciddi |
| Veri silme | Doğrudan, dikkatli |
| Güvenlik | Kesin, korkutmayan |
| AI sonucu | Kontrollü, dürüst |
| Boş durum | Yardımcı, yargılamayan |

## 41.3 Terminoloji sözlüğü

On altı uygulamada içerik tutarlılığı için her repoda sözlük bulunmalıdır.

```markdown
# Terminology

| Concept | Preferred | Avoid | Notes |
|---|---|---|---|
| User-created collection | Koleksiyon | Klasör, albüm | Ürün genelinde tek terim |
| Paid tier | Premium | Pro Plus | Store metadata ile aynı |
| Remove account permanently | Hesabı sil | Hesabı kapat | Kalıcı işlemi netleştir |
```

## 41.4 CTA formülü

İyi CTA:

```text
Fiil + somut sonuç
```

Örnekler:

| Zayıf | Daha iyi |
|---|---|
| Devam | Planı oluştur |
| Tamam | Değişiklikleri kaydet |
| Evet | Fotoğrafı sil |
| Gönder | Daveti gönder |
| Premium | Premium’u incele |
| Dene | 7 günlük denemeyi başlat |

Buton label’ına fiyat, süre veya geri döndürülemezlik kritikse dahil edilebilir; ancak label aşırı uzatılmamalıdır.

## 41.5 Başlık sistemi

- Ekran başlığı: Kullanıcının bulunduğu yeri belirtir.
- Bölüm başlığı: İçerik grubunu açıklar.
- Hero başlığı: Ürün değerini veya sonucu anlatır.
- Dialog başlığı: Kararı açıklar.
- Empty state başlığı: Durumu ve sonraki adımı ilişkilendirir.

Aynı ekranda üç farklı pazarlama sloganı kullanmayın.

## 41.6 Hata mesajı anatomisi

```text
Ne oldu?
Neden olmuş olabilir? — yalnız biliniyorsa
Kullanıcı ne yapabilir?
Veri kaybı var mı?
Destek / hata kodu gerekli mi?
```

Örnek:

```text
Değişiklikler kaydedilemedi.
Bağlantı geri geldiğinde yeniden deneyebilirsin. Yazdıkların bu cihazda korunuyor.
[Yeniden dene]
```

Kaçınılacaklar:

- “Oops!” gibi bağlamdan bağımsız şirinlik
- “Unknown error”
- Kullanıcıyı suçlayan dil
- Hata kodunu ana mesaj yapmak
- Çözüm olmayan “Tamam” butonu
- Aynı sorunda farklı metinler

## 41.7 Empty state türleri

| Tür | Mesaj yaklaşımı |
|---|---|
| İlk kullanım | Değeri ve ilk eylemi öğret |
| Kullanıcı sildi | Durumu nötr açıkla, yeniden oluşturmayı sun |
| Filtre sonucu yok | Filtreyi temizle veya genişlet |
| Arama sonucu yok | Query düzeltme önerisi |
| Yetki yok | Nasıl erişim alınacağını açıkla |
| Offline içerik yok | Bağlanınca ne olacağını ve alternatifi söyle |
| Başka kullanıcı içeriği yok | Yargılayıcı veya varsayımsal dil kullanma |

## 41.8 İzin metni

Pre-permission ekranında:

```text
Özellik → kullanıcı faydası → veri kapsamı → alternatif
```

Örnek:

```text
Yakındaki etkinlikleri göstermek için konumuna ihtiyaç var.
Yalnız uygulamayı kullanırken erişebiliriz. İstersen şehir seçerek de devam edebilirsin.
```

“Daha iyi deneyim için izin ver” yeterli değildir.

## 41.9 Paywall metni

- Özellik değil sonuç yazın.
- “Sınırsız” kelimesi gerçekten sınırsız değilse kullanmayın.
- Deneme bitişi ve sonraki fiyat açık olmalı.
- Yıllık planın toplamı ve karşılaştırması anlaşılır olmalı.
- İptal etmenin yolunu saklamayın.
- “En popüler” gibi iddialar gerçek değilse kullanmayın.
- Restore purchases görünür ve anlaşılır olmalı.

## 41.10 Localization-ready writing

- Değişkenleri cümlenin ortasına rastgele birleştirmeyin.
- Plural kurallarını destekleyin.
- Tarih, saat, sayı ve para birimini locale ile biçimlendirin.
- Metin uzunluğu için Almanca gibi genişleyen dilleri test edin.
- Türkçe büyük “İ” ve küçük “ı” dönüşümlerine dikkat edin.
- Arapça ve İbranice için RTL sırasını yalnız metin değil ikon ve yönlü hareket düzeyinde test edin.
- İngilizce kısa olduğu için tasarımı ona göre kilitlemeyin.

## 41.11 Accessibility copy

- Accessibility label görünen metni gereksiz tekrar etmemeli.
- “Button” kelimesini label içine yazmayın; role zaten söylenir.
- Görselin anlamını açıklayın, görünüşünü değil.
- Grafiklerde trend, değer ve zaman aralığı erişilebilir metinle sunulmalı.
- “Buraya tıkla” gibi bağlamsız link metni kullanmayın.
- Hata alanına focus taşındığında mesaj tek başına anlaşılmalı.

## 41.12 Mikro metin QA

- Tüm CTA’lar eylemi söylüyor mu?
- “Bu”, “şu”, “devam” gibi bağlamsız kelimeler var mı?
- Kullanıcı sonucunu geri alabilir mi?
- Fiyat, veri veya izin konusunda gizlenen bilgi var mı?
- Aynı kavram birden fazla adla anılıyor mu?
- Hata mesajı gerçek recovery sunuyor mu?
- Metin %30 uzadığında layout dayanıyor mu?
- Screen reader sırası anlamlı mı?

---

# 42. İleri motion, haptik ve ses sistemi

Motion dekorasyon değil, mekânsal ilişki ve sistem durumunu açıklama aracıdır. Premium motion görünür olmak için değil, deneyimi anlaşılır kılmak için çalışır.

## 42.1 Motion rolleri

| Rol | Örnek |
|---|---|
| Orientation | Liste öğesinin detail’e dönüşmesi |
| Continuity | Tab değişiminde bağlamın korunması |
| Feedback | Press, toggle, save confirmation |
| Status | Loading, upload, sync |
| Hierarchy | Sheet’in içerik üstüne gelmesi |
| Attention | Kritik ama kısa bildirim |
| Delight | Nadir başarı anı |

## 42.2 Motion tokenları

```json
{
  "motion": {
    "duration": {
      "instant": 0,
      "micro": 120,
      "short": 180,
      "medium": 280,
      "long": 420
    },
    "distance": {
      "micro": 4,
      "short": 12,
      "medium": 24,
      "large": 48
    },
    "spring": {
      "snappy": { "response": 0.28, "damping": 0.86 },
      "gentle": { "response": 0.42, "damping": 0.92 }
    }
  }
}
```

Değerler stack’e çevrilirken platformun native motion davranışı korunmalıdır. Her animasyon aynı spring ile yapılmamalıdır.

## 42.3 Süre seçimi

- Press feedback: çok kısa
- Küçük state transition: kısa
- Screen transition: orta
- Büyük spatial transform: orta–uzun
- Sürekli loading: zamana bağlı olmayan döngü
- User-controlled gesture: parmağa bağlı, sabit süre değil

Animasyon, kullanıcı işlemini geciktirmek için bekleme koymamalıdır.

## 42.4 Gesture continuity

- Drag edilen yüzey parmakla doğrudan ilişkili görünmeli.
- Gesture iptalinde nesne anlaşılır şekilde geri dönmeli.
- Velocity, hedef seçimine etki edebilir.
- Dismiss eşiği görsel feedback vermeli.
- Swipe action geri alınabilir veya onaylı olmalı.
- System back ve predictive back davranışlarıyla çakışmamalı.

## 42.5 Shared element ve morph

Shared transition ancak gerçek nesne sürekliliği varsa kullanılmalı. Bir kart detail’e açılıyorsa görsel ve başlık devam edebilir. Alakasız yüzeyleri sırf etkileyici görünmesi için morph etmek kafa karıştırır.

## 42.6 Loading motion

- Skeleton shimmer düşük kontrastlı ve sakin olmalı.
- Skeleton gerçek içerik geometrisine benzemeli.
- Bir ekranda birden fazla bağımsız spinner kullanmayın.
- Progressive loading ile ana içerik önce gelebilir.
- İptal edilebilir işlemde hareket kontrolü olmalı.
- Uzun AI veya processing işlemlerinde aşama veya anlamlı durum metni gösterilebilir.

## 42.7 Haptik matrisi

| Olay | Haptik |
|---|---|
| Standart tab değişimi | Genellikle yok |
| Toggle / selection | Hafif, platforma uygunsa |
| Drag snap | Selection feedback |
| Başarı | Kısa success feedback |
| Hata | Nadir ve dikkatli |
| Destructive confirmation | Ağır değil; karar ekranıyla birlikte |
| Sürekli scroll | Yok |
| Her buton | Yok |

Haptik, görsel ve erişilebilir geri bildirimin yerine geçmez.

## 42.8 Ses sistemi

Ses yalnız ürün için gerçek değer taşıyorsa kullanılmalıdır:

- Timer / alarm
- Navigation cue
- Creation feedback
- Mesaj veya işlem durumu
- Oyunlaştırılmış eğitim

Kurallar:

- Sessiz mod ve sistem ses tercihine saygı
- Ses kapatma ayarı
- Haptik/görsel alternatif
- Kısa, yumuşak ve tanınabilir sound palette
- Aynı olay için birden fazla ses katmanı yok
- Ses dosyalarında boyut ve latency bütçesi

## 42.9 Reduce Motion

Reduce Motion açıkken:

- Büyük scale ve parallax azaltılmalı.
- Shared transform yerine fade/cross-dissolve kullanılabilir.
- Otomatik hareket eden dekoratif öğeler durdurulmalı.
- Bilgi kaybı olmamalı.
- İşlem sonucu yine görünür olmalı.
- Video ve animated illustration kontrol edilebilir olmalı.

## 42.10 Motion QA

- 60/90/120 Hz cihazlarda akıcı mı?
- Düşük güç veya düşük performans cihazında bozuluyor mu?
- Animasyon sırasında touch bloke oluyor mu?
- Screen reader focus animasyon sonrası kayboluyor mu?
- Hızlı tekrar eden gesture state’i bozuyor mu?
- Navigation back yarıda kesildiğinde UI doğru mu?
- Reduce Motion’da aynı görev tamamlanabiliyor mu?
- Snapshot testleri motion’ın son state’ini doğruluyor mu?

---

# 43. Onboarding, kimlik ve hesap yaşam döngüsü

Onboarding’in amacı uygulamayı anlatmak değil, kullanıcıyı ilk anlamlı sonuca götürmektir.

## 43.1 Onboarding modelleri

| Model | Ne zaman |
|---|---|
| Zero onboarding | Ürün kendini açıklıyorsa |
| Contextual tips | Özellik kullanıldığı anda öğrenme gerekiyorsa |
| Goal selection | Kişiselleştirme gerçek değer sağlıyorsa |
| Guided setup | Sonraki deneyim için zorunlu veri gerekiyorsa |
| Sample workspace | Boş ekran korkusunu azaltmak için |
| Progressive profile | Veriyi zaman içinde toplamak için |

Carousel onboarding çoğu zaman düşük retention sorununu çözmez. İlk değer anına gereksiz adım ekleyebilir.

## 43.2 İlk oturum ideal akışı

```text
Açılış
→ Değer önerisi veya doğrudan ürün
→ Gerekirse en küçük tercih
→ İlk gerçek görev
→ Sonuç
→ Hesap / senkronizasyon / premium önerisi
```

Hesap zorunlu değilse değerden önce istemeyin.

## 43.3 Guest mode

Guest mode destekleniyorsa:

- Hangi verinin yerel olduğu açık olmalı.
- Hesap açınca verinin birleşmesi güvenli olmalı.
- Guest verisi kaybolmadan auth yapılmalı.
- Sign out / account switch davranışı tanımlanmalı.
- Premium entitlement guest cihazına mı, hesaba mı bağlı açık olmalı.

## 43.4 Sign in seçenekleri

- Platformun güvenilir kimlik seçeneklerini değerlendirin.
- Kullanıcıyı gereksiz parola oluşturmaya zorlamayın.
- Passkey destekleniyorsa fallback ve cihazlar arası akış düşünülmeli.
- Social sign-in butonlarının marka ve platform kurallarına uyulmalı.
- Aynı e-posta ile farklı provider account merge senaryosu tasarlanmalı.
- E-posta doğrulama akışı uygulamayı kilitlemeden yönetilmeli.

## 43.5 Auth state matrisi

```text
signed_out
guest
signing_in
signed_in_unverified
signed_in_verified
session_expired
account_locked
account_deletion_pending
account_deleted
network_unavailable
provider_error
```

Her state için kullanıcı eylemi ve veri korunumu tanımlanmalıdır.

## 43.6 OTP / magic link

- Kod otomatik doldurma
- Geri sayımın erişilebilir olması
- Yeniden gönderme sınırı
- Yanlış e-posta/telefonu düzeltme
- Kodun hangi hedefe gönderildiğini maskeli gösterme
- Uygulamalar arası geçişten sonra state koruma
- Magic link’in başka cihazda açılması
- Rate limit mesajı

## 43.7 Profil tamamlama

Profil completion bar yalnız gerçekten değer yaratıyorsa kullanılmalı. Kullanıcıyı gereksiz veri paylaşmaya zorlamak veya sahte tamamlanma baskısı yaratmak premium değildir.

Gerekli veri:

- Ürün fonksiyonu için zorunlu
- Güvenlik için gerekli
- Yasal olarak gerekli
- Kişiselleştirme faydası açık

Geri kalan veri opsiyonel olmalıdır.

## 43.8 Account switch ve multi-account

- Aktif hesap görünür olmalı.
- Veri ve subscription karışmamalı.
- Bildirim tap’i doğru hesaba yönlenmeli.
- Hesap değişiminde cache temizliği güvenli olmalı.
- Draft ve upload hangi hesaba ait açık olmalı.
- Biometric lock hesap bazlı değerlendirilmeli.

## 43.9 Sign out

Sign out sonrası:

- Yerel hassas veri politikaya göre temizlenmeli.
- Guest olarak devam seçeneği olabilir.
- Offline queue yanlış hesapta gönderilmemeli.
- Push token ve analytics identity güncellenmeli.
- Kullanıcı verisi silinmiş gibi gösterilmemeli; sign out ile account deletion ayrılmalı.

## 43.10 Account deletion

Hesap oluşturan uygulamalarda platform kurallarına uygun in-app silme yolu bulunmalıdır.

Silme akışı:

1. Neyin silineceğini açıkla.
2. Aboneliğin ayrı yönetilmesi gerekiyorsa açıkça belirt.
3. İndirilebilir veri veya export seçeneği sun.
4. Kimliği güvenli biçimde doğrula.
5. Geri alma süresi varsa dürüstçe belirt.
6. İşlemi başlat.
7. Kullanıcıya durumu ve beklenen sonucu göster.
8. Silme tamamlanınca yerel veriyi temizle.

“Deactivate” kalıcı silmenin yerine geçirilmemelidir.

## 43.11 Onboarding analytics

Minimum event’ler:

```text
onboarding_started
onboarding_step_viewed
onboarding_step_completed
onboarding_skipped
permission_pre_prompt_viewed
permission_result
first_value_started
first_value_completed
account_prompt_viewed
account_created
onboarding_completed
```

Event’ler kullanıcıyı gereksiz takip etmek için değil, düşüş noktasını ve ürün değerini anlamak için kullanılmalıdır.

---

# 44. Monetizasyon sistemi ve etik dönüşüm

Premium gelir tasarımı, kullanıcının değer ile fiyat arasındaki ilişkiyi kolayca anlamasını sağlar. Manipülasyon kısa vadede conversion artırsa bile güveni, retention’ı ve mağaza riskini kötüleştirir.

## 44.1 Monetizasyon modelleri

| Model | Tasarım önceliği |
|---|---|
| Freemium subscription | Ücretsiz değerin sınırı ve ücretli sonucun açıklığı |
| Trial | Başlangıç/bitiş, fiyat ve iptal şeffaflığı |
| Hard paywall | Değer kanıtı ve doğru zamanlama |
| One-time purchase | Sahiplik kapsamı ve restore |
| Consumable credits | Bakiye, kullanım, expiry ve yanlış harcama koruması |
| Marketplace commission | Fiyat kırılımı ve güven |
| Physical commerce | Teslimat, iade, vergi, ödeme |
| Ads + premium removal | Reklam sıklığı ve premium farkı |

## 44.2 Value ladder

```text
Free: Kullanıcı ürünün temel değerini görür.
Entry paid: En sık karşılaşılan sınırı kaldırır.
Core premium: Ana sonucu daha hızlı, güçlü veya sürekli verir.
Advanced: Profesyonel kontrol, export, collaboration veya yüksek limit.
```

Sırf plan sayısını artırmak için yapay katmanlar üretmeyin.

## 44.3 Paywall placement

En iyi an genellikle kullanıcı değeri anladığında veya doğal bir limite geldiğindedir.

Uygun örnekler:

- İlk başarılı görev sonrası gelişmiş avantajı göstermek
- Premium özelliğe bilinçli dokunma
- Ücretsiz kotaya yaklaşma
- Export veya collaboration gibi yüksek niyetli eylem
- Onboarding’de kullanıcı premium değerini zaten anlayabiliyorsa teklif

Kötü örnekler:

- Uygulama açılır açılmaz, değer göstermeden
- Her tab değişiminde
- Sistem back ile kapanmayan agresif ekran
- Kullanıcı hata yaşarken
- İzin isteme ile aynı anda

## 44.4 Paywall bilgi hiyerarşisi

1. Kullanıcı sonucu
2. En güçlü 3–5 fayda
3. Plan ve fiyat
4. Trial / teklif koşulu
5. Primary CTA
6. Restore
7. Terms / privacy
8. Close / continue free — modele göre

## 44.5 Plan sunumu

- Aylık ve yıllık fiyatın matematiği açık olmalı.
- Yıllık planın toplam tahsilatı gizlenmemeli.
- “Ayda X” yalnız ödeme yıllıksa bunun yanında belirtilmeli.
- Tasarruf gerçek ve doğru hesaplanmalı.
- Currency ve locale formatı kullanılmalı.
- Vergi veya bölgesel farklar için platform gösterimine güvenilmeli.
- Deneme hakkı kullanıcının gerçek eligibility durumuna göre gösterilmeli.

## 44.6 Trial yaşam döngüsü

State’ler:

```text
eligible
not_eligible
trial_started
trial_active
trial_ending
converted
cancelled_but_active
expired
billing_retry
grace_period
revoked
```

Uygulama yalnız “premium=true” boolean’ına güvenmemeli. Entitlement state sunucuda ve mağaza bilgisiyle güvenli biçimde yönetilmelidir.

## 44.7 Purchase flow

- Butona basınca loading feedback
- Tekrar purchase çağrısını engelleme
- Sistem ödeme arayüzü
- Pending durumu
- Doğrulama
- Entitlement aktivasyonu
- Success confirmation
- İlgili premium özelliğe dönüş

Kullanıcı ödeme sonrası boş bir ana ekrana atılmamalı; satın aldığı değeri hemen görmelidir.

## 44.8 Purchase failure taxonomy

| Hata | Kullanıcı mesajı |
|---|---|
| User cancelled | Hata gibi sunma; normal state’e dön |
| Network | Bağlantı ve retry |
| Pending | İşlemin beklediğini açıkla |
| Store unavailable | Daha sonra deneme ve destek |
| Already owned | Restore / entitlement yenileme |
| Verification failure | Satın alma kaybolmadıysa doğrulama sürüyor de |
| Billing issue | Mağaza ödeme yöntemine yönlendir |
| Unknown | Reference ID + support, fakat teknik kodu ana mesaj yapma |

## 44.9 Restore purchases

- Görünür
- Tek dokunuşla başlar
- Loading state’i var
- Sonuç açık
- “Bir şey bulunamadı” state’i yardımcı
- Account mismatch senaryosu açıklanır
- Başarılı restore sonrası ekran entitlement’a göre güncellenir

## 44.10 Subscription management

Uygulama içinde:

- Aktif plan
- Yenileme tarihi
- Trial durumu
- Plan faydaları
- Manage subscription bağlantısı
- Billing issue durumu
- Restore
- Support

İptal akışı gizlenmemeli veya yanıltıcı bir labirente dönüştürülmemelidir.

## 44.11 Credit sistemi

- Güncel bakiye görünür.
- Bir işlem kaç kredi harcayacak önceden gösterilir.
- Başarısız işlemde kredi politikası açık.
- Kredi expiry varsa satın almadan önce görünür.
- Paket fiyatı ve unit value karşılaştırılabilir.
- Yanlış çift harcama önlenir.
- Server authoritative ledger tutulur.

## 44.12 Etik A/B test guardrail’leri

Bir paywall deneyinde yalnız conversion izlemeyin:

- Refund
- Trial cancellation
- Support complaint
- App rating
- D7/D30 retention
- Payment failure
- Uninstall
- Restore success
- Trust survey

Conversion yükselirken güven ve retention düşüyorsa sonuç başarısız olabilir.

## 44.13 Paywall QA matrisi

- New user / returning user
- Eligible / not eligible
- Monthly / annual / lifetime
- Different locale and currency
- Slow store response
- No network
- Pending transaction
- Cancelled purchase
- Successful purchase
- Restore same account
- Restore different account
- Grace period
- Billing issue
- Family sharing / account sharing uygulanıyorsa
- Font scaling
- Screen reader
- Small phone
- Tablet / landscape

---

# 45. AI özellikleri için premium UX

AI özelliği eklemek uygulamayı otomatik olarak premium yapmaz. Kullanıcıya kontrol, hız, doğruluk beklentisi, veri şeffaflığı ve düzenleme imkânı verildiğinde premium his oluşur.

## 45.1 AI feature readiness

AI kullanmadan önce:

- Model hangi gerçek kullanıcı problemini çözüyor?
- Deterministic çözüm daha mı güvenilir?
- Hata maliyeti ne?
- Kullanıcı sonucu doğrulayabilir mi?
- Hangi veriler modele gidiyor?
- Latency ve maliyet sürdürülebilir mi?
- Offline veya fallback deneyimi var mı?
- Model davranışı ölçülebilir mi?

## 45.2 AI interaction modelleri

| Model | Uygun kullanım |
|---|---|
| Command | “Bu metni özetle” gibi net görev |
| Copilot | Kullanıcı iş akışının yanında yardımcı |
| Chat | Belirsiz ve çok adımlı keşif |
| Suggestion | Akışı kesmeden öneri |
| Autocomplete | Hızlı küçük üretim |
| Agent | Araç kullanarak çok adımlı işlem |
| Background generation | Uzun render/analysis işlemi |

Her problem chat ekranına dönüştürülmemelidir.

## 45.3 Prompt composer

- Kullanıcı ne girebileceğini anlamalı.
- Örnekler gerçek işlevi göstermeli.
- Dosya, fotoğraf veya context ekleme görünür olmalı.
- Hassas veri uyarısı bağlama göre sunulmalı.
- Submit öncesi maliyet veya kredi gerekiyorsa gösterilmeli.
- Uzun prompt draft’ı korunmalı.
- Keyboard ve multiline davranışı doğal olmalı.

## 45.4 Streaming response

- İlk token hızlı gelebilir ama layout sürekli zıplamamalı.
- Stop control görünür olmalı.
- Kullanıcı scroll ederse otomatik scroll zorla geri çekmemeli.
- Tool veya işlem aşaması gerekiyorsa anlaşılır status gösterilmeli.
- Partial answer kopyalanabilir mi politikası belirlenmeli.
- Stream kesilirse partial içerik korunup devam et seçeneği sunulabilir.

## 45.5 Belirsizlik ve doğruluk

- Modelin emin olmadığı yerde kesin dil kullanmayın.
- Kaynak gerekiyorsa gösterin.
- Tarih, para, sağlık, hukuk ve güvenlik gibi yüksek riskli alanlarda doğrulama ve sınırları açıkça belirtin.
- Kullanıcıya düzenleme, yeniden üretme ve alternatif isteme imkânı verin.
- “AI olabilir, hata yapabilir” genel uyarısı tek başına yeterli güven tasarımı değildir.

## 45.6 AI output actions

Çıktı için bağlama uygun eylemler:

- Copy
- Insert / apply
- Replace selection
- Regenerate
- Shorten / expand
- Change tone
- Compare versions
- Undo
- Save as draft
- Export
- Report issue

AI sonucu otomatik olarak kalıcı veriyi değiştirmemeli; risk düzeyine göre preview ve confirmation gerekir.

## 45.7 Agentic actions

Bir agent kullanıcı adına işlem yapıyorsa:

1. Plan veya kapsamı göster.
2. İzin verilen araçları açıkla.
3. Hassas eylem öncesi onay al.
4. İşlem sırasında durum göster.
5. Yapılan değişikliklerin özetini ver.
6. Geri alma veya düzeltme yolu sun.
7. Başarısız adımı ve etkisini açıkla.

“AI çalışıyor” gibi belirsiz status yerine “3 dosya incelendi, özet hazırlanıyor” gibi gerçek ilerleme kullanılabilir; sahte ilerleme yüzdesi üretmeyin.

## 45.8 AI memory ve personalization

- Kullanıcı neyin hatırlandığını görebilmeli.
- Memory açık/kapalı kontrolü olmalı.
- Tekil memory silinebilmeli.
- Hassas veriler için açık onay ve minimizasyon olmalı.
- Hesap silme ile memory silme ilişkisi tanımlanmalı.
- Shared device ve multi-account güvenliği düşünülmeli.

## 45.9 AI privacy disclosure

Açıklanması gerekenler:

- Hangi içerik gönderiliyor?
- Ne amaçla kullanılıyor?
- Üçüncü taraf sağlayıcı var mı?
- Ne kadar saklanıyor?
- Eğitim için kullanılıyor mu?
- Kullanıcı nasıl silebilir?
- Hassas veri göndermemesi gereken bağlam var mı?

Bu bilgi yalnız uzun privacy policy’ye gömülmemeli; kritik anda kısa ve anlaşılır sunulmalıdır.

## 45.10 AI latency UX

| Süre | Deneyim |
|---:|---|
| <300 ms | Doğrudan sonuç |
| 300 ms–1 s | Subtle feedback |
| 1–4 s | Visible processing state |
| 4–10 s | Aşama, cancel, anlamlı status |
| >10 s | Background/notification, leave-and-return, progress history |

Süreler bağlama göre değişir; asıl ilke kullanıcının kontrolünü korumaktır.

## 45.11 AI error taxonomy

```text
no_network
model_unavailable
rate_limited
content_too_large
unsupported_format
safety_block
insufficient_context
tool_permission_denied
tool_failed
partial_completion
cancelled
credit_exhausted
unknown
```

Her hata için recovery ve veri korunumu tanımlayın.

## 45.12 AI quality metrics

- Task completion
- Accept / apply rate
- Edit distance after output
- Regenerate rate
- Time to useful result
- Error / cancellation
- User feedback
- Hallucination report
- Safety block quality
- Cost per successful task
- Retention after AI use

Yalnız mesaj sayısını artırmak başarı değildir.

---

# 46. Bildirimler, widget’lar, canlı yüzeyler ve deep link

Premium uygulama, uygulama kapalıyken de kullanıcının zamanına saygı gösterir.

## 46.1 Bildirim değer testi

Push göndermeden önce:

- Bu bilgi zaman duyarlı mı?
- Kullanıcının eylem yapması gerekiyor mu?
- Uygulama içi inbox yeterli mi?
- Kullanıcı bu kategoriye açıkça değer verdi mi?
- Aynı bilgi birden fazla kanaldan gidiyor mu?
- Bildirim açıldığında gerçek ve güncel bir hedef var mı?

## 46.2 Permission isteme

Bildirim izni uygulama açılışında otomatik istenmemelidir. Önce kullanıcı bildirim değerini görmelidir:

- Takip ettiği etkinlik başladı
- İşlem tamamlandı
- Hatırlatıcı oluşturdu
- Mesaj bekliyor
- Fiyat/stock alarmı kurdu

Pre-prompt, manipülatif olmamalı ve reddetme seçeneğini gizlememelidir.

## 46.3 Notification category sistemi

```text
Transactional — işlem sonucu
Reminder — kullanıcının kurduğu hatırlatma
Social — mesaj, yorum, takip
Content — yeni içerik
Marketing — kampanya ve teklif
Security — giriş veya risk
System — hizmet durumu
```

Kullanıcı kategori bazlı tercih yapabilmelidir. Kritik security bildirimi marketing tercihiyle aynı toggle’a bağlanmamalıdır.

## 46.4 Notification copy

- Başlık tek başına anlaşılır.
- Body, yeni bilgi veya eylem söyler.
- Hassas veri lock screen’de gizlenebilir.
- Sahte aciliyet ve emoji spam kullanılmaz.
- “Seni özledik” yerine gerçek değer sunulur.
- Aynı olay için duplicate notification önlenir.

## 46.5 Deep link router

Her deep link için:

```text
route
required auth state
required permission
required entitlement
fallback screen
expired content behavior
analytics source
account context
```

Deep link hedefi silinmişse boş ekran yerine açıklama ve alternatif sunulmalıdır.

## 46.6 Widget

İyi widget:

- Glanceable bilgi verir.
- Tek veya birkaç yüksek değerli eylem sunar.
- Sık güncellenmeyen veriyi sahte canlı göstermeye çalışmaz.
- Privacy durumunu dikkate alır.
- Farklı boyutlarda özel layout’a sahiptir.
- Empty, signed-out, loading ve error state’lerine sahiptir.
- Uygulama içine doğru deep link eder.

## 46.7 iOS canlı yüzeyleri

Ürüne uygunsa:

- Widget
- Lock Screen widget
- Live Activity
- Dynamic Island sunumu
- App Intent / Shortcuts

Live Activity yalnız gerçek zamanlı, sınırlı süreli ve kullanıcının takip etmek istediği olaylar için kullanılmalıdır.

## 46.8 Android yüzeyleri

Ürüne uygunsa:

- Home screen widget
- Notification actions
- Ongoing notification
- App shortcuts
- Predictive back uyumlu deep links
- Adaptive widget layouts

Android widget kalitesi için farklı launcher boyutları, dynamic color, resize ve loading state test edilmelidir.

## 46.9 Background completion

Uzun işlem uygulama kapalıyken sürebiliyorsa:

- Kullanıcı ayrılabilir.
- İşlem state’i kalıcıdır.
- Sistem uygun kanalla sonuç bildirir.
- Uygulama açıldığında doğru result screen gelir.
- Aynı işlem tekrar başlatılmaz.
- Başarısızlıkta recovery görünür.

---

# 47. Offline, senkronizasyon ve veri bütünlüğü

Premium ürün, ağın her zaman hızlı olduğu varsayımıyla tasarlanmaz. Kullanıcı için en pahalı hata görsel kusur değil, veri kaybıdır.

## 47.1 Offline strateji seviyeleri

| Seviye | Davranış |
|---|---|
| Online only | Açık uyarı ve güvenli bloklama |
| Read cache | Son senkronize veriyi gösterir |
| Offline draft | Kullanıcı oluşturur, sonra gönderir |
| Offline first | Çoğu görev yerelde tamamlanır |
| Collaborative sync | Conflict ve version yönetimi gerekir |

Her uygulama için hangi seviyenin hedeflendiği dokümante edilmelidir.

## 47.2 Sync status modeli

```text
synced
local_changes
syncing
queued_offline
conflict
failed_retryable
failed_action_required
read_only
```

Kullanıcıya her küçük senkronizasyon detayı gösterilmez; fakat veri riski olduğunda status görünür olmalıdır.

## 47.3 Optimistic UI

Optimistic update uygundur, eğer:

- İşlem büyük olasılıkla başarılıysa
- Geri alınabilirse
- Başarısızlık açıkça düzeltilebilirse
- Yanlış başarı ciddi sonuç yaratmıyorsa

Ödeme, kritik izin veya geri döndürülemez işlemde sahte başarı göstermeyin.

## 47.4 Draft safety

- Metin alanları uygun aralıkla autosave olabilir.
- App background / kill durumunda draft korunmalı.
- Draft’ın hangi hesap ve nesneye ait olduğu açık olmalı.
- Şema migration draft’ı bozmamalı.
- Kullanıcı silmeden draft otomatik yok edilmemeli.
- Restore draft ekranı ve discard kararı tasarlanmalı.

## 47.5 Upload queue

- Her öğenin local ID’si
- Idempotency key
- Progress
- Retry policy
- Network requirement
- User cancellation
- Duplicate prevention
- Background task policy
- Server confirmation

UI, upload tamamlanmadan içeriği “published” göstermemelidir.

## 47.6 Conflict resolution

Conflict türleri:

- Aynı alan iki cihazda değişti
- Nesne başka yerde silindi
- Yetki değişti
- Server schema değişti
- Collaborative edit çakıştı
- Offline action artık geçersiz

Çözüm stratejileri:

| Strateji | Kullanım |
|---|---|
| Last write wins | Düşük riskli tercihler |
| Field merge | Bağımsız alanlar |
| Server authoritative | Güvenlik, entitlement, stok |
| User choice | Yüksek değerli içerik |
| Version history | Doküman / creator ürünleri |
| CRDT / collaboration model | Gerçek zamanlı ortak düzenleme |

## 47.7 Offline copy

Kötü:

```text
No internet.
```

Daha iyi:

```text
Bağlantı yok. Son senkronize verileri görmeye devam edebilirsin.
Yaptığın değişiklikler bağlantı geldiğinde gönderilecek.
```

Gerçekte queue desteği yoksa böyle bir söz verilmemelidir.

## 47.8 Cache freshness

Kullanıcı özellikle finans, rezervasyon, stok, konum veya sağlık verisinde güncelliği bilmelidir.

- “Son güncelleme: 14:32”
- Pull to refresh veya retry
- Stale data indicator
- Kritik işlem öncesi yeniden doğrulama
- Timezone ve locale doğru gösterimi

## 47.9 Sync QA

- Airplane mode’da açılış
- İşlem ortasında ağ kesilmesi
- Zayıf/packet-loss ağ
- App kill sırasında upload
- Cihaz restart
- Aynı hesap iki cihaz
- Hesap değişimi
- Token expiry
- Server conflict
- Duplicate tap
- Background task sınırı
- Storage full
- Database migration

---

# 48. Güven, gizlilik, güvenlik ve içerik güvenliği

Premium güven, kilit ikonları eklemek değil; doğru veri davranışını görünür ve öngörülebilir hale getirmektir.

## 48.1 Trust surface’leri

Kullanıcı şu anlarda güveni değerlendirir:

- İlk hesap açma
- İzin isteme
- Ödeme
- Hassas veri girişi
- Paylaşım
- AI kullanımı
- Account deletion
- Hata ve veri kaybı
- Support
- Başka kullanıcılarla etkileşim

Bu anların her biri için kısa, bağlamsal açıklama gerekir.

## 48.2 Data inventory

Her uygulamada bir veri envanteri tutun:

| Veri | Amaç | Kaynak | Saklama | Paylaşım | Silme | Hassasiyet |
|---|---|---|---|---|---|---|
| E-posta | Hesap | Kullanıcı | Hesap süresi | Auth provider | Hesap silme | Orta |
| Konum | Yakın sonuç | Cihaz | Session/cache | Harita sağlayıcı | Ayarlardan | Yüksek |

Bu tablo privacy label ve Data Safety beyanlarıyla uyumlu olmalıdır.

## 48.3 Veri minimizasyonu

- Gerekmeyen alanı toplama.
- “Gelecekte lazım olabilir” yeterli gerekçe değildir.
- Hassas veriyi analytics’e göndermeyin.
- Loglarda token, parola, içerik veya kişisel veri bırakmayın.
- Üçüncü taraf SDK’ların topladığı veriyi de envantere dahil edin.
- Veri saklama süresini tanımlayın.

## 48.4 Consent

Consent:

- Özgürce verilmeli.
- Belirli amaç için olmalı.
- Geri alınabilir olmalı.
- Pre-checked olmamalı.
- Hizmet için zorunlu olmayan tracking, zorunluymuş gibi sunulmamalı.
- Kullanıcı kararının etkisini anlamalı.

## 48.5 Permission states

Her izin için:

```text
not_determined
granted_limited
granted_full
denied
restricted
changed_in_settings
unavailable
```

Limited photo/location gibi ara durumlar ürün akışında özel ele alınmalıdır.

## 48.6 Sensitive UI

- Parola ve token görünürlüğünü sınırla.
- Clipboard’a kopyalanan hassas veri için kullanıcı kontrolü sağla.
- Screen capture riskini uygulama kategorisine göre değerlendir.
- Background app switcher preview’da hassas içerik gizlenebilir.
- Biometric gate yalnız cihaz güvenliğiyle doğru entegre edilmeli.
- Session timeout kullanıcıyı veri kaybına uğratmamalı.

## 48.7 Security UX

Güvenlik özellikleri kullanıcıyı cezalandırmamalıdır:

- Yeni giriş bildirimi
- Aktif session listesi
- Cihazdan çıkış
- Parola / passkey yönetimi
- Recovery codes uygulanıyorsa güvenli gösterim
- Suspicious activity açıklaması
- Locked account recovery
- Rate limit mesajı

## 48.8 Third-party SDK governance

Her SDK için:

- İş amacı
- Toplanan veri
- Ağ domainleri
- Privacy manifest / beyan
- Güncelleme sahibi
- Güvenlik geçmişi
- Uygulama boyutu etkisi
- Startup etkisi
- Çıkarma planı

Kullanılmayan SDK’ları tutmayın. Tasarım veya analytics SDK’sı bile uygulamanın güven ve performans bütçesini etkiler.

## 48.9 UGC ve sosyal güvenlik

Kullanıcı içeriği varsa minimum araçlar:

- Report
- Block
- Mute
- Content removal status
- Appeal / support süreci
- Spam/rate limits
- Community guidelines
- Age-appropriate defaults
- Privacy controls
- Comment/DM permissions

Moderation eylemleri görünür ama içerik deneyimini domine etmeyecek şekilde tasarlanmalıdır.

## 48.10 Report flow

- İçerik veya kullanıcı bağlamı korunur.
- Sebep seçenekleri anlaşılır.
- Acil fiziksel tehlike gibi yüksek riskli durumlar doğru kanala yönlenir.
- Göndermeden önce gereksiz uzun form yok.
- Sonuç ve beklenti açıklanır.
- Reporter’ın güvenliği korunur.

## 48.11 Privacy dashboard

Uygun uygulamalarda:

- Toplanan veri kategorileri
- İzin durumu
- Personalization / AI memory
- Download data
- Delete data / account
- Marketing preferences
- Connected apps
- Active sessions

## 48.12 Store beyanı uyumu

App Store privacy bilgileri ve Google Play Data Safety formu, gerçek kod ve SDK davranışıyla aynı olmalıdır. Kod değiştiğinde beyan değişikliği de release checklist’in parçası olmalıdır.

## 48.13 Güven QA

- İzin reddi sonrası uygulama kullanılabilir mi?
- Account deletion gerçekten kalıcı süreci başlatıyor mu?
- Privacy policy uygulama içinden erişilebilir mi?
- Tracking kapalıyken app bozuluyor mu?
- Loglarda hassas veri var mı?
- Screenshot / app switcher hassas veri gösteriyor mu?
- Başka hesap cache’i görünüyor mu?
- Subscription ve account state karışıyor mu?
- Report/block tüm giriş noktalarında çalışıyor mu?
- Store beyanları güncel mi?

---

# 49. Premium performans mühendisliği

Kullanıcı performansı teknik metrik olarak değil, güven ve kontrol hissi olarak yaşar. Tasarım, kod ve backend performansı ayrı ele alınamaz.

## 49.1 Performance budget

Her uygulama kendi cihaz tabanına göre bütçe belirlemelidir.

```yaml
performance_budget:
  cold_start_p50_ms: 1200
  cold_start_p95_ms: 2500
  warm_start_p95_ms: 1200
  primary_interaction_feedback_ms: 100
  screen_transition_target_ms: 300
  api_first_content_p75_ms: 1500
  scroll_jank_target: "near_zero_on_supported_devices"
  crash_free_sessions_target: 99.8
  app_download_size_budget_mb: 80
  memory_warning_policy: required
  image_cache_limit_mb: 150
```

Bunlar örnek iç hedeflerdir; gerçek hedefler ürün, cihaz ve ağ bağlamına göre belirlenmelidir. Mağazaların “aşırı” eşikleri premium hedef değil, kaçınılması gereken alt sınırdır.

## 49.2 Critical User Journey performansı

Genel ortalama yerine kritik yolculukları ölçün:

- Uygulama aç → ana içerik
- Ara → sonuç gör
- İçerik oluştur → kaydet
- Fotoğraf çek → işle → sonuç
- Paywall → satın al → entitlement
- Mesaj yaz → gönder
- Offline değişiklik → sync
- AI prompt → ilk yararlı sonuç

Her yolculuk için başlangıç, ilk feedback, kullanılabilir içerik ve tamamlama sürelerini ayrı ölçün.

## 49.3 Startup aşamaları

```text
Process start
→ minimal dependency graph
→ first frame
→ interactive shell
→ cached content
→ fresh content
→ noncritical SDKs
```

Kaçınılacaklar:

- Tüm remote config gelmeden ekran göstermemek
- Analytics, ads veya chat SDK’sını kritik startup path’e koymak
- Senkron network çağrısı
- Büyük JSON parse işlemi main thread’de yapmak
- Kullanılmayan font/görsel yüklemek
- Her açılışta gereksiz database migration kontrolü

## 49.4 Algılanan hız teknikleri

- Instant press feedback
- Optimistic update — güvenli yerde
- Skeleton — geometri doğruysa
- Cached last-known content
- Progressive image loading
- Preload — gerçek kullanıcı niyetine göre
- Prefetch — ağ ve pil bütçesine göre
- Background preparation
- Streaming — AI ve uzun metinde
- Stale-while-revalidate

Algılanan hız sahte başarı veya yanıltıcı progress anlamına gelmez.

## 49.5 Rendering

- Gereksiz view/composable yeniden çizimlerini azaltın.
- Büyük listelerde virtualization/lazy yapı kullanın.
- Stable item key kullanın.
- Ağır blur ve sürekli shadow animasyonlarını sınırlayın.
- Görselleri hedef ölçüye decode edin.
- Main thread’de image processing yapmayın.
- Layout thrashing ve ölçüm döngülerini profil edin.
- Animated gradients ve particles için düşük cihaz fallback’i oluşturun.

## 49.6 Image pipeline

```text
source selection
→ CDN resize
→ modern format
→ correct cache headers
→ memory/disk cache
→ placeholder
→ decode at target size
→ cancellation on reuse
→ failure fallback
```

Premium image deneyimi yalnız yüksek çözünürlük değil, doğru crop ve hızlı yüklemedir.

## 49.7 Network

- Request deduplication
- Pagination
- Compression
- Conditional requests / ETag
- Timeout ve retry policy
- Exponential backoff
- Idempotency
- Cancellation
- Offline queue
- Partial response / incremental loading
- TLS ve certificate davranışı

Retry sonsuz döngü olmamalı; kullanıcıya kontrol verilmeli.

## 49.8 iOS performans çalışma seti

- Instruments ile Time Profiler
- Core Animation / rendering incelemesi
- Allocations ve leaks
- Network profiling
- Energy impact
- MetricKit production sinyalleri
- XCTest ölçümleri
- Launch ve scroll senaryoları
- SwiftUI view update nedenleri
- Image decode ve task cancellation

Yeni SwiftUI sürümlerinin sistem görünümünü otomatik kazandırması, özel override’ların ve eski compatibility kodunun gözden geçirilmesi gerekliliğini ortadan kaldırmaz.

## 49.9 Android performans çalışma seti

- Android Vitals
- Macrobenchmark
- Baseline Profiles
- Startup Profiles
- Perfetto
- Layout Inspector
- Compose recomposition araçları
- R8 optimization
- Memory profiler
- Battery / background work incelemesi

Baseline Profiles, kritik kod yollarını ilk çalıştırmadan itibaren hızlandırmak için kullanılmalı; Startup Profiles ve Macrobenchmark ile gerçek kazanım ölçülmelidir.

## 49.10 Degraded experience

Düşük performanslı cihaz veya düşük güç durumunda:

- Blur azalt
- Parallax kapat
- Büyük image resolution düşür
- Autoplay durdur
- Particle effect kaldır
- Daha basit chart render et
- Prefetch azalt
- Background work ertele

Ana görev ve erişilebilirlik korunmalıdır.

## 49.11 Performance regression gate

Bir PR şu durumlarda bloke edilebilir:

- Cold start p95 belirlenen bütçeyi aşıyor
- Kritik scroll benchmark kötüleşiyor
- App size bütçesi aşılıyor
- Yeni SDK startup path’e ekleniyor
- Main thread blocking operation ekleniyor
- Memory leak bulunuyor
- Network request sayısı beklenmedik artıyor
- Screenshot/motion testinde jank görülüyor

## 49.12 Performans rapor şablonu

```markdown
# Performance Report

## Build / device / OS

## Critical journey

## Before
- p50
- p95
- frames / jank
- memory
- network

## After

## Root cause

## Change

## Tradeoffs

## Regression protection
[Benchmark veya test]
```

---

# 50. Erişilebilirlik kabul sistemi

Erişilebilirlik bir “özellik listesi” değil, her ekran ve bileşenin yayın kabul kriteridir. Apple ve Android, erişilebilirliği platform kalitesinin temel parçası olarak ele alır.

## 50.1 Erişilebilirlik boyutları

- Görme: screen reader, zoom, kontrast, renk körlüğü
- Motor: touch target, Switch Control, Voice Control, keyboard
- İşitme: captions, transcript, görsel alternatif
- Bilişsel: açık dil, tutarlı navigasyon, zaman baskısının azaltılması
- Vestibüler: Reduce Motion, parallax kontrolü
- Konuşma: sesli giriş zorunluluğuna alternatif
- Durumsal: güneş, gürültü, tek el, kırık ekran, yavaş bağlantı

## 50.2 Minimum standart

- Semantik roller doğru
- Görünen kontrollerin erişilebilir adı var
- Focus sırası mantıklı
- Font scaling’de içerik kaybolmuyor
- Kritik bilgi yalnız renkle verilmiyor
- Kontrast yeterli
- Touch target platform minimumunu karşılıyor
- Form hataları duyuruluyor
- Motion azaltılabiliyor
- Video captions/transcript gereksinimi karşılanıyor
- Landscape ve large screen’de focus kaybolmuyor

## 50.3 Screen reader sözleşmesi

Her interaktif öğe için:

```text
label: Bu nedir?
role: Ne tür kontroldür?
value/state: Şu anki durumu nedir?
hint: Sonuç tahmin edilemiyorsa ne yapar?
actions: Standart tap dışında ne yapılabilir?
order: Hangi sırada okunur?
```

### Gruplama

Bir karttaki her dekoratif metni ayrı focus yapmak yerine anlamlı grup oluşturulabilir. Ancak grup içinde ayrı eylemler varsa bunlar erişilebilir kalmalıdır.

## 50.4 Dynamic Type / font scaling

Test seviyeleri:

- Varsayılan
- Birkaç büyük seviye
- En büyük accessibility seviye

Kabul kriterleri:

- Text clip yok
- Buton label kaybolmuyor
- İki kolon gerekirse tek kolona düşüyor
- Sabit yükseklikli text container yok
- Horizontal scroll zorunlu değil — veri tablosu gibi istisna hariç
- CTA ekrandan kaçmıyor
- Icon ve label ilişkisi korunuyor
- Chart’ın metinsel alternatifi var

## 50.5 Contrast

- Normal metin için WCAG hedeflerini kontrol edin.
- Büyük metin ve non-text UI contrast ayrı değerlendirilir.
- Disabled state okunamaz hale getirilmemeli; fakat interaktifmiş gibi de görünmemeli.
- Fotoğraf üstü metinde scrim veya solid surface kullanın.
- Glass/material arkasındaki değişken içerikte en kötü senaryoyu test edin.
- Focus ring yüzeyden ayrılmalı.

## 50.6 Renk körlüğü

- Status için icon, label veya pattern kullanın.
- Chart serilerini yalnız hue ile ayırmayın.
- Selected/unselected state shape veya stroke ile desteklenebilir.
- Error field renk + icon + text ile açıklanmalı.
- Simülasyon araçlarıyla test yapın; gerçek kullanıcı testi daha değerlidir.

## 50.7 Touch ve motor erişimi

- Minimum hit target
- Yakın küçük kontroller arasında yeterli mesafe
- Gesture’a alternatif görünür eylem
- Drag gerektiren görevde buton/menü alternatifi
- Uzun press tek erişim yolu değil
- Zamanlı işlemde süre uzatma/iptal
- Shake gibi cihaz hareketine alternatif

## 50.8 Keyboard ve Switch

- Tüm interaktif öğeler focus alır.
- Focus görünür.
- Modal focus trap doğru.
- Modal kapanınca focus mantıklı yere döner.
- Hidden/offscreen öğeler focus almaz.
- Tab order görsel sırayla tutarlı.
- Shortcut temel eylemi destekler ama tek yol olmaz.

## 50.9 Voice Control

- Görünen label ile accessibility name uyumlu olmalı.
- Aynı isimli çok sayıda kontrol bağlamla ayrılmalı.
- Icon-only kontroller tahmin edilebilir isim taşımalı.
- Özel gesture gereken görev için alternatif bulunmalı.

## 50.10 Captions ve audio

- Anlamlı konuşma captions ile sunulur.
- Yalnız otomatik altyazıya güvenilmez; kalite doğrulanır.
- Önemli ses cue’su görsel/haptik eşdeğer taşır.
- Transcript aranabilir veya kopyalanabilir olabilir.
- Caption style sistem tercihine saygı duyar.

## 50.11 Cognitive accessibility

- Navigasyon yeri sık değişmez.
- Bir ekranda tek ana görev.
- Teknik ve metaforik dil azaltılır.
- Uzun işlem adımlara ayrılır.
- Geri alma sağlanır.
- Time-out önceden bildirilir.
- Form verisi hata sonrası silinmez.
- Kullanıcı seçimleri hatırlanır.
- Otomatik oynayan içerik kontrol edilir.

## 50.12 Accessibility Nutrition Labels

Apple’ın güncel App Store sisteminde uygulamanın desteklediği erişilebilirlik özellikleri ürün sayfasında beyan edilebilir. Bu beyan pazarlama metni değil, test edilmiş gerçek davranış olmalıdır.

Portföy süreci:

1. Desteklenen özellikleri inventory et.
2. Her özellik için test kanıtı oluştur.
3. Store beyanını doldur.
4. Her major UI değişikliğinde yeniden doğrula.
5. Beyan ile gerçek app arasında fark varsa release’i durdur.

## 50.13 Otomatik test

Otomatik testler şunları yakalayabilir:

- Eksik label
- Düşük kontrast
- Küçük target
- Text clipping
- Bazı role/state hataları
- Focus erişimi

Ancak anlamlı label, doğru okuma sırası ve bilişsel kalite için manuel test şarttır.

## 50.14 Manuel kabul matrisi

| Test | iOS | Android | Sonuç |
|---|---|---|---|
| Screen reader ana akış | VoiceOver | TalkBack | Pass/Fail |
| En büyük font | Dynamic Type | Font scaling | Pass/Fail |
| Reduce Motion | System setting | System setting | Pass/Fail |
| Bold/high contrast | Platform settings | Contrast settings | Pass/Fail |
| Keyboard | iPad/external | Tablet/desktop | Pass/Fail |
| Switch/voice | Test | Test | Pass/Fail |
| RTL | Arabic/Hebrew | Arabic/Hebrew | Pass/Fail |

## 50.15 Erişilebilirlik issue severity

- **Blocker:** Ana görev tamamlanamıyor.
- **Critical:** Veri, ödeme veya hesap güvenliği etkileniyor.
- **Major:** Önemli işlev çok zor veya yanlış anlaşılıyor.
- **Minor:** Kalite düşüyor fakat alternatif yol var.

Blocker ve critical sorunlarla yayın yapılmaz.

---

# 51. Portföy analitiği ve deney sistemi

On altı uygulama, on altı farklı event diline sahip olmamalıdır. Ortak analytics grammar, ürünler arası karşılaştırmayı ve Codex’in doğru event üretmesini kolaylaştırır.

## 51.1 Event grammar

Önerilen form:

```text
object_action
```

Örnek:

```text
onboarding_started
search_submitted
search_result_opened
item_created
item_saved
paywall_viewed
plan_selected
purchase_started
purchase_completed
purchase_failed
permission_requested
permission_resulted
```

UI implementasyon detayını event adına gömmeyin:

```text
blue_button_clicked   ❌
upgrade_cta_selected  ✅
```

## 51.2 Ortak event alanları

```yaml
common_properties:
  app_id:
  app_version:
  platform:
  os_version:
  device_class:
  locale:
  theme:
  screen_name:
  source:
  experiment_ids:
  account_state:
  entitlement_state:
  network_state:
```

Kişisel veya hassas veriyi analytics property yapmayın.

## 51.3 North star ve guardrail

Her uygulamada:

- Bir ana değer metriği
- Activation metriği
- Retention metriği
- Revenue metriği
- Quality guardrail
- Trust guardrail

Örnek:

```text
North star: Haftalık tamamlanan anlamlı görev
Activation: İlk 24 saatte ilk görev
Retention: D7 görev tekrarı
Revenue: Net paid conversion
Quality: Crash-free + critical flow success
Trust: Refund + delete + complaint oranı
```

## 51.4 Portföy ortak funnel’ları

### Acquisition

```text
store_view → install → first_open
```

### Activation

```text
first_open → onboarding_start → first_value_start → first_value_complete
```

### Monetization

```text
premium_intent → paywall_view → plan_select → purchase_start → purchase_complete
```

### Retention

```text
value_complete → return → repeat_value
```

## 51.5 Event ownership

- Component library generic business event üretmemeli.
- Screen/view model veya domain layer event anlamını belirlemeli.
- Aynı kullanıcı eylemi çift event üretmemeli.
- Retry, cancel ve failure ayrı ölçülmeli.
- Event schema test edilebilir olmalı.

## 51.6 Experiment contract

```markdown
# Experiment

## Hypothesis

## Target audience

## Primary metric

## Guardrails

## Variants

## Exposure event

## Sample / duration rule

## Stop conditions

## Result

## Decision

## Rollout plan
```

## 51.7 Deney guardrail’leri

- Crash / ANR
- Startup
- Accessibility
- Refund
- Support complaints
- Uninstall
- D7/D30 retention
- Purchase restore
- Error rate
- Data/privacy incident

A/B test altyapısı UI’da flash, layout shift veya yanlış varyant cache’i yaratmamalıdır.

## 51.8 Cross-app learning log

```markdown
# Portfolio Learning

## Pattern tested

## Apps tested

## Shared hypothesis

## Context differences

## Results

## What generalizes

## What does not generalize

## Design system implication
```

## 51.9 Analytics QA

- Event tam bir kez gidiyor mu?
- Offline event queue doğru mu?
- User identity account switch’te değişiyor mu?
- Consent kapalıyken davranış doğru mu?
- Experiment exposure gerçekten görünüm olduğunda mı?
- Currency ve revenue doğru mu?
- Failure reason kişisel veri içermiyor mu?
- Debug ve production environment ayrılmış mı?
- Event versioning var mı?

---

# 52. QA, görsel regresyon ve yayın otomasyonu

Premium kaliteyi manuel gözle tek sefer kontrol etmek 16 uygulamada sürdürülemez. Görsel, erişilebilirlik, performans ve davranış testleri release pipeline’a bağlanmalıdır.

## 52.1 Test piramidi

```text
           Exploratory / usability
        End-to-end critical journeys
      Screenshot / accessibility tests
    Component interaction / integration
          Unit / domain tests
```

UI testi yalnız happy path’e odaklanmamalıdır.

## 52.2 Screenshot / snapshot seti

Her kritik ekran için:

- Light
- Dark
- Small phone
- Large phone
- Large font
- Long locale
- RTL
- Loading
- Empty
- Error
- Offline
- Premium/free state
- Tablet compact/expanded gerekiyorsa

Snapshot farkı otomatik kabul edilmemeli; bilinçli review gerekir.

## 52.3 Golden flow seti

Her uygulamada 3–7 kritik akış seçin:

```text
GF-01 First value
GF-02 Primary repeat task
GF-03 Search/discovery
GF-04 Create/edit/save
GF-05 Purchase/restore
GF-06 Account/security
GF-07 Offline/recovery
```

Her golden flow için test data ve deterministic environment sağlanmalıdır.

## 52.4 Visual QA katmanları

1. Token doğruluğu
2. Component state
3. Screen hierarchy
4. Platform behavior
5. Localization
6. Accessibility
7. Motion
8. Real device rendering
9. Store screenshot parity

## 52.5 UI issue formatı

```markdown
# UI Issue

## Screen / flow

## Build / device / OS

## Expected

## Actual

## Evidence
Screenshot or video

## Design token / component

## Severity
Blocker / Critical / Major / Minor

## Reproduction
1.
2.
3.

## Accessibility impact

## Suggested acceptance criteria
```

## 52.6 PR kalite kontrolü

UI PR’ında:

- Önce/sonra görsel
- Desteklenen state listesi
- Platform farkları
- Accessibility sonucu
- Localization sonucu
- Testler
- Analytics değişikliği
- Performance etkisi
- Privacy/permission etkisi
- Design system version

## 52.7 CI kalite kapıları

```text
format/lint
→ unit tests
→ component tests
→ screenshot tests
→ accessibility checks
→ critical flow tests
→ performance smoke
→ dependency/security checks
→ build size check
→ release metadata validation
```

## 52.8 Device farm stratejisi

- En düşük desteklenen cihaz/OS
- En yaygın cihaz sınıfı
- En yeni premium cihaz
- Küçük ekran
- Büyük ekran
- Tablet/foldable
- Düşük RAM Android
- Farklı refresh rate
- Gerçek cihazda kamera/biometric/notification

Emülatör hızlı iterasyon için, gerçek cihaz final kalite için gereklidir.

## 52.9 Release candidate testi

- Clean install
- Upgrade from previous production
- Upgrade from older schema
- Logged-in session migration
- Guest data migration
- Subscription entitlement
- Push/deep link
- Background/foreground
- Airplane mode
- Low storage
- Permission changes from Settings
- Account deletion
- App review demo account

## 52.10 Store submission readiness

- Privacy/Data Safety güncel
- Account deletion yolu çalışıyor
- In-app purchase ürünleri doğru
- Restore test edildi
- Review notes ve test account hazır
- Screenshot gerçek UI ile uyumlu
- Age rating/content declarations doğru
- Support/privacy URL çalışıyor
- Accessibility beyanları doğrulandı
- Büyük ekran assets gerekiyorsa hazır

## 52.11 Codex QA rolü

Codex’e yalnız “kod yaz” değil, bağımsız reviewer rolü de verin:

```text
1. Diff'i incele.
2. Design tokens dışı değerleri bul.
3. State eksiklerini listele.
4. Accessibility ihlallerini bul.
5. Platform anti-pattern'lerini bul.
6. Test eksiklerini yaz.
7. Güvenli düzeltmeleri uygula.
8. Çalıştırılan testleri raporla.
```

Aynı agent’ın yazdığı kodu ikinci bir thread/agent ile review etmek kör noktayı azaltabilir.

## 52.12 Release sonrası izleme

İlk 24–72 saat:

- Crash / ANR
- Startup
- Purchase failure
- Login failure
- API error
- Rating/review
- Support ticket
- Funnel drop
- Accessibility complaint
- Device-specific layout issue

Rollback, feature flag veya hotfix kriterleri önceden belirlenmelidir.

---

# 53. 16 mevcut uygulamayı dönüştürme programı

Tüm uygulamaları aynı anda yeniden tasarlamak yüksek risklidir. Önce en fazla kullanıcı değeri ve öğrenme sağlayacak pilotlar seçilmelidir.

## 53.1 Uygulama envanteri

Her uygulama için:

```yaml
app:
  name:
  platform:
  stack:
  status: prototype|beta|production
  active_users:
  revenue:
  strategic_value:
  design_debt:
  technical_debt:
  crash_risk:
  store_risk:
  shared_components:
  primary_flow:
  monetization:
  last_release:
```

## 53.2 Öncelik puanı

Örnek formül:

```text
Priority =
(User impact × 3)
+ Revenue opportunity × 2
+ Strategic value × 2
+ Store/compliance risk × 3
+ Reusability learning × 2
- Migration effort × 2
- Regression risk × 2
```

1–5 arası puanlayın. Formülü körü körüne değil, karar tartışmasını görünür kılmak için kullanın.

## 53.3 Dört uygulama sınıfı

| Sınıf | Yaklaşım |
|---|---|
| A — Yüksek değer / düşük efor | İlk dalga, hızlı kazanım |
| B — Yüksek değer / yüksek efor | Pilot sonrası planlı dönüşüm |
| C — Düşük değer / düşük efor | Shared system doğrulama |
| D — Düşük değer / yüksek efor | Dondur, birleştir veya sonlandırmayı değerlendir |

Premiumlaştırmak her uygulamayı sürdürmek zorunda olduğunuz anlamına gelmez.

## 53.4 Audit başlıkları

Her uygulamayı 0–5 puanlayın:

- Ürün değerinin açıklığı
- İlk değer süresi
- Bilgi mimarisi
- Navigasyon
- Görsel hiyerarşi
- Token tutarlılığı
- Platform doğallığı
- State completeness
- Accessibility
- Performance
- Offline/recovery
- Trust/privacy
- Monetization
- Analytics
- Store presentation
- Test coverage
- Codex repo context

## 53.5 Audit kanıtı

Her puan için kanıt:

- Screenshot
- Video
- Kod konumu
- Test sonucu
- Performance trace
- Store listing
- Analytics funnel
- User feedback

“Bence kötü” audit değildir.

## 53.6 Pilot seçimi

İlk pilot ideal olarak:

- Gerçek kullanıcı değeri olan
- Orta karmaşıklıkta
- Diğer uygulamalarda tekrar eden component içeren
- Çok yüksek store/compliance riski olmayan
- Hızlı ölçülebilir sonuç veren
- Hem iOS hem Android öğrenimi sağlayan

İki pilot seçilebilir: biri içerik ağırlıklı, biri tool/workflow ağırlıklı.

## 53.7 Dönüşüm seviyeleri

### Level 1 — Surface cleanup

- Tokenlaştırma
- Spacing/type düzeltme
- Renk/contrast
- State eksikleri
- Copy düzeltme

### Level 2 — Component refactor

- Ortak component contracts
- Navigation düzeltme
- Form ve list yeniden yapılandırma
- Accessibility
- Snapshot tests

### Level 3 — Flow redesign

- Onboarding
- Ana görev
- Search
- Paywall
- Account lifecycle

### Level 4 — Product redesign

- Bilgi mimarisi
- Değer önerisi
- Feature set
- İş modeli
- Backend/sync

Her uygulama Level 4 gerektirmez.

## 53.8 Sekiz dalgalı örnek program

```text
Wave 0: Portfolio foundation
Wave 1: Pilot app A
Wave 2: Pilot app B + core refinement
Wave 3: Apps 3–4
Wave 4: Apps 5–7
Wave 5: Apps 8–10
Wave 6: Apps 11–13
Wave 7: Apps 14–16
Wave 8: Portfolio consistency and store refresh
```

Aynı anda en fazla birkaç uygulamada derin UI refactor yürütün; aksi halde shared system sürekli değişir.

## 53.9 Her uygulama dönüşüm teslimatı

```text
Before audit
APP_PROFILE
Critical journey maps
Theme manifest
Token adoption
Component migration map
Screen state inventory
Accessibility report
Performance report
Analytics map
Store asset refresh
Release and rollback plan
After score
```

## 53.10 Refactor mı yeniden yazım mı?

Yeniden yazım yalnız şu durumda düşünülmeli:

- Mevcut mimari ana akışı güvenli değiştirmeyi engelliyorsa
- Test eklemek makul değilse
- Stack terk edilmiş veya sürdürülmüyorsa
- Platform davranışları ciddi biçimde bozuksa
- Shared core adoption maliyeti mevcut kodu aşacaksa

Aksi halde ekran/akış bazlı strangler migration daha güvenlidir.

## 53.11 Migration map

| Eski | Yeni | Strateji | Risk | Test |
|---|---|---|---|---|
| LegacyButton | AppButton | Adapter → replace | Medium | Snapshot |
| Custom nav | Platform nav | Flow rewrite | High | E2E |
| Hardcoded colors | Semantic tokens | Automated + review | Low | Visual regression |
| Old paywall | Paywall V2 | Feature flag | High | Sandbox purchase |

## 53.12 Feature flag

Büyük değişikliklerde:

- User cohort rollout
- Internal/beta flag
- Server kill switch
- Old/new analytics separation
- Rollback-safe data model
- Entitlement compatibility

## 53.13 Durdurma kriterleri

Bir dönüşüm dalgasını durdurun, eğer:

- Critical flow failure yükselirse
- Crash/ANR artarsa
- Purchase/restore bozulursa
- Accessibility blocker çıkarsa
- Veri kaybı riski varsa
- Store policy uyumsuzluğu oluşursa
- Design system değişimi üçten fazla uygulamayı kırarsa

## 53.14 Portföy hedefi

İlk hedef tüm uygulamaların “mükemmel” görünmesi değil:

1. Blocker kalite risklerini kaldırmak
2. Ortak sistemi kurmak
3. En değerli uygulamalarda premium farkı kanıtlamak
4. Öğrenimi diğer uygulamalara taşımak
5. Düşük değerli uygulamalar için devam/sonlandırma kararı almak

---

# 54. Codex çalışma sistemi ve repo talimatları

Codex’ten tutarlı premium sonuç almak için her görevde uzun prompt yazmak yeterli değildir. Kalıcı repo bağlamı, küçük ve doğrulanabilir görevler, test komutları ve karar belgeleri gerekir.

OpenAI’nin resmî Codex dokümantasyonuna göre Codex, işe başlamadan önce `AGENTS.md` talimatlarını okuyabilir. Bu dosyayı tüm tasarım rehberini kopyaladığınız dev bir metin yapmak yerine, Codex’in doğru dokümana gitmesini sağlayan kısa bir işletim sözleşmesi olarak kullanın.

## 54.1 Önerilen repo yapısı

```text
repo/
├── AGENTS.md
├── README.md
├── PLANS.md                     # Uzun görevlerde plan standardı
├── docs/
│   ├── INDEX.md
│   ├── APP_PROFILE.md
│   ├── PRODUCT_BRIEF.md
│   ├── ARCHITECTURE.md
│   ├── DESIGN_SYSTEM.md
│   ├── COMPONENT_CONTRACTS.md
│   ├── SCREEN_SPECS.md
│   ├── ACCESSIBILITY.md
│   ├── PERFORMANCE_BUDGET.md
│   ├── ANALYTICS_PLAN.md
│   ├── PRIVACY_AND_PERMISSIONS.md
│   ├── QA_MATRIX.md
│   ├── RELEASE_CHECKLIST.md
│   └── DECISIONS/
├── design/
│   ├── tokens/
│   ├── screenshots/
│   ├── references/
│   └── audits/
├── scripts/
│   ├── verify_tokens.*
│   ├── capture_screenshots.*
│   └── quality_gate.*
└── app-source/
```

## 54.2 Root `AGENTS.md` ilkeleri

- Kısa ve yüksek öncelikli olsun.
- Kod yazmadan önce okunacak belgeleri söylesin.
- Build/test komutlarını içersin.
- Design token ve platform kurallarını zorunlu kılsın.
- Değişiklik kapsamı ve güvenlik sınırlarını tanımlasın.
- Bitmiş işin nasıl raporlanacağını söylesin.
- Alt klasörlerde stack veya modül bazlı override `AGENTS.md` kullanılabilir.

## 54.3 Kopyalanabilir `AGENTS.md`

```markdown
# AGENTS.md

## Mission
Build and maintain this app as a production-quality, platform-native,
accessible, performant premium mobile product. Do not optimize only for
screenshots. Every change must handle real states, real data, errors,
localization, accessibility, performance and tests.

## Read before changing UI
1. `docs/APP_PROFILE.md`
2. `docs/PRODUCT_BRIEF.md`
3. `docs/DESIGN_SYSTEM.md`
4. `docs/COMPONENT_CONTRACTS.md`
5. The relevant section of `docs/SCREEN_SPECS.md`
6. `docs/ACCESSIBILITY.md`
7. `docs/PERFORMANCE_BUDGET.md`
8. `docs/QA_MATRIX.md`

Do not invent a new visual language when these files already define one.
If documentation conflicts with code, stop and identify the conflict in the
final report. Use the documented decision unless it would break the app or
violate platform requirements.

## Working method
- Inspect the existing implementation before proposing changes.
- Reuse existing domain logic and stable components.
- Prefer the smallest complete change over broad unrelated refactors.
- For a task spanning multiple screens, architecture layers, migrations or
  more than one day of work, create or update an ExecPlan using `PLANS.md`.
- Preserve user data and backward compatibility.
- Never remove behavior merely to make a screenshot cleaner.
- Do not silently change analytics, permissions, subscription logic,
  account deletion, privacy behavior or navigation contracts.

## Premium UI rules
- Use semantic design tokens. Do not add raw colors, spacing, radii,
  typography sizes or animation durations inside feature code unless a
  documented exception exists.
- One primary action per visual region.
- Use platform-native navigation and interaction expectations.
- iOS and Android may share product structure but must not be forced into
  identical controls.
- Avoid decorative glass, gradients, shadows and animation without purpose.
- Do not create nested cards or put every section in a rounded rectangle.
- Preserve readable hierarchy in light mode, dark mode and high contrast.
- Every asynchronous screen must define loading, content, empty, partial,
  error, offline and retry behavior as applicable.
- Every destructive action must define prevention, confirmation and recovery.
- Do not use placeholder copy such as “Lorem ipsum”, “Something went wrong”,
  “Click here”, “Submit” or invented testimonials in production code.

## Accessibility rules
- All controls require correct semantic roles, labels, values and states.
- Support platform text scaling without clipping or loss of actions.
- Do not encode meaning by color alone.
- Respect Reduce Motion and system accessibility settings.
- Maintain logical focus order and keyboard support where applicable.
- Decorative images must not pollute the accessibility tree.
- UI changes require accessibility tests or a documented manual test result.

## Performance rules
- Keep expensive work off the main/UI thread.
- Avoid unnecessary renders/recompositions.
- Use lazy/virtualized lists for unbounded content.
- Decode and request images near their display size.
- Cancel obsolete async work.
- Do not add startup-blocking SDK work.
- Changes to critical journeys must stay within
  `docs/PERFORMANCE_BUDGET.md`.

## Data and trust rules
- Do not log secrets, tokens, passwords or user content.
- Do not add data collection without updating privacy documentation.
- Permission requests must be contextual and recoverable after denial.
- Subscription and entitlement state must remain server/store authoritative.
- Account deletion must remain reachable and functional.
- Preserve drafts and queued user work through errors whenever possible.

## Testing
Before finishing, run the repository's documented commands for:
- formatting and lint
- unit tests
- relevant component/integration tests
- screenshot/snapshot tests for changed UI
- accessibility checks
- critical journey tests when affected
- build for all affected targets/configurations

If a test cannot run, report the exact command, failure and remaining risk.
Do not claim a test passed unless it was executed successfully.

## Definition of done
A task is complete only when:
- the requested behavior works,
- all applicable states exist,
- platform differences are respected,
- accessibility is verified,
- tests are added or updated,
- documentation is updated when contracts changed,
- no unrelated regression is introduced,
- the final response lists files changed, tests run and residual risks.

## Final response format
1. Summary
2. User-visible behavior changed
3. Files changed
4. Tests run and results
5. Accessibility/performance/privacy impact
6. Remaining risks or follow-up work
```

## 54.4 Alt klasör `AGENTS.md`

Örnek iOS override:

```markdown
# iOS UI instructions

- Prefer SwiftUI system components and current platform APIs.
- Preserve Dynamic Type, VoiceOver and Reduce Motion.
- Use safe area and system navigation behavior.
- Treat Liquid Glass as an interaction/chrome material, not a blanket
  content-card effect.
- Use SF Symbols when the symbol communicates the action correctly.
- Validate sheets, toolbars, tab bars and search against current HIG.
- Run the documented iOS snapshot and accessibility test schemes.
```

Örnek Android override:

```markdown
# Android UI instructions

- Prefer Jetpack Compose and Material 3 components where compatible with
  the architecture.
- Support edge-to-edge and correct insets.
- Use Material 3 adaptive patterns based on window state, not device names.
- Preserve predictive/system back behavior.
- Use semantic colors and dynamic color only according to the app profile.
- Validate TalkBack, font scaling, keyboard, large screen and foldable states.
- Run Macrobenchmark/Baseline Profile tasks when critical journeys change.
```

## 54.5 `docs/INDEX.md`

Codex’in yüzlerce belge içinde kaybolmaması için kısa indeks:

```markdown
# Documentation Index

- `APP_PROFILE.md` — Brand, audience, product personality and visual direction.
- `PRODUCT_BRIEF.md` — User problem, value proposition and business model.
- `ARCHITECTURE.md` — Modules, data flow and platform architecture.
- `DESIGN_SYSTEM.md` — Tokens, themes and global UI rules.
- `COMPONENT_CONTRACTS.md` — Behavior and states of reusable components.
- `SCREEN_SPECS.md` — Screen purpose, states, actions and analytics.
- `ACCESSIBILITY.md` — Acceptance criteria and test procedures.
- `PERFORMANCE_BUDGET.md` — Measurable budgets and benchmark commands.
- `QA_MATRIX.md` — Devices, states and regression suites.
- `RELEASE_CHECKLIST.md` — Store and production release gates.
- `DECISIONS/` — Architecture and design decision records.
```

## 54.6 `PLANS.md` / ExecPlan standardı

Uzun görevlerde plan bir sohbet sözü değil, repo içinde güncellenen çalışma belgesi olmalıdır.

```markdown
# Execution Plan Standard

Use an ExecPlan when a task:
- changes multiple modules or critical flows,
- includes a data or design-system migration,
- requires unknown-code exploration,
- affects subscriptions, privacy, auth or offline data,
- needs staged rollout or feature flags.

Each plan must include:
1. Goal and non-goals
2. Current-state findings
3. User-visible acceptance criteria
4. Architecture and design decisions
5. Milestones
6. Test and measurement plan
7. Migration and rollback plan
8. Risks
9. Progress log
10. Final outcome

Update the plan as facts are discovered. Do not preserve a known-false plan.
```

## 54.7 Codex task anatomy

İyi görev:

```text
Context
+ exact user problem
+ affected flow/screen
+ constraints
+ source-of-truth documents
+ required states
+ platform expectations
+ acceptance criteria
+ tests
+ allowed scope
```

Zayıf görev:

```text
Make the app premium.
```

Güçlü görev:

```text
Audit and redesign the saved-items flow using the existing semantic tokens
and AppCard contract. Preserve navigation and data APIs. Implement loading,
empty, content, offline and recoverable error states. On iOS use native sheet
and toolbar behavior; on Android preserve predictive back and edge-to-edge.
Support the largest text size. Add snapshots for light/dark/large text and an
integration test for retry. Do not change unrelated screens.
```

## 54.8 Inspect → plan → implement → verify döngüsü

Codex görevlerinin varsayılan sırası:

1. İlgili dosyaları ve mevcut davranışı incele.
2. Tasarım/ürün belgelerinden sözleşmeyi çıkar.
3. Eksik bilgi varsa kod ve testten güvenli varsayım üret; varsayımı raporla.
4. Küçük bir plan oluştur.
5. En küçük tam değişikliği uygula.
6. Build ve test çalıştır.
7. Görsel/state/accessibility review yap.
8. Dokümantasyonu güncelle.
9. Diff’i ikinci kez incele.
10. Kanıtlı sonuç raporla.

## 54.9 Multi-agent kullanım

Codex’in paralel agent/thread çalışma modeli, görevler doğru ayrıldığında yararlıdır.

Örnek dağılım:

```text
Agent A — Existing UI and design-system audit
Agent B — Accessibility and localization audit
Agent C — Performance and state-management audit
Agent D — Implementation of isolated component migration
Agent E — Independent diff review and test gap analysis
```

Aynı dosyalarda paralel yazım conflict yaratabilir. Paralel görevleri dosya veya sorumluluk sınırlarıyla ayırın.

## 54.10 Codex skills

Tekrarlanan iş akışları skill haline getirilebilir:

- Premium UI audit
- Token migration
- Accessibility audit
- Screenshot capture
- Store release audit
- Paywall compliance check
- Performance benchmark
- App profile generation
- Screen spec generation
- Visual regression review

Skill içinde talimat, kaynak ve güvenli otomasyon script’leri bulunabilir. Skill, repo sözleşmesinin yerine değil, tekrar eden uygulama biçiminin standardı olarak kullanılmalıdır.

## 54.11 Codex’in yapmaması gerekenler

- Tasarım kaynağına bakmadan yeni palette üretmek
- Tüm UI’ı tek seferde yeniden yazmak
- Testi silerek build’i yeşile çevirmek
- Accessibility label’larını rastgele tahmin etmek
- Gerçek API yerine sessizce mock bırakmak
- İş mantığını view içine taşımak
- Subscription doğrulamasını yalnız local boolean yapmak
- Hata state’ini yalnız `print`/log ile yönetmek
- Raw colors ve magic spacing eklemek
- Platform kontrolünü custom taklit etmek
- Kullanıcı verisini migration olmadan silmek
- “Tests pass” demek ama test çalıştırmamak

## 54.12 Codex kalite raporu

Her büyük görev sonunda:

```markdown
## Summary

## User-visible changes

## Design-system compliance
- Tokens used:
- Components reused/added:
- Exceptions:

## States implemented
- Loading:
- Empty:
- Error:
- Offline:
- Success:

## Platform behavior
- iOS:
- Android:

## Accessibility

## Performance

## Privacy / analytics / subscription impact

## Tests executed
- command — result

## Screenshots / evidence

## Remaining risks
```

---

# 55. Master Codex prompt kütüphanesi

Aşağıdaki promptlar doğrudan kullanılabilir; köşeli alanları uygulama bilgileriyle doldurun. Codex’in repodaki `AGENTS.md` ve docs dosyalarını okumasını açıkça isteyin.

## 55.1 Tüm uygulamayı premium audit et

```text
Read AGENTS.md and all relevant files under docs/ before making changes.
Do not edit code yet.

Perform a production-quality premium mobile audit of this repository.
Evaluate:
1. product value clarity and first-value flow,
2. information architecture and navigation,
3. visual hierarchy and design-token consistency,
4. iOS/Android platform fidelity,
5. component state completeness,
6. accessibility,
7. loading/error/empty/offline behavior,
8. performance and perceived speed,
9. auth, permissions, privacy and account deletion,
10. subscription/paywall/restore behavior,
11. analytics and experimentation integrity,
12. tests, store readiness and release risk.

For every issue provide:
- evidence with file path and symbol/screen,
- severity: Blocker/Critical/Major/Minor,
- user impact,
- recommended fix,
- likely effort,
- whether it belongs in the shared portfolio design system.

Create `design/audits/premium-audit-[date].md` and a prioritized migration
backlog. Do not give generic advice. Tie each finding to this codebase.
```

## 55.2 Uygulama profili oluştur

```text
Read the product, code, current screens and store metadata available in the
repository. Create `docs/APP_PROFILE.md` using the template in the premium
mobile design guide.

Infer only what is supported by evidence. Mark uncertain items as assumptions.
Define:
- audience and core job,
- first-value moment,
- brand traits and avoid traits,
- visual archetype,
- content density,
- typography/color/surface/shape direction,
- motion personality,
- iOS and Android adaptation rules,
- monetization tone,
- accessibility and performance priorities.

Do not change code. End with five unresolved product decisions ranked by impact.
```

## 55.3 Hardcoded UI değerlerini tokenlara taşı

```text
Read AGENTS.md, DESIGN_SYSTEM.md and the current token implementation.
Audit the target module for raw colors, spacing, radii, typography, elevation
and animation constants.

Create a migration map first. Reuse existing semantic tokens whenever their
meaning matches. Add a token only when the value represents a reusable semantic
role; do not create tokens named after a specific screen.

Migrate [TARGET MODULE/SCREEN] without changing business behavior.
Preserve light/dark/high-contrast behavior and platform-native controls.
Add or update snapshot tests for the changed states.
Report every intentional visual change and every remaining exception.
```

## 55.4 Bir ekranı premiumlaştır

```text
Read the screen spec and component contracts for [SCREEN]. Inspect the existing
implementation and data flow before editing.

Redesign and implement [SCREEN] so that:
- the primary user goal is visually dominant,
- content hierarchy remains clear without decorative effects,
- only semantic design tokens are used,
- existing domain behavior and navigation are preserved,
- loading, partial, content, empty, offline, recoverable error and fatal error
  states are handled as applicable,
- the largest supported text size does not clip or hide actions,
- screen-reader order and labels are correct,
- Reduce Motion is respected,
- localization and RTL are supported,
- iOS and Android use platform-natural navigation and controls.

Avoid nested cards, excessive gradients, blanket glass, raw magic values and
placeholder copy. Add tests and provide before/after evidence.
```

## 55.5 Ana kullanıcı akışını yeniden tasarla

```text
Create an ExecPlan for improving the critical journey:
[ENTRY] → [STEPS] → [SUCCESS].

Before implementation:
- map the current flow and all entry points,
- identify abandonment, error, permission, auth, offline and entitlement paths,
- define first feedback and success criteria,
- identify data migration or analytics impact.

Implement in small milestones behind a feature flag when appropriate.
Preserve drafts and user data. Add end-to-end tests for happy path, network
failure, cancellation and recovery. Measure step count and latency before and
after. Do not redesign unrelated surfaces.
```

## 55.6 iOS platform uyum audit’i

```text
Act as an iOS design and implementation reviewer.
Read AGENTS.md and iOS-specific docs. Audit the app against current Apple HIG
and the app's product contracts.

Review navigation stacks, tab bars, toolbars, sheets, search, safe areas,
Dynamic Type, VoiceOver, Reduce Motion, haptics, keyboard/pointer on iPad,
light/dark appearance and Liquid Glass usage.

Flag custom controls that unnecessarily replace system behavior. Specifically
identify content-layer glass, unreadable material, incorrect toolbar grouping,
fixed-height text, broken sheet dismissal and non-native back behavior.

Produce a ranked report first. Apply only safe, scoped fixes requested by the
task and run the documented iOS test schemes.
```

## 55.7 Android platform uyum audit’i

```text
Act as an Android UX, Compose and app-quality reviewer.
Read AGENTS.md and Android-specific docs.

Audit Material 3/Material 3 Expressive usage, edge-to-edge and insets,
system/predictive back, navigation, dynamic color strategy, TalkBack, font
scaling, keyboard/pointer, performance, Android Vitals risk and adaptive layouts
for compact, medium and expanded windows, tablets and foldables.

Identify device-name or orientation hacks, fixed-size layouts, incorrect back
handling, missing window-state adaptation, raw colors and unnecessary custom
components. Produce evidence and severity. Then apply only the requested scoped
fixes and run tests/benchmarks.
```

## 55.8 Erişilebilirlik audit ve düzeltme

```text
Audit [FLOW/SCREEN/MODULE] for accessibility without changing visual branding.
Test or inspect:
- semantics, labels, roles, values and actions,
- focus order and modal focus,
- VoiceOver/TalkBack,
- largest text size/font scaling,
- contrast and non-color status cues,
- touch targets,
- Reduce Motion,
- keyboard/switch/voice interaction where applicable,
- captions/transcripts for media,
- RTL and localization expansion.

Create a severity-ranked report. Fix all blocker and critical issues, add
automated checks where possible and document manual test steps. Do not claim
manual assistive-technology testing unless it was actually performed.
```

## 55.9 Loading, empty, error ve offline state ekle

```text
Inspect the data source and current state model for [SCREEN].
Define a typed UI state model that distinguishes the real conditions instead of
using a single boolean loading flag.

Implement applicable states:
initial, loading, cached/partial, content, empty-first-use, empty-filtered,
offline-with-cache, offline-without-cache, recoverable error, permission denied,
auth expired and fatal error.

Preserve useful content during refresh and retry. Never clear user input after
failure. Write context-specific copy and recovery actions. Add state previews or
snapshots and tests for transitions, not only static rendering.
```

## 55.10 Paywall ve satın alma audit’i

```text
Read the subscription architecture and store configuration docs.
Audit [PAYWALL/FLOW] for value clarity, price transparency, trial eligibility,
plan comparison, restore purchases, pending transactions, billing issues,
verification, entitlement refresh, cancellation paths, localization,
accessibility and store compliance.

Do not implement dark patterns, fake scarcity, fake popularity or hidden annual
totals. Ensure the UI renders from real store product data and real eligibility.

Create a purchase-state model and test matrix. Add sandbox tests or mocks at the
correct boundary. Do not replace server/store entitlement verification with a
local boolean.
```

## 55.11 Performans iyileştirme

```text
Read PERFORMANCE_BUDGET.md. Measure before editing.
Profile the critical journey [JOURNEY] on the documented representative device.
Identify startup, main-thread, rendering/recomposition, image, network, memory
and dependency costs.

Apply the smallest high-impact fixes. On Android, evaluate Baseline Profiles,
Startup Profiles and Macrobenchmark. On iOS, use the documented Instruments and
MetricKit workflow. Preserve UI behavior and accessibility.

Measure after. Report p50/p95 where available, exact commands/tools, tradeoffs
and a regression test. Do not claim improvement from code inspection alone.
```

## 55.12 Offline ve sync güvenliği

```text
Audit [FEATURE] for app termination, no network, slow network, retries, duplicate
submissions, account switching, conflict and server rejection.

Define explicit states and data ownership. Add idempotency and durable queueing
where architecture supports it. Preserve drafts. Make server-authoritative data
clear. Provide conflict recovery without silent data loss.

Add tests for network loss during submit, app kill, retry, duplicate tap and
multi-device conflict. Document what remains online-only.
```

## 55.13 Görsel regresyon reviewer

```text
Review all changed screenshots against APP_PROFILE.md, DESIGN_SYSTEM.md and
COMPONENT_CONTRACTS.md.

For each difference classify it as:
- intended improvement,
- acceptable platform variation,
- regression,
- unresolved ambiguity.

Check hierarchy, spacing rhythm, typography, contrast, component states,
safe-area/insets, dark mode, large text, RTL, empty/error/loading and tablet
layouts. Look specifically for AI-generated UI anti-patterns: nested cards,
excessive rounding, decorative gradients, inconsistent icons, arbitrary shadows
and generic placeholder content.

Do not approve snapshots merely because they are new. Produce a concise review
and fix confirmed regressions.
```

## 55.14 Store release audit

```text
Run a release-readiness audit for [APP/BUILD].
Check clean install and upgrade, critical journeys, auth, purchases and restore,
account deletion, permissions, privacy/Data Safety declarations, accessibility
claims, deep links, notifications, offline recovery, crash/performance signals,
store metadata, screenshots, support/privacy URLs and review credentials.

Compare store screenshots to the actual build. Flag misleading or stale claims.
Create `docs/releases/[VERSION]-readiness.md` with pass/fail evidence, blockers,
owner and rollback plan. Do not submit or publish automatically.
```

## 55.15 16 uygulama portföy karşılaştırması

```text
Using each repository's latest premium audit and app profile, build a portfolio
comparison table for all 16 apps.

Normalize scores across product value, first-value flow, visual system,
platform fidelity, state completeness, accessibility, performance, trust,
monetization, analytics, testing and store readiness.

Rank migration priority using user impact, revenue opportunity, compliance risk,
reusability learning, effort and regression risk. Recommend two pilot apps and
explain why. Identify components and workflows that should become shared core
versus app-specific. Do not rank purely by visual appearance.
```

## 55.16 Bağımsız final review

```text
Do not edit immediately. Independently review the current branch as if another
agent implemented it.

Read the original task, AGENTS.md, relevant docs and the diff. Verify:
- acceptance criteria,
- unintended behavior changes,
- state completeness,
- platform fidelity,
- accessibility,
- performance,
- privacy/subscription/analytics impact,
- test quality and missing cases,
- design-system compliance.

Run the relevant tests. Fix only high-confidence defects within scope. Report
remaining risks and explicitly distinguish executed evidence from inference.
```

---

# 56. Stack bazlı uygulama rehberi

Design system ürün mantığını paylaşabilir; fakat uygulama yöntemi stack’in güçlü yönlerine göre kurulmalıdır. Bu bölüm mimariyi dikte etmez, premium kalite için minimum uygulama yönünü verir.

## 56.1 Stack seçim kriterleri

| Kriter | Native | Flutter | React Native | Kotlin Multiplatform |
|---|---|---|---|---|
| Platform doğallığı | En yüksek potansiyel | Güçlü, uyarlama gerekir | Güçlü, native sınırlar gerekir | UI seçimine bağlı |
| Tek ekip/verim | Daha düşük paylaşım | Yüksek | Yüksek | Domain paylaşımı yüksek |
| Yeni platform API’leri | En hızlı | Plugin/framework bekleyebilir | Bridge/library bekleyebilir | Native UI ile hızlı |
| Karmaşık kamera/AR | Genellikle avantajlı | Plugin kalitesi kritik | Native module kritik | Native katman gerekir |
| Tasarım birebirliği | Platform doğal | Pixel kontrollü | Karma | Native UI ise doğal |
| Kod paylaşımı | Düşük | Çok yüksek | Yüksek | Domain/data yüksek |
| 16 app portföyü | Daha fazla bakım | Ortak çekirdek avantajı | Ortak paket avantajı | Ortak domain avantajı |

Stack seçimi “tek kod tabanı” vaadine değil; ekip yetkinliği, ürün özellikleri, platform entegrasyonu ve uzun dönem bakım maliyetine göre yapılmalıdır.

## 56.2 SwiftUI

### Mimari yön

- View, domain logic ve side effect ayrılmalı.
- UI state açık ve test edilebilir olmalı.
- Environment yalnız gerçekten global bağımlılıklar için kullanılmalı.
- Navigation route modeli dokümante edilmeli.
- Async task cancellation view yaşam döngüsüne uygun olmalı.
- UIKit bridge yalnız gerekliyse ve lifecycle doğru yönetiliyorsa kullanılmalı.

### Token mapping örneği

```swift
struct AppSpacing {
    static let xs: CGFloat = 4
    static let sm: CGFloat = 8
    static let md: CGFloat = 16
    static let lg: CGFloat = 24
    static let xl: CGFloat = 32
}

enum AppSemanticColor {
    static let surface = Color("Surface")
    static let contentPrimary = Color("ContentPrimary")
    static let accent = Color("Accent")
    static let danger = Color("Danger")
}
```

Kod örneği yalnız yapı fikridir; gerçek değerler token kaynağından üretilebilir.

### SwiftUI premium kontrol listesi

- System font/Dynamic Type veya scalable custom font
- `accessibilityLabel`, value ve action’lar
- Fixed frame ile text clipping yok
- `safeAreaInset` ve toolbar davranışı doğru
- Sheet detent ve dismissal veri kaybına göre yönetiliyor
- Search platform pattern’ine uyuyor
- Task cancellation ve loading state doğru
- List identity stabil
- State değişimi gereksiz view reset yaratmıyor
- Reduce Motion kontrol ediliyor
- Snapshot ve accessibility audit testleri var

### Liquid Glass yaklaşımı

- Sistem navigation, toolbar, tab ve kontrol yüzeylerinin güncel davranışını önceliklendirin.
- İçerik kartlarının tamamına custom glass uygulamayın.
- Material arkasında kontrastı gerçek içerikle test edin.
- Eski özel blur/navigation implementasyonlarını güncel sistem API’leriyle karşılaştırın.
- Xcode/platform yükseltmesinde otomatik görünüm değişikliklerini screenshot testleriyle inceleyin.

## 56.3 Jetpack Compose

### Mimari yön

- UI state immutable ve açık olmalı.
- Events view model/domain’e tek yönlü akmalı.
- Side effect’ler composition içinde kontrolsüz çalışmamalı.
- Stable keys ve remember kullanımı bilinçli olmalı.
- Navigation ve back davranışı platformla uyumlu olmalı.
- Window size/posture state layout’a girdi olmalı.

### Token mapping örneği

```kotlin
object AppSpacing {
    val Xs = 4.dp
    val Sm = 8.dp
    val Md = 16.dp
    val Lg = 24.dp
    val Xl = 32.dp
}

@Immutable
data class AppSemanticColors(
    val surface: Color,
    val contentPrimary: Color,
    val accent: Color,
    val danger: Color,
)
```

### Compose premium kontrol listesi

- Material 3 component semantiği korunuyor
- Edge-to-edge ve insets doğru
- Predictive/system back doğru
- Dynamic color app profile’a göre
- Semantics ve TalkBack testi
- Font scaling’de clipping yok
- Lazy list keys stabil
- Unnecessary recomposition ölçülüyor
- Adaptive navigation ve pane strategy
- Fold/resize sonrası state korunuyor
- Baseline Profile / Macrobenchmark kritik akışlarda
- Screenshot tests light/dark/font/adaptive state’lerde

### Material 3 Expressive kullanımı

Expressive component, motion, typography ve shape dili ürün karakterine uyuyorsa kullanın. Her uygulamayı aynı yüksek ifade seviyesine zorlamayın. Finans veya profesyonel tool düşük expressive yoğunluk isterken sosyal/consumer ürün daha güçlü shape ve motion kullanabilir.

## 56.4 Flutter

### Mimari yön

- Theme extension ve semantic token sistemi kurun.
- Platform adaptasyonunu yalnız `Platform.isIOS` koşullarına yaymayın; adapter/theme/component katmanı kullanın.
- Navigation/back ve system bars platforma göre test edilmeli.
- Native plugin’lerin permission, lifecycle ve error state’leri sarılmalı.
- Rebuild alanı sınırlandırılmalı.
- Büyük listelerde doğru virtualization ve image cache kullanılmalı.

### Theme extension fikri

```dart
@immutable
class SemanticColors extends ThemeExtension<SemanticColors> {
  final Color contentPrimary;
  final Color surface;
  final Color accent;
  final Color danger;
  // copyWith / lerp ...
}
```

### Flutter riskleri

- iOS ve Android’de tamamen aynı kontrol davranışı
- Cupertino/Material karışımında tutarsızlık
- Her ekranın kendi `ThemeData` override’ı
- Sabit pixel ve text scale kapatma
- Plugin hatalarının generic exception’a düşmesi
- Platform view ile scroll/gesture conflict
- System navigation/back davranışının custom çözülmesi

## 56.5 React Native

### Mimari yön

- Design token paketi TypeScript ile typed olmalı.
- Platform-specific file veya adapter yalnız gerçek davranış farkında kullanılmalı.
- Native navigation ve gesture davranışı test edilmeli.
- Bridge/new architecture maliyeti olan modüller profil edilmeli.
- Accessibility props platforma göre doğrulanmalı.
- List virtualization ve image pipeline dikkatle ayarlanmalı.

### Typed token örneği

```ts
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export type SpacingToken = keyof typeof spacing;
```

### React Native riskleri

- Web benzeri UI davranışını mobile taşımak
- Platform back ve modal davranışını atlamak
- JS thread yüküyle animation/input gecikmesi
- Her component’te inline style/magic number
- Erişilebilirlik prop’larının yalnız bir platformda çalışması
- Native SDK lifecycle’ının eksik sarılması

## 56.6 Kotlin Multiplatform

Uygun paylaşım alanları:

- Domain logic
- Validation
- Networking
- Persistence abstraction
- Analytics grammar
- Subscription entitlement modelinin ortak kısmı
- UI state mapping

Platform UI ayrıysa iOS ve Android doğallığı korunur. Paylaşılan domain modeli, platformların farklı UI state gereksinimlerini engellememelidir.

## 56.7 Backend contract

Premium UI için backend de state’leri desteklemelidir:

- Stable error codes
- Retryability
- Idempotency
- Pagination cursor
- Partial result
- Updated-at/version
- Conflict information
- Entitlement state
- Permission/authorization reason
- Long-task job status
- User-safe error message değilse client mapping

Backend yalnız 500 döndürürse premium error UX üretmek sınırlıdır.

## 56.8 Design token code generation

On altı uygulama için tokenlar mümkünse kaynak dosyadan platform koduna üretilebilir:

```text
tokens.json
→ validation
→ iOS Swift assets/code
→ Android Compose theme/code
→ Flutter theme extension
→ React Native TypeScript
→ documentation table
```

Pipeline şunları kontrol etmelidir:

- Duplicate token
- Missing dark value
- Contrast risk
- Invalid naming
- Platform unsupported value
- Breaking rename
- Generated file drift

## 56.9 Component package sınırı

Ortak pakete alınabilecekler:

- AppButton
- AppTextField
- StateView
- Loading placeholders
- Semantic surfaces
- Badge/status
- Form validation presentation
- Common dialogs
- Paywall primitives — ürün metni hariç

Uygulamaya özel kalması gerekenler:

- Domain card’ları
- Ana ekran composition
- Marka hero alanı
- Özel creator/editor controls
- App-specific onboarding
- Ürün kararlarını içeren navigation

## 56.10 Stack migration kararı

Sırf premium görünüm için stack değiştirmeyin. Önce mevcut stack ile:

- Tokenlaştırma
- Component contract
- State model
- Accessibility
- Performance profiling
- Platform adapter

uygulanabilir mi değerlendirin. Stack migration ayrı ürün ve teknik yatırım kararıdır.

---

# 57. Kopyalanabilir dosya ve şablonlar

Bu bölümdeki şablonları her uygulamanın `/docs` klasörüne koyup doldurun. Boş bırakılan kritik alanlar Codex’in varsayım üretmesine neden olur.

## 57.1 `APP_PROFILE.md`

```markdown
# App Profile

## Identity
- App name:
- Bundle/package id:
- Platforms:
- Stack:
- Lifecycle stage:

## Product
- One-sentence value proposition:
- Core user:
- Core job:
- First-value moment:
- Repeat-use loop:
- Business model:

## Brand
- Three traits:
- Three avoid traits:
- Visual archetype:
- Content density:
- Voice:
- Imagery:

## Visual system
- Brand seed:
- Accent strategy:
- Surface strategy:
- Shape strategy:
- Typography strategy:
- Icon strategy:
- Motion personality:
- Glass/blur scope:
- Gradient scope:

## Platform behavior
### iOS
- Navigation:
- Search:
- Sheets:
- iPad:
- Liquid Glass scope:

### Android
- Navigation:
- Dynamic color:
- Edge-to-edge:
- Adaptive layout:
- Material expressive level:

## Trust
- Sensitive data:
- Required permissions:
- Account deletion:
- Subscription:
- UGC/moderation:
- AI data handling:

## Quality priorities
1.
2.
3.

## Explicit non-goals
- 
```

## 57.2 `DESIGN_SYSTEM.md`

```markdown
# Design System

## Source of truth
- Token path:
- Generated platform files:
- Current version:

## Foundations
### Spacing
### Grid
### Typography
### Color
### Shape
### Elevation/material
### Motion
### Iconography
### Imagery

## Semantic roles
[List all semantic tokens and intended meaning]

## Themes
- Light
- Dark
- High contrast
- App-specific variants

## Rules
- No raw visual values in feature code.
- No component variant without state/accessibility documentation.
- Platform-native behavior takes precedence over pixel identity.

## Exceptions
[Document owner, reason and expiry]
```

## 57.3 `COMPONENT_CONTRACTS.md`

```markdown
# Component Contracts

## Component index
| Component | Status | Platforms | Owner | Tests |
|---|---|---|---|---|

# [Component]
## Purpose
## Anatomy
## Variants
## States
## Content rules
## Layout rules
## Accessibility
## Motion/haptics
## iOS mapping
## Android mapping
## Analytics boundary
## Test matrix
## Examples
## Anti-patterns
```

## 57.4 `SCREEN_SPECS.md`

```markdown
# Screen Specs

# Screen: [Name]

## User intent
## Business goal
## Entry points
## Preconditions
## Primary action
## Secondary actions
## Content hierarchy
## Components
## Data dependencies
## UI state model
- Initial
- Loading
- Partial/cached
- Content
- Empty
- Offline
- Error
- Permission denied
- Auth/entitlement issue
## Navigation
## iOS behavior
## Android behavior
## Accessibility
## Localization/RTL
## Motion
## Analytics
## Performance budget
## Privacy/security
## Acceptance criteria
## Test cases
```

## 57.5 `ACCESSIBILITY.md`

```markdown
# Accessibility Standard

## Supported technologies
- VoiceOver
- TalkBack
- Dynamic Type / font scaling
- Reduce Motion
- Keyboard/pointer
- Switch/Voice Control where applicable

## Global acceptance criteria

## Component rules

## Screen-reader naming glossary

## Manual test devices/settings

## Automated audit commands

## Accessibility Nutrition Label evidence
| Feature | Supported | Test evidence | Last verified |

## Known limitations
[No blocker/critical limitation may ship]
```

## 57.6 `PERFORMANCE_BUDGET.md`

```markdown
# Performance Budget

## Representative devices

## Critical journeys
| Journey | Metric | Target | Tool/test |

## Startup

## Rendering/jank

## Network

## Images/media

## Memory

## Battery/background

## App size

## Benchmark commands

## Regression thresholds

## Production monitoring
```

## 57.7 `ANALYTICS_PLAN.md`

```markdown
# Analytics Plan

## North star
## Activation
## Retention
## Revenue
## Quality guardrails
## Trust guardrails

## Event grammar

## Common properties

## Event catalog
| Event | Trigger | Properties | Owner | Privacy class |

## Funnels

## Experiments

## Consent behavior

## QA procedure
```

## 57.8 `PRIVACY_AND_PERMISSIONS.md`

```markdown
# Privacy and Permissions

## Data inventory
| Data | Purpose | Storage | Sharing | Retention | Deletion |

## Third-party SDK inventory

## Permissions
| Permission | User benefit | Ask moment | Denied fallback |

## App Store privacy mapping

## Google Play Data Safety mapping

## AI data behavior

## Account deletion

## Data export

## Logging redaction

## Security-sensitive UI
```

## 57.9 `QA_MATRIX.md`

```markdown
# QA Matrix

## Supported OS/device classes

## Golden flows

## Screen state snapshots

## Accessibility tests

## Localization/RTL

## Network conditions

## Auth/account states

## Subscription states

## Upgrade/migration

## Background/deep links/notifications

## Performance smoke

## Store release tests
```

## 57.10 Design Decision Record

```markdown
# DDR-[NUMBER]: [Decision]

- Date:
- Status: proposed/accepted/deprecated
- Apps affected:
- Owner:

## Context

## Decision

## Alternatives considered

## User impact

## Platform impact

## Accessibility/performance/privacy impact

## Migration

## Rollback

## Review date
```

## 57.11 UI pull request şablonu

```markdown
## Goal

## User-visible change

## Screens / flows

## Before / after

## States covered
- [ ] Loading
- [ ] Content
- [ ] Empty
- [ ] Error
- [ ] Offline
- [ ] Permission/auth/entitlement

## Design system
- Token changes:
- Component changes:
- Documented exceptions:

## Platform behavior
- iOS:
- Android:

## Accessibility
- [ ] Screen reader
- [ ] Large text
- [ ] Contrast
- [ ] Reduce Motion
- [ ] Keyboard/pointer if applicable

## Performance

## Privacy / analytics / subscription impact

## Tests

## Rollout / rollback

## Known risks
```

## 57.12 Release checklist şablonu

```markdown
# Release [Version]

## Build
- [ ] Production configuration
- [ ] Signing
- [ ] Clean install
- [ ] Upgrade

## Critical flows
- [ ] First value
- [ ] Primary task
- [ ] Auth
- [ ] Purchase/restore
- [ ] Account deletion
- [ ] Offline/recovery

## Quality
- [ ] Crash/ANR
- [ ] Startup/performance
- [ ] Accessibility
- [ ] Localization/RTL
- [ ] Small/large screen

## Trust
- [ ] Privacy/Data Safety
- [ ] Permission copy
- [ ] SDK inventory
- [ ] Support/privacy URLs

## Store
- [ ] Screenshots
- [ ] Metadata
- [ ] IAP products
- [ ] Review account/notes
- [ ] Accessibility claims

## Operations
- [ ] Feature flags
- [ ] Monitoring
- [ ] Rollback
- [ ] Owner/on-call
```

## 57.13 `theme.yaml`

```yaml
schema_version: 1
app_id: ""
portfolio_core_version: ""

brand:
  traits: []
  avoid_traits: []
  visual_archetype: ""

color:
  brand_seed: ""
  accent_strategy: "single"
  dark_mode: true
  high_contrast: true
  android_dynamic_color: "opt_in"

shape:
  personality: "restrained"
  card_radius_token: "radius.md"
  control_radius_token: "radius.sm"

surface:
  style: "mostly_flat"
  glass_scope: "navigation_only"
  gradient_scope: "hero_only"

motion:
  personality: "calm_precise"
  intensity: "low"
  reduce_motion_fallback: true

content:
  voice: "direct_supportive"
  emoji: "none"
  max_cta_words: 4

platform:
  ios:
    use_system_navigation: true
    use_system_materials: true
  android:
    edge_to_edge: true
    adaptive_required: true
    material_expressive_level: "moderate"
```

## 57.14 Screen state model şablonu

```text
sealed/union UiState:
- Initial
- Loading(previousContent?)
- Content(data, freshness, syncStatus)
- Empty(reason)
- Error(kind, previousContent?, retryAction?)
- Offline(cache?, queuedActions)
- PermissionRequired(permission, fallback)
- AuthenticationRequired(returnRoute)
- EntitlementRequired(feature)
```

Tek stack’e göre syntax değişebilir; amaç state’leri tek `isLoading` ve `errorMessage` değişkenine sıkıştırmamaktır.

## 57.15 Portfolio app registry

```yaml
apps:
  - id: app_01
    repo: ""
    platforms: [ios, android]
    stack: ""
    lifecycle: production
    portfolio_core_version: ""
    premium_score: 0
    accessibility: red
    performance: red
    store_risk: medium
    next_milestone: ""
```

---

# 58. Portföy kalite kapıları ve puanlama

Puan, estetik yarışması değil; yayın riskini ve gelişim önceliğini görünür kılma aracıdır. Puan yüksek olsa bile zorunlu kalite kapılarından biri başarısızsa uygulama premium-ready kabul edilmez.

## 58.1 Önce zorunlu kapılar

Aşağıdaki maddelerden biri başarısızsa release durdurulmalıdır:

1. Ana kullanıcı görevi tamamlanamıyor.
2. Veri kaybı veya yanlış hesap verisi riski var.
3. Satın alma, entitlement veya restore bozuk.
4. Hesap silme gerekli olduğu halde çalışmıyor.
5. Screen reader ile ana görev tamamlanamıyor.
6. Büyük fontta kritik eylem kayboluyor.
7. Kritik crash/ANR veya startup sorunu var.
8. Privacy/Data Safety beyanı kodla uyuşmuyor.
9. İzin reddi uygulamayı gereksiz yere kilitliyor.
10. Upgrade/migration kullanıcı verisini bozuyor.
11. Store screenshot/claim gerçek app ile çelişiyor.
12. Kritik güvenlik açığı veya hassas veri log’u var.

## 58.2 200 puanlık portföy scorecard

| Alan | Puan |
|---|---:|
| Ürün değeri ve ilk değer | 20 |
| Bilgi mimarisi ve navigasyon | 15 |
| Görsel hiyerarşi ve marka | 15 |
| Design system / token tutarlılığı | 15 |
| Platform doğallığı | 15 |
| State completeness ve recovery | 15 |
| Erişilebilirlik | 20 |
| Performans ve stabilite | 20 |
| Trust, privacy ve security | 15 |
| Monetizasyon ve satın alma | 15 |
| Adaptive / büyük ekran | 10 |
| Content design ve localization | 10 |
| Analytics ve deney | 5 |
| Test ve release engineering | 10 |
| Store presentation | 5 |
| **Toplam** | **200** |

## 58.3 Puan açıklaması

### Ürün değeri — 20

- Değer önerisi net
- İlk değer hızlı
- Ana görev odaklı
- Tekrar kullanım döngüsü anlaşılır
- Gereksiz özellik baskısı yok

### Design system — 15

- Semantic token
- Component contracts
- Light/dark/high contrast
- Raw value kontrolü
- Versioning ve test

### State completeness — 15

- Loading
- Cached/partial
- Empty türleri
- Error taxonomy
- Offline
- Permission/auth/entitlement
- Retry/recovery

### Platform doğallığı — 15

- Navigation/back
- System components
- Search/sheets/dialogs
- Insets/safe area
- iPad/tablet/foldable
- Haptics/motion

## 58.4 Renk seviyeleri

```text
RED       0–99 veya zorunlu kapı başarısız
YELLOW    100–139
GREEN     140–169
PREMIUM   170–189
GOLD      190–200 ve bütün kapılar/test kanıtları geçerli
```

“Gold” görsel mükemmellik değil; ürün, teknik ve güven kalitesinin birlikte kanıtlanmasıdır.

## 58.5 Puan kanıt standardı

| İddia | Kabul edilen kanıt |
|---|---|
| Accessible | Manuel AT testi + otomatik audit |
| Fast | Ölçüm/benchmark/production metric |
| Platform native | HIG/Material review + gerçek cihaz |
| Complete states | State inventory + snapshots/tests |
| Secure/private | Data/SDK inventory + test/review |
| Purchase ready | Sandbox test + entitlement doğrulama |
| Adaptive | Window/device matrisi screenshot/test |

Kanıt yoksa en yüksek puan verilmemelidir.

## 58.6 Uygulama puan kartı

```markdown
# Premium Score — [App] [Version]

## Mandatory gates
| Gate | Pass/Fail | Evidence |

## Score
| Area | Score | Max | Evidence | Next action |

## Top 5 risks

## Top 5 improvements

## Shared-system opportunities

## Release recommendation
- Block
- Internal only
- Beta
- Production
- Premium-ready
```

## 58.7 Portföy karşılaştırmasında dikkat

- Production app ile prototype aynı veriyle kıyaslanmamalı.
- Kullanıcı sayısı yüksek app’te regression riski ağırlıklandırılmalı.
- Uygulama kategorisine göre adaptive, offline veya media kriteri ağırlığı değişebilir.
- Düşük puan otomatik olarak kötü ürün anlamına gelmez; erken aşama olabilir.
- Puanı yükseltmek için gereksiz özellik eklenmemeli.

## 58.8 Aylık kalite konseyi

Ayda bir:

- Core design system değişiklikleri
- Cross-app regressions
- Accessibility blocker’lar
- Performance trendleri
- Store policy değişiklikleri
- Subscription/support sorunları
- Deney öğrenimleri
- Deprecated component planı
- Apps to pause/merge/retire

karara bağlanmalıdır.

---

# 59. AI üretimi görünümü ele veren anti-pattern’ler

Codex ve diğer yapay zekâ araçları hızlı ve işlevsel UI üretebilir; ancak kısıt verilmezse aynı jenerik estetik kalıplar tekrar eder. Premiumlaştırmanın önemli bölümü bu işaretleri temizlemektir.

## 59.1 Görsel anti-pattern’ler

### Her şey kart

Belirti:

- Her başlık ayrı rounded rectangle
- Kart içinde kart
- Ayarlar bile dashboard kartı

Düzeltme:

- Gruplamayı spacing, typography ve divider ile çöz.
- Kartı yalnız bağımsız nesne için kullan.

### Her şey aşırı yuvarlak

Belirti:

- Küçük input, büyük sheet, tablo ve nav aynı 24–32 radius

Düzeltme:

- Sınırlı radius scale
- Kontrol ve container ölçüsüne uygun shape
- Platform sistem şekillerine saygı

### Mor/mavi gradient varsayılanı

Belirti:

- Ürünle ilgisiz neon gradient hero
- Gradient her CTA ve kartta

Düzeltme:

- Marka ve kullanıcı bağlamından renk seç
- Gradient’i tek rol ile sınırla veya kaldır

### Blanket glassmorphism

Belirti:

- İçerik listeleri, input, paywall ve settings dahil her yüzey blur

Düzeltme:

- Glass/material yalnız chrome/geçici yüzeyde
- İçerik için solid, okunabilir surface

### Rastgele gölge

Belirti:

- Her element farklı blur/elevation
- Dark mode’da kirli halo

Düzeltme:

- Depth token
- Border/ton farkını önce kullan
- Shadow yalnız gerçek katman ayrımı için

### Dev başlık + küçük gri metin + iki pill

Belirti:

- Her ekranda aynı landing-page kompozisyonu

Düzeltme:

- Screen görevine uygun bilgi mimarisi
- Platform navigation title ve content hierarchy

## 59.2 İçerik anti-pattern’leri

- “Welcome back, Alex!” ama gerçek personal context yok
- Sahte kullanıcı adı ve testimonial
- “Unlock your potential” gibi bağlamsız slogan
- “Something went wrong”
- “Submit”, “Proceed”, “Continue” her yerde
- Emoji ile durum anlatma
- Her başarıda aşırı kutlama
- Sahte “Most popular” etiketi
- Gerçek olmayan tasarruf yüzdesi
- Placeholder lorem veya generic stock copy

## 59.3 UX anti-pattern’leri

- Değeri göstermeden üç ekran onboarding
- İlk açılışta bütün izinleri istemek
- Dört farklı primary CTA
- Her özelliği ana ekrana koymak
- Back davranışını custom kapatmak
- Modal üstüne modal
- Swipe’ın tek erişim yolu olması
- Her ağ işleminde tüm ekranı spinner ile bloklamak
- Refresh sırasında mevcut içeriği silmek
- Empty state’te yalnız illustration göstermek
- Error sonrası form verisini temizlemek
- Purchase sonrası entitlement’ı yenilememek

## 59.4 Kod anti-pattern’leri

- Her dosyada `#FFFFFF`, `16`, `24`, `0.2` gibi magic value
- `isLoading: Bool` ile bütün async state’leri yönetmek
- UI içinde doğrudan network çağrısı
- Tasarım component’ine business logic gömmek
- Bir component’te onlarca boolean variant
- `isIOS ? ... : ...` koşulunu bütün kod tabanına yaymak
- Snapshot testini yeni output ile sorgusuz güncellemek
- Test hata verdiğinde testi silmek
- Hardcoded fiyat/para birimi
- Local `isPremium` flag
- Account state ile subscription state’i karıştırmak
- Accessibility’i yalnız label eklemek sanmak

## 59.5 Platform anti-pattern’leri

### iOS

- Android FAB’ını aynen kullanmak
- Sistem back yerine özel X/arrow karmaşası
- Tab bar içine eylem ve navigation’ı karıştırmak
- İçerik yüzeyine yoğun Liquid Glass
- Fixed height ile Dynamic Type kırmak
- Sheet drag dismissal’da veri kaybı

### Android

- iOS navigation ve sheet’i birebir kopyalamak
- System back/predictive back’i bozmak
- Edge-to-edge yapıp inset uygulamamak
- Dynamic color’ı marka anlamını bozacak şekilde zorunlu yapmak
- Tablet/foldable’da stretched phone UI
- Device modeline göre layout koşulu

## 59.6 “Dribbble screenshot” anti-pattern’i

- Gerçek veri yok
- Uzun metin yok
- Error yok
- Keyboard açık state yok
- Büyük font yok
- Safe area/inset yok
- Scroll davranışı belirsiz
- Görsel hiyerarşi sadece ideal örnekte çalışıyor
- Çok düşük kontrast
- Butonların gerçek label’ı sığmıyor

Premium uygulama ideal screenshot kadar kötü koşulda da kaliteli görünür.

## 59.7 Yapay zekâya anti-pattern önleme talimatı

```text
Do not default to generic AI-generated mobile styling. Specifically avoid:
- purple/blue gradients without brand rationale,
- excessive rounded cards and nested cards,
- blanket glassmorphism,
- arbitrary shadows,
- oversized marketing headings on functional screens,
- generic placeholder copy or fake testimonials,
- inconsistent icon families,
- one visual treatment for every state.

Derive hierarchy from the user's task, APP_PROFILE.md, platform conventions and
semantic tokens. Show real loading, empty, error, offline, long-text, dark-mode
and accessibility states before considering the screen complete.
```

## 59.8 Anti-pattern review soruları

- Bu karar ürün bağlamından mı, model varsayımından mı geldi?
- Aynı tasarım başka on uygulamaya da isim değiştirerek uyuyor mu?
- Efekti kaldırınca hiyerarşi çöküyor mu?
- Kartlar olmadan bilgi gruplanabilir mi?
- Metin gerçek veriyle test edildi mi?
- Sistem component’i neden kullanılmadı?
- En kötü state tasarlandı mı?
- Görsel karar performansı veya erişilebilirliği bozuyor mu?

---

# 60. Uygulama yol haritası ve nihai çalışma düzeni

Bu rehberin değeri okunmasında değil, repo ve release süreçlerine yerleştirilmesindedir.

## 60.1 İlk 7 gün — Portföyü görünür yap

- 16 uygulamayı registry’ye ekle.
- Stack, lifecycle, kullanıcı, gelir ve risk bilgilerini yaz.
- Her uygulama için 30–60 dakikalık hızlı audit yap.
- Zorunlu kalite kapısı ihlallerini belirle.
- İki pilot adayı seç.
- Ortak repo dosya standardını kararlaştır.

Çıktı:

```text
portfolio-registry.yaml
portfolio-scoreboard.md
pilot-decision.md
```

## 60.2 Gün 8–21 — Portfolio core

- Foundation tokenları
- Semantic themes
- Component contract formatı
- AGENTS.md standardı
- Accessibility standardı
- Performance budget standardı
- QA matrix
- Analytics grammar
- Release checklist

Bu aşamada dev component library yazmak yerine sözleşme ve en çok kullanılan 5–8 component ile başlayın.

## 60.3 Gün 22–45 — Pilot A

- APP_PROFILE
- Premium audit
- Bir golden flow
- Token migration
- Component migration
- Accessibility
- Performance ölçümü
- Snapshot/E2E
- Beta release
- Kullanıcı/metric değerlendirmesi

Pilot A’nın amacı yalnız güzel olmak değil, ortak sistemi kıracak gerçek ihtiyaçları bulmaktır.

## 60.4 Gün 46–70 — Pilot B

Farklı ürün türünde ikinci pilot:

- Ortak sistemin genellenebilirliğini test et
- İlk pilotta app-specific kalanları ayır
- Platform adapter’larını güçlendir
- Codex skills ve promptları doğrula
- Release pipeline’ı standartlaştır

## 60.5 Gün 71–120 — İlk portföy dalgası

- En yüksek öncelikli 3–5 uygulama
- Her app için en fazla 1–2 kritik flow
- Shared component versioning
- Feature flag ve staged rollout
- Scorecard before/after
- Store asset refresh

## 60.6 Sonraki dalgalar

Her dalga sonunda:

1. Hangi pattern gerçekten ortak?
2. Hangi component fazla soyutlandı?
3. Codex nerede tekrar hata yaptı?
4. Hangi test regression yakaladı?
5. Hangi uygulama yatırım hak etmiyor?
6. Hangi store/policy riski ortaya çıktı?
7. Kullanıcı metriği iyileşti mi?

sorularını yanıtlayın.

## 60.7 Haftalık çalışma ritmi

### Pazartesi

- Öncelik ve acceptance criteria
- İlgili docs güncelleme
- Codex task decomposition

### Salı–Çarşamba

- Uygulama
- Component/state testleri
- Gerçek cihaz kontrolü

### Perşembe

- Independent review
- Accessibility/performance
- Snapshot ve golden flow

### Cuma

- Beta/release değerlendirme
- Portföy öğrenimi
- Design system changelog

## 60.8 Her feature için mini süreç

```text
Problem
→ Screen/flow contract
→ State inventory
→ Platform mapping
→ Implementation
→ Accessibility
→ Performance
→ Tests
→ Analytics
→ Release evidence
```

## 60.9 Codex’e görev verme kontrolü

Prompt göndermeden önce:

- Doğru repo mu?
- AGENTS.md güncel mi?
- APP_PROFILE var mı?
- Screen spec var mı?
- Acceptance criteria ölçülebilir mi?
- State listesi var mı?
- Platform farkı açık mı?
- Test komutu biliniyor mu?
- Kapsam sınırı var mı?
- Hassas alan etkisi belirtilmiş mi?

## 60.10 Codex çıktı kabulü

Codex kod ürettiğinde yalnız diff’e bakmayın:

- Uygulamayı çalıştır
- Gerçek state’leri tetikle
- Küçük ekran ve büyük font
- Light/dark
- iOS/Android doğal davranış
- Screen reader
- Ağ kesintisi
- App kill/restore
- Purchase sandbox gerekiyorsa
- Screenshot diff
- Test raporu

## 60.11 Ortak sistemin bakım kuralı

Bir uygulama için core’a özellik eklemeden önce:

- En az iki app ihtiyacı var mı?
- Domain bağımsız mı?
- API sade mi?
- Platform farkı tanımlı mı?
- State/accessibility/test var mı?
- Versiyon ve migration planı var mı?

Yalnız tek app ihtiyacıysa app layer’da başlatın. İkinci gerçek kullanım geldiğinde genelleyin.

## 60.12 Başarı tanımı

Portföy dönüşümü başarılıdır, eğer:

- Kullanıcılar ana görevi daha hızlı ve daha az hata ile tamamlıyorsa
- Uygulamalar platformlarında doğal hissediyorsa
- Accessibility blocker kalmadıysa
- Crash/ANR/startup gerilemiyorsa
- Purchase ve account lifecycle güvenilirse
- Codex aynı kalite sözleşmesini tekrar uygulayabiliyorsa
- UI değişiklikleri test ve kanıtla yayınlanıyorsa
- Ortak sistem uygulamaları klonlaştırmadan bakım maliyetini düşürüyorsa
- Düşük değerli uygulamalar için net yatırım kararları alınabiliyorsa

## 60.13 İlk uygulanacak kesin sıra

On altı uygulama için önerilen kesin başlangıç:

```text
1. Tüm repolara kısa AGENTS.md
2. Tüm uygulamalar için APP_PROFILE
3. Premium audit ve zorunlu kapılar
4. Portföy semantic token standardı
5. Button / field / state-view / navigation contracts
6. İki pilot uygulama
7. Golden flow tests
8. Accessibility ve performance gates
9. Purchase/account/offline güvenliği
10. Dalgalar halinde diğer uygulamalar
11. Store sayfalarının yenilenmesi
12. Aylık portföy kalite konseyi
```

---

# Nihai sonuç

Premium mobil tasarım şu dört katmanın birlikte çalışmasıdır:

```text
DOĞRU ÜRÜN
Kullanıcıya hızlı ve gerçek değer

DOĞRU DENEYİM
Net akış, güven, erişilebilirlik ve recovery

DOĞRU PLATFORM
iOS ve Android’in doğal davranışları, adaptive yüzeyler

DOĞRU ÜRETİM SİSTEMİ
Tokenlar, component contracts, Codex talimatları, testler ve ölçüm
```

On altı uygulamalık portföyde hedef, on altı “güzel screenshot” değildir. Hedef; aynı yüksek kalite standardını farklı ürün kimliklerinde, gerçek veride, yavaş ağda, büyük yazıda, izin reddinde, ödeme hatasında, offline durumda ve platform değişimlerinde koruyabilen bir üretim sistemidir.

Her ekran için son soru:

> Kullanıcı bu ekranı yalnız ideal demo verisinde değil; gerçek hayatın en zor koşullarında da güvenle anlayıp tamamlayabiliyor mu?

Her repo için son soru:

> Codex bu kod tabanında bir sonraki değişikliği yaptığında, premium kaliteyi tahmin etmeye mi çalışacak, yoksa açık sözleşmeler ve çalışan testlerle doğrulayacak mı?

İkinci sorunun cevabı “doğrulayacak” olduğunda bu rehber gerçek amacına ulaşmış olur.
