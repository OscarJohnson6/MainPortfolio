import type { RefObject } from "react";

/** What the avatar is doing, which drives its animation. */
export type Mood = "idle" | "thinking" | "talking";

export type ModelProps = {
  mood: Mood;
  /** While true, hold a neutral pose (eyes open, mouth closed) for snapshots. */
  still: RefObject<boolean>;
};

/** Time until the next blink: every 2.5–5.5 seconds, like a person. */
export const nextBlinkIn = () => 2.5 + Math.random() * 3;

/** Openness of the eyes during a blink that started `since` seconds ago (1 = open). */
export function blinkAmount(since: number): number {
  const duration = 0.14;
  if (since < 0 || since > duration) return 1;
  return Math.max(0.08, Math.abs(since / duration - 0.5) * 2);
}

/** Front-of-face side of a sphere: for a SphereGeometry, +z sits at phi = π/2. */
export const FRONT_PHI = Math.PI / 2;
