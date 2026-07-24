"use client";

import Link from "next/link";
import {
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  useBackendStatus,
  type BackendStatus,
} from "../components/SiteHeader";

type ProjectRuntime = "browser" | "backend" | "hybrid";

type Project = {
  title: string;
  href: string;
  summary: string;
  action: string;
  tech: string[];
  runtime: ProjectRuntime;
  preview:
    | "texvoice"
    | "terminal"
    | "rhythm"
    | "toolbox"
    | "arcade"
    | "houseRules";
};

const projects: Project[] = [
  {
    title: "Terminal FX",
    href: "/project/terminal-fx",
    summary:
      "Animated terminal wallpapers in two engines: streamed Python ANSI scenes and a faster Rust/WebAssembly canvas collection.",
    action: "Explore both engines",
    tech: ["Python", "Rust", "WebAssembly", "Canvas"],
    runtime: "hybrid",
    preview: "terminal",
  },
  {
    title: "House Rules",
    href: "/project/house-rules",
    summary:
      "A blackjack-inspired roguelite with multiple modes, bosses, artifacts, events, shops, achievements, and saved runs.",
    action: "Play the game",
    tech: ["React", "TypeScript", "Game Systems", "Local Storage"],
    runtime: "browser",
    preview: "houseRules",
  },
  {
    title: "TexVoice",
    href: "/project/texvoice",
    summary:
      "A LaTeX and PDF workspace that generates audio, chapters, timestamps, logs, and an in-browser reading view.",
    action: "Open TexVoice",
    tech: ["Python", "FastAPI", "LaTeX", "TTS"],
    runtime: "backend",
    preview: "texvoice",
  },
  {
    title: "Arcade",
    href: "/project/arcade",
    summary:
      "Six ad-free browser games, including more customizable versions of Wordle and Letter Connect.",
    action: "Enter the arcade",
    tech: ["React", "Canvas", "TypeScript", "Game Logic"],
    runtime: "browser",
    preview: "arcade",
  },
  {
    title: "Toolbox",
    href: "/project/toolbox",
    summary:
      "Small scripts and calculators kept together because each solved a specific problem or was useful enough to save.",
    action: "Open the toolbox",
    tech: ["TypeScript", "React", "Python", "FastAPI"],
    runtime: "browser",
    preview: "toolbox",
  },
  {
    title: "Rhythm Sync",
    href: "/project/rhythm-sync",
    summary:
      "A WebSocket rhythm duel with changing tempos, timing-based combat, AI opponents, multiplayer ready-up, and a campaign.",
    action: "Try the experiment",
    tech: ["React", "Python", "FastAPI", "WebSockets", "Game UI"],
    runtime: "backend",
    preview: "rhythm",
  },
];

