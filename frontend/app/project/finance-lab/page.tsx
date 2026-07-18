import type { Metadata } from "next";
import FinanceLabApp from "./FinanceLabApp";

export const metadata: Metadata = {
  title: "Finance Lab",
  description:
    "A compact portfolio simulator with stock discovery, scenario saving, bulk editing, and formula-based prediction experiments.",
};

export default function FinanceLabPage() {
  return <FinanceLabApp />;
}
