import Link from 'next/link';
import LegalLayout from '../legal-layout';
import { LEGAL_ENTITY as E } from '../legal-entity';

export const metadata = {
  title: 'LociAR Gizlilik Politikası ve KVKK Aydınlatma Metni',
  description: 'LociAR konum, kamera, hesap, bildirim, çökme raporu ve kullanıcı içeriği verilerini nasıl işler.',
};

export default function PrivacyPage() {
  return (
    <LegalLayout title="Gizlilik politikası ve KVKK aydınlatma metni" updated="11 Ekim 2026">
      <p>
        LociAR, gerçek yüzeylere bağlı kısa metin notları paylaşılan bir iOS uygulamasıdır.
        Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) m.10 kapsamında aydınlatma metni olarak da
        hazırlanmıştır. <Link href="/privacy/en">English version</Link>
      </p>

      <h2>Veri sorumlusu</h2>
      <p>
        {E.controllerName}, {E.controllerAddress}. İletişim: <a href={`mailto:${E.contactEmail}`}>{E.contactEmail}</a>
      </p>

      <h2>İşlenen veriler</h2>
      <ul>
        <li><strong>Kimlik ve iletişim:</strong> Apple ile Giriş kimliği veya e-posta adresi, kullanıcı adı, görünen ad, profil fotoğrafı.</li>
        <li><strong>Konum:</strong> uygulama açıkken, yakındaki içerikleri göstermek ve paylaştığınız içeriğin konumunu kaydetmek için
          (hassas konum; AR konumlandırma gerektiğinde iOS geçici hassas konum izni ister).</li>
        <li><strong>Kamera:</strong> yalnızca AR yerleşimi için kullanılır; kamera görüntüsü kaydedilmez. Gönderiler metin
          ve/veya GIPHY&apos;den seçilen bir GIF&apos;tir; fotoğraf, video veya bağlantı gönderisi yoktur. Bir içeriği sabitlediğinizde o yüzeyin AR harita dosyası
          (fotoğraf değil, nokta haritası) saklanabilir.</li>
        <li><strong>Profil fotoğrafı:</strong> kendi yüklediğiniz fotoğraf, yayınlanmadan önce otomatik güvenlik incelemesinden geçer
          (aşağıda &quot;Google Cloud Vision&quot;).</li>
        <li><strong>Kullanıcı içeriği:</strong> gönderi, açıklama, yorum, beğeni, kaydetme, koleksiyon, takip, engelleme ve raporlar.</li>
        <li><strong>Bildirim belirteci:</strong> bildirimlere izin verirseniz cihazınızın Apple Push / Firebase Cloud Messaging belirteci.</li>
        <li><strong>Çökme ve tanılama verileri:</strong> uygulama çöktüğünde cihaz modeli, iOS sürümü, uygulama sürümü, çökme anındaki
          kod izi ve rastgele bir kurulum kimliği (Firebase Crashlytics).</li>
        <li><strong>İşlem güvenliği:</strong> oturum belirteçleri, cihaz doğrulaması (Apple App Attest / Firebase App Check),
          hizmet sağlayıcının işlediği IP adresi ve kötüye kullanım kayıtları.</li>
      </ul>

      <h2>İsteğe bağlı yönetici veri paylaşımı</h2>
      <p>Profil → Ayarlar bölümündeki iki ayrı seçenek varsayılan olarak kapalıdır. Teknik paylaşımı açarsanız
        cihaz türü, iOS ve uygulama sürümü, dil, saat dilimi, rastgele kurulum kimliği, bağlantı IP adresi ve kullanım zamanları
        yetkili yöneticilere iletilir. Ayrı konum paylaşımını açarsanız uygulama ön plandayken son koordinatınız,
        doğruluk değeri ve ölçüm zamanı iletilir. Anonim postlar sunucuda hesabınızla ilişkilendirilebilir.
        Yöneticiye gösterilen bu konum kaydı arka planda güncellenmez; iOS konum izni ve post konumu bu seçenekten ayrıdır.</p>
      <p>Yöneticinin konum veya teknik veri erişimi özel yetki, MFA ve gerekçe gerektirir; erişimler denetim kaydına yazılır.
        Konum raporu 24 saat, son teknik rapor 30 gün sonra panelde erişilemez olur ve otomatik silme sırasına alınır.
        Kullanım olayları en fazla {E.analyticsRetentionDays} gün tutulur. İlgili seçeneği kapatmak son konum/teknik raporunu siler;
        çevrimdışıysanız silme bağlantı geri geldiğinde tamamlanır. Hesap silme bu kayıtları ve kullanım olaylarını da siler.</p>

      <h2>Amaçlar ve hukuki sebepler</h2>
      <ul>
        <li>Hesap açma, giriş, içerik yayınlama ve gösterme — sözleşmenin kurulması ve ifası (KVKK m.5/2-c).</li>
        <li>Sosyal bildirimler, konum notları, marka indirimleri ve yönetici mesajları — Profil → Ayarlar → Bildirimler üzerinden birlikte onayınıza bağlıdır; ayrıca iOS bildirim izni gerekir.</li>
        <li>Moderasyon, korumalı bölge ve 18+ içerik engelleri, profil fotoğrafı incelemesi, spam ve kötüye kullanımın önlenmesi,
          güvenlik — meşru menfaat (m.5/2-f) ve hukuki yükümlülük (m.5/2-ç).</li>
        <li>Çökme raporlarıyla uygulamanın kararlılığını sağlamak — meşru menfaat (m.5/2-f); Profil → Ayarlar&apos;dan kapatılabilir.</li>
        <li>Yasal talepler ve uyuşmazlıklar — bir hakkın tesisi, kullanılması veya korunması (m.5/2-e).</li>
      </ul>
      <p>Veriler satılmaz ve başka şirketlerin uygulama veya siteleri arasında izleme yapılmaz. Bildirimler açıkken, gönüllü paylaştığınız son konum ve onaylı post performansı size uygun marka indirimlerini seçmek için kullanılabilir. Markalar kişisel konumunuza veya alıcı listesine erişemez.</p>

      <h2>Hizmet sağlayıcılar ve yurt dışına aktarım</h2>
      <p>
        Altyapı hizmetini Google Firebase (Google Cloud) sağlar; veriler Google&apos;ın <strong>ABD</strong>&apos;deki veri merkezlerinde
        saklanır. Bu aktarım, KVKK m.9 kapsamında hizmet sağlayıcının veri işleme koşulları ve uygun güvenceler çerçevesinde
        yapılır. Kullandığımız Google hizmetleri:
      </p>
      <ul>
        <li><strong>Firebase Authentication, Cloud Firestore, Cloud Storage, Cloud Functions, App Check:</strong> hesap, içerik ve güvenlik.</li>
        <li><strong>Firebase Cloud Messaging:</strong> bildirimlerin iletilmesi (Apple Push Notification service üzerinden).</li>
        <li><strong>Firebase Crashlytics:</strong> çökme raporları; {E.crashRetentionDays} gün saklanır.</li>
        <li><strong>Google Cloud Vision:</strong> profil fotoğraflarının çıplaklık, şiddet ve benzeri içerik açısından otomatik incelenmesi.
          Fotoğraf yalnızca bu inceleme için gönderilir; reddedilen fotoğraflar silinir.</li>
        <li><strong>Google ARCore:</strong> AR konumlandırma (aşağıda).</li>
        <li><strong>GIPHY:</strong> GIF arama ve GIF gösterimi (aşağıda).</li>
      </ul>
      <p>
        Herkese açık gönderiler diğer kullanıcılara görünür; anonim gönderilerde yazarın adı ve profili gizlenir. Yetkili kurumların hukuka uygun talepleri
        halinde veriler paylaşılabilir.
      </p>

      <h2>Google ARCore (AR konumlandırma)</h2>
      <p>
        Postların bırakıldıkları yüzeyde ve konumda doğru görünmesi için Google ARCore&apos;un Cloud Anchors ve Geospatial
        hizmetlerini kullanırız. Bu oturumları çalıştırmak için Google, sensör verilerini (ör. kamera ve konum) işler:
        kamera görüntüsünden çıkarılan görsel özellikler ve yaklaşık konum Google&apos;a gönderilir; fotoğraf veya video
        saklamayız. Bir post için oluşturulan Cloud Anchor en fazla 365 gün tutulur ve post ya da hesap silindiğinde
        silinir. Ayrıntılar:{' '}
        <a href="https://support.google.com/ar?p=how-google-play-services-for-ar-handles-your-data">Google AR ve verileriniz</a>,{' '}
        <a href="https://policies.google.com/privacy">Google Gizlilik Politikası</a>.
      </p>

      <h2>GIPHY (GIF&apos;ler)</h2>
      <p>
        GIF&apos;ler GIPHY, Inc. tarafından sağlanır. Bir GIF aradığınızda arama kelimeleri ve uygulama diliniz, hesap
        bilgileriniz olmadan sunucularımız üzerinden GIPHY&apos;ye gönderilir. GIF görüntüleri ve videoları cihazınız tarafından
        doğrudan GIPHY sunucularından yüklenir; bu nedenle GIPHY IP adresinizi ve standart cihaz bilgilerini alır. Bir post
        yalnızca seçtiğiniz GIF&apos;in GIPHY kimliğini saklar. Ayrıntılar: <a href="https://giphy.com/privacy">GIPHY Gizlilik Politikası</a>.
      </p>

      <h2>Bildirimler ve konum hatırlatmaları</h2>
      <p>Profil → Ayarlar&apos;daki varsayılanı kapalı tek Bildirimler seçeneği beğeni, yorum, takip, konum notları,
        marka indirimleri ve yönetici mesajlarını kapsar. Açmadan önce bu kapsam açıklanır. Yönetici konum paylaşımı
        ve teknik paylaşım ayrı kalır. Ayrıca iOS bildirim izni gerekir; onaylanan metin kilit ekranında görünebilir.
        Bildirimleri kapatınca bu cihazda alan izleme, belirteç kaydı ve yeni bildirim kabulü durur.
        Önceki uygulama içi aktiviteler kalabilir.</p>
      <p>Teklifler metin, indirim koşulları ve geçerlilik süresi içerir ve sponsorlu olarak işaretlenir.
        Hedefli teklifleri yalnız seçilen alıcılar görebilir. Gönüllü paylaştığınız son konum ve onaylı post performansı
        teklif seçiminde kullanılabilir; markalar kişisel konumunuzu veya alıcı listelerini göremez.
        Gönderim FCM kabulü olarak kaydedilir; cihazda teslim veya okunma garantisi değildir.
        Özel yönetici mesajları otomatik çevrilmez.</p>
      <p>Yakındaki hatırlatmalar için iOS en fazla 20 alanı izler: onaylı konum notu kümeleri (en fazla 15) ve teklif alanları.
        Liste uygulama açıkken ve arka planda yaklaşık 500 m hareket ettiğinizde, kaba bir konumla eşitlenir.
        Büyük GPS alanı hassas konum kontrolünü başlatır: konum notlarında bildirim gidene, alandan çıkana veya en fazla
        10 dakika; teklif varışlarında en fazla iki dakika. Not uzaktayken daha düşük hassasiyet kullanılır.
        Konum notu girişi 15–100 m yarıçaplı alanda, ölçüm belirsizliği alana değdiğinde (en fazla 20 m tolerans,
        35 m'den kötü ölçümler sayılmaz), yürüme hızında ve en az beş saniye arayla iki uyumlu ölçümle kabul edilir.
        Teklif varışları 2–5 metre çapta, belirsizlik tamamen alanın içindeyken kontrol edilir.
        Arka planda Her zaman konum izni ve Kesin Konum gerekir; iOS konum göstergesini gösterir. İnternet ve güncel sunucu onayı gerekir.
        Telefon GPS&apos;i genellikle 5–30 m sapar; kapıdan girişi garanti edemez ve ziyaret kaçabilir.
        Özellikle uygulama zorla kapatıldığında iOS uyandırmayı geciktirebilir veya engelleyebilir.</p>
      <p>Ön plandaki yakın not sorgusu ve giriş/çıkış ölçümleri geçicidir; yönetici konum kaydını güncellemez.
        Alandan çıkış kampanyası, gönüllü paylaştığınız başlangıç koordinatlarını en fazla 24 saat veya kampanya bitimine
        kadar özel olarak tutabilir. Alanın eviniz olduğu çıkarılmaz veya etiketlenmez. Onayı iptal etmek alanları hemen
        geçersiz kılar; hesap silme bunları kaldırır. Çıkış hatırlatması için telefon önce alanı alıp içinde olduğunu görmelidir.</p>
      <p>Bulunduğunuz noktaya anonim konum notu bırakabilirsiniz; yayınlanmadan önce incelenir. Not, telefonunuzun ölçtüğü
        konuma veya bu konumun en fazla 50 m yakınına elle koyduğunuz pine kaydedilir; ölçüm doğruluğu ve pinin kaydırıldığı
        mesafe de saklanır. Ziyaret doğrulanmaz. Yetkili yöneticiler not ve yazar bağlantısını özel panelde görür.
        Notlar beğeniye göre sıralanır. Bir not, yeterli beğeni alıp yönetici onayladıktan sonra bildirim olarak gidebilir;
        her kişiye her not en fazla bir kez gönderilir. Notlar kendiliğinden eskimez; yönetici bitiş tarihi koyabilir veya
        notu kaldırabilir. Kampanyaların ayrı, ortak günlük üç bildirim sınırı ve kullanıcı/kampanya başına tek hatırlatma sınırı vardır.</p>

      <h2>Saklama süreleri</h2>
      <p>Hedefli teklifler kampanya sonunda erişilemez olur ve otomatik silmeye alınır. Bildirim denemeleri ve kampanya
        görüntüleme kayıtları 30 gün tutulur. Bir konum notunun size gönderildiğini gösteren kayıt, aynı notun tekrar
        gönderilmemesi için hesabınız silinene kadar tutulur. Hesap silme bu kişisel kayıtları kaldırır. Not sahibinin hesabını silmek,
        diğer alıcıların aktivitesindeki saklanan not metnini de kaldırır.</p>
      <ul>
        <li>Hesap verileri ve içerikler: hesap silinene kadar.</li>
        <li>Hesap silindiğinde: profil, gönderiler, yorumlar, beğeniler, takipler, koleksiyonlar, bildirim belirteçleri, AR dosyaları,
          profil fotoğrafları ve giriş hesabı için kalıcı silme hemen başlar. Geçici hizmet hatalarında işlem arka planda yeniden denenerek tamamlanır. Yaptığınız raporlar kimliğinizden arındırılarak saklanır;
          silme işleminin kendisi (anonim kimlik ve silinen kayıt sayısı) güvenlik amacıyla kayıt altında tutulur.</li>
        <li>Kullanım ve güvenlik olayları (yaklaşık konum dahil): en fazla {E.analyticsRetentionDays} gün, sonra otomatik silinir.</li>
        <li>Çökme raporları: {E.crashRetentionDays} gün.</li>
      </ul>

      <h2>Haklarınız (KVKK m.11)</h2>
      <p>
        Verilerinizin işlenip işlenmediğini öğrenme, bilgi talep etme, amacına uygun kullanılıp kullanılmadığını öğrenme,
        aktarıldığı üçüncü kişileri bilme, düzeltilmesini, silinmesini veya yok edilmesini isteme, bu işlemlerin aktarılan
        kişilere bildirilmesini isteme, otomatik analiz sonucu aleyhinize bir sonuca itiraz etme ve zarara uğramanız halinde
        tazminat talep etme haklarına sahipsiniz. Başvurularınızı <a href={`mailto:${E.contactEmail}`}>{E.contactEmail}</a>{' '}
        adresine iletebilirsiniz; en geç 30 gün içinde ücretsiz yanıtlanır. Avrupa Ekonomik Alanı ve Birleşik Krallık&apos;taki
        kullanıcılar GDPR kapsamındaki erişim, düzeltme, silme, kısıtlama, taşınabilirlik ve itiraz haklarını da aynı adresten
        kullanabilir ve yerel veri koruma otoritesine şikâyette bulunabilir.
      </p>

      <h2>Kontroller</h2>
      <ul>
        <li>Hesabınızı Profil → Hesabı kalıcı olarak sil ile silebilirsiniz.</li>
        <li>Postları, yorumları ve kullanıcıları bildirebilir, kullanıcıları engelleyebilirsiniz.</li>
        <li>Kamera, konum ve bildirim izinlerini iOS Ayarlar&apos;dan geri alabilirsiniz.</li>
        <li>Çökme raporlarını Profil → Ayarlar → Çökme raporları ile kapatabilirsiniz.</li>
        <li>Destek: <Link href="/support">destek sayfası</Link>.</li>
      </ul>

      <h2>Çocuklar</h2>
      <p>LociAR çocuklara yönelik değildir; 13 yaşından küçüklerin hesap açmaması gerekir.</p>

      <h2>Değişiklikler</h2>
      <p>Bu metin güncellendiğinde yukarıdaki tarih değişir; önemli değişiklikler uygulama içinde duyurulur.</p>
    </LegalLayout>
  );
}
