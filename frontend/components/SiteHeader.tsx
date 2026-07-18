// destination: src/components/SiteHeader.tsx
// Extracted from layout.tsx so "use client" doesn't force the root layout
// into a client component. Import this in src/app/layout.tsx.

"use client";

import { useState } from "react";
import Link from "next/link";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
];

export function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-xl">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="group flex flex-col"
          onClick={() => setMobileOpen(false)}
        >
          <span className="text-sm font-bold uppercase tracking-[0.28em] text-cyan-300">
            OJ Builds
          </span>
          <span className="text-xs text-slate-500 transition group-hover:text-slate-300">
            apps // tools // systems
          </span>
        </Link>

        {/* Desktop nav — hidden on mobile */}
        <div className="hidden items-center gap-6 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-slate-300 transition hover:text-cyan-300"
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            className="hidden rounded-xl border border-slate-800 px-3 py-2 text-xs font-semibold text-slate-400 transition hover:border-cyan-400/80 hover:text-cyan-300 sm:inline-flex"
          >
            Admin
          </Link>

          <a
            href="https://github.com/OscarJohnson6"
            target="_blank"
            rel="noreferrer"
            className="rounded-xl bg-cyan-300 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-cyan-200"
          >
            GitHub
          </a>

          {/* Hamburger — visible on mobile only */}
          <button
            className="flex flex-col justify-center gap-[5px] rounded-lg p-2 text-slate-400 transition hover:text-cyan-300 md:hidden"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
          >
            <span
              className={`block h-px w-5 bg-current transition-all duration-200 ${
                mobileOpen ? "translate-y-[7px] rotate-45" : ""
              }`}
            />
            <span
              className={`block h-px w-5 bg-current transition-all duration-200 ${
                mobileOpen ? "opacity-0" : ""
              }`}
            />
            <span
              className={`block h-px w-5 bg-current transition-all duration-200 ${
                mobileOpen ? "-translate-y-[7px] -rotate-45" : ""
              }`}
            />
          </button>
        </div>
      </nav>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="border-t border-slate-800/80 bg-slate-950/95 px-6 py-5 md:hidden">
          <div className="flex flex-col gap-4">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="text-sm font-medium text-slate-300 transition hover:text-cyan-300"
              >
                {item.label}
              </Link>
            ))}

            <div className="my-1 h-px bg-slate-800" />

            <Link
              href="/admin"
              onClick={() => setMobileOpen(false)}
              className="text-sm font-medium text-slate-400 transition hover:text-cyan-300"
            >
              Admin
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
