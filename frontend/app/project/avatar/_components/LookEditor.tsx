"use client";

import type { RefObject } from "react";

import {
  ACCESSORIES,
  ANTENNAS,
  BODIES,
  BROWS,
  CLOTHING_COLORS,
  DEFAULT_HUMAN,
  DEFAULT_ORB,
  EYES,
  EYE_COLORS,
  HAIR_COLORS,
  HAIR_STYLES,
  MOUTHS,
  ORB_COLORS,
  ORB_EYES,
  SKIN_TONES,
  TOPS,
  randomHuman,
  randomOrb,
  type HumanLook,
  type Look,
  type OrbLook,
} from "../_lib/look";
import AvatarIcon from "./AvatarIcon";
import AvatarStage, { type CaptureFn } from "./look/AvatarStageClient";

type Props = {
  look: Look;
  onChange: (look: Look) => void;
  /** Shown for "None", and as the backdrop color of snapshot icons. */
  name: string;
  emoji: string;
  color: string;
  captureRef: RefObject<CaptureFn | null>;
};

const KINDS: { kind: Look["kind"]; label: string; hint: string }[] = [
  { kind: "orb", label: "Robot orb", hint: "A floating robot with glowing eyes. The default." },
  { kind: "human", label: "Character", hint: "A person you build from presets." },
  { kind: "none", label: "None", hint: "No 3D look; keep the emoji or first letter in a colored circle." },
];

/** Step through a list of presets with ‹ › arrows, like a game's character creator. */
function Stepper<Id extends string>({ label, options, value, onChange }: { label: string; options: readonly { id: Id; label: string }[]; value: Id; onChange: (id: Id) => void }) {
  const index = Math.max(0, options.findIndex((option) => option.id === value));
  const move = (delta: number) => onChange(options[(index + delta + options.length) % options.length].id);
  const arrow = "grid size-7 place-items-center rounded-md border border-zinc-800 text-zinc-300 transition hover:bg-zinc-800";
  return (
    <div className="grid grid-cols-[6.5rem_1fr] items-center gap-2 text-xs">
      <span className="text-zinc-400">{label}</span>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => move(-1)} className={arrow} aria-label={`Previous ${label.toLowerCase()}`}>
          ‹
        </button>
        <span className="min-w-0 flex-1 truncate rounded-md bg-zinc-900 px-2 py-1.5 text-center text-zinc-100" aria-live="polite">
          {options[index].label}
          <span className="ml-1.5 text-zinc-600">
            {index + 1}/{options.length}
          </span>
        </span>
        <button type="button" onClick={() => move(1)} className={arrow} aria-label={`Next ${label.toLowerCase()}`}>
          ›
        </button>
      </div>
    </div>
  );
}

function Swatches({ label, options, value, onChange }: { label: string; options: { id: string; label: string; hex: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] items-center gap-2 text-xs">
      <span className="text-zinc-400">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            title={option.label}
            aria-label={`${label}: ${option.label}`}
            aria-pressed={option.id === value}
            onClick={() => onChange(option.id)}
            className={`size-6 rounded-full border border-black/20 transition ${option.id === value ? "ring-2 ring-white ring-offset-2 ring-offset-zinc-950" : "opacity-80 hover:opacity-100"}`}
            style={{ backgroundColor: option.hex }}
          />
        ))}
      </div>
    </div>
  );
}

