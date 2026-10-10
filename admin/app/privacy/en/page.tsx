import Link from 'next/link';
import LegalLayout from '../../legal-layout';
import { LEGAL_ENTITY as E } from '../../legal-entity';

export const metadata = {
  title: 'LociAR Privacy Policy',
  description: 'How LociAR processes location, camera, account, notification, crash and user-generated content data.',
};

export default function PrivacyPageEn() {
  return (
    <LegalLayout title="Privacy policy" updated={E.updatedEn} lang="en">
      <p>
        LociAR is an iOS app for sharing short text notes anchored to real-world surfaces. This
        policy explains which personal data we process. <Link href="/privacy">Türkçe sürüm</Link>
      </p>

      <h2>Data controller</h2>
      <p>
        {E.controllerName}, {E.controllerAddress}. Contact: <a href={`mailto:${E.contactEmail}`}>{E.contactEmail}</a>
      </p>

      <h2>Data we process</h2>
      <ul>
        <li><strong>Identity:</strong> Sign in with Apple identifier or email address, username, display name, profile photo.</li>
        <li><strong>Location:</strong> while the app is in use, to show nearby content and store where you place a post (precise
          location; iOS asks for temporary precise location when AR positioning needs it).</li>
        <li><strong>Camera:</strong> used only for AR placement; the camera feed is not recorded. Posts are text
          and/or one GIF chosen from GIPHY; there are no photo, video or link posts. When you pin content, an AR map file for that surface (a feature map, not a
          photo) may be stored.</li>
        <li><strong>Profile photo:</strong> a photo you upload is screened automatically before it is shown (see &quot;Google Cloud Vision&quot;).</li>
        <li><strong>User content:</strong> posts, captions, comments, likes, saves, collections, follows, blocks and reports.</li>
        <li><strong>Notification token:</strong> if you allow notifications, your device&apos;s Apple Push / Firebase Cloud Messaging token.</li>
        <li><strong>Crash and diagnostic data:</strong> when the app crashes, the device model, iOS version, app version, stack trace and a
          random installation ID (Firebase Crashlytics).</li>
        <li><strong>Security:</strong> session tokens, device attestation (Apple App Attest / Firebase App Check), IP address
          processed by our infrastructure provider, and abuse-prevention records.</li>
      </ul>

      <h2>Purposes and legal bases</h2>
      <ul>
        <li>Account creation, sign-in, publishing and displaying content — performance of our contract with you.</li>
        <li>Like, comment and follow notifications — performance of the contract while you allow them; turn them off in iOS Settings.</li>
        <li>Moderation, protected-zone and 18+ blocks, profile photo screening, spam and abuse prevention, security — legitimate
          interests and legal obligations.</li>
        <li>Crash reports to keep the app stable — legitimate interests; you can turn them off in Profile → Settings.</li>
        <li>Handling legal claims — establishing, exercising or defending legal rights.</li>
      </ul>
      <p>We do not sell your data, use it for advertising, or track you across other companies&apos; apps and websites.</p>

      <h2>Service providers and international transfers</h2>
      <p>
        Our infrastructure is provided by Google Firebase (Google Cloud); data is stored in Google data centers in the
        <strong> United States</strong> under Google&apos;s data processing terms and appropriate safeguards. Google services we use:
      </p>
      <ul>
        <li><strong>Firebase Authentication, Cloud Firestore, Cloud Storage, Cloud Functions, App Check:</strong> accounts, content and security.</li>
        <li><strong>Firebase Cloud Messaging:</strong> delivering notifications (via the Apple Push Notification service).</li>
        <li><strong>Firebase Crashlytics:</strong> crash reports, kept for {E.crashRetentionDays} days.</li>
        <li><strong>Google Cloud Vision:</strong> automatic screening of profile photos for nudity, violence and similar content. The photo
          is sent only for this check; rejected photos are deleted.</li>
        <li><strong>Google ARCore:</strong> AR positioning (below).</li>
        <li><strong>GIPHY:</strong> GIF search and GIF display (below).</li>
      </ul>
      <p>Public posts and usernames are visible to other users. We may disclose data in response to lawful requests.</p>

      <h2>Google ARCore (AR positioning)</h2>
      <p>
        To show posts on the exact surface and place where they were left, we use Google ARCore Cloud Anchors and the
        Geospatial API. To power these sessions, Google will process sensor data (e.g., camera and location): visual
        features derived from the camera image and approximate location are sent to Google; we do not store photos or
        videos. A post&apos;s Cloud Anchor is kept for at most 365 days and is deleted when the post or the account is
        deleted. Learn more:{' '}
        <a href="https://support.google.com/ar?p=how-google-play-services-for-ar-handles-your-data">How Google handles AR data</a>,{' '}
        <a href="https://policies.google.com/privacy">Google Privacy Policy</a>.
      </p>

      <h2>GIPHY (GIFs)</h2>
      <p>
        GIFs are provided by GIPHY, Inc. When you search for a GIF, the search words and your app language are sent to GIPHY
        by our servers, without your account details. GIF images and videos are loaded by your device directly from
        GIPHY&apos;s servers, which therefore receive your IP address and standard device information. A post stores only the
        GIPHY ID of the GIF you chose. Learn more: <a href="https://giphy.com/privacy">GIPHY Privacy Policy</a>.
      </p>

      <h2>Retention</h2>
      <ul>
        <li>Account data and content: until you delete your account.</li>
        <li>On account deletion your profile, posts, comments, likes, follows, collections, notification tokens, AR files, profile
          photos and your sign-in account enter permanent deletion immediately. Temporary service errors are retried in the background until deletion completes. Reports you filed are kept de-identified; a record
          of the deletion itself (pseudonymous ID and counts) is kept for security.</li>
        <li>Usage and security events (including approximate location): at most {E.analyticsRetentionDays} days, then deleted automatically.</li>
        <li>Crash reports: {E.crashRetentionDays} days.</li>
      </ul>

      <h2>Your rights</h2>
      <p>
        You can request access to, correction or deletion of your personal data, restrict or object to processing, ask for a
        portable copy, and ask which third parties received it. Contact <a href={`mailto:${E.contactEmail}`}>{E.contactEmail}</a>;
        we respond within 30 days, free of charge. You may also lodge a complaint with your data protection authority (in
        Türkiye: KVKK Kurumu; in the EEA/UK: your local supervisory authority).
      </p>

      <h2>Your controls</h2>
      <ul>
        <li>Delete your account permanently from Profile → Delete account permanently.</li>
        <li>Report posts, comments and users, and block users.</li>
        <li>Revoke camera, location and notification permissions in iOS Settings.</li>
        <li>Turn off crash reports in Profile → Settings → Crash reports.</li>
        <li>Support: <Link href="/support/en">support page</Link>.</li>
      </ul>

      <h2>Children</h2>
      <p>LociAR is not directed to children; users under 13 must not create an account.</p>

      <h2>Changes</h2>
      <p>When this policy changes, the date above is updated; material changes are announced in the app.</p>
    </LegalLayout>
  );
}
