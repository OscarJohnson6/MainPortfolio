import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import {
  BackendStatusProvider,
  SiteHeader,
  type BackendStatus,
} from "../components/SiteHeader";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const appearanceScript = `
(() => {
  try {
    const themes = ["system", "light", "dark"];
    const accents = ["copper", "moss", "violet", "cyan"];
    const storedTheme = localStorage.getItem("oj-builds-theme");
    const storedAccent = localStorage.getItem("oj-builds-accent");
    const mode = themes.includes(storedTheme) ? storedTheme : "system";
    const accent = accents.includes(storedAccent) ? storedAccent : "copper";
    const resolved = mode === "system"
      ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : mode;
    const root = document.documentElement;
    root.dataset.theme = resolved;
    root.dataset.themeMode = mode;
    root.dataset.accent = accent;
    root.style.colorScheme = resolved;
  } catch {}
})();
`;

export const metadata: Metadata = {
  title: {
    default: "OJ Builds",
    template: "%s | OJ Builds",
  },
  description:
    "A working shelf of games, practical tools, visual systems, and software experiments built by Oscar Johnson.",
  keywords: [
    "Oscar Johnson",
    "OJ Builds",
    "software portfolio",
    "Next.js",
    "React",
    "TypeScript",
    "Python",
    "FastAPI",
    "Rust",
    "WebAssembly",
    "browser games",
  ],
  authors: [{ name: "Oscar Johnson" }],
};

async function getBackendStatus(): Promise<BackendStatus> {
  // This must match the address used by browser project requests. Using a
  // different server-only URL can briefly report "online" before the browser
  // discovers that the public API is unreachable.
  const rawBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (!rawBaseUrl) return "unconfigured";

  const baseUrl = rawBaseUrl.replace(/\/$/, "");

  try {
    const response = await fetch(`${baseUrl}/api/health`, {
      next: { revalidate: 30 },
      signal: AbortSignal.timeout(2000),
    });

    return response.ok ? "online" : "offline";
  } catch {
    return "offline";
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const backendStatus = await getBackendStatus();

  return (
    <html
      lang="en"
      data-theme="dark"
      data-theme-mode="system"
      data-accent="copper"
      className={`${geistSans.variable} ${geistMono.variable} h-full scroll-smooth antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: appearanceScript }} />
      </head>
      <body className="site-body min-h-full">
        <BackendStatusProvider initialStatus={backendStatus}>
          <div className="flex min-h-screen flex-col">
            <SiteHeader />
            <div className="flex-1">{children}</div>
            <SiteFooter />
          </div>
        </BackendStatusProvider>
        <Analytics />
      </body>
    </html>
  );
}

function SiteFooter() {
  return (
    <footer className="site-footer border-t">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-6 py-8 text-sm md:flex-row md:items-center md:justify-between">
        <p>OJ Builds — things made to be used, played, and explored.</p>

        <div className="flex flex-wrap gap-5">
          <Link href="/" className="site-link transition">
            Projects
          </Link>
          <Link href="/about" className="site-link transition">
            About
          </Link>
          <a
            href="https://github.com/OscarJohnson6/MainPortfolio"
            target="_blank"
            rel="noreferrer"
            className="site-link transition"
          >
            Source
          </a>
        </div>
      </div>
    </footer>
  );
}
