"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const BACKEND_URL = process.env.NEXT_PUBLIC_RHYTHM_SYNC_WS_URL ?? null;
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

const DEFAULT_STATE = {
  phase: "LOBBY",
  timer: 0,
  match_time: 0,
  connected: 0,
  ready: 0,
  round_number: 1,
  rounds_to_win: 2,
  round_winner: null,
  match_winner: null,
  last_roll: null,
  beat_interval_ms: 800,
  beat_index: 0,
  wild_west: false,
  wild_west_votes: 0,
  mode: "MULTIPLAYER",
  campaign: null,
  campaign_complete: false,
  server_time: 0,
};

const DEFAULT_CAMPAIGN_MAP = [
  { index: 0, act: 1, stage: 1, title: "Dusty Nerves", opponent_name: "Nervous Ned", personality: "panic", personality_label: "Panic", is_boss: false, status: "current" },
  { index: 1, act: 1, stage: 2, title: "The Backstep Kid", opponent_name: "Backstep Billy", personality: "coward", personality_label: "Coward", is_boss: true, status: "locked" },
  { index: 2, act: 2, stage: 3, title: "Red Dirt Bruiser", opponent_name: "Mason Graves", personality: "brawler", personality_label: "Brawler", is_boss: false, status: "locked" },
  { index: 3, act: 2, stage: 4, title: "The Sandstorm", opponent_name: "Clara Ironhand", personality: "brawler", personality_label: "Brawler", is_boss: true, status: "locked", wild_west: true },
  { index: 4, act: 3, stage: 5, title: "Quiet Barrel", opponent_name: "Elias Crow", personality: "deadeye", personality_label: "Deadeye", is_boss: false, status: "locked" },
  { index: 5, act: 3, stage: 6, title: "The Last Bell", opponent_name: "The Bellringer", personality: "legend", personality_label: "Legend", is_boss: true, status: "locked", wild_west: true },
];

const PERSONALITY = {
  panic: {
    label: "Panic",
    short: "jittery timing",
    marker: "⚡",
    sky: "from-[#3a1618] via-[#4a241b] to-[#090d16]",
    accent: "text-amber-300",
    glow: "rgba(251, 191, 36, 0.35)",
  },
  coward: {
    label: "Coward",
    short: "backs away",
    marker: "♟",
    sky: "from-[#281a12] via-[#2a201a] to-[#090d16]",
    accent: "text-amber-200",
    glow: "rgba(251, 191, 36, 0.25)",
  },
  brawler: {
    label: "Brawler",
    short: "rushes tempo",
    marker: "✹",
    sky: "from-[#431411] via-[#3a2013] to-[#090d16]",
    accent: "text-orange-300",
    glow: "rgba(249, 115, 22, 0.35)",
  },
  deadeye: {
    label: "Deadeye",
    short: "clean aim",
    marker: "◎",
    sky: "from-[#112536] via-[#17202a] to-[#090d16]",
    accent: "text-cyan-200",
    glow: "rgba(103, 232, 249, 0.22)",
  },
  legend: {
    label: "Legend",
    short: "shifts style",
    marker: "◈",
    sky: "from-[#24143d] via-[#22191e] to-[#090d16]",
    accent: "text-purple-200",
    glow: "rgba(216, 180, 254, 0.25)",
  },
};

