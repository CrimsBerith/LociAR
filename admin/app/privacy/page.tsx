import Link from 'next/link';
import LegalLayout from '../legal-layout';
import { LEGAL_ENTITY as E } from '../legal-entity';

export const metadata = {
  title: 'LociAR Gizlilik Politikası ve KVKK Aydınlatma Metni',
  description: 'LociAR konum, kamera, hesap ve kullanıcı içeriği verilerini nasıl işler.',
};

export default function PrivacyPage() {
  return (
    <LegalLayout title="Gizlilik politikası ve KVKK aydınlatma metni" updated="28 Eylül 2026">
      <p>
        LociAR, gerçek yüzeylere bağlı kullanıcı içerikleri yayınlayan bir iOS uygulamasıdır. Bu metin,
        6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) m.10 kapsamında aydınlatma metni olarak da
        hazırlanmıştır. <Link href="/privacy/en">English version</Link>
      </p>

      <h2>Veri sorumlusu</h2>
      <p>
        {E.controllerName}, {E.controllerAddress}. İletişim: <a href={`mailto:${E.contactEmail}`}>{E.contactEmail}</a>
      </p>

      <h2>İşlenen veriler</h2>
      <ul>
        <li><strong>Kimlik ve iletişim:</strong> Apple ile Giriş kimliği veya e-posta adresi, kullanıcı adı, profil fotoğrafı.</li>
        <li><strong>Konum:</strong> uygulama açıkken, yakındaki içerikleri göstermek ve paylaştığınız içeriğin konumunu kaydetmek için.</li>
        <li><strong>Kamera ve medya:</strong> yalnızca AR yerleşimi için kullanılır (gönderiler metin ve sosyal medya bağlantısıdır; fotoğraf/video yüklenmez); kamera görüntüsü sürekli kaydedilmez.
          Bir içeriği sabitlediğinizde yalnızca o yüzeyin AR harita dosyası (fotoğraf değil, nokta haritası) saklanır; kamera görüntüsü kaydedilmez.</li>
        <li><strong>Kullanıcı içeriği:</strong> gönderi, açıklama, yorum, beğeni, kaydetme, takip, engelleme ve raporlar.</li>
        <li><strong>İşlem güvenliği:</strong> oturum belirteçleri, cihaz doğrulaması (Apple App Attest / Firebase App Check),
          hizmet sağlayıcının işlediği IP adresi ve kötüye kullanım kayıtları.</li>
      </ul>

      <h2>Amaçlar ve hukuki sebepler</h2>
      <ul>
        <li>Hesap açma, giriş, içerik yayınlama ve gösterme — sözleşmenin kurulması ve ifası (KVKK m.5/2-c).</li>
        <li>Moderasyon, korumalı bölge ve 18+ içerik engelleri, spam ve kötüye kullanımın önlenmesi, güvenlik — meşru menfaat (m.5/2-f)
          ve hukuki yükümlülük (m.5/2-ç).</li>
        <li>Yasal talepler ve uyuşmazlıklar — bir hakkın tesisi, kullanılması veya korunması (m.5/2-e).</li>
      </ul>
      <p>Veriler satılmaz, reklam amaçlı kullanılmaz ve uygulamalar arası izleme (tracking) yapılmaz.</p>

      <h2>Aktarım ve yurt dışı</h2>
      <p>
        Altyapı hizmetini Google Firebase (Google Cloud) sağlar; veriler Google&apos;ın <strong>ABD</strong>&apos;deki veri
        merkezlerinde saklanır. Bu aktarım, KVKK m.9 kapsamında hizmet sağlayıcının veri işleme koşulları ve uygun
        güvenceler çerçevesinde yapılır. Herkese açık gönderiler ve kullanıcı adları diğer kullanıcılara görünür.
        Yetkili kurumların hukuka uygun talepleri halinde veriler paylaşılabilir.
      </p>

      <h2>Saklama süreleri</h2>
      <ul>
        <li>Hesap verileri ve içerikler: hesap silinene kadar.</li>
        <li>Hesap silindiğinde: profil, gönderiler, yorumlar, beğeniler, takipler, koleksiyonlar, AR ve medya dosyaları ile
          giriş hesabı derhal kalıcı olarak silinir. Yaptığınız raporlar kimliğinizden arındırılarak saklanır;
          silme işleminin kendisi (anonim kimlik ve silinen kayıt sayısı) güvenlik amacıyla kayıt altında tutulur.</li>
        <li>Kullanım ve güvenlik olayları (yaklaşık konum dahil): en fazla {E.analyticsRetentionDays} gün, sonra otomatik silinir.</li>
      </ul>

      <h2>Haklarınız (KVKK m.11)</h2>
      <p>
        Verilerinizin işlenip işlenmediğini öğrenme, bilgi talep etme, amacına uygun kullanılıp kullanılmadığını öğrenme,
        aktarıldığı üçüncü kişileri bilme, düzeltilmesini, silinmesini veya yok edilmesini isteme, bu işlemlerin aktarılan
        kişilere bildirilmesini isteme, otomatik analiz sonucu aleyhinize bir sonuca itiraz etme ve zarara uğramanız halinde
        tazminat talep etme haklarına sahipsiniz. Başvurularınızı <a href={`mailto:${E.contactEmail}`}>{E.contactEmail}</a>{' '}
        adresine iletebilirsiniz; en geç 30 gün içinde ücretsiz yanıtlanır.
      </p>

      <h2>Kontroller</h2>
      <ul>
        <li>Hesabınızı Profil içinden kalıcı olarak silebilirsiniz.</li>
        <li>İçeriği bildirebilir ve kullanıcıları engelleyebilirsiniz.</li>
        <li>Kamera ve konum izinlerini iOS Ayarlar&apos;dan geri alabilirsiniz.</li>
        <li>Destek: <Link href="/support">destek sayfası</Link>.</li>
      </ul>

      <h2>Çocuklar</h2>
      <p>LociAR çocuklara yönelik değildir; 13 yaşından küçüklerin hesap açmaması gerekir.</p>

      <h2>Değişiklikler</h2>
      <p>Bu metin güncellendiğinde yukarıdaki tarih değişir; önemli değişiklikler uygulama içinde duyurulur.</p>
    </LegalLayout>
  );
}
