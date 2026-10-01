import LegalLayout from '../legal-layout';

export const metadata = {
  title: 'LociAR Kullanım Koşulları',
  description: 'LociAR topluluk kuralları, kullanıcı içeriği ve hesap kuralları.',
};

export default function TermsPage() {
  return (
    <LegalLayout title="Kullanım koşulları ve topluluk kuralları" updated="25 Ağustos 2026">
      <p>
        LociAR’ı kullanarak bu kuralları kabul edersiniz. Uygulama kullanıcı tarafından üretilen içerik
        barındırır; herkes kendi paylaşımından sorumludur.
      </p>
      <h2>Hesap</h2>
      <p>
        Yayınlamak için Apple ile Giriş veya doğrulanmış e-posta hesabı gerekir. Hesabınızı Profil’den silebilirsiniz.
        Silme işlemi geri alınamaz.
      </p>
      <h2>İçerik kuralları</h2>
      <ul>
        <li>18+ / cinsel içerik yasaktır ve sunucu tarafından reddedilir.</li>
        <li>Okul, hastane, ibadet yeri, resmi kurum ve benzeri korumalı bölgelerde oluşturma yasaktır.</li>
        <li>Taciz, nefret, tehdit, yasa dışı içerik, izinsiz telif ve sahte kimlik yasaktır.</li>
        <li>Başkasının özel mülküne izinsiz içerik yerleştirmeyin.</li>
        <li>Araç kullanırken veya güvenlik riski oluşturacak biçimde AR kullanmayın.</li>
      </ul>
      <h2>Moderasyon ve Sıfır Tolerans Politikası (Guideline 1.2)</h2>
      <p>
        LociAR, sakıncalı içeriklere (objectionable content) ve tacizkar/kötüye kullanım sergileyen kullanıcılara
        (abusive users) karşı <strong>kesinlikle sıfır tolerans</strong> uygular.
      </p>
      <ul>
        <li>Kullanıcılar uygunsuz postları, yorumları ve profilleri uygulama içinden anında şikayet edebilir (Report) ve engelleyebilir (Block).</li>
        <li>Şikayet edilen sakıncalı içerikler en geç 24 saat içinde incelenir ve kurallara aykırı olanlar sistemden kaldırılır.</li>
        <li>Topluluk kurallarını ihlal eden hesaplar askıya alınır veya kalıcı olarak silinir.</li>
        <li>LociAR kullanımı, Apple Standart Son Kullanıcı Lisans Sözleşmesi (EULA) ve bu kurallara tabidir.</li>
      </ul>
      <h2>Üçüncü taraf bağlantılar</h2>
      <p>
        Spotify, YouTube, Instagram, Facebook ve X bağlantıları ilgili platformların kurallarına tabidir.
        LociAR bu platformlardan video akışını çekmez veya yeniden barındırmaz.
      </p>
    </LegalLayout>
  );
}
