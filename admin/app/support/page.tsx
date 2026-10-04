import Link from 'next/link';
import LegalLayout from '../legal-layout';
import { LEGAL_ENTITY as E } from '../legal-entity';

export const metadata = {
  title: 'LociAR Destek',
  description: 'LociAR hesap silme, içerik ve yorum bildirme, engelleme, bildirim ve gizlilik yardımı.',
};

export default function SupportPage() {
  return (
    <LegalLayout title="Destek" updated={E.updatedTr}>
      <p>
        Uygulamadaki işlemlerin çoğu doğrudan LociAR içinden yapılır. Yardıma ihtiyacınız olursa bize e-posta ile ulaşın.
        {' '}<Link href="/support/en">English</Link>
      </p>

      <h2>Bir postu bildirme</h2>
      <p>Postu açın, alttaki <strong>Bildir</strong> düğmesine dokunun ve nedeni seçin. Aynı ekrandaki ••• menüsünden postun sahibini de engelleyebilirsiniz.</p>
      <h2>Bir yorumu bildirme</h2>
      <p>Yorumun yanındaki ••• menüsünden <strong>Yorumu bildir</strong>&apos;e dokunun. Kendi postunuzdaki yorumları silebilirsiniz.</p>
      <h2>Bir kullanıcıyı bildirme veya engelleme</h2>
      <p>
        Kullanıcının profilinde <strong>Kullanıcıyı bildir</strong> veya <strong>Kullanıcıyı engelle</strong>&apos;ye dokunun.
        Engellenen kullanıcıların içerikleri size gösterilmez; engelleri Profil → Engellenen hesaplar&apos;dan kaldırabilirsiniz.
      </p>
      <p>Bildirimler en geç 24 saat içinde incelenir; kurallara aykırı içerik kaldırılır.</p>

      <h2>Hesabı silme</h2>
      <p>
        Profil → Hesabı kalıcı olarak sil. Postlarınız, yorumlarınız, takipleriniz ve dosyalarınız kalıcı olarak silinir.
        Apple ile giriş yaptıysanız Apple onayı istenir.
      </p>

      <h2>Bildirimler ve izinler</h2>
      <p>
        Bildirimleri, kamerayı ve konumu iOS Ayarlar → LociAR yolundan açıp kapatabilirsiniz. Çökme raporlarını Profil →
        Ayarlar&apos;dan kapatabilirsiniz.
      </p>

      <h2>İletişim</h2>
      <p>
        Hesap sorunları, telif hakkı veya acil içerik kaldırma talepleri: <a href={`mailto:${E.contactEmail}`}>{E.contactEmail}</a>
      </p>

      <h2>Gizlilik ve koşullar</h2>
      <p>
        <Link href="/privacy">Gizlilik politikası</Link> · <Link href="/terms">Kullanım koşulları</Link>
      </p>
    </LegalLayout>
  );
}
