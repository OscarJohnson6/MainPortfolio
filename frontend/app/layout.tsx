// destination: src/app/layout.tsx
// Finance Lab added to footer navigation.

import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteHeader } from "../components/SiteHeader";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "OJ Builds",
    template: "%s | OJ Builds",
  },
  description:
    "A portfolio of usable projects, web apps, tools, terminal systems, and backend experiments by Oscar Johnson.",
  keywords: [
    "Oscar Johnson",
    "OJ Builds",
    "portfolio",
    "web development",
    "Next.js",
    "React",
    "TypeScript",
    "Python",
    "FastAPI",
    "Rust",
  ],
  authors: [{ name: "Oscar Johnson" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full scroll-smooth antialiased`}
    >
      <body className="min-h-full bg-slate-950 text-slate-100">
        <div className="flex min-h-screen flex-col">
          <SiteHeader />
          <div className="flex-1">{children}</div>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-slate-800 bg-slate-950">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-6 py-8 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
        <p>OJ Builds — portfolio, apps, tools, and systems.</p>

        <div className="flex flex-wrap gap-4">
          <Link href="/" className="hover:text-cyan-300">Home</Link>
          <Link href="/about" className="hover:text-cyan-300">About</Link>
          <Link href="/project/texvoice" className="hover:text-cyan-300">TexVoice</Link>
          <Link href="/project/terminal-fx" className="hover:text-cyan-300">Terminal FX</Link>
          <Link href="/project/rhythm-sync" className="hover:text-cyan-300">Rhythm Sync</Link>
          <Link href="/project/finance-lab" className="hover:text-cyan-300">Finance Lab</Link>
          <Link href="/project/toolbox" className="hover:text-cyan-300">Toolbox</Link>
          <Link href="/project/arcade" className="hover:text-cyan-300">Arcade</Link>
          <Link href="/project/house-rules" className="hover:text-cyan-300">House Rules</Link>
        </div>
      </div>
    </footer>
  );
}