function resolveBackend() {
  if (BACKEND_URL) return BACKEND_URL;

  try {
    const url = new URL(API_BASE_URL);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/api/rhythm-sync/ws";
    url.search = "";
    return url.toString();
  } catch {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/api/rhythm-sync/ws`;
  }
}

function formatTime(seconds) {
  const safe = Math.max(0, Math.floor(seconds ?? 0));
  const mm = Math.floor(safe / 60).toString().padStart(2, "0");
  const ss = (safe % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function bpmFromInterval(ms) {
  return Math.round(60000 / Math.max(1, ms || 800));
}

function tempoLabel(ms) {
  const bpm = bpmFromInterval(ms);
  if (bpm >= 135) return "Fast";
  if (bpm >= 100) return "Tense";
  if (bpm >= 85) return "Medium";
  return "Slow";
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function statusFor(player, nowMs = 0) {
  if (!player) return "Waiting";
  if (player.is_reloading) return "Reloading";
  if ((player.taunt_until ?? 0) * 1000 > nowMs) return "Blinded";

  const acc = player.accuracy ?? 0;
  const nerves = player.nerves ?? 0;
  if (acc >= 80 && nerves < 55) return "Dangerous";
  if (nerves >= 75) return "Rattled";
  if (acc >= 50) return "Aiming";
  return "Settling";
}

function intentFor(opponent, nowMs = 0) {
  if (!opponent) return "Waiting";
  if (opponent.is_reloading) return "Reloading";
  if ((opponent.taunt_until ?? 0) * 1000 > nowMs) return "Disrupted";

  const acc = opponent.accuracy ?? 0;
  const nerves = opponent.nerves ?? 0;
  if (acc >= 78 && nerves < 55) return "Likely to draw";
  if (acc >= 55) return "Building aim";
  if (nerves >= 75) return "Losing control";
  if (nerves >= 45) return "Pressure rising";
  return "Watching";
}

function phaseTitle(phase) {
  return String(phase || "LOBBY").replaceAll("_", " ");
}

function useRhythmSocket() {
  const [gameState, setGameState] = useState(DEFAULT_STATE);
  const [players, setPlayers] = useState([]);
  const [myId, setMyId] = useState(null);
  const [history, setHistory] = useState([]);
  const [notification, setNotification] = useState("");
  const [beatIndex, setBeatIndex] = useState(0);
  const [beatIntervalMs, setBeatIntervalMs] = useState(800);
  const [clientNowMs, setClientNowMs] = useState(0);
  const [connection, setConnection] = useState({ status: "connecting", url: "" });

  const socketRef = useRef(null);
  const notifTimerRef = useRef(null);
  const clientNowMsRef = useRef(0);
  const mountedRef = useRef(false);

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      clientNowMsRef.current = now;
      setClientNowMs(now);
    };

    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    const url = resolveBackend();
    const socket = new WebSocket(url);
    socketRef.current = socket;
    setConnection({ status: "connecting", url });

    socket.onopen = () => setConnection({ status: "online", url });
    socket.onerror = () => setConnection({ status: "warning", url });
    socket.onclose = () => setConnection((prev) => ({ ...prev, status: "closed" }));

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.players) setPlayers(data.players);

      switch (data.type) {
        case "INIT":
          setMyId(data.id);
          break;
        case "STATE_UPDATE":
        case "ACTION_RESOLVED":
        case "ROLL_START":
          if (data.state) {
            setGameState({
              ...data.state,
              server_time: data.server_time ?? data.state.server_time ?? clientNowMsRef.current / 1000,
            });
          }
          break;
        case "BEAT":
          setBeatIndex(data.beat_index ?? 0);
          if (data.interval_ms) setBeatIntervalMs(data.interval_ms);
          break;
        case "NOTIFY":
          setNotification(data.msg ?? "");
          if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
          notifTimerRef.current = setTimeout(() => setNotification(""), 3000);
          break;
        case "HISTORY":
          setHistory(data.history || []);
          break;
        case "REJECTED":
          setNotification(data.reason ?? "Connection refused.");
          break;
        default:
          break;
      }
    };

    return () => {
      if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
      socket.close();
      socketRef.current = null;
      mountedRef.current = false;
    };
  }, []);

  const send = (payload) => {
    const sock = socketRef.current;
    if (sock?.readyState === WebSocket.OPEN) {
      sock.send(JSON.stringify(payload));
    }
  };

  const actions = useMemo(
    () => ({
      send,
      setName: (name) => send({ type: "SET_NAME", name }),
      startCampaign: () => send({ type: "START_CAMPAIGN", stage_index: 0 }),
      nextCampaign: () => send({ type: "NEXT_CAMPAIGN" }),
      restartCampaign: () => send({ type: "RESTART_CAMPAIGN" }),
      exitCampaign: () => send({ type: "EXIT_CAMPAIGN" }),
      ready: () => send({ type: "READY" }),
      restart: () => send({ type: "RESTART_MATCH" }),
      tap: () => send({ type: "TAP" }),
      shoot: () => send({ type: "SHOOT" }),
      taunt: () => send({ type: "TAUNT" }),
      voteWildWest: (value) => send({ type: "VOTE_WILD_WEST", value }),
      getHistory: () => send({ type: "GET_HISTORY" }),
    }),
    []
  );

  return {
    gameState,
    players,
    myId,
    history,
    notification,
    beatIndex,
    beatIntervalMs,
    clientNowMs,
    actions,
  };
}

export default function RhythmSyncApp() {
  const {
    gameState,
    players,
    myId,
    history,
    notification,
    beatIndex,
    beatIntervalMs,
    clientNowMs,
    actions,
  } = useRhythmSocket();

  const [historyOpen, setHistoryOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const shellRef = useRef(null);
  const pressedKeys = useRef(new Set());
  const phaseRef = useRef(gameState.phase);

  const me = useMemo(() => players.find((p) => p.id === myId) ?? null, [players, myId]);
  const opponent = useMemo(() => players.find((p) => p.id !== myId) ?? null, [players, myId]);

  const isLobby = gameState.phase === "LOBBY" || gameState.phase === "READY_UP";
  const isPlaying = gameState.phase === "PLAYING";
  const isRolling = gameState.phase === "ROLLING";
  const isRoundOver = gameState.phase === "ROUND_OVER";
  const isMatchOver = gameState.phase === "MATCH_OVER";
  const isCampaign = gameState.mode === "CAMPAIGN";
  const campaignInfo = gameState.campaign;
  const nowMs = clientNowMs || (gameState.server_time ?? 0) * 1000;

  const canTaunt =
    me &&
    isPlaying &&
    !me.is_reloading &&
    (me.accuracy ?? 0) >= 20 &&
    (me.taunt_ready_at ?? 0) * 1000 <= nowMs;

  useEffect(() => {
    phaseRef.current = gameState.phase;
  }, [gameState.phase]);

  useEffect(() => {
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    const onKeyDown = async (event) => {
      if (event.code !== "KeyF" || event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      await toggleFullscreen();
    };

    document.addEventListener("fullscreenchange", onFullscreen);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreen);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    const onDown = (event) => {
      if (pressedKeys.current.has(event.code)) return;
      pressedKeys.current.add(event.code);

      if (phaseRef.current !== "PLAYING") return;

      if (event.code === "Space") {
        event.preventDefault();
        actions.tap();
      } else if (event.code === "Enter") {
        event.preventDefault();
        actions.shoot();
      } else if (event.code === "KeyT") {
        actions.taunt();
      }
    };
    const onUp = (event) => pressedKeys.current.delete(event.code);

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [actions]);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await shellRef.current?.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (error) {
      console.warn("Fullscreen request failed:", error);
    }
  };

  const openHistory = () => {
    actions.getHistory();
    setHistoryOpen(true);
  };

  return (
    <div
      ref={shellRef}
      className="relative min-h-screen overflow-hidden bg-[#0b1018] text-slate-100"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(251,191,36,.08),transparent_28rem),linear-gradient(180deg,rgba(15,23,42,.7),rgba(2,6,23,.92))]" />

      {isLobby ? (
        <MainMenu
          me={me}
          gameState={gameState}
          fullscreen={fullscreen}
          onFullscreen={toggleFullscreen}
          onCampaign={actions.startCampaign}
          onReady={actions.ready}
          onSetName={actions.setName}
          onTutorial={() => setTutorialOpen(true)}
          onHistory={openHistory}
          onWildWest={(value) => actions.voteWildWest(value)}
        />
      ) : (
        <DuelScreen
          me={me}
          opponent={opponent}
          gameState={gameState}
          campaignInfo={campaignInfo}
          beatIndex={beatIndex}
          beatIntervalMs={beatIntervalMs}
          nowMs={nowMs}
          isRolling={isRolling}
          isRoundOver={isRoundOver}
          isMatchOver={isMatchOver}
          isCampaign={isCampaign}
          canTaunt={canTaunt}
          fullscreen={fullscreen}
          notification={notification}
          players={players}
          onFullscreen={toggleFullscreen}
          onHistory={openHistory}
          onTutorial={() => setTutorialOpen(true)}
          onExitCampaign={actions.exitCampaign}
          onRestart={actions.restart}
          onTap={actions.tap}
          onShoot={actions.shoot}
          onTaunt={actions.taunt}
          onNextCampaign={actions.nextCampaign}
          onRestartCampaign={actions.restartCampaign}
        />
      )}

      {notification && isLobby && (
        <div className="fixed left-1/2 top-5 z-50 -translate-x-1/2 rounded-full border border-amber-700/60 bg-[#1b1208]/95 px-5 py-2 text-sm font-bold text-amber-200 shadow-2xl">
          {notification}
        </div>
      )}

      <HistoryModal isOpen={historyOpen} onClose={() => setHistoryOpen(false)} history={history} />
      <TutorialModal isOpen={tutorialOpen} onClose={() => setTutorialOpen(false)} />

      <style>{`
        @keyframes sandshake {
          0%, 100% { transform: translate(-50%, -50%); }
          20% { transform: translate(calc(-50% - 4px), calc(-50% + 2px)); }
          40% { transform: translate(calc(-50% + 4px), calc(-50% - 2px)); }
          60% { transform: translate(calc(-50% - 2px), calc(-50% + 1px)); }
          80% { transform: translate(calc(-50% + 2px), calc(-50% - 1px)); }
        }
      `}</style>
    </div>
  );
}

function MainMenu({
  me,
  gameState,
  fullscreen,
  onFullscreen,
  onCampaign,
  onReady,
  onSetName,
  onTutorial,
  onHistory,
  onWildWest,
}) {
  const [nameDraft, setNameDraft] = useState(me?.name ?? "");

  useEffect(() => {
    setNameDraft(me?.name ?? "");
  }, [me?.name]);

  const canReady = gameState.connected >= 2 && !me?.ready;
  const tempo = `${tempoLabel(gameState.beat_interval_ms)} · ${bpmFromInterval(gameState.beat_interval_ms)} BPM`;
  const wildWestOn = me?.vote_wild_west ?? false;

  const submitName = () => {
    const value = nameDraft.trim().slice(0, 20);
    if (value && value !== me?.name) onSetName(value);
  };

  return (
    <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-5 md:px-8">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.45em] text-amber-400">OJ Builds playable project</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white md:text-5xl">Rhythm Sync</h1>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill label={`${gameState.connected ?? 0}/2 online`} />
          <StatusPill label={tempo} muted />
          <button
            onClick={onFullscreen}
            className="rounded-xl border border-slate-700 bg-slate-900/75 px-4 py-2 text-sm font-bold text-slate-200 hover:border-amber-500/70 hover:text-amber-200"
          >
            {fullscreen ? "Exit Fullscreen" : "Fullscreen"}
          </button>
        </div>
      </header>

      <section className="my-auto grid gap-4 py-8">
        <div className="rounded-[2rem] border border-slate-700 bg-slate-900/70 p-5 shadow-2xl backdrop-blur md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <label className="flex-1">
              <span className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-500">Gunslinger name</span>
              <input
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && submitName()}
                maxLength={20}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-[#080d19] px-4 py-3 text-lg font-bold text-white outline-none transition focus:border-amber-500"
                placeholder="Gunslinger"
              />
            </label>
            <button
              onClick={submitName}
              className="rounded-xl bg-slate-700 px-5 py-3 text-sm font-black uppercase tracking-widest text-slate-100 hover:bg-slate-600"
            >
              Set
            </button>
          </div>
        </div>

        <MenuAction
          label="Campaign"
          title="Single Player"
          text="Duel the AI ladder. Best mode for the portfolio because it works without waiting for a second browser."
          action="Start Campaign"
          accent="amber"
          onClick={onCampaign}
        />

        <MenuAction
          label="Multiplayer"
          title="Two Player Duel"
          text="Ready up when a second active player is connected. Extra tabs should remain spectators instead of breaking the room."
          action={canReady ? "Ready Up" : me?.ready ? "Ready" : "Waiting for opponent"}
          disabled={!canReady}
          onClick={onReady}
        />

        <button
          onClick={() => !me?.ready && onWildWest(!wildWestOn)}
          disabled={me?.ready}
          className={`rounded-[1.5rem] border p-5 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
            wildWestOn
              ? "border-amber-500/80 bg-gradient-to-br from-amber-900/45 via-red-950/35 to-slate-950 shadow-[0_0_30px_rgba(245,158,11,.12)]"
              : "border-red-900/60 bg-red-950/15 hover:border-amber-500/60"
          }`}
          aria-label="Toggle Wild West"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className={`text-[10px] font-black uppercase tracking-[0.35em] ${wildWestOn ? "text-amber-300" : "text-red-300"}`}>Hard mode</p>
              <h2 className="mt-2 text-2xl font-black text-white">Wild West</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">Faster tempo and tighter hit windows. In multiplayer both players vote; campaign bosses can force it.</p>
            </div>
            <div className={`relative mt-1 h-8 w-16 shrink-0 overflow-hidden rounded-full border transition ${wildWestOn ? "border-amber-400 bg-amber-500/30" : "border-slate-700 bg-slate-900/80"}`}>
              <span className={`absolute left-1 top-1 h-6 w-6 rounded-full transition-transform ${wildWestOn ? "translate-x-8 bg-amber-300 shadow-[0_0_18px_rgba(251,191,36,.75)]" : "translate-x-0 bg-slate-500"}`} />
            </div>
          </div>
          <div className={`mt-4 rounded-xl border px-4 py-3 text-sm font-black uppercase tracking-[0.25em] transition ${wildWestOn ? "border-amber-500/60 bg-amber-500/12 text-amber-200" : "border-slate-800 bg-slate-950/55 text-slate-400"}`}>
            {wildWestOn ? "Wild West voted on" : "Wild West off"}
          </div>
        </button>

        <div className="grid gap-3 md:grid-cols-3">
          <button onClick={onTutorial} className="rounded-[1.25rem] border border-slate-700 bg-slate-900/60 px-5 py-4 text-left hover:border-amber-500/60">
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-500">Tutorial</p>
            <p className="mt-1 text-lg font-black text-white">How to Duel</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">Rules, rhythm timing, nerves, taunts, and how the shot roll works.</p>
          </button>
          <button onClick={onHistory} className="rounded-[1.25rem] border border-slate-700 bg-slate-900/60 px-5 py-4 text-left hover:border-amber-500/60">
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-500">Past Duels</p>
            <p className="mt-1 text-lg font-black text-white">Match History</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">Open saved duel results and see who won earlier matches.</p>
          </button>
          <a href="/" className="rounded-[1.25rem] border border-slate-700 bg-slate-900/60 px-5 py-4 text-left hover:border-amber-500/60">
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-500">Portfolio</p>
            <p className="mt-1 text-lg font-black text-white">Back to Projects</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">Leave the saloon and return to the main portfolio page.</p>
          </a>
        </div>
      </section>
    </main>
  );
}

function MenuAction({ label, title, text, action, accent = "slate", disabled = false, onClick }) {
  const isAmber = accent === "amber";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`group rounded-[1.75rem] border p-5 text-left transition md:p-6 ${
        isAmber
          ? "border-amber-700/80 bg-gradient-to-br from-amber-950/45 via-slate-900/80 to-slate-950 hover:border-amber-400"
          : "border-slate-700 bg-slate-900/60 hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-55"
      }`}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className={`text-[10px] font-black uppercase tracking-[0.4em] ${isAmber ? "text-amber-300" : "text-slate-500"}`}>{label}</p>
          <h2 className="mt-2 text-3xl font-black text-white">{title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{text}</p>
        </div>
        <div className={`rounded-xl px-5 py-3 text-sm font-black uppercase tracking-widest ${isAmber ? "bg-amber-500 text-slate-950 group-hover:bg-amber-300" : "bg-slate-800 text-slate-200"}`}>
          {action}
        </div>
      </div>
    </button>
  );
}

function DuelScreen({
  me,
  opponent,
  gameState,
  campaignInfo,
  beatIndex,
  beatIntervalMs,
  nowMs,
  isRolling,
  isRoundOver,
  isMatchOver,
  isCampaign,
  canTaunt,
  fullscreen,
  notification,
  players,
  onFullscreen,
  onHistory,
  onTutorial,
  onExitCampaign,
  onRestart,
  onTap,
  onShoot,
  onTaunt,
  onNextCampaign,
  onRestartCampaign,
}) {
  const personalityKey = opponent?.ai_personality ?? campaignInfo?.personality ?? "panic";
  const meta = PERSONALITY[personalityKey] ?? PERSONALITY.panic;
  const tempo = `${tempoLabel(beatIntervalMs)} · ${bpmFromInterval(beatIntervalMs)} BPM`;

  return (
    <main className="relative z-10 mx-auto flex h-screen w-full max-w-[1400px] flex-col gap-3 px-3 py-3 md:px-5">
      <header className="flex shrink-0 items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={onHistory} className="rounded-xl border border-slate-700 bg-slate-900/75 px-3 py-2 text-xs font-bold text-slate-200 hover:border-amber-500/70">Past Duels</button>
          <button onClick={onTutorial} className="rounded-xl border border-slate-700 bg-slate-900/75 px-3 py-2 text-xs font-bold text-amber-300 hover:border-amber-500/70">?</button>
          <button onClick={onFullscreen} className="rounded-xl border border-slate-700 bg-slate-900/75 px-3 py-2 text-xs font-bold text-slate-200 hover:border-amber-500/70">{fullscreen ? "Exit Fullscreen" : "Fullscreen"}</button>
          {isCampaign && <button onClick={onExitCampaign} className="rounded-xl border border-red-900/70 bg-red-950/35 px-3 py-2 text-xs font-bold text-red-200 hover:bg-red-900/50">Exit Campaign</button>}
        </div>
        <div className="flex items-center gap-2">
          <StatusPill label={isCampaign ? "Campaign" : `${gameState.connected}/2 online`} />
          <StatusPill label={tempo} muted />
          {campaignInfo && <StatusPill label={`Act ${campaignInfo.act}`} accent />}
        </div>
      </header>

      <CompactHud me={me} opponent={opponent} gameState={gameState} nowMs={nowMs} />

      <section className={`relative min-h-0 flex-1 overflow-hidden rounded-[2rem] border border-slate-700 bg-gradient-to-b ${meta.sky} shadow-2xl`}>
        <WesternScene
          meta={meta}
          me={me}
          opponent={opponent}
          gameState={gameState}
          campaignInfo={campaignInfo}
          beatIndex={beatIndex}
          beatIntervalMs={beatIntervalMs}
          nowMs={nowMs}
        />

        <MeterRail side="left" label="Accuracy" value={me?.accuracy ?? 0} />
        <MeterRail side="right" label="Nerves" value={me?.nerves ?? 0} nerves />

        <div className="absolute left-1/2 top-4 z-30 -translate-x-1/2">
          {notification && <div className="rounded-full border border-amber-700/70 bg-[#1b1208]/90 px-5 py-2 text-sm font-black text-amber-200 shadow-2xl">{notification}</div>}
        </div>

        {gameState.phase === "COUNTDOWN" && (
          <div className="absolute inset-0 z-40 grid place-items-center bg-black/20 backdrop-blur-[1px]">
            <div className="text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.45em] text-amber-300">Round starts</p>
              <p className="text-8xl font-black tabular-nums text-white drop-shadow-[0_0_22px_rgba(251,191,36,.45)]">{gameState.timer}</p>
            </div>
          </div>
        )}

        {isRolling && gameState.last_roll && <RollOverlay roll={gameState.last_roll} players={players} myId={me?.id} />}

        {isRoundOver && gameState.last_roll && <RoundOverlay gameState={gameState} myId={me?.id} />}

        <CombatControls
          phase={gameState.phase}
          canTaunt={canTaunt}
          reloading={me?.is_reloading}
          onTap={onTap}
          onShoot={onShoot}
          onTaunt={onTaunt}
        />
      </section>

      {isMatchOver && (
        <MatchOverlay
          isCampaign={isCampaign}
          campaignInfo={campaignInfo}
          gameState={gameState}
          me={me}
          opponent={opponent}
          onRestart={onRestart}
          onExitCampaign={onExitCampaign}
          onNextCampaign={onNextCampaign}
          onRestartCampaign={onRestartCampaign}
        />
      )}
    </main>
  );
}

function CompactHud({ me, opponent, gameState, nowMs }) {
  const roundsToWin = gameState.rounds_to_win ?? 2;

  return (
    <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/65 px-4 py-3 shadow-xl">
      <FighterSummary player={me} fallback="You" align="left" nowMs={nowMs} roundsToWin={roundsToWin} />
      <div className="min-w-[8rem] text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.32em] text-slate-500">Round {gameState.round_number} / {roundsToWin * 2 - 1}</p>
        <p className="mt-1 font-mono text-2xl font-black text-amber-300">{formatTime(gameState.match_time)}</p>
        <p className="mt-1 text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">{phaseTitle(gameState.phase)}</p>
      </div>
      <FighterSummary player={opponent} fallback="Opponent" align="right" nowMs={nowMs} roundsToWin={roundsToWin} />
    </div>
  );
}

function FighterSummary({ player, fallback, align, nowMs, roundsToWin }) {
  const right = align === "right";
  return (
    <div className={`flex flex-col ${right ? "items-end text-right" : "items-start"}`}>
      <p className="max-w-[16rem] truncate text-sm font-black uppercase tracking-tight text-white">{player?.name ?? fallback}</p>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">{statusFor(player, nowMs)}</p>
      <div className={`mt-2 flex gap-1 ${right ? "flex-row-reverse" : ""}`}>
        {Array.from({ length: roundsToWin }).map((_, index) => (
          <span key={index} className={`h-2.5 w-2.5 rounded-full border ${index < (player?.round_wins ?? 0) ? "border-amber-300 bg-amber-300" : "border-slate-600 bg-slate-900"}`} />
        ))}
      </div>
    </div>
  );
}

function WesternScene({ meta, me, opponent, gameState, campaignInfo, beatIndex, beatIntervalMs, nowMs }) {
  const opponentIntent = intentFor(opponent, nowMs);
  const opponentTaunted = (opponent?.taunt_until ?? 0) * 1000 > nowMs;
  const danger = (opponent?.accuracy ?? 0) > 70 && (opponent?.nerves ?? 0) < 65;

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_8%,rgba(251,191,36,.35),transparent_14rem),linear-gradient(to_bottom,rgba(251,191,36,.08),rgba(30,18,12,.6)_45%,rgba(9,7,6,.95))]" />
      <div className="absolute inset-x-0 top-[18%] h-px bg-amber-900/50" />
      <div className="absolute left-1/2 top-[4%] h-24 w-24 -translate-x-1/2 rounded-full bg-amber-300/75 blur-sm" />
      <div className="absolute left-1/2 top-[6%] h-16 w-16 -translate-x-1/2 rounded-full bg-amber-100/80" />
      <Birds />

      <TownSide side="left" />
      <TownSide side="right" />

      <div className="absolute bottom-0 left-1/2 h-[74%] w-[58%] -translate-x-1/2 bg-[#17100c] [clip-path:polygon(43%_0,57%_0,100%_100%,0_100%)]" />
      <div className="absolute bottom-0 left-1/2 h-[74%] w-[46%] -translate-x-1/2 bg-[linear-gradient(to_bottom,rgba(146,64,14,.14),rgba(0,0,0,.22))] [clip-path:polygon(43%_0,57%_0,100%_100%,0_100%)]" />
      <div className="absolute bottom-[29%] left-0 h-px w-full bg-amber-900/40" />
      <div className="absolute bottom-[29%] left-[18%] h-px w-[18%] bg-amber-800/35" />
      <div className="absolute bottom-[29%] right-[18%] h-px w-[18%] bg-amber-800/35" />
      <div className="absolute bottom-[17%] left-[11%] h-px w-[30%] -rotate-[12deg] bg-amber-800/35" />
      <div className="absolute bottom-[17%] right-[11%] h-px w-[30%] rotate-[12deg] bg-amber-800/35" />

      <div className="absolute left-6 top-6 z-20 max-w-[18rem]">
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-300">Across the street</p>
        <h2 className="mt-2 text-3xl font-black text-white drop-shadow-lg">{opponent?.name ?? "No opponent"}</h2>
        <p className="mt-1 text-sm text-slate-300">{campaignInfo?.title ?? meta.short}</p>
      </div>

      <div className="absolute right-6 top-6 z-20 rounded-2xl border border-slate-700/80 bg-black/35 px-4 py-3 text-right backdrop-blur-sm">
        <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-500">Intent</p>
        <p className={`mt-1 text-sm font-black ${danger ? "text-red-300" : "text-amber-300"}`}>{opponentIntent}</p>
      </div>

      <div className="absolute left-1/2 top-[34%] z-20 -translate-x-1/2 -translate-y-1/2">
        <RhythmTarget
          beatIndex={beatIndex}
          beatIntervalMs={beatIntervalMs}
          tapQuality={me?.last_tap_quality ?? "none"}
          tapCounter={me?.tap_counter ?? 0}
          isReloading={me?.is_reloading}
          phase={gameState.phase}
          opponent={opponent}
          meta={meta}
          danger={danger}
          taunted={opponentTaunted}
        />
      </div>

      <div className="absolute bottom-5 left-1/2 z-20 grid w-[min(92%,64rem)] -translate-x-1/2 grid-cols-3 gap-2">
        <MiniRead label="Focus" value={opponent?.accuracy ?? 0} hint={(opponent?.accuracy ?? 0) > 65 ? "aim forming" : "low"} />
        <MiniRead label="Heat" value={opponent?.nerves ?? 0} hint={(opponent?.nerves ?? 0) > 65 ? "unstable" : "calm"} />
        <MiniRead label="Style" value={meta.label} hint={meta.short} text />
      </div>
    </div>
  );
}

function RhythmTarget({ beatIndex, beatIntervalMs, tapQuality, tapCounter, isReloading, phase, opponent, meta, danger, taunted }) {
  const ringRef = useRef(null);
  const labelRef = useRef(null);
  const stateRef = useRef({ lastBeatAt: 0, beatIntervalMs: 800, flash: null, flashStart: 0, beatsSeen: 0, active: false });

  const active = phase === "PLAYING" && !isReloading;

  useEffect(() => {
    stateRef.current.beatIntervalMs = beatIntervalMs;
    stateRef.current.active = active;
  }, [beatIntervalMs, active]);

  useEffect(() => {
    if (active && beatIndex > 0) {
      stateRef.current.lastBeatAt = performance.now();
      stateRef.current.beatsSeen = beatIndex;
    }
  }, [beatIndex, active]);

  useEffect(() => {
    if (tapCounter > 0 && tapQuality && tapQuality !== "none") {
      stateRef.current.flash = tapQuality;
      stateRef.current.flashStart = performance.now();
    }
  }, [tapCounter, tapQuality]);

  useEffect(() => {
    let raf;
    const loop = () => {
      const s = stateRef.current;
      const now = performance.now();
      const elapsed = s.lastBeatAt > 0 ? now - s.lastBeatAt : 0;
      const progress = s.active && s.lastBeatAt > 0 ? Math.min(elapsed / s.beatIntervalMs, 1) : 0;
      const display = s.active ? progress : 0;
      const scale = 1.75 - display * 0.75;
      const opacity = s.active ? 0.42 + (1 - display) * 0.42 : 0.32;
      const flashActive = s.flash && now - s.flashStart < 550;
      const color = flashActive ? qualityColor(s.flash) : danger ? "#f87171" : "#f59e0b";

      if (ringRef.current) {
        ringRef.current.style.transform = `translate(-50%, -50%) scale(${scale})`;
        ringRef.current.style.opacity = opacity;
        ringRef.current.style.borderColor = color;
        ringRef.current.style.boxShadow = display > 0.82 ? `0 0 30px ${color}` : "none";
      }

      if (labelRef.current) {
        labelRef.current.textContent = flashActive ? qualityText(s.flash) : s.active && s.beatsSeen < 4 ? "tap as ring meets target" : "";
        labelRef.current.style.color = flashActive ? color : "#94a3b8";
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [danger]);

  return (
    <div className={`relative h-52 w-52 ${taunted ? "animate-[sandshake_.6s_ease-out]" : ""}`}>
      <div className="absolute left-1/2 top-1/2 h-36 w-36 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-200/25 bg-slate-950/10 backdrop-blur-[1px]" />
      <div ref={ringRef} className="absolute left-1/2 top-1/2 h-36 w-36 rounded-full border-[5px] transition-[border-color,opacity]" />
      <OpponentFigure opponent={opponent} meta={meta} danger={danger} />
      <div ref={labelRef} className="absolute left-1/2 top-[104%] w-64 -translate-x-1/2 text-center text-[10px] font-black uppercase tracking-[0.3em]" />
    </div>
  );
}

function OpponentFigure({ opponent, meta, danger }) {
  return (
    <div className="absolute left-1/2 top-1/2 h-28 w-20 -translate-x-1/2 -translate-y-1/2">
      <div className={`absolute left-1/2 top-[2px] h-10 w-10 -translate-x-1/2 rounded-full bg-black ${danger ? "shadow-[0_0_18px_rgba(248,113,113,.18)]" : "shadow-[0_0_16px_rgba(251,191,36,.12)]"}`} />
      <div className="absolute left-1/2 top-0 h-3 w-14 -translate-x-1/2 rounded-full bg-black" />
      <div className="absolute left-1/2 top-[10px] h-3 w-20 -translate-x-1/2 rounded-full bg-black/95" />
      <div className="absolute left-1/2 top-9 h-16 w-14 -translate-x-1/2 rounded-t-[1.8rem] rounded-b-sm bg-black shadow-xl" />
      <div className="absolute left-[4px] top-11 h-11 w-3 rotate-[18deg] rounded-full bg-black" />
      <div className="absolute right-[4px] top-11 h-11 w-3 -rotate-[18deg] rounded-full bg-black" />
      <div className="absolute left-1/2 bottom-0 h-4 w-24 -translate-x-1/2 rounded-full bg-black/70 blur-sm" />
      {danger && <div className="absolute inset-x-3 top-2 h-2 rounded-full bg-red-400/20 blur-md" />}
      {opponent?.is_reloading && <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-slate-950/80 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-400">reload</div>}
    </div>
  );
}

function qualityColor(quality) {
  if (quality === "perfect") return "#fcd34d";
  if (quality === "good") return "#f59e0b";
  if (quality === "miss" || quality === "fail") return "#ef4444";
  return "#94a3b8";
}

function qualityText(quality) {
  if (quality === "perfect") return "perfect";
  if (quality === "good") return "good";
  if (quality === "miss") return "off beat";
  if (quality === "fail") return "missed beat";
  if (quality === "calibrate") return "locked in";
  return "";
}

function Birds() {
  return (
    <>
      <div className="absolute left-[23%] top-[26%] text-slate-500/70">⌒⌒</div>
      <div className="absolute left-[70%] top-[21%] text-slate-500/60">⌒</div>
      <div className="absolute left-[78%] top-[31%] text-slate-500/50">⌒⌒</div>
    </>
  );
}

function TownSide({ side }) {
  const left = side === "left";
  const buildings = left
    ? [
        { w: 16, h: 24, lift: 0 },
        { w: 22, h: 34, lift: 4 },
        { w: 28, h: 46, lift: 8 },
      ]
    : [
        { w: 14, h: 20, lift: 0 },
        { w: 18, h: 28, lift: 3 },
        { w: 23, h: 36, lift: 5 },
        { w: 28, h: 46, lift: 8 },
        { w: 34, h: 58, lift: 12 },
      ];

  return (
    <div className={`absolute bottom-[29%] ${left ? "left-[3%]" : "right-[3%]"} flex w-[32%] items-end gap-2 opacity-85 ${left ? "justify-start" : "justify-end"}`}>
      {left && <Church />}
      {buildings.map((building, index) => (
        <div
          key={index}
          className="relative bg-slate-950/90"
          style={{
            width: `${building.w}px`,
            height: `${building.h}px`,
            marginBottom: `${building.lift}px`,
            transform: `skewY(${left ? 4 : -4}deg)`,
            transformOrigin: left ? "bottom left" : "bottom right",
          }}
        >
          <div className="absolute -top-2 left-0 h-2 w-full bg-black" />
          <div className="absolute left-2 top-3 h-3 w-3 bg-amber-300/10" />
          <div className="absolute right-2 top-3 h-3 w-3 bg-amber-300/10" />
        </div>
      ))}
      {!left && <Cactus />}
    </div>
  );
}

function Church() {
  return (
    <div className="relative h-24 w-16 bg-slate-950/90">
      <div className="absolute -top-9 left-1/2 h-9 w-7 -translate-x-1/2 bg-slate-950/90" />
      <div className="absolute -top-12 left-1/2 h-4 w-1 -translate-x-1/2 bg-slate-950/90" />
      <div className="absolute -top-8 left-1/2 h-1 w-5 -translate-x-1/2 bg-slate-950/90" />
      <div className="absolute bottom-0 left-1/2 h-9 w-6 -translate-x-1/2 rounded-t-full bg-black" />
    </div>
  );
}

function Cactus() {
  return (
    <div className="relative h-20 w-8">
      <div className="absolute bottom-0 left-1/2 h-20 w-3 -translate-x-1/2 rounded-full bg-slate-950/90" />
      <div className="absolute bottom-8 left-0 h-8 w-3 rounded-full border-l-4 border-slate-950/90" />
      <div className="absolute bottom-10 right-0 h-9 w-3 rounded-full border-r-4 border-slate-950/90" />
    </div>
  );
}

function MeterRail({ side, label, value, nerves = false }) {
  const v = clampPercent(value);
  const right = side === "right";
  const color = nerves ? (v > 70 ? "bg-red-500" : v > 35 ? "bg-amber-400" : "bg-emerald-500") : "bg-gradient-to-t from-amber-700 to-amber-300";

  return (
    <div className={`absolute top-1/2 z-30 hidden -translate-y-1/2 lg:block ${right ? "right-4" : "left-4"}`}>
      <div className="rounded-2xl border border-slate-700/80 bg-slate-950/45 px-3 py-3 text-center backdrop-blur-sm">
        <p className="mb-2 text-[10px] font-black uppercase tracking-[0.25em] text-slate-300">{label}</p>
        <div className="relative mx-auto h-40 w-8 overflow-hidden rounded-lg border-2 border-slate-700 bg-slate-950 shadow-inner">
          <div className={`absolute bottom-0 left-0 w-full ${color}`} style={{ height: `${v}%` }} />
        </div>
        <p className="mt-2 font-mono text-xs text-slate-400">{Math.round(v)}%</p>
      </div>
    </div>
  );
}

function MiniRead({ label, value, hint, text = false }) {
  return (
    <div className="rounded-2xl border border-slate-800/90 bg-black/35 px-4 py-3 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">{label}</p>
        <p className="text-sm font-black text-white">{text ? value : `${Math.round(clampPercent(value))}%`}</p>
      </div>
      <p className="mt-1 truncate text-xs text-slate-400">{hint}</p>
    </div>
  );
}

function CombatControls({ phase, canTaunt, reloading, onTap, onShoot, onTaunt }) {
  if (phase !== "PLAYING") return null;

  return (
    <div className="absolute bottom-24 left-1/2 z-30 flex w-[min(92%,36rem)] -translate-x-1/2 flex-col items-center gap-2">
      <div className="grid w-full grid-cols-3 gap-3 rounded-2xl border border-slate-800/90 bg-slate-950/55 p-3 backdrop-blur-md">
        <ControlButton onClick={onTap} disabled={reloading} label="Tap" keys="Space" />
        <ControlButton onClick={onShoot} disabled={reloading} label={reloading ? "Reloading" : "Draw"} keys="Enter" primary />
        <ControlButton onClick={onTaunt} disabled={!canTaunt} label="Taunt" keys="T" danger />
      </div>
      <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-500">Taunt costs 20 accuracy · cooldown 6s</p>
    </div>
  );
}

function ControlButton({ label, keys, primary = false, danger = false, disabled, onClick }) {
  const className = primary
    ? "bg-amber-500 text-slate-950 hover:bg-amber-300"
    : danger
    ? "bg-red-950/80 text-red-200 hover:bg-red-900/80"
    : "bg-slate-800 text-slate-100 hover:bg-slate-700";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl px-4 py-3 text-sm font-black uppercase tracking-widest transition disabled:cursor-not-allowed disabled:opacity-35 ${className}`}
    >
      {label} <span className="hidden text-xs opacity-70 sm:inline">[{keys}]</span>
    </button>
  );
}

