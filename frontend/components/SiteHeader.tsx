"use client";

import Link from "next/link";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type BackendStatus = "online" | "offline" | "unconfigured";
type ThemeMode = "system" | "light" | "dark";
type Accent = "copper" | "moss" | "violet" | "cyan";

const THEME_KEY = "oj-builds-theme";
const ACCENT_KEY = "oj-builds-accent";

const navItems = [
  { href: "/", label: "Projects" },
  { href: "/about", label: "About" },
];

const themeModes: ThemeMode[] = ["system", "light", "dark"];
const accents: Array<{ id: Accent; label: string; color: string }> = [
  { id: "copper", label: "Amber", color: "#f59e0b" },
  { id: "moss", label: "Green", color: "#22c55e" },
  { id: "violet", label: "Violet", color: "#8b5cf6" },
  { id: "cyan", label: "Cyan", color: "#06b6d4" },
];

const BackendStatusContext = createContext<BackendStatus>("unconfigured");

export function useBackendStatus() {
  return useContext(BackendStatusContext);
}

export function BackendStatusProvider({
  initialStatus,
  children,
}: {
  initialStatus: BackendStatus;
  children: ReactNode;
}) {
  const [status, setStatus] = useState(initialStatus);

  useEffect(() => {
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");
    if (!baseUrl) return;

    let active = true;

    async function checkBackend() {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 2500);

      try {
        const response = await fetch(`${baseUrl}/api/health`, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (active) setStatus(response.ok ? "online" : "offline");
      } catch {
        if (active) setStatus("offline");
      } finally {
        window.clearTimeout(timeout);
      }
    }

    void checkBackend();
    const interval = window.setInterval(() => void checkBackend(), 60_000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <BackendStatusContext.Provider value={status}>
      {children}
    </BackendStatusContext.Provider>
  );
}

function resolveTheme(mode: ThemeMode) {
  if (mode !== "system") return mode;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyAppearance(mode: ThemeMode, accent: Accent) {
  const root = document.documentElement;
  const resolved = resolveTheme(mode);

  root.dataset.theme = resolved;
  root.dataset.themeMode = mode;
  root.dataset.accent = accent;
  root.style.colorScheme = resolved;
}

export function SiteHeader() {
  const backendStatus = useBackendStatus();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [accent, setAccent] = useState<Accent>("copper");
  const appearanceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(THEME_KEY);
    const storedAccent = window.localStorage.getItem(ACCENT_KEY);
    const nextTheme = themeModes.includes(storedTheme as ThemeMode)
      ? (storedTheme as ThemeMode)
      : "system";
    const nextAccent = accents.some((item) => item.id === storedAccent)
      ? (storedAccent as Accent)
      : "copper";

    const frame = window.requestAnimationFrame(() => {
      setThemeMode(nextTheme);
      setAccent(nextAccent);
      applyAppearance(nextTheme, nextAccent);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (themeMode !== "system") return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => applyAppearance("system", accent);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [themeMode, accent]);

  useEffect(() => {
    if (!appearanceOpen) return;

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!appearanceRef.current?.contains(event.target as Node)) {
        setAppearanceOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setAppearanceOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [appearanceOpen]);

  function chooseTheme(mode: ThemeMode) {
    setThemeMode(mode);
    window.localStorage.setItem(THEME_KEY, mode);
    applyAppearance(mode, accent);
  }

  function chooseAccent(nextAccent: Accent) {
    setAccent(nextAccent);
    window.localStorage.setItem(ACCENT_KEY, nextAccent);
    applyAppearance(themeMode, nextAccent);
  }

  const backendLabel =
    backendStatus === "online"
      ? "Server online"
      : backendStatus === "offline"
        ? "Server offline"
        : "Server not connected";

  return (
    <header className="site-header sticky top-0 z-50 border-b backdrop-blur-xl">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5 md:px-6">
        <Link
          href="/"
          className="group flex flex-col"
          onClick={() => setMobileOpen(false)}
        >
          <span className="accent-text text-sm font-bold uppercase tracking-[0.28em]">
            OJ Builds
          </span>
          <span className="muted-copy text-xs transition group-hover:opacity-80">
            tools // games // experiments
          </span>
        </Link>

        <div className="hidden items-center gap-6 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="site-link text-sm font-medium transition"
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2.5">
          <div
            className="muted-copy hidden items-center gap-2 text-xs lg:flex"
            title="Availability of live server-backed project features"
          >
            <span
              className="status-dot h-2 w-2 rounded-full"
              data-status={backendStatus}
            />
            {backendLabel}
          </div>

          <div className="relative" ref={appearanceRef}>
            <button
              type="button"
              className="surface-button inline-flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-semibold transition"
              onClick={() => setAppearanceOpen((open) => !open)}
              aria-expanded={appearanceOpen}
              aria-haspopup="dialog"
              aria-label="Choose appearance"
            >
              <span aria-hidden="true">◐</span>
              <span className="hidden sm:inline">Theme</span>
            </button>

            {appearanceOpen && (
              <div
                className="theme-panel absolute right-0 top-12 w-64 rounded-2xl p-4"
                role="dialog"
                aria-label="Appearance settings"
              >
                <p className="text-xs font-bold uppercase tracking-[0.2em] opacity-60">
                  Appearance
                </p>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  {themeModes.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className="theme-choice rounded-xl px-2 py-2 text-xs font-semibold capitalize transition"
                      data-active={themeMode === mode}
                      onClick={() => chooseTheme(mode)}
                    >
                      {mode}
                    </button>
                  ))}
                </div>

                <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] opacity-60">
                  Accent
                </p>

                <div className="mt-3 flex items-center gap-3">
                  {accents.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="accent-swatch h-8 w-8 rounded-full transition hover:scale-110"
                      style={{ background: item.color }}
                      data-active={accent === item.id}
                      onClick={() => chooseAccent(item.id)}
                      aria-label={`${item.label} accent`}
                      title={item.label}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <a
            href="https://github.com/OscarJohnson6/MainPortfolio"
            target="_blank"
            rel="noreferrer"
            className="accent-button rounded-xl px-3 py-2 text-xs font-semibold transition"
          >
            GitHub
          </a>

          <button
            type="button"
            className="surface-button flex h-9 w-9 flex-col items-center justify-center gap-[5px] rounded-xl transition md:hidden"
            onClick={() => setMobileOpen((open) => !open)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
          >
            <span
              className={`block h-px w-4 bg-current transition-all duration-200 ${
                mobileOpen ? "translate-y-[6px] rotate-45" : ""
              }`}
            />
            <span
              className={`block h-px w-4 bg-current transition-all duration-200 ${
                mobileOpen ? "opacity-0" : ""
              }`}
            />
            <span
              className={`block h-px w-4 bg-current transition-all duration-200 ${
                mobileOpen ? "-translate-y-[6px] -rotate-45" : ""
              }`}
            />
          </button>
        </div>
      </nav>

      {mobileOpen && (
        <div className="mobile-menu border-t px-5 py-5 md:hidden">
          <div className="flex flex-col gap-4">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="site-link text-sm font-medium transition"
              >
                {item.label}
              </Link>
            ))}

            <div className="muted-copy flex items-center gap-2 border-t border-[var(--border)] pt-4 text-xs">
              <span
                className="status-dot h-2 w-2 rounded-full"
                data-status={backendStatus}
              />
              {backendLabel}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