export default function HomePage() {
  const backendStatus = useBackendStatus();
  const browserProjects = projects.filter(
    (project) => project.runtime !== "backend"
  );
  const serverProjects = projects.filter(
    (project) => project.runtime === "backend"
  );

  return (
    <main className="home-shell min-h-screen overflow-hidden">
      <section className="px-6 pb-7 pt-10 md:pt-12">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 border-b border-[var(--border)] pb-7 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="eyebrow text-xs font-bold uppercase tracking-[0.25em]">
              Portfolio
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-[var(--foreground)] md:text-4xl">
              Projects
            </h1>
            <p className="mt-3 max-w-2xl text-[var(--muted)]">
              Games, utilities, visual experiments, and larger systems. Open any
              project to use it or see how it works.
            </p>
          </div>
          <Link
            href="/about"
            className="site-link w-fit text-sm font-semibold transition"
          >
            About this portfolio →
          </Link>
        </div>
      </section>

      <section id="projects" className="px-6 pb-20 pt-4">
        <div className="mx-auto max-w-7xl">
          <div className="mb-5">
            <p className="eyebrow text-xs font-bold uppercase tracking-[0.22em]">
              Available now
            </p>
            <h2 className="section-title mt-1 text-xl font-semibold">
              Runs in the browser
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {browserProjects.map((project) => (
              <InteractiveProjectCard
                key={project.title}
                project={project}
                backendStatus={backendStatus}
              />
            ))}
          </div>

          <div className="mb-5 mt-12">
            <p className="eyebrow text-xs font-bold uppercase tracking-[0.22em]">
              Live services
            </p>
            <h2 className="section-title mt-1 text-xl font-semibold">
              Connects to the project server
            </h2>
          </div>

          <BackendNotice status={backendStatus} />

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {serverProjects.map((project) => (
              <InteractiveProjectCard
                key={project.title}
                project={project}
                backendStatus={backendStatus}
              />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function BackendNotice({ status }: { status: BackendStatus }) {
  const message =
    status === "online"
      ? "The project server is online. Live audio, streaming, and multiplayer features are ready."
      : status === "offline"
        ? "The live server is temporarily offline. These project pages still open, but their generated audio and multiplayer features will wait for the server to return."
        : "The live server has not been connected to this deployment yet. These project pages remain available while their server-powered features stay paused.";

  return (
    <div
      className="backend-notice flex items-start gap-3 rounded-2xl px-4 py-3 text-sm leading-6"
      data-status={status}
    >
      <span
        className="status-dot mt-2 h-2 w-2 shrink-0 rounded-full"
        data-status={status}
      />
      <p>{message}</p>
    </div>
  );
}

type CardStyle = CSSProperties & {
  "--mouse-x": string;
  "--mouse-y": string;
  "--rotate-x": string;
  "--rotate-y": string;
  "--shadow-x": string;
  "--shadow-y": string;
};

function InteractiveProjectCard({
  project,
  backendStatus,
}: {
  project: Project;
  backendStatus: BackendStatus;
}) {
  const cardRef = useRef<HTMLAnchorElement>(null);
  const pointer = useRef({
    id: -1,
    startX: 0,
    startY: 0,
    moved: false,
    active: false,
  });
  const suppressNextClick = useRef(false);

  const usesBackend = project.runtime !== "browser";
  const backendUnavailable = usesBackend && backendStatus !== "online";
  const runtimeState = backendUnavailable
    ? "offline"
    : usesBackend
      ? "online"
      : "browser";
  const runtimeLabel = getRuntimeLabel(project.runtime, backendStatus);

  function updateCard(clientX: number, clientY: number, strength = 1) {
    const card = cardRef.current;
    if (!card) return;

    const rect = card.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    const rotateY = (x - 0.5) * 7 * strength;
    const rotateX = (0.5 - y) * 6 * strength;
    const shadowX = (0.5 - x) * 22 * strength;
    const shadowY = 14 + (0.5 - y) * 12 * strength;

    card.style.setProperty("--mouse-x", `${x * 100}%`);
    card.style.setProperty("--mouse-y", `${y * 100}%`);
    card.style.setProperty("--rotate-x", `${rotateX}deg`);
    card.style.setProperty("--rotate-y", `${rotateY}deg`);
    card.style.setProperty("--shadow-x", `${shadowX}px`);
    card.style.setProperty("--shadow-y", `${shadowY}px`);
    card.dataset.active = "true";
  }

  function resetCard() {
    const card = cardRef.current;
    if (!card) return;

    card.style.setProperty("--mouse-x", "50%");
    card.style.setProperty("--mouse-y", "50%");
    card.style.setProperty("--rotate-x", "0deg");
    card.style.setProperty("--rotate-y", "0deg");
    card.style.setProperty("--shadow-x", "0px");
    card.style.setProperty("--shadow-y", "16px");
    card.dataset.active = "false";
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLAnchorElement>) {
    pointer.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      active: true,
    };

    if (event.pointerType !== "mouse") {
      event.currentTarget.setPointerCapture(event.pointerId);
      updateCard(event.clientX, event.clientY, 0.8);
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLAnchorElement>) {
    if (event.pointerType === "mouse") {
      updateCard(event.clientX, event.clientY);
      return;
    }

    if (!pointer.current.active || pointer.current.id !== event.pointerId) return;

    const distance = Math.hypot(
      event.clientX - pointer.current.startX,
      event.clientY - pointer.current.startY
    );
    if (distance > 9) pointer.current.moved = true;
    updateCard(event.clientX, event.clientY, 0.8);
  }

  function finishPointer(event: ReactPointerEvent<HTMLAnchorElement>) {
    if (pointer.current.id === event.pointerId) {
      suppressNextClick.current = pointer.current.moved;
      pointer.current.active = false;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resetCard();
  }

  const initialStyle: CardStyle = {
    "--mouse-x": "50%",
    "--mouse-y": "50%",
    "--rotate-x": "0deg",
    "--rotate-y": "0deg",
    "--shadow-x": "0px",
    "--shadow-y": "16px",
  };

  return (
    <Link
      ref={cardRef}
      href={project.href}
      className="project-card group flex min-h-[22rem] touch-pan-y flex-col p-4"
      style={initialStyle}
      data-backend={backendUnavailable ? "offline" : "available"}
      data-active="false"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse" && !pointer.current.active) resetCard();
      }}
      onClick={(event) => {
        if (suppressNextClick.current) {
          event.preventDefault();
          suppressNextClick.current = false;
        }
      }}
    >
      <div className="project-card__preview">
        <Preview type={project.preview} />
      </div>

      <div className="project-card__content flex flex-1 flex-col">
        <div className="mt-5 flex flex-wrap items-start justify-between gap-3">
          <h3 className="project-title text-xl font-semibold">
            {project.title}
          </h3>
          <span
            className="runtime-badge rounded-full px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em]"
            data-state={runtimeState}
          >
            {runtimeLabel}
          </span>
        </div>

        <p className="project-summary mt-2 text-sm leading-6">{project.summary}</p>

        <div className="mt-5 flex flex-wrap gap-2">
          {project.tech.slice(0, 3).map((item) => (
            <span
              key={item}
              className="project-tag rounded-full px-3 py-1 text-xs font-medium"
            >
              {item}
            </span>
          ))}
          {project.tech.length > 3 && (
            <span className="project-tag rounded-full px-3 py-1 text-xs font-medium">
              +{project.tech.length - 3}
            </span>
          )}
        </div>

        <div className="mt-auto pt-6">
          <span className="project-action inline-flex rounded-xl px-4 py-2 text-sm font-semibold transition">
            {project.action} <span className="ml-2" aria-hidden="true">→</span>
          </span>
        </div>
      </div>
    </Link>
  );
}

function getRuntimeLabel(
  runtime: ProjectRuntime,
  backendStatus: BackendStatus
) {
  if (runtime === "browser") return "Runs in browser";
  if (runtime === "backend") {
    return backendStatus === "online" ? "Live service online" : "Live service offline";
  }
  return backendStatus === "online"
    ? "Browser + live service"
    : "Browser mode available";
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

function Preview({ type }: { type: Project["preview"] }) {
  if (type === "terminal") {
    return (
      <div className="grid h-44 grid-cols-[1.15fr_0.85fr] overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 font-mono text-xs text-cyan-200">
        <div className="border-r border-slate-800 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex gap-1.5">
              <span className="h-2 w-2 rounded-full bg-slate-700" />
              <span className="h-2 w-2 rounded-full bg-slate-700" />
              <span className="h-2 w-2 rounded-full bg-slate-700" />
            </div>
            <span className="text-[9px] uppercase tracking-[0.18em] text-cyan-300/60">
              Python · 15+
            </span>
          </div>
          <pre className="leading-5 text-cyan-300/80">{`> mode nebula

   .  *     .       *
 ~~~\\___/~~~~~\\___/~~
   .*  ANSI FIELD  *.
  [stream: live]`}</pre>
        </div>

        <div className="relative flex flex-col p-4">
          <span className="text-right text-[9px] uppercase tracking-[0.18em] text-violet-300/70">
            Rust/WASM · 30+
          </span>
          <div className="mt-4 grid flex-1 grid-cols-7 content-center gap-1">
            {[
              0, 0, 1, 0, 1, 0, 0,
              0, 1, 1, 1, 1, 1, 0,
              1, 1, 2, 1, 2, 1, 1,
              0, 1, 1, 1, 1, 1, 0,
              0, 0, 1, 2, 1, 0, 0,
              0, 1, 0, 1, 0, 1, 0,
            ].map((cell, index) => (
              <span
                key={index}
                className={`aspect-square rounded-[2px] ${
                  cell === 2
                    ? "bg-amber-300 shadow-[0_0_7px_rgba(252,211,77,.65)]"
                    : cell === 1
                      ? "bg-violet-400/80"
                      : "bg-slate-900"
                }`}
              />
            ))}
          </div>
        </div>
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

  if (type === "toolbox") {
    return (
      <div className="grid h-44 grid-cols-2 gap-3 rounded-3xl border border-slate-800 bg-slate-950 p-4">
        {["Electron shells", "Even divisions", "Quick audio", "More scripts"].map((item) => (
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
