"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useBackendStatus } from "../../components/SiteHeader";

type ProjectRuntime = "browser" | "backend" | "hybrid";

const projectLinks: Array<{
  href: string;
  label: string;
  runtime: ProjectRuntime;
}> = [
  { href: "/project/terminal-fx", label: "Terminal FX", runtime: "hybrid" },
  { href: "/project/house-rules", label: "House Rules", runtime: "browser" },
  { href: "/project/texvoice", label: "TexVoice", runtime: "backend" },
  { href: "/project/arcade", label: "Arcade", runtime: "browser" },
  { href: "/project/toolbox", label: "Toolbox", runtime: "browser" },
  { href: "/project/rhythm-sync", label: "Rhythm Sync", runtime: "backend" },
];

export default function ProjectLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const backendStatus = useBackendStatus();

  return (
    <main className="site-shell min-h-screen">
      <section className="project-shelf-nav sticky top-[61px] z-40 border-b backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-5 py-4 md:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex shrink-0 items-center gap-4">
              <Link
                href="/"
                className="accent-text text-sm font-semibold transition hover:opacity-80"
              >
                ← All projects
              </Link>
              <span className="hidden h-5 w-px bg-[var(--border)] sm:block" />
              <p className="muted-copy hidden text-xs sm:block">
                Open another build
              </p>
            </div>

            <nav
              className="flex gap-2 overflow-x-auto pb-1 lg:justify-end"
              aria-label="Project navigation"
            >
              {projectLinks.map((item) => {
                const active = pathname === item.href;
                const state = getRuntimeState(item.runtime, backendStatus);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className="project-shelf-link flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition"
                    data-active={active}
                  >
                    <span
                      className="project-shelf-dot h-1.5 w-1.5 rounded-full"
                      data-state={state}
                      aria-hidden="true"
                    />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      </section>

      {children}
    </main>
  );
}

function getRuntimeState(
  runtime: ProjectRuntime,
  backendStatus: "online" | "offline" | "unconfigured"
) {
  if (runtime === "browser") return "browser";
  if (runtime === "hybrid") {
    return backendStatus === "online" ? "online" : "hybrid";
  }
  return backendStatus === "online" ? "online" : "offline";
}
