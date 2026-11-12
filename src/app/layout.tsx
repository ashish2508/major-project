import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { StateProviders } from '@/components/StateProviders';
import './critical.css';
export const metadata: Metadata = {
  title: 'Passage Review | Local textual similarity',
  description:
    'Compare document passages with possible sources using local TF-IDF, MiniLM and hybrid similarity. Evidence for human review, not proof of misconduct.',
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" href="/styles/non-critical.css" as="style" />
      </head>
      <body>
        <StateProviders>{children}</StateProviders>
        <link rel="stylesheet" href="/styles/non-critical.css" media="print" onLoad={(e) => {
          (e.currentTarget as HTMLLinkElement).media = 'screen';
        }} />
      </body>
    </html>
  );
}
