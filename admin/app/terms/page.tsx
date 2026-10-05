import Link from 'next/link';
import LegalLayout from '../legal-layout';
import { LEGAL_ENTITY as E } from '../legal-entity';

export const metadata = {
  title: 'LociAR Kullanım Koşulları',
  description: 'LociAR topluluk kuralları, kullanıcı içeriği, sıfır tolerans politikası ve hesap kuralları.',
};

const APPLE_EULA = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

export default function TermsPage() {
  return (
    <LegalLayout title="Kullanım koşulları ve topluluk kuralları" updated={E.updatedTr}>
      <p>
        Bu koşullar LociAR iOS uygulamasının kullanımını düzenler. Hizmeti sunan: {E.controllerName}, {E.controllerAddress}
        {' '}(<a href={`mailto:${E.contactEmail}`}>{E.contactEmail}</a>). Hesap açarak veya uygulamayı kullanarak bu koşulları
        ve <a href={APPLE_EULA}>Apple Standart Son Kullanıcı Lisans Sözleşmesi&apos;ni (EULA)</a> kabul edersiniz.
        {' '}<Link href="/terms/en">English version</Link>
      </p>

      <h2>Yaş sınırı</h2>
      <p>LociAR&apos;ı kullanmak için en az 13 yaşında olmalısınız. 18 yaşından küçükseniz veli veya vasinizin onayı gerekir.</p>

      <h2>Hesap</h2>
      <p>
        Yayınlamak için Apple ile Giriş veya doğrulanmış e-posta hesabı gerekir. Hesabınızın güvenliğinden siz sorumlusunuz.
        Hesabınızı Profil → Hesabı kalıcı olarak sil ile silebilirsiniz; silme geri alınamaz.
      </p>

      <h2>İçerik kuralları</h2>
      <ul>
        <li>Gönderiler kısa metin ve desteklenen sosyal medya bağlantılarıdır (Spotify, YouTube, Instagram, X, Facebook).</li>
        <li>18+ / cinsel içerik yasaktır ve sunucu tarafından reddedilir.</li>
        <li>Okul, hastane, ibadet yeri, resmi kurum ve benzeri korumalı bölgelerde içerik oluşturmak yasaktır.</li>
        <li>Taciz, zorbalık, nefret söylemi, tehdit, şiddete teşvik, yasa dışı içerik, izinsiz telifli içerik, spam ve sahte kimlik yasaktır.</li>
        <li>Başkasının özel mülküne izinsiz içerik yerleştirmeyin; kişilerin özel bilgilerini paylaşmayın.</li>
        <li>Araç kullanırken veya kendinizi ya da başkalarını tehlikeye atacak biçimde AR kullanmayın.</li>
      </ul>

      <h2>Sıfır tolerans: sakıncalı içerik ve kötüye kullanım</h2>
      <p>
        LociAR, sakıncalı içeriklere ve taciz eden ya da kötüye kullanan kullanıcılara karşı <strong>sıfır tolerans</strong> uygular.
      </p>
      <ul>
        <li>Postları, yorumları ve kullanıcıları uygulama içinden bildirebilir, kullanıcıları engelleyebilirsiniz. Engellediğiniz
          kullanıcının içeriği size gösterilmez.</li>
        <li>Yorumlar ve metinler otomatik filtreden geçer; yeni postlar yayından önce incelenir.</li>
        <li>Bildirilen içerikler en geç 24 saat içinde incelenir; kurallara aykırı içerik kaldırılır ve içeriği gönderen hesap
          askıya alınır veya kalıcı olarak kapatılır.</li>
      </ul>

      <h2>İçeriğinizin kullanımı</h2>
      <p>
        Paylaştığınız içeriğin hakları sizde kalır. İçeriği uygulamada göstermek, saklamak ve moderasyon amacıyla işlemek için
        bize dünya çapında, ücretsiz ve hesabınızı veya içeriği sildiğinizde sona eren bir kullanım izni verirsiniz.
      </p>

      <h2>AR ve üçüncü taraf hizmetler</h2>
      <p>
        AR konumlandırma Google ARCore ile çalışır; Google sensör verilerini kendi koşullarına göre işler (bkz.{' '}
        <Link href="/privacy">gizlilik politikası</Link>). Spotify, YouTube, Instagram, Facebook ve X bağlantıları ilgili
        platformların kurallarına tabidir; LociAR bu platformların içeriğini yeniden barındırmaz.
      </p>

      <h2>Sorumluluk</h2>
      <p>
        Hizmet &quot;olduğu gibi&quot; sunulur. AR konumları yaklaşık olabilir. Kullanıcı içeriklerinden içeriği paylaşan kişi
        sorumludur. Kanunun izin verdiği ölçüde dolaylı zararlardan sorumlu değiliz; tüketici olarak sahip olduğunuz yasal
        haklar saklıdır.
      </p>

      <h2>Uygulanacak hukuk</h2>
      <p>
        Bu koşullar Türkiye Cumhuriyeti hukukuna tabidir. Tüketici uyuşmazlıklarında Tüketici Hakem Heyetleri ve Tüketici
        Mahkemeleri yetkilidir; bulunduğunuz ülkenin zorunlu tüketici koruma hükümleri saklıdır.
      </p>

      <h2>Değişiklikler ve iletişim</h2>
      <p>
        Koşullar güncellendiğinde yukarıdaki tarih değişir; önemli değişiklikler uygulama içinde duyurulur. Sorularınız için:{' '}
        <a href={`mailto:${E.contactEmail}`}>{E.contactEmail}</a>.
      </p>
    </LegalLayout>
  );
}
