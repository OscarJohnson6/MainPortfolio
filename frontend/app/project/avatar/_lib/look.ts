/**
 * An avatar's appearance: a small set of preset choices, saved as JSON on the
 * avatar. Each part is picked from a list (like a game's character creator)
 * rather than tuned with sliders; the 3D shapes for each preset live in
 * _components/look/.
 */

type Preset<Id extends string> = { id: Id; label: string };
type Swatch = { id: string; label: string; hex: string };

export const BODIES = [
  { id: "average", label: "Average", shoulders: 1, torso: 1, head: 1, neck: 1 },
  { id: "slim", label: "Slim", shoulders: 0.88, torso: 0.86, head: 1.02, neck: 1.08 },
  { id: "broad", label: "Broad", shoulders: 1.18, torso: 1.14, head: 0.98, neck: 0.92 },
  { id: "petite", label: "Petite", shoulders: 0.84, torso: 0.9, head: 1.1, neck: 0.85 },
  { id: "stocky", label: "Stocky", shoulders: 1.1, torso: 1.22, head: 1.04, neck: 0.8 },
] as const;
export type BodyId = (typeof BODIES)[number]["id"];

export const SKIN_TONES: Swatch[] = [
  { id: "porcelain", label: "Porcelain", hex: "#f6dfd1" },
  { id: "fair", label: "Fair", hex: "#efcfb6" },
  { id: "light", label: "Light", hex: "#e2b48f" },
  { id: "medium", label: "Medium", hex: "#c98e66" },
  { id: "tan", label: "Tan", hex: "#a8704a" },
  { id: "brown", label: "Brown", hex: "#86543a" },
  { id: "dark", label: "Dark", hex: "#5f3a28" },
  { id: "deep", label: "Deep", hex: "#422619" },
];

export const HAIR_STYLES: Preset<"short" | "buzz" | "spiky" | "bob" | "long" | "ponytail" | "bun" | "curly" | "mohawk" | "bald">[] = [
  { id: "short", label: "Short" },
  { id: "buzz", label: "Buzz cut" },
  { id: "spiky", label: "Spiky" },
  { id: "bob", label: "Bob" },
  { id: "long", label: "Long" },
  { id: "ponytail", label: "Ponytail" },
  { id: "bun", label: "Bun" },
  { id: "curly", label: "Curly" },
  { id: "mohawk", label: "Mohawk" },
  { id: "bald", label: "Bald" },
];
export type HairId = (typeof HAIR_STYLES)[number]["id"];

export const HAIR_COLORS: Swatch[] = [
  { id: "black", label: "Black", hex: "#1c1714" },
  { id: "darkbrown", label: "Dark brown", hex: "#3b2519" },
  { id: "brown", label: "Brown", hex: "#6b4228" },
  { id: "auburn", label: "Auburn", hex: "#8c3b22" },
  { id: "blonde", label: "Blonde", hex: "#d6b06a" },
  { id: "platinum", label: "Platinum", hex: "#e8e2d4" },
  { id: "ginger", label: "Ginger", hex: "#c4622d" },
  { id: "gray", label: "Gray", hex: "#8f8f94" },
  { id: "blue", label: "Blue", hex: "#3b6fd8" },
  { id: "pink", label: "Pink", hex: "#e47ab5" },
  { id: "green", label: "Green", hex: "#3d9b6a" },
];

export const EYES: Preset<"round" | "wide" | "happy" | "sleepy" | "focused">[] = [
  { id: "round", label: "Round" },
  { id: "wide", label: "Wide" },
  { id: "happy", label: "Happy" },
  { id: "sleepy", label: "Sleepy" },
  { id: "focused", label: "Focused" },
];
export type EyeId = (typeof EYES)[number]["id"];

export const EYE_COLORS: Swatch[] = [
  { id: "brown", label: "Brown", hex: "#4a2c1a" },
  { id: "hazel", label: "Hazel", hex: "#7a5a2b" },
  { id: "blue", label: "Blue", hex: "#2f6db5" },
  { id: "green", label: "Green", hex: "#2f7d4f" },
  { id: "gray", label: "Gray", hex: "#5d6670" },
  { id: "violet", label: "Violet", hex: "#6d4bb8" },
];

