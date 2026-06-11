import type { Metadata, Viewport } from 'next';
import { I18nProvider } from '@/lib/i18n-context';
import PwaRegister from '@/components/PwaRegister';
import AnalyticsPing from '@/components/AnalyticsPing';
import './globals.css';

export const metadata: Metadata = {
  title: 'ASDRO - Smart Delivery Route Optimizer',
  description: 'Optimize your delivery route with automatic stop sequencing and navigation',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'ASDRO' },
};

export const viewport: Viewport = {
  themeColor: '#2563eb',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icon-192.svg" />
      </head>
      <body className="min-h-full flex flex-col">
        <I18nProvider>{children}</I18nProvider>
        <PwaRegister />
        <AnalyticsPing />
      </body>
    </html>
  );
}
