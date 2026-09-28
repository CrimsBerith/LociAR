import LegalLayout from '../legal-layout';

export const metadata = {
  title: 'LociAR Destek',
  description: 'LociAR hesap silme, bildirim, engelleme ve gizlilik yardımı.',
};

export default function SupportPage() {
  return (
    <LegalLayout title="Destek" updated="25 Ağustos 2026">
      <p>
        LociAR destek kanalları uygulama içindedir. App Store incelemesi ve kullanıcılar bu sayfadan temel
        işlemlere ulaşabilir.
      </p>
      <h2>Hesabı sil</h2>
      <p>iOS uygulamasında Profil → Hesabı kalıcı olarak sil. Bu işlem geri alınamaz.</p>
      <h2>İçerik bildir</h2>
      <p>Bir postu açın ve Bildir’e dokunun. Bildirimler inceleme kuyruğuna düşer.</p>
      <h2>Kullanıcı engelle</h2>
      <p>Bir kullanıcının profilinde Kullanıcıyı engelle’ye dokunun. Engellenen hesaplar Profil’den yönetilir.</p>
      <h2>İzinler</h2>
      <p>
        Kamera, konum ve fotoğraf erişimini iOS Ayarları → LociAR yolundan kapatabilirsiniz. İlgili özellikler
        izin olmadan çalışmaz.
      </p>
      <h2>İletişim ve destek</h2>
      <p>
        Kullanıcı desteği, hesap sorunları, telif hakkı veya acil içerik kaldırma talepleriniz için bize
        doğrudan e-posta yoluyla ulaşabilirsiniz:
      </p>
      <p>
        <strong>E-posta:</strong> <a href="mailto:support@lociar.app">support@lociar.app</a>
      </p>
      <p>
        Tüm bildirimler ve destek talepleri güvenlik ekibimiz tarafından en geç 24 saat içinde incelenir ve yanıtlanır.
      </p>
      <h2>Gizlilik ve koşullar</h2>
      <p>
        <a href="/privacy">Gizlilik politikası</a> ve <a href="/terms">kullanım koşulları</a> bu sitede yayımlıdır.
      </p>
    </LegalLayout>
  );
}
