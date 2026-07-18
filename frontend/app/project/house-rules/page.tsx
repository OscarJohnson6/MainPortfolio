// destination: src/app/project/house-rules/page.tsx
//
// The div#hr-game-root is the fullscreen target.
// FullscreenBtn calls element.requestFullscreen() on this div,
// which hides everything OUTSIDE it (SiteHeader, project nav)
// and shows only the game. No special layout.tsx needed.

import { HouseRulesGame } from "./HouseRules";

export const metadata = {
  title: "House Rules",
  description: "A blackjack-inspired roguelite — artifacts, trinkets, bosses.",
};

export default function HouseRulesPage() {
  return (
    <div
      id="hr-game-root"
      style={{
        background: "#060e07",
        // Fill remaining viewport below the project sub-nav (~97px tall).
        // In fullscreen this div expands to cover 100% of the screen automatically.
        minHeight: "calc(100vh - 97px)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <HouseRulesGame />
    </div>
  );
}