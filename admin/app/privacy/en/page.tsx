import Link from 'next/link';
import LegalLayout from '../../legal-layout';
import { LEGAL_ENTITY as E } from '../../legal-entity';

export const metadata = {
  title: 'LociAR Privacy Policy',
  description: 'How LociAR processes location, camera, account and user-generated content data.',
};

export default function PrivacyPageEn() {
  return (
    <LegalLayout title="Privacy policy" updated="28 September 2026">
      <p>
        LociAR is an iOS app for publishing user content anchored to real-world surfaces. This policy explains which
        personal data we process. <Link href="/privacy">Türkçe sürüm</Link>
      </p>

      <h2>Data controller</h2>
      <p>
        {E.controllerName}, {E.controllerAddress}. Contact: <a href={`mailto:${E.contactEmail}`}>{E.contactEmail}</a>
      </p>

      <h2>Data we process</h2>
      <ul>
        <li><strong>Identity:</strong> Sign in with Apple identifier or email address, username, profile photo.</li>
        <li><strong>Location:</strong> while the app is in use, to show nearby content and store where you place a post.</li>
        <li><strong>Camera and media:</strong> used only for AR placement (posts are text and social media links; no photos or videos are uploaded); the camera feed is not
          recorded. When you pin content, the AR map file and reference image for that surface are stored.</li>
        <li><strong>User content:</strong> posts, captions, comments, likes, saves, follows, blocks and reports.</li>
        <li><strong>Security:</strong> session tokens, device attestation (Apple App Attest / Firebase App Check), IP address
          processed by our infrastructure provider, and abuse-prevention records.</li>
      </ul>

      <h2>Purposes and legal bases</h2>
      <ul>
        <li>Account creation, sign-in, publishing and displaying content — performance of our contract with you.</li>
        <li>Moderation, protected-zone and 18+ blocks, spam and abuse prevention, security — legitimate interests and legal obligations.</li>
        <li>Handling legal claims — establishing, exercising or defending legal rights.</li>
      </ul>
      <p>We do not sell your data, use it for advertising, or track you across other companies&apos; apps and websites.</p>

      <h2>Sharing and international transfers</h2>
      <p>
        Our infrastructure is provided by Google Firebase (Google Cloud); data is stored in Google data centers in the
        <strong> United States</strong> under Google&apos;s data processing terms and appropriate safeguards. Public posts and
        usernames are visible to other users. We may disclose data in response to lawful requests.
      </p>

      <h2>Retention</h2>
      <ul>
        <li>Account data and content: until you delete your account.</li>
        <li>On account deletion your profile, posts, comments, likes, follows, collections, AR and media files and your sign-in
          account are permanently deleted immediately. Reports you filed are kept de-identified; a record of the deletion
          itself (pseudonymous ID and counts) is kept for security.</li>
        <li>Usage and security events (including approximate location): at most {E.analyticsRetentionDays} days, then deleted automatically.</li>
      </ul>

      <h2>Your rights</h2>
      <p>
        You can request access to, correction or deletion of your personal data, object to processing, and ask which third
        parties received it. Contact <a href={`mailto:${E.contactEmail}`}>{E.contactEmail}</a>; we respond within 30 days, free of
        charge. You may also lodge a complaint with your data protection authority (in Türkiye: KVKK Kurumu).
      </p>

      <h2>Your controls</h2>
      <ul>
        <li>Delete your account permanently from Profile.</li>
        <li>Report content and block users.</li>
        <li>Revoke camera and location permissions in iOS Settings.</li>
        <li>Support: <Link href="/support">support page</Link>.</li>
      </ul>

      <h2>Children</h2>
      <p>LociAR is not directed to children; users under 13 must not create an account.</p>

      <h2>Changes</h2>
      <p>When this policy changes, the date above is updated; material changes are announced in the app.</p>
    </LegalLayout>
  );
}
