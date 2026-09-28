# LociAR Accessibility Acceptance

## Genel

- iOS 44 pt, Android 48 dp minimum touch target.
- Normal metin hedefi 4.5:1; büyük metin ve anlamlı UI sınırı 3:1.
- Kritik bilgi yalnız renkle gösterilmez.
- Dekoratif görseller erişilebilirlik ağacına eklenmez.
- Kamera, konum ve hata mesajları sonraki somut adımı söyler.

## Screen reader

- Harita, Keşfet, AR ve Oluştur ana görevleri VoiceOver/TalkBack ile tamamlanmalıdır.
- İkon butonların Türkçe label'ı olmalıdır.
- Selected chip/pin state'i duyurulmalıdır.
- AR status değişikliği polite live region olarak duyurulur; hata assertive olabilir.
- Gesture, görevin tek erişim yolu olamaz.

## Font scaling

Test seviyeleri: varsayılan, büyük, en büyük accessibility ve Android %200.

- Kritik metin clip olmaz.
- Buton label'ı kaybolmaz.
- Yatay aksiyon grubu gerekirse wrap/dikey olur.
- AR izin ve recovery CTA'ları ekran dışında kalmaz.

## Motion ve transparency

- Reduce Motion: onboarding scroll animasyonu kapanır; büyük dekoratif hareket azaltılır.
- Reduce Transparency: glass surface solid yüzeye döner.
- Haptik, görsel veya metinsel feedback'in yerini tutmaz.

## Fiziksel bağlam

- Açık hava/güneş ışığı altında kamera chrome kontrastı kontrol edilir.
- Yürürken AR güvenlik uyarısı en yüksek önceliğe çıkar.
- Tek elle kullanımda alt eylemler erişilebilir kalır.

## Manuel kabul kanıtı

Her release için cihaz/OS, font seviyesi, ekran okuyucu, sonuç ve ekran kaydı `QA_MATRIX.md` içinde kaydedilir.
