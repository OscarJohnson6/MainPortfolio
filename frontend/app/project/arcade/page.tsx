// destination: src/app/project/arcade/page.tsx
// Server component — exports metadata, renders the client ArcadeApp.
// ArcadeApp.tsx handles all game state and selection logic.

import { ArcadeApp } from "./ArcadeApp";

export const metadata = {
  title: "Arcade",
  description:
    "Browser games built from scratch: Blackjack, Wordle, Letter Connect, Snake, Flappy Bird, and 2048.",
};

export default function ArcadePage() {
  return <ArcadeApp />;
}
