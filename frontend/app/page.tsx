// destination: src/app/page.tsx
// Changes from previous version:
// - Wordle project entry replaced with Arcade (/project/arcade)
// - Preview type "wordle" replaced with "arcade"
// - Arcade preview component added, wordle preview removed
// - House Rules game project card added (/project/house-rules)
// - Grid now has 7 cards, using xl:grid-cols-3

import Link from "next/link";

type Project = {
  title: string;
  href: string;
  summary: string;
  action: string;
  tech: string[];
  preview:
    | "texvoice"
    | "terminal"
    | "rhythm"
    | "toolbox"
    | "arcade"
    | "houseRules"
    | "finance";
};

const projects: Project[] = [
  {
    title: "TexVoice",
    href: "/project/texvoice",
    summary:
      "A tool for turning long LaTeX or plain-text notes into audio, chapters, logs, and browser playback.",
    action: "Open project",
    tech: ["Python", "FastAPI", "React", "TypeScript", "TTS"],
    preview: "texvoice",
  },
  {
    title: "Terminal FX",
    href: "/project/terminal-fx",
    summary:
      "A Rust terminal wallpaper engine with animated ASCII modes, ANSI rendering, and performance-focused terminal visuals.",
    action: "Open project",
    tech: ["Rust", "ANSI", "Terminal UI", "Performance"],
    preview: "terminal",
  },
  {
    title: "Rhythm Sync",
    href: "/project/rhythm-sync",
    summary:
      "A real-time rhythm duel game with WebSocket match state, beat timing, nerves, accuracy, taunts, and d100 shootouts.",
    action: "Open project",
    tech: ["React", "Python", "FastAPI", "WebSockets", "Game UI"],
    preview: "rhythm",
  },
  {
    title: "Finance Lab",
    href: "/project/finance-lab",
    summary:
      "A stock-buying simulator for testing what an account would look like after buying specific stocks at specific prices and dates.",
    action: "Open project",
    tech: ["React", "Finance", "Simulation", "Local Storage", "FastAPI"],
    preview: "finance",
  },
  {
    title: "Toolbox",
    href: "/project/toolbox",
    summary:
      "Small utilities, scripts, converters, and calculators collected into one place instead of scattered folders.",
    action: "Open project",
    tech: ["TypeScript", "React", "Python", "FastAPI"],
    preview: "toolbox",
  },
  {
    title: "Arcade",
    href: "/project/arcade",
    summary:
      "Browser games built from scratch: Blackjack, Snake, and Flappy Bird. Replaced the original Wordle project page.",
    action: "Open project",
    tech: ["React", "Canvas", "TypeScript", "Game UI"],
    preview: "arcade",
  },
  {
    title: "House Rules",
    href: "/project/house-rules",
    summary:
      "A blackjack roguelite about pull choices, table targets, boss rules, artifacts, shops, and saved run history.",
    action: "Play game",
    tech: ["React", "TypeScript", "Game Design", "Local Storage"],
    preview: "houseRules",
  },
];

