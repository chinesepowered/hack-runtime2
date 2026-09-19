import type { Metadata } from 'next';
import Link from 'next/link';
import { Sprout } from '@/components/Plant';
import './globals.css';

export const metadata: Metadata = {
  title: 'First Share — give a kid their first stocks',
  description:
    'An agent with its own Dynamic wallet buys tokenized stocks on Uniswap v4 every Friday, by rules a parent sets. Base Sepolia testnet.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <Link href="/" className="brand">
            <Sprout size={24} />
            First Share
          </Link>
          <div style={{ flex: 1 }} />
          <Link href="/">Maya&apos;s shares</Link>
          <Link href="/friday">Friday</Link>
          <Link href="/parent">The rule</Link>
          <Link href="/how">How it works</Link>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
