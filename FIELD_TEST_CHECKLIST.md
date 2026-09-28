# Fiziksel AR kabul matrisi

Her koşuda ekran kaydı ve uygulamanın diagnostic JSON'u saklanır. Gerçek başarı için `pinQuality` yalnız `planeGeometry` veya `estimatedPlane` olabilir; `freeSpaceApproximate` ayrı senaryodur.

## Cihazlar

- [ ] LiDAR Pro iPhone
- [ ] LiDAR olmayan iPhone

## Yüzeyler

- [ ] Dokulu duvar
- [ ] Boş duvar
- [ ] Masa
- [ ] Zemin
- [ ] Açılı yüzey
- [ ] Düşük ışık
- [ ] Yüzeysiz açık alan: normal Pin başarısız, ayrı approximate onayı başarılı

## Yaşam döngüsü ve restore

- [ ] Anchor çevresinde dolaşma
- [ ] Background/foreground kesintisi
- [ ] Uygulamayı kapatıp açma
- [ ] İkinci cihazda world-map relocalization
- [ ] Restore sırasında içerik tracking normal olana kadar gizli
- [ ] 20 saniye timeout ve tekrar tara/sıfırla seçenekleri
- [ ] AR ekranına 10 kez gir/çık sonrası kamera ve bellek sızıntısı yok

## Kanıt alanları

- [ ] `pinQuality`
- [ ] `hitSource`
- [ ] `surfaceAlignment`
- [ ] `trackingQuality`
- [ ] `anchorID`
- [ ] `worldMappingStatus`
- [ ] GPS/heading varsa geo pose
- [ ] Relocalization süresi