function RollOverlay({ roll, players, myId }) {
  const [phase, setPhase] = useState("SPIN");
  const [display, setDisplay] = useState(() => Math.floor(Math.random() * 100) + 1);
  const shooter = players.find((p) => p.id === roll.player_id);

  useEffect(() => {
    const spin = window.setInterval(() => setDisplay(Math.floor(Math.random() * 100) + 1), 50);
    const settle = window.setTimeout(() => {
      window.clearInterval(spin);
      setDisplay(roll.roll);
      setPhase("SETTLE");
    }, 1000);
    const reveal = window.setTimeout(() => setPhase("REVEAL"), 1550);
    return () => {
      window.clearInterval(spin);
      window.clearTimeout(settle);
      window.clearTimeout(reveal);
    };
  }, [roll.roll]);

  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-black/55 backdrop-blur-sm">
      <div className={`rounded-[2rem] border-2 ${phase === "REVEAL" ? roll.hit ? "border-emerald-400" : "border-red-500" : "border-amber-500"} bg-slate-950/90 p-6 text-center shadow-2xl`}>
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500">{shooter?.id === myId ? "You drew" : `${shooter?.name ?? "Opponent"} drew`}</p>
        <div className="mt-4 flex items-center gap-5">
          <BigNumber label="Rolled" value={display} active={phase !== "SPIN"} />
          <span className="text-3xl font-thin text-slate-600">vs</span>
          <BigNumber label="Target" value={`${roll.target_to_beat ?? Math.round(101 - (roll.hit_chance ?? 50))}+`} active />
        </div>
        {phase === "REVEAL" && <p className={`mt-4 text-3xl font-black uppercase tracking-widest ${roll.hit ? "text-emerald-300" : "text-red-400"}`}>{roll.hit ? "Hit" : "Miss"}</p>}
      </div>
    </div>
  );
}

