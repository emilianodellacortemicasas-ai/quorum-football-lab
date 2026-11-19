import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'QUORUM · Football Lab',
  description: 'Il tuo laboratorio privato di probabilità, analisi calcistica e gestione del rischio.',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'QUORUM' },
  icons: { icon: '/favicon.svg', apple: '/apple-touch-icon.png' },
};
export const viewport: Viewport = { themeColor: '#172c20', width: 'device-width', initialScale: 1, viewportFit: 'cover' };
// The site sits behind Cloudflare Access: the manifest must be fetched with the session cookie,
// otherwise Access redirects it to the login page and the app cannot be installed.
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>) {
  return <html lang="it"><head><link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials"/></head><body>{children}</body></html>;
}
