import './styles.css';
import SkipLink from './skip-link';

export const metadata = {
  title: 'LociAR Admin',
  description: 'Moderation and analytics dashboard for LociAR',
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
