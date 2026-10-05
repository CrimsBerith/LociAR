# Fiziksel AR saha testi ve kabul matrisi

Güncel aday: **henüz fiziksel cihazda doğrulanmadı**.
[Yayın planı](docs/release/RELEASE_READINESS.md) ve [push/silme matrisi](docs/QA_MATRIX.md) birlikte kullanılır.
Simulator, test fixture'ı veya betik birim testi fiziksel AR kanıtı değildir.

Yeniden bulma sırası: **Cloud Anchor → Geospatial (VPS) → World Map → yönlendirmeli gösterim**.
Geospatial/World Map kabulünde ilgili fallback gerçekten seçilmelidir; önceki Cloud Anchor başarısı bunu kanıtlamaz.

## Cihazlar ve koşular

Bir LiDAR'lı ve bir LiDAR'sız fiziksel iPhone gerekir. Her biri için model, tam iOS sürümü,
uygulama sürümü/build numarası ve aday commit SHA kaydedilir. UDID'yi bu belgeye yazmayın.
S1–S12 her iki cihazda, S8 yalnız LiDAR'sız cihazda çalışır: toplam **23 koşu**.

| ID | Senaryo | Kabul |
|---|---|---|
| S1 | Dokulu iç mekân duvarı; diğer cihazda oluşturulan pini aç | Gerçek cihazlar arası Cloud Anchor resolve |
| S2 | En az 24 saat sonra farklı ışıkta tekrar aç | Pin/resolve zamanları, ışık değişimi, Cloud Anchor |
| S3 | VPS olan dış mekân cadde; Cloud Anchor aşamasını kontrollü olarak başarısız kıl | Gerçek Geospatial fallback, VPS varlığı kaydı |
| S4 | VPS olmayan alan; Cloud Anchor aşamasını kontrollü olarak başarısız kıl | Gerçek World Map fallback, VPS yokluğu kaydı |
| S5 | Çevrimdışı / uçak modu / token yok | World Map veya açıkça yaklaşık yönlendirmeli gösterim; fiziksel kilit olarak etiketlenmez |
| S6 | Boş beyaz duvar, düşük doku | Açık rehberlik; düşük kaliteli/estimated sonuç fiziksel başarı diye sunulmaz |
| S7 | Düşük ışık | Rehberlik ve timeout/retry; siyah ekran veya sahte başarı yok |
| S8 | LiDAR'sız cihazda S1 ve S3 tekrarı | Feature-point tabanlı Cloud Anchor ve Geospatial; iki aşamayı notlarda/logda ayır |
| S9 | Arka plan/ön plan; uygulamayı kapat ve yeniden aç | Oturum/kamera düzelir, önceki hesabın içeriği görünmez |
| S10 | AR sekmesine 10 hızlı giriş/çıkış | Donma/siyah kamera yok; bellek büyümesi ölçülüp kaydedilir |
| S11 | Ayrılmış test postunu sil | Management API silme kuyruğu ve anchor temizliği gözlenir; yalnız test verisi |
| S12 | İlk açılış ve izin akışı | Keşfet izinsiz açılır; kamera/konum yalnız gerekli eylemde; Google sensor-data onayı korunur |

S1–S4 için kilit süresi **<15 saniye**, ölçülmüş drift **<10 cm**. Saat damgalı video ile ölçüm yöntemi
not edilir. S2'nin 24 saat beklemesi kısaltılamaz. Fiziksel sonuçlar ve yaklaşık sonuçlar ayrı kaydedilir.
İzin reddi/Ayarlar dönüşü, VoiceOver, RTL ve Dynamic Type için ek koşular ayrıca saklanır.

## Kanıt kaydı

Depo dışında yeni bir dizinde boş şablon oluşturun:

```sh
node scripts/qa-field-evidence.mjs --template /absolute/private/field-evidence.json
node scripts/qa-field-evidence.mjs /absolute/private/field-evidence.json
```

Şablon tüm koşuları `not_run` bırakır ve mevcut dosyanın üzerine yazmaz. Gerçek koşulardan sonra
`commit`, `app_version`, `build_number`, `devices` ve her `run` doldurulur. `resolver`:
`cloud_anchor`, `geospatial`, `world_map`, `aim_guided` veya rehberlik/hata koşusunda `none`.
Zamanlar ISO 8601; `lock_seconds`, `drift_cm`, ışık/VPS/offline/onay bilgisi ve gözlenen davranış açıkça yazılır.

Her koşu için kanıt dizinine göre relatif, boş olmayan **log ve video** yolları gerekir.
Doğrulayıcı eksik koşuyu, geçmeyen sonucu, yanlış resolver'ı, eksik ölçümü ve dışarı taşan dosya yolunu reddeder.
Dosyaların içeriğini veya fiziksel ölçümü otomatik doğrulamaz; QA log/video içeriğini inceler.
Auth tokenları, kullanıcı e-postaları ve hassas konumları public artifact'e/Git'e koymayın.

## Tarihsel kayıt — güncel adayın kanıtı değildir

Önceki belgede iPhone 14 Pro Max (`iPhone15,3`, yalnız `iOS 26.x` bilgisi) için
S1, S4–S7 ve S9–S12 geçildiği bildirilmişti; S2, S3 ve ikinci LiDAR'sız cihaz bekliyordu.
Bu iddialar bu oturumda tekrar çalıştırılmadı ve güncel build'e bağlı log/video ile doğrulanmadı.
Eski sürümün saha notları korunur; yeni adayın 23 koşusu için başarıya aktarılmaz.
