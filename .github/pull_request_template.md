## Özet

<!-- Hangi sorunu çözüyor, davranış nasıl değişiyor? İlgili issue varsa bağlantı ekleyin. -->

## Nasıl test edildi

<!-- Çalıştırılan komutlar ve sonuçlar. Çalıştırılamayan kontrolleri gerekçesiyle belirtin. -->

## Ekran görüntüsü (UI değiştiyse)

<!-- Önce/sonra görüntülerini kişisel verilerden arındırarak ekleyin; uygulanmıyorsa belirtin. -->

## Güvenlik / veri etkisi

<!-- Yetki, kurallar, veri modeli, migration veya veri silme etkisi var mı? Gizli bilgi paylaşmayın. -->

## Kontrol listesi

- [ ] AGENTS.md güvenlik sözleşmesine uyuldu.
- [ ] Değişiklik için ilgili testler çalıştırıldı; sonuçları yukarıda yazıldı.
- [ ] CI ve SonarCloud kontrolleri yeşil (birleştirmeden önce).
- [ ] `python3 scripts/l10n/build_catalog.py --check` geçti.
- [ ] `node scripts/check-localization.mjs --release` geçti.
- [ ] `python3 scripts/store-metadata/build.py --check` geçti.
- [ ] Gizli bilgi ve kişisel veri eklenmedi.
