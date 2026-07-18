// destination: src/app/about/page.tsx

import Link from "next/link";

export const metadata = {
  title: "About",
  description:
    "About Oscar Johnson, OJ Builds, and the reasoning behind the portfolio projects.",
};

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
  "Java",
  "PHP",
];

// Was: 3 entries (portfolio, Wordle, TexVoice only).
// Added: Terminal FX, Rhythm Sync, Toolbox.
const projectReasons = [
  {
    title: "This portfolio",
    text: "My first portfolio helped me try React and connect a Java backend for a school CRUD project, but I was not satisfied with it. It felt more like a list of links than a place where the work could actually run. This version is meant to host the projects, archive them, and give each one a page that fits what it actually is.",
  },
  {
    title: "Wordle",
    text: "Wordle was my first real attempt at making a game without a school outline or jumping into something too large. The original version helped me practice JavaScript, DOM manipulation, input handling, and game-state logic. The portfolio version keeps that project visible while cleaning it up for the current site.",
  },
  {
    title: "TexVoice",
    text: "TexVoice came from a practical problem: I had long LaTeX note files from school and wanted a way to turn them into audio with chapters, logs, and playback. I also wanted a better way to handle long PDFs and notes without depending on heavy or paid tools.",
  },
  {
    title: "Terminal FX",
    text: "The idea behind Terminal FX was to make the terminal look like something more than a text box. The Python version runs animation modes and streams them to the browser through WebSockets and xterm.js. The Rust version is a separate native app with more modes and better performance. There is also a Rust/WASM path being explored for rendering pixel-based modes directly on a canvas.",
  },
  {
    title: "Rhythm Sync",
    text: "Rhythm Sync came from a school multiplayer and networking assignment. I kept working on it after the deadline and it turned into a real-time rhythm duel with WebSocket match state, campaign mode, AI opponents with distinct personalities, boss abilities, and a campaign map. It replaced the older Target Transmission placeholder and ended up being the most fully built project in the portfolio.",
  },
  {
    title: "Toolbox",
    text: "Toolbox exists because I kept writing small utility scripts in separate folders and losing them. The current tools are an electron shell calculator ported from Python and an even division finder that helps with LED animation timing and brightness step calculations. The goal is to keep adding things that solve a specific annoyance without duplicating what TexVoice or other projects already do.",
  },
];

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
      <section className="mx-auto max-w-7xl">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-cyan-300">
              About
            </p>

            <h1 className="mt-5 text-5xl font-bold tracking-tight text-white md:text-6xl">
              Oscar Johnson
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
              I build web apps, backend tools, terminal projects, and practical
              systems while studying computer science and software development.
              This site is where I can keep those projects usable instead of
              leaving them only as repository links.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                href="/"
                className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
              >
                View projects
              </Link>

              <a
                href="https://github.com/OscarJohnson6"
                target="_blank"
                rel="noreferrer"
                className="rounded-2xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-cyan-300 hover:text-cyan-200"
              >
                GitHub
              </a>
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="text-xl font-semibold text-white">
              What I am trying to show
            </h2>

            <p className="mt-3 leading-7 text-slate-400">
              I care about projects that do something: process files, render an
              interface, manage state, connect to an API, run in the terminal, or
              solve a real annoyance I had. The goal is not to make every project
              look identical. The goal is to make each one understandable and,
              when possible, usable from the browser.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              {skills.map((skill) => (
                <span
                  key={skill}
                  className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm font-medium text-slate-300"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        </div>

        <section className="mt-14">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">
            Reasoning
          </p>

          <h2 className="mt-3 max-w-3xl text-3xl font-bold text-white">
            Why these projects are here
          </h2>

          {/* Grid updated from lg:grid-cols-3 (3 items) to md:grid-cols-2 lg:grid-cols-3 (6 items) */}
          <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {projectReasons.map((item) => (
              <div
                key={item.title}
                className="rounded-3xl border border-slate-800 bg-slate-900/50 p-6"
              >
                <h3 className="text-lg font-semibold text-white">{item.title}</h3>
                <p className="mt-3 leading-7 text-slate-400">{item.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-14 rounded-[2rem] border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">
            Next direction
          </p>

          <h2 className="mt-3 text-3xl font-bold text-white">
            Notes, audio, and generated files may become their own library.
          </h2>

          <p className="mt-4 max-w-4xl leading-8 text-slate-300">
            TexVoice could eventually connect to a small collection of prepared
            notes: PDF files, generated audio, chapters, and logs. That would let
            someone open a note set and listen without regenerating the audio.
            The upload and generation tool can stay separate from the archived
            notes so the app does not become cluttered.
          </p>
        </section>
      </section>
    </main>
  );
}
