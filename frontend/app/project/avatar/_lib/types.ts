export type ThinkingMode = "auto" | "on" | "off";

export type AvatarSettings = {
  temperature: number;
  thinking: ThinkingMode;
  humor: number;
  verbosity: number;
  formality: number;
  warmth: number;
  model?: string | null;
};

export type Avatar = {
  id: string;
  name: string;
  description: string;
  persona: string;
  emoji: string;
  color: string;
  settings: AvatarSettings;
  created_at: number;
  updated_at: number;
};

export type AvatarDraft = Omit<Avatar, "id" | "created_at" | "updated_at">;

export type Conversation = {
  id: string;
  avatar_id: string;
  title: string;
  created_at: number;
  updated_at: number;
};

export type Stats = {
  tokens?: number;
  tokens_per_s?: number | null;
  duration_s?: number | null;
  stopped?: boolean;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  stats?: Stats | null;
  model?: string | null;
  created_at?: number;
  error?: boolean;
};

export type Status = {
  online: boolean;
  worker?: string;
  model?: string;
  profile?: string;
  vram_mb?: number | null;
};

export type KeepAlive = "5m" | "30m" | "2h" | "forever";

export type GlobalSettings = {
  fast_model: string | null;
  think_model: string | null;
  num_ctx: number | null;
  keep_alive: KeepAlive | null;
  warmup: boolean;
};

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  fast_model: null,
  think_model: null,
  num_ctx: null,
  keep_alive: null,
  warmup: true,
};

export type StreamEvent =
  | { type: "conversation"; id: string; title: string | null }
  | { type: "meta"; worker: string; model: string }
  | { type: "thinking"; text: string }
  | { type: "delta"; text: string }
  | { type: "done"; stats?: Stats }
  | { type: "error"; message: string };

export const DEFAULT_SETTINGS: AvatarSettings = {
  temperature: 0.8,
  thinking: "off",
  humor: 5,
  verbosity: 4,
  formality: 3,
  warmth: 6,
  model: null,
};
