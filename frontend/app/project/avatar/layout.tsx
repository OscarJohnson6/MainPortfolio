import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Avatar Lab",
  robots: { index: false, follow: false }, // keep it out of search engines
};

export default function AvatarLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
