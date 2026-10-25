import Link from "next/link";

export const metadata = {
  title: "About",
  description:
    "About Oscar Johnson and the games, utilities, and software experiments in this portfolio.",
};

const stackGroups = [
  {
    label: "Frontend",
    items: ["React", "Next.js", "TypeScript", "Tailwind", "Canvas"],
  },
  {
    label: "Backend",
    items: ["Python", "FastAPI", "WebSockets", "SQL", "TTS"],
  },
  {
    label: "Other",
    items: ["Rust", "WebAssembly", "C#", "LaTeX", "CLI tools"],
  },
];

const projectNotes = [
  {
    title: "Terminal FX",
    text: "Started as a Python ASCII wallpaper so I could drop Wallpaper Engine and get some processing power back. The Rust version renders pixel-sized blocks instead of characters, and part of it compiles to WebAssembly so it runs in the browser here. Both still run from a normal terminal.",
  },
  {
    title: "House Rules",
    text: "A blackjack roguelite built around user stories: what would actually make a run feel fair, fun, and worth replaying. The card mode is close to done; the alphabet mode is the part I still want to rethink.",
  },
  {
    title: "TexVoice",
    text: "Turns my LaTeX notes into audio so I can listen to them while falling asleep. It doubles as a way to give any LaTeX document an accessible audio version, and it holds the archive of my own notes.",
  },
  {
    title: "Arcade",
    text: "Copies of games I play, without ads and with the changes I wanted, like six-letter Wordle and hints you don't have to watch a video for.",
  },
  {
    title: "Toolbox",
    text: "Small scripts from learning a topic or solving one specific problem. Not complex, but useful enough to keep in one place.",
  },
  {
    title: "Rhythm Sync",
    text: "Built for a networking class that only required a socket game. I wanted to actually learn real-time WebSockets, so I made a rhythm duel, then added a solo campaign for the portfolio.",
  },
];

export default function AboutPage() {
  return (
    <main className="site-shell min-h-screen px-6 pb-20 pt-10 md:pt-12">
      <div className="mx-auto max-w-7xl">
        <section className="border-b border-[var(--border)] pb-8">
          <p className="eyebrow text-xs font-bold uppercase tracking-[0.25em]">
            About
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-[var(--foreground)] md:text-4xl">
            About this portfolio
          </h1>
          <div className="mt-4 max-w-3xl space-y-3 leading-7 text-[var(--muted)]">
            <p>
              I&apos;m Oscar Johnson, a computer science student. This portfolio
              keeps the games, utilities, backend services, and visual projects
              I&apos;ve built in one place.
            </p>
            <p>
              Some started as coursework, some solved a problem I had, and some
              were ideas I wanted to test. I keep the useful or interesting parts
              available even when I stop actively developing a project.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/#projects"
              className="accent-button rounded-xl px-4 py-2.5 text-sm font-semibold transition"
            >
              View projects
            </Link>
            <a
              href="https://github.com/OscarJohnson6/MainPortfolio"
              target="_blank"
              rel="noreferrer"
              className="surface-button rounded-xl px-4 py-2.5 text-sm font-semibold transition"
            >
              GitHub repository
            </a>
          </div>
        </section>

        <section className="grid gap-8 py-10 lg:grid-cols-[0.75fr_1.25fr]">
          <div>
            <p className="eyebrow text-xs font-bold uppercase tracking-[0.22em]">
              Tools I use
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
              The stack changes with the project.
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {stackGroups.map((group) => (
              <div
                key={group.label}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
              >
                <h3 className="accent-text text-xs font-bold uppercase tracking-[0.16em]">
                  {group.label}
                </h3>
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                  {group.items.join(" · ")}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-[var(--border)] pt-10">
          <p className="eyebrow text-xs font-bold uppercase tracking-[0.22em]">
            Project notes
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
            What the larger projects do
          </h2>

          <div className="mt-6 divide-y divide-[var(--border)] border-y border-[var(--border)]">
            {projectNotes.map((project) => (
              <article
                key={project.title}
                className="grid gap-2 py-5 md:grid-cols-[12rem_1fr] md:gap-8"
              >
                <h3 className="font-semibold text-[var(--foreground)]">
                  {project.title}
                </h3>
                <p className="max-w-3xl text-sm leading-6 text-[var(--muted)]">
                  {project.text}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-10 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <h2 className="font-semibold text-[var(--foreground)]">
              How it&apos;s hosted
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              The site and the browser projects are on Vercel. The Python
              services (audio generation, streamed terminal scenes, multiplayer)
              run on a Raspberry Pi 5 at my place through FastAPI.
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <h2 className="font-semibold text-[var(--foreground)]">Resume</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              I keep contact details off the public site. If you&apos;re
              reviewing my work and need my resume, reach out through GitHub or
              wherever you found this link.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