function HumanControls({ look, onChange }: { look: HumanLook; onChange: (look: HumanLook) => void }) {
  const set = <K extends keyof HumanLook>(key: K) => (value: HumanLook[K]) => onChange({ ...look, [key]: value });
  return (
    <div className="flex flex-col gap-2.5">
      <Stepper label="Body type" options={BODIES} value={look.body} onChange={set("body")} />
      <Swatches label="Skin tone" options={SKIN_TONES} value={look.skin} onChange={set("skin")} />
      <Stepper label="Hair" options={HAIR_STYLES} value={look.hair} onChange={set("hair")} />
      <Swatches label="Hair color" options={HAIR_COLORS} value={look.hairColor} onChange={set("hairColor")} />
      <Stepper label="Eyes" options={EYES} value={look.eyes} onChange={set("eyes")} />
      <Swatches label="Eye color" options={EYE_COLORS} value={look.eyeColor} onChange={set("eyeColor")} />
      <Stepper label="Eyebrows" options={BROWS} value={look.brows} onChange={set("brows")} />
      <Stepper label="Mouth" options={MOUTHS} value={look.mouth} onChange={set("mouth")} />
      <Stepper label="Outfit" options={TOPS} value={look.top} onChange={set("top")} />
      <Swatches label="Outfit color" options={CLOTHING_COLORS} value={look.topColor} onChange={set("topColor")} />
      <Stepper label="Accessory" options={ACCESSORIES} value={look.accessory} onChange={set("accessory")} />
    </div>
  );
}

function OrbControls({ look, onChange }: { look: OrbLook; onChange: (look: OrbLook) => void }) {
  const set = <K extends keyof OrbLook>(key: K) => (value: OrbLook[K]) => onChange({ ...look, [key]: value });
  return (
    <div className="flex flex-col gap-2.5">
      <Swatches label="Shell color" options={ORB_COLORS} value={look.color} onChange={set("color")} />
      <Stepper label="Eyes" options={ORB_EYES} value={look.eyes} onChange={set("eyes")} />
      <Stepper label="Top" options={ANTENNAS} value={look.antenna} onChange={set("antenna")} />
    </div>
  );
}

export default function LookEditor({ look, onChange, name, emoji, color, captureRef }: Props) {
  const chooseKind = (kind: Look["kind"]) => {
    if (kind === look.kind) return;
    onChange(kind === "orb" ? DEFAULT_ORB : kind === "human" ? DEFAULT_HUMAN : { kind: "none" });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        {KINDS.map((option) => (
          <button
            key={option.kind}
            type="button"
            title={option.hint}
            onClick={() => chooseKind(option.kind)}
            className={`rounded-lg border px-3 py-1.5 text-xs transition ${
              look.kind === option.kind ? "border-zinc-400 bg-zinc-800 text-zinc-100" : "border-zinc-800 text-zinc-400 hover:bg-zinc-900"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="grid gap-5 md:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="flex flex-col items-center gap-2">
          <div className="relative aspect-square w-full max-w-64 overflow-hidden rounded-2xl border border-zinc-800" style={{ background: `radial-gradient(circle at 50% 40%, ${color}55, transparent 70%)` }}>
            {look.kind === "none" ? (
              <div className="grid size-full place-items-center">
                <AvatarIcon name={name || "?"} emoji={emoji} color={color} size="lg" />
              </div>
            ) : (
              <AvatarStage look={look} interactive captureRef={captureRef} className="size-full" />
            )}
          </div>
          {look.kind !== "none" && (
            <div className="flex w-full max-w-64 items-center justify-between text-[11px] text-zinc-500">
              <span>Drag to turn</span>
              <button
                type="button"
                onClick={() => onChange(look.kind === "orb" ? randomOrb() : randomHuman())}
                className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-200 transition hover:bg-zinc-800"
              >
                🎲 Randomize
              </button>
            </div>
          )}
        </div>

        <div>
          {look.kind === "human" && <HumanControls look={look} onChange={onChange} />}
          {look.kind === "orb" && <OrbControls look={look} onChange={onChange} />}
          {look.kind === "none" && (
            <p className="text-sm leading-6 text-zinc-400">
              No 3D look. The avatar shows its emoji (or first letter) in its color, set on the Personality step.
            </p>
          )}
          <p className="mt-4 text-[11px] leading-5 text-zinc-600">
            The look shows up in chats, where it reacts while the avatar thinks and talks. A still snapshot becomes its icon when you save.
          </p>
        </div>
      </div>
    </div>
  );
}