function BigNumber({ label, value, active }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">{label}</p>
      <div className={`mt-1 w-32 rounded-xl border border-slate-700 bg-black/40 py-3 text-center font-mono text-6xl font-black tabular-nums ${active ? "text-amber-300" : "text-slate-400 blur-[1px]"}`}>{String(value).padStart(2, "0")}</div>
    </div>
  );
}

function RoundOverlay({ gameState, myId }) {
  const won = gameState.round_winner === myId;
  return (
    <div className="absolute inset-x-0 top-1/2 z-40 flex -translate-y-1/2 justify-center">
      <div className="rounded-[2rem] border border-amber-600 bg-slate-950/90 px-8 py-6 text-center shadow-2xl backdrop-blur">
        <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-500">Round {gameState.round_number}</p>
        <p className={`mt-2 text-3xl font-black ${won ? "text-amber-300" : "text-red-300"}`}>{won ? "Round Won" : "Round Lost"}</p>
        {gameState.last_roll && <p className="mt-2 text-sm text-slate-400">Rolled {gameState.last_roll.roll}, needed {gameState.last_roll.target_to_beat}+</p>}
      </div>
    </div>
  );
}

function MatchOverlay({ isCampaign, campaignInfo, gameState, me, opponent, onRestart, onExitCampaign, onNextCampaign, onRestartCampaign }) {
  const won = gameState.match_winner === me?.id;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-[min(92vw,34rem)] rounded-[2rem] border border-amber-700 bg-slate-950 p-6 text-center shadow-2xl">
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-400">{isCampaign ? "Campaign Duel Complete" : "Match Complete"}</p>
        <h2 className={`mt-3 text-4xl font-black ${won ? "text-amber-300" : "text-red-300"}`}>{won ? "You Win" : "Match Lost"}</h2>
        {campaignInfo && <p className="mt-2 text-sm text-slate-500">{campaignInfo.title} · Act {campaignInfo.act} · Stage {campaignInfo.stage}</p>}
        <p className="mt-4 text-slate-300">{me?.round_wins ?? 0} — {opponent?.round_wins ?? 0}</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {isCampaign ? (
            won && !gameState.campaign_complete ? (
              <button onClick={onNextCampaign} className="rounded-xl bg-amber-500 px-5 py-3 font-black uppercase tracking-widest text-slate-950 hover:bg-amber-300">Next Duel</button>
            ) : (
              <button onClick={onRestartCampaign} className="rounded-xl bg-amber-500 px-5 py-3 font-black uppercase tracking-widest text-slate-950 hover:bg-amber-300">Retry</button>
            )
          ) : (
            <button onClick={onRestart} className="rounded-xl bg-amber-500 px-5 py-3 font-black uppercase tracking-widest text-slate-950 hover:bg-amber-300">Restart</button>
          )}
          <button onClick={isCampaign ? onExitCampaign : onRestart} className="rounded-xl border border-slate-700 px-5 py-3 font-black uppercase tracking-widest text-slate-300 hover:border-amber-500 hover:text-amber-200">{isCampaign ? "Exit Campaign" : "Back to Lobby"}</button>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ label, accent = false, muted = false }) {
  return <span className={`hidden rounded-full border px-3 py-1 text-xs font-mono md:inline-block ${accent ? "border-amber-800/70 text-amber-300" : muted ? "border-slate-800 text-slate-500" : "border-slate-700 text-slate-300"}`}>{label}</span>;
}