const skills = [
  "React",
  "Next.js",
  "TypeScript",
  "Tailwind",
  "Python",
  "FastAPI",
  "Rust",
  "C#",
  "SQL",
];

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <section className="px-6 py-16 md:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">
                Oscar Johnson
              </p>

              <h1 className="mt-5 text-4xl font-bold tracking-tight text-white md:text-6xl">
                Web software projects, tools, and experiments.
              </h1>

              <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">
                This is a portfolio and archive for projects I have built while
                learning frontend, backend, systems, and app development. Some
                are polished tools, some are older projects cleaned up enough to
                run here, and some show the path between the two.
              </p>

              <div className="mt-8 flex flex-wrap gap-4">
                <Link
                  href="#projects"
                  className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
                >
                  View projects
                </Link>

                <Link
                  href="/about"
                  className="rounded-2xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-cyan-300 hover:text-cyan-200"
                >
                  About this portfolio
                </Link>
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-800 bg-slate-900/55 p-6">
              <h2 className="text-xl font-semibold text-white">
                Why this site exists
              </h2>

              <p className="mt-4 leading-8 text-slate-300">
                My older portfolio could show that projects existed, but it did
                not make them easy to try. This version is meant to host the
                apps, keep the source linked, and give each project enough
                context to show what I was trying to learn or solve.
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                {skills.map((skill) => (
                  <span
                    key={skill}
                    className="rounded-full border border-slate-800 bg-slate-950 px-3 py-1 text-xs font-medium text-slate-300"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="projects"
        className="border-y border-slate-800/80 bg-slate-900/35 px-6 py-16"
      >
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">
              Projects
            </p>

            <h2 className="mt-3 text-3xl font-bold text-white md:text-4xl">
              Work that can be opened, tested, or inspected.
            </h2>

            <p className="mt-4 leading-8 text-slate-300">
              Each card links to a project page. The page may contain a working
              app, a demo, a technical writeup, a download, or a cleaned-up
              version of an older project.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.title} project={project} />
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">
              Notes
            </p>

            <h2 className="mt-3 text-3xl font-bold text-white">
              A portfolio, but also a place to keep projects alive.
            </h2>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <InfoCard
              title="Older work stays useful"
              text="Projects can stay visible without pretending the first version was perfect. The original source still matters, but the page can run in the current site."
            />

            <InfoCard
              title="Tools can grow into systems"
              text="Projects like TexVoice can start as one app and later connect to saved notes, generated audio, PDFs, logs, or a small backend library."
            />
          </div>
        </div>
      </section>
    </main>
  );
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <Link
      href={project.href}
      className="group flex min-h-[28rem] flex-col rounded-[1.75rem] border border-slate-800 bg-slate-900/60 p-4 transition hover:-translate-y-1 hover:border-cyan-400/70 hover:bg-slate-900"
    >
      <Preview type={project.preview} />

      <div className="mt-5">
        <h3 className="text-2xl font-semibold text-white">{project.title}</h3>
        <p className="mt-3 leading-7 text-slate-300">{project.summary}</p>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {project.tech.map((item) => (
          <span
            key={item}
            className="rounded-full bg-slate-950 px-3 py-1 text-xs font-medium text-slate-300 ring-1 ring-slate-800"
          >
            {item}
          </span>
        ))}
      </div>

      <div className="mt-auto pt-6">
        <span className="inline-flex rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-950 transition group-hover:bg-cyan-300">
          {project.action}
        </span>
      </div>
    </Link>
  );
}


function MiniCard({
  rank,
  suit,
  red,
  rotate,
}: {
  rank: string;
  suit: string;
  red?: boolean;
  rotate: number;
}) {
  return (
    <div
      className="flex h-20 w-14 flex-col justify-between rounded-lg border border-amber-700/40 bg-[#f8f1dd] p-2 shadow-xl"
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      <span className={`font-serif text-sm font-bold ${red ? "text-red-700" : "text-slate-950"}`}>
        {rank}
      </span>
      <span className={`text-center text-xl ${red ? "text-red-700" : "text-slate-950"}`}>
        {suit}
      </span>
      <span className={`rotate-180 font-serif text-sm font-bold ${red ? "text-red-700" : "text-slate-950"}`}>
        {rank}
      </span>
    </div>
  );
}

function InfoCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/50 p-6">
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="mt-3 leading-7 text-slate-400">{text}</p>
    </div>
  );
}

