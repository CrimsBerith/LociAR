import './styles.css';

export const metadata = {
  title: 'LociAR Admin',
  description: 'Moderation and analytics dashboard for LociAR',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skipLink" href="#main" lang="tr">İçeriğe geç</a>
        {children}
      </body>
    </html>
  );
}