export const BROWS: Preset<"soft" | "straight" | "raised" | "thick" | "none">[] = [
  { id: "soft", label: "Soft" },
  { id: "straight", label: "Straight" },
  { id: "raised", label: "Raised" },
  { id: "thick", label: "Thick" },
  { id: "none", label: "None" },
];
export type BrowId = (typeof BROWS)[number]["id"];

export const MOUTHS: Preset<"smile" | "grin" | "neutral" | "smirk" | "open">[] = [
  { id: "smile", label: "Smile" },
  { id: "grin", label: "Grin" },
  { id: "neutral", label: "Neutral" },
  { id: "smirk", label: "Smirk" },
  { id: "open", label: "Surprised" },
];
export type MouthId = (typeof MOUTHS)[number]["id"];

export const TOPS: Preset<"tee" | "hoodie" | "collar" | "turtleneck" | "jacket">[] = [
  { id: "tee", label: "T-shirt" },
  { id: "hoodie", label: "Hoodie" },
  { id: "collar", label: "Collared shirt" },
  { id: "turtleneck", label: "Turtleneck" },
  { id: "jacket", label: "Jacket" },
];
export type TopId = (typeof TOPS)[number]["id"];

export const CLOTHING_COLORS: Swatch[] = [
  { id: "charcoal", label: "Charcoal", hex: "#2f3237" },
  { id: "white", label: "White", hex: "#e9e9ec" },
  { id: "navy", label: "Navy", hex: "#23345c" },
  { id: "sky", label: "Sky", hex: "#4f9be0" },
  { id: "forest", label: "Forest", hex: "#2f6b46" },
  { id: "sage", label: "Sage", hex: "#8fae8b" },
  { id: "maroon", label: "Maroon", hex: "#7a2335" },
  { id: "coral", label: "Coral", hex: "#e8735d" },
  { id: "mustard", label: "Mustard", hex: "#d2a33a" },
  { id: "lavender", label: "Lavender", hex: "#a08ad6" },
  { id: "pink", label: "Pink", hex: "#e58fb6" },
];

export const ACCESSORIES: Preset<"none" | "glasses" | "roundglasses" | "cap" | "beanie" | "headphones">[] = [
  { id: "none", label: "None" },
  { id: "glasses", label: "Glasses" },
  { id: "roundglasses", label: "Round glasses" },
  { id: "cap", label: "Cap" },
  { id: "beanie", label: "Beanie" },
  { id: "headphones", label: "Headphones" },
];
export type AccessoryId = (typeof ACCESSORIES)[number]["id"];

export const ORB_EYES: Preset<"dots" | "visor" | "happy" | "sleepy">[] = [
  { id: "dots", label: "Dots" },
  { id: "visor", label: "Visor" },
  { id: "happy", label: "Happy" },
  { id: "sleepy", label: "Sleepy" },
];
export type OrbEyeId = (typeof ORB_EYES)[number]["id"];

export const ANTENNAS: Preset<"single" | "double" | "halo" | "none">[] = [
  { id: "single", label: "Antenna" },
  { id: "double", label: "Two antennas" },
  { id: "halo", label: "Halo" },
  { id: "none", label: "None" },
];
export type AntennaId = (typeof ANTENNAS)[number]["id"];

export const ORB_COLORS: Swatch[] = [
  { id: "indigo", label: "Indigo", hex: "#6366f1" },
  { id: "cyan", label: "Cyan", hex: "#22d3ee" },
  { id: "emerald", label: "Emerald", hex: "#10b981" },
  { id: "amber", label: "Amber", hex: "#f59e0b" },
  { id: "rose", label: "Rose", hex: "#f43f5e" },
  { id: "violet", label: "Violet", hex: "#8b5cf6" },
  { id: "silver", label: "Silver", hex: "#c7cbd3" },
  { id: "graphite", label: "Graphite", hex: "#3f434b" },
];

export type HumanLook = {
  kind: "human";
  body: BodyId;
  skin: string;
  hair: HairId;
  hairColor: string;
  eyes: EyeId;
  eyeColor: string;
  brows: BrowId;
  mouth: MouthId;
  top: TopId;
  topColor: string;
  accessory: AccessoryId;
};

