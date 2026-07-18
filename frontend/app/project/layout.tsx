// destination: src/app/project/layout.tsx
// Wordle replaced with Arcade in the project nav.

import Link from "next/link";

const projectLinks = [
  { href: "/project/texvoice", label: "TexVoice" },
  { href: "/project/terminal-fx", label: "Terminal FX" },
  { href: "/project/rhythm-sync", label: "Rhythm Sync" },
  { href: "/project/toolbox", label: "Toolbox" },
  { href: "/project/arcade", label: "Arcade" },
];

export default function ProjectLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="border-b border-slate-800/80 bg-slate-900/45">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-6 py-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link
              href="/"
              className="text-sm font-semibold text-cyan-300 transition hover:text-cyan-200"
            >
              ← OJ Builds
            </Link>

            <p className="mt-2 text-sm text-slate-500">Browse projects below.</p>
          </div>

          <nav className="flex gap-2 overflow-x-auto pb-1 text-sm">
            {projectLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="shrink-0 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-slate-300 transition hover:border-cyan-400/80 hover:text-cyan-300"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </section>

      {children}
    </main>
  );
}
