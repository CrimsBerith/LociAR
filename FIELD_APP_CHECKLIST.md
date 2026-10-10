# LociAR — App Field / QA Checklist (Issue #18)

Mevcut Sekmeler: **AR (`viewfinder`) / Harita (`map.fill`) / Paylaş (`plus.circle.fill`) / Keşfet (`safari.fill`) / Profil (`person.crop.circle.fill`)** (`MainTabView.swift`)

> 5 Ekim 2026: Açıklaması değişen veya yeni eklenen maddeler `[ ] Tekrar test` olarak işaretlendi (gerçek UI etiketleri, push, Crashlytics, 12 dil, kill switch). Fiziksel iPhone'da yeniden doğrulanmalı.

---

## A. Safe Area & Dynamic Island / Status Bar
| # | Kontrol | Durum |
|---|--------|-------|
| A1 | AR sekmesi: Üst butonlar ve reticle göstergesi Dynamic Island / saatin altında kalmıyor | [x] Geçti |
| A2 | Harita sekmesi: Arama çubuğu ve katman butonları status bar altına taşmıyor | [x] Geçti |
| A3 | Paylaş sekmesi (Oluştur): Başlık, adım çipleri ve kılavuz başlık çubuğu altında ferah | [x] Geçti |
| A4 | Keşfet sekmesi: Arama kutusu ve liste safe area içinde | [ ] Tekrar test |
| A5 | Profil sekmesi: Kullanıcı adı, avatar ve ayarlar butonu status bar ile çakışmıyor | [x] Geçti |
| A6 | Post detay / Koleksiyonlar: Geri butonu ve başlık safe area'ya uygun | [x] Geçti |

---

## B. Buton ve Dokunma Alanı (Touch Target) Çakışması
| # | Kontrol | Durum |
|---|--------|-------|
| B1 | Tab bar öğeleri: 5 sekme, hedef boyutları en az 44×44 pt, çift dokunma hatası yok | [x] Geçti |
| B2 | AR / Paylaş sekmesi: "Yüzeye sabitle" ve "Önüme yerleştir · 0,8 m" butonları tab bar ile çakışmıyor | [ ] Tekrar test |
| B3 | Post detayı: Beğen / Kaydet / Yorumlar aksiyonları alt tab bar'a binmiyor | [ ] Tekrar test |
| B4 | Harita sekmesi: Post kartı "AR'da Aç" butonu harita kontrolleriyle çakışmıyor | [x] Geçti |
| B5 | Durum hapı (Tracking / Cloud Anchor durumu) üst menüyü engellemiyor | [x] Geçti |
| B6 | Paylaş sekmesi: Metin / link girişi klavye açıldığında "Yüzeyde yayınla" butonunu gizlemiyor | [ ] Tekrar test |

---

## C. Çökme ve Kararlılık (Crash & Stability)
| # | Kontrol | Durum |
|---|--------|-------|
| C1 | Soğuk açılış: Sekmeler arası hızlı geçişlerde çökme yok | [x] Geçti |
| C2 | Paylaş sekmesinden AR'a geçiş ve geri dönüş sorunsuz | [x] Geçti |
| C3 | GPS kapalı / yaklaşık konum seçildiğinde beyaz ekran vermeden bildirim çubuğu açılıyor | [x] Geçti |
| C4 | Kamera izni reddedildiğinde yumuşak izin yönlendirme banner'ı çıkıyor, donmuyor | [x] Geçti |
| C5 | Profilde uzun içerik kaydırmasında bellek sızıntısı yok | [x] Geçti |
| C6 | 10 kez art arda sekme değiştirme (Rapid tab switch) stabil | [x] Geçti |

---

## D. Temel Akışlar (Happy Path)
| # | Kontrol | Durum |
|---|--------|-------|
| D1 | Harita sekmesinde yakındaki postlar pin olarak yükleniyor / boş durum gösteriliyor | [x] Geçti |
| D2 | Keşfet araması post listesini anlık güncelliyor | [ ] Tekrar test |
| D3 | Paylaş sekmesi: bağlantı ve çizim seçeneği yok; metin ve/veya 1 GIF (GIPHY araması, "Powered by GIPHY") paylaşılabiliyor; AR'da mesaj balonu ve oynayan GIF görünüyor | [ ] Tekrar test |
| D4 | AR yüzey tespiti 1-3 saniye içinde yüzey geometrisini kilitliyor | [x] Geçti |
| D5 | Google ARCore veri bildirimi ilk seferde çıkıyor ve onay sonrası kapanıyor | [x] Geçti |
| D6 | Paylaş sekmesinde "İçerik ekle": önce Cloud Anchor host edilir ("Yüzey Google AR'a kaydediliyor…"), olmazsa dünya haritası; post `createPost` ile `pending_review` olarak yazılır, çevrimdışıysa sıraya alınır | [ ] Tekrar test |
| D7 | Giriş ekranı: gizlilik/topluluk kuralları onay kutusu işaretlenmeden e-posta ve Apple girişi kapalı | [ ] Tekrar test |
| D8 | İlk yayından sonra bildirim izni soruluyor; başka hesaptan beğeni/yorum/takip push olarak geliyor ve dokununca post açılıyor | [ ] Tekrar test |
| D9 | Profil → Ayarlar: bildirim durumu doğru, "Çökme raporları" anahtarı kapanıp açılıyor | [ ] Tekrar test |
| D10 | Admin → System → kill switch açıkken yayın "LociAR geçici olarak durduruldu" diyor, post sırada bekliyor; kapatınca yayınlanıyor | [ ] Tekrar test |
| D11 | Hesap silme: Apple hesabında Apple ile yeniden giriş, e-posta hesabında şifre soruluyor; sonra hesap tamamen siliniyor | [ ] Tekrar test |
| D12 | Cihaz dili İngilizce (ve en az bir başka dil, ör. Arapça sağdan-sola) iken tüm sekmeler, uyarılar ve izin metinleri o dilde | [ ] Tekrar test |
| D13 | Post AR'da açılırken 8 sn sonra "Yaklaşık göster" çıkıyor ve yaklaşık görünümü açıyor; kapatınca kamera tekrar açılmıyor | [ ] Tekrar test |
