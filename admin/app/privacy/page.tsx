import Link from 'next/link';
import LegalLayout from '../legal-layout';
import { LEGAL_ENTITY as E } from '../legal-entity';

export const metadata = {
  title: 'LociAR Gizlilik Politikası ve KVKK Aydınlatma Metni',
  description: 'LociAR konum, kamera, hesap, bildirim, çökme raporu ve kullanıcı içeriği verilerini nasıl işler.',
};

export default function PrivacyPage() {
  return (
    <LegalLayout title="Gizlilik politikası ve KVKK aydınlatma metni" updated={E.updatedTr}>
      <p>
        LociAR, gerçek yüzeylere bağlı kısa metin notları ve sosyal medya bağlantıları paylaşılan bir iOS uygulamasıdır.
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
        <li><strong>Kamera:</strong> yalnızca AR yerleşimi için kullanılır; kamera görüntüsü kaydedilmez. Gönderiler metin ve sosyal
          medya bağlantısıdır; fotoğraf veya video gönderisi yoktur. Bir içeriği sabitlediğinizde o yüzeyin AR harita dosyası
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

      <h2>Amaçlar ve hukuki sebepler</h2>
      <ul>
        <li>Hesap açma, giriş, içerik yayınlama ve gösterme — sözleşmenin kurulması ve ifası (KVKK m.5/2-c).</li>
        <li>Beğeni, yorum ve takip bildirimleri — izin verdiğiniz sürece sözleşmenin ifası; izni iOS Ayarlar&apos;dan geri alabilirsiniz.</li>
        <li>Moderasyon, korumalı bölge ve 18+ içerik engelleri, profil fotoğrafı incelemesi, spam ve kötüye kullanımın önlenmesi,
          güvenlik — meşru menfaat (m.5/2-f) ve hukuki yükümlülük (m.5/2-ç).</li>
        <li>Çökme raporlarıyla uygulamanın kararlılığını sağlamak — meşru menfaat (m.5/2-f); Profil → Ayarlar&apos;dan kapatılabilir.</li>
        <li>Yasal talepler ve uyuşmazlıklar — bir hakkın tesisi, kullanılması veya korunması (m.5/2-e).</li>
      </ul>
      <p>Veriler satılmaz, reklam amaçlı kullanılmaz ve uygulamalar arası izleme (tracking) yapılmaz.</p>

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
      </ul>
      <p>
        Herkese açık gönderiler ve kullanıcı adları diğer kullanıcılara görünür. Yetkili kurumların hukuka uygun talepleri
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

      <h2>Saklama süreleri</h2>
      <ul>
        <li>Hesap verileri ve içerikler: hesap silinene kadar.</li>
        <li>Hesap silindiğinde: profil, gönderiler, yorumlar, beğeniler, takipler, koleksiyonlar, bildirim belirteçleri, AR dosyaları,
          profil fotoğrafları ve giriş hesabı derhal kalıcı olarak silinir. Yaptığınız raporlar kimliğinizden arındırılarak saklanır;
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
