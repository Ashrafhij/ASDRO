import type { Metadata } from 'next';
import { I18nProvider } from '@/lib/i18n-context';
import './globals.css';

export const metadata: Metadata = {
  title: 'ASDRO - Smart Delivery Route Optimizer',
  description: 'Optimize your delivery route with automatic stop sequencing and navigation',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
