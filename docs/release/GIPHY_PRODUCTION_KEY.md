# GIPHY production anahtarı

Durum (17 Ekim 2026): `GIPHY_API_KEY` Secret Manager'da **beta** anahtarı. Beta anahtarı tüm uygulama için
saatte yaklaşık 100 çağrıyla sınırlıdır. Bu kotayı hem `searchGifs` hem de GIF içeren her `createPost`
harcar (sunucu GIF'i GIPHY'den yeniden okur). 17 Ekim'de `functions/src/giphy.ts` içine bellek içi önbellek
eklendi: aynı arama 30 dakika, trend listesi 10 dakika, kabul edilmiş bir GIF 6 saat yeniden sorulmaz.
Bu, testte ve küçük kullanımda yeter; lansman trafiğini karşılamaz. **Yayın kapısıdır.**

## Başvuru (hesap sahibi)

1. <https://developers.giphy.com/dashboard/> → LociAR uygulaması → **Upgrade to Production**.
2. İstenenler: GIF arama ekranının görüntüleri veya kısa video, uygulama adı/açıklaması, App Store veya
   TestFlight bağlantısı. Arama ekranında "Powered by GIPHY" atfı zaten var (`GifPickerView.swift`).
3. Başvuru metni önerisi:

   > LociAR is an iOS app where people leave short notes and AR messages at real places. A note can
   > include one GIF found through GIPHY search. Every search screen shows "Powered by GIPHY". We request
   > ratings up to PG-13, store only the GIPHY id and load media from media.giphy.com. All requests go
   > through our backend (the key is never in the app) with per-user limits and short-lived caching.

4. Onay gelince yeni anahtarı sohbete veya dosyaya yazmadan Secret Manager'a yeni sürüm olarak ekle:

   ```sh
   firebase functions:secrets:set GIPHY_API_KEY --project lociar-2f38c
   ```

   Ardından `searchGifs` ve `createPost` yeniden deploy edilmelidir (secret sürümü deploy anında bağlanır):
   `bash scripts/firebase-deploy.command`.

5. Kontrol: uygulamada GIF aramak ve GIF'li bir not yayınlamak; Cloud Logging'de `giphy_search_failed`
   ve `giphy_lookup_failed` kayıtları olmamalı.