export type OrbLook = { kind: "orb"; color: string; eyes: OrbEyeId; antenna: AntennaId };

/** No 3D look: the avatar keeps its emoji or initial in a colored circle. */
export type NoLook = { kind: "none" };

export type Look = HumanLook | OrbLook | NoLook;

export const DEFAULT_ORB: OrbLook = { kind: "orb", color: "indigo", eyes: "dots", antenna: "single" };

export const DEFAULT_HUMAN: HumanLook = {
  kind: "human",
  body: "average",
  skin: "light",
  hair: "short",
  hairColor: "brown",
  eyes: "round",
  eyeColor: "brown",
  brows: "soft",
  mouth: "smile",
  top: "hoodie",
  topColor: "navy",
  accessory: "none",
};

const ids = <T extends { id: string }>(list: readonly T[]) => list.map((item) => item.id);
const pick = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];
const oneOf = <T extends string>(value: unknown, allowed: readonly string[], fallback: T): T =>
  typeof value === "string" && allowed.includes(value) ? (value as T) : fallback;

/** Turn whatever the gateway stored into a valid look; unknown parts fall back to defaults. */
export function normalizeLook(raw: unknown): Look {
  const look = (raw ?? {}) as Record<string, unknown>;
  if (look.kind === "orb") {
    return {
      kind: "orb",
      color: oneOf(look.color, ids(ORB_COLORS), DEFAULT_ORB.color),
      eyes: oneOf(look.eyes, ids(ORB_EYES), DEFAULT_ORB.eyes),
      antenna: oneOf(look.antenna, ids(ANTENNAS), DEFAULT_ORB.antenna),
    };
  }
  if (look.kind === "human") {
    const d = DEFAULT_HUMAN;
    return {
      kind: "human",
      body: oneOf(look.body, ids(BODIES), d.body),
      skin: oneOf(look.skin, ids(SKIN_TONES), d.skin),
      hair: oneOf(look.hair, ids(HAIR_STYLES), d.hair),
      hairColor: oneOf(look.hairColor, ids(HAIR_COLORS), d.hairColor),
      eyes: oneOf(look.eyes, ids(EYES), d.eyes),
      eyeColor: oneOf(look.eyeColor, ids(EYE_COLORS), d.eyeColor),
      brows: oneOf(look.brows, ids(BROWS), d.brows),
      mouth: oneOf(look.mouth, ids(MOUTHS), d.mouth),
      top: oneOf(look.top, ids(TOPS), d.top),
      topColor: oneOf(look.topColor, ids(CLOTHING_COLORS), d.topColor),
      accessory: oneOf(look.accessory, ids(ACCESSORIES), d.accessory),
    };
  }
  // Avatars made before looks existed have no look; they keep their emoji.
  return { kind: "none" };
}

export function randomHuman(): HumanLook {
  // Accessories and unusual hair colors are rarer, so randomized characters look plausible.
  const naturalHair = HAIR_COLORS.filter((c) => !["blue", "pink", "green"].includes(c.id));
  return {
    kind: "human",
    body: pick(BODIES).id,
    skin: pick(SKIN_TONES).id,
    hair: pick(HAIR_STYLES).id,
    hairColor: (Math.random() < 0.85 ? pick(naturalHair) : pick(HAIR_COLORS)).id,
    eyes: pick(EYES).id,
    eyeColor: pick(EYE_COLORS).id,
    brows: pick(BROWS.filter((b) => b.id !== "none")).id,
    mouth: pick(MOUTHS.filter((m) => m.id !== "open")).id,
    top: pick(TOPS).id,
    topColor: pick(CLOTHING_COLORS).id,
    accessory: Math.random() < 0.55 ? "none" : pick(ACCESSORIES.filter((a) => a.id !== "none")).id,
  };
}

export function randomOrb(): OrbLook {
  return { kind: "orb", color: pick(ORB_COLORS).id, eyes: pick(ORB_EYES).id, antenna: pick(ANTENNAS).id };
}

/** Color hex for a swatch id (falls back to the first swatch). */
export function hexOf(list: Swatch[], id: string): string {
  return (list.find((swatch) => swatch.id === id) ?? list[0]).hex;
}
