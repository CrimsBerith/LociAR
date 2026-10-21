# Yoğunluk testi zaman aşımı incelemesi — 16 Ekim 2026

**Güncel durum:** 16 Ekim ek denetiminde test izolasyonu düzeltildi. Konum notu paketi `functions/test/notes/place-notes.test.mjs` konumuna ayrıldı; `npm run test:notes` kendi temiz emülatörünü açıyor ve başlangıç koleksiyonlarının boşluğunu doğruluyor. CI ve release preflight bu paketi ayrıca zorunlu çalıştırıyor. 22/22 test geçti; yoğunluk üyeliği 610 ms'de gözlendi. 120 × 250 ms sınırı ve başarı beklentileri değişmedi; otomatik başarısız test tekrarı eklenmedi. Kanıt: `build/deep-audit-20261016/acceptance-final-tail.log`. Aşağıdaki kayıt önceki tanı deneyini korur.

## Sonuç

Aynı `active note counted` hatası kontrollü yük altında yeniden üretildi. Yerel Firestore/Functions emülatöründe biriken arka plan olayları, yeni notun yoğunluk tetikleyicisine ulaşmasını **36,501 saniye** geciktirdi. Test, 120 deneme × 250 ms bekleme sınırını tüketirken not `active`, okunan yoğunluk `0`, üyelik kaydı henüz yoktu. Tetikleyici çalışınca yaklaşık **20 ms** içinde tamamlandı; üyelik ve dört yoğunluk sayacı kendiliğinden oluştu. Kaynak nota veya sayaca elle onarım uygulanmadı.

Bu bulgu, testin ortak emülatörde önceki senaryolardan kalan işlerin tamamlanmasını varsaymasından doğan zamanlama kırılganlığını gösteriyor. Yayınlanan not ile onun asenkron yoğunluk izdüşümü farklı zamanlarda hazır oluyor.

## Ölçümler

| Koşu | Sonuç | Ölçüm |
| --- | --- | --- |
| Güncel tam Functions paketi | 184/184 geçti | Hedef testte üyelik/sayı 28,214 saniyede gözlendi; tetikleyiciye ulaşma 28,037 saniye. |
| Temiz emülatör, kontrol koşusu | 1/1 geçti | Üyelik/sayı 1,635 saniyede gözlendi; tetikleyiciye ulaşma 1,316 saniye. |
| 800 sentetik beğeniden sonra aynı test | 1/1 geçti | Üyelik/sayı 16,629 saniyede gözlendi. |
| 1.600 sentetik beğeniden sonra aynı test | Beklenen zaman aşımı yeniden üretildi | 30,739 saniyelik örnekte sayı 0, üyelik yok; test yaklaşık 31,947 saniyede başarısız oldu. |
| Aynı başarısız notun sonraki durumu | Kendiliğinden doğru duruma ulaştı | Üyelik notun kayıt zamanından 36,507 saniye sonra oluştu; durum `active`; precision 4, 5, 6, 7 sayaçlarının her biri 1. |

Yük koşusunun zaman çizelgesi (UTC):

1. `00:07:14.129`: not Firestore'a kaydedildi.
2. Testin son örneğinde üyelik hâlâ yoktu; `active note counted` başarısızlığı oluştu.
3. `00:07:50.630`: `onPostDensityWritten` olayı işlenmeye başladı — kayıt zamanından **36.501 ms** sonra.
4. Üyelik zaman damgası kayıt zamanından **36.507 ms** sonra; tetikleyicinin toplam çalışma süresi **20,099 ms**.

1.600 beğeni koşusundaki tek test başarısızlığı bilinçli negatif deneydir. Deney sürücüsü hem bu başarısızlığı hem sonraki doğru üyelik/sayacı doğrulayarak **exit 0** döndü. Bu sonuç önceki 1.057 başarılı kabul çalıştırmasına eklenmedi.

## İlk başarısız koşuyla bağlantı

Önceki `preflight.log` dosyasında 116. testin bitişi ile 117. testin başarısızlığı arasında **863 `onPostDensityWritten`, 862 `onPostWritten`, 394 `onProfileUpdated`, 201 `onLikeCreated`** başlangıcı var. Tek bir not beklenirken önceki senaryoların çok sayıda olayı hâlâ işleniyordu. Önceki lokasyon regresyonları yüzlerce not ve 201 beğeni oluşturuyor; test dosyaları seri çalışsa da arka plan tetikleyicileri dosyalar arasında bitmiş olmuyor.

İlk başarısız koşunun mesajında not kimliği ve üyelik örnekleri bulunmadığı için o tarihî notun tam teslim süresi geri çıkarılamıyor. Aynı beklentinin aynı eksik üyelik durumu ve gecikmiş tetikleyiciyle yeniden üretilmesi, ayrıca tam pakette 28 saniyelik gecikmenin doğrudan ölçülmesi, kuyruk gecikmesi açıklamasını destekliyor.

## Değişiklik ve kalan iş

- `functions/test/integration/place-notes.test.mjs` artık hedef notun kimliğini, geçen süreyi, okunan sayıyı ve üyeliğin oluşup oluşmadığını kaydediyor. Başarı beklentisi ve 120 × 250 ms sınırı değişmedi.
- Önceki kabulün 374 kaynak dosyasıyla hash karşılaştırmasında yalnızca bu test dosyası değişti. Uygulama ve üretim backend kodu değiştirilmedi.
- **Test izolasyonu henüz düzeltilmedi:** yoğun arka plan kuyruğunda aynı test yine zaman aşımına uğrayabilir. Kalıcı test düzenlemesi, asenkron kabul senaryolarını önceki toplu fixture yükünden ayırmalı; başarısızlığı otomatik tekrar veya daha uzun beklemeyle başarıya çevirmemeli.
- Canlı Firebase gecikmesi ölçülmedi; dağıtım yapılmadı. Bu inceleme gerçek APNs/FCM, fiziksel GPS veya canlı admin MFA kabulü değildir.

## Kanıtlar

Yerel, gitignored deney dosyaları: `build/density-investigation-20261016/`.

- `baseline.log`, `baseline-timed.jsonl`, `baseline-result.json`: tam 184 test ve zamanlı log.
- `baseline-density-events.json`: hedef notun kayıt/olay başlangıç zamanları.
- `cold.log`, `loaded.log`: aynı testin boş ve yüklü emülatör sonuçları.
- `controlled-result.json`, `controlled-density-events.json`: yeniden üretim, gecikme ve kendiliğinden tamamlanan sayaçların doğrulaması.
- `controlled-emulator.log`, `controlled-process.json`: olay payload zamanları ve deneyin başarılı çıkış durumu.
- `probe-800/`: ara yük deneyi; test geçti, başarılı testin kaldırdığı üyeliği bekleyen gözlemci erken durduruldu. Bu yarım deneyin sürücü çıkışı ürün hatası değildir ve kabul toplamına alınmadı.
- `source-delta.json`: önceki kabul kaynaklarıyla karşılaştırma.
- `reproduce.mjs`: yalnızca yerel `demo-lociar` ortamında kullanılan deney sürücüsü.
