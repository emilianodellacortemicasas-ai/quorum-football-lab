import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'QUORUM · Football Lab',
  description: 'Il tuo laboratorio privato di probabilità, analisi calcistica e gestione del rischio.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'QUORUM' },
  icons: { icon: '/favicon.svg', apple: '/icon-192.png' },
};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>) {return <html lang="it"><body>{children}</body></html>;}