function HistoryModal({ isOpen, onClose, history }) {
  if (!isOpen) return null;
  const entries = [...(history || [])].reverse();

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="max-h-[80vh] w-[min(92vw,44rem)] overflow-hidden rounded-[2rem] border border-amber-800 bg-slate-950 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <ModalHeader title="Past Duels" onClose={onClose} />
        <div className="max-h-[60vh] overflow-y-auto p-5">
          {entries.length === 0 ? (
            <p className="py-12 text-center text-slate-500">No duels recorded yet.</p>
          ) : (
            <ul className="grid gap-3">
              {entries.map((entry, index) => (
                <li key={index} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-black text-amber-300">{entry.match_winner_name ?? "Unknown"}</p>
                    <p className="font-mono text-xs text-slate-500">{entry.timestamp}</p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-400">
                    {(entry.players || []).map((player) => <span key={player.id}>{player.name}: <b className="text-slate-200">{player.wins}</b></span>)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function TutorialModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="max-h-[85vh] w-[min(92vw,46rem)] overflow-hidden rounded-[2rem] border border-amber-800 bg-slate-950 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <ModalHeader title="How to Duel" onClose={onClose} />
        <div className="max-h-[68vh] space-y-5 overflow-y-auto p-6 text-sm leading-7 text-slate-300">
          <InfoSection title="The goal">Best of 3. Take a shot when your odds are good. First to 2 rounds wins. Tempo climbs as rounds go on, so later rounds feel harsher even if the rules stay the same.</InfoSection>
          <InfoSection title="The beat">Tap <span className="font-bold text-amber-300">Space</span> when the outer ring meets the target ring. On-beat taps build <span className="font-bold text-amber-300">accuracy</span>. Long streaks pay better. Off-beat taps or ignored beats build pressure instead.</InfoSection>
          <InfoSection title="Accuracy and nerves">Accuracy makes your shot better. Nerves make it worse. Calm, clean rhythm gives you low target numbers. Panicked rhythm gives you ugly ones.</InfoSection>
          <InfoSection title="Draw">Press <span className="font-bold text-amber-300">Enter</span> to fire. The game rolls 1–100. Your accuracy and nerves shape the target to beat. Miss and you reload for a short window while your rhythm state resets.</InfoSection>
          <InfoSection title="Taunt">Press <span className="font-bold text-amber-300">T</span> to spend 20 accuracy and throw sand. It rattles the opponent and can ruin their next moment. It has a cooldown, so use it as a timing play, not a spam button.</InfoSection>
          <InfoSection title="Wild West">Wild West is the hard mode modifier. It runs faster and tighter. In multiplayer both players need to vote for it, while some campaign fights can force it.</InfoSection>
          <InfoSection title="Reading the fight">The opponent nameplate and intent text are there to help you read the duel at a glance. If they look calm and aimed, be careful. If they look unstable or reloading, that is your opening.</InfoSection>
        </div>
      </div>
    </div>
  );
}


function ModalHeader({ title, onClose }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
      <h2 className="text-2xl font-black text-white">{title}</h2>
      <button onClick={onClose} className="text-3xl leading-none text-slate-500 hover:text-white" aria-label="Close">×</button>
    </div>
  );
}

function InfoSection({ title, children }) {
  return (
    <section>
      <h3 className="text-[10px] font-black uppercase tracking-[0.35em] text-amber-400">{title}</h3>
      <p className="mt-1">{children}</p>
    </section>
  );
}

