import Link from 'next/link';
import LegalLayout from '../../legal-layout';
import { LEGAL_ENTITY as E } from '../../legal-entity';

export const metadata = {
  title: 'LociAR Support',
  description: 'Help with deleting your LociAR account, reporting posts and comments, blocking, notifications and privacy.',
};

export default function SupportPageEn() {
  return (
    <LegalLayout title="Support" updated={E.updatedEn} lang="en">
      <p>
        Most actions are available directly inside LociAR. If you need help, email us.
        {' '}<Link href="/support">Türkçe</Link>
      </p>

      <h2>Report a post</h2>
      <p>Open the post, tap <strong>Report</strong> below it and pick a reason. The ••• menu on the same screen also lets you block the author.</p>
      <h2>Report a comment</h2>
      <p>Tap the ••• menu next to the comment and choose <strong>Report comment</strong>. You can delete comments on your own posts.</p>
      <h2>Report or block a user</h2>
      <p>
        On the user&apos;s profile, tap <strong>Report user</strong> or <strong>Block user</strong>. Content from users you block is
        hidden from you; you can unblock them in Profile → Blocked accounts.
      </p>
      <p>Reports are reviewed within 24 hours; content that breaks the rules is removed.</p>

      <h2>Delete your account</h2>
      <p>
        Profile → Delete account permanently. Your posts, comments, follows and files are deleted permanently. If you signed
        in with Apple, Apple asks you to confirm.
      </p>

      <h2>Notifications and permissions</h2>
      <p>
        Turn notifications, camera and location on or off in iOS Settings → LociAR. Turn off crash reports in Profile → Settings.
      </p>

      <h2>Contact</h2>
      <p>
        Account issues, copyright or urgent removal requests: <a href={`mailto:${E.contactEmail}`}>{E.contactEmail}</a>
      </p>

      <h2>Privacy and terms</h2>
      <p>
        <Link href="/privacy/en">Privacy policy</Link> · <Link href="/terms/en">Terms of use</Link>
      </p>
    </LegalLayout>
  );
}
