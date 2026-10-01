# LociAR — App Field / QA Checklist (Issue #18)

Mevcut Sekmeler: **AR (`camera.fill`) / Harita (`map.fill`) / Paylaş (`plus.circle.fill`) / Keşfet (`sparkles`) / Profil (`person.crop.circle`)** (`MainTabView.swift:19-44`)

---

## A. Safe Area & Dynamic Island / Status Bar
| # | Kontrol | Durum |
|---|--------|-------|
| A1 | AR sekmesi: Üst butonlar ve reticle göstergesi Dynamic Island / saatin altında kalmıyor | [x] Geçti |
| A2 | Harita sekmesi: Arama çubuğu ve katman butonları status bar altına taşmıyor | [x] Geçti |
| A3 | Paylaş sekmesi (Oluştur): Başlık, adım çipleri ve kılavuz başlık çubuğu altında ferah | [x] Geçti |
| A4 | Keşfet sekmesi: Kategori hapları ve arama kutusu safe area içinde | [x] Geçti |
| A5 | Profil sekmesi: Kullanıcı adı, avatar ve ayarlar butonu status bar ile çakışmıyor | [x] Geçti |
| A6 | Post detay / Koleksiyonlar: Geri butonu ve başlık safe area'ya uygun | [x] Geçti |

---

## B. Buton ve Dokunma Alanı (Touch Target) Çakışması
| # | Kontrol | Durum |
|---|--------|-------|
| B1 | Tab bar öğeleri: 5 sekme, hedef boyutları en az 44×44 pt, çift dokunma hatası yok | [x] Geçti |
| B2 | AR sekmesi: Merkez reticle ve "Yüzeye sabitle" butonu deklanşörle çakışmıyor | [x] Geçti |
| B3 | AR sekmesi: Beğeni / yorum / kaydet aksiyon çubuğu alt tab bar'a binmiyor | [x] Geçti |
| B4 | Harita sekmesi: Post kartı "AR'da Aç" butonu harita kontrolleriyle çakışmıyor | [x] Geçti |
| B5 | Durum hapı (Tracking / Cloud Anchor durumu) üst menüyü engellemiyor | [x] Geçti |
| B6 | Paylaş sekmesi: Metin / Link girişi klavye açıldığında "İleri / Yayınla" butonunu gizlemiyor | [x] Geçti |

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
| D2 | Keşfet filtreleri anlık olarak post listesini güncelliyor | [x] Geçti |
| D3 | Paylaş sekmesi: Sosyal medya linki (Spotify, YouTube vb.) yapıştırıldığında önizleme geliyor | [x] Geçti |
| D4 | AR yüzey tespiti 1-3 saniye içinde yüzey geometrisini kilitliyor | [x] Geçti |
| D5 | Google ARCore veri bildirimi ilk seferde çıkıyor ve onay sonrası kapanıyor | [x] Geçti |
| D6 | Yayınlanan post anında Firestore ve Cloud Anchor'a yazılıyor | [x] Geçti |
