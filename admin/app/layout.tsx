import './styles.css';
import SkipLink from './skip-link';

// Absolute base for Open Graph/Twitter image URLs; without it Next.js falls back to localhost.
const SITE_ORIGIN = process.env.ADMIN_ORIGIN || 'https://lociar-admin--lociar-2f38c.us-central1.hosted.app';

export const metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: 'LociDrop Admin',
  description: 'Moderation and analytics dashboard for LociDrop',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SkipLink />
        {children}
      </body>
    </html>
  );
}
