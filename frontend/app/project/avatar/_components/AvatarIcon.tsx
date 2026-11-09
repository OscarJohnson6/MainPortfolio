import { textOn } from "../_lib/api";

type Props = { name: string; emoji?: string; color: string; icon?: string; size?: "sm" | "md" | "lg" };

const SIZES = { sm: "size-7 text-xs", md: "size-9 text-sm", lg: "size-16 text-2xl" };

/**
 * The avatar's small round icon: a snapshot of its 3D look when it has one
 * (taken in the editor on save), otherwise its emoji or first letter.
 */
export default function AvatarIcon({ name, emoji, color, icon, size = "md" }: Props) {
  if (icon) {
    return (
      // A data URL saved with the avatar, so next/image's optimizer has nothing to add.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={icon} alt="" aria-hidden className={`shrink-0 rounded-full object-cover ${SIZES[size]}`} style={{ backgroundColor: color }} />
    );
  }
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
