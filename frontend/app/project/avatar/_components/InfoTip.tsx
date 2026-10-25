"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * A small ⓘ that explains a control. Opens on hover, on keyboard focus, or on
 * tap (tap again, click elsewhere, or press Escape to close), so it works with a
 * mouse, a keyboard, and on phones.
 */
export default function InfoTip({ text, align = "left" }: { text: string; align?: "left" | "right" }) {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const open = hover || pinned;

  useEffect(() => {
    if (!open) return;
    const close = () => {
      setPinned(false);
      setHover(false);
    };
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span
      ref={ref}
      className="relative inline-flex align-middle"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        aria-label="More info"
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault(); // don't trigger a surrounding <label>
          setPinned((p) => !p);
        }}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        className={`grid size-4 place-items-center rounded-full border text-[10px] font-semibold leading-none transition ${
          open ? "border-zinc-300 text-zinc-100" : "border-zinc-600 text-zinc-500 hover:border-zinc-400 hover:text-zinc-200"
        }`}
      >
        i
      </button>
      {open && (
        <span
          role="tooltip"
          id={id}
          className={`absolute top-full z-30 mt-1.5 w-64 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-left text-[11px] font-normal normal-case leading-relaxed tracking-normal text-zinc-300 shadow-xl ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {text}
        </span>
      )}
    </span>
  );
}
