import './globals.css';
import { AuthProvider } from '@/lib/authContext';

export const metadata = {
  title: 'KPR Wildlife Monitoring',
  description: 'Khwai Private Reserve — monitoring dashboard & admin portal',
  icons: { icon: '/data/icons/KPR.svg' },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
