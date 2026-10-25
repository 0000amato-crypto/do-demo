import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

const TITLE = '世界で1番どうでもいいランキング';
const DESCRIPTION =
  '世界で1番どうでもいいことに、あなたも参加しませんか？ボタンを押すと、世界のクリック数が1増えます。それだけです。';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, type: 'website', locale: 'ja_JP' },
  twitter: { card: 'summary', title: TITLE, description: DESCRIPTION },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ffffff',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=BIZ+UDGothic:wght@700&family=BIZ+UDPGothic:wght@400;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