function Preview({ type }: { type: Project["preview"] }) {
  if (type === "terminal") {
    return (
      <div className="h-44 overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs text-cyan-200">
        <div className="mb-3 flex gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-700" />
        </div>
        <pre className="leading-5 text-cyan-300/80">{`> terminal-fx --mode nebula

   .  *     .       *
 ~~~\\___/~~~~~\\___/~~
  .*   ANSI FIELD   *.
 [fps:45] [diff:on]`}</pre>
      </div>
    );
  }

  if (type === "rhythm") {
    return (
      <div className="relative h-44 overflow-hidden rounded-3xl border border-slate-800 bg-[#1b222c] p-4">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.18),transparent_22rem)]" />
        <div className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-slate-600/70" />
        <div className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-400/70 shadow-[0_0_28px_rgba(245,158,11,0.35)]" />
        <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400/15 ring-1 ring-amber-300/60" />

        <div className="absolute left-4 top-4 rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.25em] text-slate-500">Round</p>
          <p className="font-mono text-lg font-bold text-amber-300">02</p>
        </div>

        <div className="absolute right-4 top-4 rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-right">
          <p className="text-[10px] uppercase tracking-[0.25em] text-slate-500">BPM</p>
          <p className="font-mono text-lg font-bold text-amber-300">105</p>
        </div>

        <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3">
          <div className="h-16 w-5 overflow-hidden rounded-md border border-slate-700 bg-slate-950">
            <div className="mt-5 h-11 bg-gradient-to-t from-amber-700 to-amber-300" />
          </div>

          <div className="rounded-xl border border-amber-600/60 bg-slate-950/80 px-4 py-2 text-center">
            <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Draw</p>
            <p className="text-sm font-black text-amber-300">TAP · AIM · FIRE</p>
          </div>

          <div className="h-16 w-5 overflow-hidden rounded-md border border-red-500/60 bg-slate-950">
            <div className="mt-7 h-9 bg-red-500" />
          </div>
        </div>
      </div>
    );
  }

  if (type === "finance") {
    return (
      <div className="relative h-44 overflow-hidden rounded-3xl border border-emerald-700/40 bg-slate-950 p-4">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.18),transparent_18rem)]" />

        <div className="relative flex items-start justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-300/80">
              Finance Lab
            </p>
            <p className="mt-2 font-mono text-2xl font-bold text-white">
              $12,840
            </p>
            <p className="mt-1 font-mono text-xs text-emerald-300">
              +28.4% simulated
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-400/10 px-3 py-2 text-right">
            <p className="text-[9px] uppercase tracking-[0.22em] text-emerald-200/60">
              Cash
            </p>
            <p className="font-mono text-sm font-bold text-emerald-200">
              $1.2k
            </p>
          </div>
        </div>

        <div className="relative mt-5 h-16 rounded-2xl border border-slate-800 bg-slate-900/80 p-3">
          <svg viewBox="0 0 240 56" className="h-full w-full" aria-hidden="true">
            <polyline
              points="0,42 24,38 48,44 72,30 96,34 120,22 144,26 168,16 192,20 216,10 240,14"
              fill="none"
              stroke="rgb(110 231 183)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points="0,48 24,46 48,45 72,43 96,40 120,39 144,35 168,34 192,31 216,29 240,27"
              fill="none"
              stroke="rgb(51 65 85)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <div className="absolute bottom-4 left-4 right-4 grid grid-cols-3 gap-2 text-center">
          {[
            ["AAPL", "+12%"],
            ["NVDA", "+41%"],
            ["VOO", "+8%"],
          ].map(([symbol, change]) => (
            <div
              key={symbol}
              className="rounded-xl border border-slate-800 bg-slate-950/80 px-2 py-2"
            >
              <p className="font-mono text-xs font-bold text-slate-200">
                {symbol}
              </p>
              <p className="font-mono text-[10px] text-emerald-300">
                {change}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === "toolbox") {
    return (
      <div className="grid h-44 grid-cols-2 gap-3 rounded-3xl border border-slate-800 bg-slate-950 p-4">
        {["Convert", "Calculate", "Format", "Export"].map((item) => (
          <div
            key={item}
            className="flex items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 text-sm font-medium text-slate-300"
          >
            {item}
          </div>
        ))}
      </div>
    );
  }


  if (type === "houseRules") {
    return (
      <div className="relative h-44 overflow-hidden rounded-3xl border border-amber-700/40 bg-[#100b08] p-4">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(201,168,76,0.18),transparent_18rem)]" />
        <div className="relative flex items-center justify-between">
          <span className="font-serif text-xs uppercase tracking-[0.28em] text-amber-300/80">
            House Rules
          </span>
          <span className="rounded-full border border-red-500/40 px-2 py-1 font-mono text-[10px] text-red-300">
            ♥ ♥
          </span>
        </div>

        <div className="relative mt-5 flex items-end justify-center gap-3">
          <MiniCard rank="A" suit="♥" red rotate={-6} />
          <MiniCard rank="K" suit="♠" rotate={3} />
          <MiniCard rank="7" suit="♦" red rotate={6} />
        </div>

        <div className="absolute bottom-4 left-4 right-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border border-amber-700/40 bg-black/30 px-2 py-2">
            <p className="text-[9px] uppercase tracking-[0.22em] text-amber-200/50">Target</p>
            <p className="font-mono text-lg font-bold text-amber-300">21</p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-black/30 px-2 py-2">
            <p className="text-[9px] uppercase tracking-[0.22em] text-slate-500">Pull</p>
            <p className="font-mono text-lg font-bold text-slate-200">2</p>
          </div>
          <div className="rounded-xl border border-cyan-700/40 bg-black/30 px-2 py-2">
            <p className="text-[9px] uppercase tracking-[0.22em] text-cyan-200/50">Artifact</p>
            <p className="font-mono text-lg font-bold text-cyan-300">III</p>
          </div>
        </div>
      </div>
    );
  }

  if (type === "arcade") {
    return (
      <div className="h-44 overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex gap-1.5">
            <span className="h-2 w-2 rounded-full bg-slate-700" />
            <span className="h-2 w-2 rounded-full bg-slate-700" />
            <span className="h-2 w-2 rounded-full bg-slate-700" />
          </div>
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-cyan-300/70">
            ARCADE
          </span>
        </div>

        <div className="grid h-28 grid-cols-3 gap-2">
          {/* Blackjack */}
          <div className="relative flex items-center justify-center overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.06),transparent)]" />
            <div className="relative h-12 w-10">
              <div className="absolute right-0 top-0 flex h-12 w-8 -rotate-6 flex-col justify-between rounded border border-slate-700 bg-slate-800 p-1">
                <span className="text-[8px] font-bold leading-none text-slate-200">K</span>
                <span className="block text-center text-[10px] text-slate-200">♠</span>
              </div>
              <div className="absolute left-0 top-0 flex h-12 w-8 rotate-6 flex-col justify-between rounded border border-slate-600 bg-slate-900 p-1">
                <span className="text-[8px] font-bold leading-none text-red-400">A</span>
                <span className="block text-center text-[10px] text-red-400">♥</span>
              </div>
            </div>
            <span className="absolute bottom-1.5 text-[8px] text-slate-600">Blackjack</span>
          </div>

          {/* Snake */}
          <div className="relative flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-slate-800 bg-slate-900">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.06),transparent)]" />
            <div className="grid grid-cols-5 gap-[3px]">
              {[
                0, 1, 1, 1, 0,
                0, 0, 0, 1, 0,
                0, 1, 1, 1, 0,
                0, 1, 0, 0, 0,
                0, 1, 1, 0, 0,
              ].map((cell, i) => (
                <div
                  key={i}
                  className={`h-2.5 w-2.5 rounded-[2px] ${
                    cell ? "bg-cyan-400/90" : "bg-slate-800"
                  }`}
                />
              ))}
            </div>
            <span className="absolute bottom-1.5 text-[8px] text-slate-600">Snake</span>
          </div>

          {/* Flappy Bird */}
          <div className="relative flex items-center justify-center overflow-hidden rounded-2xl border border-slate-800 bg-[#0c1526]">
            {/* Top pipe */}
            <div className="absolute left-5 top-0 w-8">
              <div className="h-9 w-full bg-cyan-900/80" />
              <div className="-ml-1 h-2.5 w-10 rounded-b bg-cyan-800/90" />
            </div>
            {/* Bottom pipe */}
            <div className="absolute bottom-0 left-5 w-8">
              <div className="-ml-1 h-2.5 w-10 rounded-t bg-cyan-800/90" />
              <div className="h-7 w-full bg-cyan-900/80" />
            </div>
            {/* Bird */}
            <div className="relative z-10 ml-6 h-5 w-5">
              <div className="h-5 w-5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]" />
              <div className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-white" />
              <div className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-slate-900" />
            </div>
            <span className="absolute bottom-1.5 text-[8px] text-slate-600">Flappy</span>
          </div>
        </div>
      </div>
    );
  }

  // texvoice (default)
  return (
    <div className="h-44 rounded-3xl border border-slate-800 bg-slate-950 p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="h-3 w-24 rounded-full bg-cyan-300/70" />
          <div className="mt-2 h-2 w-36 rounded-full bg-slate-700" />
        </div>
        <div className="rounded-full bg-cyan-300 px-3 py-1 text-xs font-semibold text-slate-950">
          audio
        </div>
      </div>

      <div className="flex h-24 items-end gap-1">
        {[32, 55, 24, 70, 42, 82, 36, 62, 48, 28, 76, 38, 58, 44, 66].map(
          (barHeight, index) => (
            <span
              key={`${barHeight}-${index}`}
              className="w-full rounded-full bg-cyan-300/70"
              style={{ height: `${barHeight}%` }}
            />
          )
        )}
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full w-2/3 rounded-full bg-cyan-300" />
      </div>
    </div>
  );
}
