"use client";

import dynamic from "next/dynamic";

// three.js needs the browser (WebGL), so the stage is only ever rendered client-side.
const AvatarStage = dynamic(() => import("./AvatarStage"), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse rounded-full bg-zinc-800/40" />,
});

export default AvatarStage;
export type { CaptureFn } from "./AvatarStage";
