import { textOn } from "../_lib/api";

type Props = { name: string; emoji?: string; color: string; size?: "sm" | "md" | "lg" };

const SIZES = { sm: "size-7 text-xs", md: "size-9 text-sm", lg: "size-16 text-2xl" };

export default function AvatarIcon({ name, emoji, color, size = "md" }: Props) {
  return (
    <div
      className={`grid shrink-0 place-items-center rounded-full font-semibold ${SIZES[size]}`}
      style={{ backgroundColor: color, color: textOn(color) }}
      aria-hidden
    >
      {emoji || name.trim()[0]?.toUpperCase() || "?"}
    </div>
  );
}
