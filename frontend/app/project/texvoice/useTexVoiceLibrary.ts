"use client";

import { useEffect, useState } from "react";
import type { TexVoiceLibraryItem } from "./types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

type LibraryResponse = {
  items: TexVoiceLibraryItem[];
};

type UseTexVoiceLibraryResult = {
  items: TexVoiceLibraryItem[];
  loading: boolean;
  error: string | null;
  reload: () => void;
};

function getFriendlyError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Could not load TexVoice library.";
}

export function useTexVoiceLibrary(): UseTexVoiceLibraryResult {
  const [items, setItems] = useState<TexVoiceLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchLibrary() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`${API_BASE}/api/texvoice/library`);

        if (!response.ok) {
          throw new Error(`Library request failed: ${response.status}`);
        }

        const data = (await response.json()) as LibraryResponse;

        if (!cancelled) {
          setItems(Array.isArray(data.items) ? data.items : []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(getFriendlyError(err));
          setItems([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void fetchLibrary();

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  return {
    items,
    loading,
    error,
    reload: () => setReloadToken((value) => value + 1),
  };
}