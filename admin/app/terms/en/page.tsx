import Link from 'next/link';
import LegalLayout from '../../legal-layout';
import { LEGAL_ENTITY as E } from '../../legal-entity';

export const metadata = {
  title: 'LociAR Terms of Use',
  description: 'LociAR community rules, user content, zero-tolerance policy and account rules.',
};

const APPLE_EULA = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

export default function TermsPageEn() {
  return (
    <LegalLayout title="Terms of use and community rules" updated={E.updatedEn} lang="en">
      <p>
        These terms govern your use of the LociAR iOS app, provided by {E.controllerName}, {E.controllerAddress}
        {' '}(<a href={`mailto:${E.contactEmail}`}>{E.contactEmail}</a>). By creating an account or using the app you accept
        these terms and Apple&apos;s <a href={APPLE_EULA}>Standard End User License Agreement (EULA)</a>.
        {' '}<Link href="/terms">Türkçe sürüm</Link>
      </p>

      <h2>Minimum age</h2>
      <p>You must be at least 13 years old to use LociAR. If you are under 18, you need the consent of a parent or guardian.</p>

      <h2>Your account</h2>
      <p>
        Publishing requires Sign in with Apple or a verified email account. You are responsible for keeping your account
        secure. You can delete your account in Profile → Delete account permanently; deletion cannot be undone.
      </p>

      <h2>Content rules</h2>
      <ul>
        <li>Posts are a short text message and/or one GIF from GIPHY; photos, videos, drawings and links cannot be shared. GIFs are subject to GIPHY&apos;s terms.</li>
        <li>Sexual / 18+ content is prohibited and is rejected by the server.</li>
        <li>Creating content in protected places such as schools, hospitals, places of worship and government sites is prohibited.</li>
        <li>Harassment, bullying, hate speech, threats, incitement to violence, illegal content, infringing content, spam and
          impersonation are prohibited.</li>
        <li>Do not place content on private property without permission or share other people&apos;s private information.</li>
        <li>Do not use AR while driving or in any way that puts you or others at risk.</li>
      </ul>

      <h2>Zero tolerance for objectionable content and abusive users</h2>
      <p>LociAR has <strong>zero tolerance</strong> for objectionable content and for users who harass or abuse others.</p>
      <ul>
        <li>You can report posts, comments and users and block users from inside the app. Content from users you block is hidden from you.</li>
        <li>Comments and text are filtered automatically; new posts are reviewed before they go live.</li>
        <li>Reported content is reviewed within 24 hours; content that breaks these rules is removed and the account that posted
          it is suspended or permanently closed.</li>
      </ul>

      <h2>Your content</h2>
      <p>
        You keep the rights to what you post. You grant us a worldwide, royalty-free licence to display, store and moderate it
        in the app, which ends when you delete the content or your account.
      </p>

      <h2>AR and third-party services</h2>
      <p>
        AR positioning uses Google ARCore; Google processes sensor data under its own terms (see the{' '}
        <Link href="/privacy/en">privacy policy</Link>).
      </p>

      <h2>Liability</h2>
      <p>
        The service is provided &quot;as is&quot;. AR positions can be approximate. Users are responsible for the content they post.
        To the extent permitted by law we are not liable for indirect damages; your statutory consumer rights are not affected.
      </p>

      <h2>Governing law</h2>
      <p>
        These terms are governed by the laws of the Republic of Türkiye. Mandatory consumer protection rules of the country you
        live in remain applicable.
      </p>

      <h2>Changes and contact</h2>
      <p>
        When these terms change, the date above is updated; material changes are announced in the app. Questions:{' '}
        <a href={`mailto:${E.contactEmail}`}>{E.contactEmail}</a>.
      </p>
    </LegalLayout>
  );
}
